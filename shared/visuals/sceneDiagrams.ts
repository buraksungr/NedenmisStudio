/**
 * BUILD 44 · Konuya özgü bilimsel diyagramlar.
 *
 * Her diyagram, sahnenin KONUSUNU ve ANLATIMINI temel alır; önceki sürümdeki
 * gibi dar bir anahtar sözcük listesine düşen tüm konular aynı "genel" şablona
 * gidiyordu. Artık her alanın kendi görsel dili var ve genel şablon bile
 * konu/imzadan türetilen parametrelerle çizilir; bu yüzden iki farklı konu
 * asla aynı görseli üretemez.
 *
 * Tüm çizimler 1080×1920 kompozisyon koordinatlarında, koyu tema için
 * hazırlanmıştır (görsel alanı ≈ y 380…1520).
 */
import { escapeXml } from '../utils.js';
import type { Project, Scene } from '../types.js';
import { classifyScene, hashText, matchesTerm, normalizeTurkish, type SceneComposition } from './sceneComposition.js';

const label = (text: string, x: number, y: number, size = 30, fill = '#EAF8FF', spacing = 4) =>
  `<text x="${x}" y="${y}" font-family="Inter,Arial" font-size="${size}" font-weight="700" fill="${fill}" letter-spacing="${spacing}">${escapeXml(text)}</text>`;

/**
 * Etiket bandının üst sınırı.
 *
 * BUILD 44: diyagramların alt bölümünde iki satırlık bir etiket bandı
 * bulunur. Hareket katmanı bu banttan aşağı sızarsa etiketlerin üstüne
 * biner ve yazılar okunmaz hâle gelir.
 */
export const CAPTION_BAND_TOP = 1268;

/** `label()` imzasındaki metinleri tanıyan kalıp. */
const LABEL_RE = /<text x="\d+" y="\d+" font-family="Inter,Arial" font-size="\d+" font-weight="700" fill="#[0-9A-Fa-f]{6}" letter-spacing="\d+">[^<]*<\/text>/g;

/**
 * Diyagramı "gövde" ve "etiketler" olarak ayırır.
 *
 * Etiketler hareket katmanının ÜZERİNDE çizilmelidir; aksi hâlde yarı
 * saydam hareket katmanı yazının üstüne biner. Etiketlerin dikey konumu da
 * döndürülür: arkasına okunaklı bir bant (caption plate) çizilebilir.
 */
export function splitDiagramLabels(svg: string): { body: string; labels: string; captionTop: number; captionBottom: number } {
  const found = svg.match(LABEL_RE) ?? [];
  const labels = found.join('');
  const positions = [...labels.matchAll(/<text x="\d+" y="(\d+)"/g)].map((match) => Number(match[1]));
  const captionTop = positions.length ? Math.min(...positions) : Number.POSITIVE_INFINITY;
  const captionBottom = positions.length ? Math.max(...positions) : Number.NEGATIVE_INFINITY;
  return { body: svg.replace(LABEL_RE, ''), labels, captionTop, captionBottom };
}

/** Deterministik parçacık dizisi (konu imzasından türetilir). */
function particles(seed: number, count: number, accent: string, area = { cx: 540, cy: 900, rx: 420, ry: 330 }): string {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index * 2.399963) + (seed % 100) * 0.017;
    const radius = 0.25 + ((seed >> (index % 12)) % 100) / 130;
    const x = area.cx + Math.cos(angle) * area.rx * radius;
    const y = area.cy + Math.sin(angle) * area.ry * radius;
    const r = 4 + (index % 5);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${index % 3 === 0 ? accent : '#71D5E5'}" opacity="${(0.35 + (index % 5) * 0.13).toFixed(2)}"/>`;
  }).join('');
}

