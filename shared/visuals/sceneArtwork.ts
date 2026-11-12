import { escapeXml } from '../utils.js';
import type { ChannelIdentity, Project, Scene } from '../types.js';

export function diagramFor(project: Project, scene: Scene, accent: string): string {
  const text = `${project.topic} ${scene.narration}`.toLocaleLowerCase('tr-TR');
  if (/gökyüzü|mavi|rayleigh|ışık saç/.test(text)) return `
    <circle cx="170" cy="520" r="100" fill="#FFD66B"/><g stroke="#FFE8A3" stroke-width="10" opacity=".8">${Array.from({ length: 12 }, (_, i) => `<line x1="170" y1="360" x2="170" y2="300" transform="rotate(${i * 30} 170 520)"/>`).join('')}</g>
    <path d="M285 545 L680 725 M270 590 L635 900 M295 500 L760 600" stroke="#FFF4C7" stroke-width="12" opacity=".75"/>
    <path d="M0 1000 Q540 710 1080 1000 L1080 1500 L0 1500Z" fill="#234D73" opacity=".7"/><path d="M0 1040 Q540 760 1080 1040" fill="none" stroke="#7BDDFF" stroke-width="12"/>
    <g fill="${accent}">${Array.from({ length: 26 }, (_, i) => { const x = 420 + (i * 83) % 520; const y = 700 + (i * 137) % 440; return `<circle cx="${x}" cy="${y}" r="${6 + i % 5}"/><path d="M${x} ${y} l${-45 + i % 7 * 15} ${45 + i % 4 * 18}" stroke="${accent}" stroke-width="4"/>`; }).join('')}</g>
    <g font-family="Inter,Arial" font-weight="700" font-size="30" fill="#EAF8FF"><text x="90" y="730">GÜNEŞ IŞIĞI</text><text x="690" y="1210">MAVİ SAÇILIM</text></g>`;
  if (/ay|uzay|dünya|kara delik|gezegen|yıldız|yörünge/.test(text)) return `
    <defs><radialGradient id="planet"><stop stop-color="#9BE8FF"/><stop offset=".55" stop-color="#3479A8"/><stop offset="1" stop-color="#102738"/></radialGradient><radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".6"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
    <g fill="#FFFFFF">${Array.from({ length: 70 }, (_, i) => `<circle cx="${(i * 179) % 1050 + 15}" cy="${(i * 263) % 1380 + 80}" r="${1 + i % 3}" opacity="${.25 + (i % 6) / 10}"/>`).join('')}</g>
    <circle cx="720" cy="810" r="390" fill="url(#glow)"/><ellipse cx="590" cy="840" rx="410" ry="155" fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="12 16" transform="rotate(-18 590 840)"/>
    <circle cx="570" cy="860" r="260" fill="url(#planet)"/><path d="M390 790 Q520 670 640 760 T810 750 M350 920 Q520 850 700 980" fill="none" stroke="#B8F3D0" stroke-width="36" opacity=".35"/>
    <circle cx="875" cy="650" r="75" fill="#D8D5CB"/><circle cx="850" cy="625" r="15" fill="#AAA99F"/><circle cx="900" cy="680" r="22" fill="#B7B4AA"/>
    <path d="M340 1180 Q610 1070 865 1150" fill="none" stroke="#FFFFFF" stroke-width="4" opacity=".35"/><text x="385" y="1260" font-family="Inter,Arial" font-size="32" fill="#EAF8FF" letter-spacing="5">KÜTLE ÇEKİMİ • HAREKET</text>`;
  if (/beyin|hafıza|bellek|psikoloji|deja|zaman|şarkı/.test(text)) return `
    <path d="M560 470 C390 390 240 540 290 690 C170 760 230 950 350 970 C330 1150 510 1230 590 1110 C710 1210 890 1110 820 970 C960 900 900 700 800 690 C840 530 700 420 560 470Z" fill="#253A35" stroke="${accent}" stroke-width="7"/>
    <g stroke="#85CBB0" stroke-width="4" opacity=".75">${Array.from({ length: 16 }, (_, i) => `<line x1="${360 + (i * 97) % 390}" y1="${570 + (i * 137) % 480}" x2="${390 + (i * 173) % 350}" y2="${600 + (i * 211) % 430}"/>`).join('')}</g>
    <g fill="${accent}">${Array.from({ length: 18 }, (_, i) => `<circle cx="${360 + (i * 97) % 390}" cy="${570 + (i * 137) % 480}" r="${9 + i % 4 * 3}"/>`).join('')}</g>
    <circle cx="560" cy="820" r="105" fill="#14201C" stroke="#FFFFFF" stroke-width="3"/><path d="M560 820 L560 755 M560 820 L615 850" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round"/><text x="380" y="1310" font-family="Inter,Arial" font-size="31" fill="#D8E6E0" letter-spacing="4">ALGI • BELLEK • BAĞLANTI</text>`;
  if (/buz|su|deniz|okyanus|molekül|basınç|ses/.test(text)) return `
    <path d="M0 700 Q170 640 340 700 T680 700 T1020 700 T1360 700 V1550 H0Z" fill="#123F59"/><path d="M0 760 Q170 700 340 760 T680 760 T1020 760 T1360 760" fill="none" stroke="#68D5EA" stroke-width="9" opacity=".65"/>
    <g stroke="#9BEAFF" stroke-width="5" fill="#173C4B">${Array.from({ length: 12 }, (_, i) => { const x = 200 + (i % 4) * 190 + (i % 2) * 30; const y = 930 + Math.floor(i / 4) * 180; return `<line x1="${x}" y1="${y}" x2="${x + 80}" y2="${y - 50}"/><line x1="${x}" y1="${y}" x2="${x + 80}" y2="${y + 60}"/><circle cx="${x}" cy="${y}" r="30"/><circle cx="${x + 85}" cy="${y - 55}" r="20" fill="${accent}"/><circle cx="${x + 85}" cy="${y + 65}" r="20" fill="${accent}"/>`; }).join('')}</g>
    <path d="M540 560 L380 830 L700 830Z" fill="#D9F6FF" opacity=".85"/><text x="335" y="1510" font-family="Inter,Arial" font-size="31" fill="#D9F6FF" letter-spacing="4">YAPI • YOĞUNLUK • HAREKET</text>`;
  if (/kedi|karınca|hayvan|ayı|böcek|bitki/.test(text)) return `
    <circle cx="540" cy="820" r="330" fill="#1C352B" stroke="#5D9D7B" stroke-width="3"/><g fill="${accent}" opacity=".9"><ellipse cx="540" cy="850" rx="125" ry="105"/><ellipse cx="350" cy="680" rx="65" ry="85" transform="rotate(-30 350 680)"/><ellipse cx="510" cy="590" rx="65" ry="85"/><ellipse cx="680" cy="640" rx="65" ry="85" transform="rotate(25 680 640)"/><ellipse cx="760" cy="830" rx="65" ry="85" transform="rotate(50 760 830)"/></g>
    <path d="M170 1200 C340 1100 500 1240 650 1140 S920 1060 940 1230" fill="none" stroke="#A7D5B7" stroke-width="6" stroke-dasharray="15 15"/><text x="325" y="1370" font-family="Inter,Arial" font-size="31" fill="#D8E6E0" letter-spacing="4">DAVRANIŞ • İZ • İÇGÜDÜ</text>`;
  if (/telefon|yapay zek|teknoloji|ekran|bilgisayar/.test(text)) return `
    <rect x="245" y="480" width="590" height="790" rx="70" fill="#15241F" stroke="#71877D" stroke-width="8"/><rect x="285" y="545" width="510" height="590" rx="25" fill="#213E34"/>
    <g stroke="${accent}" fill="none" stroke-width="6"><path d="M350 680 H540 V840 H700 M350 980 H480 V840 M540 680 V610 M650 980 V840"/><circle cx="350" cy="680" r="18" fill="${accent}"/><circle cx="350" cy="980" r="18" fill="${accent}"/><circle cx="700" cy="840" r="18" fill="${accent}"/></g>
    <circle cx="540" cy="840" r="95" fill="${accent}" opacity=".18"/><circle cx="540" cy="840" r="45" fill="${accent}"/><text x="335" y="1390" font-family="Inter,Arial" font-size="31" fill="#D8E6E0" letter-spacing="4">SİNYAL • VERİ • TEPKİ</text>`;
  return `
    <circle cx="540" cy="810" r="310" fill="#1C2B26" stroke="#344A40" stroke-width="2"/><circle cx="540" cy="810" r="205" fill="#243B31" stroke="${accent}" stroke-width="5" stroke-dasharray="10 16"/>
    <circle cx="540" cy="810" r="85" fill="${accent}"/><path d="M540 725 V540 M625 810 H840 M540 895 V1090 M455 810 H240" stroke="${accent}" stroke-width="5"/>
    <g fill="#DDE9E2" font-family="Inter,Arial" font-size="29" font-weight="600"><text x="470" y="500">SORU</text><text x="825" y="820">NEDEN</text><text x="460" y="1160">SONUÇ</text><text x="145" y="820">KANIT</text></g>
    <path d="M490 810 Q540 750 590 810 Q540 870 490 810Z" fill="#17211B"/><text x="365" y="1370" font-family="Inter,Arial" font-size="31" fill="#D8E6E0" letter-spacing="4">MERAKTAN AÇIKLAMAYA</text>`;
}

