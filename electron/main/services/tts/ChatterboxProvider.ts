import { stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { id } from '../../../../shared/utils.js';
import type { ConnectionTestResult, TtsRequest, TtsResult, VoiceInfo } from '../../../../shared/types.js';
import type { FFmpegService } from '../../infrastructure/FFmpegService.js';
import type { TtsProvider } from './TtsProvider.js';
import type { VoiceEngineManager } from './VoiceEngineManager.js';

export class ChatterboxProvider implements TtsProvider {
  readonly id = 'chatterbox-multilingual-v3'; readonly name = 'Chatterbox Multilingual V3'; readonly supportsSpeed = true; readonly supportsPitch = false; readonly referenceVoiceSupported = true;
  constructor(private readonly manager: VoiceEngineManager, private readonly ffmpeg: FFmpegService, private readonly storagePath: () => string, private readonly referencePath: () => string | undefined) {}
  async voices(): Promise<VoiceInfo[]> { return [{ id: 'reference-tr', name: 'Kayıtlı referans konuşmacı', language: 'tr-TR', gender: 'unknown', description: 'Yüklediğiniz izinli kayıttan çıkarılan konuşmacı koşullarıyla gerçek zero-shot Türkçe ses klonlama.', styles: ['belgesel', 'samimi', 'sakin', 'enerjik'] }]; }
  async synthesize(request: TtsRequest, outputPath: string): Promise<Omit<TtsResult, 'path' | 'providerId'>> {
    const reference = this.referencePath(); if (!reference) throw new Error('Chatterbox için referans ses gerekli. WAV, MP3 veya M4A kaydınızı yükleyin.');
    if (request.selection.providerId !== this.id) throw new Error('Chatterbox sağlayıcı seçimi doğrulanamadı; başka bir motora geçilmedi.');
    const rawPath = `${outputPath}.v3-model.wav`;
    try {
      // Ayar kaydı eksik/bozuksa model argümanı NaN olmamalı: her değer doğrulanır.
      const bounded = (value: number | undefined, fallback: number, low: number, high: number) => Number.isFinite(value) ? Math.min(high, Math.max(low, value as number)) : fallback;
      const generated = await this.manager.synthesize({ id: id('chatterbox'), text: request.text, referencePath: reference, outputPath: rawPath, exaggeration: bounded(request.selection.exaggeration, .5, .25, 2), cfgWeight: bounded(request.selection.cfgWeight, .5, 0, 1), temperature: bounded(request.selection.temperature, .8, .05, 1.5) });
      const speed = bounded(request.selection.speed, 1, .5, 2);
      const filters = Math.abs(speed - 1) > .001 ? `atempo=${speed.toFixed(3)}` : 'anull';
      await this.ffmpeg.run(id('chatterbox-ffmpeg'), ['-i', rawPath, '-af', filters, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', outputPath]);
      const info = await stat(outputPath); if (info.size < 1000) throw new Error('Chatterbox çıktı sesi boş.');
      const probe = await this.ffmpeg.probe(outputPath);
      return { duration: probe.duration, timingMode: 'estimated', notice: `Chatterbox Multilingual V3 gerçek referans koşullarıyla CPU üzerinde üretti · ${generated.generationSeconds.toFixed(1)} sn çıkarım. Benzerlik ve telaffuz dinlenerek doğrulanmalıdır.`, engine: { model: generated.model, checkpoint: generated.checkpoint, device: generated.device, referenceSha256: generated.referenceSha256, generationSeconds: generated.generationSeconds, modelLoadSeconds: generated.modelLoadSeconds, modelRevision: generated.modelRevision, textPreprocessing: generated.textPreprocessing, normalizedText: generated.normalizedText, decodedText: generated.decodedText, tokenCount: generated.tokenCount, unknownTokens: generated.unknownTokens, sampleRate: generated.sampleRate, channels: generated.channels } };
    } catch (error) { throw new Error(`Chatterbox klonlama başarısız: ${error instanceof Error ? error.message : String(error)}`); }
    finally { await unlink(rawPath).catch(() => undefined); }
  }
  async test(): Promise<ConnectionTestResult> {
    const status = await this.manager.status();
    if (!status.runtimeInstalled || !status.dependenciesInstalled || !status.modelDownloaded) return { ok: false, message: 'Önce yönetilen Python, CPU bağımlılıkları ve Multilingual V3 modelini kurun.' };
    if (!this.referencePath()) return { ok: false, message: 'Gerçek klonlama testi için önce izinli bir referans ses yükleyin.' };
    const started = Date.now(); const output = join(this.storagePath(), 'previews', `chatterbox-dogrulama-${Date.now()}.wav`);
    try { const result = await this.synthesize({ text: 'Merhaba. Bu kayıt, Chatterbox Multilingual V3 ile gerçek referans ses kullanılarak üretilen Türkçe bir sınamadır.', selection: { providerId: this.id, voiceId: 'reference-tr', speed: 1, pitch: 0 }, referenceVoicePath: this.referencePath() }, output); return { ok: true, message: `Gerçek referanslı Türkçe V3 sentezi başarılı · ${result.duration.toFixed(1)} sn ses · ${result.engine!.generationSeconds.toFixed(1)} sn CPU çıkarımı. Dosya: ${output}`, latencyMs: Date.now() - started }; }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Gerçek Chatterbox testi başarısız.', latencyMs: Date.now() - started }; }
  }
}
