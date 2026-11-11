import { execFile } from 'node:child_process';
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import type { Writable } from 'node:stream';
import sharp from 'sharp';
import { sanitizeFilename } from '../../../../shared/utils.js';
import { buildPlaybackTimeline, exportTransitionKind, FRAME_RATE, FIRST_SCENE_FADE_SECONDS, outgoingTransitionSeconds, snapToFrame } from '../../../../shared/playback.js';
import type { AppSettings, ChannelIdentity, ExportProgress, ExportRecord, Scene } from '../../../../shared/types.js';
import { DEFAULT_IDENTITY } from '../../../../shared/defaults.js';
import { renderAnimatedSceneSvg } from '../../../../shared/visuals/sceneAnimation.js';
import type { ProjectRepository } from '../../infrastructure/database/ProjectRepository.js';
import type { ExportRepository } from '../../infrastructure/database/ExportRepository.js';
import type { FFmpegService } from '../../infrastructure/FFmpegService.js';
import type { Logger } from '../../infrastructure/Logger.js';
import { AudioService } from '../audio/AudioService.js';
import { SubtitleService } from '../subtitle/SubtitleService.js';

interface Preset { width: number; height: number; crf: number; preset: string; bitrate: string }
function writeFrame(stdin: Writable, frame: Buffer, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('İşlem iptal edildi.', 'AbortError')); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    stdin.write(frame, (error) => { cleanup(); if (error) reject(error); else resolve(); });
  });
}

sharp.cache({ memory: 32, files: 0, items: 20 });

const execFileAsync = promisify(execFile);

const PRESETS: Record<AppSettings['exportPreset'], Preset> = {
  draft: { width: 540, height: 960, crf: 26, preset: 'ultrafast', bitrate: '128k' },
  standard: { width: 1080, height: 1920, crf: 22, preset: 'veryfast', bitrate: '192k' },
  quality: { width: 1080, height: 1920, crf: 19, preset: 'medium', bitrate: '256k' },
};

export class RenderService {
  private controllers = new Map<string, AbortController>();
  constructor(private readonly projects: ProjectRepository, private readonly exports: ExportRepository, private readonly ffmpeg: FFmpegService, private readonly audio: AudioService, private readonly subtitles: SubtitleService, private readonly settings: () => AppSettings, private readonly onProgress: (progress: ExportProgress) => void, private readonly logger: Logger, private readonly identity: () => ChannelIdentity = () => DEFAULT_IDENTITY) {}

  async start(projectId: string): Promise<ExportRecord> {
    const project = this.projects.get(projectId); if (!project.scenes.length) throw new Error('Dışa aktarılacak sahne yok.');
    const missing = project.scenes.filter((scene) => !scene.assetPath && (scene.assetType !== 'procedural' || scene.animation?.enabled === false)); if (missing.length) throw new Error(`Sahne ${missing.map((s) => s.number).join(', ')} için görsel bulunmuyor.`);
    if ([...this.controllers.values()].length && [...this.controllers.keys()].some((key) => key.endsWith(projectId))) throw new Error('Bu proje zaten dışa aktarılıyor.');
    const config = this.settings(); await mkdir(config.outputPath, { recursive: true });
    const outputPath = join(config.outputPath, `${sanitizeFilename(project.name)}-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}.mp4`);
    const record = this.exports.create(project.id, project.name, outputPath, config.exportPreset);
    const controller = new AbortController(); this.controllers.set(`${record.id}:${projectId}`, controller);
    project.status = 'rendering'; this.projects.update(project); this.exports.update(record.id, { status: 'rendering' });
    void this.execute(record.id, controller).catch((error) => this.logger.error('Render işlemi', error)).finally(() => this.controllers.delete(`${record.id}:${projectId}`));
    return this.exports.get(record.id);
  }

