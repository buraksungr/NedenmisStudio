// @vitest-environment jsdom
/**
 * BUILD 44 · Bug 1 — Script üretimi ekranı, gerçek IPC sözleşmesiyle.
 *
 * Bu test "Araştırma ve üretim" bölümündeki üç düğmeye de basar ve şunları
 * doğrular:
 *   1. "Araştırmayı çalıştır" doğrulama hatası vermez.
 *   2. "Senaryoyu üret" doğrulama hatası vermez ve senaryoyu gösterir.
 *   3. "Araştır + senaryoyu hazırla" ikisini birlikte çalıştırır.
 *   4. Hata olursa YALNIZCA BİR bildirim gösterilir (yinelenen bildirim yok).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppApi, Project } from '../../shared/types';
import { DEFAULT_IDENTITY, defaultSettings } from '../../shared/defaults';
import { App } from '../../src/renderer/App';

const TOPIC = 'Ahtapotlar nasıl renk değiştirir?';

function makeProject(): Project {
  const now = new Date().toISOString();
  return {
    id: 'project_test', name: TOPIC, topic: TOPIC, category: 'Hayvanlar', mode: 'automatic', status: 'draft',
    instructions: '', targetDuration: 30, narrationStyle: 'belgesel', visualStyle: 'infografik', script: '',
    scenes: [], research: { status: 'not_started', sources: [] },
    audio: { narrationVolume: 1, musicVolume: .3, sfxVolume: .6, musicDucking: true, musicClips: [], sfxClips: [] },
    subtitleStyle: { fontFamily: 'Inter', fontSize: 42, color: '#FFFFFF', highlightColor: '#D8FF65', outlineColor: '#000000', outlineWidth: 3, position: 'bottom' },
    brand: { channelName: 'Nedenmiş', primaryColor: '#D8FF65', secondaryColor: '#71D5E5' },
    voice: { providerId: 'windows-sapi', voiceId: 'auto-tr', speed: 1, pitch: 0 },
    createdAt: now, updatedAt: now,
  } as unknown as Project;
}

function mockApi(overrides: Partial<AppApi> = {}): AppApi {
  const project = makeProject();
  const researched: Project = { ...project, status: 'researched', research: { status: 'completed', provider: 'Çevrimdışı konu havuzu', sources: [{ id: 'src1', url: 'https://example.com/ahtapot', title: 'Ahtapot renk değiştirme', snippet: 'Kromatofor hücreleri', retrievedAt: new Date().toISOString(), claims: [] }] } };
  const scripted: Project = { ...researched, status: 'script_ready', script: 'Ahtapotlar renklerini nasıl değiştirir? Kromatofor hücreleri pigmenti toplar. Böylece kamuflaj sağlanır.' };
  return {
    projects: { list: vi.fn().mockResolvedValue([project]), get: vi.fn().mockResolvedValue(researched), create: vi.fn().mockResolvedValue(project), update: vi.fn().mockImplementation(async (next: Project) => next) },
    research: { run: vi.fn().mockResolvedValue(researched.research) },
    ai: {
      generateScript: vi.fn().mockResolvedValue(scripted),
      generateScenes: vi.fn().mockResolvedValue(scripted),
      rewrite: vi.fn().mockResolvedValue('yeniden yazıldı'),
    },
    topics: { discover: vi.fn().mockResolvedValue([{ id: 't1', title: TOPIC, category: 'Hayvanlar', hook: 'Nasıl renk değiştirir?', score: 90, reason: 'Görsel potansiyel' }]) },
    settings: { get: vi.fn().mockResolvedValue(defaultSettings('/tmp/nedenmis')) },
    identity: { get: vi.fn().mockResolvedValue(DEFAULT_IDENTITY) },
    dashboard: { stats: vi.fn().mockResolvedValue({ projectCount: 1, completedCount: 0, totalRenderedSeconds: 0, exportCount: 0, weeklyProjects: 0 }) },
    exports: { list: vi.fn().mockResolvedValue([]), onProgress: vi.fn().mockReturnValue(() => undefined) },
    system: { info: vi.fn().mockResolvedValue({ platform: 'win32', version: '1.0.0', ffmpegAvailable: true, storagePath: '/tmp', cpuCores: 4, totalMemoryGB: 8, freeMemoryGB: 5.5 }), mediaUrl: (path?: string) => path || '' },
    media: { list: vi.fn().mockResolvedValue([]) },
    voiceEngine: { status: vi.fn().mockResolvedValue({ runtimeInstalled: false, dependenciesInstalled: false, modelDownloaded: false, referenceAvailable: false, setupRunning: false, componentPath: '/tmp/voice-engine' }), setup: vi.fn(), onProgress: vi.fn().mockReturnValue(() => undefined) },
    tts: { providers: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as AppApi;
}

/** Ekranda görünen hata bildirimi sayısı. */
function errorToasts(): HTMLElement[] {
  return screen.queryAllByText(/Invalid input|expected string|doğrulanamadı|Beklenen tür/);
}