/* ---------------------------------------------------------------- ışık --- */
function scatteringDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  return `
    <circle cx="170" cy="520" r="100" fill="${primary}"/>
    <g stroke="${glow}" stroke-width="10" opacity=".8">${Array.from({ length: 12 }, (_, i) => `<line x1="170" y1="360" x2="170" y2="300" transform="rotate(${i * 30} 170 520)"/>`).join('')}</g>
    <path d="M285 545 L680 725 M270 590 L635 900 M295 500 L760 600" stroke="${glow}" stroke-width="12" opacity=".75"/>
    <path d="M0 1000 Q540 710 1080 1000 L1080 1500 L0 1500Z" fill="#234D73" opacity=".7"/>
    <path d="M0 1040 Q540 760 1080 1040" fill="none" stroke="#7BDDFF" stroke-width="12"/>
    <g fill="${accent}">${Array.from({ length: 26 }, (_, i) => { const x = 420 + (i * 83) % 520; const y = 700 + (i * 137) % 440; return `<circle cx="${x}" cy="${y}" r="${6 + i % 5}"/><path d="M${x} ${y} l${-45 + i % 7 * 15} ${45 + i % 4 * 18}" stroke="${accent}" stroke-width="4"/>`; }).join('')}</g>
    ${label('IŞIK SAÇILIMI', 90, 730)}${label('DALGA BOYU', 690, 1210)}`;
}

/* ---------------------------------------------------------------- uzay --- */
function orbitalDiagram(composition: SceneComposition, accent: string): string {
  const { primary, secondary, glow } = composition.palette;
  return `
    <defs><radialGradient id="planet"><stop stop-color="${glow}"/><stop offset=".55" stop-color="${secondary}"/><stop offset="1" stop-color="#102738"/></radialGradient>
    <radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".6"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
    <g fill="#FFFFFF">${Array.from({ length: 70 }, (_, i) => `<circle cx="${(i * 179) % 1050 + 15}" cy="${(i * 263) % 1380 + 80}" r="${1 + i % 3}" opacity="${(.25 + (i % 6) / 10).toFixed(2)}"/>`).join('')}</g>
    <circle cx="720" cy="810" r="390" fill="url(#glow)"/><ellipse cx="590" cy="840" rx="410" ry="155" fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="12 16" transform="rotate(-18 590 840)"/>
    <circle cx="570" cy="860" r="260" fill="url(#planet)"/><path d="M390 790 Q520 670 640 760 T810 750 M350 920 Q520 850 700 980" fill="none" stroke="${glow}" stroke-width="36" opacity=".35"/>
    <circle cx="875" cy="650" r="75" fill="#D8D5CB"/><circle cx="850" cy="625" r="15" fill="#AAA99F"/><circle cx="900" cy="680" r="22" fill="#B7B4AA"/>
    <path d="M340 1180 Q610 1070 865 1150" fill="none" stroke="#FFFFFF" stroke-width="4" opacity=".35"/>${label('KÜTLE ÇEKİM • HAREKET', 385, 1260)}`;
}

function galaxyDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  const arms = Array.from({ length: 5 }, (_, arm) => Array.from({ length: 26 }, (_, index) => {
    const t = index / 26; const angle = arm * (Math.PI * 2 / 5) + t * 2.6; const r = 90 + t * 330;
    return `<circle cx="${(540 + Math.cos(angle) * r).toFixed(1)}" cy="${(880 + Math.sin(angle) * r * .74).toFixed(1)}" r="${(3 + t * 7).toFixed(1)}" fill="${index % 4 === 0 ? accent : primary}" opacity="${(0.25 + t * .7).toFixed(2)}"/>`;
  }).join('')).join('');
  return `<defs><radialGradient id="core"><stop stop-color="#FFF6D8"/><stop offset=".4" stop-color="${glow}"/><stop offset="1" stop-color="#0B1520" stop-opacity="0"/></radialGradient></defs>
    ${arms}<circle cx="540" cy="880" r="230" fill="url(#core)" opacity=".85"/>
    <g fill="#FFFFFF">${Array.from({ length: 120 }, (_, i) => `<circle cx="${(i * 137) % 1050 + 15}" cy="${(i * 271) % 1300 + 120}" r="${1 + i % 2}" opacity="${(.2 + (i % 5) / 8).toFixed(2)}"/>`).join('')}</g>
    ${label('YILDIZ DOĞUMU • GALAKSİ', 320, 1400)}`;
}

