import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { FFmpegService } from '../../electron/main/infrastructure/FFmpegService.js';
import { buildPlaybackTimeline as buildTimeline } from '../../shared/playback.js';

/**
 * MP4 ses/altyazı eşzamanlaması.
 *
 * Video kareleri doğru olsa da ses kaymış olabilir. Burada dışa aktarılan dosyanın
 * İÇİNDEKİ ses incelenir: her sahnenin anlatımı kendi başlangıcında başlamalı,
 * müzik yatağı tüm süre boyunca duyulmalı ve altyazılar mutlak zamana oturmalı.
 *
 * Girdi: `NEDENMIS_PARITY_MP4` (previewExportParity testinin ürettiği MP4) ve
 * `NEDENMIS_PARITY_EVIDENCE` (aynı testin kanıt klasörü, subtitles.ass içerir).
 */
const execFileAsync = promisify(execFile);
// Platforma bağımlı sabit yol YOK: Windows CI'da linux-x64 yolu ENOENT veriyordu.
// Yollar uygulamanın kendi çözümleyicisinden alınır (ffmpeg-static/ffprobe-static).
const ffmpegService = new FFmpegService(() => process.env.NEDENMIS_FFMPEG_PATH);
const ffmpegPath = ffmpegService.ffmpegPath;
const ffprobePath = process.env.NEDENMIS_FFPROBE_PATH || ffmpegService.ffprobePath;
const mp4 = process.env.NEDENMIS_PARITY_MP4 || '.verification/build20-parity/buz-52s.mp4';
const evidence = process.env.NEDENMIS_PARITY_EVIDENCE || '.verification/build20-parity/evidence';
const enabled = existsSync(mp4) && existsSync(join(evidence, 'subtitles.ass'));
const directory = await mkdtemp(join(tmpdir(), 'nedenmis-av-'));
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

/** Belirli bir zaman aralığının RMS ses düzeyini dB olarak ölçer. */
async function loudness(start: number, duration: number): Promise<number> {
  const out = join(directory, `seg-${start.toFixed(2)}-${duration.toFixed(2)}.wav`);
  await execFileAsync(ffmpegPath, ['-v', 'error', '-ss', String(start), '-t', String(duration), '-i', mp4, '-vn', '-ac', '1', '-ar', '16000', '-y', out]);
  const { stderr } = await execFileAsync(ffmpegPath, ['-hide_banner', '-i', out, '-af', 'volumedetect', '-f', 'null', '-']);
  const mean = /mean_volume: (-?[\d.]+) dB/.exec(stderr)?.[1];
  return Number(mean ?? -99);
}

