/**
 * 9:16 önizleme görsel regresyon testi (gerçek tarayıcı + GERÇEK üretim SVG'si).
 *
 * Üretim kodunun kendisi (`buildArtworkSvg`) çağrılır; test kendi SVG'sini
 * uydurmaz. Senaryo: uzun Türkçe başlık, dört kenara yakın öğeler, alta yakın
 * büyük illüstrasyon, alt altyazı.
 *
 * Çıktı: .verification/build40/preview-regression.json + önizleme PNG'leri.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { buildArtworkSvg, wrapTitle, TITLE_SAFE_WIDTH } from '../shared/visuals/sceneArtwork.ts';
import { DEFAULT_IDENTITY } from '../shared/defaults.ts';

const require = createRequire(import.meta.url);
const { chromium: playwrightChromium } = require('playwright');
const sharp = require('sharp');

/**
 * Tarayıcı çözümlemesi platforma göre:
 * - Windows/macOS ve Playwright tarayıcısı kurulu Linux: Playwright'ın kendi
 *   Chromium'u (Electron ile aynı motor) kullanılır.
 * - Kısıtlı Linux sandbox'ı: `@sparticuz/chromium` paketlenmiş Chromium'u.
 * Hiçbiri yoksa test ATLANMAZ; açık hatayla durur.
 */
async function resolveBrowser() {
  const bundled = (() => { try { return require('@sparticuz/chromium').default; } catch { return undefined; } })();
  const attempts = [];
  if (bundled) {
    try { return { executablePath: await bundled.executablePath(), args: [...bundled.args, '--font-render-hinting=none'] }; }
    catch (error) { attempts.push(`sparticuz: ${error.message}`); }
  }
  try {
    const distPath = playwrightChromium.executablePath();
    // Playwright yol bildirir ama tarayıcı indirilmemiş olabilir; varlığını sınarız.
    if (distPath && existsSync(distPath)) return { executablePath: distPath, args: ['--font-render-hinting=none'] };
    attempts.push(`playwright: ${distPath} bulunamadı`);
  } catch (error) { attempts.push(`playwright: ${error.message}`); }
  throw new Error(`Önizleme regresyon testi için Chromium bulunamadı. ${attempts.join(' | ')}`);
}

const COMPOSITION = { width: 1080, height: 1920 };
const VIEWPORTS = [
  { name: 'kucuk-1024x700', width: 1024, height: 700 },
  { name: 'varsayilan-1440x900', width: 1440, height: 900 },
  { name: 'genis-1920x1080', width: 1920, height: 1080 },
  { name: 'dar-800x620', width: 800, height: 620 },
];

const LONG_TURKISH_TITLE = 'Mum alevi neden yukarı doğru yanar ve neden titrer';
const project = {
  topic: LONG_TURKISH_TITLE,
  subtitleStyle: { position: 'bottom' },
};
const scene = { number: 1, narration: 'Sıcak hava yukarı çıkar, alev onu izler', duration: 10 };
const artwork = `
  <circle id="edge-top" cx="540" cy="16" r="14" fill="#FF6B6B"/>
  <circle id="edge-left" cx="16" cy="960" r="14" fill="#FF6B6B"/>
  <circle id="edge-right" cx="1064" cy="960" r="14" fill="#FF6B6B"/>
  <circle id="edge-bottom" cx="540" cy="1904" r="14" fill="#FF6B6B"/>
  <circle id="illustration" cx="540" cy="1500" r="290" fill="#FFD66B"/>
  <text id="subtitle" x="540" y="1800" text-anchor="middle" fill="#FFFFFF" font-size="42" font-family="Arial">Sıcak hava yukarı çıkar, alev onu izler</text>`;
const SCENE_SVG = buildArtworkSvg(project, scene, DEFAULT_IDENTITY, artwork);

const resolved = await resolveBrowser();
const browser = await playwrightChromium.launch({
  executablePath: resolved.executablePath,
  args: [...resolved.args, '--no-sandbox', '--disable-gpu'],
  headless: true,
});

