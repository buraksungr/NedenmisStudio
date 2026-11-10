const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const SCALES = ['', 'bin', 'milyon', 'milyar', 'trilyon', 'katrilyon', 'kentilyon', 'seksilyon', 'septilyon', 'oktilyon', 'nonilyon', 'desilyon'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const NUMBER = String.raw`[+-]?\d+(?:\.\d+)*(?:,\d+)?`;

// Sözcük → sıra sayısı eşlemesi. Ünsüz yumuşaması ("dört"→"dördüncü") ve ünlü
// uyumu burada açıkça yazılır; sonlu bir kural motoru tahmin yürütmez.
const ORDINAL_WORDS: Record<string, string> = {
  bir: 'birinci', iki: 'ikinci', üç: 'üçüncü', dört: 'dördüncü', beş: 'beşinci', altı: 'altıncı',
  yedi: 'yedinci', sekiz: 'sekizinci', dokuz: 'dokuzuncu', on: 'onuncu', yirmi: 'yirminci',
  otuz: 'otuzuncu', kırk: 'kırkıncı', elli: 'ellinci', altmış: 'altmışıncı', yetmiş: 'yetmişinci',
  seksen: 'sekseninci', doksan: 'doksanıncı', yüz: 'yüzüncü', bin: 'bininci',
  milyon: 'milyonuncu', milyar: 'milyarıncı', trilyon: 'trilyonuncu',
};

/**
 * Türkçe sıra sayısı: 1→birinci, 2→ikinci, 3→üçüncü, 4→dördüncü, 6→altıncı,
 * 20→yirminci, 21→yirmi birinci, 100→yüzüncü, 1000→bininci.
 */
export function ordinalToTurkishWords(value: number): string | undefined {
  if (!Number.isInteger(value) || value < 1 || value > 1_000_000_000_000) return undefined;
  const words = integerToTurkishWords(value).split(' ');
  const last = words.pop()!;
  const ordinal = ORDINAL_WORDS[last];
  if (!ordinal) return undefined;
  return [...words, ordinal].join(' ');
}

function matchCase(replacement: string, original: string): string {
  if (!original || original[0] !== original[0].toLocaleUpperCase('tr') || original[0] === original[0].toLocaleLowerCase('tr')) return replacement;
  return replacement[0].toLocaleUpperCase('tr') + replacement.slice(1);
}

function belowThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return [
    hundreds ? `${hundreds > 1 ? `${ONES[hundreds]} ` : ''}yüz` : '',
    TENS[Math.floor(rest / 10)],
    ONES[rest % 10],
  ].filter(Boolean).join(' ');
}

/** Basamak sınırı olmayan, Türkçe ölçek adlarına kadar genişletilebilir tam sayı okunuşu. */
export function integerToTurkishWords(input: string | number | bigint): string {
  const raw = String(input).replace(/\s+/g, '');
  if (!/^[+-]?\d+$/.test(raw)) throw new Error(`Tam sayı okunamıyor: ${raw}`);
  let value = BigInt(raw);
  const negative = value < 0;
  if (negative) value = -value;
  if (value === 0n) return 'sıfır';
  const groups: number[] = [];
  while (value > 0n) { groups.push(Number(value % 1000n)); value /= 1000n; }
  if (groups.length > SCALES.length) throw new Error('Sayı Türkçe ölçek adı sınırını aşıyor.');
  const parts: string[] = [];
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (!group) continue;
    const words = index === 1 && group === 1 ? 'bin' : `${belowThousand(group)}${index ? ` ${SCALES[index]}` : ''}`;
    parts.push(words);
  }
  return `${negative ? 'eksi ' : ''}${parts.join(' ')}`;
}

function decimalToWords(raw: string): string {
  let token = raw.replace(/\s+/g, '');
  let sign = '';
  if (/^[+-]/.test(token)) { sign = token[0] === '-' ? 'eksi ' : 'artı '; token = token.slice(1); }
  const integerPart = token.split(',')[0];
  if (/^\d{1,3}(?:\.\d{3})+$/.test(integerPart)) token = token.replace(/\./g, '');
  else if (/^\d+\.\d+$/.test(integerPart)) token = token.replace('.', ',');
  else if (integerPart.includes('.')) return `${sign}${token.split('.').map((part) => decimalToWords(part)).join(' nokta ')}`;
  const [integer, fraction] = token.split(',');
  let result = `${sign}${integerToTurkishWords(integer || '0')}`;
  if (fraction !== undefined) {
    const leadingZeroes = fraction.match(/^0+/)?.[0].length || 0;
    const remainder = fraction.slice(leadingZeroes);
    const fractionWords = remainder ? `${'sıfır '.repeat(leadingZeroes)}${integerToTurkishWords(remainder)}` : 'sıfır';
    result += ` virgül ${fractionWords}`;
  }
  return result;
}

