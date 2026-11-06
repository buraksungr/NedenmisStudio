import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { generateSubtitleCues, sceneStartTimes } from '../../../../shared/utils.js';
import type { Project, TtsRequest, TtsResult, VoiceProviderDetails } from '../../../../shared/types.js';
import type { ProjectRepository } from '../../infrastructure/database/ProjectRepository.js';
import type { MediaRepository } from '../../infrastructure/database/MediaRepository.js';
import type { TtsProvider } from './TtsProvider.js';

export class TtsService {
  constructor(private readonly projects: ProjectRepository, private readonly media: MediaRepository, private readonly providers: Map<string, TtsProvider>, private readonly storagePath: () => string) {}
  private provider(providerId: string): TtsProvider { const provider = this.providers.get(providerId); if (!provider) throw new Error('Seçilen ses sağlayıcısı bulunamadı.'); return provider; }
  async details(publicInfo: (provider: TtsProvider) => Omit<VoiceProviderDetails, 'voices' | 'supportsSpeed' | 'supportsPitch'>): Promise<VoiceProviderDetails[]> {
    return Promise.all([...this.providers.values()].map(async (provider) => ({ ...publicInfo(provider), voices: await provider.voices(), supportsSpeed: provider.supportsSpeed, supportsPitch: provider.supportsPitch })));
  }
  async preview(request: TtsRequest): Promise<TtsResult> {
    const provider = this.provider(request.selection.providerId); const directory = join(this.storagePath(), 'previews'); await mkdir(directory, { recursive: true });
    const path = join(directory, `ses-onizleme-${Date.now()}.${provider.id === 'windows-sapi' ? 'wav' : 'mp3'}`);
    const result = await provider.synthesize(request, path); const info = await stat(path);
    this.media.upsertByPath({ kind: 'narration', name: 'Ses önizlemesi', path, mimeType: provider.id === 'windows-sapi' ? 'audio/wav' : 'audio/mpeg', size: info.size, duration: result.duration });
    return { ...result, path, providerId: provider.id };
  }
  async generateProject(projectId: string): Promise<Project> {
    const project = this.projects.get(projectId); if (!project.scenes.length) throw new Error('Seslendirilecek sahne bulunamadı.');
    const provider = this.provider(project.voice.providerId); const directory = join(this.storagePath(), 'projects', project.id, 'narration'); await mkdir(directory, { recursive: true });
    for (const scene of project.scenes) {
      if (!scene.narration.trim()) continue;
      const path = join(directory, `${scene.id}-${provider.id}-${Date.now()}.${provider.id === 'windows-sapi' ? 'wav' : 'mp3'}`);
      try {
        const result = await provider.synthesize({ text: scene.narration, selection: project.voice }, path);
        scene.narrationPath = path; scene.narrationDuration = result.duration; scene.duration = Math.max(1, Number((result.duration + .22).toFixed(3)));
        scene.subtitleTiming = result.timingMode; (scene as typeof scene & { alignedCues?: unknown }).alignedCues = result.cues;
        const info = await stat(path); this.media.upsertByPath({ kind: 'narration', name: `${project.name} · Sahne ${scene.number}`, path, mimeType: provider.id === 'windows-sapi' ? 'audio/wav' : 'audio/mpeg', size: info.size, duration: result.duration, projectId: project.id });
        this.projects.update(project);
      } catch (error) { scene.error = error instanceof Error ? error.message : 'Seslendirme başarısız.'; this.projects.update(project); throw new Error(`Sahne ${scene.number} seslendirilemedi: ${scene.error}`); }
    }
    const starts = sceneStartTimes(project.scenes);
    project.scenes.forEach((scene, index) => {
      const aligned = (scene as typeof scene & { alignedCues?: import('../../../../shared/types.js').SubtitleCue[] }).alignedCues;
      scene.subtitles = aligned?.length ? aligned.map((cue) => ({ ...cue, start: cue.start + starts[index], end: cue.end + starts[index] })) : generateSubtitleCues(scene.narration, scene.duration, starts[index]);
      delete (scene as typeof scene & { alignedCues?: unknown }).alignedCues;
    });
    project.status = 'ready'; return this.projects.update(project);
  }
}
