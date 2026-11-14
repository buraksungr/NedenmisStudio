import type { AnimationPreset, ChannelIdentity, Project, ResolvedAnimation, Scene, SceneAnimationSettings } from '../types.js';
import { buildArtworkSvg, diagramFor } from './sceneArtwork.js';
import { splitDiagramLabels } from './sceneDiagrams.js';
import { classifyScene } from './sceneComposition.js';

export const ANIMATION_PRESETS: { id: AnimationPreset; label: string }[] = [
  { id: 'auto', label: 'Konuya göre otomatik' },
  { id: 'light-scattering', label: 'Işık ve Rayleigh saçılımı' },
  { id: 'liquid-molecules', label: 'Sıvı molekülleri ve akış' },
  { id: 'crystallization', label: 'Kristalleşme ve bağ kurma' },
  { id: 'lattice-expansion', label: 'Kristal kafes ve hacim artışı' },
  { id: 'floating-ice', label: 'Yüzen buz ve su dalgaları' },
  { id: 'orbital', label: 'Yörünge ve gezegen hareketi' },
  { id: 'galaxy', label: 'Galaksi ve yıldız hareketi' },
  { id: 'cellular', label: 'Hücre ve kan akışı' },
  { id: 'energy-waves', label: 'Enerji, alan ve dalgalar' },
  { id: 'geological', label: 'Levha ve magma hareketi' },
  { id: 'weather-systems', label: 'Bulut, rüzgâr ve yağış' },
  { id: 'river-flow', label: 'Nehir ve akıntı hareketi' },
  { id: 'reaction', label: 'Kimyasal bağ ve tepkime' },
  { id: 'neural', label: 'Sinir sinyalleri' },
  { id: 'data-flow', label: 'Devre ve veri akışı' },
  { id: 'generic-particles', label: 'Bilimsel parçacık hareketi' },
];

export function defaultSceneAnimation(): SceneAnimationSettings {
  return { enabled: true, preset: 'auto', speed: 1, intensity: 1, particleCount: 24 };
}

export function resolveAnimationPreset(project: Project, scene: Scene): Exclude<AnimationPreset, 'auto'> {
  const requested = scene.animation?.preset || 'auto';
  if (requested !== 'auto') return requested;
  const sceneText = `${scene.narration} ${scene.visualDescription || ''}`.toLocaleLowerCase('tr-TR');
  const topicText = project.topic.toLocaleLowerCase('tr-TR');
  const sceneAboutWater = /buz|su\b|molekül|yoğun|kristal|donma|donar|yüzer|ice|water|molecule|density|crystal|freez|float/i.test(sceneText);
  const text = sceneAboutWater ? sceneText : `${topicText} ${sceneText}`;
  const skyScattering = ((/gökyüzü|rayleigh|atmosfer/i.test(text) && /mavi|ışık|güneş|saçıl|dalga boyu/i.test(text)) || /mavi ışık|kısa dalga boyu|ışık saç/i.test(text));
  if (skyScattering) return 'light-scattering';
  const water = /buz|su\b|molekül|yoğun|kristal|donma|donar|yüzer|ice|water|molecule|density|crystal|freez|float/i.test(text);
  if (water && /yüzer|yüzme|yüzüyor|kaldırma|float|buoy/i.test(text)) return 'floating-ice';
  if (water && /donma|donar|donuk|freeze|freezing|solidif/i.test(text)) return 'crystallization';
  if (water && /genişle|hacim|yoğun|kafes|expand|density|volume|lattice/i.test(text)) return 'lattice-expansion';
  if (water && /kristal|crystal/i.test(text)) return 'crystallization';
  if (water) return 'liquid-molecules';
  // BUILD 44: kalan alanlar Türkçe'ye uygun sınıflandırıcıyla belirlenir.
  // Önceki sürümde dar anahtar sözcük listesi kullanılıyordu; "ayılar"
  // (kutup ayı) "ay" (uydurma ayı) ile eşleşip yörünge animasyonu seçiyordu.
  const domain = classifyScene(project, scene).domain;
  switch (domain) {
    case 'light': return 'light-scattering';
    case 'space': return /galaksi|galaxy|nebula|kara delik|black hole/i.test(text) ? 'galaxy' : 'orbital';
    case 'cell':
    case 'anatomy': return 'cellular';
    case 'organism':
      // Kromatofor/pigment: hücrelerin genişleyip daralması → 'cellular'.
      if (/pigment|kromatofor|renk değiştir|chromatophore|colour change|color change/i.test(text)) return 'cellular';
      // Kürk/deri: gelen ışık ve ısı (güneş) ile kaybedilen ısı (rüzgâr) →
      // kürkün ısı tutma ve ışık soğurma davranışını gösteren ortam hareketi.
      if (/kürk|tüy|pelt|fur|deri|skin|ısı|heat/i.test(text)) return 'weather-systems';
      // Buzul/deniz canlıları: sıcaklık ve yağış.
      if (/(^|[^a-zçğıöşü])(kar|snow|buz|ice|soğuk|kutup|polar|arctic)([^a-zçğıöşü]|$)/i.test(text)) return 'weather-systems';
      return 'generic-particles';
    case 'chemistry': return 'reaction';
    case 'physics': return 'energy-waves';
    case 'earth': return 'geological';
    case 'river': return 'river-flow';
    case 'weather': return 'weather-systems';
    case 'technology': return 'data-flow';
    case 'brain': return 'neural';
    default: return 'generic-particles';
  }
}

export function resolveAnimation(project: Project, scene: Scene): ResolvedAnimation {
  const defaults = defaultSceneAnimation();
  const configured = scene.animation || defaults;
  return {
    enabled: configured.enabled !== false,
    preset: resolveAnimationPreset(project, scene),
    speed: Math.max(.25, Math.min(3, configured.speed || 1)),
    intensity: Math.max(0, Math.min(2, configured.intensity ?? 1)),
    particleCount: Math.max(0, Math.min(80, Math.round(configured.particleCount ?? 24))),
  };
}

