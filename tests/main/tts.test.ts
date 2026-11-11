import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { MediaRepository } from '../../electron/main/infrastructure/database/MediaRepository.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { SettingsRepository } from '../../electron/main/infrastructure/database/SettingsRepository.js';
import { FFmpegService } from '../../electron/main/infrastructure/FFmpegService.js';
import { Logger } from '../../electron/main/infrastructure/Logger.js';
import { TtsService } from '../../electron/main/services/tts/TtsService.js';
import { VoiceEngineManager } from '../../electron/main/services/tts/VoiceEngineManager.js';
import { ChatterboxProvider } from '../../electron/main/services/tts/ChatterboxProvider.js';
import type { TtsProvider } from '../../electron/main/services/tts/TtsProvider.js';
import type { ConnectionTestResult, TtsRequest, VoiceInfo } from '../../shared/types.js';
import { projectInput } from '../helpers.js';

let directory: string; beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'nedenmis-tts-')); }); afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
function fakeProvider(id: string, calls: TtsRequest[]): TtsProvider { return { id, name: id, supportsSpeed: true, supportsPitch: false, referenceVoiceSupported: id.includes('chatterbox'), voices: async (): Promise<VoiceInfo[]> => [], synthesize: async (request, outputPath) => { calls.push(request); await writeFile(outputPath, 'test-audio'); return { duration: 1.25, timingMode: 'estimated' as const, engine: { model: 'routing-fake', checkpoint: 'routing-fake.safetensors', device: 'cpu', referenceSha256: 'a'.repeat(64), generationSeconds: 0, modelLoadSeconds: 0, unknownTokens: 0 } }; }, test: async (): Promise<ConnectionTestResult> => ({ ok: true, message: 'routing-test-only' }) }; }

describe('TTS sağlayıcı yönlendirmesi', () => {
  it('proje ve önizlemede seçilen motoru kullanır, referansı her sahneye geçirir ve SAPI’ye düşmez', async () => {
    const db = new AppDatabase(':memory:'); const projects = new ProjectRepository(db); const media = new MediaRepository(db); const chatterboxCalls: TtsRequest[] = []; const sapiCalls: TtsRequest[] = [];
    const chatterbox = fakeProvider('chatterbox-multilingual-v3', chatterboxCalls); const sapi = fakeProvider('windows-sapi', sapiCalls); const service = new TtsService(projects, media, new Map([[chatterbox.id, chatterbox], [sapi.id, sapi]]), () => directory);
    const referencePath = join(directory, 'reference_voice.wav'); await writeFile(referencePath, 'reference'); media.upsertByPath({ kind: 'reference-voice', name: 'ref', path: referencePath, mimeType: 'audio/wav', size: 9, duration: 8 });
    const project = projects.create(projectInput()); project.voice = { providerId: chatterbox.id, voiceId: 'reference-tr', speed: 1, pitch: 0 }; project.scenes = [1, 2].map((number) => ({ id: `scene-${number}`, number, narration: `Sahne ${number}`, visualDescription: '', visualPrompt: '', assetType: 'procedural' as const, duration: 3, transition: 'fade' as const, cameraMovement: 'static' as const, subtitles: [], subtitleTiming: 'estimated' as const, status: 'empty' as const })); projects.update(project);
    const result = await service.generateProject(project.id); expect(chatterboxCalls).toHaveLength(2); expect(sapiCalls).toHaveLength(0); expect(chatterboxCalls.every((request) => request.referenceVoicePath === referencePath)).toBe(true); expect(result.scenes.every((scene) => scene.narrationPath?.includes('chatterbox-multilingual-v3'))).toBe(true);
    const preview = await service.preview({ text: 'SAPI seçildi', selection: { providerId: sapi.id, voiceId: 'auto-tr', speed: 1, pitch: 0 } }); expect(preview.providerId).toBe(sapi.id); expect(sapiCalls).toHaveLength(1); expect(chatterboxCalls).toHaveLength(2); db.close();
  });
  it('sayıları yalnızca TTS kopyasında normalize eder, özgün anlatımı ve altyazıyı korur', async () => {
    const db = new AppDatabase(':memory:'); const projects = new ProjectRepository(db); const media = new MediaRepository(db); const calls: TtsRequest[] = [];
    const provider = fakeProvider('chatterbox-multilingual-v3', calls); const service = new TtsService(projects, media, new Map([[provider.id, provider]]), () => directory);
    const project = projects.create(projectInput()); project.voice = { providerId: provider.id, voiceId: 'reference-tr', speed: 1, pitch: 0 };
    project.scenes = [{ id: 'numbers', number: 1, narration: '%35 ve 25 km. Yıl 2026.', visualDescription: '', visualPrompt: '', assetType: 'procedural', duration: 4, transition: 'fade', cameraMovement: 'static', subtitles: [], subtitleTiming: 'estimated', status: 'empty' }]; projects.update(project);
    const result = await service.generateProject(project.id);
    expect(calls[0].text).toBe('yüzde otuz beş ve yirmi beş kilometre. Yıl iki bin yirmi altı.');
    expect(result.scenes[0].narration).toBe('%35 ve 25 km. Yıl 2026.');
    expect(result.scenes[0].ttsText).toBe(calls[0].text);
    expect(result.scenes[0].ttsEngine?.checkpoint).toBe('routing-fake.safetensors'); expect(projects.get(project.id).scenes[0].ttsEngine?.unknownTokens).toBe(0);
    expect(result.scenes[0].subtitles.map((cue) => cue.text).join(' ')).toContain('%35');
    expect(result.scenes[0].subtitles.map((cue) => cue.text).join(' ')).toContain('2026');
    db.close();
  });
  it('gerçek Chatterbox kurulmadan başarı veya alternatif motor sonucu üretmez', async () => {
    const db = new AppDatabase(':memory:'); const settings = new SettingsRepository(db); const referencePath = join(directory, 'reference.wav'); await writeFile(referencePath, 'reference');
    const manager = new VoiceEngineManager(() => directory, join(process.cwd(), 'voice-engine'), settings, new Logger(join(directory, 'logs')), () => referencePath, () => undefined); const provider = new ChatterboxProvider(manager, new FFmpegService(() => undefined), () => directory, () => referencePath);
    await expect(provider.synthesize({ text: 'Gerçek model yok', selection: { providerId: provider.id, voiceId: 'reference-tr', speed: 1, pitch: 0 } }, join(directory, 'output.wav'))).rejects.toThrow('Chatterbox henüz kurulmadı'); expect((await manager.status()).verifiedAt).toBeUndefined(); manager.close(); db.close();
  });
});

