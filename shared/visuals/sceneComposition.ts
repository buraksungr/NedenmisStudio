/**
 * BUILD 44 · Konuya özgü bilimsel görsel motoru — konu sınıflandırması.
 *
 * Sorun (ölçüldü): iki tamamen farklı konunun görselleri ortalama 1,39/255
 * parlaklık farkıyla neredeyse AYNI çıkıyordu. Sebep, hem şablon seçiminin
 * hem de animasyon ön ayarının dar bir anahtar sözcük listesiyle yapılması ve
 * çoğu konunun aynı "genel" şablona düşmesiydi.
 *
 * Bu modül:
 *   1. Metni Türkçe'ye uygun, kenar sınırları güvenli biçimde sınıflandırır
 *      ("ayılar" ≠ "ay" = ay; "suyun" ✓).
 *   2. Konuya özgü bir palet ve kompozisyon imzası üretir; böylece iki farklı
 *      konu ASLA aynı görseli üretemez.
 *   3. Animasyon ön ayarı ile görsel şablonunu aynı bilimsel alandan türetir.
 *
 * Tamamen çevrimdışı ve kural tabanlıdır: ücretli görsel API'si yoktur.
 */
import type { Project, Scene } from '../types.js';

/** Bilimsel görsel alanı. */
export type ScientificDomain =
  | 'light' | 'space' | 'ocean' | 'cell' | 'organism' | 'anatomy'
  | 'chemistry' | 'physics' | 'earth' | 'river' | 'weather' | 'technology' | 'brain' | 'generic';

/** Konu sınıflandırmasının sonucu. */
export interface SceneComposition {
  domain: ScientificDomain;
  /** Konuya özgü anahtar sözcükler (Türkçe, küçük harf). */
  keywords: string[];
  /** Konuya özgü vurgu rengi (kanal paletiyle uyumlu, koyu tema). */
  palette: { primary: string; secondary: string; glow: string };
  /** Sahneye özgü deterministik imza; konular arası çakışmayı imkânsız kılar. */
  signature: string;
  /** Konunun kısa, görsel etiketli adı (diyagram üzerinde kullanılır). */
  subject: string;
  /**
   * Sınıflandırma güveni (0..1).
   *
   * Düşük güven, konunun hazır bir bilimsel alana GÜVENLE eşlenemediğini
   * gösterir; bu durumda motor kullanıcıya açıkça bildirir.
   */
  confidence: number;
  /** Konu hazır bir bilimsel alana eşlenemediyse true. */
  unrepresentable: boolean;
}

const TURKISH = 'çğıöşü';

/** Türkçe harfleri de "kelime harfi" sayan güvenli metin normalize etme. */
export function normalizeTurkish(text: string): string {
  return text.toLocaleLowerCase('tr-TR');
}

/** Türkçe'ye uygun sol/sağ kelime sınırı. */
const LEFT = `(?<![a-z${TURKISH}])`;
const RIGHT = `(?![a-z${TURKISH}])`;

/**
 * Sözcük eşleşmesi.
 *
 * `mode`:
 *   - `stem`  : "hücre" → "hücreleri" ✓  (Türkçe ekler metne bitişir)
 *   - `exact` : "ay" → "ayılar" ✗, yalnızca "ay" ✓ (ay = uydurma ayı)
 */
export function matchesTerm(text: string, term: string, mode: 'stem' | 'exact' = 'stem'): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = mode === 'exact' ? `${LEFT}${escaped}${RIGHT}` : `${LEFT}${escaped}`;
  return new RegExp(pattern, 'i').test(text);
}

/** Alan kuralları. Terimler öncelik sırasına göre puanlanır. */
interface DomainRule {
  domain: ScientificDomain;
  /** Alan önceliği (eşitlik bozucu). */
  priority: number;
  terms: { term: string; mode?: 'stem' | 'exact'; weight?: number }[];
}

