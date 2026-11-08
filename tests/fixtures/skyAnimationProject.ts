import type { Project, Scene } from '../../shared/types.js';
import { composeScript } from '../../shared/script.js';
import { generateSubtitleCues } from '../../shared/utils.js';
import { sampleProject } from '../helpers.js';

export const SKY_TEST_PROJECT_NAME = 'Gökyüzü neden mavi görünür?';
export const SKY_SCENE_NARRATIONS = [
  'Güneş’in ışığı beyaz. Peki gökyüzü neden mavi?',
  'Beyaz ışık aslında bütün görünür renkleri taşır. Atmosferdeki küçük moleküller, yaklaşık 450 nanometre dalga boyundaki mavi ışığı kırmızıdan çok daha güçlü saçar. Böylece her yönden gözümüze ulaşan ışıkta mavi baskın olur.',
  'Gökyüzünün rengi, beyaz ışığın atmosferde bize dağıtılmış hâlidir.',
];
const sections = { hook: SKY_SCENE_NARRATIONS[0], explanation: SKY_SCENE_NARRATIONS[1], conclusion: SKY_SCENE_NARRATIONS[2] };

export function createSkyAnimationProject(duration = 4): Project {
  const project = sampleProject('project_sky_animation');
  project.name = SKY_TEST_PROJECT_NAME; project.topic = SKY_TEST_PROJECT_NAME;
  project.targetDuration = duration * 3; project.status = 'ready';
  project.scriptSections = sections; project.script = composeScript(sections);
  project.scenes = SKY_SCENE_NARRATIONS.map((narration, index): Scene => ({
    id: `sky-scene-${index + 1}`, number: index + 1, section: index === 0 ? 'hook' : index === 1 ? 'explanation' : 'conclusion', narration,
    visualDescription: ['Güneşten gelen beyaz ışık ve gökyüzü', 'Atmosferde saçılan mavi fotonlar', 'Ufka ulaşan kırmızı ve turuncu ışık'][index], visualPrompt: '',
    assetType: 'procedural', assetPath: `/proof/sky-scene-${index + 1}.png`, narrationPath: `/proof/sky-scene-${index + 1}.wav`, narrationDuration: duration - .22,
    duration, transition: 'none', cameraMovement: 'static', animation: { enabled: true, preset: 'auto', speed: 1, intensity: 1, particleCount: 24 },
    subtitles: generateSubtitleCues(narration, duration, index * duration), subtitleTiming: 'aligned', status: 'ready',
  }));
  return project;
}
