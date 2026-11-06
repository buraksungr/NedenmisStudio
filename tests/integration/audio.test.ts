import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FFmpegService } from '../../electron/main/infrastructure/FFmpegService.js';
import { AudioService } from '../../electron/main/services/audio/AudioService.js';

const directory = await mkdtemp(join(tmpdir(), 'nedenmis-audio-')); afterAll(() => rm(directory, { recursive: true, force: true }));
describe('Gerçek FFmpeg ses miksajı', () => {
  it('anlatım, müzik, konumlandırma, solma ve ducking ile AAC üretir', async () => {
    const ffmpeg = new FFmpegService(() => undefined); const audio = new AudioService(ffmpeg); const narration = join(directory, 'narration.wav'); const music = join(directory, 'music.wav'); const output = join(directory, 'mix.m4a');
    await ffmpeg.run('test-tone-1', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'pcm_s16le', narration]);
    await ffmpeg.run('test-tone-2', ['-f', 'lavfi', '-i', 'sine=frequency=110:duration=4', '-c:a', 'pcm_s16le', music]);
    await audio.mix('test-mix', { narration: [{ path: narration, start: .25, volume: 1 }], music: [{ id: 'music1', kind: 'music', name: 'Altyapı', path: music, start: 0, duration: 4, trimStart: 0, volume: .4, fadeIn: .2, fadeOut: .4 }], sfx: [], musicVolume: .5, sfxVolume: .5, duration: 3.5, ducking: true }, output);
    const probe = await ffmpeg.probe(output); expect(probe.duration).toBeGreaterThan(3.3); expect(probe.duration).toBeLessThan(3.8); expect(probe.codec).toBe('aac'); expect((await stat(output)).size).toBeGreaterThan(5000);
  });
});
