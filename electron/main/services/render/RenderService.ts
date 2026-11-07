import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sceneStartTimes, sanitizeFilename, totalDuration } from '../../../../shared/utils.js';
import type { AppSettings, ExportProgress, ExportRecord } from '../../../../shared/types.js';
import type { ProjectRepository } from '../../infrastructure/database/ProjectRepository.js';
import type { ExportRepository } from '../../infrastructure/database/ExportRepository.js';
import type { FFmpegService } from '../../infrastructure/FFmpegService.js';
import type { Logger } from '../../infrastructure/Logger.js';
import { AudioService } from '../audio/AudioService.js';
import { SubtitleService } from '../subtitle/SubtitleService.js';

interface Preset { width: number; height: number; crf: number; preset: string; bitrate: string }
const PRESETS: Record<AppSettings['exportPreset'], Preset> = {
  draft: { width: 540, height: 960, crf: 26, preset: 'ultrafast', bitrate: '128k' },
  standard: { width: 1080, height: 1920, crf: 22, preset: 'veryfast', bitrate: '192k' },
  quality: { width: 1080, height: 1920, crf: 19, preset: 'medium', bitrate: '256k' },
};

export class RenderService {
  private controllers = new Map<string, AbortController>();
  constructor(private readonly projects: ProjectRepository, private readonly exports: ExportRepository, private readonly ffmpeg: FFmpegService, private readonly audio: AudioService, private readonly subtitles: SubtitleService, private readonly settings: () => AppSettings, private readonly onProgress: (progress: ExportProgress) => void, private readonly logger: Logger) {}

  async start(projectId: string): Promise<ExportRecord> {
    const project = this.projects.get(projectId); if (!project.scenes.length) throw new Error('Dışa aktarılacak sahne yok.');
    const missing = project.scenes.filter((scene) => !scene.assetPath); if (missing.length) throw new Error(`Sahne ${missing.map((s) => s.number).join(', ')} için görsel bulunmuyor.`);
    if ([...this.controllers.values()].length && [...this.controllers.keys()].some((key) => key.endsWith(projectId))) throw new Error('Bu proje zaten dışa aktarılıyor.');
    const config = this.settings(); await mkdir(config.outputPath, { recursive: true });
    const outputPath = join(config.outputPath, `${sanitizeFilename(project.name)}-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}.mp4`);
    const record = this.exports.create(project.id, project.name, outputPath, config.exportPreset);
    const controller = new AbortController(); this.controllers.set(`${record.id}:${projectId}`, controller);
    project.status = 'rendering'; this.projects.update(project); this.exports.update(record.id, { status: 'rendering' });
    void this.execute(record.id, controller).catch((error) => this.logger.error('Render işlemi', error)).finally(() => this.controllers.delete(`${record.id}:${projectId}`));
    return this.exports.get(record.id);
  }

  private report(record: ExportRecord, progress: number, stage: string): void {
    const normalized = Math.max(0, Math.min(100, Math.round(progress))); if (normalized % 2 === 0 || normalized >= 99) this.exports.update(record.id, { progress: normalized });
    this.onProgress({ exportId: record.id, projectId: record.projectId, progress: normalized, stage });
  }