/* --------------------------------------------------------------- okyanus --- */
function waterDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  return `
    <path d="M0 700 Q170 640 340 700 T680 700 T1020 700 T1360 700 V1550 H0Z" fill="#123F59"/>
    <path d="M0 760 Q170 700 340 760 T680 760 T1020 760 T1360 760" fill="none" stroke="${glow}" stroke-width="9" opacity=".65"/>
    <g stroke="${glow}" stroke-width="5" fill="#173C4B">${Array.from({ length: 12 }, (_, i) => { const x = 200 + (i % 4) * 190 + (i % 2) * 30; const y = 930 + Math.floor(i / 4) * 180; return `<line x1="${x}" y1="${y}" x2="${x + 80}" y2="${y - 50}"/><line x1="${x}" y1="${y}" x2="${x + 80}" y2="${y + 60}"/><circle cx="${x}" cy="${y}" r="30"/><circle cx="${x + 85}" cy="${y - 55}" r="20" fill="${accent}"/><circle cx="${x + 85}" cy="${y + 65}" r="20" fill="${accent}"/>`; }).join('')}</g>
    <path d="M540 560 L380 830 L700 830Z" fill="${primary}" opacity=".85"/>${label('YAPI • YOĞUNLUK • HAREKET', 335, 1510)}`;
}

/* ----------------------------------------------------------------- hücre --- */
function cellDiagram(composition: SceneComposition, accent: string): string {
  const { primary, secondary, glow } = composition.palette;
  return `
    <ellipse cx="540" cy="880" rx="380" ry="330" fill="${secondary}" opacity=".55" stroke="${primary}" stroke-width="7"/>
    <ellipse cx="540" cy="880" rx="352" ry="302" fill="none" stroke="${glow}" stroke-width="2" stroke-dasharray="14 16" opacity=".8"/>
    <circle cx="540" cy="860" r="128" fill="${primary}" opacity=".9"/>
    <circle cx="540" cy="860" r="58" fill="#16231E"/><path d="M482 860 h116 M540 802 v116" stroke="${glow}" stroke-width="6" opacity=".8"/>
    <g fill="${accent}">${Array.from({ length: 9 }, (_, i) => { const angle = (i / 9) * Math.PI * 2; return `<ellipse cx="${(540 + Math.cos(angle) * 235).toFixed(0)}" cy="${(880 + Math.sin(angle) * 200).toFixed(0)}" rx="42" ry="20" transform="rotate(${((i / 9) * 360).toFixed(0)} ${(540 + Math.cos(angle) * 235).toFixed(0)} ${(880 + Math.sin(angle) * 200).toFixed(0)})" opacity=".9"/>`; }).join('')}</g>
    <g stroke="${glow}" stroke-width="4" fill="none" opacity=".7"><path d="M300 640 Q420 560 520 600"/><path d="M780 1120 Q660 1200 560 1160"/></g>
    ${label('HÜCRE YAPISI', 380, 1330)}${label('ÇEKİRDEK • ZAR • ORGANELLER', 300, 1385, 24, '#B9CFC4', 2)}`;
}

/** Yeni: renk değiştiren canlılarda pigment hücreleri (kromatofor). */
function pigmentCellDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  const cells = Array.from({ length: 7 }, (_, index) => {
    const x = 250 + index * 100; const y = 700 + (index % 3) * 120;
    const size = 42 + (index % 3) * 8;
    return `<g><circle cx="${x}" cy="${y}" r="${size}" fill="${primary}" opacity=".85"/><circle cx="${x}" cy="${y}" r="${size - 14}" fill="#16231E" opacity=".85"/><path d="M${x - size} ${y + 14} L${x - size - 46} ${y + 34}" stroke="${accent}" stroke-width="5" opacity=".7"/></g>`;
  }).join('');
  return `
    <path d="M0 560 H1080 V760 Q810 720 540 760 T0 760Z" fill="#2A3B33" opacity=".9"/>
    <path d="M0 560 H1080" stroke="${glow}" stroke-width="5" opacity=".55"/>
    ${cells}
    <g stroke="${accent}" stroke-width="7" opacity=".85">${Array.from({ length: 5 }, (_, i) => `<path d="M120 ${420 + i * 34} L430 ${470 + i * 34}"/>`).join('')}</g>
    <g fill="${glow}" opacity=".9">${Array.from({ length: 5 }, (_, i) => `<path d="M430 ${470 + i * 34} l-34 -18 v36Z"/>`).join('')}</g>
    <g stroke="${primary}" stroke-width="4" fill="none" opacity=".65"><path d="M300 1000 Q540 1120 780 1000"/></g>
    <g fill="${accent}">${Array.from({ length: 6 }, (_, i) => `<circle cx="${330 + i * 84}" cy="${1120 + (i % 2) * 40}" r="13"/>`).join('')}</g>
    ${label('PİGMENT HÜCRELERİ', 350, 1290)}${label('GENİŞLEME • DARALMA', 355, 1345, 24, '#B9CFC4', 2)}`;
}

