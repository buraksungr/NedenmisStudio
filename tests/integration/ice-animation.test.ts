import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { ExportRepository } from '../../electron/main/infrastructure/database/ExportRepository.js';
import { FFmpegService } from '../../electron/main/infrastructure/FFmpegService.js';
import { Logger } from '../../electron/main/infrastructure/Logger.js';
import { AudioService } from '../../electron/main/services/audio/AudioService.js';
import { SubtitleService } from '../../electron/main/services/subtitle/SubtitleService.js';
import { RenderService } from '../../electron/main/services/render/RenderService.js';
import { DEFAULT_IDENTITY, defaultSettings, sceneStartTimes, totalDuration } from '../../shared/index.js';
import { projectInput } from '../helpers.js';
import { createIceAnimationProject, ICE_TEST_PROJECT_NAME } from '../fixtures/iceAnimationProject.js';

const execFileAsync = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'nedenmis-ice-animation-'));
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

async function objectPixels(path: string): Promise<Buffer> {
  return sharp(path).removeAlpha().raw().toBuffer();
}
function difference(a: Buffer, b: Buffer): number {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += Math.abs(a[index] - b[index]);
  return total / a.length;
}

class DiagnosticFFmpegService extends FFmpegService {
  readonly diagnostics: unknown[] = [];
  constructor() { super(() => process.env.NEDENMIS_FFMPEG_PATH); }
  private async capture(jobId: string, args: string[]): Promise<void> {
    const stage = jobId.match(/-(scene-\d+|visual|final)$/)?.[1]; const outputPath = args.at(-1)!;
    if (!stage || !outputPath.endsWith('.mp4') || !existsSync(outputPath)) return;
    const { stdout } = await execFileAsync(this.ffprobePath, ['-v', 'error', '-count_frames', '-show_entries', 'format=duration:stream=codec_type,nb_read_frames,duration,r_frame_rate', '-of', 'json', outputPath]);
    this.diagnostics.push({ stage, outputPath, args, probe: JSON.parse(stdout) });
  }
  override async run(jobId: string, args: string[], options?: Parameters<FFmpegService['run']>[2]): Promise<void> { await super.run(jobId, args, options); await this.capture(jobId, args); }
  override async runWithInput(jobId: string, args: string[], input: Parameters<FFmpegService['runWithInput']>[2], options?: Parameters<FFmpegService['runWithInput']>[3]): Promise<void> { await super.runWithInput(jobId, args, input, options); await this.capture(jobId, args); }
}

