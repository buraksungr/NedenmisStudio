/**
 * BUILD 44 · BUG 1 — Script üretimi ve araştırma IPC sözleşmesi.
 *
 * Bu test GERÇEK IPC yolunu çalıştırır: `registerIpc` gerçek handler'ları
 * kaydeder, test frontend'in gönderdiği YÜKLEMLERİNİ birebir çağırır.
 * Böylece "beklenen string, alınan object" hatasının kaynağı ölçülür.
 *
 * Yüklemeler `src/renderer/pages/CreateVideo.tsx` ve `shared/types.ts`
 * (`AppApi` sözleşmesi) ile birebir aynıdır.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handlers } from '../stubs/electron.js';
import { createAppContext } from '../../electron/main/services/AppContext.js';
import { registerIpc } from '../../electron/main/ipc/registerIpc.js';

const directory = await mkdtemp(join(tmpdir(), 'nedenmis-b44-ipc-'));
const context = createAppContext(directory, join(directory, 'studio.sqlite'), () => undefined);

function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`IPC kanalı kayıtlı değil: ${channel}`);
  return Promise.resolve(handler(...args) as T);
}

afterAll(async () => { context.database.close(); await rm(directory, { recursive: true, force: true }); });

describe('BUILD 44 · Bug 1 — araştırma ve senaryo üretimi sözleşmesi', () => {
  let projectId = '';

  beforeAll(async () => {
    registerIpc(context as never, {} as never, directory);
    const project = await invoke<{ id: string }>('projects:create', {
      topic: 'Ahtapotlar nasıl renk değiştirir?', name: 'Ahtapotlar nasıl renk değiştirir?',
      category: 'Hayvanlar', mode: 'automatic', targetDuration: 45, narrationStyle: 'belgesel', visualStyle: 'infografik',
    });
    projectId = project.id;
  });

  it('"Araştırmayı çalıştır" gerçek araştırma yolunu çalıştırır', async () => {
    // Frontend yükü: window.nedenmis.research.run(project.id) → string.
    const result = await invoke<{ status: string; sources: unknown[]; provider: string }>('research:run', projectId);
    expect(result).toBeTruthy();
    expect(typeof result.status).toBe('string');
    expect(Array.isArray(result.sources)).toBe(true);
  });

  it('"Senaryoyu üret" frontend sözleşmesindeki ScriptRequest yükünü kabul eder', async () => {
    // Frontend yükü (CreateVideo.tsx): { projectId, useResearch: true }.
    // shared/types.ts sözleşmesi: generateScript(request: ScriptRequest).
    const project = await invoke<{ script: string; status: string }>('ai:script', { projectId, useResearch: true });
    expect(project).toBeTruthy();
    expect(typeof project.script).toBe('string');
    expect(project.script.length).toBeGreaterThan(0);
    expect(project.status).toBe('script_ready');
  });

  it('araştırma sonucu, kaynakları ve üretilen senaryoyu korur', async () => {
    const project = await invoke<{ research: { status: string; sources: unknown[] }; script: string }>('projects:get', projectId);
    expect(project.research).toBeTruthy();
    expect(typeof project.research.status).toBe('string');
    expect(Array.isArray(project.research.sources)).toBe(true);
    expect(project.script.length).toBeGreaterThan(0);
  });

  it('eksik ve geçersiz girdiler anlamlı Türkçe hata verir', async () => {
    await expect(invoke('ai:script', { useResearch: true })).rejects.toThrow(/projectId/);
    await expect(invoke('ai:script', { projectId, useResearch: 'yes' })).rejects.toThrow(/useResearch/);
    await expect(invoke('research:run', '')).rejects.toThrow();
    await expect(invoke('ai:script', { projectId: 'bilinmeyen-proje', useResearch: true })).rejects.toThrow();
  });
});
