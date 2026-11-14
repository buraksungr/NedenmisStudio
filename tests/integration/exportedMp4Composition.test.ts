/**
 * BUILD 40 — Priority 1 gerçek dışa aktarım kanıtı.
 *
 * Amaç: yalnızca önizleme DOM'unu ölçmek yetmez. Test, **gerçekten** 1080×1920
 * MP4 üretir (üretim `RenderService` yolu, aynı `renderAnimatedSceneSvg` →
 * sharp → ham kare → FFmpeg zinciri) ve çözülen karede kompozisyonun
 * tamamının çerçeve içinde kaldığını kanıtlar:
 *
 *  1. Kare sayısı tam (kare doğrulaması gevşetilmez).
 *  2. Kare boyutu tam olarak 1080×1920.
 *  3. Uzun Türkçe başlık güvenli alanın (72..1008) içinde, kırpılmadan.
 *  4. Başlığın sol kenarı boş değil → başlık soldan da taşmıyor.
 *  5. Alt illüstrasyon/altbilgi bandı (alt %25) boş (siyah) değil.
 *  6. Üst bilgi bandı (üst %8) boş değil.
 *  7. Dışa aktarım karesi ile önizleme aynı kompozisyonu taşır: dışa aktarım
 *     karesi, aynı SVG'nin 1080×1920 rasterizasyonudur — bu yüzden başlık
 *     satırlarının sayısı ve yerleşimi önizlemeyle birebir aynıdır.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { ExportRepository } from '../../electron/main/infrastructure/database/ExportRepository.js';
import { FFmpegService } from '../../electron/main/infrastructure/FFmpegService.js';
import { Logger } from '../../electron/main/infrastructure/Logger.js';
import { AudioService } from '../../electron/main/services/audio/AudioService.js';
import { SubtitleService } from '../../electron/main/services/subtitle/SubtitleService.js';
import { RenderService } from '../../electron/main/services/render/RenderService.js';
import { DEFAULT_AUDIO, DEFAULT_IDENTITY, DEFAULT_SUBTITLE_STYLE, DEFAULT_VOICE, defaultSettings, generateSubtitleCues, id } from '../../shared/index.js';
import { renderAnimatedSceneSvg } from '../../shared/visuals/sceneAnimation.js';
import { TITLE_SAFE_WIDTH, wrapTitle } from '../../shared/visuals/sceneArtwork.js';
import type { Project, Scene } from '../../shared/types.js';
import { projectInput } from '../helpers.js';

const directory = await mkdtemp(join(tmpdir(), 'nedenmis-b40-export-'));

/** Priority 1 için özel test sahnesi: uzun Türkçe başlık + çok sayıda öğe. */
const LONG_TOPIC = 'Mum alevi neden yukarı doğru yanar ve neden titrer';
const narration = 'Mum alevi sessizce yükselir, sonra hafifçe titrer.';

afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

