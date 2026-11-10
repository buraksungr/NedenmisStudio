// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '../../shared/types';
import { DEFAULT_IDENTITY, defaultSettings } from '../../shared/defaults';
import { composeScript, parseScriptSections } from '../../shared/script';
import { App } from '../../src/renderer/App';
import { sampleProject } from '../helpers';
import { createIceAnimationProject } from '../fixtures/iceAnimationProject';
import { createSkyAnimationProject, SKY_SCENE_NARRATIONS } from '../fixtures/skyAnimationProject';

function mockApi(): AppApi {
  return {
    projects: { list: vi.fn().mockResolvedValue([]) },
    settings: { get: vi.fn().mockImplementation(async () => defaultSettings('/tmp/nedenmis')) },
    identity: { get: vi.fn().mockResolvedValue(DEFAULT_IDENTITY) },
    topics: { discover: vi.fn().mockResolvedValue([{ id: 't1', title: 'Gökyüzü neden mavi?', category: 'Bilim', hook: 'Işık neden saçılır?', score: 96, reason: 'Görsel potansiyel' }]) },
    dashboard: { stats: vi.fn().mockResolvedValue({ projectCount: 0, completedCount: 0, totalRenderedSeconds: 0, exportCount: 0, weeklyProjects: 0 }) },
    exports: { list: vi.fn().mockResolvedValue([]), onProgress: vi.fn().mockReturnValue(() => undefined) },
    system: { info: vi.fn().mockResolvedValue({ platform: 'win32', version: '1.0.0', ffmpegAvailable: true, storagePath: '/tmp', cpuCores: 4, totalMemoryGB: 8, freeMemoryGB: 5.5 }), mediaUrl: (path?: string) => path || '' },
    media: { list: vi.fn().mockResolvedValue([]) },
    voiceEngine: { status: vi.fn().mockResolvedValue({ runtimeInstalled: false, dependenciesInstalled: false, modelDownloaded: false, referenceAvailable: false, setupRunning: false, componentPath: '/tmp/voice-engine' }), setup: vi.fn(), onProgress: vi.fn().mockReturnValue(() => undefined) },
    tts: { providers: vi.fn().mockResolvedValue([{ id: 'chatterbox-multilingual-v3', kind: 'tts', name: 'Chatterbox Multilingual V3', configured: false, requiresKey: false, description: 'Yerel klonlama', referenceVoiceSupported: true, commercialNote: 'MIT', local: true, voices: [{ id: 'reference-tr', name: 'Referans', language: 'tr-TR', gender: 'unknown', description: 'Klon', styles: [] }], supportsSpeed: true, supportsPitch: false }, { id: 'windows-sapi', kind: 'tts', name: 'Windows Türkçe Ses', configured: true, requiresKey: false, description: 'Yerel ses', referenceVoiceSupported: false, commercialNote: 'Sistem koşulları', local: true, voices: [{ id: 'auto-tr', name: 'Türkçe erkek', language: 'tr-TR', gender: 'male', description: 'Yerel', styles: [] }], supportsSpeed: true, supportsPitch: false }]) },
  } as unknown as AppApi;
}