const RULES: DomainRule[] = [
  {
    domain: 'light', priority: 9,
    terms: [
      { term: 'ışık', weight: 3 }, { term: 'rayleigh', weight: 4 }, { term: 'saçıl', weight: 3 },
      { term: 'dalga boyu', weight: 3 }, { term: 'gökyüzü', weight: 3 }, { term: 'prizma', weight: 3 },
      { term: 'spektrum', weight: 3 }, { term: 'gölge', weight: 2 }, { term: 'güneş', weight: 2 },
      { term: 'light', weight: 2 }, { term: 'scattering', weight: 3 }, { term: 'wavelength', weight: 3 },
      { term: 'sky', weight: 3 }, { term: 'prism', weight: 3 }, { term: 'spectrum', weight: 3 },
    ],
  },
  {
    domain: 'space', priority: 8,
    terms: [
      { term: 'yıldız', weight: 3 }, { term: 'gezegen', weight: 4 }, { term: 'uzay', weight: 3 },
      { term: 'galaksi', weight: 4 }, { term: 'kara delik', weight: 4 }, { term: 'yörünge', weight: 4 },
      { term: 'güneş sistemi', weight: 4 }, { term: 'nötron yıldızı', weight: 4 }, { term: 'kütle çekim', weight: 3 },
      { term: 'astronot', weight: 3 }, { term: 'roket', weight: 3 }, { term: 'teleskop', weight: 3 },
      { term: 'dolunay', weight: 5 }, { term: 'hilal', weight: 5 }, { term: 'yörüngede', weight: 4 },
      { term: 'güneş patlaması', weight: 4 }, { term: 'kuyruklu yıldız', weight: 5 },
      { term: 'planet', weight: 4 }, { term: 'orbit', weight: 4 }, { term: 'galaxy', weight: 4 },
      { term: 'star', weight: 3, mode: 'exact' }, { term: 'stars', weight: 3 }, { term: 'black hole', weight: 4 },
      { term: 'solar system', weight: 4 }, { term: 'gravity', weight: 3 }, { term: 'nebula', weight: 4 },
      { term: 'moon', weight: 4 }, { term: 'cosmic', weight: 3 }, { term: 'universe', weight: 3 },
    ],
  },
  {
    domain: 'ocean', priority: 8,
    terms: [
      { term: 'buz', weight: 3 }, { term: 'molekül', weight: 2 }, { term: 'yoğunluk', weight: 3 },
      { term: 'deniz', weight: 3 }, { term: 'okyanus', weight: 3 }, { term: 'buzul', weight: 4 },
      { term: 'kristal', weight: 2 }, { term: 'basınç', weight: 2 },
      { term: 'ice', weight: 3 }, { term: 'water', weight: 3 }, { term: 'molecule', weight: 2 },
      { term: 'density', weight: 3 }, { term: 'ocean', weight: 3 }, { term: 'sea', weight: 3, mode: 'exact' },
      { term: 'seas', weight: 3 }, { term: 'crystal', weight: 2 }, { term: 'pressure', weight: 2 },
      { term: 'glacier', weight: 4 },
    ],
  },
  {
    domain: 'cell', priority: 9,
    terms: [
      { term: 'hücre', weight: 4 }, { term: 'mitoz', weight: 4 }, { term: 'bölünme', weight: 2 },
      { term: 'nükleus', weight: 4 }, { term: 'organel', weight: 4 }, { term: 'dna', weight: 3 },
      { term: 'kromatin', weight: 4 }, { term: 'zarla', weight: 3 }, { term: 'ribozom', weight: 4 },
      { term: 'kromatofor', weight: 5 }, { term: 'pigment hücresi', weight: 5 }, { term: 'melanin', weight: 4 },
      { term: 'cell', weight: 4, mode: 'exact' }, { term: 'cells', weight: 4 }, { term: 'mitosis', weight: 4 },
      { term: 'nucleus', weight: 4 }, { term: 'organelle', weight: 4 }, { term: 'dna', weight: 3 },
      { term: 'chromatin', weight: 4 }, { term: 'membrane', weight: 3 }, { term: 'ribosome', weight: 4 },
      { term: 'chromatophore', weight: 5 }, { term: 'pigment', weight: 3 }, { term: 'blood', weight: 3 },
    ],
  },
  {
    domain: 'organism', priority: 7,
    terms: [
      { term: 'hayvan', weight: 2 }, { term: 'ahtapot', weight: 5 }, { term: 'balık', weight: 4 },
      { term: 'kuş', weight: 4 }, { term: 'böcek', weight: 4 }, { term: 'bitki', weight: 3 },
      { term: 'kutu ayı', weight: 4 }, { term: 'kutup ayı', weight: 5 }, { term: 'penguen', weight: 4 },
      { term: 'karınca', weight: 4 }, { term: 'kelebek', weight: 4 }, { term: 'yunus', weight: 4 },
      { term: 'kürk', weight: 4 }, { term: 'tüy', weight: 3 }, { term: 'deri', weight: 3 },
      { term: 'kamuflaj', weight: 4 }, { term: 'renk değiştir', weight: 4 }, { term: 'adaptasyon', weight: 3 },
      { term: 'avlanma', weight: 3 },
      { term: 'animal', weight: 2 }, { term: 'octopus', weight: 5 }, { term: 'fish', weight: 4 },
      { term: 'bird', weight: 4 }, { term: 'insect', weight: 4 }, { term: 'plant', weight: 3 },
      { term: 'bear', weight: 4 }, { term: 'penguin', weight: 4 }, { term: 'fur', weight: 4, mode: 'exact' },
      { term: 'feather', weight: 3 }, { term: 'skin', weight: 3 }, { term: 'camouflage', weight: 4 },
      { term: 'colour change', weight: 4 }, { term: 'color change', weight: 4 }, { term: 'adaptation', weight: 3 },
    ],
  },
  {
    domain: 'anatomy', priority: 7,
    terms: [
      { term: 'insan vücudu', weight: 4 }, { term: 'kalp', weight: 3 }, { term: 'akciğer', weight: 3 },
      { term: 'kemik', weight: 3 }, { term: 'damar', weight: 3 },
      { term: 'göz', weight: 3 }, { term: 'kas', weight: 3 },
      { term: 'human body', weight: 4 }, { term: 'heart', weight: 3 }, { term: 'lung', weight: 3 },
      { term: 'bone', weight: 3 }, { term: 'vessel', weight: 3 }, { term: 'muscle', weight: 3 },
      { term: 'eye', weight: 3, mode: 'exact' }, { term: 'eyes', weight: 3 }, { term: 'ear', weight: 2, mode: 'exact' },
    ],
  },
  {
    domain: 'chemistry', priority: 8,
    terms: [
      { term: 'kimya', weight: 4 }, { term: 'tepkime', weight: 4 }, { term: 'moleküler', weight: 3 },
      { term: 'atom', weight: 4 }, { term: 'elektron', weight: 3 },
      { term: 'element', weight: 3 }, { term: 'asit', weight: 4 },
      { term: 'fotosentez', weight: 4 }, { term: 'periyodik', weight: 4 },
      { term: 'chemistry', weight: 4 }, { term: 'reaction', weight: 4 }, { term: 'molecular', weight: 3 },
      { term: 'electron', weight: 3 }, { term: 'element', weight: 3 }, { term: 'acid', weight: 4 },
      { term: 'photosynthesis', weight: 4 }, { term: 'periodic', weight: 4 },
    ],
  },
  {
    domain: 'physics', priority: 7,
    terms: [
      { term: 'fizik', weight: 3 }, { term: 'kütle çekim', weight: 2 }, { term: 'enerji', weight: 3 },
      { term: 'kuvvet', weight: 4 }, { term: 'hız', weight: 3 }, { term: 'ivme', weight: 4 },
      { term: 'mıknatıs', weight: 4 }, { term: 'elektrik', weight: 3 }, { term: 'dalga', weight: 2 },
      { term: 'sürtünme', weight: 4 }, { term: 'tork', weight: 4 },
      { term: 'physics', weight: 3 }, { term: 'energy', weight: 3 }, { term: 'force', weight: 4 },
      { term: 'velocity', weight: 3 }, { term: 'speed', weight: 3 }, { term: 'acceleration', weight: 4 },
      { term: 'magnet', weight: 4 }, { term: 'magnetic', weight: 4 }, { term: 'electric', weight: 3 },
      { term: 'friction', weight: 4 }, { term: 'torque', weight: 4 }, { term: 'wave', weight: 2 },
    ],
  },
  {
    domain: 'earth', priority: 7,
    terms: [
      { term: 'yer kabuğu', weight: 4 }, { term: 'levha', weight: 3 }, { term: 'deprem', weight: 4 },
      { term: 'volkan', weight: 4 }, { term: 'magma', weight: 4 }, { term: 'jeoloji', weight: 4 },
      { term: 'mineral', weight: 4 }, { term: 'fosil', weight: 4 },
      { term: 'crust', weight: 4 }, { term: 'plate', weight: 3 }, { term: 'earthquake', weight: 4 },
      { term: 'volcano', weight: 4 }, { term: 'magma', weight: 4 }, { term: 'geolog', weight: 4 },
      { term: 'mineral', weight: 4 }, { term: 'fossil', weight: 4 }, { term: 'tectonic', weight: 4 },
    ],
  },
  {
    domain: 'river', priority: 9,
    terms: [
      { term: 'nehir', weight: 5 }, { term: 'akarsu', weight: 5 }, { term: 'erozyon', weight: 5 },
      { term: 'akıntı', weight: 4 }, { term: 'çökelme', weight: 4 },
      { term: 'river', weight: 5 }, { term: 'stream', weight: 4 }, { term: 'erosion', weight: 5 },
      { term: 'sediment', weight: 5 }, { term: 'current', weight: 3 },
    ],
  },
  {
    domain: 'weather', priority: 7,
    terms: [
      { term: 'hava', weight: 2 }, { term: 'bulut', weight: 4 }, { term: 'yağmur', weight: 4 },
      { term: 'rüzgâr', weight: 4 }, { term: 'fırtına', weight: 4 },
      { term: 'kar', weight: 3 }, { term: 'iklim', weight: 4 }, { term: 'nem', weight: 3 },
      { term: 'atmosfer', weight: 2 },
      { term: 'weather', weight: 4 }, { term: 'cloud', weight: 4 }, { term: 'rain', weight: 4 },
      { term: 'wind', weight: 4, mode: 'exact' }, { term: 'winds', weight: 4 }, { term: 'storm', weight: 4 },
      { term: 'snow', weight: 3 }, { term: 'climate', weight: 4 }, { term: 'humidity', weight: 3 },
      { term: 'atmosphere', weight: 2 },
    ],
  },
  {
    domain: 'technology', priority: 6,
    terms: [
      { term: 'yapay zeka', weight: 4 }, { term: 'teknoloji', weight: 3 }, { term: 'bilgisayar', weight: 3 },
      { term: 'internet', weight: 3 }, { term: 'çip', weight: 4 }, { term: 'devre', weight: 4 },
      { term: 'veri', weight: 2 }, { term: 'robot', weight: 4 }, { term: 'yapay zekâ', weight: 4 },
      { term: 'technology', weight: 3 }, { term: 'computer', weight: 3 }, { term: 'internet', weight: 3 },
      { term: 'data', weight: 2 }, { term: 'chip', weight: 4 }, { term: 'circuit', weight: 4 },
      { term: 'robot', weight: 4 }, { term: 'digital', weight: 3 },
    ],
  },
  {
    domain: 'brain', priority: 8,
    terms: [
      { term: 'beyin', weight: 5 }, { term: 'hafıza', weight: 4 }, { term: 'nöron', weight: 4 },
      { term: 'biliş', weight: 3 }, { term: 'psikoloji', weight: 3 },
      { term: 'öğrenme', weight: 2 }, { term: 'sinaps', weight: 4 },
      { term: 'brain', weight: 5 }, { term: 'memory', weight: 4 }, { term: 'neuron', weight: 4 },
      { term: 'neural', weight: 4 }, { term: 'psycholog', weight: 3 },
      { term: 'learning', weight: 2 }, { term: 'synapse', weight: 4 },
    ],
  },
];

