const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const SCALES = ['', 'bin', 'milyon', 'milyar', 'trilyon', 'katrilyon', 'kentilyon', 'seksilyon', 'septilyon', 'oktilyon', 'nonilyon', 'desilyon'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const NUMBER = String.raw`[+-]?\d+(?:\.\d+)*(?:,\d+)?`;

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
const unitPattern = Object.keys(UNITS).sort((a, b) => b.length - a.length).map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

/**
 * Orijinal senaryoyu değiştirmeden TTS kopyası üretir. Altyazı ve SQLite'daki
 * narration bu fonksiyonun çıktısıyla değiştirilmemelidir.
 */
export function normalizeTurkishForTts(source: string): string {
  let text = source.normalize('NFC');
  text = text.replace(/\bDr\./gi, 'doktor').replace(/\bProf\./gi, 'profesör').replace(/\börn\./gi, 'örneğin').replace(/\bvb\./gi, 've benzeri').replace(/\bvs\./gi, 'vesaire');

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

  text = text.replace(new RegExp(`%\\s*(${NUMBER})`, 'g'), (_match, value) => `yüzde ${decimalToWords(value)}`);
  text = text.replace(new RegExp(`(${NUMBER})\\s*%`, 'g'), (_match, value) => `yüzde ${decimalToWords(value)}`);

  text = text.replace(new RegExp(`(₺|\\$|€|£)\\s*(${NUMBER})`, 'g'), (_match, currency, value) => `${decimalToWords(value)} ${CURRENCIES[currency.toLowerCase()]}`);
  const currencyNames = Object.keys(CURRENCIES).filter((key) => key.length > 1).sort((a, b) => b.length - a.length).join('|');
  text = text.replace(new RegExp(`(${NUMBER})\\s*(${currencyNames}|₺)`, 'gi'), (_match, value, currency) => `${decimalToWords(value)} ${CURRENCIES[currency.toLowerCase()]}`);
  text = text.replace(new RegExp(`(${NUMBER})\\s*(${unitPattern})\\b`, 'gi'), (_match, value, unit) => `${decimalToWords(value)} ${UNITS[unit.toLowerCase()]}`);

  text = text.replace(new RegExp(`(${NUMBER})[eE]([+-]?\\d+)`, 'g'), (_match, value, exponent) => `${decimalToWords(value)} çarpı on üssü ${integerToTurkishWords(exponent)}`);
  text = text.replace(/±/g, ' artı eksi ').replace(/[×*]/g, ' çarpı ').replace(/(?<=\d)\s*[xX]\s*(?=\d)/g, ' çarpı ')
    .replace(/≤/g, ' küçük eşittir ').replace(/≥/g, ' büyük eşittir ').replace(/≠/g, ' eşit değildir ').replace(/≈/g, ' yaklaşık ').replace(/∞/g, ' sonsuz ')
    .replace(/\//g, ' bölü ').replace(/\+/g, ' artı ').replace(/(?<=\d)\s+-\s+(?=\d)/g, ' eksi ').replace(/\^/g, ' üssü ').replace(/=/g, ' eşittir ').replace(/>/g, ' büyüktür ').replace(/</g, ' küçüktür ');
  text = text.replace(new RegExp(NUMBER, 'g'), (value) => decimalToWords(value));
  return text.replace(/\s+/g, ' ').replace(/\s+([,.!?;:])/g, '$1').trim();
}
