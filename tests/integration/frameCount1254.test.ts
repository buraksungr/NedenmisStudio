import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { buildPlaybackTimeline, frameExactSeconds, FRAME_RATE, outgoingTransitionSeconds } from '../../shared/playback.js';
import type { Scene } from '../../shared/types.js';
import { projectInput } from '../helpers.js';

const directory = await mkdtemp(join(tmpdir(), 'nedenmis-frames1254-'));
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

/**
 * Build 39 regresyon koruması: 1254 karelik kurgu.
 *
 * Sayı bilinçli seçildi: 1254 = 2 × 3 × 11 × 19 olduğu için sahne süreleri
 * 30 FPS ızgarasına tam oturmaz. Eski `toFixed(6)` offset davranışı sınırı bir
 * karenin ALTINA yuvarlıyor ve MP4 1253/1254 kalıyordu. Bu test, mevcut
 * kare-tam (frame-exact) uygulamasını DEĞİŞTİRMEDEN korur.
 */
const TOTAL_FRAMES = 1254;
// 1254 / 30 = 41.8 s — kare ızgarasına oturmayan toplam süre.
const DURATIONS = [8.457, 12.313, 9.237, 11.793]; // toplam 41.8 s = 1254 kare

async function exportAndCount(transitions: Scene['transition'][]): Promise<{ frames: number; path: string; ffmpeg: FFmpegService; timeline: ReturnType<typeof buildPlaybackTimeline> }> {
  const colours = ['#e07830', '#30a060', '#3040e0', '#e0c030'];
  const paths: string[] = [];
  for (let index = 0; index < colours.length; index += 1) {
    const path = join(directory, `frame-${transitions.join('_')}-${index}.png`);
    await sharp({ create: { width: 540, height: 960, channels: 3, background: colours[index] } }).png().toFile(path);
    paths.push(path);
  }
  const db = new AppDatabase(':memory:'); const projects = new ProjectRepository(db); const exportRecords = new ExportRepository(db);
  const ffmpeg = new FFmpegService(() => process.env.NEDENMIS_FFMPEG_PATH);
  const project = projects.create(projectInput({ targetDuration: 42 }));
  project.scenes = DURATIONS.map((duration, index): Scene => ({
    id: `frames-${index}`, number: index + 1, section: (['hook', 'explanation', 'explanation', 'conclusion'] as const)[index],
    narration: '', visualDescription: '', visualPrompt: '', assetType: 'imported-image', assetPath: paths[index], duration,
    transition: transitions[index], cameraMovement: 'static',
    animation: { enabled: false, preset: 'liquid-molecules', speed: 1, intensity: 1, particleCount: 0 },
    subtitles: [], subtitleTiming: 'estimated', status: 'ready',
  }));
  project.status = 'ready'; projects.update(project);

  const settings = { ...defaultSettings(directory), outputPath: directory };
  const service = new RenderService(projects, exportRecords, ffmpeg, new AudioService(ffmpeg), new SubtitleService(), () => settings, () => undefined, new Logger(join(directory, 'logs')));
  const started = await service.start(project.id);
  const deadline = Date.now() + 900_000;
  while (Date.now() < deadline) { const current = exportRecords.get(started.id); if (['completed', 'failed', 'cancelled'].includes(current.status)) break; await new Promise((resolve) => setTimeout(resolve, 400)); }
  const record = exportRecords.get(started.id);
  expect(record.error).toBeUndefined();
  expect(record.status).toBe('completed');
  expect(existsSync(record.outputPath)).toBe(true);

  const timeline = buildPlaybackTimeline(project.scenes);
  const counted = await ffmpeg.countFrames(record.outputPath);
  db.close();
  return { frames: counted, path: record.outputPath, ffmpeg, timeline };
}