  /**
   * İki video parçasını çapraz sönümle birleştirir: A*(1-t)+B*t.
   *
   * Kareler ZAMANLA değil KARE NUMARASIYLA kesilir. `trim=start:end` saniye
   * tabanlı olduğunda yarım kalan kareler düşüyor ve 21 saniyelik kurgu 20.9
   * saniyeye iniyordu (ölçüldü: 627/630 kare). `trim=start_frame:end_frame`
   * + `setpts=PTS-STARTPTS` her parçayı tam kare sayısıyla üretir (ölçüldü: 630).
   */
  private async concatWithCrossfade(exportId: string, left: string, right: string, crossfade: number, boundary: number, stage: string, signal: AbortSignal): Promise<void> {
    // Sert kesmede (pencere 0) bindirme yoktur: soldaki parça sınıra kadar, sağdaki
    // parça tamamen eklenir. 1 karelik yapay pencere bir kareyi yutuyordu (629/630).
    const windowFrames = Math.max(0, Math.round(snapToFrame(crossfade) * FRAME_RATE));
    const boundaryFrames = Math.round(snapToFrame(Math.max(0, boundary)) * FRAME_RATE);
    // setpts=PTS-STARTPTS ölçülerek seçildi: N/(30*TB) biçimi bir kare kaybediyordu.
    const pts = 'setpts=PTS-STARTPTS';
    const filter = windowFrames === 0
      ? `[0:v]trim=start_frame=0:end_frame=${boundaryFrames},${pts},format=yuv420p[pre];[1:v]${pts},format=yuv420p[rest];[pre][rest]concat=n=2:v=1:a=0[out]`
      : [
        `[0:v]trim=start_frame=0:end_frame=${boundaryFrames},${pts},format=yuv420p[pre]`,
        `[0:v]trim=start_frame=${boundaryFrames}:end_frame=${boundaryFrames + windowFrames},${pts},format=yuv420p[tail]`,
        `[1:v]trim=start_frame=0:end_frame=${windowFrames},${pts},format=yuv420p[head]`,
        `[tail][head]blend=all_expr='A*(1-(N/${windowFrames}))+B*(N/${windowFrames})',format=yuv420p[blended]`,
        `[1:v]trim=start_frame=${windowFrames},${pts},format=yuv420p[rest]`,
        '[pre][blended][rest]concat=n=3:v=1:a=0[out]',
      ].join(';');
    this.logger.info(`Geçiş filtresi: ${filter}`);
    await this.ffmpeg.run(`${exportId}-mix`, ['-i', left, '-i', right, '-filter_complex', filter, '-map', '[out]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', stage], { signal });
    // Birleştirme kare kaybederse sessizce devam etmek yok. Beklenen toplam:
    // soldaki parçanın kesme noktasına kadarki kareleri + sağdaki parçanın TAMAMI
    // (pencere sağdan alınır, kalan kısmı ayrıca eklenir).
    const countFrames = async (file: string) => {
      const probe = JSON.parse((await execFileAsync(this.ffmpeg.ffprobePath, ['-v', 'error', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'json', file])).stdout) as { streams?: Array<{ nb_read_frames?: string }> };
      return Number(probe.streams?.[0]?.nb_read_frames || 0);
    };
    const frames = await countFrames(stage);
    const expected = boundaryFrames + await countFrames(right);
    this.logger.info(`Geçiş sonucu: ${frames} kare (beklenen ${expected}); pencere ${windowFrames} kesme ${boundaryFrames}`);
    if (frames !== expected) throw new Error(`Geçiş birleştirmesi kare kaybetti: ${frames} / ${expected} (kesme ${boundary}s, pencere ${crossfade}s).`);
  }

