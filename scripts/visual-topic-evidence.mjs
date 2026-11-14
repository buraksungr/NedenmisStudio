/**
 * BUILD 44 kanıt üreteci — konuya özgü görsel motoru.
 *
 * İki FARKLI konu için aynı yerel "Animated Infographic Engine" çıktısını
 * üretir ve `.verification/build44/` altına PNG olarak yazar. Amaç:
 * "her konu için aynı geri dönüşüm şablonu" hatasının görsel olarak
 * kanıtlanması (ve konu ile uyumsuz şablon/kutu çakışmalarının görülmesi).
 *
 * Kullanım: npx vite-node scripts/visual-topic-evidence.mjs
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { buildProceduralSvg } from '../shared/visuals/sceneArtwork.js';
import { renderAnimatedSceneSvg } from '../shared/visuals/sceneAnimation.js';
import { classifyScene } from '../shared/visuals/sceneComposition.js';
import { DEFAULT_IDENTITY } from '../shared/defaults.js';

const CASES = [
  {
    name: 'ahtapot',
    topic: 'Ahtapotlar nasıl renk değiştirir?',
    narration: 'Ahtapotlar derisindeki kromatofor pigment hücrelerini genişletip daraltarak renk değiştirir.',
  },
  {
    name: 'kutup-ayi',
    topic: 'Kutup ayılarının derisi neden siyahtır?',
    narration: 'Kutup ayılarının siyah derisi ince tüylerin ışığı soğurmasını ve ısıyı tutmasını sağlar.',
  },
];

mkdirSync('.verification/build44', { recursive: true });

for (const testCase of CASES) {
  const project = { topic: testCase.topic, brand: { channelName: 'Nedenmiş', primaryColor: '#D8FF65', secondaryColor: '#71D5E5' } };
  const scene = {
    number: 1, narration: testCase.narration, visualDescription: '', duration: 10,
    cameraMovement: 'static', animation: { enabled: true, preset: 'auto', speed: 1, intensity: 1, particleCount: 24 },
  };
  const composition = classifyScene(project, scene);
  console.log(`${testCase.topic} → alan: ${composition.domain} | konu: ${composition.subject}`);
  const svg = renderAnimatedSceneSvg(project, scene, DEFAULT_IDENTITY, 0);
  await sharp(Buffer.from(svg), { density: 72 }).resize(1080, 1920, { fit: 'fill' }).png()
    .toFile(`.verification/build44/${testCase.name}.png`);
}
console.log('kanıt PNG dosyaları yazıldı: .verification/build44/');
