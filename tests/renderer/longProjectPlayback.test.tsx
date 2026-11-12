// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '../../shared/types';
import { DEFAULT_IDENTITY as IDENTITY, defaultSettings } from '../../shared/defaults';
import { App } from '../../src/renderer/App';
import { DEFAULT_AUDIO, DEFAULT_IDENTITY, DEFAULT_SUBTITLE_STYLE, DEFAULT_VOICE } from '../../shared/defaults';
import { buildPlaybackTimeline, sceneIndexAt, totalDuration } from '../../shared/index.js';
import type { Project, Scene } from '../../shared/types';

/** 4 sahne, 54 saniye: kurgunun tamamı boyunca tek saat testi. */
const DURATIONS = [10, 16, 14, 14];
const NARRATIONS = [
  'Sıvı suda moleküller sürekli titreşir ve birbirinin yanından geçer.',
  'Su donarken molekülleri düzenli bir kristal yapı oluşturur, bu yüzden buz sertleşir.',
  'Bu açık kristal kafes daha fazla yer kaplar ve buzun yoğunluğunu düşürür.',
  'Buzun suda yüzmesinin nedeni yoğunluğunun sudan daha düşük olmasıdır.',
];
const PRESETS = ['liquid-molecules', 'crystallization', 'lattice-expansion', 'floating-ice'] as const;

export function buildFourSceneProject(): Project {
  const now = new Date().toISOString();
  const scenes: Scene[] = DURATIONS.map((duration, index) => ({
    id: `long-scene-${index + 1}`, number: index + 1, section: (['hook', 'explanation', 'explanation', 'conclusion'] as const)[index],
    narration: NARRATIONS[index], visualDescription: 'Buz molekülleri', visualPrompt: '', assetType: 'procedural',
    duration, transition: (['fade', 'dissolve', 'slide', 'fade'] as const)[index], cameraMovement: 'zoom-in',
    animation: { enabled: true, preset: PRESETS[index], speed: 1, intensity: 1, particleCount: 24 },
    subtitles: [], subtitleTiming: 'estimated', status: 'ready', narrationPath: `C:/media/narration-${index + 1}.wav`,
    narrationDuration: duration - .3,
  }));
  const timeline = buildPlaybackTimeline(scenes);
  scenes.forEach((scene, index) => {
    const words = scene.narration.split(' ');
    const half = Math.ceil(words.length / 2);
    scene.subtitles = [
      { id: `cue-${index}-a`, start: timeline.starts[index], end: timeline.starts[index] + scene.duration / 2, text: words.slice(0, half).join(' ') },
      { id: `cue-${index}-b`, start: timeline.starts[index] + scene.duration / 2, end: timeline.starts[index] + scene.duration, text: words.slice(half).join(' ') },
    ];
  });
  return {
    id: 'project_long', name: 'Buz neden yüzer — 54 saniye', topic: 'Buz neden suda yüzer?', category: 'Bilim', mode: 'custom',
    status: 'ready', instructions: '', targetDuration: 54, narrationStyle: 'belgesel', visualStyle: 'infografik',
    script: NARRATIONS.join(' '), scenes, research: { status: 'not_started', sources: [] },
    audio: { ...DEFAULT_AUDIO, musicClips: [], sfxClips: [] }, subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE },
    brand: { channelName: DEFAULT_IDENTITY.channelName, primaryColor: DEFAULT_IDENTITY.primaryColor, secondaryColor: DEFAULT_IDENTITY.secondaryColor },
    voice: { ...DEFAULT_VOICE }, createdAt: now, updatedAt: now,
  };
}

/** "01:05,250" biçimini saniyeye çevirir. */
function parseHead(text: string | null): number {
  const [minutes, rest] = (text ?? '00:00,000').split(':');
  return Number(minutes) * 60 + Number((rest ?? '0').replace(',', '.'));
}

