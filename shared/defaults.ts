import type { AppSettings, AudioSettings, ChannelIdentity, ProjectInput, SubtitleStyle, VoiceSelection } from './types.js';

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: 'Inter',
  fontSize: 58,
  color: '#FFFFFF',
  highlightColor: '#D8FF65',
  backgroundColor: '#000000',
  backgroundOpacity: 0.35,
  outlineColor: '#101310',
  outlineWidth: 3,
  position: 'bottom',
  uppercase: false,
};

export const DEFAULT_VOICE: VoiceSelection = {
  providerId: 'windows-sapi',
  voiceId: 'auto-tr',
  speed: 1,
  pitch: 0,
};

export const DEFAULT_AUDIO: AudioSettings = {
  narrationVolume: 1,
  musicVolume: 0.16,
  sfxVolume: 0.45,
  musicDucking: true,
  musicClips: [],
  sfxClips: [],
};

export const DEFAULT_IDENTITY: ChannelIdentity = {
  channelName: 'Nedenmiş',
  tagline: 'Merak ettiklerinizin kısa yolculuğu',
  primaryColor: '#D8FF65',
  secondaryColor: '#17211B',
  fontFamily: 'Inter',
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  visualStyle: 'infografik',
  introEnabled: false,
  outroEnabled: true,
  outroText: 'Peki, siz en çok neyi merak ediyorsunuz?',
  defaultNarrationStyle: 'belgesel',
};

export function defaultSettings(storagePath: string): AppSettings {
  return {
    theme: 'dark', language: 'tr', storagePath,
    exportPreset: 'standard', outputPath: `${storagePath}/exports`, defaultVoice: { ...DEFAULT_VOICE },
    activeLlmProvider: 'local-script', activeResearchProvider: 'offline-curated',
    activeTtsProvider: 'windows-sapi', activeImageProvider: 'procedural', providers: [],
  };
}

export function projectDefaults(input: ProjectInput): Required<Omit<ProjectInput, 'name' | 'instructions'>> & { name: string; instructions: string } {
  return {
    name: input.name?.trim() || input.topic.trim() || 'İsimsiz merak',
    topic: input.topic.trim(), category: input.category || 'Bilim', mode: input.mode,
    instructions: input.instructions || '', targetDuration: input.targetDuration || 45,
    narrationStyle: input.narrationStyle || 'belgesel', visualStyle: input.visualStyle || 'infografik',
  };
}
