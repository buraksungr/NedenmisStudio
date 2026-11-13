// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '../../shared/types';
import { DEFAULT_IDENTITY, defaultSettings } from '../../shared/defaults';
import { App } from '../../src/renderer/App';
import { AnimatedScene } from '../../src/renderer/components/AnimatedScene';
import { createIceAnimationProject } from '../fixtures/iceAnimationProject';

function mockApi(): AppApi {
  return {
    projects: { list: vi.fn().mockResolvedValue([]) },
    settings: { get: vi.fn().mockImplementation(async () => defaultSettings('/tmp/nedenmis')) },
    identity: { get: vi.fn().mockResolvedValue(DEFAULT_IDENTITY) },
    topics: { discover: vi.fn().mockResolvedValue([]) },
    dashboard: { stats: vi.fn().mockResolvedValue({ projectCount: 0, completedCount: 0, totalRenderedSeconds: 0, exportCount: 0, weeklyProjects: 0 }) },
    exports: { list: vi.fn().mockResolvedValue([]), onProgress: vi.fn().mockReturnValue(() => undefined) },
    system: { info: vi.fn().mockResolvedValue({ platform: 'win32', version: '1.0.0', ffmpegAvailable: true, storagePath: '/tmp', cpuCores: 4, totalMemoryGB: 8, freeMemoryGB: 5.5 }), mediaUrl: (path?: string) => path || '' },
    media: { list: vi.fn().mockResolvedValue([]) },
    voiceEngine: { status: vi.fn().mockResolvedValue({ runtimeInstalled: false, dependenciesInstalled: false, modelDownloaded: false, referenceAvailable: false, setupRunning: false, componentPath: '/tmp/voice-engine' }), setup: vi.fn(), onProgress: vi.fn().mockReturnValue(() => undefined) },
    tts: { providers: vi.fn().mockResolvedValue([]) },
  } as unknown as AppApi;
}

interface Clock { now: number; callbacks: Map<number, FrameRequestCallback>; cancelled: number[] }
function installClock(): Clock {
  const clock: Clock = { now: 0, callbacks: new Map(), cancelled: [] }; let nextId = 1;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { const handle = nextId++; clock.callbacks.set(handle, callback); return handle; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((handle: number) => { clock.callbacks.delete(handle); clock.cancelled.push(handle); }));
  return clock;
}
/**
 * Kareyi ilerletir: `requestAnimationFrame` zaman damgası mutlak oynatma zamanıdır.
 * Yavaş çalıştırıcılarda geri çağrı bir sonraki tura kalabildiği için kayıtlı
 * çağrılar bitene kadar tur döner (Windows CI'da tek tur yetmiyordu).
 */
