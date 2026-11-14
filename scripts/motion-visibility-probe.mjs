/**
 * HAREKET GÖRÜNÜRLÜĞÜ SONNOKTASI.
 *
 * `previewExportParity.test.ts`, bir sahne içinde 1,2 sn arayla çekilen iki
 * MP4 karesinin "nesne hareketi" eşiğini (>1) ölçer. MP4 kareleri bu SVG'den
 * üretildiği için aynı ölçümü doğrudan SVG'den alabiliriz: testin tamamını
 * (dakikalarca süren MP4 dışa aktarımı) çalıştırmadan hareketin yeterince
 * GÖRÜNÜR olup olmadığını ölçer.
 *
 * Kullanım: npx vite-node scripts/motion-visibility-probe.mjs
 */
import sharp from 'sharp';
import { renderAnimatedSceneSvg } from '../shared/visuals/sceneAnimation.ts';
import { DEFAULT_IDENTITY } from '../shared/defaults.ts';
import { buildPlaybackTimeline, generateSubtitleCues, totalDuration } from '../shared/index.ts';

const durations = [9.5, 14.5, 13.5, 14.5];
const transitions = ['fade', 'dissolve', 'slide', 'fade'];
const presets = ['liquid-molecules', 'crystallization', 'lattice-expansion', 'floating-ice'];
const narration = 'Buz neden suda yüzer? Buz ve su molekülleri neden farklı davranır?';

const project = {
  id: 'probe-project', topic: 'Buz neden suda yüzer?', name: 'probe', status: 'ready', scenes: [],
  brand: { channelName: 'Nedenmiş', primaryColor: '#D8FF65', secondaryColor: '#17211B' },
};

const scenes = presets.map((preset, index) => ({
  id: `parity-scene-${index + 1}`, number: index + 1, section: 'explanation', narration,
  visualDescription: 'Buz ve su molekülleri', visualPrompt: '', assetType: 'procedural',
  duration: durations[index], transition: transitions[index], cameraMovement: 'zoom-in',
  animation: { enabled: true, preset, speed: 1, intensity: 1, particleCount: 26 },
  subtitles: generateSubtitleCues(narration, durations[index], 0), subtitleTiming: 'estimated', status: 'ready',
}));
project.scenes = scenes;

const timeline = buildPlaybackTimeline(scenes);
scenes.forEach((scene, index) => { scene.subtitles = generateSubtitleCues(narration, scene.duration, timeline.starts[index]); });
const duration = totalDuration(scenes);

/** Testle BİREBİR aynı ölçüm (RGB, 216×384). */
async function pixels(buffer) {
  return sharp(buffer).resize(216, 384).removeAlpha().raw().toBuffer();
}
async function meanDifference(a, b) {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return sum / a.length;
}
async function svgFrame(scene, localTime) {
  const svg = renderAnimatedSceneSvg(project, scene, DEFAULT_IDENTITY, localTime);
  return sharp(Buffer.from(svg), { density: 72 }).resize(1080, 1920, { fit: 'fill' }).png().toBuffer();
}

const probes = [
  { label: 'scene1-start', time: 0.4, scene: 0 },
  { label: 'scene1-end', time: 8.8, scene: 0 },
  { label: 'scene2-start', time: 10.6, scene: 1 },
  { label: 'scene2-mid', time: 17.0, scene: 1 },
  { label: 'scene3-start', time: 25.0, scene: 2 },
  { label: 'scene3-mid', time: 30.0, scene: 2 },
  { label: 'scene4-start', time: 38.5, scene: 3 },
  { label: 'scene4-mid', time: 45.0, scene: 3 },
  { label: 'final', time: 51.5, scene: 3 },
];

console.log(`toplam süre = ${duration.toFixed(3)} sn; başlangıçlar = ${timeline.starts.map((value) => value.toFixed(2)).join(', ')}`);
let worst = Infinity;
for (const probeCase of probes) {
  const scene = scenes[probeCase.scene];
  const laterTime = Math.min(probeCase.time + 1.2, duration - .2);
  const localTime = probeCase.time - timeline.starts[probeCase.scene];
  const laterLocal = laterTime - timeline.starts[probeCase.scene];
  const difference = await meanDifference(
    await pixels(await svgFrame(scene, localTime)),
    await pixels(await svgFrame(scene, laterLocal)),
  );
  worst = Math.min(worst, difference);
  console.log(`${probeCase.label.padEnd(13)} t=${probeCase.time} yerel=${localTime.toFixed(2)}→${laterLocal.toFixed(2)}  fark=${difference.toFixed(4)}  ${difference > 1 ? 'OK' : 'BAŞARISIZ'}`);
}
console.log(`en düşük fark = ${worst.toFixed(4)} (eşik > 1)`);
