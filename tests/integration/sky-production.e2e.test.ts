import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { AppContext } from '../../electron/main/services/AppContext.js';
import { DEFAULT_IDENTITY } from '../../shared/defaults.js';
import { normalizeTurkishForTts } from '../../shared/turkishTtsNormalization.js';
import { composeScript, parseScriptSections } from '../../shared/script.js';
import { sceneStartTimes, totalDuration } from '../../shared/utils.js';
import { renderAnimatedSceneSvg, resolveAnimationPreset } from '../../shared/visuals/sceneAnimation.js';
import type { Project, TtsResult } from '../../shared/types.js';
import type { TurkishQualityCase } from '../fixtures/chatterboxDiagnostics.js';

const execFileAsync = promisify(execFile);
const enabled = process.env.NEDENMIS_SKY_E2E === '1';
const topic = 'Gökyüzü neden mavi görünür?';
const NUMBER_CASES = [
  { id: 'sky-numbers-required', text: '2026; 1.480; %35; 3,5; 25 km; 1080×1920.' },
  { id: 'sky-numbers-date-currency', text: '06.11.2026; 14:30; 35 TL; 12 kg.' },
  { id: 'sky-numbers-expression-large', text: '2+3; 8/2; 1 TB; 3,05; -5; 1.000.000.' },
];

interface WaveInspection { path: string; channels: number; sampleRate: number; bitsPerSample: number; frames: number; durationSeconds: number; rms: number; peak: number; clippedRatio: number; nearSilentRatio: number }
async function inspectWav(path: string): Promise<WaveInspection> {
  const wav = await readFile(path);
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF'); expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
  let channels = 0, sampleRate = 0, bitsPerSample = 0, data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const kind = wav.toString('ascii', offset, offset + 4); const size = wav.readUInt32LE(offset + 4); const start = offset + 8;
    if (kind === 'fmt ') { channels = wav.readUInt16LE(start + 2); sampleRate = wav.readUInt32LE(start + 4); bitsPerSample = wav.readUInt16LE(start + 14); }
    if (kind === 'data') { data = wav.subarray(start, Math.min(wav.length, start + size)); break; }
    offset = start + size + (size % 2);
  }
  expect(channels).toBe(1); expect(sampleRate).toBe(24000); expect(bitsPerSample).toBe(16); expect(data?.length).toBeGreaterThan(48000);
  const samples = data!; let sum = 0, peak = 0, clipped = 0, nearSilent = 0; const count = Math.floor(samples.length / 2);
  for (let index = 0; index < count; index += 1) { const value = samples.readInt16LE(index * 2); const absolute = Math.abs(value); sum += value * value; peak = Math.max(peak, absolute); if (absolute >= 32750) clipped += 1; if (absolute < 100) nearSilent += 1; }
  const result = { path, channels, sampleRate, bitsPerSample, frames: count, durationSeconds: count / sampleRate, rms: Math.sqrt(sum / count) / 32768, peak: peak / 32768, clippedRatio: clipped / count, nearSilentRatio: nearSilent / count };
  expect(result.rms, `${path} RMS`).toBeGreaterThan(.0005); expect(result.peak, `${path} peak`).toBeGreaterThan(.005); expect(result.clippedRatio).toBeLessThan(.01);
  return result;
}

function difference(a: Buffer, b: Buffer): number { let sum = 0; for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]); return sum / a.length; }
async function rawPixels(path: string): Promise<Buffer> { return sharp(path).removeAlpha().raw().toBuffer(); }
function srtTime(seconds: number): string { const ms = Math.max(0, Math.round(seconds * 1000)); const hours = Math.floor(ms / 3600000); const minutes = Math.floor(ms % 3600000 / 60000); const secs = Math.floor(ms % 60000 / 1000); return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; }
function originalSrt(project: Project): string { return project.scenes.flatMap((scene) => scene.subtitles).sort((a, b) => a.start - b.start).map((cue, index) => `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}`).join('\n\n') + '\n'; }
async function appendQualityCases(manifestPath: string | undefined, cases: TurkishQualityCase[]): Promise<void> {
  if (!manifestPath) return;
  await mkdir(dirname(manifestPath), { recursive: true });
  const existing = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) as { cases?: TurkishQualityCase[] } : { cases: [] };
  const withoutOld = (existing.cases || []).filter((item) => !cases.some((item2) => item2.id === item.id));
  await writeFile(manifestPath, JSON.stringify({ cases: [...withoutOld, ...cases] }, null, 2), 'utf8');
}

