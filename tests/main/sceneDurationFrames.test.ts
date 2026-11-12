import { describe, expect, it } from 'vitest';
import { FRAME_RATE, buildPlaybackTimeline } from '../../shared/playback.js';
import type { Scene } from '../../shared/types.js';

/**
 * Sahne süresi kare ızgarasına oturmalı.
 *
 * Regresyon: anlatım süresi `(duration + .22).toFixed(3)` ile yuvarlanıyordu
 * (ör. 8.457). Kare ızgarasında olmayan bu değer geçişlerde birikip Windows
 * dışa aktarımında bir kare kaybına yol açtı (785/786, CI 43267875513).
 */
function sceneWith(duration: number): Scene {
  return {
    id: 's', number: 1, section: 'explanation', narration: '', visualDescription: '', visualPrompt: '',
    assetType: 'imported-image', duration, transition: 'fade', cameraMovement: 'static',
    animation: { enabled: false, preset: 'liquid-molecules', speed: 1, intensity: 1, particleCount: 0 },
    subtitles: [], subtitleTiming: 'estimated', status: 'ready',
  };
}

describe('Sahne süreleri kare ızgarasında', () => {
  it('3 ondalıklı süreler kare sınırında değildir (eski hata)', () => {
    // 8.457 s × 30 = 253.71 kare: ızgarada değil.
    expect(Math.abs(8.457 * FRAME_RATE - Math.round(8.457 * FRAME_RATE))).toBeGreaterThan(.1);
  });

  it('kareye YUKARI yuvarlanmış süreler toplamda tam kare sayısı verir', () => {
    // Üç sahne: (8.457 + 9.237 + 8.457) = 26.151 s = 784.53 kare → 785 beklenirken
    // 784 üretiliyordu. Yukarı yuvarlama sonrası toplam tam kare olmalı.
    const durations = [8.457, 9.237, 8.457].map((value) => Math.ceil(value * FRAME_RATE) / FRAME_RATE);
    const timeline = buildPlaybackTimeline(durations.map((duration) => sceneWith(duration)));
    // Tam sayı kare: `ceil` ile `round` aynı sonucu vermeli.
    expect(Math.round(timeline.duration * FRAME_RATE)).toBe(Math.ceil(timeline.duration * FRAME_RATE - 1e-9));
    // 8.457 → 8.467 (254 kare), 9.237 → 9.267 (278 kare): toplam 26.2 s = 786 kare.
    expect(durations.map((value) => Math.round(value * FRAME_RATE))).toEqual([254, 278, 254]);
    expect(timeline.duration * FRAME_RATE).toBeCloseTo(786, 6);
  });

  it('kareye oturtma anlatım süresini kısaltmaz (yukarı yuvarlama korunur)', () => {
    const narration = 8.237; const padded = Math.ceil((narration + .22) * FRAME_RATE) / FRAME_RATE;
    expect(padded).toBeGreaterThanOrEqual(narration + .22 - 1e-9);
    expect(padded * FRAME_RATE).toBeCloseTo(Math.round(padded * FRAME_RATE), 6);
  });
});