  private async execute(exportId: string, controller: AbortController): Promise<void> {
    let record = this.exports.get(exportId); const project = this.projects.get(record.projectId); const config = this.settings(); const preset = PRESETS[record.preset as AppSettings['exportPreset']] || PRESETS.standard;
    const work = join(config.storagePath, 'renders', exportId); await mkdir(work, { recursive: true });
    try {
      const starts = sceneStartTimes(project.scenes); const segments: string[] = []; const transition = .32; const supportsXfade = await this.ffmpeg.hasFilter('xfade');
      for (let index = 0; index < project.scenes.length; index += 1) {
        if (controller.signal.aborted) throw new DOMException('İptal edildi', 'AbortError');
        const scene = project.scenes[index]; const path = join(work, `scene-${String(index).padStart(2, '0')}.mp4`); const isLast = index === project.scenes.length - 1;
        const nextTransition = !isLast && supportsXfade ? (project.scenes[index + 1].transition !== 'none' ? transition : .01) : 0; const duration = scene.duration + nextTransition;
        const args: string[] = [];
        if (scene.assetType === 'video') args.push('-i', scene.assetPath!); else args.push('-i', scene.assetPath!);
        let filter: string;
        if (scene.assetType === 'video') {
          filter = `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=increase,crop=${preset.width}:${preset.height},fps=30,format=yuv420p`;
          if (index === 0 && scene.transition !== 'none') filter += `,fade=t=in:st=0:d=${Math.min(.5, scene.duration / 3)}`;
        } else {
          const frames = Math.max(1, Math.ceil(duration * 30)); const movement = scene.cameraMovement;
          const z = movement === 'zoom-out' ? `max(1.07-on*0.00028,1.0)` : `min(1.0+on*0.00028,1.07)`;
          const x = movement === 'pan-left' ? `(iw-iw/zoom)*(1-on/${frames})` : movement === 'pan-right' ? `(iw-iw/zoom)*on/${frames}` : `iw/2-(iw/zoom/2)`;
          const y = `ih/2-(ih/zoom/2)`;
          filter = `scale=${Math.round(preset.width * 1.15)}:${Math.round(preset.height * 1.15)}:force_original_aspect_ratio=increase,crop=${Math.round(preset.width * 1.15)}:${Math.round(preset.height * 1.15)},zoompan=z='${movement === 'static' ? '1.0' : z}':x='${x}':y='${y}':d=${frames}:s=${preset.width}x${preset.height}:fps=30,format=yuv420p`;
          if (index === 0 && scene.transition !== 'none') filter += `,fade=t=in:st=0:d=${Math.min(.5, scene.duration / 3)}`;
          if (!supportsXfade && index > 0 && scene.transition !== 'none') filter += ',fade=t=in:st=0:d=0.18';
          if (!supportsXfade && !isLast && project.scenes[index + 1].transition !== 'none') filter += `,fade=t=out:st=${Math.max(0, duration - .18)}:d=0.18`;
        }
        args.push('-vf', filter, '-t', String(duration), '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', path);
        await this.ffmpeg.run(`${exportId}-scene-${index}`, args, { signal: controller.signal, onProgress: (seconds) => this.report(record, 5 + (index + Math.min(1, seconds / duration)) / project.scenes.length * 48, `Sahne ${index + 1}/${project.scenes.length} işleniyor`) });
        segments.push(path);
      }
      if (controller.signal.aborted) throw new DOMException('İptal edildi', 'AbortError');
      const visualPath = join(work, 'visual.mp4'); this.report(record, 56, 'Geçişler birleştiriliyor');
      if (segments.length === 1) await this.ffmpeg.run(`${exportId}-visual`, ['-i', segments[0], '-c', 'copy', visualPath], { signal: controller.signal });
      else if (supportsXfade) {
        const args: string[] = []; for (const segment of segments) args.push('-i', segment); const filters: string[] = [];
        for (let index = 1; index < segments.length; index += 1) {
          const scene = project.scenes[index]; const kind = scene.transition === 'dissolve' ? 'dissolve' : scene.transition === 'slide' ? 'slideleft' : 'fade'; const duration = scene.transition === 'none' ? .01 : transition;
          const input = index === 1 ? '[0:v]' : `[vx${index - 1}]`; const output = index === segments.length - 1 ? '[vout]' : `[vx${index}]`;
          filters.push(`${input}[${index}:v]xfade=transition=${kind}:duration=${duration}:offset=${starts[index]}${output}`);
        }
        args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', visualPath);
        await this.ffmpeg.run(`${exportId}-visual`, args, { signal: controller.signal, onProgress: (seconds) => this.report(record, 56 + Math.min(10, seconds / totalDuration(project.scenes) * 10), 'Sahne geçişleri işleniyor') });
      } else {
        const concatPath = join(work, 'concat.txt');
        await writeFile(concatPath, segments.map((path) => `file '${path.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`).join('\n'), 'utf8');
        await this.ffmpeg.run(`${exportId}-visual`, ['-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', visualPath], { signal: controller.signal });
      }
      this.report(record, 68, 'Ses kanalları miksajlanıyor'); const audioPath = join(work, 'mix.m4a');
      await this.audio.mix(`${exportId}-audio`, { narration: project.scenes.filter((scene) => scene.narrationPath).map((scene) => ({ path: scene.narrationPath!, start: starts[project.scenes.indexOf(scene)], volume: project.audio.narrationVolume })), music: project.audio.musicClips, sfx: project.audio.sfxClips, musicVolume: project.audio.musicVolume, sfxVolume: project.audio.sfxVolume, duration: totalDuration(project.scenes), ducking: project.audio.musicDucking }, audioPath);
      this.report(record, 78, 'Altyazılar ve video birleştiriliyor'); const assPath = join(work, 'subtitles.ass'); await this.subtitles.write(project, assPath);
      await this.ffmpeg.run(`${exportId}-final`, ['-i', visualPath, '-i', audioPath, '-vf', this.subtitles.filterArgument(assPath), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', preset.preset, '-crf', String(preset.crf), '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', preset.bitrate, '-ar', '48000', '-movflags', '+faststart', '-t', String(totalDuration(project.scenes)), record.outputPath], { signal: controller.signal, onProgress: (seconds) => this.report(record, 78 + Math.min(21, seconds / totalDuration(project.scenes) * 21), 'MP4 kodlanıyor') });
      const info = await stat(record.outputPath); record = this.exports.update(exportId, { status: 'completed', progress: 100, completedAt: new Date().toISOString(), fileSize: info.size });
      const completedProject = this.projects.get(project.id); completedProject.status = 'completed'; completedProject.recoveryNote = undefined; this.projects.update(completedProject);
      this.report(record, 100, 'Dışa aktarım tamamlandı'); await rm(work, { recursive: true, force: true }); this.logger.info(`Video oluşturuldu: ${record.outputPath}`);
    } catch (error) {
      const cancelled = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError'); const message = error instanceof Error ? error.message : 'Bilinmeyen render hatası';
      this.exports.update(exportId, { status: cancelled ? 'cancelled' : 'failed', error: cancelled ? 'Kullanıcı tarafından iptal edildi.' : message, completedAt: new Date().toISOString() });
      const current = this.projects.get(project.id); current.status = 'ready'; current.recoveryNote = cancelled ? 'Dışa aktarım iptal edildi; proje değişiklikleri korundu.' : `Dışa aktarım hatası: ${message}`; this.projects.update(current);
      this.onProgress({ exportId, projectId: project.id, progress: this.exports.get(exportId).progress, stage: cancelled ? 'Dışa aktarım iptal edildi' : 'Dışa aktarım başarısız' });
      await rm(work, { recursive: true, force: true }); if (!cancelled) this.logger.error(`Dışa aktarım başarısız: ${record.outputPath}`, error);
    }
  }

  cancel(exportId: string): void {
    const entry = [...this.controllers.entries()].find(([key]) => key.startsWith(`${exportId}:`)); if (entry) { entry[1].abort(); for (const suffix of ['scene-', 'visual', 'audio', 'final']) void suffix; this.ffmpeg.cancel(`${exportId}-visual`); this.ffmpeg.cancel(`${exportId}-audio`); this.ffmpeg.cancel(`${exportId}-final`); for (let i = 0; i < 100; i += 1) this.ffmpeg.cancel(`${exportId}-scene-${i}`); }
  }
  cancelAll(): void { for (const key of this.controllers.keys()) this.cancel(key.split(':')[0]); this.ffmpeg.cancelAll(); }
}