describe.skipIf(!enabled)('MP4 ses ve altyazı eşzamanlaması', () => {
  it('anlatım her sahnenin başında duyulur, müzik sürekli, altyazı mutlak zamanda', async () => {
    const probe = JSON.parse((await execFileAsync(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,sample_rate,channels,duration', '-of', 'json', mp4])).stdout) as { format: { duration: string }; streams: Array<{ codec_type: string; codec_name: string; sample_rate?: string; channels?: number; duration?: string }> };
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio')!;
    expect(audio.codec_name).toBe('aac');
    expect(Number(audio.sample_rate)).toBe(48000);
    expect(audio.channels).toBe(2);
    // Ses ve video süreleri aynı olmalı: sesin erken bitmesi son sahnede sessizlik demektir.
    const video = probe.streams.find((stream) => stream.codec_type === 'video')!;
    expect(Math.abs(Number(audio.duration) - Number(video.duration))).toBeLessThan(.25);

    // Ölçülen dört sahne: 9.5 + 14.5 + 13.5 + 14.5 = 52 s (parity testiyle aynı).
    const durations = [9.5, 14.5, 13.5, 14.5];
    const timeline = buildTimeline(durations.map((duration, index) => ({ id: `s${index}`, number: index + 1, section: 'explanation', narration: '', duration, transition: 'fade', subtitles: [], status: 'ready' }) as never));
    const report: Array<Record<string, unknown>> = [];
    for (let index = 0; index < durations.length; index += 1) {
      const start = timeline.starts[index];
      // Anlatım penceresi: sahne başı + 0.35 s (ton başlangıcı) → 1.35 s.
      const narrated = await loudness(start + .35, 1);
      // Sahne sonundaki 0.45 s: anlatım tonu bitmiş olmalı (dur - 0.4 kadardı).
      const tail = await loudness(start + durations[index] - .5, .4);
      report.push({ scene: index + 1, start, narratedDb: narrated, tailDb: tail, delta: Number((narrated - tail).toFixed(2)) });
      // Anlatımın duyulduğu bölüm, sessiz kuyruktan en az 3 dB yüksek olmalı.
      expect(narrated - tail, `sahne ${index + 1} anlatım/sessizlik farkı`).toBeGreaterThan(3);
      expect(narrated, `sahne ${index + 1} anlatım düzeyi`).toBeGreaterThan(-45);
      // Her sahnenin anlatıldığı bölüm sessiz olmamalı: video boyunca ses var.
      expect(tail).toBeLessThan(narrated);
    }
    // Müzik yatağı sahne aralarında (geçişlerde) da duyulmalı; süreklilik kontrolü.
    const transitionLoudness: number[] = [];
    for (const boundary of timeline.starts.slice(1)) transitionLoudness.push(await loudness(boundary - .1, .3));
    for (const [index, value] of transitionLoudness.entries()) expect(value, `geçiş ${index + 1} sesi`).toBeGreaterThan(-45);

    // Altyazı zamanlaması: ASS dosyasındaki her satır mutlak zamanda ve sıralı.
    const ass = await (await import('node:fs/promises')).readFile(join(evidence, 'subtitles.ass'), 'utf8');
    const lines = ass.split('\n').filter((line) => line.startsWith('Dialogue:'));
    expect(lines.length).toBeGreaterThan(4);
    const toSeconds = (value: string) => { const [h, m, rest] = value.split(':'); const [s, cs] = rest.split('.'); return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(cs) / 100; };
    const spans = lines.map((line) => { const fields = line.replace('Dialogue: ', '').split(','); return { start: toSeconds(fields[1]), end: toSeconds(fields[2]), text: fields.slice(9).join(',') }; });
    for (let index = 1; index < spans.length; index += 1) expect(spans[index].start).toBeGreaterThanOrEqual(spans[index - 1].start);
    // Altyazılar sahne sınırlarını aşmamalı: her satır tek bir sahne içinde kalır.
    for (const span of spans) {
      let sceneIndex = 0;
      timeline.starts.forEach((start, index) => { if (start <= span.start + 1e-6) sceneIndex = index; });
      expect(span.end, `altyazı sahne sonunu aşıyor: ${span.text.slice(0, 30)}`).toBeLessThanOrEqual(timeline.starts[sceneIndex] + durations[sceneIndex] + .05);
    }
    expect(spans[0].start).toBeCloseTo(0, 1);
    expect(spans.at(-1)!.end).toBeLessThanOrEqual(52.05);

    await writeFile(join(directory, 'audio-sync-report.json'), JSON.stringify({ ok: true, audio, videoDuration: Number(video.duration), scenes: report, transitionLoudness, subtitleLines: spans.length, subtitleFirstStart: spans[0].start, subtitleLastEnd: spans.at(-1)!.end, method: 'volume-detected RMS in 1 s windows extracted from the exported MP4 audio track' }, null, 2));
    const { copyFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(process.cwd(), '.verification', 'build20-parity'), { recursive: true });
    await copyFile(join(directory, 'audio-sync-report.json'), join(process.cwd(), '.verification', 'build20-parity', 'audio-sync-report.json'));
  }, 300_000);
});
