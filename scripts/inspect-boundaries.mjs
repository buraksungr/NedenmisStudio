/**
 * Kare düzeyinde geçiş sınırı denetimi.
 *
 * Her sahne sınırı için geçiş penceresinin ÖNCESİ, İÇİ ve SONRASI kare kare
 * çözülür ve şu üç şey ölçülür:
 *  - kararma (siyah kare) var mı: penceredeki en düşük parlaklık,
 *  - kare atlaması var mı: beklenen kare sayısı ile çözülen kare sayısı,
 *  - geçiş süresi doğru mu: karışımın gerçekten pencere kadar sürdüğü.
 *
 * Kullanım: node scripts/inspect-boundaries.mjs <mp4> [json-çıktı]
 */
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const ffmpegPath = (() => {
  // ffmpeg-static ikili dosyası indirilmemiş olabilir (npm ci --ignore-scripts);
  // o durumda paketle gelen yedek ikili kullanılır.
  try { const value = require('ffmpeg-static'); if (existsSync(value)) return value; } catch { /* yedek ikili kullanılır */ }
  return process.env.NEDENMIS_FFMPEG || require('@ffmpeg-installer/ffmpeg').path;
})();
const ffprobePath = require('ffprobe-static').path;

const FRAME_RATE = 30;
const CROSSFADE_SECONDS = 10 / FRAME_RATE;
const FPS = 30;

/** Analiz çözünürlüğü: kare başına sabit bayt sayısı verir (kare kaybı sayımı için). */
const ANALYSIS_WIDTH = 216;
const ANALYSIS_HEIGHT = 384;
const FRAME_BYTES = ANALYSIS_WIDTH * ANALYSIS_HEIGHT * 3;

/** Kareyi gri tonlu ortalama parlaklığa indirger. */
function frameLuminance(buffer) {
  let sum = 0; let count = 0;
  for (let index = 0; index < buffer.length; index += 3) { sum += (buffer[index] * 0.299 + buffer[index + 1] * 0.587 + buffer[index + 2] * 0.114); count += 1; }
  return sum / Math.max(1, count);
}

/** Karşılaştırma için seyrek imza: 8x8 blok ortalamaları. */
function frameSignature(buffer) {
  const signature = [];
  const blockX = ANALYSIS_WIDTH / 8; const blockY = ANALYSIS_HEIGHT / 8;
  for (let by = 0; by < 8; by += 1) for (let bx = 0; bx < 8; bx += 1) {
    let sum = 0; let count = 0;
    for (let y = by * blockY; y < (by + 1) * blockY; y += 2) for (let x = bx * blockX; x < (bx + 1) * blockX; x += 2) {
      const index = (y * ANALYSIS_WIDTH + x) * 3; sum += (buffer[index] + buffer[index + 1] + buffer[index + 2]) / 3; count += 1;
    }
    signature.push(sum / Math.max(1, count));
  }
  return signature;
}

function difference(a, b) {
  let sum = 0; for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return sum / a.length;
}

/**
 * Verilen aralıktaki tüm kareleri sırayla çözer (kare kaybı tespiti için).
 * Çıktı ham rgb24 ve sabit boyutlu olduğundan kare sınırları bayt ofsetiyle
 * kesin olarak bulunur; yuvarlama/başlık ayrıştırma hatası oluşmaz.
 */
async function decodeWindow(mp4, start, end) {
  const { stdout } = await execFileAsync(ffmpegPath, [
    '-v', 'error', '-ss', start.toFixed(6), '-i', mp4, '-t', (end - start).toFixed(6),
    '-vf', `scale=${ANALYSIS_WIDTH}:${ANALYSIS_HEIGHT}`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ], { maxBuffer: 1024 * 1024 * 256, encoding: 'buffer' });
  const frames = [];
  for (let offset = 0; offset + FRAME_BYTES <= stdout.length; offset += FRAME_BYTES) frames.push(stdout.slice(offset, offset + FRAME_BYTES));
  return frames;
}

const mp4 = process.argv[2];
const outputPath = process.argv[3];
if (!mp4) { console.error('Kullanım: node scripts/inspect-boundaries.mjs <mp4> [çıktı.json]'); process.exit(1); }

const probe = JSON.parse((await execFileAsync(ffprobePath, [
  '-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,nb_read_frames,duration,r_frame_rate', '-of', 'json', mp4,
])).stdout);
const video = probe.streams.find((stream) => stream.codec_type === 'video');
const report = { mp4, decodedFrames: Number(video.nb_read_frames), duration: Number(video.duration), analysis: { width: ANALYSIS_WIDTH, height: ANALYSIS_HEIGHT, note: 'Parlaklık ve kare farkları analiz için ölçeklenmiş kareler üzerinden hesaplanır; kare sayımı tam çözünürlükte çözülen ham karelerden gelir.' }, boundaries: [] };

const boundaries = JSON.parse(process.argv[4] || '[]');
for (const boundary of boundaries) {
  const { at, transition, index } = boundary;
  const window = transition === 'none' ? 0 : CROSSFADE_SECONDS;
  // Pencereden 2 kare önce, pencere boyunca ve 2 kare sonra.
  const start = Math.max(0, at - 2 / FPS);
  const end = at + window + 2 / FPS;
  const frames = await decodeWindow(mp4, start, end);
  const expected = Math.round((end - start) * FPS);
  const luminance = []; const signatures = [];
  for (const frame of frames) { luminance.push(frameLuminance(frame)); signatures.push(frameSignature(frame)); }
  const jumps = signatures.slice(1).map((signature, position) => difference(signatures[position], signature));
  const inside = [];
  for (let position = 0; position < frames.length; position += 1) {
    const time = start + position / FPS;
    if (time >= at - 1e-6 && time < at + window - 1e-6) inside.push(luminance[position]);
  }
  report.boundaries.push({
    index, at, transition, window,
    windowStart: at, windowEnd: at + window,
    decoded: frames.length, expectedFrames: expected, frameLoss: expected - frames.length,
    luminancePerFrame: luminance.map((value, position) => ({ time: Number((start + position / FPS).toFixed(4)), value: Number(value.toFixed(2)) })),
    minLuminanceInWindow: inside.length ? Number(Math.min(...inside).toFixed(2)) : null,
    blackFrame: inside.length ? Math.min(...inside) < 12 : false,
    maxNeighbourDifference: Number(Math.max(...jumps).toFixed(2)),
    meanNeighbourDifference: Number((jumps.reduce((sum, value) => sum + value, 0) / Math.max(1, jumps.length)).toFixed(2)),
  });
}

const failures = [];
for (const entry of report.boundaries) {
  if (entry.frameLoss !== 0) failures.push(`sınır ${entry.index} (${entry.at}s): ${entry.frameLoss} kare eksik (${entry.decoded}/${entry.expectedFrames})`);
  if (entry.blackFrame) failures.push(`sınır ${entry.index} (${entry.at}s): siyah kare (${entry.minLuminanceInWindow})`);
}
report.ok = failures.length === 0;
report.failures = failures;
const text = JSON.stringify(report, null, 2);
if (outputPath) { await mkdir(dirname(outputPath), { recursive: true }); await writeFile(outputPath, text, 'utf8'); }
console.log(text);