export function buildArtworkSvg(project: Project, scene: Scene, identity: ChannelIdentity, artwork: string, cameraTransform = '', metadata = ''): string {
  const accent = identity.primaryColor || '#D8FF65';
  const label = project.topic.length > 42 ? `${project.topic.slice(0, 42)}…` : project.topic;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" ${metadata}>
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101915"/><stop offset=".55" stop-color="#17241F"/><stop offset="1" stop-color="#0A1114"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="25" flood-opacity=".35"/></filter></defs>
    <rect width="1080" height="1920" fill="url(#bg)"/><circle cx="940" cy="180" r="360" fill="${accent}" opacity=".025"/><circle cx="90" cy="1550" r="420" fill="#4AA8C0" opacity=".035"/>
    <g font-family="Inter,Arial,sans-serif"><text x="72" y="105" fill="${accent}" font-size="25" font-weight="800" letter-spacing="4">${escapeXml(identity.channelName.toLocaleUpperCase('tr-TR'))}</text><text x="1008" y="105" text-anchor="end" fill="#91A099" font-size="24">SAHNE ${String(scene.number).padStart(2, '0')}</text>
    <text x="72" y="210" fill="#F3F7F4" font-size="47" font-weight="700">${escapeXml(label)}</text><rect x="72" y="254" width="82" height="5" rx="2.5" fill="${accent}"/></g>
    <g transform="${cameraTransform}"><g filter="url(#shadow)">${artwork}</g></g>
    <g font-family="Inter,Arial,sans-serif"><rect x="72" y="1590" width="936" height="1" fill="#FFFFFF" opacity=".12"/><text x="72" y="1670" fill="#9DAFA5" font-size="25" letter-spacing="3">NEDENİNİ KEŞFET</text><text x="72" y="1760" fill="#F3F7F4" font-size="35" font-weight="600">${escapeXml(identity.tagline.slice(0, 55))}</text><circle cx="965" cy="1745" r="24" fill="${accent}"/><path d="M954 1745 h22 m-9-9 9 9-9 9" stroke="#17211B" stroke-width="3" fill="none"/></g>
  </svg>`;
}

export function buildProceduralSvg(project: Project, scene: Scene, identity: ChannelIdentity): string {
  return buildArtworkSvg(project, scene, identity, diagramFor(project, scene, identity.primaryColor || '#D8FF65'));
}
