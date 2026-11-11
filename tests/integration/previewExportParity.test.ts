import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
import {
  buildPlaybackTimeline, CROSSFADE_SECONDS, DEFAULT_IDENTITY, generateSubtitleCues, sceneIndexAt,
  totalDuration, transitionAt,
} from '../../shared/index.js';
import { renderAnimatedSceneSvg } from '../../shared/visuals/sceneAnimation.js';
import type { Scene } from '../../shared/types.js';
import { exportFixtureProject, projectInput, retainVerificationArtifacts, verificationDir } from '../helpers.js';

const execFileAsync = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'nedenmis-parity-'));
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

async function meanLuminance(path: string): Promise<number> {
  const data = await sharp(path).greyscale().raw().toBuffer();
  let sum = 0; for (const value of data) sum += value;
  return sum / Math.max(1, data.length);
}

async function meanDifference(left: string, right: string): Promise<number> {
  const [a, b] = await Promise.all([left, right].map(async (path) => sharp(path).resize(216, 384).removeAlpha().raw().toBuffer()));
  let sum = 0; for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return sum / a.length;
}

describe('Önizleme ve MP4 dışa aktarımı aynı zaman modelini kullanır', () => {
  it('50 saniyelik dört sahneli kurguyu dışa aktarır ve kareleri önizleme zaman çizelgesiyle karşılaştırır', async () => {
    const db = new AppDatabase(':memory:'); const projects = new ProjectRepository(db); const exports = new ExportRepository(db);
    const ffmpeg = new FFmpegService(() => undefined); const project = projects.create(projectInput({ targetDuration: 52 }));
    project.name = 'Buz neden suda yüzer — 52 saniyelik doğrulama';
    const scenes: Scene[] = [];
    // 4 sahne, toplam 52 saniye, farklı süreler ve geçiş türleri.
    const durations = [9.5, 14.5, 13.5, 14.5];
    const transitions: Scene['transition'][] = ['fade', 'dissolve', 'slide', 'fade'];
    const preset = ['liquid-molecules', 'crystallization', 'lattice-expansion', 'floating-ice'] as const;
    for (let index = 0; index < 4; index += 1) {
      const narration = exportFixtureProject.narrations[index];
      scenes.push({
        id: `parity-scene-${index + 1}`, number: index + 1, section: (['hook', 'explanation', 'explanation', 'conclusion'] as const)[index],
        narration, visualDescription: 'Buz ve su molekülleri', visualPrompt: '', assetType: 'procedural',
        duration: durations[index], transition: transitions[index], cameraMovement: 'zoom-in',
        animation: { enabled: true, preset: preset[index], speed: 1, intensity: 1, particleCount: 26 },
        subtitles: generateSubtitleCues(narration, durations[index], 0), subtitleTiming: 'estimated', status: 'ready',
      });
    }
    // Altyazılar mutlak zaman damgalarına taşınır (TtsService ile aynı kural).
    const timeline = buildPlaybackTimeline(scenes);
    scenes.forEach((scene, index) => { scene.subtitles = generateSubtitleCues(scene.narration, scene.duration, timeline.starts[index]); });
    project.scenes = scenes; project.status = 'ready';
    project.audio.narrationVolume = 1; project.audio.musicClips = []; project.audio.sfxClips = [];
    projects.update(project);

    // Gerçek anlatım/ses: her sahne için bir ton ve müzik yatağı (ducking de sınanır).
    const music = join(directory, 'music.wav');
    await ffmpeg.run('parity-music', ['-f', 'lavfi', '-i', 'sine=frequency=220:duration=52', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', music]);
    project.scenes.forEach((scene, index) => { scene.narrationPath = join(directory, `narration-${index}.wav`); });
    for (let index = 0; index < 4; index += 1) {
      // Mono anlatım: ses grafiği mono→stereo dönüşümünü doğru yapmalı.
      await ffmpeg.run(`parity-narration-${index}`, ['-f', 'lavfi', '-i', `sine=frequency=${330 + index * 60}:duration=${durations[index] - .4}`, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', project.scenes[index].narrationPath!]);
    }
    project.audio.musicClips = [{ id: 'parity-music', kind: 'music', name: 'Müzik', path: music, start: 0, duration: 52, trimStart: 0, volume: .3, fadeIn: 1, fadeOut: 2 }];
    project.audio.musicDucking = true; projects.update(project);

    const settings = { ...(await import('../../shared/defaults.js')).defaultSettings(directory), exportPreset: 'standard' as const, outputPath: directory };
    const renderer = new RenderService(projects, exports, ffmpeg, new AudioService(ffmpeg), new SubtitleService(), () => settings, () => undefined, new Logger(join(directory, 'logs')));
    const started = await renderer.start(project.id);
    const deadline = Date.now() + 900_000;
    while (Date.now() < deadline) { const current = exports.get(started.id); if (['completed', 'failed', 'cancelled'].includes(current.status)) break; await new Promise((resolve) => setTimeout(resolve, 500)); }
    const record = exports.get(started.id);
    expect(record.error).toBeUndefined(); expect(record.status).toBe('completed'); expect(existsSync(record.outputPath)).toBe(true);

    // --- Süre ve kare sayısı: dışa aktarım paylaşılan zaman modelini izlemeli ---
    const expectedDuration = totalDuration(project.scenes);
    expect(expectedDuration).toBeCloseTo(52, 6);
    const probe = JSON.parse((await execFileAsync(ffmpeg.ffprobePath, ['-v', 'error', '-count_frames', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,duration,sample_rate,channels', '-of', 'json', record.outputPath])).stdout) as { format: { duration: string }; streams: Array<Record<string, string | number>> };
    const video = probe.streams.find((stream) => stream.codec_type === 'video')!;
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio')!;
    const expectedFrames = Math.ceil(expectedDuration * 30 - 1e-9);
    expect(Number(video.nb_read_frames)).toBe(expectedFrames);
    expect(video.r_frame_rate).toBe('30/1'); expect(video.width).toBe(1080); expect(video.height).toBe(1920);
    expect(audio.codec_name).toBe('aac'); expect(Number(audio.sample_rate)).toBe(48000);
    expect(Math.abs(Number(probe.format.duration) - expectedDuration)).toBeLessThan(.4);

    // --- Sahne sınırları: MP4 kareleri paylaşılan zaman çizelgesiyle aynı sahneyi göstermeli ---
    const evidence = join(directory, 'evidence'); await mkdir(evidence, { recursive: true });
    const boundaryReport: Array<Record<string, unknown>> = [];
    const probes = [
      { label: 'scene1-start', time: 0.4, scene: 0 },
      { label: 'scene1-end', time: 8.8, scene: 0 },
      { label: 'scene2-start', time: 10.6, scene: 1 },
      { label: 'scene2-mid', time: 17.0, scene: 1 },
      { label: 'scene3-start', time: 25.0, scene: 2 },
      { label: 'scene3-mid', time: 30.0, scene: 2 },
      { label: 'scene4-start', time: 38.5, scene: 3 },
      { label: 'scene4-mid', time: 45.0, scene: 3 },
      { label: 'final', time: 51.5, scene: 3 },
    ];
    for (const probeCase of probes) {
      // Önizleme kararı: paylaşılan zaman çizelgesi.
      const previewIndex = sceneIndexAt(timeline, probeCase.time);
      expect(previewIndex, `${probeCase.label} sahne seçimi`).toBe(probeCase.scene);
      const mp4Frame = join(evidence, `${probeCase.label}-mp4.png`);
      const previewFrame = join(evidence, `${probeCase.label}-preview.png`);
      await ffmpeg.run(`parity-frame-${probeCase.label}`, ['-ss', String(probeCase.time), '-i', record.outputPath, '-frames:v', '1', '-update', '1', mp4Frame]);
      const scene = project.scenes[probeCase.scene];
      const localTime = probeCase.time - timeline.starts[probeCase.scene];
      await sharp(Buffer.from(renderAnimatedSceneSvg(project, scene, DEFAULT_IDENTITY, localTime))).resize(1080, 1920).png().toFile(previewFrame);
      // Aynı zaman damgasında önizleme SVG'si ile MP4 karesi görsel olarak örtüşmeli.
      const difference = await meanDifference(mp4Frame, previewFrame);
      boundaryReport.push({ ...probeCase, previewIndex, localTime: Number(localTime.toFixed(3)), meanPixelDifference: Number(difference.toFixed(4)) });
      expect(difference, `${probeCase.label} önizleme/MP4 farkı`).toBeLessThan(26);
      // Sahnenin kendisi hareket etmeli: aynı sahnenin iki karesi farklı olmalı.
      const movedFrame = join(evidence, `${probeCase.label}-mp4-later.png`);
      await ffmpeg.run(`parity-frame-later-${probeCase.label}`, ['-ss', String(Math.min(probeCase.time + 1.2, expectedDuration - .2)), '-i', record.outputPath, '-frames:v', '1', '-update', '1', movedFrame]);
      expect(await meanDifference(mp4Frame, movedFrame), `${probeCase.label} MP4 nesne hareketi`).toBeGreaterThan(1);
    }

    // --- Geçiş penceresi: paylaşılan geçiş anı dışa aktarımla aynı olmalı ---
    const transitionWindows: Array<Record<string, unknown>> = []; const blackFrameReport: Array<Record<string, unknown>> = [];
    for (const index of [1, 2, 3]) {
      const state = transitionAt(timeline, timeline.starts[index] + CROSSFADE_SECONDS / 2);
      expect(state, `sahne ${index + 1} geçişi`).toBeTruthy();
      expect(state!.incomingIndex).toBe(index);
      expect(state!.progress).toBeCloseTo(.5, 5);
      // xfade penceresinin ortasında iki sahnenin karışımı görünür: kare, her iki
      // sahnenin saf karelerinden farklı olmalı.
      const blend = join(evidence, `transition-${index}-blend.png`);
      const incomingOnly = join(evidence, `transition-${index}-incoming.png`);
      await ffmpeg.run(`parity-transition-${index}`, ['-ss', String(timeline.starts[index] + CROSSFADE_SECONDS / 2), '-i', record.outputPath, '-frames:v', '1', '-update', '1', blend]);
      await sharp(Buffer.from(renderAnimatedSceneSvg(project, project.scenes[index], DEFAULT_IDENTITY, CROSSFADE_SECONDS / 2))).resize(1080, 1920).png().toFile(incomingOnly);
      const outgoingOnly = join(evidence, `transition-${index}-outgoing.png`);
      await sharp(Buffer.from(renderAnimatedSceneSvg(project, project.scenes[index - 1], DEFAULT_IDENTITY, timeline.starts[index] + CROSSFADE_SECONDS / 2))).resize(1080, 1920).png().toFile(outgoingOnly);
      // --- Siyah kare denetimi: geçiş penceresinin HİÇBİR karesi kararmamalı ---
      const luminance: Array<{ time: number; value: number }> = [];
      for (let step = -4; step <= 12; step += 1) {
        const sampleTime = timeline.starts[index] + step * .04;
        if (sampleTime <= 0 || sampleTime >= expectedDuration - .05) continue;
        const framePath = join(evidence, `transition-${index}-luma-${step}.png`);
        await ffmpeg.run(`parity-luma-${index}-${step}`, ['-ss', String(sampleTime.toFixed(3)), '-i', record.outputPath, '-frames:v', '1', '-vf', 'scale=108:192', '-update', '1', framePath]);
        luminance.push({ time: Number(sampleTime.toFixed(3)), value: await meanLuminance(framePath) });
      }
      const beforeFrames = luminance.filter((sample) => sample.time <= timeline.starts[index]);
      const afterFrames = luminance.filter((sample) => sample.time >= timeline.starts[index] + CROSSFADE_SECONDS);
      expect(beforeFrames.length).toBeGreaterThan(0); expect(afterFrames.length).toBeGreaterThan(0);
      const baseline = Math.min(...[...beforeFrames, ...afterFrames].map((sample) => sample.value));
      // En düşük geçiş karesi, komşu sahnelerin parlaklığının %60'ının altına düşmemeli.
      const darkest = luminance.reduce((min, sample) => sample.value < min.value ? sample : min);
      blackFrameReport.push({ scene: index + 1, type: project.scenes[index].transition, baselineLuminance: Number(baseline.toFixed(2)), darkest: { ...darkest, value: Number(darkest.value.toFixed(2)) }, samples: luminance.map((sample) => ({ time: sample.time, value: Number(sample.value.toFixed(2)) })) });
      expect(darkest.value, `sahne ${index + 1} geçişinde siyah kare (t=${darkest.time})`).toBeGreaterThan(baseline * .6);
      const toIncoming = await meanDifference(blend, incomingOnly);
      const toOutgoing = await meanDifference(blend, outgoingOnly);
      transitionWindows.push({ scene: index + 1, type: project.scenes[index].transition, progress: state!.progress, differenceToIncoming: Number(toIncoming.toFixed(4)), differenceToOutgoing: Number(toOutgoing.toFixed(4)) });
      expect(toIncoming).toBeGreaterThan(0);
      expect(toOutgoing).toBeGreaterThan(0);
    }

    // --- Altyazı zamanlaması: ASS dosyası mutlak proje zamanlarını taşımalı ---
    const assPath = join(evidence, 'subtitles.ass');
    await new SubtitleService().write(project, assPath);
    const ass = await readFile(assPath, 'utf8');
    const dialogues = ass.split('\n').filter((line) => line.startsWith('Dialogue:'));
    const allCues = project.scenes.flatMap((scene) => scene.subtitles).sort((a, b) => a.start - b.start);
    expect(dialogues).toHaveLength(allCues.length);
    const toSeconds = (value: string) => { const [h, m, rest] = value.split(':'); const [s, cs] = rest.split('.'); return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(cs) / 100; };
    dialogues.forEach((line, index) => {
      const fields = line.replace('Dialogue: ', '').split(',');
      expect(toSeconds(fields[1])).toBeCloseTo(allCues[index].start, 1);
      expect(toSeconds(fields[2])).toBeCloseTo(allCues[index].end, 1);
    });
    // Son altyazı proje süresini aşmamalı; son sahnenin tüm satırları birleşince anlatım tam olmalı.
    expect(allCues.at(-1)!.end).toBeLessThanOrEqual(expectedDuration + .05);
    const tailText = allCues.filter((cue) => cue.start >= timeline.starts[3] - .01).map((cue) => cue.text).join(' ');
    expect(tailText).toBe(project.scenes[3].narration);

    retainVerificationArtifacts(record.outputPath, 'build20-parity/buz-52s.mp4');
    retainVerificationArtifacts(evidence, 'build20-parity/evidence', true);
    await writeFile(join(evidence, 'parity-report.json'), JSON.stringify({
      ok: true, projectDuration: expectedDuration, scenes: project.scenes.length, expectedFrames,
      decodedFrames: Number(video.nb_read_frames), containerDuration: Number(probe.format.duration),
      video: { width: video.width, height: video.height, fps: video.r_frame_rate, codec: video.codec_name },
      audio: { codec: audio.codec_name, sampleRate: audio.sample_rate, channels: audio.channels },
      transitions: project.scenes.map((scene) => ({ number: scene.number, duration: scene.duration, transition: scene.transition, preset: scene.animation?.preset })),
      boundaryReport, transitionWindows, blackFrameReport, subtitleCues: allCues.length, subtitleRange: { start: allCues[0].start, end: allCues.at(-1)!.end },
      mp4: retainVerificationArtifacts(record.outputPath, 'build20-parity/buz-52s.mp4'),
    }, null, 2), 'utf8');
    retainVerificationArtifacts(join(evidence, 'parity-report.json'), 'build20-parity/evidence/parity-report.json');
    expect(verificationDir('build20-parity')).toContain('.verification');
    db.close();
  }, 1_200_000);
});
