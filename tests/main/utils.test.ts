import { describe, expect, it } from 'vitest';
import { estimateSpeechDuration, formatTime, generateSubtitleCues, sanitizeFilename, sceneStartTimes } from '../../shared/utils.js';

describe('Türkçe metin ve zamanlama yardımcıları', () => {
  it('Türkçe karakterleri koruyarak ardışık altyazı üretir', () => {
    const cues = generateSubtitleCues('Işık, atmosferdeki küçük parçacıklara çarpar. Mavi dalga boyu daha çok saçılır!', 8, 2);
    expect(cues.length).toBeGreaterThan(2); expect(cues[0].start).toBe(2); expect(cues.at(-1)!.end).toBe(10);
    expect(cues.map((cue) => cue.text).join(' ')).toContain('çarpar'); expect(cues.every((cue) => cue.end > cue.start)).toBe(true);
  });
  it('konuşma süresini hız ve noktalama ile hesaplar', () => { const normal = estimateSpeechDuration('Merak etmek, öğrenmenin ilk adımıdır. Peki neden?', 'belgesel', 1); expect(normal).toBeGreaterThan(3); expect(estimateSpeechDuration('Merak etmek, öğrenmenin ilk adımıdır. Peki neden?', 'belgesel', 1.5)).toBeLessThan(normal); });
  it('sahne başlangıçlarını ve saat biçimini hesaplar', () => { expect(sceneStartTimes([{ duration: 2 }, { duration: 3.5 }, { duration: 1 }] as never)).toEqual([0, 2, 5.5]); expect(formatTime(65.25, true)).toBe('01:05,250'); });
  it('Windows dosya adındaki tehlikeli karakterleri temizler', () => { expect(sanitizeFilename('Neden: Işık / Gölge?')).toBe('Neden Işık Gölge'); expect(sanitizeFilename('***')).toBe('Nedenmis-Video'); });
});
