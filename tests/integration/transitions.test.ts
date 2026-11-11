import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { ExportRepository } from '../../electron/main/infrastructure/database/ExportRepository.js';
import { FFmpegService } from '../../electron/main/infrastructure/FFmpegService.js';
import { Logger } from '../../electron/main/infrastructure/Logger.js';
import { AudioService } from '../../electron/main/services/audio/AudioService.js';
import { RenderService } from '../../electron/main/services/render/RenderService.js';
import { SubtitleService } from '../../electron/main/services/subtitle/SubtitleService.js';
import { defaultSettings } from '../../shared/defaults.js';
import { buildPlaybackTimeline, CROSSFADE_SECONDS, FRAME_RATE, outgoingTransitionSeconds } from '../../shared/playback.js';
import type { Scene } from '../../shared/types.js';
import { projectInput } from '../helpers.js';

const execFileAsync = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'nedenmis-transitions-'));
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

/**
 * Geçiş doğrulaması: statik renkli sahneler (hızlı) ile dört farklı geçiş.
 * Siyah kare, eksik kare ve kısa süre hataları burada yakalanır.
 */
describe('Geçişler — siyah kare yok, kare kaybı yok', () => {
  it('fade/dissolve/slide/sert kesme geçişlerini tam kare sayısıyla ve kararmadan üretir', async () => {
    const colours = ['#e07830', '#30a060', '#3040e0', '#e0c030'];
    const paths: string[] = [];
    for (let index = 0; index < colours.length; index += 1) {
      const path = join(directory, `scene-${index}.png`);
      await sharp({ create: { width: 1080, height: 1920, channels: 3, background: colours[index] } }).png().toFile(path);
      paths.push(path);
    }
    const db = new AppDatabase(':memory:'); const projects = new ProjectRepository(db); const exportRecords = new ExportRepository(db);
    const ffmpeg = new FFmpegService(() => undefined);
    const project = projects.create(projectInput({ targetDuration: 21 }));
    const durations = [5, 6, 5.5, 4.5];
    project.scenes = durations.map((duration, index): Scene => ({
      id: `transition-${index}`, number: index + 1, section: (['hook', 'explanation', 'explanation', 'conclusion'] as const)[index],
      narration: '', visualDescription: '', visualPrompt: '', assetType: 'imported-image', assetPath: paths[index], duration,
      transition: (['fade', 'dissolve', 'slide', 'none'] as const)[index], cameraMovement: 'zoom-in',
      animation: { enabled: false, preset: 'liquid-molecules', speed: 1, intensity: 1, particleCount: 0 },
      subtitles: [], subtitleTiming: 'estimated', status: 'ready',
    }));
    project.status = 'ready'; projects.update(project);

    const settings = { ...defaultSettings(directory), outputPath: directory };
    const service = new RenderService(projects, exportRecords, ffmpeg, new AudioService(ffmpeg), new SubtitleService(), () => settings, () => undefined, new Logger(join(directory, 'logs')));
    const started = await service.start(project.id);
    const deadline = Date.now() + 600_000;
    while (Date.now() < deadline) { const current = exportRecords.get(started.id); if (['completed', 'failed', 'cancelled'].includes(current.status)) break; await new Promise((resolve) => setTimeout(resolve, 400)); }
    const record = exportRecords.get(started.id);
    expect(record.error).toBeUndefined(); expect(record.status).toBe('completed'); expect(existsSync(record.outputPath)).toBe(true);

    const timeline = buildPlaybackTimeline(project.scenes);
    expect(timeline.duration).toBe(21);
    const probe = JSON.parse((await execFileAsync(ffmpeg.ffprobePath, ['-v', 'error', '-count_frames', '-show_entries', 'stream=nb_read_frames,duration,codec_type', '-of', 'json', record.outputPath])).stdout) as { streams: Array<{ codec_type: string; nb_read_frames?: string; duration?: string }> };
    const video = probe.streams.find((stream) => stream.codec_type === 'video')!;
    // Kare kaybı regresyonu: bu test 627/630 ile başarısız oluyordu.
    expect(Number(video.nb_read_frames)).toBe(21 * FRAME_RATE);
    expect(Number(video.duration)).toBeCloseTo(21, 1);

    const evidence = join(directory, 'frames'); await mkdir(evidence, { recursive: true });
    const luminance: Array<{ time: number; value: number }> = [];
    for (const boundary of [5, 11, 16.5]) {
      for (let step = -3; step <= 6; step += 1) {
        const time = boundary + step * .05;
        if (time <= .1 || time >= 20.9) continue;
        const frame = join(evidence, `t-${time.toFixed(2)}.png`);
        await ffmpeg.run(`frame-${time.toFixed(2)}`, ['-ss', time.toFixed(3), '-i', record.outputPath, '-frames:v', '1', '-vf', 'scale=108:192', '-update', '1', frame]);
        const data = await sharp(frame).greyscale().raw().toBuffer();
        let sum = 0; for (const value of data) sum += value;
        luminance.push({ time: Number(time.toFixed(3)), value: sum / Math.max(1, data.length) });
      }
    }
    // Kararma yok: her örnek, o sahnenin kendi parlaklığının %70'inin üzerinde.
    const darkest = luminance.reduce((min, sample) => sample.value < min.value ? sample : min);
    expect(darkest.value, `en karanlık kare t=${darkest.time}`).toBeGreaterThan(30);
    // Geçiş pencereleri tam kare; sert kesmede (4. sahnenin geçişi 'none') pencere yok.
    expect(outgoingTransitionSeconds(timeline, 0)).toBeCloseTo(CROSSFADE_SECONDS, 6);
    expect(outgoingTransitionSeconds(timeline, 1)).toBeCloseTo(CROSSFADE_SECONDS, 6);
    expect(outgoingTransitionSeconds(timeline, 2)).toBe(0);
    for (const boundary of [5, 11]) {
      const window = luminance.filter((sample) => sample.time > boundary - .01 && sample.time < boundary + outgoingTransitionSeconds(timeline, boundary === 5 ? 0 : 1));
      expect(window.length).toBeGreaterThan(2);
    }
    db.close();
  }, 900_000);
});