describe('Why does ice float on water? — dört gerçek animasyon sahnesi', () => {
  it('CPU karelerini, MP4 piksel hareketini, H.264/AAC ve anlatım/altyazı zamanını doğrular', async () => {
    const db = new AppDatabase(':memory:'); const projects = new ProjectRepository(db); const exports = new ExportRepository(db); const ffmpeg = new DiagnosticFFmpegService();
    const fixture = createIceAnimationProject(1.2);
    const project = projects.create(projectInput({ name: ICE_TEST_PROJECT_NAME, topic: ICE_TEST_PROJECT_NAME, targetDuration: totalDuration(fixture.scenes) }));
    project.scenes = fixture.scenes; project.script = fixture.script;
    const transitions = ['none', 'fade', 'dissolve', 'slide'] as const;
    project.scenes.forEach((scene, index) => { scene.transition = transitions[index]; });
    expect(project.scenes).toHaveLength(4);
    expect(new Set(project.scenes.map((scene) => scene.animation?.preset)).size).toBe(4);
    expect(project.scenes.every((scene) => !scene.assetPath && scene.cameraMovement === 'static')).toBe(true);
    for (let index = 0; index < project.scenes.length; index += 1) {
      const narrationPath = join(directory, `ice-narration-${index}.wav`);
      await ffmpeg.run(`ice-tone-${index}`, ['-f', 'lavfi', '-i', `sine=frequency=${330 + index * 90}:duration=1`, '-c:a', 'pcm_s16le', narrationPath]);
      project.scenes[index].narrationPath = narrationPath;
    }
    project.status = 'ready'; projects.update(project);
    const settings = defaultSettings(directory); settings.exportPreset = 'standard'; settings.outputPath = directory;
    const renderer = new RenderService(projects, exports, ffmpeg, new AudioService(ffmpeg), new SubtitleService(), () => settings, () => undefined, new Logger(join(directory, 'logs')), () => DEFAULT_IDENTITY);
    const started = await renderer.start(project.id); const deadline = Date.now() + 220000;
    while (Date.now() < deadline) {
      const status = exports.get(started.id).status;
      if (['completed', 'failed', 'cancelled'].includes(status)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const record = exports.get(started.id);
    if (process.env.NEDENMIS_ANIMATION_DIAGNOSTICS) { await mkdir(dirname(process.env.NEDENMIS_ANIMATION_DIAGNOSTICS), { recursive: true }); await writeFile(process.env.NEDENMIS_ANIMATION_DIAGNOSTICS, JSON.stringify({ status: record.status, error: record.error, stages: ffmpeg.diagnostics }, null, 2), 'utf8'); }
    if (process.env.NEDENMIS_ANIMATION_OUTPUT && existsSync(record.outputPath)) { await mkdir(dirname(process.env.NEDENMIS_ANIMATION_OUTPUT), { recursive: true }); await copyFile(record.outputPath, process.env.NEDENMIS_ANIMATION_OUTPUT); }
    expect(record.error).toBeUndefined(); expect(record.status).toBe('completed');
    const probe = await ffmpeg.probe(record.outputPath);
    expect(probe).toMatchObject({ width: 1080, height: 1920, codec: 'h264' });
    expect(probe.duration).toBeGreaterThan(4.5); expect(probe.duration).toBeLessThan(5.1);
    const streams = await execFileAsync(ffmpeg.ffprobePath, ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,r_frame_rate,avg_frame_rate,nb_read_frames,duration,sample_rate', '-of', 'json', record.outputPath]);
    expect(streams.stdout).toContain('"codec_name": "aac"'); expect(streams.stdout).toContain('"r_frame_rate": "30/1"');
    const streamInfo = JSON.parse(streams.stdout) as { streams: { codec_type: string; nb_read_frames?: string; duration?: string; avg_frame_rate?: string }[] };
    const videoStream = streamInfo.streams.find((stream) => stream.codec_type === 'video')!;
    const expectedFrames = Math.max(1, Math.ceil(totalDuration(project.scenes) * 30 - 1e-9));
    expect(videoStream.nb_read_frames).toBe(String(expectedFrames)); expect(videoStream.avg_frame_rate).toBe('30/1');
    expect(Number(videoStream.duration)).toBeCloseTo(expectedFrames / 30, 2);
    const starts = sceneStartTimes(project.scenes);
    project.scenes.forEach((scene, index) => {
      expect(scene.narrationDuration).toBe(1);
      expect(scene.subtitles.length).toBeGreaterThan(0);
      scene.subtitles.forEach((cue) => {
        expect(cue.start).toBeGreaterThanOrEqual(starts[index]);
        expect(cue.end).toBeLessThanOrEqual(starts[index] + scene.duration + .01);
        expect(cue.end).toBeGreaterThan(cue.start);
      });
    });

    const sceneResults: { scene: number; preset?: string; meanPixelDifference: number; firstTime: number; secondTime: number }[] = [];
    const firstFrames: Buffer[] = [];
    for (let index = 0; index < 4; index += 1) {
      const times = [starts[index] + .4, starts[index] + 1.05];
      const frames: Buffer[] = [];
      for (let sample = 0; sample < 2; sample += 1) {
        const path = join(directory, `ice-motion-${index}-${sample}.png`);
        const extraction = await execFileAsync(ffmpeg.ffmpegPath, ['-hide_banner', '-y', '-ss', String(times[sample]), '-i', record.outputPath, '-frames:v', '1', '-vf', 'crop=920:1000:80:420,scale=460:500', '-update', '1', path], { maxBuffer: 5 * 1024 * 1024 });
        if (!existsSync(path)) throw new Error(`MP4 karesi oluşmadı (${index + 1}/${sample + 1}): ${extraction.stderr}`);
        frames.push(await objectPixels(path));
      }
      firstFrames.push(frames[0]);
      const meanPixelDifference = difference(frames[0], frames[1]);
      expect(meanPixelDifference, `Sahne ${index + 1} gerçek nesne hareketi`).toBeGreaterThan(.4);
      sceneResults.push({ scene: index + 1, preset: project.scenes[index].animation?.preset, meanPixelDifference, firstTime: times[0], secondTime: times[1] });
    }
    for (let index = 1; index < firstFrames.length; index += 1) expect(difference(firstFrames[0], firstFrames[index]), `Sahne 1 ve ${index + 1} farklı kompozisyon`).toBeGreaterThan(1);

    const result = {
      projectName: ICE_TEST_PROJECT_NAME,
      status: 'passed',
      pipeline: 'Shared procedural SVG timeline → Sharp CPU RGBA frames → FFmpeg rawvideo/libx264',
      cameraMovement: 'static (pixel movement cannot come from zoom or pan)',
      video: { width: probe.width, height: probe.height, codec: probe.codec, durationSeconds: probe.duration, fps: 30, audioCodec: 'aac', expectedFrames, decodedFrames: Number(videoStream.nb_read_frames), videoStreamDuration: Number(videoStream.duration) },
      narrationFixture: 'Four known-duration PCM signals; perceptual speech quality is not claimed by this test',
      scenes: sceneResults,
      subtitleTiming: 'Every cue is bounded by its scene; scene starts match narration mix offsets',
      outputPath: process.env.NEDENMIS_ANIMATION_OUTPUT || undefined,
    };
    if (process.env.NEDENMIS_ANIMATION_RESULT) { await mkdir(dirname(process.env.NEDENMIS_ANIMATION_RESULT), { recursive: true }); await writeFile(process.env.NEDENMIS_ANIMATION_RESULT, JSON.stringify(result, null, 2), 'utf8'); }
    db.close();
  }, 240000);
});
