import { escapeXml } from '../utils.js';
import type { ChannelIdentity, Project, Scene } from '../types.js';
import { classifyScene } from './sceneComposition.js';
import { diagramForComposition } from './sceneDiagrams.js';

/**
 * Sahnenin bilimsel diyagramı.
 *
 * BUILD 44: eskiden dar bir anahtar sözcük listesine düşmeyen her konu aynı
 * "SORU/NEDEN/SONUÇ/KANIT" şablonunu alıyordu; iki farklı konunun görseli
 * neredeyse birebir aynı çıkıyordu (ölçülen fark 1,39/255). Artık konu
 * `classifyScene` ile bilimsel alana ayrılıyor ve her alan kendi görsel
 * dilini kullanıyor; genel şablon bile konu imzasından türetilen parametrelerle
 * çiziliyor.
 */
export function diagramFor(project: Project, scene: Scene, accent: string): string {
  return diagramForComposition(project, scene, classifyScene(project, scene), accent);
}

/** Başlık tipografisi: 1080 px genişlikte güvenli alan (72 px kenar boşluğu). */
export const TITLE_FONT_SIZE = 47;
export const TITLE_LINE_HEIGHT = 58;
export const TITLE_SAFE_WIDTH = 1080 - 72 * 2; // 936
const TITLE_MAX_LINES = 3;

/**
 * Türkçe metin için gerçek glif genişlikleri (Inter/Arial, font-size = 1 birim).
 * Chromium'da ölçüldü; başlık sarma hesabı tahmine dayanmaz. Inter yüklü
 * değilse Arial/Liberation Sans'a düşer ve bu tablo o ölçüme dayanır.
 */
const GLYPH_WIDTHS: Record<string, number> = {
  '0': 0.6959, '1': 0.6959, '2': 0.6959, '3': 0.6959, '4': 0.6959, '5': 0.6959, '6': 0.6959, '7': 0.6959, '8': 0.6959, '9': 0.6959,
  a: 0.6748, b: 0.7159, c: 0.5928, 'ç': 0.5928, d: 0.7159, e: 0.6783, f: 0.45, g: 0.7159, 'ğ': 0.7159, h: 0.712, 'ı': 0.3428,
  i: 0.3428, j: 0.3828, k: 0.69, l: 0.3428, m: 1.042, n: 0.712, o: 0.687, 'ö': 0.687, p: 0.7159, r: 0.5, s: 0.5953, 'ş': 0.5953,
  t: 0.4781, u: 0.712, 'ü': 0.712, v: 0.6519, y: 0.6519, z: 0.582,
  A: 0.7741, B: 0.7623, C: 0.7339, 'Ç': 0.7339, D: 0.8302, E: 0.6831, F: 0.6831, G: 0.8209, 'Ğ': 0.8209, H: 0.837, I: 0.3722,
  'İ': 0.3722, J: 0.4322, K: 0.81, L: 0.6373, M: 0.9952, N: 0.837, O: 0.8502, 'Ö': 0.8502, P: 0.733, R: 0.7702, S: 0.7203,
  'Ş': 0.7203, T: 0.6822, U: 0.812, 'Ü': 0.812, V: 0.7741, Y: 0.75, Z: 0.7252, ' ': 0.26, '.': 0.38, ',': 0.38, ';': 0.4, ':': 0.4,
  '!': 0.4561, '?': 0.5802, '%': 1.002, '(': 0.457, ')': 0.457, '-': 0.4152, "'": 0.3063, '"': 0.5211,
};
/** Tabloda olmayan glifler için ortalama genişlik. */
const FALLBACK_GLYPH_WIDTH = 0.72;

export function measureTitleWidth(text: string, fontSize = TITLE_FONT_SIZE): number {
  let total = 0;
  for (const char of text) total += (GLYPH_WIDTHS[char] ?? FALLBACK_GLYPH_WIDTH) * fontSize;
  return total;
}