function validDate(day: number, month: number): boolean {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}
function dateWords(day: number, month: number, year: number): string {
  return `${integerToTurkishWords(day)} ${MONTHS[month - 1]} ${integerToTurkishWords(year)}`;
}

const CURRENCIES: Record<string, string> = { '₺': 'lira', tl: 'lira', try: 'lira', '$': 'dolar', usd: 'dolar', '€': 'avro', eur: 'avro', euro: 'avro', '£': 'sterlin', gbp: 'sterlin', lira: 'lira', dolar: 'dolar', avro: 'avro', sterlin: 'sterlin' };
const UNITS: Record<string, string> = {
  'km/s': 'kilometre bölü saniye', 'm/s': 'metre bölü saniye', kwh: 'kilovat saat', khz: 'kilohertz', mhz: 'megahertz', ghz: 'gigahertz',
  km: 'kilometre', cm: 'santimetre', mm: 'milimetre', nm: 'nanometre', kg: 'kilogram', mg: 'miligram', ml: 'mililitre',
  tb: 'terabayt', gb: 'gigabayt', mb: 'megabayt', kb: 'kilobayt', kw: 'kilovat', kpa: 'kilopaskal', hpa: 'hektopaskal',
  hz: 'hertz', sn: 'saniye', dk: 'dakika', sa: 'saat', pa: 'paskal', '°c': 'derece', '°f': 'derece Fahrenhayt',
  m: 'metre', g: 'gram', l: 'litre', s: 'saniye', w: 'vat', v: 'volt', a: 'amper',
};
// "5G" bir ölçü birimi değil, nesil adıdır; "gram"a çevrilmemeli.
const UNIT_AMBIGUOUS = /^(g|m|s|a|v|w|l|pa)$/i;
const unitPattern = Object.keys(UNITS).sort((a, b) => b.length - a.length).map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

/**
 * Orijinal senaryoyu değiştirmeden TTS kopyası üretir. Altyazı ve SQLite'daki
 * narration bu fonksiyonun çıktısıyla değiştirilmemelidir.
 */