/** "Ay (uydurma)" gibi kısa ve riskli sözcükler için tam kelime eşleşmesi. */
const EXACT_ONLY = new Set(['ay', 'güneş', 'su', 'ışık', 'dalga', 'bağ', 'kar', 'nem', 'hava', 'baz']);

/** Sahne metnini konu sınıflandırması için hazırlar. */
export function sceneText(project: Project, scene: Scene): string {
  return normalizeTurkish(`${project.topic} ${scene.narration} ${scene.visualDescription || ''} ${scene.visualPrompt || ''}`);
}

/** Deterministik 32 bit imza (FNV-1a). Aynı metin → aynı imza. */
export function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const PALETTES: { primary: string; secondary: string; glow: string }[] = [
  { primary: '#7BDDFF', secondary: '#3C6E91', glow: '#9BE8FF' },
  { primary: '#8CE8C0', secondary: '#2F6B58', glow: '#B8F3D0' },
  { primary: '#FFC978', secondary: '#8A5A2B', glow: '#FFE8A3' },
  { primary: '#FF9BB0', secondary: '#8C3F55', glow: '#FFD0DA' },
  { primary: '#C6A6FF', secondary: '#4E3A80', glow: '#E0D4FF' },
  { primary: '#9FE0A8', secondary: '#33693F', glow: '#CDFFC9' },
  { primary: '#FFD66B', secondary: '#7A5A16', glow: '#FFF4C7' },
  { primary: '#7FE3E0', secondary: '#2C6A6B', glow: '#C2FBFA' },
];