/**
 * Başlığı güvenli alan içinde satırlara böler.
 *
 * Regresyon (Build 40): başlık tek satır olarak basılıyordu; uzun Türkçe
 * başlıklar kompozisyonu taşıp kırpılıyordu (ölçüm: 1304,9 px > 1080 px).
 * Sarma, hem önizlemede hem dışa aktarımda aynı SVG üretildiği için ikisini
 * birlikte düzeltir.
 */
export function wrapTitle(text: string, fontSize = TITLE_FONT_SIZE, safeWidth = TITLE_SAFE_WIDTH, maxLines = TITLE_MAX_LINES): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureTitleWidth(candidate, fontSize) <= safeWidth || !current) { current = candidate; continue; }
    lines.push(current); current = word;
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  // Son satır hâlâ taşıyorsa kısalt: kırpma yerine açık bir üç nokta.
  const last = lines.length - 1;
  if (last >= 0 && measureTitleWidth(lines[last], fontSize) > safeWidth) {
    let trimmed = lines[last];
    while (trimmed.length > 1 && measureTitleWidth(`${trimmed}…`, fontSize) > safeWidth) trimmed = trimmed.slice(0, -1);
    lines[last] = `${trimmed.trimEnd()}…`;
  }
  return lines.length ? lines : [''];
}

export function buildArtworkSvg(project: Project, scene: Scene, identity: ChannelIdentity, artwork: string, cameraTransform = '', metadata = ''): string {
  const accent = identity.primaryColor || '#D8FF65';
  // Başlık artık 42 KARAKTERLE kesilmez: kesme, sarma yeteneğini etkisiz
  // bırakıyordu ("…nede…" gibi anlamsız kırpma). Uzunluk sınırı görseldir ve
  // `wrapTitle` tarafından satır/güvenli alan ölçüsüyle uygulanır.
  const label = project.topic.trim();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" ${metadata}>
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101915"/><stop offset=".55" stop-color="#17241F"/><stop offset="1" stop-color="#0A1114"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="25" flood-opacity=".35"/></filter></defs>
    <rect width="1080" height="1920" fill="url(#bg)"/><circle cx="940" cy="180" r="360" fill="${accent}" opacity=".025"/><circle cx="90" cy="1550" r="420" fill="#4AA8C0" opacity=".035"/>
    <g font-family="Inter,Arial,sans-serif"><text x="72" y="105" fill="${accent}" font-size="25" font-weight="800" letter-spacing="4">${escapeXml(identity.channelName.toLocaleUpperCase('tr-TR'))}</text><text x="1008" y="105" text-anchor="end" fill="#91A099" font-size="24">SAHNE ${String(scene.number).padStart(2, '0')}</text>
    ${wrapTitle(label).map((line, index) => `<text x="72" y="${210 + index * TITLE_LINE_HEIGHT}" fill="#F3F7F4" font-size="${TITLE_FONT_SIZE}" font-weight="700">${escapeXml(line)}</text>`).join('')}<rect x="72" y="${254 + (wrapTitle(label).length - 1) * TITLE_LINE_HEIGHT}" width="82" height="5" rx="2.5" fill="${accent}"/></g>
    <g transform="${cameraTransform}"><g filter="url(#shadow)">${artwork}</g></g>
    <g font-family="Inter,Arial,sans-serif"><rect x="72" y="1590" width="936" height="1" fill="#FFFFFF" opacity=".12"/><text x="72" y="1670" fill="#9DAFA5" font-size="25" letter-spacing="3">NEDENİNİ KEŞFET</text><text x="72" y="1760" fill="#F3F7F4" font-size="35" font-weight="600">${escapeXml(identity.tagline.slice(0, 55))}</text><circle cx="965" cy="1745" r="24" fill="${accent}"/><path d="M954 1745 h22 m-9-9 9 9-9 9" stroke="#17211B" stroke-width="3" fill="none"/></g>
  </svg>`;
}

export function buildProceduralSvg(project: Project, scene: Scene, identity: ChannelIdentity): string {
  return buildArtworkSvg(project, scene, identity, diagramFor(project, scene, identity.primaryColor || '#D8FF65'));
}