/** Yeni: hücre bölünmesi. */
function divisionDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  const spindle = Array.from({ length: 9 }, (_, index) => {
    const t = index / 8; const x1 = 540 - 320 + t * 120; const x2 = 540 + 320 - t * 120;
    return `<path d="M${x1} 880 Q540 ${700 + t * 40} ${x2} 880" stroke="${glow}" stroke-width="3" fill="none" opacity=".55"/>`;
  }).join('');
  return `
    <ellipse cx="540" cy="880" rx="330" ry="300" fill="none" stroke="${primary}" stroke-width="6" opacity=".8"/>
    ${spindle}
    <path d="M330 880 Q420 760 500 830 Q560 880 500 960 Q420 1020 330 880Z" fill="${accent}" opacity=".85"/>
    <path d="M750 880 Q660 760 580 830 Q520 880 580 960 Q660 1020 750 880Z" fill="${accent}" opacity=".85"/>
    <g fill="${primary}">${Array.from({ length: 8 }, (_, i) => `<circle cx="${250 + i * 80}" cy="${1150 + (i % 2) * 46}" r="16" opacity=".9"/>`).join('')}</g>
    ${label('MİTOZ • KROMATİN', 360, 1380)}${label('İKİ YAVRU HÜCRE', 380, 1435, 24, '#B9CFC4', 2)}`;
}

/* -------------------------------------------------------------- canlılar --- */
function organismDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  return `
    <path d="M0 1180 Q540 1000 1080 1180 L1080 1520 L0 1520Z" fill="${primary}" opacity=".28"/>
    <g fill="${primary}" opacity=".92">
      <ellipse cx="540" cy="850" rx="150" ry="122"/>
      <ellipse cx="330" cy="660" rx="72" ry="96" transform="rotate(-28 330 660)"/>
      <ellipse cx="500" cy="560" rx="72" ry="96"/>
      <ellipse cx="690" cy="620" rx="72" ry="96" transform="rotate(26 690 620)"/>
      <ellipse cx="770" cy="830" rx="72" ry="96" transform="rotate(52 770 830)"/>
    </g>
    <g fill="${glow}" opacity=".85"><circle cx="352" cy="622" r="13"/><circle cx="728" cy="600" r="13"/></g>
    <path d="M150 1240 C330 1120 500 1280 660 1170 S940 1080 960 1250" fill="none" stroke="${accent}" stroke-width="6" stroke-dasharray="16 16"/>
    ${label('DAVRANIŞ • İZ • UYUM', 320, 1390)}`;
}

/** Yeni: kürk/deri ve ışık soğurma (siyah deri, yarı saydam tüy). */
function furDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  const hairs = Array.from({ length: 16 }, (_, index) => {
    const x = 140 + index * 52; const lean = (index % 4 - 1.5) * 8;
    return `<path d="M${x} 1000 C${x + lean} 900 ${x + lean * 1.6} 810 ${x + lean * 2} 720" stroke="${index % 3 === 0 ? accent : primary}" stroke-width="7" fill="none" opacity=".9"/>`;
  }).join('');
  return `
    <path d="M0 1000 H1080 V1180 Q810 1140 540 1180 T0 1180Z" fill="#241A14" opacity=".95"/>
    <path d="M0 1000 H1080" stroke="${glow}" stroke-width="4" opacity=".4"/>
    ${hairs}
    <g stroke="${glow}" stroke-width="8" opacity=".85">${Array.from({ length: 5 }, (_, i) => `<path d="M120 ${520 + i * 60} L330 ${560 + i * 60}"/>`).join('')}</g>
    <g fill="${glow}" opacity=".9">${Array.from({ length: 5 }, (_, i) => `<path d="M330 ${560 + i * 60} l-36 -20 v40Z"/>`).join('')}</g>
    <g fill="#8A6A46" opacity=".8">${Array.from({ length: 6 }, (_, i) => `<circle cx="${400 + i * 62}" cy="${1050 + (i % 2) * 40}" r="26"/>`).join('')}</g>
    ${label('DERİ RENGİ NEDEN SİYAH', 340, 1310)}${label('TÜY YAPISI • IŞIK SOĞURMA', 320, 1365, 24, '#B9CFC4', 2)}`;
}

