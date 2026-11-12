import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { id } from '../../../../shared/utils.js';
import type { ConnectionTestResult, TtsRequest, TtsResult, VoiceInfo } from '../../../../shared/types.js';
import type { FFmpegService } from '../../infrastructure/FFmpegService.js';
import type { TtsProvider } from './TtsProvider.js';

const exec = promisify(execFile);
const powershell = (): string => process.platform === 'win32' ? 'powershell.exe' : 'pwsh';

export class WindowsSapiProvider implements TtsProvider {
  readonly id = 'windows-sapi'; readonly name = 'Windows Türkçe Ses'; readonly supportsSpeed = true; readonly supportsPitch = false; readonly referenceVoiceSupported = false;
  constructor(private readonly ffmpeg: FFmpegService) {}
  async voices(): Promise<VoiceInfo[]> {
    if (process.platform !== 'win32') return [{ id: 'auto-tr', name: 'Otomatik Türkçe erkek ses', language: 'tr-TR', gender: 'male', description: 'Windows’ta kurulu Türkçe SAPI sesi otomatik seçilir.', styles: ['belgesel', 'sakin'] }];
    try {
      const script = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.GetInstalledVoices() | ForEach-Object { [PSCustomObject]@{id=$_.VoiceInfo.Name;name=$_.VoiceInfo.Name;language=$_.VoiceInfo.Culture.Name;gender=$_.VoiceInfo.Gender.ToString()} } | ConvertTo-Json -Compress`;
      const { stdout } = await exec(powershell(), ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 15000 });
      const raw = JSON.parse(stdout || '[]') as Array<{ id: string; name: string; language: string; gender: string }> | { id: string; name: string; language: string; gender: string };
      const list = (Array.isArray(raw) ? raw : [raw]).filter((v) => v.language.toLowerCase().startsWith('tr'));
      if (list.length) return list.map((voice) => ({ id: voice.id, name: voice.name, language: voice.language, gender: voice.gender.toLowerCase() === 'male' ? 'male' : voice.gender.toLowerCase() === 'female' ? 'female' : 'unknown', description: 'Windows’ta kurulu yerel konuşma sentezi sesi.', styles: ['belgesel'] }));
    } catch { /* Otomatik seçimle devam et. */ }
    return [{ id: 'auto-tr', name: 'Otomatik Türkçe ses', language: 'tr-TR', gender: 'unknown', description: 'Kurulu ilk Türkçe Windows sesi kullanılır.', styles: ['belgesel'] }];
  }
  async synthesize(request: TtsRequest, outputPath: string): Promise<Omit<TtsResult, 'path' | 'providerId'>> {
    if (process.platform !== 'win32') throw new Error('Windows SAPI seslendirme yalnızca Windows’ta kullanılabilir. Edge TTS veya Azure sağlayıcısını yapılandırın.');
    const textPath = join(tmpdir(), `${id('tts-text')}.txt`); await writeFile(textPath, request.text, 'utf8');
    const voice = request.selection.voiceId === 'auto-tr' ? `$v=$s.GetInstalledVoices() | Where-Object {$_.VoiceInfo.Culture.Name -like 'tr*'} | Select-Object -First 1; if($v){$s.SelectVoice($v.VoiceInfo.Name)}else{throw 'Kurulu Türkçe Windows sesi bulunamadı. Windows Ayarlar > Saat ve dil > Konuşma bölümünden Türkçe ses paketini kurun.'}` : `$s.SelectVoice('${request.selection.voiceId.replaceAll("'", "''")}')`;
    const rate = Math.max(-10, Math.min(10, Math.round((request.selection.speed - 1) * 10)));
    const script = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; ${voice}; $s.Rate=${rate}; $t=[IO.File]::ReadAllText('${textPath.replaceAll("'", "''")}',[Text.Encoding]::UTF8); $s.SetOutputToWaveFile('${outputPath.replaceAll("'", "''")}'); $s.Speak($t); $s.Dispose()`;
    try { await exec(powershell(), ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 120000, maxBuffer: 1024 * 1024 }); } finally { const { unlink } = await import('node:fs/promises'); await unlink(textPath).catch(() => undefined); }
    const probe = await this.ffmpeg.probe(outputPath);
    return { duration: probe.duration, timingMode: 'estimated', notice: request.referenceVoicePath ? 'Windows SAPI referans sesten klonlama yapmaz; seçtiğiniz kurulu sistem sesi kullanıldı.' : undefined };
  }
  async test(): Promise<ConnectionTestResult> { if (process.platform !== 'win32') return { ok: false, message: 'Bu sağlayıcı yalnızca Windows’ta çalışır.' }; const voices = await this.voices(); return voices.some((v) => v.language.startsWith('tr')) ? { ok: true, message: 'Windows Türkçe ses altyapısı kullanılabilir.' } : { ok: false, message: 'Kurulu Türkçe SAPI sesi bulunamadı.' }; }
}
