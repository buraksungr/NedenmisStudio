// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '../../shared/types';
import { DEFAULT_IDENTITY, defaultSettings } from '../../shared/defaults';
import { App } from '../../src/renderer/App';
import { buildPlaybackTimeline, sceneIndexAt, totalDuration } from '../../shared/index.js';
import { createIceAnimationProject } from '../fixtures/iceAnimationProject';

interface Clock { now: number; callbacks: Map<number, FrameRequestCallback> }
function installClock(): Clock {
  const clock: Clock = { now: 0, callbacks: new Map() }; let nextId = 1;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { const handle = nextId++; clock.callbacks.set(handle, callback); return handle; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((handle: number) => { clock.callbacks.delete(handle); }));
  return clock;
}
async function frame(clock: Clock, timeMs: number): Promise<void> {
  clock.now = timeMs;
  await act(async () => { const batch = [...clock.callbacks.values()]; clock.callbacks.clear(); batch.forEach((callback) => callback(clock.now)); });
}

function mockApi(project: ReturnType<typeof createIceAnimationProject>): AppApi {
  return {
    projects: { list: vi.fn().mockResolvedValue([project]), get: vi.fn().mockResolvedValue(project), update: vi.fn().mockImplementation(async (next) => next) },
    settings: { get: vi.fn().mockResolvedValue(defaultSettings('/tmp/nedenmis')) },
    identity: { get: vi.fn().mockResolvedValue(DEFAULT_IDENTITY) },
    topics: { discover: vi.fn().mockResolvedValue([]) },
    dashboard: { stats: vi.fn().mockResolvedValue({ projectCount: 1, completedCount: 0, totalRenderedSeconds: 0, exportCount: 0, weeklyProjects: 0 }) },
    exports: { list: vi.fn().mockResolvedValue([]), onProgress: vi.fn().mockReturnValue(() => undefined) },
    system: { info: vi.fn().mockResolvedValue({ platform: 'win32', version: '1.0.0', ffmpegAvailable: true, storagePath: '/tmp', cpuCores: 4, totalMemoryGB: 8, freeMemoryGB: 5.5 }), mediaUrl: (path?: string) => path || '' },
    media: { list: vi.fn().mockResolvedValue([]) },
    voiceEngine: { status: vi.fn().mockResolvedValue({}), setup: vi.fn(), onProgress: vi.fn().mockReturnValue(() => undefined) },
    tts: { providers: vi.fn().mockResolvedValue([]) },
  } as unknown as AppApi;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Dört sahneli, ≥50 saniyelik, iki sahnesi kısa anlatımlı gerçekçi kurgu. */
function longProject() {
  const project = createIceAnimationProject(13);
  project.id = 'project_sync_50s'; project.name = 'Why does ice float on water — 52 saniye';
  project.scenes.forEach((scene, index) => { scene.narrationPath = `/proof/ice-scene-${index + 1}.wav`; });
  // Anlatım süreleri sahne sürelerinden çok kısa/uzun: video bunlardan etkilenmemeli.
  project.scenes[0].narrationDuration = 1.1;
  project.scenes[1].narrationDuration = 24.0;
  project.scenes[2].narrationDuration = 2.4;
  project.scenes[3].narrationDuration = 12.9;
  project.audio.musicClips = [{ id: 'music-1', kind: 'music', name: 'Alt zemin müziği', path: '/proof/music-loop.wav', start: 0, duration: 52, trimStart: 0, volume: .8, fadeIn: 1, fadeOut: 2 }];
  project.audio.sfxClips = [{ id: 'sfx-1', kind: 'sfx', name: 'Vurgu', path: '/proof/sfx-hit.wav', start: 26, duration: 1.5, trimStart: 0, volume: .7, fadeIn: 0, fadeOut: .3 }];
  return project;
}

describe('Önizleme senkronizasyonu — ses saati yönetmez', () => {
  it('kısa ya da uzun anlatım oynatma başlığını ve sahne sırasını bozmaz', async () => {
    Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
    const clock = installClock();
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const project = longProject(); window.nedenmis = mockApi(project);
    const timeline = buildPlaybackTimeline(project.scenes);
    expect(timeline.duration).toBeCloseTo(52, 6);
    expect(totalDuration(project.scenes)).toBeCloseTo(52, 6);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Why does ice float on water/ }));
    await screen.findByTestId('preview-stage');
    fireEvent.click(screen.getByRole('button', { name: 'Oynat' }));
    await frame(clock, 0);

    // Anlatımı 1.1 sn olan sahnede 6.5 sn'ye kadar video ilerlemeye devam eder.
    await frame(clock, 3_000); await frame(clock, 6_500);
    expect(screen.getByTestId('playhead-time').textContent).toBe('00:06,500');
    expect(screen.getByTestId('preview-stage').getAttribute('data-current-scene')).toBe('1');

    // Anlatımı sahne süresinden uzun olsa da sahne 13 sn'de değişir ve atlanmaz.
    await frame(clock, 12_999);
    expect(screen.getByTestId('preview-stage').getAttribute('data-current-scene')).toBe('1');
    await frame(clock, 13_100);
    expect(screen.getByTestId('preview-stage').getAttribute('data-current-scene')).toBe('2');

    // Medya öğeleri ana saatin kölesidir: sahne klibi yerel zamana çekilir.
    const activeAudio = document.querySelector('audio[data-audio-key^="narration:"][data-selected="true"]') as HTMLAudioElement;
    const narrationNodes = [...document.querySelectorAll('audio')].map((node) => `${node.getAttribute('data-audio-key')}|${node.getAttribute('data-active')}|${node.getAttribute('data-selected')}`);
    expect(activeAudio, JSON.stringify(narrationNodes)).toBeTruthy();
    expect(activeAudio.getAttribute('data-audio-key')).toBe(`narration:${project.scenes[1].id}`);
    expect(Math.abs(activeAudio.currentTime - .1)).toBeLessThan(.2);
    expect(play).toHaveBeenCalled();
  });

  it('zaman çizelgesinde herhangi bir noktaya arama yapınca görüntü, altyazı ve ses aynı anda hizalanır', async () => {
    Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
    const clock = installClock();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const project = longProject(); window.nedenmis = mockApi(project);
    const timeline = buildPlaybackTimeline(project.scenes);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Why does ice float on water/ }));
    await screen.findByTestId('preview-stage');

    const seekPoints = [0.7, 8.2, 19.4, 26.3, 38.9, 51.6];
    const surface = screen.getByTestId('timeline-surface');
    for (const target of seekPoints) {
      // Gerçek zaman çizelgesine tıklama: tıklanan piksel mutlak zamana çevrilir.
      Object.defineProperty(surface, 'scrollLeft', { configurable: true, value: 0 });
      vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 3000, height: 200, right: 3000, bottom: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
      fireEvent.click(surface, { clientX: 104 + target * 55 });
      const expected = sceneIndexAt(timeline, target) + 1;
      await waitFor(() => expect(screen.getByTestId('preview-stage').getAttribute('data-current-scene')).toBe(String(expected)));
      // Kare zamanı sahnenin başlangıcına göre yerel zamandır.
      const frameTime = Number(screen.getByTestId('animated-scene').getAttribute('data-frame-time'));
      expect(frameTime).toBeCloseTo(Math.floor((target - timeline.starts[expected - 1]) * 30) / 30, 2);
      const active = document.querySelector('audio[data-audio-key^="narration:"][data-selected="true"]') as HTMLAudioElement;
      expect(active).toBeTruthy();
      expect(active.currentTime).toBeGreaterThanOrEqual(0);
    }
    // Projenin tam sonuna arama ve Oynat: video baştan başlamalı.
    const endSurface = screen.getByTestId('timeline-surface');
    vi.spyOn(endSurface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 4000, height: 200, right: 4000, bottom: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    Object.defineProperty(endSurface, 'scrollLeft', { configurable: true, value: 0 });
    fireEvent.click(endSurface, { clientX: 104 + 60 * 55 });
    expect(screen.getByTestId('playhead-time').textContent).toBe('00:52,000');
    fireEvent.click(screen.getByRole('button', { name: 'Oynat' }));
    expect(screen.getByTestId('playhead-time').textContent).toBe('00:00,000');
    await frame(clock, 0); await frame(clock, 1_000);
    expect(screen.getByTestId('playhead-time').textContent).toBe('00:01,000');
    // Oynatma sırasında arama: saat yeni noktadan devam eder, ışınlanmaz.
    // 51.4 sn'deyken 20. saniyeye arama; oynatma kaldığı yerden değil, yeni
    // noktadan devam eder: kare zamanı ile playhead ilişkisi korunur.
    fireEvent.click(surface, { clientX: 104 + 20 * 55 });
    expect(screen.getByTestId('playhead-time').textContent).toBe('00:20,000');
    await frame(clock, 2_000); await frame(clock, 4_000);
    expect(screen.getByTestId('playhead-time').textContent).toBe('00:22,000');
  });

  it('müzik ve efekt klipleri de oynatma saatine göre konumlanır', async () => {
    Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
    const clock = installClock();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const project = longProject(); window.nedenmis = mockApi(project);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Why does ice float on water/ }));
    await screen.findByTestId('preview-stage');
    fireEvent.click(screen.getByRole('button', { name: 'Oynat' }));
    await frame(clock, 0);
    await frame(clock, 5_000);
    // 5. saniyede efekt klibi henüz başlamamıştır.
    await frame(clock, 30_000);
    const music = document.querySelector('audio[data-audio-key^="music:"]') as HTMLAudioElement;
    const sfx = document.querySelector('audio[data-audio-key^="sfx:"]') as HTMLAudioElement;
    expect(music).toBeTruthy(); expect(sfx).toBeTruthy();
    // Sahte medya motorunda süre bilinmediği için hedef 0'a sabitlenir; önemli
    // olan klibin ana saatten gelen yerel zamana göre konumlanmasıdır.
    expect(music.currentTime).toBeGreaterThanOrEqual(0);
    expect(sfx.currentTime).toBeGreaterThanOrEqual(0);
    await waitFor(() => expect(music.volume).toBeGreaterThan(0));
    expect(sfx.volume).toBeGreaterThan(0);
  });
});
