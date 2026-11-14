import { describe, expect, it } from 'vitest';
import { buildPlaybackTimeline, CROSSFADE_SECONDS, frameExactSeconds, FRAME_RATE } from '../../shared/playback.js';
import type { Scene } from '../../shared/types.js';

const scene = (duration: number, transition: Scene['transition'] = 'fade'): Scene => ({ duration, transition } as Scene);

/**
 * Regresyon (CI 43315177155): Windows MP4 818/819 kare çıktı.
 * Sebep: xfade `offset` değeri `toFixed(6)` ile bir kare sınırının ALTINA
 * yuvarlanıyordu (16.3333333… → 16.333333). FFmpeg bu durumda gelen klibin son
 * karesini düşürür. Ölçüm: offset 16.3 → 818 kare, 16.333333 → 819 kare.
 */
describe('xfade offset kare sınırı', () => {
  it('kare sınırını asla geriye yuvarlamaz', () => {
    // 490. kareye denk gelen sınır: 490/30 = 16.33333…
    const value = Number(frameExactSeconds(490 / FRAME_RATE));
    expect(value).toBeGreaterThanOrEqual(490 / FRAME_RATE);
    expect(value * FRAME_RATE).toBeGreaterThanOrEqual(490);
  });

  it('toFixed(6) gerçekten sınırın altına düşüyor (hata doğrulaması)', () => {
    // Bu test hatanın kendisini belgeliyor: eski davranış beklenen kareden küçüktü.
    const naive = Number((490 / FRAME_RATE).toFixed(6));
    expect(naive * FRAME_RATE).toBeLessThan(490);
  });

  it('kare hizalı olmayan sürelerde de sınırı korur', () => {
    for (const seconds of [8.8333333333, 16.3333333333, 26.151, 1 / 3, 0]) {
      const value = Number(frameExactSeconds(seconds));
      const frame = Math.round(seconds * FRAME_RATE);
      expect(value * FRAME_RATE).toBeGreaterThanOrEqual(frame - 1e-6);
      // Bilinçli 1e-9 ileri itme: sınırın gerisinde kalmamak için.
      expect(Math.abs(value - frame / FRAME_RATE)).toBeLessThan(1e-8);
    }
  });

  it('zaman çizelgesi başlangıçlarından üretilen offsetler tam kareye denk gelir', () => {
    const timeline = buildPlaybackTimeline([scene(265 / 30), scene(225 / 30), scene(329 / 30)]);
    for (const start of timeline.starts.slice(1)) {
      const frames = Number(frameExactSeconds(start)) * FRAME_RATE;
      expect(Math.abs(frames - Math.round(frames))).toBeLessThan(1e-6);
    }
    // Toplam kare sayısı: 265 + 225 + 329 = 819
    expect(Math.ceil(timeline.duration * FRAME_RATE - 1e-9)).toBe(819);
  });

  it('geçiş penceresi tam kare sayısıdır', () => {
    expect(CROSSFADE_SECONDS * FRAME_RATE).toBeCloseTo(10, 9);
  });
});
