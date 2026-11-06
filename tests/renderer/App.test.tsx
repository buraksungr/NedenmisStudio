// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '../../shared/types';
import { DEFAULT_IDENTITY, defaultSettings } from '../../shared/defaults';
import { App } from '../../src/renderer/App';

function mockApi(): AppApi {
  return {
    projects: { list: vi.fn().mockResolvedValue([]) },
    settings: { get: vi.fn().mockImplementation(async () => defaultSettings('/tmp/nedenmis')) },
    identity: { get: vi.fn().mockResolvedValue(DEFAULT_IDENTITY) },
    topics: { discover: vi.fn().mockResolvedValue([{ id: 't1', title: 'Gökyüzü neden mavi?', category: 'Bilim', hook: 'Işık neden saçılır?', score: 96, reason: 'Görsel potansiyel' }]) },
    dashboard: { stats: vi.fn().mockResolvedValue({ projectCount: 0, completedCount: 0, totalRenderedSeconds: 0, exportCount: 0, weeklyProjects: 0 }) },
    exports: { list: vi.fn().mockResolvedValue([]), onProgress: vi.fn().mockReturnValue(() => undefined) },
    system: { info: vi.fn().mockResolvedValue({ platform: 'win32', version: '1.0.0', ffmpegAvailable: true, storagePath: '/tmp', cpuCores: 4, totalMemoryGB: 8 }), mediaUrl: (path?: string) => path || '' },
    media: { list: vi.fn().mockResolvedValue([]) },
    tts: { providers: vi.fn().mockResolvedValue([{ id: 'windows-sapi', kind: 'tts', name: 'Windows Türkçe Ses', configured: true, requiresKey: false, description: 'Yerel ses', referenceVoiceSupported: false, commercialNote: 'Sistem koşulları', local: true, voices: [{ id: 'auto-tr', name: 'Türkçe erkek', language: 'tr-TR', gender: 'male', description: 'Yerel', styles: [] }], supportsSpeed: true, supportsPitch: false }]) },
  } as unknown as AppApi;
}

describe('React uygulaması smoke testi', () => {
  beforeEach(() => { window.nedenmis = mockApi(); Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) }); });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });
  it('ana sayfayı ve tüm temel çalışma alanlarını açar', async () => {
    render(<App />); expect(await screen.findAllByText('Genel Bakış')).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Projeler' })); expect(await screen.findByText('Proje arşiviniz henüz boş')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Medya Kitaplığı' })); expect(await screen.findByText('Bu bölümde medya yok')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ses Stüdyosu' })); expect(await screen.findByText('Konuşma sağlayıcısı')).toBeTruthy(); expect((await screen.findAllByText('Windows Türkçe Ses')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Ayarlar' })); expect(await screen.findByText('Görünüm ve dil')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yapay zekâ sağlayıcıları' })); expect(await screen.findByText('Metin ve senaryo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kanal kimliği' })); expect(await screen.findByText('Nedenmiş kanal kimliği')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Yeni video' })[0]); expect(await screen.findByText('Otomatik üretim')).toBeTruthy(); expect(await screen.findByText('Gökyüzü neden mavi?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Video Editörü' })); expect(await screen.findByText('Kurgu masanız hazır')).toBeTruthy();
  });
});