// Real V3 + real render only. ASR is deliberately run by the independent quality_check.py step.
describe.skipIf(!enabled)('Gökyüzü neden mavi görünür? — gerçek üretim E2E', () => {
  it('üç Rayleigh sahnesi, Türkçe sayı WAVları, özgün altyazı, SQLite ve 1080×1920 MP4', async () => {
    const storage = resolve(process.env.NEDENMIS_CHATTERBOX_STORAGE || join(process.cwd(), '.chatterbox-test-storage'));
    const proof = join(storage, 'previews'); await mkdir(proof, { recursive: true });
    const { createAppContext } = await import('../../electron/main/services/AppContext.js');
    const context = createAppContext(storage, join(storage, 'chatterbox-e2e.sqlite'), () => undefined, join(process.cwd(), 'voice-engine'));
    let reopenedContext: AppContext | undefined; const qualityCases: TurkishQualityCase[] = []; const waveforms: WaveInspection[] = [];
    try {
      const status = await context.voiceEngine.status();
      expect(status.modelDownloaded, 'Önce gerçek Chatterbox V3 kurulumu').toBe(true);
      const reference = context.mediaRepository.list('reference-voice')[0];
      expect(reference?.path && existsSync(reference.path), 'Türkçe referans önceki V3 adımında hazırlanmış olmalı').toBe(true);
      const nativeReference = join(storage, 'assets', 'native-turkish-reference.wav'); expect(existsSync(nativeReference)).toBe(true);
      expect(reference.path).toBe(join(storage, 'assets', 'reference_voice.wav'));
      context.settingsRepository.set('activeLlmProvider', 'local-script'); context.settingsRepository.set('activeImageProvider', 'procedural');

      const numberResults: Array<{ id: string; originalText: string; normalizedText: string; audio: string; duration: number; engine: TtsResult['engine'] }> = [];
      const selection = { providerId: 'chatterbox-multilingual-v3', voiceId: 'reference-tr', speed: 1, pitch: 0, exaggeration: .5, cfgWeight: .5, temperature: .8 };
      for (const testCase of NUMBER_CASES) {
        const result = await context.tts.preview({ text: testCase.text, selection, referenceVoicePath: reference.path });
        const audio = join(proof, `${testCase.id}.wav`); await copyFile(result.path, audio);
        expect(result.providerId).toBe('chatterbox-multilingual-v3'); expect(result.ttsText).toBe(normalizeTurkishForTts(testCase.text));
        expect(result.engine?.checkpoint).toBe('t3_mtl23ls_v3.safetensors'); expect(result.engine?.unknownTokens).toBe(0); expect(result.engine?.decodedText).toContain('[tr]');
        waveforms.push(await inspectWav(audio));
        numberResults.push({ id: testCase.id, originalText: testCase.text, normalizedText: result.ttsText!, audio, duration: result.duration, engine: result.engine });
        // ASR, üretilen TTS kopyasını değil kullanıcının özgün metnini bağımsız kanonlaştırır.
        qualityCases.push({ id: testCase.id, audio, text: testCase.text, required: true });
        await appendQualityCases(process.env.NEDENMIS_TURKISH_QUALITY_MANIFEST, qualityCases);
      }

      const created = context.projects.create({ topic, name: topic, category: 'Bilim', mode: 'automatic', targetDuration: 30 });
      created.voice = selection; context.projects.update(created);
      const scripted = await context.ai.generate(created.id);
      expect(scripted.scriptSections).toBeDefined(); expect(parseScriptSections(scripted.script)).toEqual(scripted.scriptSections);
      expect(scripted.scriptSections!.conclusion.trim()).not.toBe(''); expect(scripted.script.endsWith(scripted.scriptSections!.conclusion)).toBe(true);
      expect(scripted.script).not.toMatch(/abone ol|kanalımıza|takip etmeyi/i);
      const planned = await context.ai.generateScenes(scripted.id);
      expect(planned.scenes).toHaveLength(3); expect(planned.scenes.map((scene) => scene.section)).toEqual(['hook', 'explanation', 'conclusion']);
      expect(planned.scenes.every((scene) => resolveAnimationPreset(planned, scene) === 'light-scattering')).toBe(true);
      expect(planned.scenes.every((scene) => scene.cameraMovement === 'static')).toBe(true);
      expect(planned.scenes[1].narration).toContain('450 nanometre'); expect(planned.scenes.at(-1)!.narration).toBe(scripted.scriptSections!.conclusion);

      const visualized = await context.visuals.generateAll(planned.id);
      expect(visualized.scenes.every((scene) => scene.assetPath && existsSync(scene.assetPath))).toBe(true);
      const visualAssetCount = context.mediaRepository.list('generated-image').filter((item) => item.projectId === created.id).length; expect(visualAssetCount).toBe(3);
      const narrated = await context.tts.generateProject(visualized.id);
      expect(narrated.scenes.every((scene) => scene.narrationPath && scene.ttsText && scene.ttsEngine)).toBe(true);
      expect(narrated.scenes.every((scene) => scene.ttsEngine?.checkpoint === 't3_mtl23ls_v3.safetensors' && scene.ttsEngine.unknownTokens === 0)).toBe(true);
      expect(narrated.scenes[1].narration).toContain('450 nanometre'); expect(narrated.scenes[1].ttsText).toContain('dört yüz elli nanometre'); expect(narrated.scenes[1].ttsText).not.toContain('450');
      const narrationAssetCount = context.mediaRepository.list('narration').filter((item) => item.projectId === created.id).length; expect(narrationAssetCount).toBe(3);
      const starts = sceneStartTimes(narrated.scenes);
      for (let index = 0; index < narrated.scenes.length; index += 1) {
        const scene = narrated.scenes[index]; const audio = join(proof, `sky-scene-${index + 1}-narration.wav`); await copyFile(scene.narrationPath!, audio);
        waveforms.push(await inspectWav(audio)); qualityCases.push({ id: `sky-scene-${index + 1}-narration`, audio, text: scene.narration, required: true });
        expect(scene.subtitles.length).toBeGreaterThan(0); expect(scene.subtitles.map((cue) => cue.text).join(' ')).toBe(scene.narration);
        scene.subtitles.forEach((cue) => { expect(cue.start).toBeGreaterThanOrEqual(starts[index] - .01); expect(cue.end).toBeLessThanOrEqual(starts[index] + scene.duration + .01); });
        const asset = join(proof, `sky-scene-${index + 1}-asset.png`); await copyFile(scene.assetPath!, asset);
      }
      expect(narrated.scenes.at(-1)!.subtitles.map((cue) => cue.text).join(' ')).toBe(scripted.scriptSections!.conclusion);
      const srt = originalSrt(narrated);
      const srtSpeech = srt.trim().split(/\r?\n\r?\n/).map((block) => block.split(/\r?\n/).slice(2).join(' ')).join(' ');
      expect(srt).toContain('450 nanometre'); expect(srt).not.toContain('dört yüz elli nanometre');
      expect(srtSpeech).toBe(narrated.scenes.map((scene) => scene.narration).join(' ')); expect(srtSpeech).toContain(scripted.scriptSections!.conclusion);
      await writeFile(join(proof, 'sky-original-subtitles.srt'), srt, 'utf8'); await context.subtitles.write(narrated, join(proof, 'sky-export-subtitles.ass'));
      await appendQualityCases(process.env.NEDENMIS_TURKISH_QUALITY_MANIFEST, qualityCases);

      // Prove that a new application context reads the exact data used for export.
      context.voiceEngine.close(); context.database.close();
      reopenedContext = createAppContext(storage, join(storage, 'chatterbox-e2e.sqlite'), () => undefined, join(process.cwd(), 'voice-engine'));
      const persisted = reopenedContext.projects.get(created.id);
      expect(persisted.script).toBe(scripted.script); expect(persisted.scriptSections).toEqual(scripted.scriptSections); expect(composeScript(persisted.scriptSections!)).toBe(persisted.script);
      expect(persisted.scenes.map((scene) => scene.section)).toEqual(['hook', 'explanation', 'conclusion']);
      expect(persisted.scenes.every((scene) => scene.narrationPath && existsSync(scene.narrationPath) && scene.ttsEngine && scene.ttsText)).toBe(true);
      expect(persisted.scenes[1].narration).toContain('450 nanometre'); expect(persisted.scenes[1].subtitles.map((cue) => cue.text).join(' ')).toContain('450 nanometre');
      reopenedContext.settings.update({ exportPreset: 'standard', outputPath: join(storage, 'exports') });
      const started = await reopenedContext.render.start(persisted.id); const deadline = Date.now() + 600000;
      while (Date.now() < deadline) { const current = reopenedContext.exports.get(started.id); if (['completed', 'failed', 'cancelled'].includes(current.status)) break; await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000)); }
      const exported = reopenedContext.exports.get(started.id); expect(exported.error).toBeUndefined(); expect(exported.status).toBe('completed'); expect(existsSync(exported.outputPath)).toBe(true);
      const output = process.env.NEDENMIS_SKY_OUTPUT || exported.outputPath;
      if (output !== exported.outputPath) { await mkdir(dirname(output), { recursive: true }); await copyFile(exported.outputPath, output); }

      const probe = await reopenedContext.ffmpeg.probe(output); expect(probe).toMatchObject({ width: 1080, height: 1920, codec: 'h264' });
      const streams = await execFileAsync(reopenedContext.ffmpeg.ffprobePath, ['-v', 'error', '-count_frames', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration,sample_rate,channels', '-of', 'json', output], { maxBuffer: 5 * 1024 * 1024 });
      const streamInfo = JSON.parse(streams.stdout) as { format: { duration: string }; streams: Array<Record<string, string | number>> };
      const videoStream = streamInfo.streams.find((stream) => stream.codec_type === 'video')!; const audioStream = streamInfo.streams.find((stream) => stream.codec_type === 'audio')!;
      const expectedFrames = Math.max(1, Math.ceil(totalDuration(persisted.scenes) * 30 - 1e-9));
      expect(videoStream.codec_name).toBe('h264'); expect(videoStream.r_frame_rate).toBe('30/1'); expect(videoStream.avg_frame_rate).toBe('30/1');
      expect(videoStream.nb_read_frames).toBe(String(expectedFrames)); expect(Number(videoStream.duration)).toBeCloseTo(expectedFrames / 30, 1);
      expect(audioStream.codec_name).toBe('aac'); expect(Number(audioStream.sample_rate)).toBe(48000); expect(Number(audioStream.channels)).toBe(2);
      expect(Math.abs(Number(streamInfo.format.duration) - totalDuration(persisted.scenes))).toBeLessThan(.5);
      qualityCases.push({ id: 'sky-exported-animated-mp4', audio: output, text: persisted.scenes.map((scene) => scene.narration).join(' '), required: true });

      const sceneMotion: Array<Record<string, unknown>> = [];
      for (let index = 0; index < persisted.scenes.length; index += 1) {
        const scene = persisted.scenes[index]; const firstTime = Math.min(.3, scene.duration * .1); const secondTime = Math.min(scene.duration - .1, firstTime + Math.max(.8, scene.duration * .45));
        const previewFirstPath = join(proof, `sky-scene-${index + 1}-preview-first.png`); const previewSecondPath = join(proof, `sky-scene-${index + 1}-preview-second.png`);
        await sharp(Buffer.from(renderAnimatedSceneSvg(persisted, scene, DEFAULT_IDENTITY, firstTime))).resize(270, 480).png().toFile(previewFirstPath);
        await sharp(Buffer.from(renderAnimatedSceneSvg(persisted, scene, DEFAULT_IDENTITY, secondTime))).resize(270, 480).png().toFile(previewSecondPath);
        const previewDifference = difference(await rawPixels(previewFirstPath), await rawPixels(previewSecondPath)); expect(previewDifference, `Sahne ${index + 1} önizleme hareketi`).toBeGreaterThan(.2);
        const exportFrames: Buffer[] = [];
        for (const [sample, relative] of [firstTime, secondTime].entries()) {
          const framePath = join(proof, `sky-scene-${index + 1}-export-${sample + 1}.png`);
          await reopenedContext.ffmpeg.run(`sky-export-frame-${index}-${sample}`, ['-ss', String(starts[index] + relative), '-i', output, '-frames:v', '1', '-vf', 'crop=920:1000:80:300,scale=460:500', '-update', '1', framePath]);
          expect(existsSync(framePath)).toBe(true); exportFrames.push(await rawPixels(framePath));
        }
        const exportDifference = difference(exportFrames[0], exportFrames[1]); expect(exportDifference, `Sahne ${index + 1} MP4 nesne hareketi`).toBeGreaterThan(.4);
        sceneMotion.push({ scene: index + 1, section: scene.section, preset: resolveAnimationPreset(persisted, scene), cameraMovement: scene.cameraMovement, previewFirstTime: firstTime, previewSecondTime: secondTime, previewMeanPixelDifference: previewDifference, exportMeanPixelDifference: exportDifference, narrationDuration: scene.narrationDuration, sceneDuration: scene.duration, subtitleCues: scene.subtitles.length, engine: scene.ttsEngine });
      }
      await appendQualityCases(process.env.NEDENMIS_TURKISH_QUALITY_MANIFEST, qualityCases);
      const result = {
        ok: true, topic, projectId: created.id, model: numberResults[0].engine?.model, checkpoint: numberResults[0].engine?.checkpoint, modelRevision: numberResults[0].engine?.modelRevision,
        scriptSections: persisted.scriptSections, sceneSections: persisted.scenes.map((scene) => scene.section), persistenceAfterRestart: true,
        assets: { generatedImages: visualAssetCount, projectNarrationWavs: narrationAssetCount, numericPreviewWavs: NUMBER_CASES.length, totalNewWavs: narrationAssetCount + NUMBER_CASES.length },
        numericWavs: numberResults, waveforms, animatedScenes: sceneMotion.length, sceneMotion,
        video: { path: output, width: 1080, height: 1920, fps: 30, durationSeconds: Number(streamInfo.format.duration), expectedDurationSeconds: totalDuration(persisted.scenes), expectedFrames, decodedFrames: Number(videoStream.nb_read_frames), videoStreamDuration: Number(videoStream.duration), videoCodec: 'h264', audioCodec: 'aac', audioSampleRate: Number(audioStream.sample_rate), audioChannels: Number(audioStream.channels) },
        subtitles: { path: join(proof, 'sky-original-subtitles.srt'), originalNumericFormsPreserved: true, conclusionNarratedAndSubtitled: true, cues: persisted.scenes.reduce((sum, scene) => sum + scene.subtitles.length, 0) },
        previewAndExport: 'Same scene JSON and shared time-based SVG timeline; every scene has independent raster motion evidence',
        asr: 'Cases appended to the independent faster-whisper Turkish quality manifest; this test does not claim human listening',
      };
      if (process.env.NEDENMIS_SKY_RESULT) { await mkdir(dirname(process.env.NEDENMIS_SKY_RESULT), { recursive: true }); await writeFile(process.env.NEDENMIS_SKY_RESULT, JSON.stringify(result, null, 2), 'utf8'); }
      console.log(JSON.stringify(result, null, 2));
    } finally {
      context.voiceEngine.close(); reopenedContext?.voiceEngine.close();
      try { context.database.close(); } catch { /* Closed for reopen test. */ }
      try { reopenedContext?.database.close(); } catch { /* Best-effort cleanup after a failed gate. */ }
    }
  }, 7_200_000);
});
