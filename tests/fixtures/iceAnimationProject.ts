import type { AnimationPreset, Project, Scene } from '../../shared/types.js';
import { generateSubtitleCues } from '../../shared/utils.js';
import { sampleProject } from '../helpers.js';

export const ICE_TEST_PROJECT_NAME = 'Why does ice float on water?';
export const ICE_SCENE_NARRATIONS = [
  'In liquid water, molecules vibrate and move past one another.',
  'As water freezes, molecules form an ordered crystal lattice.',
  'The open lattice expands and takes up more space, making ice less dense.',
  'Lower density lets ice float while water waves move around it.',
];
const presets: Exclude<AnimationPreset, 'auto'>[] = ['liquid-molecules', 'crystallization', 'lattice-expansion', 'floating-ice'];

export function createIceAnimationProject(duration = 1.2): Project {
  const project = sampleProject('project_ice_animation');
  project.name = ICE_TEST_PROJECT_NAME;
  project.topic = ICE_TEST_PROJECT_NAME;
  project.targetDuration = duration * 4;
  project.status = 'ready';
  project.scenes = ICE_SCENE_NARRATIONS.map((narration, index): Scene => ({
    id: `ice-scene-${index + 1}`,
    number: index + 1,
    narration,
    visualDescription: ['Moving liquid water molecules', 'Crystallizing molecular lattice', 'Expanding ice crystal volume', 'Floating ice and water waves'][index],
    visualPrompt: '',
    assetType: 'procedural',
    duration,
    transition: 'none',
    cameraMovement: 'static',
    animation: { enabled: true, preset: presets[index], speed: 1, intensity: 1, particleCount: 24 },
    subtitles: generateSubtitleCues(narration, duration, index * duration),
    subtitleTiming: 'aligned',
    narrationDuration: Math.min(1, duration - .1),
    status: 'ready',
  }));
  project.script = ICE_SCENE_NARRATIONS.join(' ');
  return project;
}