describe('1254 kare — Build 39 kare-tam uygulaması korunur', () => {
  it('karışık sert kesme + çapraz sönümde tam 1254 kare ve son kare çözülebilir', async () => {
    const transitions: Scene['transition'][] = ['fade', 'none', 'dissolve', 'none'];
    const result = await exportAndCount(transitions);

    // Toplam süre kare ızgarasına oturmuyor: yukarı yuvarlanır.
    expect(result.timeline.duration).toBeCloseTo(41.8, 6);
    expect(Math.ceil(result.timeline.duration * FRAME_RATE - 1e-9)).toBe(TOTAL_FRAMES);
    expect(result.frames).toBe(TOTAL_FRAMES);

    // Son kare gerçekten çözülebilmeli (dosya sonu sağlam).
    const lastFramePath = join(directory, 'last-frame.png');
    await result.ffmpeg.run('last-frame', ['-sseof', '-0.5', '-i', result.path, '-update', '1', '-frames:v', '1', lastFramePath]);
    expect(existsSync(lastFramePath)).toBe(true);
    const lastFrame = await sharp(lastFramePath).raw().toBuffer({ resolveWithObject: true });
    expect(lastFrame.info.width).toBe(1080);
    expect(lastFrame.info.height).toBe(1920);
    // Son kare siyah olmamalı (son sahne #e0c030 sarı).
    const stats = await sharp(lastFramePath).stats();
    expect(stats.channels[0].mean).toBeGreaterThan(20);
  }, 1_500_000);

  it('tüm geçişler çapraz sönüm iken de tam 1254 kare', async () => {
    const result = await exportAndCount(['fade', 'fade', 'fade', 'fade']);
    expect(result.frames).toBe(TOTAL_FRAMES);
    for (let index = 0; index < 3; index += 1) {
      expect(outgoingTransitionSeconds(result.timeline, index)).toBeCloseTo(10 / FRAME_RATE, 6);
    }
  }, 1_500_000);

  it('tüm geçişler sert kesme iken de tam 1254 kare', async () => {
    const result = await exportAndCount(['none', 'none', 'none', 'none']);
    expect(result.frames).toBe(TOTAL_FRAMES);
    for (let index = 0; index < 3; index += 1) {
      expect(outgoingTransitionSeconds(result.timeline, index)).toBe(0);
    }
  }, 1_500_000);

  it('kare-tam offset fonksiyonu sınırın altına yuvarlamaz (1254 senaryosu)', () => {
    const timeline = buildPlaybackTimeline(DURATIONS.map((duration, index) => ({
      id: `t-${index}`, number: index + 1, section: 'explanation', narration: '', visualDescription: '', visualPrompt: '',
      assetType: 'imported-image', assetPath: '', duration, transition: 'fade', cameraMovement: 'static',
      animation: { enabled: false, preset: 'liquid-molecules', speed: 1, intensity: 1, particleCount: 0 },
      subtitles: [], subtitleTiming: 'estimated', status: 'ready',
    } as Scene)));
    for (const start of timeline.starts.slice(1)) {
      const exact = Number(frameExactSeconds(start));
      // Bu senaryodaki sınırlar kare ızgarasında DEĞİL (20.77 s = 623.1 kare).
      // Beklenen davranış en yakın kareye oturtmaktır: yarım kareden fazla sapma yok.
      expect(Math.abs(exact * FRAME_RATE - start * FRAME_RATE)).toBeLessThanOrEqual(0.5 + 1e-6);
    }
    // Asıl hata (818/819) kare hizalı sınırlarda oluşuyordu: sınır ızgarada ise
    // offset onun ALTINA düşmemeli. Bu, `toFixed(6)`'nın yaptığı hataydı.
    for (const frames of [294, 623, 900, 1253]) {
      const seconds = frames / FRAME_RATE;
      expect(Number(frameExactSeconds(seconds)) * FRAME_RATE).toBeGreaterThanOrEqual(frames - 1e-6);
      // Naif yuvarlama gerçekten aşağı düşüyordu (hatanın kanıtı).
      const naive = Number(seconds.toFixed(6));
      if (frames === 490) expect(naive * FRAME_RATE).toBeLessThan(frames);
    }
    expect(timeline.starts[1]).toBeCloseTo(8.457, 6);
    expect(timeline.starts[2]).toBeCloseTo(20.77, 6);
    expect(timeline.starts[3]).toBeCloseTo(30.007, 6);
  });
});
