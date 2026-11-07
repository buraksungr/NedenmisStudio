import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { cpus, freemem, totalmem } from 'node:os';
import { describe, expect, it } from 'vitest';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { generateSubtitleCues, id } from '../../shared/index.js';
import type { Scene } from '../../shared/types.js';

// Bu test yalnızca açıkça gerçek model ortamı sağlandığında çalışır; standart pakette simüle edilmez.
const enabled = process.env.NEDENMIS_CHATTERBOX_E2E === '1';
describe.skipIf(!enabled)('Gerçek Chatterbox Multilingual V3 Windows CPU doğrulaması', () => {
  it('referanslı önizleme, iki sahne anlatımı, dikey MP4 ve yeniden açılış kalıcılığı', async () => {
    const storage = resolve(process.env.NEDENMIS_CHATTERBOX_STORAGE || join(process.cwd(), '.chatterbox-test-storage')); await mkdir(storage, { recursive: true });
    const { createAppContext } = await import('../../electron/main/services/AppContext.js');
    const context = createAppContext(storage, join(storage, 'chatterbox-e2e.sqlite'), () => undefined, join(process.cwd(), 'voice-engine'), (progress) => console.log(`[Chatterbox ${progress.stage}] ${progress.message}`));
    try {
      if (process.env.NEDENMIS_CHATTERBOX_SETUP === '1') await context.voiceEngine.setup();
      const referenceSource = process.env.NEDENMIS_CHATTERBOX_REFERENCE; if (!referenceSource || !existsSync(referenceSource)) throw new Error('NEDENMIS_CHATTERBOX_REFERENCE gerçek bir WAV/MP3/M4A dosyası olmalı.');
      const reference = await context.media.importReference(referenceSource); expect(reference.duration).toBeGreaterThanOrEqual(3); expect((await context.ffmpeg.probe(reference.path)).sampleRate).toBe(24000);
      const project = context.projects.create({ topic: 'Işığın doğası', name: 'Gerçek Chatterbox sınaması', category: 'Bilim', mode: 'custom', targetDuration: 20 }); project.voice = { providerId: 'chatterbox-multilingual-v3', voiceId: 'reference-tr', speed: 1, pitch: 0, exaggeration: .5, cfgWeight: .5, temperature: .8 }; context.projects.update(project);
      const preview = await context.tts.preview({ text: 'Bu önizleme, gerçek referans kayıt kullanılarak Chatterbox Multilingual V3 ile üretilmiştir.', selection: project.voice, referenceVoicePath: reference.path });
      expect(preview.providerId).toBe('chatterbox-multilingual-v3'); expect(preview.engine?.checkpoint).toBe('t3_mtl23ls_v3.safetensors'); expect(preview.engine?.referenceSha256).toMatch(/^[a-f0-9]{64}$/); expect(preview.duration).toBeGreaterThan(.5); expect(existsSync(preview.path)).toBe(true);
      const texts = ['Güneş ışığı atmosfere girdiğinde farklı renkler farklı biçimlerde saçılır.', 'Mavi ışığın daha fazla saçılması, açık havada gökyüzünü mavi görmemize yardım eder.'];
      project.scenes = texts.map((narration, index): Scene => ({ id: id('scene'), number: index + 1, narration, visualDescription: index ? 'Mavi ışık saçılım diyagramı' : 'Güneş ışığı ve atmosfer', visualPrompt: '', assetType: 'procedural', duration: 4, transition: index ? 'dissolve' : 'fade', cameraMovement: index ? 'pan-right' : 'zoom-in', subtitles: generateSubtitleCues(narration, 4, index * 4), subtitleTiming: 'estimated', status: 'empty' })); context.projects.update(project);
      const narrated = await context.tts.generateProject(project.id); expect(narrated.voice.providerId).toBe('chatterbox-multilingual-v3'); expect(narrated.scenes.every((scene) => scene.narrationPath && scene.narrationDuration! > .5)).toBe(true); expect(narrated.scenes.every((scene) => scene.duration >= scene.narrationDuration!)).toBe(true);
      const visualized = await context.visuals.generateAll(narrated.id); expect(visualized.scenes.every((scene) => scene.assetPath && existsSync(scene.assetPath))).toBe(true);
      const settings = context.settings.get(); context.settings.update({ exportPreset: 'standard', outputPath: join(storage, 'exports') });
      const record = await context.render.start(visualized.id); const deadline = Date.now() + 240000;
      while (Date.now() < deadline) { const current = context.exports.get(record.id); if (['completed', 'failed', 'cancelled'].includes(current.status)) break; await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000)); }
      const exported = context.exports.get(record.id); expect(exported.error).toBeUndefined(); expect(exported.status).toBe('completed'); const video = await context.ffmpeg.probe(exported.outputPath); expect(video.width).toBe(1080); expect(video.height).toBe(1920); expect(video.codec).toBe('h264'); expect(video.duration).toBeGreaterThan(2); expect(existsSync(exported.outputPath)).toBe(true);
      const databasePath = join(storage, 'chatterbox-e2e.sqlite'); context.voiceEngine.close(); context.database.close();
      const reopened = new AppDatabase(databasePath); const persisted = new ProjectRepository(reopened).get(project.id); expect(persisted.scenes).toHaveLength(2); expect(persisted.scenes.every((scene) => scene.narrationPath && existsSync(scene.narrationPath))).toBe(true); reopened.close();
      const result = { ok: true, model: preview.engine!.model, checkpoint: preview.engine!.checkpoint, device: preview.engine!.device, referenceSha256: preview.engine!.referenceSha256, previewSeconds: preview.duration, previewGenerationSeconds: preview.engine!.generationSeconds, projectNarrationSeconds: narrated.scenes.map((scene) => scene.narrationDuration), mp4: exported.outputPath, video, persistenceAfterRestart: true, hardware: { cpu: cpus()[0]?.model, logicalCores: cpus().length, totalMemoryGB: Math.round(totalmem() / 1024 ** 3 * 10) / 10, freeMemoryAtEndGB: Math.round(freemem() / 1024 ** 3 * 10) / 10 }, note: 'Gerçek referans kullanımı ve dosya üretimi doğrulandı; konuşmacı benzerliği otomatik ölçülmedi, örnek dinlenmelidir.' };
      if (process.env.NEDENMIS_CHATTERBOX_RESULT) { await mkdir(dirname(process.env.NEDENMIS_CHATTERBOX_RESULT), { recursive: true }); await writeFile(process.env.NEDENMIS_CHATTERBOX_RESULT, JSON.stringify(result, null, 2), 'utf8'); } console.log(JSON.stringify(result, null, 2));
      expect(settings.activeTtsProvider).toBe('chatterbox-multilingual-v3');
    } finally { context.voiceEngine.close(); try { context.database.close(); } catch { /* Yeniden açılış testinde zaten kapandı. */ } }
  }, 7_200_000);
});
