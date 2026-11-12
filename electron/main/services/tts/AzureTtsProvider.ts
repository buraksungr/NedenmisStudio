import { writeFile } from 'node:fs/promises';
import { escapeXml } from '../../../../shared/utils.js';
import type { ConnectionTestResult, TtsRequest, TtsResult, VoiceInfo } from '../../../../shared/types.js';
import type { CredentialStore } from '../../infrastructure/CredentialStore.js';
import type { FFmpegService } from '../../infrastructure/FFmpegService.js';
import type { TtsProvider } from './TtsProvider.js';

export class AzureTtsProvider implements TtsProvider {
  readonly id = 'azure-speech'; readonly name = 'Azure AI Speech'; readonly supportsSpeed = true; readonly supportsPitch = true; readonly referenceVoiceSupported = false;
  constructor(private readonly ffmpeg: FFmpegService, private readonly credentials: CredentialStore) {}
  private region(): string { return process.env.AZURE_SPEECH_REGION || 'westeurope'; }
  async voices(): Promise<VoiceInfo[]> { return [
    { id: 'tr-TR-AhmetNeural', name: 'Ahmet · Azure erkek', language: 'tr-TR', gender: 'male', description: 'Azure üzerinde doğal Türkçe erkek nöral ses.', styles: ['belgesel', 'sakin'] },
    { id: 'tr-TR-EmelNeural', name: 'Emel · Azure kadın', language: 'tr-TR', gender: 'female', description: 'Azure üzerinde doğal Türkçe kadın nöral ses.', styles: ['samimi'] },
  ]; }
  async synthesize(request: TtsRequest, outputPath: string): Promise<Omit<TtsResult, 'path' | 'providerId'>> {
    const key = this.credentials.get(this.id); if (!key) throw new Error('Azure Speech API anahtarı eksik.');
    const rate = `${Math.round((request.selection.speed - 1) * 100)}%`; const pitch = `${Math.round(request.selection.pitch * 4)}%`;
    const ssml = `<speak version="1.0" xml:lang="tr-TR"><voice name="${escapeXml(request.selection.voiceId)}"><prosody rate="${rate}" pitch="${pitch}">${escapeXml(request.text)}</prosody></voice></speak>`;
    const response = await fetch(`https://${this.region()}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'NedenmisStudio' }, body: ssml, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Azure Speech isteği başarısız (${response.status}): ${(await response.text()).slice(0, 300)}`);
    await writeFile(outputPath, Buffer.from(await response.arrayBuffer())); const probe = await this.ffmpeg.probe(outputPath);
    return { duration: probe.duration, timingMode: 'estimated', notice: request.referenceVoicePath ? 'Standart Azure sesleri referans kayıttan klonlama yapmaz. Özel ses için ayrı onay ve Azure Custom Neural Voice yetkisi gerekir.' : undefined };
  }
  async test(): Promise<ConnectionTestResult> { if (!this.credentials.has(this.id)) return { ok: false, message: 'Azure Speech anahtarı eksik.' }; const started = Date.now(); try { const response = await fetch(`https://${this.region()}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { headers: { 'Ocp-Apim-Subscription-Key': this.credentials.get(this.id)! }, signal: AbortSignal.timeout(15000) }); return { ok: response.ok, message: response.ok ? 'Azure Speech bağlantısı ve anahtar doğrulandı.' : `Azure anahtarı veya bölgesi geçersiz (HTTP ${response.status}).`, latencyMs: Date.now() - started }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Azure bağlantı testi başarısız.' }; } }
}