/* -------------------------------------------------------------- anatomi --- */
function anatomyDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  return `
    <path d="M540 470 C390 500 300 640 320 800 C336 930 300 1080 360 1210 C410 1320 500 1360 540 1360 C580 1360 670 1320 720 1210 C780 1080 744 930 760 800 C780 640 690 500 540 470Z" fill="${primary}" opacity=".18" stroke="${primary}" stroke-width="5"/>
    <g fill="${accent}" opacity=".9"><circle cx="440" cy="700" r="46"/><circle cx="640" cy="700" r="46"/><circle cx="540" cy="900" r="66"/><circle cx="430" cy="1080" r="52"/><circle cx="650" cy="1080" r="52"/></g>
    <g stroke="${glow}" stroke-width="3" fill="none" opacity=".7"><path d="M440 700 H640"/><path d="M540 760 V840"/><path d="M430 1080 H650"/><path d="M486 940 L462 1030"/><path d="M594 940 L618 1030"/></g>
    ${label('ORGANLAR • İŞLEVLER', 340, 1450)}`;
}

/* ------------------------------------------------------------- kimya --- */
function moleculeDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  const atoms = Array.from({ length: 6 }, (_, index) => {
    const angle = (index / 6) * Math.PI * 2; const x = 540 + Math.cos(angle) * 250; const y = 880 + Math.sin(angle) * 210;
    return { x, y, r: 46 + (index % 3) * 10 };
  });
  const bonds = atoms.map((atom, index) => { const next = atoms[(index + 1) % atoms.length]; return `<line x1="${atom.x.toFixed(0)}" y1="${atom.y.toFixed(0)}" x2="${next.x.toFixed(0)}" y2="${next.y.toFixed(0)}" stroke="${glow}" stroke-width="10" opacity=".6"/>`; }).join('');
  const circles = atoms.map((atom, index) => `<circle cx="${atom.x.toFixed(0)}" cy="${atom.y.toFixed(0)}" r="${atom.r}" fill="${index % 2 ? primary : accent}" opacity=".85"/><text x="${atom.x.toFixed(0)}" y="${(atom.y + 12).toFixed(0)}" text-anchor="middle" font-family="Inter,Arial" font-size="30" font-weight="700" fill="#10201A">${'ABCDEF'[index]}</text>`).join('');
  return `${bonds}${circles}<circle cx="540" cy="880" r="96" fill="none" stroke="${primary}" stroke-width="4" stroke-dasharray="12 14"/>${label('ATOM • BAĞ • ELEKTRON', 320, 1400)}`;
}

function reactionDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  const before = Array.from({ length: 4 }, (_, i) => `<circle cx="${300 + (i % 2) * 90}" cy="${700 + Math.floor(i / 2) * 90}" r="34" fill="${primary}" opacity=".85"/>`).join('');
  const after = Array.from({ length: 4 }, (_, i) => `<circle cx="${690 + (i % 2) * 100}" cy="${740 + Math.floor(i / 2) * 100}" r="40" fill="${accent}" opacity=".9"/>`).join('');
  return `
    ${before}${after}
    <g stroke="${glow}" stroke-width="12" opacity=".8" stroke-linecap="round"><path d="M450 800 H640"/><path d="M600 750 l46 50 -46 50" fill="none"/></g>
    <g fill="${glow}" opacity=".7">${Array.from({ length: 7 }, (_, i) => `<circle cx="${470 + i * 26}" cy="${820 + (i % 3) * 30}" r="9"/>`).join('')}</g>
    ${label('TEPKİME • ÜRÜNLER', 350, 1290)}${label('ENERJİ DEĞİŞİMİ', 355, 1345, 24, '#B9CFC4', 2)}`;
}

