import { existsSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEFAULT_AUDIO, DEFAULT_IDENTITY, DEFAULT_SUBTITLE_STYLE, DEFAULT_VOICE } from '../shared/defaults.js';
import type { Project, ProjectInput } from '../shared/types.js';

export function projectInput(override: Partial<ProjectInput> = {}): ProjectInput { return { topic: 'Gökyüzü neden mavi görünür?', category: 'Bilim', mode: 'custom', targetDuration: 30, narrationStyle: 'belgesel', visualStyle: 'infografik', ...override }; }
export function sampleProject(id = 'project_test'): Project {
  const now = new Date().toISOString();
  return { id, name: 'Örnek merak', topic: 'Gökyüzü neden mavi?', category: 'Bilim', mode: 'custom', status: 'scenes_ready', instructions: '', targetDuration: 3, narrationStyle: 'belgesel', visualStyle: 'infografik', script: 'Güneş ışığı atmosfere girer. Mavi ışık daha fazla saçılır.', scenes: [], research: { status: 'not_started', sources: [] }, audio: { ...DEFAULT_AUDIO, musicClips: [], sfxClips: [] }, subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE }, brand: { channelName: DEFAULT_IDENTITY.channelName, primaryColor: DEFAULT_IDENTITY.primaryColor, secondaryColor: DEFAULT_IDENTITY.secondaryColor }, voice: { ...DEFAULT_VOICE }, createdAt: now, updatedAt: now };
}

/** Dışa aktarım doğrulama testlerinde kullanılan 52 saniyelik, dört sahneli gerçekçi kurgu metinleri. */
export const exportFixtureProject = { narrations: [
  'Sıvı suda moleküller sürekli titreşir ve birbirinin yanından geçer.',
  'Su donarken molekülleri düzenli bir kristal yapı oluşturur.',
  'Bu açık kristal kafes daha fazla yer kaplar ve buzun yoğunluğunu düşürür.',
  'Buzun suda yüzmesinin nedeni yoğunluğunun sudan daha düşük olmasıdır.',
] } as const;

/** Doğrulama kanıtlarını depo içinde kalıcı bir klasöre kopyalar ve kopya yolunu döndürür. */
export function verificationDir(...parts: string[]): string { return join(process.cwd(), '.verification', ...parts); }
export function retainVerificationArtifacts(source: string, target: string, isDirectory = false): string {
  const destination = verificationDir(target);
  if (!existsSync(source)) return destination;
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: isDirectory, force: true });
  return destination;
}
