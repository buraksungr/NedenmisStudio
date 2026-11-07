import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { ExportRepository } from '../../electron/main/infrastructure/database/ExportRepository.js';
import { FFmpegService } from '../../electron/main/infrastructure/FFmpegService.js';
import { Logger } from '../../electron/main/infrastructure/Logger.js';
import { AudioService } from '../../electron/main/services/audio/AudioService.js';
import { SubtitleService } from '../../electron/main/services/subtitle/SubtitleService.js';
import { RenderService } from '../../electron/main/services/render/RenderService.js';
import { ProceduralVisualProvider } from '../../electron/main/services/visual/ProceduralVisualProvider.js';
import { DEFAULT_IDENTITY, defaultSettings, generateSubtitleCues, id } from '../../shared/index.js';
import type { Scene } from '../../shared/types.js';
import { projectInput } from '../helpers.js';

const directory = await mkdtemp(join(tmpdir(), 'nedenmis-render-')); afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
describe('Uçtan uca örnek MP4 render', () => {
  it('iki görsel sahne, anlatım, altyazı ve geçişle 1080×1920 H.264/AAC üretir', async () => {
    const db = new AppDatabase(':memory:'); const projects = new ProjectRepository(db); const exports = new ExportRepository(db); const ffmpeg = new FFmpegService(() => undefined); const project = projects.create(projectInput({ targetDuration: 3 }));
    const visual = new ProceduralVisualProvider(); const scenes: Scene[] = [];
    for (let index = 0; index < 2; index += 1) {
      const sceneId = id('scene'); const imagePath = join(directory, `scene-${index}.png`); const narrationPath = join(directory, `narration-${index}.wav`); const narration = index === 0 ? 'Güneş ışığı atmosfere girer.' : 'Mavi ışık daha fazla saçılır.';
      const scene: Scene = { id: sceneId, number: index + 1, narration, visualDescription: 'Işık saçılımı', visualPrompt: '', assetType: 'procedural', duration: 1.2, transition: index === 0 ? 'fade' : 'dissolve', cameraMovement: index === 0 ? 'zoom-in' : 'pan-right', subtitles: generateSubtitleCues(narration, 1.2, index * 1.2), subtitleTiming: 'estimated', status: 'ready' };
      await visual.generate(project, scene, DEFAULT_IDENTITY, imagePath); await ffmpeg.run(`test-render-tone-${index}`, ['-f', 'lavfi', '-i', `sine=frequency=${440 + index * 110}:duration=1.1`, '-c:a', 'pcm_s16le', narrationPath]);
      scene.assetPath = imagePath; scene.narrationPath = narrationPath; scene.narrationDuration = 1.1; scenes.push(scene);
    }
    project.scenes = scenes; project.status = 'ready'; projects.update(project);
    const settings = defaultSettings(directory); settings.exportPreset = 'standard'; settings.outputPath = directory;
    const renderer = new RenderService(projects, exports, ffmpeg, new AudioService(ffmpeg), new SubtitleService(), () => settings, () => undefined, new Logger(join(directory, 'logs')));
    const started = await renderer.start(project.id); const deadline = Date.now() + 110000;
    while (Date.now() < deadline) { const status = exports.get(started.id).status; if (['completed', 'failed', 'cancelled'].includes(status)) break; await new Promise((resolve) => setTimeout(resolve, 300)); }
    const record = exports.get(started.id); expect(record.error).toBeUndefined(); expect(record.status).toBe('completed'); expect(record.progress).toBe(100);
    const probe = await ffmpeg.probe(record.outputPath); expect(probe.width).toBe(1080); expect(probe.height).toBe(1920); expect(probe.codec).toBe('h264'); expect(probe.duration).toBeGreaterThan(2); expect((await stat(record.outputPath)).size).toBeGreaterThan(20000);
    expect(projects.get(project.id).status).toBe('completed'); db.close();
  }, 120000);
});