async function frame(clock: Clock, timeMs: number): Promise<void> {
  clock.now = timeMs;
  for (let round = 0; round < 8; round += 1) {
    const pending = [...clock.callbacks.values()];
    if (!pending.length) break;
    clock.callbacks.clear();
    await act(async () => { pending.forEach((callback) => callback(clock.now)); });
  }
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('AnimatedScene — editoryal oynatma saatine bağlı gerçek kareler', () => {
  it('başlangıç karesini ve arama karelerini dış saatten alır', () => {
    const project = createIceAnimationProject();
    const view = render(<AnimatedScene project={project} scene={project.scenes[0]} identity={DEFAULT_IDENTITY} time={0} playing={false} timelineDriven />);
    const element = view.getByTestId('animated-scene');
    expect(element.getAttribute('data-frame-time')).toBe('0.000');
    expect(element.getAttribute('data-animation-preset')).toBe('liquid-molecules');
    const initial = element.innerHTML;

    // İleri arama: tam kare zamanı, bileşenin kendi saati olmadan.
    view.rerender(<AnimatedScene project={project} scene={project.scenes[0]} identity={DEFAULT_IDENTITY} time={.97} playing={false} timelineDriven />);
    expect(element.getAttribute('data-frame-time')).toBe('0.967');
    const forward = element.innerHTML;
    expect(forward).not.toBe(initial);

    // Geri arama: aynı zaman damgası aynı kareyi üretmeli (deterministik).
    view.rerender(<AnimatedScene project={project} scene={project.scenes[0]} identity={DEFAULT_IDENTITY} time={0} playing={false} timelineDriven />);
    expect(element.getAttribute('data-frame-time')).toBe('0.000');
    expect(element.innerHTML).toBe(initial);
    view.rerender(<AnimatedScene project={project} scene={project.scenes[0]} identity={DEFAULT_IDENTITY} time={.97} playing={false} timelineDriven />);
    expect(element.innerHTML).toBe(forward);
  });

  it('kendi iç saatini çalıştırmaz: timelineDriven iken tek kare kaynağı dış saattir', async () => {
    const clock = installClock();
    const project = createIceAnimationProject();
    render(<AnimatedScene project={project} scene={project.scenes[0]} identity={DEFAULT_IDENTITY} time={0} playing timelineDriven />);
    expect(clock.callbacks.size).toBe(0);
  });

  it('gerçek nesne hareketi üretir; kamera efekti tek başına kalmaz', () => {
    const project = createIceAnimationProject();
    const view = render(<AnimatedScene project={project} scene={project.scenes[0]} identity={DEFAULT_IDENTITY} time={0} playing={false} timelineDriven />);
    const first = view.getByTestId('animated-scene').innerHTML;
    view.rerender(<AnimatedScene project={project} scene={project.scenes[0]} identity={DEFAULT_IDENTITY} time={1.1} playing={false} timelineDriven />);
    const second = view.getByTestId('animated-scene').innerHTML;
    // Molekül konumları gerçekten değişir; zoom/pan dönüşümü dışında öğeler kayar.
    expect(second).not.toBe(first);
    expect(first).toContain('data-molecule-id=');
    expect(second).toMatch(/translate\([-0-9.]+ [-0-9.]+\)/);
    const molecule = (svg: string) => (svg.match(/<g data-molecule-id="[^"]*" opacity="[-0-9.]+" transform="[^"]*"/g) || []);
    const firstTransform = molecule(first); const secondTransform = molecule(second);
    expect(firstTransform.length).toBeGreaterThan(0);
    expect(secondTransform.length).toBeGreaterThan(0);
    const changed = firstTransform.filter((value, index) => value !== secondTransform[index]).length;
    expect(changed).toBeGreaterThan(firstTransform.length / 2);
  });
});

function mockProject() {
  const api = mockApi(); const project = createIceAnimationProject(13);
  api.projects.list = vi.fn().mockResolvedValue([project]); api.projects.get = vi.fn().mockResolvedValue(project);
  api.projects.update = vi.fn().mockImplementation(async (next) => next); window.nedenmis = api;
  return { api, project };
}

describe('Editör — tek yönlendirici oynatma saati', () => {
  it('52 saniyelik kurguyu baştan sona oynatır, her sahneyi doğru zamanda gösterir', async () => {
    Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
    const clock = installClock();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    mockProject();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Why does ice float on water/ }));
    await screen.findByTestId('animated-scene');
    expect(screen.getByTestId('preview-stage').getAttribute('data-current-scene')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Oynat' }));
    await frame(clock, 0);
    const expected = [[6.5, '1', 'liquid-molecules'], [13.0, '2', 'crystallization'], [26.0, '3', 'lattice-expansion'], [39.5, '4', 'floating-ice'], [50.0, '4', 'floating-ice']];
    for (const [time, sceneNumber, preset] of expected as Array<[number, string, string]>) {
      await frame(clock, time * 1000);
      const stage = screen.getByTestId('preview-stage');
      expect(stage.getAttribute('data-current-scene'), `t=${time}`).toBe(sceneNumber);
      const preview = screen.getByTestId('animated-scene');
      expect(preview.getAttribute('data-animation-preset')).toBe(preset);
      // Kare zamanı sahnenin yerel zamanıdır ve mutlak saate göre yeniden hesaplanır.
      const local = preview.getAttribute('data-frame-time')!;
      expect(Number(local)).toBeGreaterThanOrEqual(0);
      expect(Number(local)).toBeLessThanOrEqual(13);
    }
    // Toplam süre sonunda oynatma kendiliğinden durur ve sonda kalır.
    await frame(clock, 52_000);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Oynat' })).toBeTruthy());
    expect(screen.getByTestId('preview-stage').getAttribute('data-current-scene')).toBe('4');
    expect(clock.callbacks.size).toBe(0);
  });

  it('duraklatma kareyi dondurur, devam doğru zamandan sürer, yeniden başlatma ilk kareye döner', async () => {
    Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
    const clock = installClock();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    mockProject();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Why does ice float on water/ }));
    await screen.findByTestId('animated-scene');
    fireEvent.click(screen.getByRole('button', { name: 'Oynat' }));
    await frame(clock, 0);
    await frame(clock, 2_000);
    const frozen = screen.getByTestId('animated-scene').getAttribute('data-frame-time');
    expect(frozen).toBe('2.000');
    fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Oynat' })).toBeTruthy());
    expect(clock.callbacks.size).toBe(0);
    // Duraklamışken hiçbir kare ilerlemez.
    expect(screen.getByTestId('animated-scene').getAttribute('data-frame-time')).toBe(frozen);
    // Devam: saat 2 saniyeden sürer.
    fireEvent.click(screen.getByRole('button', { name: 'Oynat' }));
    await frame(clock, 10_000);
    await frame(clock, 11_000);
    expect(screen.getByTestId('animated-scene').getAttribute('data-frame-time')).toBe('3.000');
    // Yeniden başlat: 0. kare.
    fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Başa dön' }));
    await waitFor(() => expect(screen.getByTestId('animated-scene').getAttribute('data-frame-time')).toBe('0.000'));
  });
});
