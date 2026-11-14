import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { MediaRepository } from '../../electron/main/infrastructure/database/MediaRepository.js';
import { TtsService } from '../../electron/main/services/tts/TtsService.js';
import { FRAME_RATE } from '../../shared/playback.js';
import { projectInput } from '../helpers.js';

/**
 * TtsService sahne süresini kare ızgarasına yukarı yuvarlamalı ve sahne asla
 * anlatımdan kısa kalmamalı. Gerçek FFmpeg/model gerekmeden, sentez sonucu
 * taklit edilerek doğrulanır (Windows CI 43278664293 / 43284052377 regresyonu).
 */
describe('TTS sonrası sahne süresi', () => {
  it('anlatım sürelerini kare ızgarasına yukarı yuvarlar ve kısaltmaz', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nedenmis-tts-duration-'));
    const db = new AppDatabase(':memory:'); const projects = new ProjectRepository(db); const media = new MediaRepository(db);
    const narrations = [10.733, 8.457, 9.237, 6.111];
    const durations = [10.733, 8.457, 9.237, 6.111];
    const project = projects.create(projectInput({ targetDuration: 40 }));
    project.scenes = narrations.map((_, index) => ({
      id: `scene-${index}`, number: index + 1, section: 'explanation' as const, narration: 'Deneme cümlesi.',
      visualDescription: '', visualPrompt: '', assetType: 'procedural' as const, duration: durations[index],
      transition: 'fade' as const, cameraMovement: 'static' as const,
      animation: { enabled: false, preset: 'liquid-molecules' as const, speed: 1, intensity: 1, particleCount: 0 },
      subtitles: [], subtitleTiming: 'estimated' as const, status: 'ready' as const,
    }));
    project.voice = { providerId: 'stub', voiceId: 'stub', speed: 1, pitch: 0 };
    projects.update(project);
    // Sağlayıcı, verilen her metin için sıradaki anlatım süresini döndürür.
    let call = 0;
    const provider = {
      id: 'stub', name: 'stub', supportsSpeed: true, supportsPitch: false, referenceVoiceSupported: false,
      // Gerçek sağlayıcı gibi ses dosyasını da yazar (TtsService boyutunu okur).
      voices: async () => [], synthesize: vi.fn(async (_request: unknown, path: string) => { const { writeFile } = await import('node:fs/promises'); await writeFile(path, Buffer.alloc(2048)); return { duration: narrations[call++], timingMode: 'estimated' as const, notice: '' }; }),
      test: async () => ({ ok: true, message: '' }),
    };
    const service = new TtsService(projects, media, new Map([[provider.id, provider]]) as never, () => directory);
    const narrated = await service.generateProject(project.id);
    expect(narrated.scenes).toHaveLength(4);
    narrated.scenes.forEach((scene, index) => {
      expect(scene.narrationDuration, `sahne ${index + 1} anlatım`).toBe(narrations[index]);
      expect(scene.duration, `sahne ${index + 1} anlatımdan kısa`).toBeGreaterThanOrEqual(narrations[index]);
      const frames = scene.duration * FRAME_RATE;
      expect(Math.abs(frames - Math.round(frames)), `sahne ${index + 1} kare ızgarası`).toBeLessThan(1e-6);
    });
    db.close();
  }, 60_000);
});
