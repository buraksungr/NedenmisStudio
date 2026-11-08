import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { cpus, freemem, totalmem } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { generateSubtitleCues, id, sceneStartTimes, totalDuration } from '../../shared/index.js';
import type { AnimationPreset, Scene } from '../../shared/types.js';
import { createPartialDiagnosticsWriter, type TurkishAbDiagnostic, type TurkishQualityCase } from '../fixtures/chatterboxDiagnostics.js';

const execFileAsync = promisify(execFile);
const enabled = process.env.NEDENMIS_CHATTERBOX_E2E === '1';
const QUALITY_TEXT = 'Buzun suda yüzmesinin nedeni yoğunluğunun sudan daha düşük olmasıdır. Su donarken molekülleri düzenli bir kristal yapı oluşturur ve daha fazla yer kaplar.';
const AB_TEXT = 'Buz, yoğunluğu sudan daha düşük olduğu için suda yüzer.';
const SCENE_TEXTS = [
  'Sıvı suda moleküller sürekli titreşir ve birbirinin yanından geçer.',
  'Su donarken molekülleri düzenli bir kristal yapı oluşturur.',
  'Bu açık kristal kafes daha fazla yer kaplar ve buzun yoğunluğunu düşürür.',
  'Buzun suda yüzmesinin nedeni yoğunluğunun sudan daha düşük olmasıdır.',
];