const TAU = Math.PI * 2;
const n = (value: number) => Number(value.toFixed(2));
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
const smooth = (value: number) => { const p = clamp(value); return p * p * (3 - 2 * p); };
function hash(seed: string, index: number): number {
  let value = 2166136261;
  const input = `${seed}:${index}`;
  for (let i = 0; i < input.length; i++) { value ^= input.charCodeAt(i); value = Math.imul(value, 16777619); }
  return ((value >>> 0) % 100000) / 100000;
}
function molecule(id: string, x: number, y: number, scale: number, rotation: number, accent: string, opacity = 1): string {
  return `<g data-molecule-id="${id}" opacity="${n(opacity)}" transform="translate(${n(x)} ${n(y)}) rotate(${n(rotation)}) scale(${n(scale)})">
    <path d="M0 0 L31 -22 M0 0 L31 24" stroke="#AFC7C2" stroke-width="7" stroke-linecap="round"/>
    <circle r="24" fill="#63CDE2" stroke="#C8F4FA" stroke-width="3"/><circle cx="36" cy="-26" r="13" fill="${accent}"/><circle cx="36" cy="28" r="13" fill="${accent}"/>
    <text x="-6" y="7" fill="#10242A" font-size="17" font-family="Inter,Arial" font-weight="800">O</text></g>`;
}
function wave(y: number, amplitude: number, phase: number, color: string, width = 1080): string {
  const points: string[] = [];
  for (let x = 0; x <= width; x += 45) points.push(`${x === 0 ? 'M' : 'L'}${x} ${n(y + Math.sin(x / 105 + phase) * amplitude)}`);
  return `<path data-wave="true" d="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`;
}
function label(text: string, x = 540, y = 1450): string {
  return `<g font-family="Inter,Arial,sans-serif" text-anchor="middle"><rect x="${x - 220}" y="${y - 43}" width="440" height="66" rx="33" fill="#111D1A" stroke="#FFFFFF" stroke-opacity=".13"/><text x="${x}" y="${y}" fill="#DCE9E3" font-size="24" letter-spacing="2">${text}</text></g>`;
}
function lightScattering(scene: Scene, t: number, duration: number, accent: string, settings: ResolvedAnimation): string {
  const moleculeCount = Math.max(10, Math.min(26, Math.round(settings.particleCount * .75)));
  const origins = Array.from({ length: moleculeCount }, (_, i) => ({
    x: 390 + hash(scene.id, i + 1100) * 500 + Math.sin(t * 1.4 + i) * 8 * settings.intensity,
    y: 650 + hash(scene.id, i + 1200) * 500 + Math.cos(t * 1.2 + i) * 7 * settings.intensity,
  }));
  const molecules = origins.map((point, i) => `<g data-air-molecule="${i}" transform="translate(${n(point.x)} ${n(point.y)}) rotate(${n(Math.sin(t + i) * 18)})"><circle cx="-8" cy="0" r="10" fill="#B7E8F2" opacity=".72"/><circle cx="9" cy="0" r="10" fill="#79B9D5" opacity=".72"/><path d="M0 -2 V2" stroke="#E9FBFF" stroke-width="3"/></g>`).join('');
  const incoming = Array.from({ length: 8 }, (_, i) => {
    const progress = (t * .3 + i / 8) % 1;
    const target = origins[(i * 3) % origins.length];
    const startX = 165, startY = 440 + i * 34;
    const x = mix(startX, target.x, progress), y = mix(startY, target.y, progress);
    const angle = Math.atan2(target.y - startY, target.x - startX) * 180 / Math.PI;
    return `<g data-light-photon="${i}" transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})"><path d="M-25 0 H25" stroke="${i % 2 ? '#FFF3BA' : '#FFFFFF'}" stroke-width="8" stroke-linecap="round"/><circle r="6" fill="#FFFFFF"/></g>`;
  }).join('');
  const scattered = Array.from({ length: Math.max(18, settings.particleCount) }, (_, i) => {
    const origin = origins[i % origins.length];
    const progress = (t * .38 + i / Math.max(18, settings.particleCount)) % 1;
    const angle = hash(scene.id, i + 1400) * TAU;
    const radius = 14 + progress * (170 + hash(scene.id, i + 1500) * 170) * settings.intensity;
    const x = origin.x + Math.cos(angle) * radius, y = origin.y + Math.sin(angle) * radius;
    return `<circle data-scattered-photon="${i}" cx="${n(x)}" cy="${n(y)}" r="${n(4 + i % 4)}" fill="${i % 3 ? '#66C8FF' : '#A5E8FF'}" opacity="${n(Math.sin(progress * Math.PI) * .9)}"/>`;
  }).join('');
  const transmitted = Array.from({ length: 6 }, (_, i) => {
    const progress = (t * .24 + i / 6) % 1;
    const x = mix(315, 1010, progress), y = 710 + i * 72 + Math.sin(progress * Math.PI) * 45;
    return `<path data-transmitted-photon="${i}" d="M${n(x - 20)} ${n(y)} h40" stroke="${i % 2 ? '#FF9C68' : '#FFD179'}" stroke-width="7" stroke-linecap="round" opacity="${n(Math.sin(progress * Math.PI) * .75)}"/>`;
  }).join('');
  const reveal = smooth(t / Math.max(1, duration * .6));
  return `<g data-animation-layer="light-scattering" data-scattering-progress="${n(reveal)}">
    <defs><linearGradient id="atmosphere-blue" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#183B63" stop-opacity=".1"/><stop offset="1" stop-color="#227DC0" stop-opacity="${n(.25 + reveal * .3)}"/></linearGradient></defs>
    <text x="540" y="405" text-anchor="middle" fill="#F2F8FC" font-family="Inter,Arial" font-size="39" font-weight="700">BEYAZ IŞIKTAN MAVİ GÖKYÜZÜNE</text>
    <text x="540" y="452" text-anchor="middle" fill="#B5CBDC" font-family="Inter,Arial" font-size="24">Kısa dalga boyu, atmosferde daha güçlü saçılır</text>
    <circle cx="150" cy="455" r="92" fill="#FFD66B"/><circle cx="150" cy="455" r="118" fill="none" stroke="${accent}" stroke-width="4" stroke-dasharray="12 15" stroke-dashoffset="${n(-t * 25)}" opacity=".55"/>
    <path d="M0 1070 Q540 780 1080 1070 V1510 H0Z" fill="url(#atmosphere-blue)"/><path d="M0 1070 Q540 780 1080 1070" fill="none" stroke="#72CFFF" stroke-width="5" opacity=".6"/>
    <path d="M245 470 L480 650 M245 520 L520 850 M260 560 L700 1030" stroke="#FFF4C7" stroke-width="4" opacity=".16"/>
    ${molecules}${incoming}${transmitted}${scattered}
    <g transform="translate(540 1325)"><path d="M-150 0 Q0 -120 150 0 Q0 120 -150 0Z" fill="#102A3E" stroke="#A4E5FF" stroke-width="6"/><circle r="61" fill="#4BAFE7"/><circle r="27" fill="#10202C"/><circle cx="18" cy="-18" r="10" fill="#E8FAFF"/></g>
    <text x="105" y="665" fill="#FFF1B2" font-family="Inter,Arial" font-size="23" font-weight="700">GÜNEŞ IŞIĞI</text><text x="650" y="1240" fill="#9DE3FF" font-family="Inter,Arial" font-size="25" font-weight="700">MAVİ SAÇILIM</text>
    </g>`;
}
function liquid(scene: Scene, t: number, duration: number, accent: string, settings: ResolvedAnimation): string {
  const count = Math.min(26, Math.max(8, Math.round(settings.particleCount * .65)));
  const molecules = Array.from({ length: count }, (_, i) => {
    const x = 105 + hash(scene.id, i) * 870;
    const y = 790 + hash(scene.id, i + 70) * 590;
    const dx = Math.sin(t * (1 + hash(scene.id, i + 140)) + i * 1.7) * 24 * settings.intensity;
    const dy = Math.cos(t * (1.2 + hash(scene.id, i + 200)) + i) * 18 * settings.intensity;
    const rotation = Math.sin(t * 2.2 + i) * 28 * settings.intensity;
    return molecule(`liquid-${i}`, x + dx, y + dy, .62 + hash(scene.id, i + 300) * .2, rotation, accent);
  }).join('');
  const bubbles = Array.from({ length: Math.min(12, settings.particleCount) }, (_, i) => {
    const y = 1450 - ((t * (30 + i * 2) + i * 91) % 620);
    return `<circle data-flow-particle="${i}" cx="${n(110 + hash(scene.id, i + 500) * 850)}" cy="${n(y)}" r="${n(3 + hash(scene.id, i) * 6)}" fill="none" stroke="#8DE5F0" stroke-width="2" opacity="${n(.15 + .35 * Math.sin(Math.PI * (1450 - y) / 620))}"/>`;
  }).join('');
  return `<defs><linearGradient id="liquid-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2D859B" stop-opacity=".22"/><stop offset="1" stop-color="#123844" stop-opacity=".5"/></linearGradient></defs>
    <g data-animation-layer="liquid"><circle cx="540" cy="570" r="190" fill="#63CDE2" opacity=".06"/><path d="M120 580 Q540 430 960 580" fill="none" stroke="${accent}" stroke-width="2" opacity=".45"/>
    <text x="540" y="560" text-anchor="middle" fill="#F2F8F5" font-family="Inter,Arial" font-size="38" font-weight="700">SIVIDA SÜREKLİ HAREKET</text><text x="540" y="610" text-anchor="middle" fill="#AFC5BD" font-family="Inter,Arial" font-size="25">Moleküller titreşir, döner ve yer değiştirir</text>
    <path d="M0 720 Q120 690 240 720 T480 720 T720 720 T960 720 T1200 720 V1530 H0Z" fill="url(#liquid-fill)"/>
    ${[0, 1, 2].map((i) => wave(735 + i * 48, 12 + i * 4, t * (1.3 - i * .18) + i, i === 0 ? '#8DE5F0' : '#4AA8C0')).join('')}
    ${molecules}${bubbles}</g>`;
}
type CrystalPoint = { x: number; y: number };
function crystalPoints(): CrystalPoint[] {
  const centers = [[370, 800], [710, 800], [540, 1050]];
  return centers.flatMap(([cx, cy]) => Array.from({ length: 6 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / 3;
    return { x: n(cx + Math.cos(angle) * 135), y: n(cy + Math.sin(angle) * 135) };
  }));
}
function crystalLinks(points: CrystalPoint[]): [CrystalPoint, CrystalPoint, string][] {
  return points.flatMap((_, i) => {
    if (i % 6 !== 0) return [];
    return Array.from({ length: 6 }, (_, edge) => [points[i + edge], points[i + (edge + 1) % 6], `${i}-${edge}`] as [CrystalPoint, CrystalPoint, string]);
  });
}
function crystallization(scene: Scene, t: number, duration: number, accent: string, settings: ResolvedAnimation): string {
  const progress = smooth(t / Math.max(1, duration * .8));
  const targets = crystalPoints();
  const positions = targets.map((target, i) => ({
    x: mix(100 + hash(scene.id, i) * 880, target.x, progress) + Math.sin(t * 4 + i) * 15 * (1 - progress) * settings.intensity,
    y: mix(540 + hash(scene.id, i + 30) * 850, target.y, progress) + Math.cos(t * 3 + i) * 13 * (1 - progress) * settings.intensity,
  }));
  // Kristalleşme tamamlandığında noktalar hedefe oturur ve salınım sıfıra
  // düşer; sahne ikinci yarıda "donuyordu". Kafesin geometrisi BOZULMADAN
  // (rijit bir kayma+dönme ile) sürekli hareket ettirilir: eşit kenarlı
  // altıgen çevrim özelliği korunur.
  const driftX = Math.sin(t * 1.9) * 7 * settings.intensity;
  const driftY = Math.cos(t * 1.55) * 6 * settings.intensity;
  const tilt = Math.sin(t * 1.15) * .7 * settings.intensity;
  const bonds = crystalLinks(positions).map(([from, to, id], index) => `<line data-crystal-bond="${id}" x1="${n(from.x)}" y1="${n(from.y)}" x2="${n(to.x)}" y2="${n(to.y)}" stroke="${index % 2 ? '#74D5E5' : accent}" stroke-width="5" opacity="${n(progress * .65)}"/>`);
  const molecules = positions.map((point, i) => molecule(`crystal-${i}`, point.x, point.y, .66, (1 - progress) * Math.sin(t * 2 + i) * 45, accent, .45 + progress * .55)).join('');
  return `<g data-animation-layer="crystallization" data-crystal-progress="${n(progress)}">
    <circle cx="540" cy="950" r="${n(280 + progress * 90)}" fill="#5FD2E6" opacity="${n(.025 + progress * .045)}"/>
    <path d="M180 510 H900" stroke="#FFFFFF" stroke-opacity=".12"/><text x="540" y="470" text-anchor="middle" fill="#F2F8F5" font-family="Inter,Arial" font-size="39" font-weight="700">DÜZENSİZLİKTEN KRİSTALE</text>
    <text x="540" y="520" text-anchor="middle" fill="#AFC5BD" font-family="Inter,Arial" font-size="25">Soğudukça moleküller düzenli bağlar kurar</text>
    <g data-crystal-drift="true" transform="translate(${n(driftX)} ${n(driftY)}) rotate(${n(tilt)} 540 950)"><g>${bonds.join('')}</g>${molecules}</g><g transform="translate(540 1330)"><path d="M-130 0 H130" stroke="${accent}" stroke-width="4"/><path d="M-130 0 l20 -12 v24Z M130 0 l-20 -12 v24Z" fill="${accent}" opacity="${n(progress)}"/></g>
    ${label(progress < .5 ? 'MOLEKÜLLER YAKLAŞIYOR' : 'DÜZENLİ KRİSTAL KAFES')}</g>`;
}
function latticeExpansion(scene: Scene, t: number, duration: number, accent: string, settings: ResolvedAnimation): string {
  const progress = smooth(t / Math.max(1, duration * .85));
  // Kafes genişlemesi zamanla DOYGUNLAŞTIĞI için sahnenin ikinci yarısında
  // hareket neredeyse duruyordu (MP4↔önizleme "nesne hareketi" eşiği
  // düşüyordu). Moleküler kafesin sürekli TİTREŞİMİ bilimsel olarak da
  // doğrudur: genişleme üzerine sürekli bir salınım eklenir.
  const vibration = Math.sin(t * 1.7) * .014 * settings.intensity + Math.sin(t * 2.9 + 1.1) * .006 * settings.intensity;
  const scale = 1 + progress * .18 * settings.intensity + vibration;
  const points = crystalPoints();
  const bonds = crystalLinks(points).map(([from, to, id]) => `<line data-lattice-bond="${id}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/>`);
  const molecules = points.map((point, i) => molecule(`lattice-${i}`, point.x + Math.sin(t * 3 + i) * 2 * settings.intensity, point.y + Math.cos(t * 3 + i) * 2 * settings.intensity, .62, 0, accent)).join('');
  const measure = 305 * scale;
  return `<g data-animation-layer="lattice-expansion" data-expansion="${n(scale)}">
    <text x="540" y="460" text-anchor="middle" fill="#F2F8F5" font-family="Inter,Arial" font-size="40" font-weight="700">BUZUN GİZLİ MİMARİSİ</text><text x="540" y="510" text-anchor="middle" fill="#AFC5BD" font-family="Inter,Arial" font-size="25">Açık kafes yapısı, suyu genişletir</text>
    <g data-expanding-lattice="true" transform="translate(540 950) scale(${n(scale)}) translate(-540 -950)"><g stroke="#71D6E7" stroke-width="5" opacity=".6">${bonds.join('')}</g>${molecules}</g>
    <g data-expansion-arrows="true" stroke="${accent}" fill="${accent}" stroke-width="5"><path d="M${n(540 - measure)} 1260 H${n(540 + measure)}"/><path d="M${n(540 - measure)} 1260 l24 -14 v28Z M${n(540 + measure)} 1260 l-24 -14 v28Z"/></g>
    <text x="540" y="1325" text-anchor="middle" fill="${accent}" font-family="Inter,Arial" font-size="28" font-weight="700">HACİM ENDEKSİ  ${Math.round(100 + progress * 9)}</text>
    ${label('KRİSTAL KAFES  →  DAHA FAZLA HACİM', 540, 1450)}</g>`;
}
function floatingIce(scene: Scene, t: number, duration: number, accent: string, settings: ResolvedAnimation): string {
  // Buz bloğu hem yükselip alçalır hem de sudan gelen ince bir titreme ile
  // sallanır. Tek sinüsün tepesinde hız SIFIRA düştüğü için sahne sonunda
  // hareket neredeyse duruyordu; ikinci bileşen sürekli hareketi korur.
  const bob = (Math.sin(t * 1.45) * 13 + Math.sin(t * 4.6) * 6) * settings.intensity;
  const tilt = (Math.sin(t * .85) * 2.4 + Math.sin(t * 3.4) * 1.6) * settings.intensity;
  const inner = [[-90, -35], [0, -60], [90, -35], [-90, 65], [0, 40], [90, 65]].map(([x, y], i) => molecule(`ice-${i}`, x + Math.sin(t * 3 + i) * 2, y + Math.cos(t * 3 + i) * 2, .58, 0, accent)).join('');
  const underwater = Array.from({ length: Math.min(18, Math.max(8, Math.round(settings.particleCount * .55))) }, (_, i) => {
    const x = 90 + hash(scene.id, i + 800) * 900 + Math.sin(t * 1.25 + i) * 22 * settings.intensity;
    const y = 920 + hash(scene.id, i + 850) * 470 + Math.cos(t * 1.45 + i) * 17 * settings.intensity;
    return molecule(`under-ice-${i}`, x, y, .48, Math.sin(t * 1.8 + i) * 30, accent, .7);
  }).join('');
  const arrow = Math.sin(t * 2) * 10 * settings.intensity;
  return `<defs><linearGradient id="ice-water" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2C91A9" stop-opacity=".48"/><stop offset="1" stop-color="#102F3C" stop-opacity=".85"/></linearGradient><linearGradient id="ice-body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#DDFBFF" stop-opacity=".5"/><stop offset="1" stop-color="#62C9DE" stop-opacity=".38"/></linearGradient></defs>
    <g data-animation-layer="floating-ice"><text x="540" y="440" text-anchor="middle" fill="#F2F8F5" font-family="Inter,Arial" font-size="43" font-weight="700">BUZ NEDEN BATMAZ?</text><text x="540" y="490" text-anchor="middle" fill="#AFC5BD" font-family="Inter,Arial" font-size="25">Daha düşük yoğunluk, kaldırma kuvvetiyle dengelenir</text>
    <path d="M0 820 Q120 790 240 820 T480 820 T720 820 T960 820 T1200 820 V1510 H0Z" fill="url(#ice-water)"/>
    ${underwater}<g data-floating-ice="true" transform="translate(540 ${n(925 + bob)}) rotate(${n(tilt)})"><path d="M-190 -85 L-85 -155 L85 -145 L190 -65 L160 110 L45 170 L-130 125 L-195 20Z" fill="url(#ice-body)" stroke="#C8F6FF" stroke-width="6"/><path d="M-190 -85 L0 -20 L190 -65 M0 -20 L45 170 M0 -20 L-85 -155" fill="none" stroke="#FFFFFF" stroke-opacity=".48" stroke-width="3"/>${inner}<text x="0" y="128" text-anchor="middle" fill="#16424C" font-family="Inter,Arial" font-size="20" font-weight="700">≈ %90 SU ALTINDA</text></g>
    ${[0, 1, 2].map((i) => wave(825 + i * 48, 18 - i * 2, t * (1.9 - i * .2) + i * 1.3, i === 0 ? '#B0F3FA' : '#4AA8C0')).join('')}
    <g data-buoyancy-arrow="true" transform="translate(825 ${n(arrow)})" fill="${accent}" stroke="${accent}"><path d="M0 1000 V800" stroke-width="8"/><path d="M0 790 l-22 36 h44Z" stroke="none"/><text x="0" y="1050" text-anchor="middle" font-family="Inter,Arial" font-size="22" stroke="none">KALDIRMA</text></g>
    </g>`;
}
function orbital(scene: Scene, t: number, accent: string, settings: ResolvedAnimation): string {
  const angle = t * .35;
  const mx = 540 + Math.cos(angle) * 330, my = 900 + Math.sin(angle) * 170;
  const stars = Array.from({ length: settings.particleCount }, (_, i) => `<circle data-star="${i}" cx="${n(hash(scene.id, i) * 1000 + 40)}" cy="${n(390 + hash(scene.id, i + 40) * 1040)}" r="${n(1 + hash(scene.id, i + 80) * 3)}" fill="#EAF8F2" opacity="${n(.2 + .65 * (.5 + .5 * Math.sin(t * 2 + i)))}"/>`).join('');
  return `<g data-animation-layer="orbital">${stars}<ellipse cx="540" cy="900" rx="330" ry="170" fill="none" stroke="#AFC5BD" stroke-opacity=".3" stroke-width="3" stroke-dasharray="8 12"/>
    <g transform="translate(540 900)"><circle r="220" fill="#DDE97A" opacity=".5"/><g data-rotating-planet="true" transform="rotate(${n(t * 9)})"><path d="M-120 -160 Q-20 -90 80 -170 L170 -70 Q30 -20 -180 -60Z M-160 60 Q-40 10 100 80 L40 190 Q-70 180 -160 60Z" fill="#6EB4A0" opacity=".7"/></g><circle r="220" fill="none" stroke="#F1F8C8" stroke-width="5"/><ellipse rx="305" ry="90" fill="none" stroke="${accent}" stroke-width="13" transform="rotate(-18)" opacity=".6"/></g>
    <g data-orbiting-moon="true" transform="translate(${n(mx)} ${n(my)})"><circle r="58" fill="#DFE8E3"/><circle cx="-15" cy="-8" r="12" fill="#AABAB2"/><circle cx="18" cy="19" r="8" fill="#B7C5BE"/></g></g>`;
}
function galaxy(scene: Scene, t: number, accent: string, settings: ResolvedAnimation): string {
  const count = Math.max(30, settings.particleCount * 3);
  const stars = Array.from({ length: count }, (_, i) => {
    const arm = i % 3, r = 35 + (i / count) * 390, a = i * .43 + arm * TAU / 3 + t * (.12 + .2 * (1 - i / count));
    return `<circle data-galaxy-star="${i}" cx="${n(540 + Math.cos(a) * r)}" cy="${n(900 + Math.sin(a) * r * .52)}" r="${n(2 + hash(scene.id, i) * 5)}" fill="${i % 4 ? '#DCEBE4' : accent}" opacity="${n(.25 + hash(scene.id, i + 30) * .7)}"/>`;
  }).join('');
  return `<g data-animation-layer="galaxy"><ellipse cx="540" cy="900" rx="450" ry="245" fill="#6581A5" opacity=".06" transform="rotate(${n(t * 2)} 540 900)"/>${stars}<circle cx="540" cy="900" r="${n(80 + Math.sin(t) * 8)}" fill="${accent}" opacity=".75"/><circle cx="540" cy="900" r="32" fill="#F7FFE7"/></g>`;
}
function cellular(scene: Scene, t: number, accent: string, settings: ResolvedAnimation): string {
  const count = Math.max(7, Math.round(settings.particleCount * .5));
  const cells = Array.from({ length: count }, (_, i) => {
    const x = 130 + ((hash(scene.id, i) * 850 + t * (16 + i % 4) * settings.intensity) % 850);
    const y = 520 + hash(scene.id, i + 40) * 800 + Math.sin(t + i) * 30;
    return `<g data-cell="${i}" transform="translate(${n(x)} ${n(y)}) rotate(${n(t * 8 + i * 20)})"><circle r="65" fill="#6CBFAA" fill-opacity=".15" stroke="#91D6BC" stroke-width="4"/><circle data-nucleus="${i}" r="${n(22 + Math.sin(t * 2 + i) * 4)}" fill="${accent}" opacity=".65"/><path d="M-48 0 Q0 -40 48 0 Q0 40 -48 0Z" fill="none" stroke="#91D6BC" stroke-opacity=".5"/></g>`;
  }).join('');
  return `<g data-animation-layer="cellular"><path d="M70 900 Q540 450 1010 900 Q540 1350 70 900Z" fill="#326C62" opacity=".12" stroke="#78B7A5" stroke-width="3"/>${cells}</g>`;
}
function energyWaves(scene: Scene, t: number, accent: string, settings: ResolvedAnimation): string {
  const waves = Array.from({ length: 5 }, (_, i) => wave(560 + i * 155, 35 + i * 7, t * (1.2 + i * .15) + i * .7, i % 2 ? '#69D2E4' : accent)).join('');
  const particles = Array.from({ length: settings.particleCount }, (_, i) => {
    const x = (i * 97 + t * 70 * settings.intensity) % 1080, lane = i % 5, y = 560 + lane * 155 + Math.sin(x / 105 + t * (1.2 + lane * .15) + lane * .7) * (35 + lane * 7);
    return `<circle data-energy-particle="${i}" cx="${n(x)}" cy="${n(y)}" r="7" fill="${i % 2 ? accent : '#A5F0FA'}"/>`;
  }).join('');
  return `<g data-animation-layer="energy-waves"><circle cx="540" cy="900" r="${n(310 + Math.sin(t) * 25)}" fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="18 25" stroke-dashoffset="${n(-t * 30)}" opacity=".35"/>${waves}${particles}</g>`;
}
function geological(scene: Scene, t: number, accent: string, settings: ResolvedAnimation): string {
  const shift = Math.sin(t * .65) * 28 * settings.intensity;
  const magma = Array.from({ length: Math.max(8, settings.particleCount / 2) }, (_, i) => `<circle data-magma-particle="${i}" cx="${n(430 + hash(scene.id, i) * 220)}" cy="${n(1370 - ((t * 30 + i * 63) % 430))}" r="${n(5 + hash(scene.id, i + 20) * 9)}" fill="${i % 2 ? '#F39A59' : accent}" opacity=".65"/>`).join('');
  return `<g data-animation-layer="geological"><circle cx="540" cy="1230" r="310" fill="#D97A4B" opacity=".08"/>${magma}<g data-left-plate="true" transform="translate(${n(-shift)} 0)"><path d="M0 700 L490 760 L490 1030 L0 1100Z" fill="#668C78" opacity=".4" stroke="#A0BEA8" stroke-width="4"/><path d="M0 700 L490 760" stroke="${accent}" stroke-width="12"/></g><g data-right-plate="true" transform="translate(${n(shift)} 0)"><path d="M1080 700 L590 760 L590 1030 L1080 1100Z" fill="#527969" opacity=".4" stroke="#A0BEA8" stroke-width="4"/><path d="M1080 700 L590 760" stroke="${accent}" stroke-width="12"/></g><path d="M540 710 L520 810 L560 900 L530 1040" fill="none" stroke="#F2B06F" stroke-width="8" stroke-dasharray="12 10"/></g>`;
}
function weatherSystems(scene: Scene, t: number, accent: string, settings: ResolvedAnimation): string {
  const clouds = Array.from({ length: 3 }, (_, i) => {
    const x = -150 + ((hash(scene.id, i) * 1100 + t * (24 + i * 7) * settings.intensity + i * 370) % 1380);
    const y = 540 + i * 210 + Math.sin(t + i) * 15;
    const drops = Array.from({ length: Math.max(6, Math.round(settings.particleCount / 3)) }, (_, j) => {
      const dx = (j % 7) * 25 - 75, dy = (j * 61 + t * (130 + i * 20) * settings.intensity) % 390;
      return `<path data-rain-drop="${i}-${j}" d="M${n(dx)} ${n(70 + dy)} l-10 25" stroke="#79D8EA" stroke-width="5" stroke-linecap="round" opacity="${n((1 - dy / 390) * .8)}"/>`;
    }).join('');
    return `<g data-weather-cloud="${i}" transform="translate(${n(x)} ${n(y)})"><g fill="#B9D2D0" opacity=".55"><circle cx="-65" cy="15" r="55"/><circle cx="0" cy="-20" r="80"/><circle cx="75" cy="20" r="58"/><rect x="-110" y="15" width="230" height="65" rx="32"/></g>${drops}</g>`;
  }).join('');
  return `<g data-animation-layer="weather-systems"><g data-sun-rotation="true" transform="translate(865 455) rotate(${n(t * 12)})" stroke="${accent}" stroke-width="6">${Array.from({ length: 8 }, (_, i) => `<path d="M0 -75 V-105" transform="rotate(${i * 45})"/>`).join('')}<circle r="52" fill="${accent}" stroke="none"/></g>
    <path data-wind-flow="true" d="M50 450 Q300 350 520 470 T1030 430 M20 1170 Q300 1060 570 1180 T1060 1100" fill="none" stroke="${accent}" stroke-width="4" stroke-dasharray="20 18" stroke-dashoffset="${n(-t * 55)}" opacity=".45"/>${clouds}</g>`;
}
type Point = [number, number];
function cubicPoint(a: Point, b: Point, c: Point, d: Point, p: number): Point {
  const q = 1 - p;
  return [q ** 3 * a[0] + 3 * q ** 2 * p * b[0] + 3 * q * p ** 2 * c[0] + p ** 3 * d[0], q ** 3 * a[1] + 3 * q ** 2 * p * b[1] + 3 * q * p ** 2 * c[1] + p ** 3 * d[1]];
}
function riverPoint(progress: number): Point {
  return progress < .5
    ? cubicPoint([-80, 600], [230, 430], [400, 1030], [700, 790], progress * 2)
    : cubicPoint([700, 790], [950, 590], [760, 1290], [1160, 1130], (progress - .5) * 2);
}
function riverFlow(scene: Scene, t: number, accent: string, settings: ResolvedAnimation): string {
  const particles = Array.from({ length: Math.max(12, settings.particleCount) }, (_, i) => {
    const progress = (i / Math.max(12, settings.particleCount) + t * .055 * settings.intensity) % 1;
    const [x, y] = riverPoint(progress);
    return `<g data-river-particle="${i}" transform="translate(${n(x)} ${n(y)}) rotate(${n(progress * 220 + t * 12)})"><path d="M-17 0 Q0 -9 17 0" fill="none" stroke="${i % 3 ? '#A1EDF4' : accent}" stroke-width="5" stroke-linecap="round"/><circle r="3" fill="#E6FFFF"/></g>`;
  }).join('');
  return `<g data-animation-layer="river-flow"><path d="M-80 600 C230 430 400 1030 700 790 C950 590 760 1290 1160 1130" fill="none" stroke="#314D3B" stroke-width="360" opacity=".55" stroke-linecap="round"/><path d="M-80 600 C230 430 400 1030 700 790 C950 590 760 1290 1160 1130" fill="none" stroke="#27677A" stroke-width="275" opacity=".55" stroke-linecap="round"/><path data-river-current="true" d="M-80 600 C230 430 400 1030 700 790 C950 590 760 1290 1160 1130" fill="none" stroke="#66C7D9" stroke-width="5" stroke-dasharray="22 34" stroke-dashoffset="${n(-t * 50)}" opacity=".65"/>${particles}<g fill="${accent}" opacity=".55"><circle cx="150" cy="1240" r="8"/><circle cx="930" cy="460" r="11"/></g></g>`;
}
function reaction(scene: Scene, t: number, accent: string, settings: ResolvedAnimation): string {
  const approach = smooth((Math.sin(t * .8) + 1) / 2);
  const atoms = Array.from({ length: 8 }, (_, i) => {
    const side = i < 4 ? -1 : 1, local = i % 4;
    const x = 540 + side * mix(330, 120, approach) + Math.sin(local * 1.7) * 80;
    const y = 740 + local * 135 + Math.sin(t + i) * 12 * settings.intensity;
    return `<g data-reacting-atom="${i}" transform="translate(${n(x)} ${n(y)})"><circle r="46" fill="${i % 2 ? accent : '#68CDE1'}" opacity=".85"/><text x="0" y="9" text-anchor="middle" fill="#14231E" font-family="Inter,Arial" font-size="28" font-weight="800">${i % 2 ? 'B' : 'A'}</text></g>`;
  }).join('');
  return `<g data-animation-layer="reaction" data-reaction-progress="${n(approach)}"><path d="M160 520 H920" stroke="#FFFFFF" stroke-opacity=".12"/><text x="540" y="480" text-anchor="middle" fill="#F3F7F4" font-family="Inter,Arial" font-size="39" font-weight="700">BAĞLAR DEĞİŞİR</text><g data-reaction-bond="true" opacity="${n(approach)}" stroke="${accent}" stroke-width="9"><path d="M450 760 H630 M450 895 H630 M450 1030 H630 M450 1165 H630"/></g>${atoms}<text x="540" y="1340" text-anchor="middle" fill="${accent}" font-family="Inter,Arial" font-size="42">${approach > .5 ? 'A₂ + B₂  →  2AB' : 'A + B  ⇄  AB'}</text></g>`;
}
function signalOverlay(project: Project, scene: Scene, t: number, accent: string, settings: ResolvedAnimation, neural: boolean): string {
  const signals = Array.from({ length: Math.max(8, settings.particleCount) }, (_, i) => {
    const angle = i * 2.399 + t * .25, radius = 80 + (i % 6) * 48;
    const x = 540 + Math.cos(angle) * radius, y = 910 + Math.sin(angle) * radius * 1.25;
    return `<circle data-signal-particle="${i}" cx="${n(x)}" cy="${n(y)}" r="${n(4 + i % 4)}" fill="${i % 2 ? accent : '#74D8E7'}" opacity="${n(.3 + .6 * (.5 + .5 * Math.sin(t * 3 + i)))}"/>`;
  }).join('');
  return `<g data-animation-layer="${neural ? 'neural' : 'data-flow'}">${signals}<circle cx="540" cy="900" r="${n(330 + Math.sin(t * 2) * 18)}" fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="8 20" stroke-dashoffset="${n(-t * 40)}" opacity=".35"/></g>`;
}
function generic(project: Project, scene: Scene, t: number, accent: string, settings: ResolvedAnimation): string {
  const particles = Array.from({ length: Math.max(10, settings.particleCount) }, (_, i) => {
    const a = i * TAU / Math.max(10, settings.particleCount) + t * .18 * (i % 2 ? 1 : -1), r = 260 + (i % 4) * 65;
    return `<g data-science-particle="${i}" transform="translate(${n(540 + Math.cos(a) * r)} ${n(900 + Math.sin(a) * r * .75)})"><circle r="${n(5 + i % 5)}" fill="${i % 3 ? accent : '#71D5E5'}"/><circle r="${n(12 + i % 5)}" fill="none" stroke="${accent}" opacity=".25"/></g>`;
  }).join('');
  return `<g data-animation-layer="generic-particles">${particles}<ellipse cx="540" cy="900" rx="420" ry="315" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="5 18" stroke-dashoffset="${n(t * 25)}" opacity=".3"/></g>`;
}