function installApp(project: Project): void {
  const api = {
    projects: { list: vi.fn().mockResolvedValue([project]), get: vi.fn().mockResolvedValue(project), update: vi.fn().mockImplementation(async (next) => next), create: vi.fn(), remove: vi.fn() },
    // Editör otomatik kaydı debounce'lı; testte sessizce çözülür.
    _noop: vi.fn(),
    settings: { get: vi.fn().mockResolvedValue(defaultSettings('/tmp/nedenmis')) },
    identity: { get: vi.fn().mockResolvedValue(IDENTITY) },
    topics: { discover: vi.fn().mockResolvedValue([]) },
    dashboard: { stats: vi.fn().mockResolvedValue({ projectCount: 1, completedCount: 0, totalRenderedSeconds: 0, exportCount: 0, weeklyProjects: 0 }) },
    exports: { list: vi.fn().mockResolvedValue([]), onProgress: vi.fn().mockReturnValue(() => undefined) },
    system: { info: vi.fn().mockResolvedValue({ platform: 'linux', version: '1.1.0', ffmpegAvailable: true, storagePath: '/tmp', cpuCores: 4, totalMemoryGB: 8, freeMemoryGB: 5.5 }), mediaUrl: (path?: string) => path || '' },
    media: { list: vi.fn().mockResolvedValue([]), import: vi.fn().mockResolvedValue([]) },
    voiceEngine: { status: vi.fn().mockResolvedValue({}), setup: vi.fn(), onProgress: vi.fn().mockReturnValue(() => undefined) },
    tts: { providers: vi.fn().mockResolvedValue([]) },
  } as unknown as AppApi;
  (window as unknown as { nedenmis: AppApi }).nedenmis = api;
}