export function normalizeTurkishForTts(source: string): string {
  let text = source.normalize('NFC');
  // Harf dizisiyle bitişik sayılar ("5G", "4K", "3D", "1080p") bir ad ya da kod
  // olarak okunur; yalnızca ortak birim kısaltması değilse sonradan geri konur.
  const masked: string[] = [];
  text = text.replace(/\b\d+[A-ZÇĞİÖŞÜa-zçğıöşü]{1,3}\b/g, (token) => {
    if (UNITS[token.replace(/^\d+/, '').toLowerCase()] && !UNIT_AMBIGUOUS.test(token.replace(/^\d+/, ''))) return token;
    masked.push(token);
    return String.fromCodePoint(0xe000 + masked.length - 1);
  });
  text = text.replace(/\bDr\./gi, (match) => matchCase('doktor', match)).replace(/\bProf\./gi, (match) => matchCase('profesör', match))
    .replace(/\börn\./gi, (match) => matchCase('örneğin', match)).replace(/\bvb\./gi, (match) => matchCase('ve benzeri', match)).replace(/\bvs\./gi, (match) => matchCase('vesaire', match));

  text = text.replace(/\b(\d{4})-([01]?\d)-([0-3]?\d)\b/g, (_match, year, month, day) => {
    const d = Number(day), m = Number(month);
    return validDate(d, m) ? dateWords(d, m, Number(year)) : _match;
  });
  text = text.replace(/\b([0-3]?\d)[./-]([01]?\d)[./-](\d{4})\b/g, (_match, day, month, year) => {
    const d = Number(day), m = Number(month);
    return validDate(d, m) ? dateWords(d, m, Number(year)) : _match;
  });
  text = text.replace(/\b(saat\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/gi, (_match, prefix, hour, minute) => {
    const minutes = Number(minute) === 0 ? '' : ` ${/^0/.test(minute) ? `sıfır ${integerToTurkishWords(Number(minute))}` : integerToTurkishWords(Number(minute))}`;
    return `${prefix ? 'saat ' : 'saat '}${integerToTurkishWords(Number(hour))}${minutes}`;
  });

  // Sıra sayıları: "1. Dünya Savaşı" → "birinci Dünya Savaşı". Cümle sonu noktası
  // ayrı tutulur; sayıdan hemen sonra gelen nokta ve boşluk sıra eki sayılır.
  // Yalnızca 1-3 basamaklı sayılar sıra sayısı olarak okunur; dört basamaklı yıllar
  // ("Yıl 2026.") cümle sonu noktası olarak kalır ve yanlışlıkla "yirmi altıncı" olmaz.
  text = text.replace(/(?<!\d)(\d{1,3})\.(?=\s+[A-ZÇĞİÖŞÜa-zçğıöşü])/g, (_match, digits) => ordinalToTurkishWords(Number(digits)) ?? `${digits}.`);

  text = text.replace(new RegExp(`%\\s*(${NUMBER})`, 'g'), (_match, value) => `yüzde ${decimalToWords(value)}`);
  text = text.replace(new RegExp(`(${NUMBER})\\s*%`, 'g'), (_match, value) => `yüzde ${decimalToWords(value)}`);

  text = text.replace(new RegExp(`(₺|\\$|€|£)\\s*(${NUMBER})`, 'g'), (_match, currency, value) => `${decimalToWords(value)} ${CURRENCIES[currency.toLowerCase()]}`);
  const currencyNames = Object.keys(CURRENCIES).filter((key) => key.length > 1).sort((a, b) => b.length - a.length).join('|');
  text = text.replace(new RegExp(`(${NUMBER})\\s*(${currencyNames}|₺)`, 'gi'), (_match, value, currency) => `${decimalToWords(value)} ${CURRENCIES[currency.toLowerCase()]}`);
  // Birimden sonra gelen üst simgeler okunmaz ("km²" → "kilometre kare").
  text = text.replace(/(km|cm|mm|m)²/gi, (_match, unit: string) => `${UNITS[unit.toLowerCase()]} kare`)
    .replace(/(km|cm|mm|m)³/gi, (_match, unit: string) => `${UNITS[unit.toLowerCase()]} küp`);
  text = text.replace(new RegExp(`(${NUMBER})\\s*(${unitPattern})\\b`, 'gi'), (_match, value, unit) => {
    // Belirsiz tek harfli birimler yalnızca açık ölçü bağlamında okunur: "5G" adı korunur,
    // "5 g" ve "5 g'lık" ise "beş gram" olur.
    if (UNIT_AMBIGUOUS.test(unit) && !/^\s/.test(_match.slice(String(value).length))) return _match;
    return `${decimalToWords(value)} ${UNITS[unit.toLowerCase()]}`;
  });

  text = text.replace(new RegExp(`(${NUMBER})[eE]([+-]?\\d+)`, 'g'), (_match, value, exponent) => `${decimalToWords(value)} çarpı on üssü ${integerToTurkishWords(exponent)}`);
  text = text.replace(/±/g, ' artı eksi ').replace(/[×*]/g, ' çarpı ').replace(/(?<=\d)\s*[xX]\s*(?=\d)/g, ' çarpı ')
    .replace(/≤/g, ' küçük eşittir ').replace(/≥/g, ' büyük eşittir ').replace(/≠/g, ' eşit değildir ').replace(/≈/g, ' yaklaşık ').replace(/∞/g, ' sonsuz ')
    .replace(/\//g, ' bölü ').replace(/\+/g, ' artı ').replace(/(?<=\d)\s+-\s+(?=\d)/g, ' eksi ').replace(/\^/g, ' üssü ').replace(/=/g, ' eşittir ').replace(/>/g, ' büyüktür ').replace(/</g, ' küçüktür ');
  text = text.replace(new RegExp(NUMBER, 'g'), (value) => decimalToWords(value));
  text = text.replace(/[\ue000-\uf8ff]/g, (match) => masked[match.codePointAt(0)! - 0xe000]);
  return text.replace(/\s+/g, ' ').replace(/\s+([,.!?;:])/g, '$1').trim();
}