const results = [];
let parity = { compared: false };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`file://${process.cwd()}/tests/fixtures/preview-layout.html`);
    await page.evaluate((svg) => { document.getElementById('scene-host').innerHTML = svg; }, SCENE_SVG);

    const measurement = await page.evaluate((composition) => {
      const box = document.getElementById('box').getBoundingClientRect();
      const svg = document.querySelector('#scene-host svg');
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width / composition.width;
      const scaleY = rect.height / composition.height;
      const insideSvg = (el) => {
        const r = el.getBoundingClientRect();
        return r.left >= rect.left - 0.5 && r.right <= rect.right + 0.5 && r.top >= rect.top - 0.5 && r.bottom <= rect.bottom + 0.5;
      };
      const titles = [...svg.querySelectorAll('text')].filter((el) => el.getAttribute('font-weight') === '700' && el.getAttribute('x') === '72' && el.textContent.trim().length);
      return {
        box: { width: +box.width.toFixed(2), height: +box.height.toFixed(2), ratio: +(box.width / box.height).toFixed(4) },
        svg: { width: +rect.width.toFixed(2), height: +rect.height.toFixed(2) },
        visibleFraction: +(Math.min(1, box.width / rect.width) * Math.min(1, box.height / rect.height)).toFixed(4),
        aspectRatioPreserved: Math.abs(box.width / box.height - composition.width / composition.height) < 0.01,
        uniformScale: Math.abs(scaleX - scaleY) < 0.001,
        scale: +scaleX.toFixed(5),
        titleLines: titles.map((el) => el.textContent),
        titleWithinComposition: titles.every((el) => { const r = el.getBoundingClientRect(); return r.right <= rect.right + 0.5 && r.left >= rect.left - 0.5; }),
        titleClipped: titles.some((el) => { const r = el.getBoundingClientRect(); return r.right > box.right + 0.5; }),
        // viewBox uzayında ölçülen başlık genişliği (kırpma bağımsız kanıtı).
        titleWidthsInComposition: titles.map((el) => +(el.getBBox().width).toFixed(1)),
        elements: Object.fromEntries(['edge-top', 'edge-left', 'edge-right', 'edge-bottom', 'illustration', 'subtitle']
          .map((id) => {
            const el = document.getElementById(id);
            const r = el.getBoundingClientRect();
            return [id, { insideComposition: insideSvg(el), withinPreviewBox: r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5 }];
          })),
      };
    }, COMPOSITION);

    const failures = [];
    if (measurement.visibleFraction !== 1) failures.push(`kompozisyonun tamamı görünmüyor (${measurement.visibleFraction})`);
    if (!measurement.aspectRatioPreserved) failures.push('en-boy oranı korunmuyor');
    if (!measurement.uniformScale) failures.push('yatay/dikey ölçek farklı (bozulma)');
    if (measurement.titleClipped) failures.push('başlık önizleme kutusunda kırpılıyor');
    if (!measurement.titleWithinComposition) failures.push('başlık kompozisyon dışına taşıyor');
    for (const width of measurement.titleWidthsInComposition) {
      if (width > TITLE_SAFE_WIDTH + 0.5) failures.push(`başlık satırı güvenli alanı taşıyor (${width} > ${TITLE_SAFE_WIDTH})`);
    }
    for (const [id, state] of Object.entries(measurement.elements)) {
      if (!state.insideComposition) failures.push(`${id} kompozisyon dışında`);
      if (!state.withinPreviewBox) failures.push(`${id} önizleme kutusunda görünmüyor`);
    }
    results.push({ viewport, ...measurement, failures });

    mkdirSync('.verification/build40/previews', { recursive: true });
    await page.locator('#box').screenshot({ path: join('.verification/build40/previews', `${viewport.name}.png`) });
  }

