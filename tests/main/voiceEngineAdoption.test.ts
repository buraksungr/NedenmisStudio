import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { CHATTERBOX_MODEL_REVISION } from '../../electron/main/services/tts/ChatterboxSource.js';
import { REQUIRED_MODEL_FILES } from '../../electron/main/services/tts/VoiceEngineManager.js';

/**
 * Kurulum kaydı ile gerçek dosyalar çelişebilir. `adoptInstalled()` kayda
 * güvenmek yerine yönetilen Python'u çalıştırıp paket kimliğini yeniden ölçer.
 *
 * Platformdan bağımsızdır: alt süreç (spawn) taklit edilir, gerçek yürütülebilir
 * dosya oluşturulmaz. Böylece Windows CI'da `bin/python` yolu veya kabuk betiği
 * nedeniyle düşmez (CI 43033196862 / 43241285679 regresyonu).
 */
const directory = await mkdtemp(join(tmpdir(), 'nedenmis-adopt-'));
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

const MTL = '936759044e54cffe8c68b91b32e01da0bc032a1e084f769f0403080d86ad153c';
const TOKENIZER = 'e169f02f14b008e8e7a4f29df66ecafaa29972ff4a38724b51545b8563861889';
// child_process, modül yüklenirken taklit edilir (hoisted).
const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: spawnMock };
});

interface Installed { v3?: boolean; mtl?: string; tokenizer?: string; cuda?: boolean }

/** Gerçek `spawn` sözleşmesini taklit eder: stdout'a bridge.py status satırı basar. */
function fakeStatusProcess(installed: Installed): void {
  spawnMock.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; stdin: { write: () => void }; kill: () => void };
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = { write: () => undefined }; child.kill = () => undefined;
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(`${JSON.stringify({
        event: 'status', python: '3.11.9', torch: '2.6.0', cuda: installed.cuda ?? false,
        v3_supported: installed.v3 ?? true, watermarker_ready: true, chatterbox: '0.1.4',
        mtl_tts_sha256: installed.mtl ?? MTL, tokenizer_sha256: installed.tokenizer ?? TOKENIZER,
      })}\n`));
      child.emit('close', 0);
    });
    return child;
  });
}

async function scaffold(): Promise<{ root: string; repository: { get: (key: string) => unknown; set: (key: string, value: unknown) => void } }> {
  const root = await mkdtemp(join(directory, 'root-'));
  // VoiceEngineManager kökü <storage>/voice-engine'dir; Python yolu platforma göre çözülür.
  const component = join(root, 'voice-engine');
  // python(): <kök>/runtime/python.exe (Windows) veya <kök>/runtime/bin/python.
  const runtime = process.platform === 'win32' ? join(component, 'runtime') : join(component, 'runtime', 'bin');
  await mkdir(runtime, { recursive: true });
  await writeFile(join(runtime, process.platform === 'win32' ? 'python.exe' : 'python'), 'stub', { mode: 0o755 });
  const pinned = join(component, 'models', 'hub', 'models--ResembleAI--chatterbox', 'snapshots', CHATTERBOX_MODEL_REVISION);
  await mkdir(pinned, { recursive: true });
  for (const file of REQUIRED_MODEL_FILES) await writeFile(join(pinned, file), 'x');
  // Gerçek SettingsRepository sözleşmesi: anahtar başına değer saklar.
  const store = new Map<string, unknown>();
  const repository = { get<T>(key: string): T { return (store.get(key) ?? {}) as T; }, set(key: string, value: unknown): void { store.set(key, value); } };
  return { root, repository };
}

async function managerFor(root: string, repository: unknown) {
  const { VoiceEngineManager } = await import('../../electron/main/services/tts/VoiceEngineManager.js');
  return new VoiceEngineManager(() => root, join(root, 'resources'), repository as never, { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never, () => undefined, () => undefined);
}

describe('Kurulu bileşenin gerçek dosyalardan benimsenmesi', () => {
  it('boş kayda rağmen kurulu bileşeni doğrular ve durumu yeniden kaydeder', async () => {
    fakeStatusProcess({});
    const { root, repository } = await scaffold();
    const manager = await managerFor(root, repository);
    expect((await manager.status()).dependenciesInstalled).toBe(false);

    const adopted = await manager.adoptInstalled();
    expect(adopted.dependenciesInstalled).toBe(true);
    expect(adopted.modelDownloaded).toBe(true);
    expect(adopted.chatterboxSourceSha256).toBe(MTL);
    expect(adopted.chatterboxTokenizerSha256).toBe(TOKENIZER);
    expect((await manager.status()).dependenciesInstalled).toBe(true);
  }, 60_000);

  it('kimlik uyuşmazlığında kurulumu kabul etmez ve kaydı bozmaz', async () => {
    // Sabitlenen V3 kaynağından farklı mtl_tts.py özeti: V2/V3 karışması sessizce kabul edilmemeli.
    fakeStatusProcess({ mtl: 'f'.repeat(64) });
    const { root, repository } = await scaffold();
    const manager = await managerFor(root, repository);
    await expect(manager.adoptInstalled()).rejects.toThrow(/sabitlenen V3 commit ile eşleşmiyor/);
    expect((await manager.status()).dependenciesInstalled).toBe(false);
  }, 60_000);

  it('V3 desteklemeyen paketi kabul etmez', async () => {
    fakeStatusProcess({ v3: false });
    const { root, repository } = await scaffold();
    const manager = await managerFor(root, repository);
    await expect(manager.adoptInstalled()).rejects.toThrow(/Multilingual V3 desteklemiyor/);
  }, 60_000);

  it('CUDA etkin PyTorch kurulumunu kabul etmez', async () => {
    fakeStatusProcess({ cuda: true });
    const { root, repository } = await scaffold();
    const manager = await managerFor(root, repository);
    await expect(manager.adoptInstalled()).rejects.toThrow(/CUDA/);
  }, 60_000);

  it('yönetilen Python yoksa kurulumu kabul etmez', async () => {
    fakeStatusProcess({});
    const { root, repository } = await scaffold();
    await rm(join(root, 'voice-engine', 'runtime'), { recursive: true, force: true });
    const manager = await managerFor(root, repository);
    await expect(manager.adoptInstalled()).rejects.toThrow(/Yönetilen Python bulunamadı/);
    expect(existsSync(join(root, 'voice-engine', 'runtime'))).toBe(false);
  }, 60_000);
});
