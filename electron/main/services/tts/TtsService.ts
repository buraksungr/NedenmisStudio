import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { generateSubtitleCues, sceneStartTimes } from '../../../../shared/utils.js';
import { FRAME_RATE } from '../../../../shared/playback.js';
import { normalizeTurkishForTts } from '../../../../shared/turkishTtsNormalization.js';
import type { Project, TtsRequest, TtsResult, VoiceProviderDetails } from '../../../../shared/types.js';
import type { ProjectRepository } from '../../infrastructure/database/ProjectRepository.js';
import type { MediaRepository } from '../../infrastructure/database/MediaRepository.js';
import type { TtsProvider } from './TtsProvider.js';

const wavProviders = new Set(['windows-sapi', 'chatterbox-multilingual-v3']);
const extensionFor = (providerId: string) => wavProviders.has(providerId) ? 'wav' : 'mp3';
const mimeFor = (providerId: string) => wavProviders.has(providerId) ? 'audio/wav' : 'audio/mpeg';

export class TtsService {
  constructor(private readonly projects: ProjectRepository, private readonly media: MediaRepository, private readonly providers: Map<string, TtsProvider>, private readonly storagePath: () => string) {}
  private provider(providerId: string): TtsProvider { const provider = this.providers.get(providerId); if (!provider) throw new Error('Seçilen ses sağlayıcısı bulunamadı. Otomatik olarak başka bir motora geçilmedi.'); return provider; }
  private reference(): string | undefined { return this.media.list('reference-voice')[0]?.path; }
  async details(publicInfo: (provider: TtsProvider) => Omit<VoiceProviderDetails, 'voices' | 'supportsSpeed' | 'supportsPitch'>): Promise<VoiceProviderDetails[]> {
    return Promise.all([...this.providers.values()].map(async (provider) => { try { return { ...publicInfo(provider), voices: await provider.voices(), supportsSpeed: provider.supportsSpeed, supportsPitch: provider.supportsPitch }; } catch { return { ...publicInfo(provider), voices: [], supportsSpeed: provider.supportsSpeed, supportsPitch: provider.supportsPitch }; } }));
  }
  async preview(request: TtsRequest): Promise<TtsResult> {
    const provider = this.provider(request.selection.providerId); const directory = join(this.storagePath(), 'previews'); await mkdir(directory, { recursive: true });
    const path = join(directory, `ses-onizleme-${Date.now()}.${extensionFor(provider.id)}`);
    const ttsText = normalizeTurkishForTts(request.text);
    const result = await provider.synthesize({ ...request, text: ttsText, referenceVoicePath: this.reference() }, path); const info = await stat(path);
    this.media.upsertByPath({ kind: 'narration', name: 'Ses önizlemesi', path, mimeType: mimeFor(provider.id), size: info.size, duration: result.duration });
    return { ...result, path, providerId: provider.id, ttsText };
  }
  async generateProject(projectId: string): Promise<Project> {
    const project = this.projects.get(projectId); if (!project.scenes.length) throw new Error('Seslendirilecek sahne bulunamadı.');
    const provider = this.provider(project.voice.providerId); const directory = join(this.storagePath(), 'projects', project.id, 'narration'); await mkdir(directory, { recursive: true });
    for (const scene of project.scenes) {
      if (!scene.narration.trim()) continue;
      const path = join(directory, `${scene.id}-${provider.id}-${Date.now()}.${extensionFor(provider.id)}`);
      try {
        scene.ttsText = normalizeTurkishForTts(scene.narration);
        const result = await provider.synthesize({ text: scene.ttsText, selection: project.voice, referenceVoicePath: this.reference() }, path);
        scene.ttsEngine = result.engine;
        scene.narrationPath = path; scene.narrationDuration = result.duration;
        // Sahne süresi TAM KAREYE (yukarı) oturtulur. Önceki kod süreyi 3 ondalığa
        // yuvarlıyordu (ör. 8.457 s = 253.71 kare). Kare ızgarasında olmayan bu
        // değerler toplandığında (8.457 + 9.237 + 8.457 = 26.151 s = 784.53 kare)
        // dışa aktarım `ceil` ile 785 kare beklerken yalnızca 784 tam kare
        // üretilebiliyordu → Windows'ta "785/786 kare" hatası (CI 43267875513).
        // Kare ızgarasına yukarı yuvarlamak hem anlatımın kesilmemesini hem de
        // toplam kare sayısının tam sayı olmasını garanti eder.
        // Ölçülen anlatım süresi milisaniyeye yuvarlanmış olabilir; kare ızgarasına
        // yukarı yuvarlarken bu yuvarlama payı (1 ms) eklenir ki sahne hiçbir zaman
        // anlatımdan kısa kalmasın (10.733 s anlatım → 10.733 s sahne hatası).
        const measuredNarration = result.duration + .22 + .001;
        scene.duration = Math.max(1, Math.ceil(measuredNarration * FRAME_RATE) / FRAME_RATE);
        scene.subtitleTiming = result.timingMode; (scene as typeof scene & { alignedCues?: unknown }).alignedCues = result.cues;
        const info = await stat(path); this.media.upsertByPath({ kind: 'narration', name: `${project.name} · Sahne ${scene.number}`, path, mimeType: mimeFor(provider.id), size: info.size, duration: result.duration, projectId: project.id });
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