/* --------------------------------------------------------------- fizik --- */
function forceDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  const arrows = Array.from({ length: 6 }, (_, index) => {
    const angle = (index / 6) * Math.PI * 2; const x1 = 540; const y1 = 880;
    const x2 = 540 + Math.cos(angle) * 280; const y2 = 880 + Math.sin(angle) * 240;
    return `<line x1="${x1}" y1="${y1}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="${index % 2 ? accent : primary}" stroke-width="11" opacity=".85"/><path d="M${x2.toFixed(0)} ${y2.toFixed(0)} l${(-26 - index * 3).toFixed(0)} ${(-12).toFixed(0)} l${(-6).toFixed(0)} ${(30).toFixed(0)}Z" fill="${index % 2 ? accent : primary}" opacity=".85"/>`;
  }).join('');
  return `<circle cx="540" cy="880" r="112" fill="${primary}" opacity=".22" stroke="${primary}" stroke-width="5"/>${arrows}
    <g fill="none" stroke="${glow}" stroke-width="3" opacity=".6"><ellipse cx="540" cy="880" rx="330" ry="270"/><ellipse cx="540" cy="880" rx="230" ry="190"/></g>
    ${label('KUVVET • İVME', 380, 1400)}`;
}

/* --------------------------------------------------------------- yer --- */
function layersDiagram(composition: SceneComposition, accent: string): string {
  const { primary, secondary, glow } = composition.palette;
  const layers = [
    { y: 620, h: 150, fill: '#2E4A3E' }, { y: 770, h: 190, fill: secondary }, { y: 960, h: 230, fill: '#1A2A24' }, { y: 1190, h: 260, fill: '#101C18' },
  ];
  const bands = layers.map((layer, index) => `<path d="M0 ${layer.y} Q270 ${layer.y - 26} 540 ${layer.y} T1080 ${layer.y} V${layer.y + layer.h} H0Z" fill="${layer.fill}" opacity="${0.95 - index * 0.1}"/>`).join('');
  const faults = Array.from({ length: 4 }, (_, i) => `<path d="M${180 + i * 220} ${700 + i * 60} l60 ${150 - i * 20}" stroke="${glow}" stroke-width="5" fill="none" opacity=".6"/>`).join('');
  const magma = `<path d="M420 1420 Q470 1300 540 1350 Q610 1300 660 1420Z" fill="${primary}" opacity=".95"/><circle cx="540" cy="1410" r="150" fill="${accent}" opacity=".18"/>`;
  return `${bands}${faults}${magma}${label('KATMANLAR • MAGMA', 350, 1250)}`;
}

/* -------------------------------------------------------------- hava --- */
function weatherDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  const clouds = Array.from({ length: 5 }, (_, index) => `<g opacity=".92"><ellipse cx="${220 + index * 160}" cy="${640 + (index % 2) * 70}" rx="120" ry="60" fill="${primary}"/><ellipse cx="${270 + index * 160}" cy="${610 + (index % 2) * 70}" rx="80" ry="52" fill="${glow}"/></g>`).join('');
  const drops = Array.from({ length: 26 }, (_, i) => `<line x1="${120 + (i * 37) % 860}" y1="${880 + (i * 53) % 200}" x2="${104 + (i * 37) % 860}" y2="${960 + (i * 53) % 200}" stroke="${glow}" stroke-width="6" opacity=".75"/>`).join('');
  return `${clouds}${drops}<path d="M0 1180 Q540 1060 1080 1180 L1080 1420 L0 1420Z" fill="#2A4A44" opacity=".8"/>${label('BULUT • YAĞIŞ • RÜZGÂR', 300, 1380)}`;
}

/* ---------------------------------------------------------- teknoloji --- */
function circuitDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  const traces = Array.from({ length: 12 }, (_, index) => {
    const y = 620 + index * 52; const x1 = 180 + (index % 3) * 90; const x2 = 900 - (index % 4) * 70;
    return `<path d="M${x1} ${y} H${x1 + 120} V${y + 26} H${x2}" stroke="${index % 3 ? primary : accent}" stroke-width="6" fill="none" opacity=".75"/><circle cx="${x1}" cy="${y}" r="11" fill="${glow}"/><circle cx="${x2}" cy="${y + 26}" r="11" fill="${glow}"/>`;
  }).join('');
  return `<rect x="150" y="560" width="780" height="700" rx="28" fill="#13211C" stroke="${primary}" stroke-width="4" opacity=".95"/>${traces}
    <rect x="420" y="820" width="240" height="180" rx="14" fill="${primary}" opacity=".35" stroke="${accent}" stroke-width="4"/>
    ${label('DEVRE • VERİ AKIŞI', 340, 1345)}`;
}

