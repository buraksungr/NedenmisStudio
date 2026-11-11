import { copyFile, mkdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { id, sanitizeFilename } from '../../../../shared/utils.js';
import type { AudioClip, MediaItem, MediaKind, Project } from '../../../../shared/types.js';
import type { MediaRepository } from '../../infrastructure/database/MediaRepository.js';
import type { ProjectRepository } from '../../infrastructure/database/ProjectRepository.js';
import type { FFmpegService } from '../../infrastructure/FFmpegService.js';

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg' };

export class MediaService {
  constructor(private readonly media: MediaRepository, private readonly projects: ProjectRepository, private readonly ffmpeg: FFmpegService, private readonly storagePath: () => string) {}
  list(kind?: MediaKind): MediaItem[] { return this.media.list(kind); }
  async import(paths: string[], kind: MediaKind): Promise<MediaItem[]> {
    const imported: MediaItem[] = [];
    for (const source of paths) {
      if (kind === 'reference-voice') { imported.push(await this.importReference(source)); continue; }
      const extension = extname(source).toLowerCase(); if (!MIME[extension]) throw new Error(`Desteklenmeyen dosya türü: ${extension || 'bilinmiyor'}`);
      const directory = join(this.storagePath(), 'media', kind); await mkdir(directory, { recursive: true });
      const target = join(directory, `${Date.now()}-${id('file').slice(-6)}-${sanitizeFilename(basename(source))}`); await copyFile(source, target);
      const info = await stat(target); let duration: number | undefined;
      if (['music', 'sfx', 'narration', 'video'].includes(kind)) { try { duration = (await this.ffmpeg.probe(target)).duration; } catch { duration = undefined; } }
      imported.push(this.media.upsertByPath({ kind, name: basename(source), path: target, mimeType: MIME[extension], size: info.size, duration }));
    }
    return imported;
  }
  async importReference(source: string): Promise<MediaItem> {
    // FLAC de kabul edilir: referans ses her durumda 24 kHz mono PCM WAV'a çevrilir,
    // kayıpsız kaynak (ör. resmî Türkçe V3 referansı) yeniden kodlanmadan korunur.
    if (!['.wav', '.mp3', '.m4a', '.flac'].includes(extname(source).toLowerCase())) throw new Error('Referans ses WAV, MP3, M4A veya FLAC olmalıdır.');
    if (!existsSync(source)) throw new Error('Seçilen referans ses dosyası bulunamadı.');
    const directory = join(this.storagePath(), 'assets'); await mkdir(directory, { recursive: true }); const target = join(directory, 'reference_voice.wav'); const temporary = join(directory, `reference_voice-${Date.now()}.wav`);
    try {
      await this.ffmpeg.run(`reference-${Date.now()}`, ['-i', source, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', temporary]);
      const probe = await this.ffmpeg.probe(temporary); if (!Number.isFinite(probe.duration) || probe.duration < 3) throw new Error('Referans kayıt en az 3 saniye olmalı. Temiz konuşma içeren 8–15 saniyelik bir kayıt önerilir.');
      await copyFile(temporary, target); const info = await stat(target);
      return this.media.upsertByPath({ kind: 'reference-voice', name: 'Nedenmiş referans sesi', path: target, mimeType: 'audio/wav', size: info.size, duration: probe.duration });
    } finally { await unlink(temporary).catch(() => undefined); }
  }
  async remove(mediaId: string): Promise<void> {
    const item = this.media.get(mediaId); const used = this.projects.list().some((project) => project.scenes.some((scene) => scene.assetPath === item.path || scene.narrationPath === item.path) || [...project.audio.musicClips, ...project.audio.sfxClips].some((clip) => clip.path === item.path));
    if (used) throw new Error('Bu medya bir projede kullanılıyor. Önce ilgili sahneden veya zaman çizelgesinden kaldırın.');
    this.media.remove(mediaId);
    const rel = relative(resolve(this.storagePath()), resolve(item.path)); if (!rel.startsWith('..') && !rel.includes(':\\')) await unlink(item.path).catch(() => undefined);
  }
  async addToTimeline(projectId: string, mediaId: string, start: number): Promise<Project> {
    const project = this.projects.get(projectId); const item = this.media.get(mediaId); if (!['music', 'sfx'].includes(item.kind)) throw new Error('Yalnızca müzik ve ses efektleri ses zaman çizelgesine eklenebilir.');
    const kind = item.kind as 'music' | 'sfx'; const clip: AudioClip = { id: id('audio'), mediaId: item.id, kind, name: item.name, path: item.path, start: Math.max(0, start), duration: Math.max(.2, item.duration || 5), trimStart: 0, volume: 1, fadeIn: kind === 'music' ? 1.5 : 0, fadeOut: kind === 'music' ? 2 : 0 };
    if (kind === 'music') project.audio.musicClips.push(clip); else project.audio.sfxClips.push(clip); return this.projects.update(project);
  }
}