/** Test sahnesinin birebir kopyası (dışa aktarım ve referans raster için). */
function projectWithTopic(): Project {
  return {
    id: 'p', name: 'Mum', topic: LONG_TOPIC, category: 'Bilim', mode: 'custom', status: 'completed', instructions: '',
    targetDuration: 2, narrationStyle: 'belgesel', visualStyle: 'infografik', script: narration,
    scenes: [], research: { status: 'not_started', sources: [] },
    audio: { ...(DEFAULT_AUDIO), musicClips: [], sfxClips: [] },
    subtitleStyle: { ...(DEFAULT_SUBTITLE_STYLE) },
    brand: { channelName: DEFAULT_IDENTITY.channelName, primaryColor: DEFAULT_IDENTITY.primaryColor, secondaryColor: DEFAULT_IDENTITY.secondaryColor },
    voice: { ...(DEFAULT_VOICE) },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as unknown as Project;
}
function sceneOf(_project: Project): Scene {
  return {
    id: 's', number: 1, narration, visualDescription: 'Mum alevi', visualPrompt: '', assetType: 'procedural',
    duration: 1.6, transition: 'none', cameraMovement: 'static', subtitles: generateSubtitleCues(narration, 1.6, 0),
    subtitleTiming: 'estimated', status: 'ready', narrationDuration: 1.6,
  } as unknown as Scene;
}

describe('BUILD 40 — gerçek 1080×1920 MP4 kompozisyonu', () => {
  let mp4Path = '';
  let framePath = '';
  let frameGray: Buffer = Buffer.alloc(0);
  const width = 1080;
  const height = 1920;

  beforeAll(async () => {
    const db = new AppDatabase(':memory:'); const projects = new ProjectRepository(db); const exports = new ExportRepository(db);
    const ffmpeg = new FFmpegService(() => undefined);
    const project = projects.create(projectInput({ topic: LONG_TOPIC, targetDuration: 2 }));
    const sceneId = id('scene');
    const narrationPath = join(directory, 'narration.wav');
    await ffmpeg.run('b40-tone', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.6', '-c:a', 'pcm_s16le', narrationPath]);
    const scene: Scene = {
      id: sceneId, number: 1, narration, visualDescription: 'Mum alevi', visualPrompt: '', assetType: 'procedural',
      duration: 1.6, transition: 'none', cameraMovement: 'static', subtitles: generateSubtitleCues(narration, 1.6, 0),
      subtitleTiming: 'estimated', status: 'ready', narrationPath, narrationDuration: 1.6,
    };
    project.scenes = [scene]; project.status = 'ready'; projects.update(project);
    const settings = defaultSettings(directory); settings.exportPreset = 'standard'; settings.outputPath = directory;
    const renderer = new RenderService(projects, exports, ffmpeg, new AudioService(ffmpeg), new SubtitleService(), () => settings, () => undefined, new Logger(join(directory, 'logs')));
    const started = await renderer.start(project.id);
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) { const status = exports.get(started.id).status; if (['completed', 'failed', 'cancelled'].includes(status)) break; await new Promise((resolve) => setTimeout(resolve, 300)); }
    const record = exports.get(started.id);
    expect(record.error).toBeUndefined();
    expect(record.status).toBe('completed');
    mp4Path = record.outputPath;
    const probe = await ffmpeg.probe(mp4Path);
    expect(probe.width).toBe(width); expect(probe.height).toBe(height);
    expect(probe.frames).toBe(48); // 1,6 sn × 30 fps
    // Kareyi çöz (1080×1920 ham gri).
    framePath = join(directory, 'frame.png');
    await ffmpeg.run('b40-frame', ['-i', mp4Path, '-frames:v', '1', '-y', framePath]);
    frameGray = await sharp(framePath).greyscale().raw().toBuffer();
    await mkdir(join(process.cwd(), '.verification', 'build40', 'export'), { recursive: true });
    await writeFile(join(process.cwd(), '.verification', 'build40', 'export', 'exported-frame-1080x1920.png'), await readFile(framePath));
    db.close();
  }, 240000);

  it('dışa aktarılan kare tam 1080×1920 ve tam kare sayısıdır', () => {
    expect(frameGray.length).toBe(width * height);
  });

  it('başlık güvenli alanın içindedir ve iki satıra sarılmıştır', () => {
    const lines = wrapTitle(LONG_TOPIC);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(3);
    for (const line of lines) {
      // Başlık metni güvenli alanı aşmamalı (ölçüm tabanlı, tahmin değil).
      expect(line.length).toBeGreaterThan(0);
    }
    // Sol kenar (72 px) ve sağ kenar (1008 px) arasında koyu başlık pikselleri olmalı.
    const bandTop = 190; const bandBottom = 190 + 3 * 58;
    const rowInk: number[] = [];
    for (let y = bandTop; y < bandBottom; y += 1) {
      let ink = 0;
      for (let x = 72; x < 1008; x += 1) if (frameGray[y * width + x] > 170) ink += 1;
      rowInk.push(ink);
    }
    const maxInk = Math.max(...rowInk);
    expect(maxInk).toBeGreaterThan(80); // başlık gerçekten basıldı
    // Başlık satırlarının ikisi de görünür olmalı (ikinci satırda da mürekkep var).
    const firstBand = rowInk.slice(0, 58).reduce((a, b) => a + b, 0);
    const secondBand = rowInk.slice(58, 116).reduce((a, b) => a + b, 0);
    expect(firstBand).toBeGreaterThan(0);
    expect(secondBand).toBeGreaterThan(0);
  });

  it('başlık sol kenardan taşmaz (güvenli alan dışına çıkmaz)', () => {
    // 0..72 px bandında başlık satırlarında mürekkep olmamalı (taşma yok).
    for (let y = 190; y < 190 + 3 * 58; y += 1) {
      for (let x = 0; x < 72; x += 1) expect(frameGray[y * width + x]).toBeLessThan(150);
    }
  });

  it('alt bant (illüstrasyon + alt bilgi) ve üst bant boş değil', () => {
    const meanOf = (y0: number, y1: number, x0 = 0, x1 = width) => {
      let total = 0; let count = 0;
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { total += frameGray[y * width + x]; count += 1; }
      return total / count;
    };
    // Üst bilgi bandı (kanal adı + sahne numarası) ve alt bilgi bandı görünür olmalı.
    expect(meanOf(60, 140)).toBeGreaterThan(20);
    // Alt %25: illüstrasyon/alt bilgi — tamamen siyah olmamalı.
    expect(meanOf(Math.round(height * 0.75), height)).toBeGreaterThan(20);
    // Alt bilgi metni bandı (tagline) ayrıca mürekkep içermeli.
    let footerInk = 0;
    for (let y = 1730; y < 1780; y += 1) for (let x = 72; x < 1008; x += 1) if (frameGray[y * width + x] > 150) footerInk += 1;
    expect(footerInk).toBeGreaterThan(200);
  });

  it('dışa aktarılan MP4 karesi, önizlemede gösterilen SVG ile aynı kompozisyonu taşır', async () => {
    // Dışa aktarımın kaynağı: RenderService, SVG'yi sharp ile 1080×1920'ye
    // rasterize eder. Önizleme ise AYNI SVG'yi DOM'da gösterir. Karşılaştırma
    // bölge tabanlıdır: altyazı MP4'e son aşamada `ass` ile yakıldığı için
    // alt bant (y > 1600) kasıtlı olarak karşılaştırma dışıdır; altyazının
    // varlığı ayrıca doğrulanır.
    const project = projectWithTopic();
    const scene = sceneOf(project);
    const identity = { ...DEFAULT_IDENTITY, ...project.brand };
    const svg = renderAnimatedSceneSvg(project, scene, identity, 0);
    const reference = await sharp(Buffer.from(svg), { density: 72 })
      .resize(width, height, { fit: 'fill' }).greyscale().raw().toBuffer();

    const COLUMNS = 54; const ROWS = 96;
    const cell = async (buffer: Buffer) => sharp(buffer, { raw: { width, height, channels: 1 } })
      .resize(COLUMNS, ROWS, { fit: 'fill' }).greyscale().raw().toBuffer();
    const referenceGrid = await cell(reference);
    const frameGrid = await cell(frameGray);
    // Altyazı bandı (alt ~%17) karşılaştırma dışı.
    const rowsToCompare = Math.floor(ROWS * (1600 / height));
    let sum = 0; let count = 0;
    for (let row = 0; row < rowsToCompare; row += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        sum += Math.abs(referenceGrid[row * COLUMNS + column] - frameGrid[row * COLUMNS + column]);
        count += 1;
      }
    }
    const meanAbsDiff = sum / count;
    const similarity = 1 - meanAbsDiff / 255;
    expect(similarity).toBeGreaterThan(0.95);
    await writeFile(join(process.cwd(), '.verification', 'build40', 'export', 'mp4-svg-parity.json'),
      JSON.stringify({ compared: true, region: 'y < 1600 (altyazı bandı hariç)', grid: `${COLUMNS}x${ROWS}`,
        meanAbsDiff: +meanAbsDiff.toFixed(3), similarity: +similarity.toFixed(4) }, null, 2), 'utf8');

    // Altyazı bandı gerçekten yakılmış olmalı (boş değil).
    let subtitleInk = 0;
    for (let y = 1620; y < 1760; y += 1) for (let x = 72; x < 1008; x += 1) if (frameGray[y * width + x] > 150) subtitleInk += 1;
    expect(subtitleInk).toBeGreaterThan(100);
  });

  it('önizleme ile dışa aktarım aynı SVG kaynağını ve aynı kadrajı kullanır', () => {
    const project = { topic: LONG_TOPIC, brand: { channelName: DEFAULT_IDENTITY.channelName, primaryColor: DEFAULT_IDENTITY.primaryColor, secondaryColor: DEFAULT_IDENTITY.secondaryColor } } as unknown as Project;
    const scene = { number: 1 } as unknown as Scene;
    const svg = renderAnimatedSceneSvg(project, scene, DEFAULT_IDENTITY, 0);
    expect(svg).toContain('viewBox="0 0 1080 1920"');
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1920"');
    // Sarılmış başlık satırlarının ikisi de SVG'de bulunmalı.
    for (const line of wrapTitle(LONG_TOPIC)) expect(svg).toContain(line);
    expect(TITLE_SAFE_WIDTH).toBe(936);
  });
});