describe('Uzun kurgu — tek saatle baştan sona oynatma', () => {
  let callbacks: FrameRequestCallback[] = []; let now = 0;
  beforeEach(() => { callbacks = []; now = 0; vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length; })); vi.stubGlobal('cancelAnimationFrame', vi.fn(() => undefined)); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  /** Tek bir kareyi ilerletir: rAF zaman damgası saatin tek kaynağıdır. */
  /** Projeyi listeden açar ve editör sahnesini bekler. */
  async function openProject() {
    const entry = await screen.findAllByRole('button', { name: /Buz neden yüzer/ });
    fireEvent.click(entry[0]);
    await screen.findByTestId('preview-stage');
    Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  }
  const frame = async (timestamp: number) => { now = timestamp; const pending = callbacks; callbacks = []; console.log('DBGF', pending.length, typeof window.requestAnimationFrame); await act(async () => { pending.forEach((callback) => callback(now)); }); };

  it('54 saniyelik dört sahneyi doğru zamanlarda, doğru kareyle oynatır', async () => {
    const project = buildFourSceneProject();
    const timeline = buildPlaybackTimeline(project.scenes);
    expect(totalDuration(project.scenes)).toBe(54);
    installApp(project);
    render(<App />);
    await openProject();

    const stage = screen.getByTestId('preview-stage');
    const playhead = screen.getByTestId('playhead-time');
    // 0. kare: ilk sahnenin 0. anı.
    expect(stage.getAttribute('data-current-scene')).toBe('1');
    expect(screen.getByTestId('animated-scene').getAttribute('data-frame-time')).toBe('0.000');
    expect(playhead.textContent).toBe('00:00,000');

    fireEvent.click(screen.getByRole('button', { name: 'Oynat' }));
        // Kurgunun tamamı 30 FPS'te adım adım gezilir; her saniyede sahne ve kare doğrulanır.
    // İlk kare saatin başlangıç noktasını (origin) kurar; sonraki kareler ondan türetilir.
    await frame(0);
    let timestamp = 0;
    const observedScenes = new Set<string>();
    for (let second = 1; second <= 54; second += 1) {
      timestamp += 1000;
      await frame(timestamp);
      const time = parseHead(playhead.textContent);
      if (second === 1) 
      expect(time).toBeCloseTo(second, 2);
      const expectedScene = String(sceneIndexAt(timeline, Math.min(second, 53.99)) + 1);
      const actualScene = stage.getAttribute('data-current-scene')!;
      expect(actualScene).toBe(expectedScene);
      observedScenes.add(actualScene);
      const localTime = Math.min(second, 53.99) - timeline.starts[Number(actualScene) - 1];
      const frameTime = Number(screen.getByTestId('animated-scene').getAttribute('data-frame-time'));
      // Kare zamanı sahne yerel zamanına 1 kareden yakın olmalı (30 FPS).
      expect(Math.abs(frameTime - localTime)).toBeLessThanOrEqual(1 / 30 + 1e-6);
      // Altyazı, oynatma zamanına göre seçilir.
      const activeCues = document.querySelectorAll('[data-testid="preview-stage"] [data-subtitle-active="true"]');
      expect(activeCues.length).toBeLessThanOrEqual(1);
    }
    expect([...observedScenes].sort()).toEqual(['1', '2', '3', '4']);
    // Toplam süre sonunda otomatik durur ve son karede kalır.
    await frame(56_000);
    expect(playhead.textContent).toBe('00:54,000');
    expect(screen.getByRole('button', { name: 'Oynat' })).toBeTruthy();
  });

  it('rastgele aramalarda anında doğru kareyi gösterir; duraklat/devam/başa dön çalışır', async () => {
    const project = buildFourSceneProject();
    const timeline = buildPlaybackTimeline(project.scenes);
    installApp(project);
    render(<App />);
    await openProject();
    // Zaman çizelgesi yüzeyi: 55 px/sn ölçek, scrollLeft 0 (jsdom varsayılanı tanımsız olabilir).
    const seek = (time: number) => {
      const surface = screen.getByTestId('timeline-surface');
      Object.defineProperty(surface, 'scrollLeft', { configurable: true, value: 0 });
      vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 4000, height: 200, right: 4000, bottom: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
      // Zaman çizelgesinde solda 104 px etiket/alet sütunu var; ölçek 55 px/sn.
      fireEvent.click(surface, { clientX: 104 + time * 55 });
    };
    const targets = [0.5, 9.9, 10.1, 25.0, 26.0, 39.9, 40.1, 53.5, 12.0, 4.0];
    for (const target of targets) {
      seek(target);
      const expectedScene = sceneIndexAt(timeline, target) + 1;
      // Önce oynatma başlığının hedefe oturduğunu bekle: sahne zaten aynıysa
      // yalnızca sahne kimliğini beklemek React güncellemesini beklemeden geçerdi.
      await waitFor(() => expect(parseHead(screen.getByTestId('playhead-time').textContent)).toBeCloseTo(target, 2));
      expect(screen.getByTestId('preview-stage').getAttribute('data-current-scene')).toBe(String(expectedScene));
      const frameTime = Number(screen.getByTestId('animated-scene').getAttribute('data-frame-time'));
      expect(frameTime).toBeCloseTo(Math.floor((target - timeline.starts[expectedScene - 1]) * 30) / 30, 2);
    }
    // Oynat → duraklat → aynı kare donar → devam → saat ilerler.
    fireEvent.click(screen.getByRole('button', { name: 'Oynat' }));
    await frame(0); await frame(2_000);
    const frozen = screen.getByTestId('animated-scene').getAttribute('data-frame-time');
    const frozenHead = screen.getByTestId('playhead-time').textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
    await frame(3_000); await frame(9_000);
    expect(screen.getByTestId('playhead-time').textContent).toBe(frozenHead);
    expect(screen.getByTestId('animated-scene').getAttribute('data-frame-time')).toBe(frozen);
    // Devam: kaldığı yerden (1.5 sn) ilerler; ilk kare yeni çapayı kurar.
    fireEvent.click(screen.getByRole('button', { name: 'Oynat' }));
    await frame(10_500); await frame(12_000);
    expect(screen.getByTestId('playhead-time').textContent).toBe('00:07,500');
    // Başa dön: ilk sahnenin ilk karesi.
    fireEvent.click(screen.getByRole('button', { name: 'Başa dön' }));
    expect(screen.getByTestId('playhead-time').textContent).toBe('00:00,000');
    expect(screen.getByTestId('preview-stage').getAttribute('data-current-scene')).toBe('1');
    expect(screen.getByTestId('animated-scene').getAttribute('data-frame-time')).toBe('0.000');
  });

  it('her sahnede animasyon nesneleri gerçekten hareket eder', async () => {
    const project = buildFourSceneProject();
    const timeline = buildPlaybackTimeline(project.scenes);
    installApp(project);
    render(<App />);
    await openProject();
    const surface = screen.getByTestId('timeline-surface');
    Object.defineProperty(surface, 'scrollLeft', { configurable: true, value: 0 });
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 4000, height: 200, right: 4000, bottom: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    for (let index = 0; index < 4; index += 1) {
      const start = timeline.starts[index] + 1;
      const sample = () => { const node = document.querySelector('[data-testid="animated-scene"] [data-molecule-id]') ?? document.querySelector('[data-testid="animated-scene"] [data-motion]'); return node?.outerHTML ?? ''; };
      fireEvent.click(surface, { clientX: start * 55 });
      const first = sample();
      fireEvent.click(surface, { clientX: (start + 1.5) * 55 });
      const second = sample();
      expect(first.length).toBeGreaterThan(0);
      expect(second).not.toBe(first);
    }
  });
});