describe('React uygulaması smoke testi', () => {
  beforeEach(() => { window.nedenmis = mockApi(); Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) }); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('ana sayfayı ve tüm temel çalışma alanlarını açar', async () => {
    render(<App />); expect(await screen.findAllByText('Genel Bakış')).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Projeler' })); expect(await screen.findByText('Proje arşiviniz henüz boş')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Medya Kitaplığı' })); expect(await screen.findByText('Bu bölümde medya yok')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ses Stüdyosu' })); expect(await screen.findByText('Konuşma sağlayıcısı')).toBeTruthy(); expect((await screen.findAllByText('Windows Türkçe Ses')).length).toBeGreaterThan(0); expect((await screen.findAllByText('Chatterbox Multilingual V3')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Ayarlar' })); expect(await screen.findByText('Görünüm ve dil')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yapay zekâ sağlayıcıları' })); expect(await screen.findByText('Metin ve senaryo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kanal kimliği' })); expect(await screen.findByText('Nedenmiş kanal kimliği')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Yeni video' })[0]); expect(await screen.findByText('Otomatik üretim')).toBeTruthy(); expect(await screen.findByText('Gökyüzü neden mavi?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Video Editörü' })); expect(await screen.findByText('Kurgu masanız hazır')).toBeTruthy();
  });
  it('dört buz sahnesini editörde oynatılabilir animasyon ve ayarlarla açar', async () => {
    const api = mockApi(); const project = createIceAnimationProject();
    api.projects.list = vi.fn().mockResolvedValue([project]); api.projects.get = vi.fn().mockResolvedValue(project); api.projects.update = vi.fn().mockImplementation(async (next) => next); window.nedenmis = api;
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Why does ice float on water/ }));
    const preview = await screen.findByTestId('animated-scene');
    expect(preview.getAttribute('data-animation-preset')).toBe('liquid-molecules');
    expect(screen.getByRole('button', { name: 'Oynat' })).toBeTruthy();
    expect(screen.getByLabelText('Animasyon ön ayarı')).toBeTruthy();
    expect(screen.getByLabelText('Animasyon hızı')).toBeTruthy();
    expect(screen.getByLabelText('Parçacık sayısı')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Animasyon ön ayarı'), { target: { value: 'floating-ice' } });
    await waitFor(() => expect(preview.getAttribute('data-animation-preset')).toBe('floating-ice'));
    fireEvent.click(screen.getByRole('button', { name: /As water freezes/ }));
    await waitFor(() => expect(screen.getByTestId('animated-scene').getAttribute('data-animation-preset')).toBe('crystallization'));
    fireEvent.click(screen.getByRole('button', { name: /The open lattice expands/ }));
    await waitFor(() => expect(screen.getByTestId('animated-scene').getAttribute('data-animation-preset')).toBe('lattice-expansion'));
    fireEvent.click(screen.getByRole('button', { name: /Lower density lets ice float/ }));
    await waitFor(() => expect(screen.getByTestId('animated-scene').getAttribute('data-animation-preset')).toBe('floating-ice'));
  });
  it('üç gökyüzü sahnesinin küçük resimlerini, sesini, zamanını ve hareketli önizlemesini eşitler', async () => {
    const api = mockApi(); const project = createSkyAnimationProject();
    api.projects.list = vi.fn().mockResolvedValue([project]); api.projects.get = vi.fn().mockResolvedValue(project); api.projects.update = vi.fn().mockImplementation(async (next) => next); window.nedenmis = api;
    // Editörün tek saati requestAnimationFrame + performance.now() ile çalışır.
    let now = 0; const callbacks = new Map<number, FrameRequestCallback>(); let nextId = 1;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { const handle = nextId++; callbacks.set(handle, callback); return handle; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((handle: number) => { callbacks.delete(handle); }));
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(); const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    render(<App />); fireEvent.click(await screen.findByRole('button', { name: /Gökyüzü neden mavi görünür/ }));
    await screen.findByTestId('animated-scene');
    await waitFor(() => expect(document.querySelectorAll('img[src^="/proof/sky-scene-"]')).toHaveLength(6));
    fireEvent.click(screen.getByRole('button', { name: 'Oynat' }));
    await waitFor(() => expect(play).toHaveBeenCalled());
    // İlk kare saati çapalar; sonraki kareler mutlak oynatma zamanını taşır.
    const advance = async (ms: number) => { now += ms; await act(async () => { const batch = [...callbacks.values()]; callbacks.clear(); batch.forEach((callback) => callback(now)); }); };
    await advance(0);
    expect(callbacks.size).toBeGreaterThan(0);
    await advance(800);
    // Ses süresi videoyu belirlemez: oynatma başlığı mutlak zamandır.
    await waitFor(() => expect(screen.getByTestId('animated-scene').getAttribute('data-frame-time')).toBe('0.800'));
    const activeNarration = document.querySelector('audio[data-active="true"]') as HTMLAudioElement;
    expect(activeNarration).toBeTruthy();
    expect(activeNarration.currentTime).toBeGreaterThan(.2);
    fireEvent.click(screen.getByRole('button', { name: 'Duraklat' })); await waitFor(() => expect(pause).toHaveBeenCalled());
    for (let index = 0; index < project.scenes.length; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(SKY_SCENE_NARRATIONS[index].slice(0, 24)) }));
      const preview = await screen.findByTestId('animated-scene');
      await waitFor(() => expect(preview.getAttribute('aria-label')).toContain(`Sahne ${index + 1}`));
      expect(preview.getAttribute('data-animation-preset')).toBe('light-scattering');
      expect(preview.innerHTML).toContain('data-light-photon=');
      // Tüm anlatımlar önceden yüklenir; etkin olan tek eleman işaretlenir.
      const active = document.querySelector('audio[data-active="true"]');
      expect(active?.getAttribute('src')).toBe(project.scenes[index].narrationPath);
      expect(document.querySelectorAll('audio[data-active="true"]')).toHaveLength(1);
    }
    vi.unstubAllGlobals();
  });

  it('sonuç bölümünü ayrı düzenler, ana senaryonun sonunda ve kalıcı kayıtta saklar', async () => {
    const api = mockApi(); const project = sampleProject('section-project');
    project.scriptSections = { hook: 'Güçlü bir soru?', explanation: 'Kısa ve açık bilimsel açıklama.', conclusion: 'İlk anlamlı sonuç.' };
    project.script = composeScript(project.scriptSections);
    const update = vi.fn().mockImplementation(async (next) => ({ ...next, scriptSections: parseScriptSections(next.script) })); api.projects.create = vi.fn().mockResolvedValue(project); api.projects.update = update; window.nedenmis = api;
    render(<App />); expect(await screen.findAllByText('Genel Bakış')).not.toHaveLength(0); fireEvent.click(screen.getAllByRole('button', { name: 'Yeni video' })[0]);
    expect(await screen.findByText('Gökyüzü neden mavi?')).toBeTruthy();
    fireEvent.change(await screen.findByPlaceholderText('Örn. Gökyüzü neden mavi görünür?'), { target: { value: 'Bölüm kalıcılığı sınaması' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Projeyi oluştur' }));
    await waitFor(() => expect(api.projects.create).toHaveBeenCalled()); expect(await screen.findByText('Anlatım senaryosu')).toBeTruthy();
    const conclusion = await screen.findByTestId('conclusion-editor') as HTMLTextAreaElement; expect(conclusion.value).toBe('İlk anlamlı sonuç.');
    fireEvent.change(conclusion, { target: { value: 'Mavi ışığın daha çok saçılması gökyüzünün rengini belirler.' } }); fireEvent.blur(conclusion);
    await waitFor(() => expect(update).toHaveBeenCalled());
    const savedInput = update.mock.calls.at(-1)![0]; const saved = await update.mock.results.at(-1)!.value;
    expect(saved.scriptSections).toEqual({ ...project.scriptSections, conclusion: 'Mavi ışığın daha çok saçılması gökyüzünün rengini belirler.' });
    expect(savedInput.script.endsWith('Mavi ışığın daha çok saçılması gökyüzünün rengini belirler.')).toBe(true);
    expect(saved.script.endsWith('Mavi ışığın daha çok saçılması gökyüzünün rengini belirler.')).toBe(true);
    expect(saved.script.split('\n\n')).toHaveLength(3);
    expect((screen.getByLabelText('Sonuç bölümü') as HTMLTextAreaElement).value).toBe('Mavi ışığın daha çok saçılması gökyüzünün rengini belirler.');
    const main = screen.getByPlaceholderText('Senaryonuzu buraya yazın veya sağdaki üretim düğmesini kullanın…') as HTMLTextAreaElement; expect(main.value).toBe(saved.script);
  });

  it('metin seçilmeden rewrite göndermez ve seçimle doğru metni gönderir', async () => {
    const api = mockApi(); const project = sampleProject('rewrite-project'); const rewrite = vi.fn().mockResolvedValue('Işık davranışını sadeleştir.');
    api.projects.create = vi.fn().mockResolvedValue(project); api.projects.update = vi.fn().mockImplementation(async (next) => next); api.ai = { rewrite } as unknown as AppApi['ai']; window.nedenmis = api;
    render(<App />); expect(await screen.findAllByText('Genel Bakış')).not.toHaveLength(0); fireEvent.click(screen.getAllByRole('button', { name: 'Yeni video' })[0]); expect(await screen.findByText('Öne çıkan konular')).toBeTruthy(); expect(await screen.findByText('Gökyüzü neden mavi?')).toBeTruthy(); fireEvent.click(await screen.findByRole('button', { name: 'Projeyi oluştur' }));
    expect(await screen.findByText('Anlatım senaryosu')).toBeTruthy(); const button = screen.getByRole('button', { name: 'Akıcılaştır' }) as HTMLButtonElement; expect(button.disabled).toBe(true); fireEvent.click(button); expect(rewrite).not.toHaveBeenCalled();
    const editor = screen.getByPlaceholderText('Senaryonuzu buraya yazın veya sağdaki üretim düğmesini kullanın…') as HTMLTextAreaElement; editor.setSelectionRange(0, 6); fireEvent.select(editor); expect(button.disabled).toBe(false); fireEvent.click(button);
    await waitFor(() => expect(rewrite).toHaveBeenCalledWith(expect.objectContaining({ projectId: project.id, selectedText: project.script.slice(0, 6), instruction: 'improve' })));
  });
});
