/**
 * Editör önizleme yerleşimini GERÇEK tarayıcıda ölçer.
 *
 * Neden: 1080×1920 SVG `AnimatedScene` içinde satır içi olarak basılır. Tailwind
 * preflight `img, video` için `max-width:100%` verir ama `svg` için VERMEZ; bu
 * yüzden SVG'nin kendi width/height nitelikleri geçerlidir ve 1080×1920'lik
 * içerik ~300 px'lik kutuya sığdırılmak yerine kırpılır.
 *
 * Kullanım: node scripts/preview-measure.mjs <çıktı.json> [ekran görüntüsü dizini]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const chromium = require('@sparticuz/chromium').default;
const { chromium: playwrightChromium } = require('playwright-core');

const htmlPath = 'tests/fixtures/preview-layout.html';
const outputPath = process.argv[2] || '.verification/build40/preview-layout.json';
const shotDir = process.argv[3];

/** Ölçülecek pencere boyutları: küçük dizüstü, varsayılan, geniş ekran. */
const VIEWPORTS = [
  { name: 'kucuk-1024x700', width: 1024, height: 700 },
  { name: 'varsayilan-1440x900', width: 1440, height: 900 },
  { name: 'genis-1920x1080', width: 1920, height: 1080 },
];

const executablePath = await chromium.executablePath();
const browser = await playwrightChromium.launch({
  executablePath,
  args: [...chromium.args, '--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
  headless: true,
});

const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`file://${process.cwd()}/${htmlPath}`);
    // Sahne SVG'si, uygulamadaki gibi satır içi olarak basılır.
    await page.evaluate(() => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
        <rect width="1080" height="1920" fill="#101915"/>
        <text x="72" y="210" fill="#F3F7F4" font-size="47" font-family="Arial">Mum alevi neden yukarı doğru yanar</text>
        <circle cx="150" cy="1600" r="92" fill="#FFD66B"/>
        <rect x="0" y="1900" width="1080" height="20" fill="#D8FF65"/>
      </svg>`;
      document.getElementById('scene-host').innerHTML = svg;
    });
    const metrics = await page.evaluate(() => {
      const box = document.getElementById('box').getBoundingClientRect();
      const svg = document.querySelector('#scene-host svg');
      const rect = svg.getBoundingClientRect();
      const scale = rect.width ? box.width / rect.width : 0;
      return {
        box: { width: +box.width.toFixed(2), height: +box.height.toFixed(2), ratio: +(box.width / box.height).toFixed(4) },
        svg: { width: +rect.width.toFixed(2), height: +rect.height.toFixed(2) },
        // Görünür kalan kompozisyon oranı: 1.0 = kompozisyonun tamamı görünüyor.
        visibleFraction: +(Math.min(1, box.width / rect.width) * Math.min(1, box.height / rect.height)).toFixed(4),
        clippedHorizontally: rect.width > box.width + 0.5,
        clippedVertically: rect.height > box.height + 0.5,
        effectiveScale: +scale.toFixed(4),
        aspectRatioPreserved: Math.abs(box.width / box.height - 1080 / 1920) < 0.01,
      };
    });
    results.push({ viewport, ...metrics });
    if (shotDir) {
      mkdirSync(shotDir, { recursive: true });
      await page.locator('#box').screenshot({ path: join(shotDir, `${viewport.name}.png`) });
    }
  }
} finally {
  await browser.close();
}

// Beklenen: her pencerede kompozisyonun TAMAMI görünür (visibleFraction = 1).
const report = {
  ok: results.every((item) => item.visibleFraction === 1 && !item.clippedHorizontally && !item.clippedVertically && item.aspectRatioPreserved),
  viewports: results,
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
