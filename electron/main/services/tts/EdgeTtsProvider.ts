import { execFile } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { id } from '../../../../shared/utils.js';
import type { ConnectionTestResult, SubtitleCue, TtsRequest, TtsResult, VoiceInfo } from '../../../../shared/types.js';
import type { FFmpegService } from '../../infrastructure/FFmpegService.js';
import type { TtsProvider } from './TtsProvider.js';

const exec = promisify(execFile);
function timestamp(value: string): number { const match = value.match(/(\d+):(\d+):(\d+)[.,](\d+)/); return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4]}`) : 0; }
export function parseEdgeVtt(vtt: string): SubtitleCue[] {
  const lines = vtt.replace(/\r/g, '').split('\n'); const cues: SubtitleCue[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const timing = lines[i].match(/(\d+:\d+:\d+[.,]\d+)\s+-->\s+(\d+:\d+:\d+[.,]\d+)/); if (!timing) continue;
    const text = lines[++i]?.replace(/<[^>]+>/g, '').trim(); if (!text) continue;
    const start = timestamp(timing[1]); const end = timestamp(timing[2]); const previous = cues.at(-1);
    if (previous && start - previous.start < 2.8 && `${previous.text} ${text}`.split(/\s+/).length <= 6) { previous.text += ` ${text}`; previous.end = end; }
    else cues.push({ id: id('cue'), start, end, text, emphasis: [] });
  }
  return cues;
}

export class EdgeTtsProvider implements TtsProvider {
  readonly id = 'edge-tts'; readonly name = 'Edge Neural Türkçe'; readonly supportsSpeed = true; readonly supportsPitch = true; readonly referenceVoiceSupported = false;
  constructor(private readonly ffmpeg: FFmpegService, private readonly pythonPath: () => string | undefined) {}
  private python(): string { return this.pythonPath() || process.env.NEDENMIS_TTS_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'); }
  async voices(): Promise<VoiceInfo[]> { return [
    { id: 'tr-TR-AhmetNeural', name: 'Ahmet · Doğal erkek', language: 'tr-TR', gender: 'male', description: 'Sakin Türkçe çevrimiçi nöral erkek ses.', styles: ['belgesel', 'samimi', 'sakin'] },
    { id: 'tr-TR-EmelNeural', name: 'Emel · Doğal kadın', language: 'tr-TR', gender: 'female', description: 'Anlaşılır Türkçe çevrimiçi nöral kadın ses.', styles: ['samimi', 'enerjik'] },
  ]; }
  async synthesize(request: TtsRequest, outputPath: string): Promise<Omit<TtsResult, 'path' | 'providerId'>> {
    const subtitlesPath = `${outputPath}.vtt`; const rate = `${request.selection.speed >= 1 ? '+' : ''}${Math.round((request.selection.speed - 1) * 100)}%`; const pitch = `${request.selection.pitch >= 0 ? '+' : ''}${Math.round(request.selection.pitch * 4)}Hz`;
    await exec(this.python(), ['-m', 'edge_tts', '--voice', request.selection.voiceId, '--rate', rate, '--pitch', pitch, '--text', request.text, '--write-media', outputPath, '--write-subtitles', subtitlesPath], { timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
    const probe = await this.ffmpeg.probe(outputPath); let cues: SubtitleCue[] | undefined;
    try { cues = parseEdgeVtt(await readFile(subtitlesPath, 'utf8')); await unlink(subtitlesPath); } catch { cues = undefined; }
    return { duration: probe.duration, timingMode: cues?.length ? 'aligned' : 'estimated', cues, notice: request.referenceVoicePath ? 'Edge TTS referans ses klonlamayı desteklemez; seçilen Ahmet veya Emel sesi kullanıldı.' : undefined };
  }
  async test(): Promise<ConnectionTestResult> { const started = Date.now(); try { const { stdout, stderr } = await exec(this.python(), ['-m', 'edge_tts', '--version'], { timeout: 15000 }); return { ok: true, message: `Edge TTS kurulu (${(stdout || stderr).trim()}). Kullanım koşullarını ticari kullanım öncesi inceleyin.`, latencyMs: Date.now() - started }; } catch { return { ok: false, message: 'İzole Python ortamında edge-tts bulunamadı. README’deki TTS kurulum adımlarını uygulayın ve Python yolunu seçin.' }; } }
}