  /** xfade bulunmayan FFmpeg için sahne parçalarını sırayla çapraz karışımla birleştirir. */
  private async crossfadeWithoutXfade(exportId: string, segments: string[], scenes: Scene[], timeline: { starts: number[] }, outputPath: string, signal: AbortSignal, record: ExportRecord): Promise<void> {
    const work = dirname(outputPath); let current = segments[0];
    for (let index = 1; index < segments.length; index += 1) {
      if (signal.aborted) throw new DOMException('İptal edildi', 'AbortError');
      // Sert kesme = pencere yok; aşağıdaki birleştirme iki yönlü concat dalını kullanır.
      const crossfade = outgoingTransitionSeconds(timeline as never, index - 1);
      const stage = join(work, `mix-${index}.mp4`);
      await this.concatWithCrossfade(`${exportId}-mix-${index}`, current, segments[index], crossfade, timeline.starts[index], stage, signal);
      current = stage;
      this.report(record, 56 + index / segments.length * 10, `Geçiş ${index}/${segments.length - 1} çapraz karışımla birleştiriliyor`);
    }
    await copyFile(current, outputPath);
  }

  private report(record: ExportRecord, progress: number, stage: string): void {
    const normalized = Math.max(0, Math.min(100, Math.round(progress))); if (normalized % 2 === 0 || normalized >= 99) this.exports.update(record.id, { progress: normalized });
    this.onProgress({ exportId: record.id, projectId: record.projectId, progress: normalized, stage });
  }

