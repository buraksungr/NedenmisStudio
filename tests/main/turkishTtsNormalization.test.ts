import { describe, expect, it } from 'vitest';
import { integerToTurkishWords, normalizeTurkishForTts } from '../../shared/turkishTtsNormalization.js';

describe('Türkçe TTS sayı ve sembol normalizasyonu', () => {
  it.each([
    ['2026', 'iki bin yirmi altı'],
    ['1.480', 'bin dört yüz seksen'],
    ['%35', 'yüzde otuz beş'],
    ['3,5', 'üç virgül beş'],
    ['25 km', 'yirmi beş kilometre'],
    ['1080×1920', 'bin seksen çarpı bin dokuz yüz yirmi'],
    ['06.11.2026', 'altı Kasım iki bin yirmi altı'],
    ['2026-11-06', 'altı Kasım iki bin yirmi altı'],
    ['14:30', 'saat on dört otuz'],
    ['09.05', 'saat dokuz sıfır beş'],
    ['35 TL', 'otuz beş lira'],
    ['$5', 'beş dolar'],
    ['12 kg', 'on iki kilogram'],
    ['2+3', 'iki artı üç'],
    ['8/2', 'sekiz bölü iki'],
    ['1 TB', 'bir terabayt'],
    ['3,05', 'üç virgül sıfır beş'],
    ['-5', 'eksi beş'],
    ['1.000.000', 'bir milyon'],
    ['450 nanometre', 'dört yüz elli nanometre'],
  ])('%s metnini TTS için doğru okur', (source, expected) => {
    expect(normalizeTurkishForTts(source)).toBe(expected);
  });

  it('cümle noktasını sayıdan ayırır ve orijinal metni değiştirmez', () => {
    const source = 'Yıl 2026. Işık 450 nm ve çözünürlük 1080×1920.';
    expect(normalizeTurkishForTts(source)).toBe('Yıl iki bin yirmi altı. Işık dört yüz elli nanometre ve çözünürlük bin seksen çarpı bin dokuz yüz yirmi.');
    expect(source).toBe('Yıl 2026. Işık 450 nm ve çözünürlük 1080×1920.');
  });

  it('boşluklu çıkarma, üs ve bilimsel gösterimi okur', () => {
    expect(normalizeTurkishForTts('2 - 3; 2^3; 1e9; 5≥3; 2≠4; π≈3,14')).toBe('iki eksi üç; iki üssü üç; bir çarpı on üssü dokuz; beş büyük eşittir üç; iki eşit değildir dört; π yaklaşık üç virgül on dört');
  });

  it('BigInt ile büyük sayıları okur', () => {
    expect(integerToTurkishWords('1000000000000')).toBe('bir trilyon');
    expect(integerToTurkishWords('1000000000000000')).toBe('bir katrilyon');
    expect(integerToTurkishWords(12345678901234567890n)).toBe('on iki kentilyon üç yüz kırk beş katrilyon altı yüz yetmiş sekiz trilyon dokuz yüz bir milyar iki yüz otuz dört milyon beş yüz altmış yedi bin sekiz yüz doksan');
  });
});
