import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { MediaRepository } from '../../electron/main/infrastructure/database/MediaRepository.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { FFmpegService } from '../../electron/main/infrastructure/FFmpegService.js';
import { MediaService } from '../../electron/main/services/media/MediaService.js';

const directory = await mkdtemp(join(tmpdir(), 'nedenmis-reference-')); afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
describe('Gerçek referans ses dönüşümü', () => {
  it('WAV, MP3 ve M4A girdilerini mono 24 kHz PCM WAV profiline dönüştürür', async () => {
    const ffmpeg = new FFmpegService(() => undefined); const db = new AppDatabase(':memory:'); const service = new MediaService(new MediaRepository(db), new ProjectRepository(db), ffmpeg, () => directory);
    const wav = join(directory, 'source.wav'); await ffmpeg.run('reference-source', ['-f', 'lavfi', '-i', 'sine=frequency=330:duration=4', '-c:a', 'pcm_s16le', wav]);
    const mp3 = join(directory, 'source.mp3'); const m4a = join(directory, 'source.m4a'); await ffmpeg.run('reference-mp3', ['-i', wav, '-c:a', 'libmp3lame', mp3]); await ffmpeg.run('reference-m4a', ['-i', wav, '-c:a', 'aac', m4a]);
    for (const source of [wav, mp3, m4a]) { const item = await service.importReference(source); const probe = await ffmpeg.probe(item.path); expect(probe.duration).toBeGreaterThanOrEqual(3.8); expect(probe.sampleRate).toBe(24000); expect(probe.channels).toBe(1); expect(probe.codec).toBe('pcm_s16le'); }
    const validPath = join(directory, 'assets', 'reference_voice.wav'); const before = createHash('sha256').update(await readFile(validPath)).digest('hex'); const short = join(directory, 'short.wav'); await ffmpeg.run('reference-short', ['-f', 'lavfi', '-i', 'sine=duration=1', '-c:a', 'pcm_s16le', short]);
    await expect(service.importReference(short)).rejects.toThrow('en az 3 saniye'); const after = createHash('sha256').update(await readFile(validPath)).digest('hex'); expect(after).toBe(before); db.close();
  }, 120000);
});