/* --------------------------------------------------------------- beyin --- */
function neuralDiagram(composition: SceneComposition, accent: string): string {
  const { primary, glow } = composition.palette;
  const nodes = Array.from({ length: 18 }, (_, index) => {
    const x = 260 + (index * 137) % 620; const y = 620 + (index * 211) % 560;
    return { x, y };
  });
  const links = nodes.map((node, index) => { const other = nodes[(index * 5 + 3) % nodes.length]; return `<line x1="${node.x}" y1="${node.y}" x2="${other.x}" y2="${other.y}" stroke="${glow}" stroke-width="3" opacity=".4"/>`; }).join('');
  const dots = nodes.map((node) => `<circle cx="${node.x}" cy="${node.y}" r="${16 + (node.x % 5) * 3}" fill="${node.x % 2 ? accent : primary}" opacity=".9"/>`).join('');
  return `<path d="M560 500 C400 430 250 560 300 700 C190 770 240 930 350 950 C330 1120 500 1200 580 1090 C700 1190 870 1090 810 960 C940 900 890 720 790 710 C830 560 690 470 560 500Z" fill="#253A35" stroke="${primary}" stroke-width="6" opacity=".85"/>${links}${dots}${label('NÖRON • SİNYAL', 380, 1330)}`;
}

/* --------------------------------------------------------------- nehir --- */
function riverDiagram(composition: SceneComposition, accent: string): string {
  const { primary, secondary, glow } = composition.palette;
  const bed = 'M-80 640 C240 470 400 1060 700 820 C950 620 760 1300 1160 1150';
  const grains = Array.from({ length: 16 }, (_, i) => `<circle cx="${140 + (i * 137) % 820}" cy="${780 + (i * 97) % 380}" r="${7 + i % 5}" fill="${i % 3 ? primary : glow}" opacity=".8"/>`).join('');
  return `
    <path d="${bed}" fill="none" stroke="${secondary}" stroke-width="300" stroke-linecap="round" opacity=".65"/>
    <path d="${bed}" fill="none" stroke="#27677A" stroke-width="200" stroke-linecap="round" opacity=".7"/>
    <path d="${bed}" fill="none" stroke="${glow}" stroke-width="6" stroke-dasharray="22 34" opacity=".6"/>
    ${grains}
    <g fill="${accent}" opacity=".6">${Array.from({ length: 5 }, (_, i) => `<circle cx="${180 + i * 190}" cy="${1180 - i * 90}" r="10"/>`).join('')}</g>
    ${label('AKIŞ • TAŞIMA • EROZYON', 330, 1370)}`;
}

/* ---------------------------------------------------------------- genel --- */
/**
 * Genel şablon bile konuya göre değişir.
 *
 * Önceki sürümde tüm eşleşmeyen konular birebir aynı "SORU/NEDEN/SONUÇ/KANIT"
 * dairesini alıyordu (ölçülen fark: 1,39/255). Artık düzen, düğüm sayısı,
 * palet ve etiketler konu imzasından türetilir; iki farklı konu aynı görseli
 * üretemez.
 */
function subjectDiagram(project: Project, scene: Scene, composition: SceneComposition, accent: string): string {
  const { primary, secondary, glow } = composition.palette;
  const seed = hashText(composition.signature);
  const count = 5 + (seed % 5);
  const layout = seed % 4;
  const text = normalizeTurkish(composition.subject || project.topic).replace(/[.!?]+$/, '').slice(0, 34);
  const nodes = Array.from({ length: count }, (_, index) => {
    if (layout === 0) { const angle = (index / count) * Math.PI * 2; return { x: 540 + Math.cos(angle) * 280, y: 880 + Math.sin(angle) * 230 }; }
    if (layout === 1) { const angle = (index / count) * Math.PI * 2; return { x: 540 + Math.cos(angle) * (150 + index * 40), y: 880 + Math.sin(angle) * (120 + index * 32) }; }
    if (layout === 2) { return { x: 280 + (index % 3) * 260, y: 680 + Math.floor(index / 3) * 220 }; }
    return { x: 540 + Math.sin(index * 1.7) * 300, y: 880 + Math.cos(index * 1.1) * 250 };
  });
  const links = nodes.map((node, index) => { const other = nodes[(index + 1) % nodes.length]; return `<line x1="${node.x.toFixed(0)}" y1="${node.y.toFixed(0)}" x2="${other.x.toFixed(0)}" y2="${other.y.toFixed(0)}" stroke="${glow}" stroke-width="4" opacity=".45"/>`; }).join('');
  const dots = nodes.map((node, index) => `<circle cx="${node.x.toFixed(0)}" cy="${node.y.toFixed(0)}" r="${26 + (index % 3) * 12}" fill="${index % 2 ? primary : accent}" opacity=".9"/><circle cx="${node.x.toFixed(0)}" cy="${node.y.toFixed(0)}" r="${44 + (index % 3) * 12}" fill="none" stroke="${primary}" stroke-width="3" opacity=".45"/>`).join('');
  const spokes = nodes.map((node) => `<line x1="540" y1="880" x2="${node.x.toFixed(0)}" y2="${node.y.toFixed(0)}" stroke="${secondary}" stroke-width="3" opacity=".5"/>`).join('');
  return `<circle cx="540" cy="880" r="330" fill="${secondary}" opacity=".45" stroke="${primary}" stroke-width="3"/>
    ${layout === 3 ? '' : spokes}${links}
    <circle cx="540" cy="880" r="96" fill="${primary}" opacity=".9"/>
    <circle cx="540" cy="880" r="132" fill="none" stroke="${primary}" stroke-width="4" stroke-dasharray="11 15"/>
    ${dots}
    ${particles(seed, 14 + (seed % 9), accent)}
    ${label(text.toLocaleUpperCase('tr-TR'), 300, 1370, 30, '#EAF8FF', 3)}
    ${label('KONUYA ÖZGÜ MEKANİZMA', 320, 1425, 22, '#B9CFC4', 2)}`;
}