  private async execute(exportId: string, controller: AbortController): Promise<void> {
    let record = this.exports.get(exportId); const project = this.projects.get(record.projectId); const config = this.settings(); const preset = PRESETS[record.preset as AppSettings['exportPreset']] || PRESETS.standard;
    const work = join(config.storagePath, 'renders', exportId); await mkdir(work, { recursive: true });
    try {
      // Önizleme ile aynı zaman modeli: geçiş süreleri tek kaynaktan gelir.
      const timeline = buildPlaybackTimeline(project.scenes); const starts = timeline.starts; const duration = timeline.duration; const segments: string[] = []; const supportsXfade = await this.ffmpeg.hasFilter('xfade');
      for (let index = 0; index < project.scenes.length; index += 1) {
        if (controller.signal.aborted) throw new DOMException('İptal edildi', 'AbortError');
        const scene = project.scenes[index]; const path = join(work, `scene-${String(index).padStart(2, '0')}.mp4`); const isLast = index === project.scenes.length - 1;
        // Geçiş penceresi xfade'e BAĞLI DEĞİL: xfade yoksa aynı pencere blend tabanlı
        // birleştirmede kullanılır. Bu yüzden her sahne parçası, gelen geçişin
        // penceresi kadar FAZLA render edilir; aksi hâlde birleştirme için
        // bindirilecek kare kalmaz ve toplam süre kısalır.
        const nextTransition = !isLast ? outgoingTransitionSeconds(timeline, index) : 0; const segmentDuration = scene.duration + nextTransition;
        const proceduralAnimation = scene.assetType === 'procedural' && scene.animation?.enabled !== false;
        const frames = Math.max(1, Math.ceil(segmentDuration * 30));
        const args: string[] = [];
        let filter: string;
        if (proceduralAnimation) {
          args.push('-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${preset.width}x${preset.height}`, '-framerate', '30', '-i', 'pipe:0');
          filter = 'format=yuv420p';
        } else {
          args.push('-i', scene.assetPath!);
          if (scene.assetType === 'video') {
            filter = `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=increase,crop=${preset.width}:${preset.height},fps=30,format=yuv420p`;
          } else {
            const movement = scene.cameraMovement;
            const z = movement === 'zoom-out' ? `max(1.07-on*0.00028,1.0)` : `min(1.0+on*0.00028,1.07)`;
            const x = movement === 'pan-left' ? `(iw-iw/zoom)*(1-on/${frames})` : movement === 'pan-right' ? `(iw-iw/zoom)*on/${frames}` : `iw/2-(iw/zoom/2)`;
            const y = `ih/2-(ih/zoom/2)`;
            filter = `scale=${Math.round(preset.width * 1.15)}:${Math.round(preset.height * 1.15)}:force_original_aspect_ratio=increase,crop=${Math.round(preset.width * 1.15)}:${Math.round(preset.height * 1.15)},zoompan=z='${movement === 'static' ? '1.0' : z}':x='${x}':y='${y}':d=${frames}:s=${preset.width}x${preset.height}:fps=30,format=yuv420p`;
          }
        }
        if (index === 0 && scene.transition !== 'none') filter += `,fade=t=in:st=0:d=${Math.min(FIRST_SCENE_FADE_SECONDS, scene.duration / 3)}`;
        // xfade yoksa geçişler karartma ile DEĞİL, aşağıdaki blend tabanlı
        // çapraz karışımla yapılır; burada ek fade eklenirse siyah kare oluşur.
        args.push('-vf', filter);
        // Raw frames already have an exact count. An additional -t can truncate
        // the overlap frame required by xfade at the segment boundary.
        if (!proceduralAnimation) args.push('-t', String(segmentDuration));
        args.push('-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-threads', '2');
        if (proceduralAnimation) args.push('-frames:v', String(frames));
        args.push(path);
        if (proceduralAnimation) {
          const identity = { ...this.identity(), ...project.brand };
          await this.ffmpeg.runWithInput(`${exportId}-scene-${index}`, args, async (stdin) => {
            for (let frame = 0; frame < frames; frame += 1) {
              if (controller.signal.aborted) throw new DOMException('İptal edildi', 'AbortError');
              const svg = renderAnimatedSceneSvg(project, scene, identity, frame / 30);
              const pixels = await sharp(Buffer.from(svg), { density: 72 }).resize(preset.width, preset.height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
              if (controller.signal.aborted) throw new DOMException('İptal edildi', 'AbortError');
              await writeFrame(stdin, pixels, controller.signal);
              if (frame % 6 === 0 || frame === frames - 1) this.report(record, 5 + (index + (frame + 1) / frames) / project.scenes.length * 48, `Sahne ${index + 1}/${project.scenes.length} gerçek animasyon kareleri işleniyor`);
            }
            stdin.end();
          }, { signal: controller.signal });
        } else {
          await this.ffmpeg.run(`${exportId}-scene-${index}`, args, { signal: controller.signal, onProgress: (seconds) => this.report(record, 5 + (index + Math.min(1, seconds / segmentDuration)) / project.scenes.length * 48, `Sahne ${index + 1}/${project.scenes.length} işleniyor`) });
        }
        if (process.env.NEDENMIS_RENDER_DEBUG === '1') { const piece = await this.ffmpeg.probe(path); this.logger.info(`Sahne parçası ${index}: ${piece.frames} kare / ${piece.duration}s (beklenen ${Math.ceil(segmentDuration * 30)})`); }
        segments.push(path);
      }
      if (controller.signal.aborted) throw new DOMException('İptal edildi', 'AbortError');
      const visualPath = join(work, 'visual.mp4'); this.report(record, 56, 'Geçişler birleştiriliyor');
      if (segments.length === 1) await this.ffmpeg.run(`${exportId}-visual`, ['-i', segments[0], '-c', 'copy', visualPath], { signal: controller.signal });
      else {
        // xfade zinciri: her sahne parçası kendi süresi + gelen geçiş süresi kadar
        // render edilir; xfade `offset` geçişin kurgu içindeki başlangıcıdır.
        // xfade yoksa aynı çapraz sönüm `blend` tabanlı birleştirmeyle kurulur —
        // asla `fade=t=out/in` ile, çünkü o siyah kare üretir.
        if (!supportsXfade) {
          await this.crossfadeWithoutXfade(exportId, segments, project.scenes, timeline, visualPath, controller.signal, record);
        } else {
          const args: string[] = []; for (const segment of segments) args.push('-i', segment); const filters: string[] = [];
          // Windows FFmpeg builds can otherwise terminate chained xfade after the
          // first segment when MP4 time bases/start timestamps differ.
          segments.forEach((_, index) => filters.push(`[${index}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v${index}]`));
          for (let index = 1; index < segments.length; index += 1) {
            const scene = project.scenes[index];
            const input = index === 1 ? '[v0]' : `[vx${index - 1}]`; const output = `[vx${index}]`;
            // Sert kesmede xfade KULLANILMAZ: `duration=0.01` (yarım kare) bir xfade
            // zinciri Windows FFmpeg'inde geçiş noktasından sonrasını üretmez ve
            // dışa aktarım 495/630 karede kalır. Kesme için `concat` doğru araç:
            // bindirme yok, kare kaybı yok, siyah kare yok.
            if (scene.transition === 'none') {
              // concat çıktısı bir sonraki xfade için ortak zaman tabanına geri alınır.
              filters.push(`${input}[v${index}]concat=n=2:v=1:a=0,settb=AVTB,setpts=PTS-STARTPTS,fps=30${output}`);
              continue;
            }
            const crossfade = outgoingTransitionSeconds(timeline, index - 1);
            // Kaydırma dışındaki her geçiş xfade'in doğrusal `fade` karışımıdır
            // (bkz. exportTransitionKind): ne siyah kare ne de gürültülü `dissolve`.
            const kind = exportTransitionKind(scene.transition);
            filters.push(`${input}[v${index}]xfade=transition=${kind}:duration=${crossfade}:offset=${starts[index].toFixed(6)}${output}`);
          }
          args.push('-filter_complex', filters.join(';'), '-map', `[vx${segments.length - 1}]`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', visualPath);
          await this.ffmpeg.run(`${exportId}-visual`, args, { signal: controller.signal, onProgress: (seconds) => this.report(record, 56 + Math.min(10, seconds / duration * 10), 'Sahne geçişleri işleniyor') });
        }
      }
      // Teşhis: geçiş birleştirmesinden çıkan video beklenen kare sayısını taşımalı.
      const visualProbe = await this.ffmpeg.probe(visualPath);
      this.logger.info(`Geçiş sonrası video: ${visualProbe.frames ?? '?'} kare, ${visualProbe.duration}s (beklenen ${Math.ceil(duration * 30)} kare, ${duration}s)`);
      this.report(record, 68, 'Ses kanalları miksajlanıyor'); const audioPath = join(work, 'mix.m4a');
      await this.audio.mix(`${exportId}-audio`, { narration: project.scenes.filter((scene) => scene.narrationPath).map((scene) => ({ path: scene.narrationPath!, start: starts[project.scenes.indexOf(scene)], volume: project.audio.narrationVolume })), music: project.audio.musicClips, sfx: project.audio.sfxClips, musicVolume: project.audio.musicVolume, sfxVolume: project.audio.sfxVolume, duration, ducking: project.audio.musicDucking }, audioPath);
      this.report(record, 78, 'Altyazılar ve video birleştiriliyor'); const assPath = join(work, 'subtitles.ass'); await this.subtitles.write(project, assPath);
      await this.ffmpeg.run(`${exportId}-final`, ['-i', visualPath, '-i', audioPath, '-vf', this.subtitles.filterArgument(assPath), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', preset.preset, '-crf', String(preset.crf), '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', preset.bitrate, '-ar', '48000', '-movflags', '+faststart', '-t', String(duration), record.outputPath], { signal: controller.signal, onProgress: (seconds) => this.report(record, 78 + Math.min(21, seconds / duration * 21), 'MP4 kodlanıyor') });
      const expectedFrames = Math.max(1, Math.ceil(duration * 30 - 1e-9));
      const completedVideo = await this.ffmpeg.probe(record.outputPath);
      if (completedVideo.frames !== expectedFrames) throw new Error(`MP4 kare doğrulaması başarısız: ${completedVideo.frames ?? 'bilinmiyor'} / ${expectedFrames}. Export tamamlandı olarak işaretlenmedi.`);
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