export function renderAnimatedSceneSvg(project: Project, scene: Scene, identity: ChannelIdentity, timeSeconds: number): string {
  const settings = resolveAnimation(project, scene);
  const duration = Math.max(.1, scene.duration || 10);
  const t = Math.max(0, timeSeconds) * settings.speed;
  const accent = identity.primaryColor || '#D8FF65';
  // BUILD 44: KONUYA ÖZGÜ DİYAGRAM HER ZAMAN çizilir; animasyon katmanı
  // onun ÜZERİNE eklenir. Önceki sürümde bazı ön ayarlar diyagramı TAMAAMEN
  // değiştiriyordu (ör. 'cellular'), bu yüzden farklı konular aynı yuvarlak
  // hücre görselini alıyordu.
  const base = diagramFor(project, scene, accent);
  // Etiketler gövdeden AYRILIR: hareket katmanı etiket bandına sızmasın diye
  // klip edilir, etiketler ise en üstte, okunaklı biçimde çizilir.
  const { body, labels, captionTop, captionBottom } = splitDiagramLabels(base);
  let motion: string;
  switch (settings.preset) {
    case 'light-scattering': motion = lightScattering(scene, t, duration, accent, settings); break;
    case 'liquid-molecules': motion = liquid(scene, t, duration, accent, settings); break;
    case 'crystallization': motion = crystallization(scene, t, duration, accent, settings); break;
    case 'lattice-expansion': motion = latticeExpansion(scene, t, duration, accent, settings); break;
    case 'floating-ice': motion = floatingIce(scene, t, duration, accent, settings); break;
    case 'orbital': motion = orbital(scene, t, accent, settings); break;
    case 'galaxy': motion = galaxy(scene, t, accent, settings); break;
    case 'cellular': motion = cellular(scene, t, accent, settings); break;
    case 'energy-waves': motion = energyWaves(scene, t, accent, settings); break;
    case 'geological': motion = geological(scene, t, accent, settings); break;
    case 'weather-systems': motion = weatherSystems(scene, t, accent, settings); break;
    case 'river-flow': motion = riverFlow(scene, t, accent, settings); break;
    case 'reaction': motion = reaction(scene, t, accent, settings); break;
    case 'neural': motion = signalOverlay(project, scene, t, accent, settings, true); break;
    case 'data-flow': motion = signalOverlay(project, scene, t, accent, settings, false); break;
    default: motion = generic(project, scene, t, accent, settings); break;
  }
  // Hareket katmanı yarı saydam bir VURGU katmanıdır; konu diyagramı okunur kalır.
  //
  // Etiketler ÜSTTE çizilir ve arkalarına yumuşak bir bant (caption plate)
  // konur. Önceki yaklaşım hareket katmanını etiket bandına doğru MASKELERDİ;
  // bu, bilimsel olarak anlamlı hareket göstergelerini (kafes genişleme
  // okları, hacim endeksi, ölçüm çizgileri) yok ediyor ve "nesne hareketi"
  // eşiğini düşürüyordu. Bant yaklaşımı hem etiketi okunaklı tutar hem de
  // hareketin TAMAMINI korur.
  // Tanımlayıcı SAHNE KİMLİĞİNDEN türetilir: sayaç kullanılırsa aynı sahnenin
  // iki render'ı farklı SVG üretir ve önizleme/dışa aktarım eşitliği bozulur.
  const plateId = `caption-plate-${scene.id.replace(/[^a-zA-Z0-9_-]/g, '') || 'scene'}`;
  const plate = Number.isFinite(captionTop)
    ? `<linearGradient id="${plateId}" gradientUnits="userSpaceOnUse" x1="0" y1="${captionTop - 92}" x2="0" y2="${captionBottom + 62}">
        <stop offset="0" stop-color="#0A110F" stop-opacity="0"/>
        <stop offset=".32" stop-color="#0A110F" stop-opacity=".55"/>
        <stop offset=".72" stop-color="#0A110F" stop-opacity=".55"/>
        <stop offset="1" stop-color="#0A110F" stop-opacity="0"/>
      </linearGradient>
      <rect data-caption-plate="true" x="0" y="${captionTop - 92}" width="1080" height="${captionBottom - captionTop + 154}" fill="url(#${plateId})"/>`
    : '';
  const artwork = body + `<g data-motion-layer="true" opacity=".72">${motion}</g>` + plate + labels;
  const p = clamp(timeSeconds / duration);
  const camera = scene.cameraMovement || 'static';
  const scale = camera === 'zoom-in' ? 1 + p * .035 : camera === 'zoom-out' ? 1.035 - p * .035 : 1;
  const tx = camera === 'pan-left' ? p * 32 : camera === 'pan-right' ? -p * 32 : 0;
  const transform = `translate(${n(540 + tx)} 900) scale(${n(scale)}) translate(-540 -900)`;
  return buildArtworkSvg(project, scene, identity, artwork, transform, `data-animation-preset="${settings.preset}" data-frame-time="${n(timeSeconds)}" data-animation-speed="${settings.speed}"`);
}
