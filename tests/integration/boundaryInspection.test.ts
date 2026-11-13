import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { ExportRepository } from '../../electron/main/infrastructure/database/ExportRepository.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { FFmpegService } from '../../electron/main/infrastructure/FFmpegService.js';
import { Logger } from '../../electron/main/infrastructure/Logger.js';
import { AudioService } from '../../electron/main/services/audio/AudioService.js';
import { RenderService } from '../../electron/main/services/render/RenderService.js';
import { SubtitleService } from '../../electron/main/services/subtitle/SubtitleService.js';
import { defaultSettings } from '../../shared/defaults.js';
import { buildPlaybackTimeline } from '../../shared/playback.js';
import type { Scene } from '../../shared/types.js';
import { projectInput, retainVerificationArtifacts, verificationDir } from '../helpers.js';

const execFileAsync = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'nedenmis-boundary-'));
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

/**
 * Kare düzeyinde geçiş sınırı denetimi.
 *
 * Bu test HİÇBİR dış dosyaya bağımlı değildir: kendi dört sahneli kurgusunu
 * kurar, kendi MP4'ünü dışa aktarır ve sınırları kurgunun GERÇEK sahne
 * başlangıçlarından türetir. Eksik dosya yüzünden sessizce atlanmaz.
 */
describe('Kare düzeyinde geçiş sınırları', () => {
  it('her geçişin öncesi/içi/sonrası kareleri siyah kare ve kare kaybı olmadan üretir', async () => {
    const colours = ['#1d6fa5', '#a5601d', '#1da55e', '#a51d63'];
    const paths: string[] = [];
    for (let index = 0; index < colours.length; index += 1) {
      const path = join(directory, `scene-${index}.png`);
      await sharp({ create: { width: 1080, height: 1920, channels: 3, background: colours[index] } }).png().toFile(path);
      paths.push(path);
    }
    const db = new AppDatabase(':memory:'); const projects = new ProjectRepository(db); const exports = new ExportRepository(db);
    const ffmpeg = new FFmpegService(() => process.env.NEDENMIS_FFMPEG_PATH);
    const project = projects.create(projectInput({ targetDuration: 14 }));
    const durations = [4, 3.5, 3.5, 3];
    const transitions = ['fade', 'dissolve', 'slide', 'none'] as const;
    project.scenes = durations.map((duration, index): Scene => ({
      id: `boundary-${index}`, number: index + 1, section: (['hook', 'explanation', 'explanation', 'conclusion'] as const)[index],
      narration: '', visualDescription: '', visualPrompt: '', assetType: 'imported-image', assetPath: paths[index], duration,
      transition: transitions[index], cameraMovement: 'static',
      animation: { enabled: false, preset: 'liquid-molecules', speed: 1, intensity: 1, particleCount: 0 },
      subtitles: [], subtitleTiming: 'estimated', status: 'ready',
    }));
    project.status = 'ready'; projects.update(project);

    const settings = { ...defaultSettings(directory), outputPath: directory };
    const service = new RenderService(projects, exports, ffmpeg, new AudioService(ffmpeg), new SubtitleService(), () => settings, () => undefined, new Logger(join(directory, 'logs')));
    const record = await service.start(project.id);
    const deadline = Date.now() + 900_000;
    while (Date.now() < deadline) { const current = exports.get(record.id); if (['completed', 'failed', 'cancelled'].includes(current.status)) break; await new Promise((resolve) => setTimeout(resolve, 300)); }
    const finished = exports.get(record.id);
    expect(finished.error, `dışa aktarım hatası: ${finished.error}`).toBeUndefined();
    expect(finished.status).toBe('completed');
    expect(existsSync(finished.outputPath)).toBe(true);

    // Sınırlar ve geçiş türleri doğrudan kurgu verisinden gelir (sabit zaman yok).
    const timeline = buildPlaybackTimeline(project.scenes);
    const boundaries = project.scenes.slice(0, -1).map((scene, index) => ({ index: index + 1, at: timeline.starts[index + 1], transition: project.scenes[index + 1].transition }));
    const reportPath = join(directory, 'boundary-frames.json');
    await execFileAsync(process.execPath, ['scripts/inspect-boundaries.mjs', finished.outputPath, reportPath, JSON.stringify(boundaries)], { maxBuffer: 64 * 1024 * 1024 });
    const report = JSON.parse(await (await import('node:fs/promises')).readFile(reportPath, 'utf8')) as {
      ok: boolean; decodedFrames: number; duration: number; failures: string[];
      boundaries: Array<{ index: number; at: number; transition: string; decoded: number; expectedFrames: number; frameLoss: number; blackFrame: boolean; minLuminanceInWindow: number | null; window: number }>;
    };

    // 1) Kare sayısı: 14 s × 30 = 420 kare, tek eksik kare yok.
    expect(report.decodedFrames).toBe(420);
    expect(Number(report.duration)).toBeCloseTo(14, 1);
    // 2) Her sınır: kayıp yok, siyah kare yok.
    expect(report.boundaries).toHaveLength(3);
    for (const boundary of report.boundaries) {
      expect(boundary.frameLoss, `sınır ${boundary.index} kare kaybı`).toBe(0);
      expect(boundary.blackFrame, `sınır ${boundary.index} siyah kare (${boundary.minLuminanceInWindow})`).toBe(false);
    }
    // 3) Geçiş süreleri: 'none' sınırında pencere yok, diğerlerinde tam 9 kare.
    expect(report.boundaries[0].window).toBeCloseTo(10 / 30, 6);
    expect(report.boundaries[1].window).toBeCloseTo(10 / 30, 6);
    expect(report.boundaries[2].window).toBe(0);
    expect(report.ok, `denetim başarısız: ${report.failures.join('; ')}`).toBe(true);

    retainVerificationArtifacts(reportPath, 'build20-parity/boundary-frames.json');
    retainVerificationArtifacts(finished.outputPath, 'build20-parity/boundary-source.mp4');
    expect(verificationDir('build20-parity')).toContain('.verification');
    db.close();
  }, 900_000);
});
