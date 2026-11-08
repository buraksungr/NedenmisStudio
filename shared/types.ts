export type ProjectMode = 'automatic' | 'custom';
export type ProjectStatus = 'draft' | 'researched' | 'script_ready' | 'scenes_ready' | 'production' | 'ready' | 'rendering' | 'completed' | 'error';
export type VisualStyle = 'belgesel' | 'minimal' | 'infografik' | 'sinematik' | 'illustrasyon';
export type NarrationStyle = 'belgesel' | 'samimi' | 'enerjik' | 'sakin';
export type TransitionType = 'fade' | 'dissolve' | 'slide' | 'none';
export type CameraMovement = 'static' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
export type AnimationPreset = 'auto' | 'light-scattering' | 'liquid-molecules' | 'crystallization' | 'lattice-expansion' | 'floating-ice' | 'orbital' | 'galaxy' | 'cellular' | 'energy-waves' | 'geological' | 'weather-systems' | 'river-flow' | 'reaction' | 'neural' | 'data-flow' | 'generic-particles';
export interface SceneAnimationSettings {
  enabled: boolean;
  preset: AnimationPreset;
  speed: number;
  intensity: number;
  particleCount: number;
}
export interface ResolvedAnimation extends Omit<SceneAnimationSettings, 'preset'> {
  preset: Exclude<AnimationPreset, 'auto'>;
}
export type MediaKind = 'generated-image' | 'image' | 'video' | 'music' | 'sfx' | 'narration' | 'reference-voice';
export type ProviderKind = 'llm' | 'research' | 'tts' | 'image';
export type TimingMode = 'estimated' | 'aligned';

export interface SubtitleCue {
  id: string;
  start: number;
  end: number;
  text: string;
  emphasis?: string[];
}

export interface ScriptSections {
  hook: string;
  explanation: string;
  conclusion: string;
}
export type SceneSection = keyof ScriptSections | 'intro' | 'outro';

export interface Scene {
  id: string;
  number: number;
  narration: string;
  /** Orijinal anlatım korunur; yalnızca TTS sağlayıcısına gönderilen sayı/sembol normalize metni. */
  ttsText?: string;
  section?: SceneSection;
  visualDescription: string;
  visualPrompt: string;
  assetPath?: string;
  assetType: 'procedural' | 'ai-image' | 'imported-image' | 'video';
  duration: number;
  transition: TransitionType;
  cameraMovement: CameraMovement;
  animation?: SceneAnimationSettings;
  subtitles: SubtitleCue[];
  subtitleTiming: TimingMode;
  narrationPath?: string;
  narrationDuration?: number;
  visualProvider?: string;
  status: 'empty' | 'ready' | 'generating' | 'error';
  error?: string;
}

export interface AudioClip {
  id: string;
  mediaId?: string;
  kind: 'music' | 'sfx';
  name: string;
  path: string;
  start: number;
  duration: number;
  trimStart: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface AudioSettings {
  narrationVolume: number;
  musicVolume: number;
  sfxVolume: number;
  musicDucking: boolean;
  musicClips: AudioClip[];
  sfxClips: AudioClip[];
}

export interface ResearchSource {
  id: string;
  url: string;
  title: string;
  snippet: string;
  retrievedAt: string;
  claims: { text: string; confidence: 'verified' | 'uncertain' }[];
}

export interface ResearchResult {
  status: 'not_started' | 'completed' | 'unavailable' | 'failed';
  provider?: string;
  sources: ResearchSource[];
  note?: string;
}

export interface Project {
  id: string;
  name: string;
  topic: string;
  category: string;
  mode: ProjectMode;
  status: ProjectStatus;
  instructions: string;
  targetDuration: number;
  narrationStyle: NarrationStyle;
  visualStyle: VisualStyle;
  script: string;
  /** Üretim ve elle düzenleme sonrası üç mantıksal bölüm; eski projelerde sonradan hidratlanır. */
  scriptSections?: ScriptSections;
  scenes: Scene[];
  research: ResearchResult;
  audio: AudioSettings;
  subtitleStyle: SubtitleStyle;
  brand?: { channelName: string; primaryColor: string; secondaryColor: string };
  voice: VoiceSelection;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  recoveryNote?: string;
}

export interface ProjectInput {
  name?: string;
  topic: string;
  category?: string;
  mode: ProjectMode;
  instructions?: string;
  targetDuration?: number;
  narrationStyle?: NarrationStyle;
  visualStyle?: VisualStyle;
}

export interface TopicSuggestion {
  id: string;
  title: string;
  category: string;
  hook: string;
  score: number;
  reason: string;
}

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  highlightColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  outlineColor: string;
  outlineWidth: number;
  position: 'top' | 'center' | 'bottom';
  uppercase: boolean;
}

export interface VoiceSelection {
  providerId: string;
  voiceId: string;
  speed: number;
  pitch: number;
  exaggeration?: number;
  cfgWeight?: number;
  temperature?: number;
}

export interface ChannelIdentity {
  channelName: string;
  tagline: string;
  logoPath?: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  subtitleStyle: SubtitleStyle;
  visualStyle: VisualStyle;
  introEnabled: boolean;
  outroEnabled: boolean;
  outroText: string;
  defaultNarrationStyle: NarrationStyle;
  defaultMusicPath?: string;
}

export interface ProviderPublicConfig {
  id: string;
  kind: ProviderKind;
  name: string;
  configured: boolean;
  requiresKey: boolean;
  description: string;
  referenceVoiceSupported: boolean;
  commercialNote: string;
  local: boolean;
  requirements?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: 'tr';
  storagePath: string;
  ffmpegPath?: string;
  exportPreset: 'draft' | 'standard' | 'quality';
  outputPath: string;
  ttsPythonPath?: string;
  defaultVoice: VoiceSelection;
  activeLlmProvider: string;
  activeResearchProvider: string;
  activeTtsProvider: string;
  activeImageProvider: string;
  providers: ProviderPublicConfig[];
}