// --- Önizleme ↔ dışa aktarım eşitliği ----------------------------------------
// Dışa aktarım (RenderService) SVG'yi sharp ile 1080×1920'ye rasterize eder
// (`fit: 'fill'`, bozulma yok). Önizleme ise AYNI SVG'yi DOM'da gösterir.
// İki bağımsız rasterleştirici (sharp/libvsvg ve Chromium) aynı kadrajı
// veriyorsa, önizleme ile dışa aktarım aynı kompozisyonu taşır.
//
// Karşılaştırma pikselli değil, hücre ortalaması üzerinden yapılır: iki
// rasterleştirici metin kenarlarını farklı antialias ile çizer, ama kompozisyon
// (hangi öğe nerede) aynıysa hücre ortalamaları örtüşür.
async function gridOf(png, columns, rows) {
  const { data } = await sharp(png).resize(columns, rows, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return data;
}
function compareGrids(a, b) {
  let sum = 0; let max = 0;
  for (let i = 0; i < a.length; i += 1) { const d = Math.abs(a[i] - b[i]); sum += d; if (d > max) max = d; }
  const meanAbsDiff = sum / a.length;
  // Yapısal benzerlik: 1 - ortalama fark / 255.
  return { meanAbsDiff: +meanAbsDiff.toFixed(2), maxAbsDiff: max, similarity: +(1 - meanAbsDiff / 255).toFixed(4) };
}

try {
  // Dışa aktarımın gerçek rasterizasyonu (RenderService ile birebir aynı yol).
  const exportRaster = await sharp(Buffer.from(SCENE_SVG), { density: 72 })
    .resize(COMPOSITION.width, COMPOSITION.height, { fit: 'fill' }).png().toBuffer();
  // Önizleme rasterizasyonu: aynı SVG, Chromium DOM'unda, doğal 1080×1920.
  const nativePage = await browser.newPage({ viewport: { width: COMPOSITION.width, height: COMPOSITION.height }, deviceScaleFactor: 1 });
  await nativePage.setContent(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#0b0f0c;width:${COMPOSITION.width}px;height:${COMPOSITION.height}px;overflow:hidden}svg{display:block}</style></head><body>${SCENE_SVG}</body></html>`);
  const previewRaster = await nativePage.screenshot({ type: 'png' });
  await nativePage.close();
  mkdirSync('.verification/build40/previews', { recursive: true });
  await sharp(exportRaster).toFile('.verification/build40/previews/export-raster-sharp.png');
  await sharp(previewRaster).toFile('.verification/build40/previews/preview-raster-chromium.png');

  const COLUMNS = 54; const ROWS = 96;
  const exportGrid = await gridOf(exportRaster, COLUMNS, ROWS);
  const previewGrid = await gridOf(previewRaster, COLUMNS, ROWS);
  const pair = compareGrids(exportGrid, previewGrid);

  parity = {
    compared: true,
    method: 'sharp/libvsvg (dışa aktarım rasterizasyonu) ↔ Chromium DOM (önizleme rasterizasyonu), 54×96 hücre ortalama parlaklık',
    exportVsPreview: pair,
    // Gerçek MP4 karesi ↔ aynı SVG karşılaştırması ayrı testte yapılır
    // (tests/integration/exportedMp4Composition.test.ts): o testin sahnesi
    // buradaki test sahnesinden farklı olduğu için burada karşılaştırılmaz.
  };
  if (pair.similarity < 0.95) throw new Error(`önizleme ve dışa aktarım farklı kompozisyon gösteriyor (benzerlik ${pair.similarity})`);
} catch (error) {
  parity.error = String(error && error.message ? error.message : error);
  results.push({ viewport: { name: 'parity' }, failures: [`önizleme/dışa aktarım eşitliği doğrulanamadı: ${parity.error}`] });
}
} finally {
  await browser.close();
}

const report = {
  ok: results.every((item) => item.failures.length === 0),
  parity,
  scenario: 'Uzun Türkçe başlık, dört kenara yakın öğe, alta yakın büyük illüstrasyon, alt altyazı',
  composition: COMPOSITION,
  titleWrapped: wrapTitle(project.topic),
  viewports: results,
};
mkdirSync('.verification/build40', { recursive: true });
writeFileSync('.verification/build40/preview-regression.json', JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, titleWrapped: report.titleWrapped, summary: results.map((r) => ({ viewport: r.viewport.name, visible: r.visibleFraction, scale: r.scale, titleWidths: r.titleWidthsInComposition, failures: r.failures })) }, null, 2));
process.exit(report.ok ? 0 : 1);