// Real model only. File production is not treated as speech-quality evidence.
describe.skipIf(!enabled)('Gerçek Chatterbox V3 Türkçe kalite ve dört sahne doğrulaması', () => {
  it('ön işleme/referans A/B, doğal Türkçe, animasyonlu MP4, altyazı ve kalıcılık', async () => {
    const storage = resolve(process.env.NEDENMIS_CHATTERBOX_STORAGE || join(process.cwd(), '.chatterbox-test-storage')); await mkdir(storage, { recursive: true });
    const qualityCases: TurkishQualityCase[] = [];
    const abDiagnostics: TurkishAbDiagnostic[] = [];
    const persistPartialDiagnostics = createPartialDiagnosticsWriter(process.env.NEDENMIS_TURKISH_QUALITY_MANIFEST, process.env.NEDENMIS_CHATTERBOX_RESULT);
    const savePartialDiagnostics = () => persistPartialDiagnostics(qualityCases, abDiagnostics);
    const { createAppContext } = await import('../../electron/main/services/AppContext.js');
    const context = createAppContext(storage, join(storage, 'chatterbox-e2e.sqlite'), () => undefined, join(process.cwd(), 'voice-engine'), (progress) => console.log(`[Chatterbox ${progress.stage}] ${progress.message}`));
    try {
      if (process.env.NEDENMIS_CHATTERBOX_SETUP === '1') await context.voiceEngine.setup();
      const englishSource = process.env.NEDENMIS_CHATTERBOX_REFERENCE;
      const turkishSource = process.env.NEDENMIS_CHATTERBOX_TURKISH_REFERENCE;
      if (!englishSource || !existsSync(englishSource)) throw new Error('Build 10 koşulunu tekrarlamak için İngilizce SAPI referansı gerekli.');
      if (!turkishSource || !existsSync(turkishSource)) throw new Error('Türkçe kalite A/B testi için gerçek Türkçe referans gerekli.');
      const englishReference = await context.media.importReference(englishSource);
      const englishPrepared = join(storage, 'assets', 'build10-english-reference.wav'); await copyFile(englishReference.path, englishPrepared);
      const turkishConverted = join(storage, 'assets', 'native-turkish-reference.wav');
      await context.ffmpeg.run('native-turkish-reference', ['-i', turkishSource, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', turkishConverted]);
      const turkishReference = await context.media.importReference(turkishConverted);
      expect(englishReference.duration).toBeGreaterThanOrEqual(3); expect(turkishReference.duration).toBeGreaterThanOrEqual(3);
      expect((await context.ffmpeg.probe(turkishReference.path)).sampleRate).toBe(24000);

      const project = context.projects.create({ topic: 'Buz neden suda yüzer?', name: 'Buz neden suda yüzer?', category: 'Bilim', mode: 'custom', targetDuration: 32 });
      project.voice = { providerId: 'chatterbox-multilingual-v3', voiceId: 'reference-tr', speed: 1, pitch: 0, exaggeration: .5, cfgWeight: .5, temperature: .8 }; context.projects.update(project);

      // Controlled 2×2: same text/seed/model parameters; only case profile and reference language vary.
      for (const [name, legacyLowercase, referencePath] of [
        ['build10-lowercase-english', true, englishPrepared],
        ['fullcase-english', false, englishPrepared],
        ['legacy-lowercase-turkish', true, turkishReference.path],
        ['v3-fullcase-turkish', false, turkishReference.path],
      ] as const) {
        const outputPath = join(storage, 'previews', `${name}.wav`);
        const generated = await context.voiceEngine.synthesize({ id: id(name), text: AB_TEXT, referencePath, outputPath, exaggeration: .5, cfgWeight: .5, temperature: .8, seed: 20261107, legacyLowercase });
        abDiagnostics.push({ id: name, referenceSha256: generated.referenceSha256, duration: generated.duration, generationSeconds: generated.generationSeconds, normalizedText: generated.normalizedText, decodedText: generated.decodedText, tokenCount: generated.tokenCount, tokenIds: generated.tokenIds, languageTokenId: generated.languageTokenId, unknownTokens: generated.unknownTokens, seed: generated.seed });
        qualityCases.push({ id: name, audio: outputPath, text: AB_TEXT, required: name === 'v3-fullcase-turkish' });
        await savePartialDiagnostics();
        expect(generated.checkpoint).toBe('t3_mtl23ls_v3.safetensors'); expect(generated.sampleRate).toBe(24000); expect(generated.channels).toBe(1);
        expect(generated.tokenCount).toBeGreaterThan(10); expect(generated.tokenIds).toHaveLength(generated.tokenCount); expect(generated.tokenIds[0]).toBe(generated.languageTokenId); expect(generated.unknownTokens).toBe(0); expect(generated.decodedText).toContain('[tr]');
        expect(generated.textPreprocessing).toBe(legacyLowercase ? 'legacy-lowercase,NFKD' : 'NFKD,fullcase');
      }

      const preview = await context.tts.preview({ text: QUALITY_TEXT, selection: project.voice, referenceVoicePath: turkishReference.path });
      expect(preview.providerId).toBe('chatterbox-multilingual-v3'); expect(preview.engine?.checkpoint).toBe('t3_mtl23ls_v3.safetensors');
      expect(preview.engine?.textPreprocessing).toBe('NFKD,fullcase'); expect(preview.engine?.unknownTokens).toBe(0);
      expect(preview.engine?.referenceSha256).toMatch(/^[a-f0-9]{64}$/); expect(preview.duration).toBeGreaterThan(.5); expect(existsSync(preview.path)).toBe(true);
      const qualityAudio = join(storage, 'previews', 'turkish-natural-v3-provider.wav'); await copyFile(preview.path, qualityAudio);
      qualityCases.push({ id: 'turkish-natural-v3-provider', audio: qualityAudio, text: QUALITY_TEXT, required: true });
      await savePartialDiagnostics();

      const presets: AnimationPreset[] = ['liquid-molecules', 'crystallization', 'lattice-expansion', 'floating-ice'];
      project.scenes = SCENE_TEXTS.map((narration, index): Scene => ({
        id: id('scene'), number: index + 1, narration,
        visualDescription: ['Sıvı su molekülleri', 'Kristal oluşumu', 'Genişleyen buz kafesi', 'Yüzen buz ve dalgalar'][index], visualPrompt: '', assetType: 'procedural', duration: 6,
        transition: (['fade', 'dissolve', 'slide', 'fade'] as const)[index], cameraMovement: 'static',
        animation: { enabled: true, preset: presets[index], speed: 1, intensity: 1, particleCount: 24 },
        subtitles: generateSubtitleCues(narration, 6, index * 6), subtitleTiming: 'estimated', status: 'empty',
      })); context.projects.update(project);
      const narrated = await context.tts.generateProject(project.id);
      expect(context.settings.get().activeTtsProvider).toBe('chatterbox-multilingual-v3');
      expect(narrated.voice.providerId).toBe('chatterbox-multilingual-v3'); expect(narrated.scenes).toHaveLength(4);
      expect(narrated.scenes.every((scene) => scene.narrationPath && scene.narrationDuration! > .5)).toBe(true);
      expect(narrated.scenes.every((scene) => scene.duration >= scene.narrationDuration!)).toBe(true);
      const starts = sceneStartTimes(narrated.scenes);
      narrated.scenes.forEach((scene, index) => scene.subtitles.forEach((cue) => {
        expect(cue.start).toBeGreaterThanOrEqual(starts[index]); expect(cue.end).toBeLessThanOrEqual(starts[index] + scene.duration + .01);
      }));
      context.voiceEngine.close(); // Release several GB of model tensors before CPU rendering.
      const visualized = await context.visuals.generateAll(narrated.id); expect(visualized.scenes.every((scene) => scene.assetPath && existsSync(scene.assetPath))).toBe(true);
      context.settings.update({ exportPreset: 'standard', outputPath: join(storage, 'exports') });
      const record = await context.render.start(visualized.id); const deadline = Date.now() + 600000;
      while (Date.now() < deadline) { const current = context.exports.get(record.id); if (['completed', 'failed', 'cancelled'].includes(current.status)) break; await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000)); }
      const exported = context.exports.get(record.id); expect(exported.error).toBeUndefined(); expect(exported.status).toBe('completed');
      const video = await context.ffmpeg.probe(exported.outputPath); expect(video.width).toBe(1080); expect(video.height).toBe(1920); expect(video.codec).toBe('h264');
      expect(Math.abs(video.duration - totalDuration(visualized.scenes))).toBeLessThan(.5); expect(existsSync(exported.outputPath)).toBe(true);
      const streams = await execFileAsync(context.ffmpeg.ffprobePath, ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,r_frame_rate,avg_frame_rate,nb_read_frames,duration,sample_rate,channels', '-of', 'json', exported.outputPath]);
      expect(streams.stdout).toContain('"r_frame_rate": "30/1"'); expect(streams.stdout).toContain('"codec_name": "aac"');
      const streamInfo = JSON.parse(streams.stdout) as { streams: { codec_type: string; nb_read_frames?: string; duration?: string; avg_frame_rate?: string }[] };
      const videoStream = streamInfo.streams.find((stream) => stream.codec_type === 'video')!;
      const expectedFrames = Math.max(1, Math.ceil(totalDuration(visualized.scenes) * 30 - 1e-9));
      expect(videoStream.nb_read_frames).toBe(String(expectedFrames)); expect(videoStream.avg_frame_rate).toBe('30/1');
      expect(Number(videoStream.duration)).toBeCloseTo(expectedFrames / 30, 1);
      for (let index = 0; index < 4; index += 1) {
        const framePath = join(storage, 'previews', `exported-scene-${index + 1}.png`);
        await context.ffmpeg.run(`exported-frame-${index}`, ['-ss', String(starts[index] + Math.min(1, visualized.scenes[index].duration / 3)), '-i', exported.outputPath, '-frames:v', '1', '-vf', 'scale=540:960', '-update', '1', framePath]);
        expect(existsSync(framePath)).toBe(true);
      }
      qualityCases.push({ id: 'turkish-four-scene-exported-mp4', audio: exported.outputPath, text: SCENE_TEXTS.join(' '), required: true });
      await savePartialDiagnostics();

      const databasePath = join(storage, 'chatterbox-e2e.sqlite'); context.voiceEngine.close(); context.database.close();
      const reopened = new AppDatabase(databasePath); const persisted = new ProjectRepository(reopened).get(project.id);
      expect(persisted.scenes).toHaveLength(4); expect(persisted.scenes.every((scene) => scene.narrationPath && existsSync(scene.narrationPath))).toBe(true); reopened.close();
      const result = {
        ok: true, speechQuality: 'Pending independent Turkish ASR gate; not claimed by this technical test',
        model: preview.engine!.model, checkpoint: preview.engine!.checkpoint, modelRevision: preview.engine!.modelRevision,
        textPreprocessing: preview.engine!.textPreprocessing, device: preview.engine!.device, referenceSha256: preview.engine!.referenceSha256,
        previewSeconds: preview.duration, previewGenerationSeconds: preview.engine!.generationSeconds,
        projectName: persisted.name, projectNarrationSeconds: narrated.scenes.map((scene) => scene.narrationDuration),
        abDiagnostics, mp4: exported.outputPath, video, audioVideoStreams: JSON.parse(streams.stdout), persistenceAfterRestart: true,
        hardware: { cpu: cpus()[0]?.model, logicalCores: cpus().length, totalMemoryGB: Math.round(totalmem() / 1024 ** 3 * 10) / 10, freeMemoryAtEndGB: Math.round(freemem() / 1024 ** 3 * 10) / 10 },
        note: 'Gerçek model ve video üretimi doğrulandı. Anlaşılırlık ayrı ASR adımında ölçülür; insan dinlemesi ve konuşmacı benzerliği iddia edilmez.',
      };
      if (process.env.NEDENMIS_TURKISH_QUALITY_MANIFEST) {
        await mkdir(dirname(process.env.NEDENMIS_TURKISH_QUALITY_MANIFEST), { recursive: true });
        await writeFile(process.env.NEDENMIS_TURKISH_QUALITY_MANIFEST, JSON.stringify({ cases: qualityCases }, null, 2), 'utf8');
      }
      if (process.env.NEDENMIS_CHATTERBOX_RESULT) { await mkdir(dirname(process.env.NEDENMIS_CHATTERBOX_RESULT), { recursive: true }); await writeFile(process.env.NEDENMIS_CHATTERBOX_RESULT, JSON.stringify(result, null, 2), 'utf8'); }
      console.log(JSON.stringify(result, null, 2));
    } finally { context.voiceEngine.close(); try { context.database.close(); } catch { /* Already reopened in persistence test. */ } }
  }, 7_200_000);
});
