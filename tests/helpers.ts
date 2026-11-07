import { DEFAULT_AUDIO, DEFAULT_IDENTITY, DEFAULT_SUBTITLE_STYLE, DEFAULT_VOICE } from '../shared/defaults.js';
import type { Project, ProjectInput } from '../shared/types.js';

export function projectInput(override: Partial<ProjectInput> = {}): ProjectInput { return { topic: 'Gökyüzü neden mavi görünür?', category: 'Bilim', mode: 'custom', targetDuration: 30, narrationStyle: 'belgesel', visualStyle: 'infografik', ...override }; }
export function sampleProject(id = 'project_test'): Project {
  const now = new Date().toISOString();
  return { id, name: 'Örnek merak', topic: 'Gökyüzü neden mavi?', category: 'Bilim', mode: 'custom', status: 'scenes_ready', instructions: '', targetDuration: 3, narrationStyle: 'belgesel', visualStyle: 'infografik', script: 'Güneş ışığı atmosfere girer. Mavi ışık daha fazla saçılır.', scenes: [], research: { status: 'not_started', sources: [] }, audio: { ...DEFAULT_AUDIO, musicClips: [], sfxClips: [] }, subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE }, brand: { channelName: DEFAULT_IDENTITY.channelName, primaryColor: DEFAULT_IDENTITY.primaryColor, secondaryColor: DEFAULT_IDENTITY.secondaryColor }, voice: { ...DEFAULT_VOICE }, createdAt: now, updatedAt: now };
}