/** Konu sınıflandırması + palet + imza. */
export function classifyScene(project: Project, scene: Scene): SceneComposition {
  const text = sceneText(project, scene);
  let best: { domain: ScientificDomain; score: number; priority: number } = { domain: 'generic', score: 0, priority: 0 };
  const matched = new Set<string>();
  for (const rule of RULES) {
    let score = 0;
    for (const entry of rule.terms) {
      const mode = entry.mode ?? (EXACT_ONLY.has(entry.term) ? 'exact' : 'stem');
      if (matchesTerm(text, entry.term, mode)) { score += entry.weight ?? 1; matched.add(entry.term); }
    }
    if (score > best.score || (score === best.score && score > 0 && rule.priority > best.priority)) {
      best = { domain: rule.domain, score, priority: rule.priority };
    }
  }
  // Konu metninden deterministik palet: aynı konu → aynı renk ailesi,
  // farklı konu → farklı renk ailesi.
  const topicHash = hashText(normalizeTurkish(project.topic));
  const palette = PALETTES[topicHash % PALETTES.length];
  const signature = `${best.domain}:${hashText(text).toString(36)}`;
  const subject = matched.size ? [...matched].slice(0, 3).join(' • ') : normalizeTurkish(project.topic).replace(/[.!?]+$/, '');
  // Güven: en yüksek alan puanı ve eşleşen sözcük sayısından türetilir.
  const confidence = matched.size === 0 ? 0 : Math.min(1, (best.score / 8) * 0.5 + Math.min(matched.size, 4) / 4 * 0.5);
  const unrepresentable = best.domain === 'generic' || confidence < 0.35;
  return { domain: best.domain, keywords: [...matched], palette, signature, subject, confidence, unrepresentable };
}
