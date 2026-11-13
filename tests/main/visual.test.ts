import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ProceduralVisualProvider, buildProceduralSvg } from '../../electron/main/services/visual/ProceduralVisualProvider.js';
import { DEFAULT_IDENTITY, generateSubtitleCues, id } from '../../shared/index.js';
import { sampleProject } from '../helpers.js';

const directory = await mkdtemp(join(tmpdir(), 'nedenmis-visual-')); afterAll(() => rm(directory, { recursive: true, force: true }));
describe('Prosedürel görsel motoru', () => {
  it('anlatıma özel saçılım diyagramı ve Türkçe kanal etiketi üretir', () => { const project = sampleProject(); const scene = { id: id('scene'), number: 1, narration: 'Güneş ışığı atmosferde saçılır ve mavi görünür.', visualDescription: 'Işık saçılımı', visualPrompt: '', duration: 3, assetType: 'procedural' as const, transition: 'fade' as const, cameraMovement: 'zoom-in' as const, subtitles: generateSubtitleCues('Işık saçılır.', 3), subtitleTiming: 'estimated' as const, status: 'empty' as const }; const svg = buildProceduralSvg(project, scene, DEFAULT_IDENTITY); expect(svg).toContain('MAVİ SAÇILIM'); expect(svg).toContain('NEDENMİŞ'); expect(svg).toContain('1080'); });
  it('CPU ile gerçek 1080×1920 PNG üretir', async () => { const project = sampleProject(); const scene = { id: id('scene'), number: 1, narration: 'Ay sürekli aynı yüzünü gösterir.', visualDescription: 'Ay yörüngesi', visualPrompt: '', duration: 3, assetType: 'procedural' as const, transition: 'fade' as const, cameraMovement: 'zoom-in' as const, subtitles: [], subtitleTiming: 'estimated' as const, status: 'empty' as const }; const path = join(directory, 'scene.png'); await new ProceduralVisualProvider().generate(project, scene, DEFAULT_IDENTITY, path); const metadata = await sharp(path).metadata(); expect(metadata.width).toBe(1080); expect(metadata.height).toBe(1920); expect((await stat(path)).size).toBeGreaterThan(20000); expect((await readFile(path)).subarray(1, 4).toString()).toBe('PNG'); });
});
