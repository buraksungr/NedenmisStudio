import { describe, expect, it } from 'vitest';
import { integerToTurkishWords, normalizeTurkishForTts, ordinalToTurkishWords } from '../../shared/turkishTtsNormalization.js';

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

  it('Türkçe karakterleri, ekleri ve büyük harfli kısaltmaları bozmaz', () => {
    expect(normalizeTurkishForTts("Çığlık atan güvercin ışığa uçtu; şoför öğle yemeğinde ölçüm yaptı."))
      .toBe("Çığlık atan güvercin ışığa uçtu; şoför öğle yemeğinde ölçüm yaptı.");
    expect(normalizeTurkishForTts("TÜBİTAK'ın İstanbul'daki ölçümü 5 °C'yi gösterdi."))
      .toBe("TÜBİTAK'ın İstanbul'daki ölçümü beş derece'yi gösterdi.");
    // NFC korunur: ayrıştırılmış (NFD) girdi birleşik biçime döner, harf sayısı değişmez.
    const decomposed = "I\u0307stanbul'da \u0131\u015f\u0131k".normalize("NFD");
    expect(normalizeTurkishForTts(decomposed).normalize("NFC")).toBe("İstanbul'da ışık");
    expect([...normalizeTurkishForTts(decomposed)]).toHaveLength([..."İstanbul'da ışık"].length);
  });

  it('sayıları, birimleri ve sıra sayılarını konuşma dilinde okur', () => {
    expect(normalizeTurkishForTts("Sıcaklık -8 °C, rüzgâr 25 km/s, süre 1,5 sn.")).toBe("Sıcaklık eksi sekiz derece, rüzgâr yirmi beş kilometre bölü saniye, süre bir virgül beş saniye.");
    expect(normalizeTurkishForTts("Işık hızı 299.792.458 m/s, alan 783.562 km².")).toBe("Işık hızı iki yüz doksan dokuz milyon yedi yüz doksan iki bin dört yüz elli sekiz metre bölü saniye, alan yedi yüz seksen üç bin beş yüz altmış iki kilometre kare.");
    expect(normalizeTurkishForTts("%14,5 artış; 3. sırada; 1. Dünya Savaşı")).toBe("yüzde on dört virgül beş artış; üçüncü sırada; birinci Dünya Savaşı");
    expect(ordinalToTurkishWords(1)).toBe("birinci");
    expect(ordinalToTurkishWords(4)).toBe("dördüncü");
    expect(ordinalToTurkishWords(6)).toBe("altıncı");
    expect(ordinalToTurkishWords(20)).toBe("yirminci");
    expect(ordinalToTurkishWords(100)).toBe("yüzüncü");
    expect(ordinalToTurkishWords(21)).toBe("yirmi birinci");
  });

  it('özel adları ve bitişik kodları (5G, 4K) sayıya çevirmez', () => {
    expect(normalizeTurkishForTts('5G ağı ve 4K video')).toBe('5G ağı ve 4K video');
    expect(normalizeTurkishForTts('Çankırı, Niğde ve Şanlıurfa')).toBe('Çankırı, Niğde ve Şanlıurfa');
  });

  it('konuşma dilindeki uzun cümleyi ve ekleri korur', () => {
    const long = "Bakın, buzun sudan hafif olmasının sebebi aslında çok basit: su donarken molekülleri açık bir kafes oluşturuyor, yani aynı sayıda molekül daha fazla yer kaplıyor.";
    expect(normalizeTurkishForTts(long)).toBe(long);
  });
});