export interface MediaItem {
  id: string;
  kind: MediaKind;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  duration?: number;
  createdAt: string;
  projectId?: string;
}

export interface ExportRecord {
  id: string;
  projectId: string;
  projectName: string;
  outputPath: string;
  preset: string;
  status: 'queued' | 'rendering' | 'completed' | 'cancelled' | 'failed';
  progress: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
  fileSize?: number;
}

export interface ExportProgress {
  exportId: string;
  projectId: string;
  progress: number;
  stage: string;
  etaSeconds?: number;
}

export interface DashboardStats {
  projectCount: number;
  completedCount: number;
  totalRenderedSeconds: number;
  exportCount: number;
  weeklyProjects: number;
}

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female' | 'unknown';
  description: string;
  styles: string[];
}

export interface VoiceProviderDetails extends ProviderPublicConfig {
  voices: VoiceInfo[];
  supportsSpeed: boolean;
  supportsPitch: boolean;
}

export interface ScriptRequest {
  projectId: string;
  useResearch: boolean;
}

export interface RewriteRequest {
  projectId: string;
  selectedText: string;
  instruction: 'improve' | 'shorten' | 'hook' | 'conclusion' | 'custom';
  customInstruction?: string;
}

export interface TtsRequest {
  text: string;
  selection: VoiceSelection;
  referenceVoicePath?: string;
}

export interface TtsResult {
  path: string;
  /** Orijinal metnin yerine geçmez; TTS'e gönderilen ayrı normalize metindir. */
  ttsText?: string;
  duration: number;
  providerId: string;
  timingMode: TimingMode;
  cues?: SubtitleCue[];
  notice?: string;
  engine?: { model: string; checkpoint: string; device: string; referenceSha256: string; generationSeconds: number; modelLoadSeconds: number; modelRevision?: string; textPreprocessing?: string; normalizedText?: string; decodedText?: string; tokenCount?: number; unknownTokens?: number; sampleRate?: number; channels?: number };
}

export interface VoiceEngineProgress {
  stage: 'runtime' | 'dependencies' | 'model' | 'generation' | 'complete';
  message: string;
  progress?: number;
  downloadedBytes?: number;
  totalBytes?: number;
}
export interface VoiceEngineStatus {
  runtimeInstalled: boolean;
  dependenciesInstalled: boolean;
  modelDownloaded: boolean;
  referenceAvailable: boolean;
  verifiedAt?: string;
  lastGenerationSeconds?: number;
  pythonVersion?: string;
  torchVersion?: string;
  setupRunning: boolean;
  modelPath?: string;
  componentPath: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export interface SystemInfo {
  platform: string;
  version: string;
  ffmpegAvailable: boolean;
  ffmpegVersion?: string;
  storagePath: string;
  cpuCores: number;
  totalMemoryGB: number;
  freeMemoryGB: number;
}

export interface AppApi {
  projects: {
    list(): Promise<Project[]>;
    get(id: string): Promise<Project>;
    create(input: ProjectInput): Promise<Project>;
    update(project: Project): Promise<Project>;
    remove(id: string): Promise<void>;
    duplicate(id: string): Promise<Project>;
    rename(id: string, name: string): Promise<Project>;
  };
  topics: { discover(category?: string): Promise<TopicSuggestion[]> };
  research: { run(projectId: string): Promise<ResearchResult> };
  ai: {
    generateScript(request: ScriptRequest): Promise<Project>;
    generateScenes(projectId: string): Promise<Project>;
    rewrite(request: RewriteRequest): Promise<string>;
  };
  visuals: { regenerate(projectId: string, sceneId: string): Promise<Project>; generateAll(projectId: string): Promise<Project> };
  tts: {
    providers(): Promise<VoiceProviderDetails[]>;
    preview(request: TtsRequest): Promise<TtsResult>;
    generateProject(projectId: string): Promise<Project>;
  };
  voiceEngine: {
    status(): Promise<VoiceEngineStatus>;
    setup(): Promise<VoiceEngineStatus>;
    onProgress(callback: (progress: VoiceEngineProgress) => void): () => void;
  };
  media: {
    list(kind?: MediaKind): Promise<MediaItem[]>;
    import(kind: MediaKind): Promise<MediaItem[]>;
    remove(id: string): Promise<void>;
    addToTimeline(projectId: string, mediaId: string, start: number): Promise<Project>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(settings: Partial<AppSettings>): Promise<AppSettings>;
    setApiKey(providerId: string, apiKey: string): Promise<void>;
    clearApiKey(providerId: string): Promise<void>;
    test(providerId: string): Promise<ConnectionTestResult>;
    chooseDirectory(purpose: 'storage' | 'output'): Promise<string | undefined>;
    chooseFFmpeg(): Promise<string | undefined>;
  };
  identity: { get(): Promise<ChannelIdentity>; update(identity: ChannelIdentity): Promise<ChannelIdentity> };
  exports: {
    list(): Promise<ExportRecord[]>;
    start(projectId: string): Promise<ExportRecord>;
    cancel(exportId: string): Promise<void>;
    reveal(outputPath: string): Promise<void>;
    onProgress(callback: (progress: ExportProgress) => void): () => void;
  };
  dashboard: { stats(): Promise<DashboardStats> };
  system: { info(): Promise<SystemInfo>; mediaUrl(path?: string): string; openExternal(url: string): Promise<void> };
}
