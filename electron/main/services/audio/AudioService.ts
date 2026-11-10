import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AudioClip } from '../../../../shared/types.js';
import type { FFmpegService } from '../../infrastructure/FFmpegService.js';

/** Dışa aktarım ses grafiğinde her dal için zorunlu ortak biçim. */
const STEREO = 'aformat=sample_rates=48000:channel_layouts=stereo';

export interface AudioMixInput { narration: Array<{ path: string; start: number; volume: number }>; music: AudioClip[]; sfx: AudioClip[]; musicVolume: number; sfxVolume: number; duration: number; ducking: boolean }

export class AudioService {
  constructor(private readonly ffmpeg: FFmpegService) {}
  async mix(jobId: string, input: AudioMixInput, outputPath: string): Promise<void> {
    await mkdir(dirname(outputPath), { recursive: true });
    const clips = [
      ...input.narration.map((clip) => ({ ...clip, kind: 'narration' as const })),
      ...input.music.map((clip) => ({ path: clip.path, start: clip.start, volume: clip.volume * input.musicVolume, trimStart: clip.trimStart, duration: clip.duration, fadeIn: clip.fadeIn, fadeOut: clip.fadeOut, kind: 'music' as const })),
      ...input.sfx.map((clip) => ({ path: clip.path, start: clip.start, volume: clip.volume * input.sfxVolume, trimStart: clip.trimStart, duration: clip.duration, fadeIn: clip.fadeIn, fadeOut: clip.fadeOut, kind: 'sfx' as const })),
    ];
    if (!clips.length) { await this.ffmpeg.run(jobId, ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-t', String(input.duration), '-c:a', 'aac', outputPath]); return; }
    const args: string[] = []; for (const clip of clips) args.push('-i', clip.path);
    const filters: string[] = []; const labels: string[] = [];
    clips.forEach((clip, index) => {
      const trimStart = 'trimStart' in clip ? clip.trimStart || 0 : 0;
      const requestedDuration = 'duration' in clip && clip.duration ? clip.duration : input.duration;
      const fadeIn = 'fadeIn' in clip ? clip.fadeIn || 0 : 0; const fadeOut = 'fadeOut' in clip ? clip.fadeOut || 0 : 0;
      const parts = [`[${index}:a]aformat=sample_rates=48000:channel_layouts=stereo`, `atrim=start=${trimStart}:duration=${requestedDuration}`, 'asetpts=PTS-STARTPTS', `volume=${Math.max(0, clip.volume)}`];
      if (fadeIn > 0) parts.push(`afade=t=in:st=0:d=${fadeIn}`); if (fadeOut > 0) parts.push(`afade=t=out:st=${Math.max(0, requestedDuration - fadeOut)}:d=${fadeOut}`);
      const delay = Math.round(clip.start * 1000); parts.push(`adelay=${delay}|${delay}`, 'apad'); filters.push(parts.join(',') + `[a${index}]`); labels.push(`[a${index}]`);
    });
    const narrationLabels = clips.map((clip, index) => clip.kind === 'narration' ? `[a${index}]` : '').filter(Boolean).join('');
    const musicLabels = clips.map((clip, index) => clip.kind === 'music' ? `[a${index}]` : '').filter(Boolean).join('');
    if (input.ducking && narrationLabels && musicLabels) {
      // amix tek ses (mono) girdilerde kanal düzenini 'unknown' bırakabiliyor; sidechaincompress
      // iki girişte de aynı kanal düzenini ister, bu yüzden her iki dalı da açıkça stereo yapıyoruz.
      filters.push(`${narrationLabels}amix=inputs=${clips.filter((c) => c.kind === 'narration').length}:duration=longest,${STEREO},asplit=2[nvoice_sc][nvoice_mix]`);
      filters.push(`${musicLabels}amix=inputs=${clips.filter((c) => c.kind === 'music').length}:duration=longest,${STEREO}[bg]`);
      filters.push(`[bg][nvoice_sc]sidechaincompress=threshold=0.025:ratio=8:attack=20:release=350,${STEREO}[ducked]`);
      const others = clips.map((clip, index) => clip.kind === 'sfx' ? `[a${index}]` : '').filter(Boolean).join('');
      // sidechain çıkışı ve karışım girişleri de aynı biçimde olmalı.
      filters.push(`[ducked][nvoice_mix]${others}amix=inputs=${2 + clips.filter((c) => c.kind === 'sfx').length}:duration=longest,volume=${2 + clips.filter((c) => c.kind === 'sfx').length},alimiter=limit=0.95[mixed]`);
    } else filters.push(`${labels.join('')}amix=inputs=${clips.length}:duration=longest:dropout_transition=0,volume=${clips.length},alimiter=limit=0.95[mixed]`);
    args.push('-filter_complex', filters.join(';'), '-map', '[mixed]', '-t', String(input.duration), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', outputPath);
    await this.ffmpeg.run(jobId, args);
  }
}