describe('TTS sağlayıcı seçimi — sessiz motor değişimi yok', () => {
  it('seçili sağlayıcı yoksa başka motora geçmeden hata verir', async () => {
    const { TtsService } = await import('../../electron/main/services/tts/TtsService.js');
    const service = new TtsService({} as never, {} as never, new Map(), () => '/tmp');
    await expect(service.preview({ text: 'Merhaba', selection: { providerId: 'chatterbox-multilingual-v3', voiceId: 'reference-tr', speed: 1, pitch: 0 } }))
      .rejects.toThrow(/Otomatik olarak başka bir motora geçilmedi/);
  });

  it('Chatterbox sağlayıcısı seçim kimliği uyuşmazsa üretim yapmaz', async () => {
    const { ChatterboxProvider } = await import('../../electron/main/services/tts/ChatterboxProvider.js');
    const manager = { synthesize: vi.fn() } as never;
    const provider = new ChatterboxProvider(manager, { run: vi.fn() } as never, () => '/tmp', () => '/tmp/reference.wav');
    await expect(provider.synthesize({ text: 'Merhaba', selection: { providerId: 'windows-sapi', voiceId: 'tr', speed: 1, pitch: 0 } }, '/tmp/out.wav'))
      .rejects.toThrow(/başka bir motora geçilmedi/);
  });

  it('Chatterbox hata verirse çıktı başka motorla doldurulmaz', async () => {
    const { ChatterboxProvider } = await import('../../electron/main/services/tts/ChatterboxProvider.js');
    const manager = { synthesize: vi.fn().mockRejectedValue(new Error('model yüklenemedi')) } as never;
    const provider = new ChatterboxProvider(manager, { run: vi.fn() } as never, () => '/tmp', () => '/tmp/reference.wav');
    await expect(provider.synthesize({ text: 'Merhaba', selection: { providerId: 'chatterbox-multilingual-v3', voiceId: 'reference-tr', speed: 1, pitch: 0 } }, '/tmp/out.wav'))
      .rejects.toThrow(/Chatterbox klonlama başarısız: model yüklenemedi/);
  });
});