describe('BUILD 44 · Script üretimi ekranı', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function openScriptStep(api: AppApi): Promise<void> {
    window.nedenmis = api;
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni video' }));
    const topicInput = await screen.findByPlaceholderText(/Örn\. Gökyüzü/i);
    fireEvent.change(topicInput, { target: { value: TOPIC } });
    fireEvent.click(await screen.findByRole('button', { name: 'Projeyi oluştur' }));
    await screen.findByText('Araştırma ve üretim');
  }

  it('"Araştırmayı çalıştır" doğrulama hatası vermez', async () => {
    const api = mockApi();
    await openScriptStep(api);
    fireEvent.click(screen.getByRole('button', { name: 'Araştırmayı çalıştır' }));
    await waitFor(() => expect(api.research.run).toHaveBeenCalled());
    await waitFor(() => expect(errorToasts()).toHaveLength(0));
  });

  it('"Senaryoyu üret" frontend sözleşmesindeki ScriptRequest yükünü gönderir ve senaryoyu gösterir', async () => {
    const api = mockApi();
    await openScriptStep(api);
    fireEvent.click(screen.getByRole('button', { name: 'Senaryoyu üret' }));
    await waitFor(() => expect(api.ai.generateScript).toHaveBeenCalled());
    // SÖZLEŞME: nesne gönderilir, düz kimlik değil.
    expect(api.ai.generateScript).toHaveBeenCalledWith({ projectId: 'project_test', useResearch: true });
    await waitFor(() => expect(screen.getAllByDisplayValue(/Kromatofor hücreleri/).length).toBeGreaterThan(0));
    expect(errorToasts()).toHaveLength(0);
  });

  it('"Araştır + senaryoyu hazırla" her iki işlemi de çalıştırır', async () => {
    const api = mockApi();
    await openScriptStep(api);
    fireEvent.click(screen.getByRole('button', { name: /Araştır \+ senaryoyu hazırla/ }));
    await waitFor(() => expect(api.research.run).toHaveBeenCalled());
    await waitFor(() => expect(api.ai.generateScript).toHaveBeenCalled());
    expect(errorToasts()).toHaveLength(0);
  });

  it('hata oluştuğunda YALNIZCA BİR bildirim gösterir', async () => {
    const failure = new Error("Error invoking remote method 'ai:script': Error: Invalid input: expected string, received object");
    const api = mockApi();
    (api.ai.generateScript as ReturnType<typeof vi.fn>).mockRejectedValue(failure);
    await openScriptStep(api);
    fireEvent.click(screen.getByRole('button', { name: 'Senaryoyu üret' }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    // Yinelenen bildirim olmamalı: hata metni tam bir kez görünmeli.
    const matches = screen.queryAllByText(/Invalid input: expected string, received object/);
    expect(matches).toHaveLength(1);
  });
});
