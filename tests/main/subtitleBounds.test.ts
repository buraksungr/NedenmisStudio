import { describe, expect, it } from 'vitest';
import { generateSubtitleCues } from '../../shared/utils.js';

/**
 * Regresyon (CI 43284052377): sahne başlangıcı 10.7333 s iken ilk altyazı
 * 10.733 s'de başlıyordu; 3 ondalık yuvarlama cue'yu sahnenin önüne taşıyordu.
 */
describe('Altyazı zaman sınırları', () => {
  it('altyazı sahne başlangıcından önce başlamaz', () => {
    const sceneStart = 322 / 30; // 10.7333…
    const cues = generateSubtitleCues('Sıvı suda moleküller sürekli titreşir ve birbirinin yanından geçer.', 10.9667, sceneStart);
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0].start).toBeGreaterThanOrEqual(Number(sceneStart.toFixed(3)));
    for (const cue of cues) expect(cue.start).toBeGreaterThanOrEqual(Number(sceneStart.toFixed(3)) - 1e-9);
  });

  it('her sahne için cue başlangıcı kendi sahne başlangıcına eşit veya sonrasındadır', () => {
    const durations = [8.4667, 9.2667, 8.4667, 6.1333];
    let cursor = 0;
    for (const duration of durations) {
      const cues = generateSubtitleCues('Buzun suda yüzmesinin nedeni yoğunluğunun sudan daha düşük olmasıdır. Su donarken kristal yapı oluşur.', duration, cursor);
      expect(cues[0].start).toBeGreaterThanOrEqual(Number(cursor.toFixed(3)));
      // Cue zamanları 1 ms çözünürlükte tutulur; sınır ±10 ms toleransla doğrulanır.
      expect(cues.at(-1)!.end).toBeLessThanOrEqual(cursor + duration + .01);
      cursor += duration;
    }
  });
});