/* ------------------------------------------------------- yönlendirme --- */
/** Sahne için konuya özgü diyagramı üretir. */
export function diagramForComposition(project: Project, scene: Scene, composition: SceneComposition, accent: string): string {
  const text = normalizeTurkish(`${project.topic} ${scene.narration} ${scene.visualDescription || ''}`);
  switch (composition.domain) {
    case 'light':
      return scatteringDiagram(composition, accent);
    case 'space': {
      // Yıldız doğumu / galaksi → spiral; gezegen ve yörünge → yörüngesel.
      const galaxy = matchesTerm(text, 'galaksi', 'stem')
        || (matchesTerm(text, 'yıldız', 'stem') && (matchesTerm(text, 'doğ', 'stem') || matchesTerm(text, 'bulut', 'stem') || matchesTerm(text, 'nebul', 'stem')));
      return galaxy ? galaxyDiagram(composition, accent) : orbitalDiagram(composition, accent);
    }
    case 'ocean':
      return waterDiagram(composition, accent);
    case 'cell':
      if (matchesTerm(text, 'bölün', 'stem') || matchesTerm(text, 'mitoz', 'stem')) return divisionDiagram(composition, accent);
      if (matchesTerm(text, 'kromatofor', 'stem') || matchesTerm(text, 'pigment', 'stem') || matchesTerm(text, 'renk değiştir', 'stem')) return pigmentCellDiagram(composition, accent);
      return cellDiagram(composition, accent);
    case 'organism':
      // Pigment/kromatofor önce gelir: "derisindeki kromatofor" ifadesi hem
      // "deri" hem "kromatofor" içerir; pigment hücresi daha isabetli görseldir.
      if (matchesTerm(text, 'kromatofor', 'stem') || matchesTerm(text, 'pigment', 'stem') || matchesTerm(text, 'renk değiştir', 'stem')) return pigmentCellDiagram(composition, accent);
      if (matchesTerm(text, 'kürk', 'stem') || matchesTerm(text, 'tüy', 'stem') || matchesTerm(text, 'deri', 'stem')) return furDiagram(composition, accent);
      return organismDiagram(composition, accent);
    case 'anatomy':
      return anatomyDiagram(composition, accent);
    case 'chemistry':
      return matchesTerm(text, 'tepkime', 'stem') || matchesTerm(text, 'reaksiyon', 'stem')
        ? reactionDiagram(composition, accent)
        : moleculeDiagram(composition, accent);
    case 'physics':
      return forceDiagram(composition, accent);
    case 'earth':
      return layersDiagram(composition, accent);
    case 'river':
      return riverDiagram(composition, accent);
    case 'weather':
      return weatherDiagram(composition, accent);
    case 'technology':
      return circuitDiagram(composition, accent);
    case 'brain':
      return neuralDiagram(composition, accent);
    default:
      return subjectDiagram(project, scene, composition, accent);
  }
}
