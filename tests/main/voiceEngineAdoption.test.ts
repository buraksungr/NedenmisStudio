import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { CHATTERBOX_MODEL_REVISION } from '../../electron/main/services/tts/ChatterboxSource.js';
import { REQUIRED_MODEL_FILES } from '../../electron/main/services/tts/VoiceEngineManager.js';

/**
 * Kurulum kaydı ile gerçek dosyalar çelişebilir. `adoptInstalled()` yalnızca
 * kayda güvenmek yerine yönetilen Python'u çalıştırıp paket kimliğini yeniden
 * ölçer. Bu test, kayıt boşken bile kurulu bileşenin kabul edildiğini ve
 * kimlik uyuşmazlığında reddedildiğini doğrular (CI 43033196862 regresyonu).
 */
const directory = await mkdtemp(join(tmpdir(), 'nedenmis-adopt-'));
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

const MTL = '936759044e54cffe8c68b91b32e01da0bc032a1e084f769f0403080d86ad153c';
const TOKENIZER = 'e169f02f14b008e8e7a4f29df66ecafaa29972ff4a38724b51545b8563861889';

async function scaffold(identity: Record<string, unknown> | null): Promise<{ root: string; repository: { get: (key: string) => unknown; set: (key: string, value: unknown) => void } }> {
  const root = await mkdtemp(join(directory, 'root-'));
  // VoiceEngineManager kökü <storage>/voice-engine'dir.
  const component = join(root, 'voice-engine');
  const runtime = join(component, 'runtime'); await mkdir(runtime, { recursive: true });
  // Yönetilen Python yerine, `status` çağrısına JSON basan bir kabuk betiği.
  const script = join(runtime, 'bin'); await mkdir(script, { recursive: true });
  const identityJson = JSON.stringify({ event: 'status', python: '3.11.9', torch: '2.6.0', cuda: false, v3_supported: identity?.v3_supported ?? true, watermarker_ready: true, chatterbox: '0.1.4', mtl_tts_sha256: identity?.mtl_tts_sha256 ?? MTL, tokenizer_sha256: identity?.tokenizer_sha256 ?? TOKENIZER });
  // JSON tek tırnak içinde verilir: gerçek bridge.py de çift tırnaklı JSON basar.
  await writeFile(join(script, 'python'), `#!/bin/sh\necho '${identityJson}'\n`, { mode: 0o755 });
  const snapshots = join(component, 'models', 'hub', 'models--ResembleAI--chatterbox', 'snapshots');
  const pinned = join(snapshots, CHATTERBOX_MODEL_REVISION); await mkdir(pinned, { recursive: true });
  for (const file of REQUIRED_MODEL_FILES) await writeFile(join(pinned, file), 'x');
  // Gerçek SettingsRepository sözleşmesi: anahtar başına değer saklar.
  const store = new Map<string, unknown>();
  const repository = { get<T>(key: string): T { return (store.get(key) ?? {}) as T; }, set(key: string, value: unknown): void { store.set(key, value); } };
  return { root, repository };
}

describe('Kurulu bileşenin gerçek dosyalardan benimsenmesi', () => {
  it('boş kayda rağmen kurulu bileşeni doğrular ve durumu yeniden kaydeder', async () => {
    const { VoiceEngineManager } = await import('../../electron/main/services/tts/VoiceEngineManager.js');
    const { root, repository } = await scaffold(null);
    const manager = new VoiceEngineManager(() => root, join(root, 'resources'), repository as never, { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never, () => undefined, () => undefined);
    const before = await manager.status();
    expect(before.dependenciesInstalled).toBe(false);
    const adopted = await manager.adoptInstalled();
    expect(adopted.dependenciesInstalled).toBe(true);
    expect(adopted.modelDownloaded).toBe(true);
    expect(adopted.chatterboxSourceSha256).toBe(MTL);
    const after = await manager.status();
    expect(after.dependenciesInstalled).toBe(true);
    expect(existsSync(join(root, 'voice-engine', 'runtime', 'bin', 'python'))).toBe(true);
  }, 60_000);

  it('kimlik uyuşmazlığında kurulumu kabul etmez ve kaydı bozmaz', async () => {
    const { VoiceEngineManager } = await import('../../electron/main/services/tts/VoiceEngineManager.js');
    // Sabitlenen V3 kaynağından farklı mtl_tts.py özeti: V2/V3 karışması sessizce kabul edilmemeli.
    const { root, repository } = await scaffold({ mtl_tts_sha256: 'f'.repeat(64) });
    const manager = new VoiceEngineManager(() => root, join(root, 'resources'), repository as never, { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never, () => undefined, () => undefined);
    await expect(manager.adoptInstalled()).rejects.toThrow(/sabitlenen V3 commit ile eşleşmiyor/);
    const after = await manager.status();
    expect(after.dependenciesInstalled).toBe(false);
  }, 60_000);

  it('yönetilen Python yoksa kurulumu kabul etmez', async () => {
    const { VoiceEngineManager } = await import('../../electron/main/services/tts/VoiceEngineManager.js');
    const { rm } = await import('node:fs/promises');
    const { root, repository } = await scaffold(null);
    await rm(join(root, 'voice-engine', 'runtime'), { recursive: true, force: true });
    const manager = new VoiceEngineManager(() => root, join(root, 'resources'), repository as never, { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never, () => undefined, () => undefined);
    await expect(manager.adoptInstalled()).rejects.toThrow(/Yönetilen Python bulunamadı/);
  }, 60_000);
});
