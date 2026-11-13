import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import type { Writable } from 'node:stream';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

const execFileAsync = promisify(execFile);
const nodeRequire = createRequire(import.meta.url);
export interface FFmpegRunOptions { onProgress?: (ratio: number, line: string) => void; signal?: AbortSignal }

export class FFmpegService {
  private active = new Map<string, ChildProcess>();
  private filterCache = new Map<string, boolean>();
  constructor(private customPath: () => string | undefined) {}
  private unpacked(path: string): string { const unpacked = path.replace('app.asar', 'app.asar.unpacked'); return existsSync(unpacked) ? unpacked : path; }
  get ffmpegPath(): string {
    const custom = this.customPath(); if (custom && existsSync(custom)) return custom;
    try { const value = nodeRequire('ffmpeg-static') as string | { default: string }; const path = typeof value === 'string' ? value : value.default; if (path && existsSync(this.unpacked(path))) return this.unpacked(path); } catch { /* npm isteğe bağlı binary indirilememişse yerel yedek kullanılır. */ }
    return this.unpacked(ffmpegInstaller.path);
  }
  get ffprobePath(): string {
    try { const value = nodeRequire('ffprobe-static') as { path: string }; if (value.path && existsSync(this.unpacked(value.path))) return this.unpacked(value.path); } catch { /* Yerel ffprobe yedeği kullanılır. */ }
    return this.unpacked(ffprobeInstaller.path);
  }
  async hasFilter(name: string): Promise<boolean> {
    const key = `${this.ffmpegPath}:${name}`; if (this.filterCache.has(key)) return this.filterCache.get(key)!;
    try { const { stdout, stderr } = await execFileAsync(this.ffmpegPath, ['-hide_banner', '-filters'], { timeout: 10000, maxBuffer: 5 * 1024 * 1024 }); const supported = new RegExp(`\\s${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s`).test(`${stdout}\n${stderr}`); this.filterCache.set(key, supported); return supported; } catch { return false; }
  }
  async version(): Promise<string> { const { stdout } = await execFileAsync(this.ffmpegPath, ['-version'], { timeout: 10000 }); return stdout.split('\n')[0]; }
  async probe(filePath: string): Promise<{ duration: number; width?: number; height?: number; codec?: string; sampleRate?: number; channels?: number; frames?: number; videoDuration?: number }> {
    const { stdout } = await execFileAsync(this.ffprobePath, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name,sample_rate,channels,nb_frames,duration', '-of', 'json', filePath], { timeout: 20000, maxBuffer: 5 * 1024 * 1024 });
    const data = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ width?: number; height?: number; codec_name?: string; sample_rate?: string; channels?: number; nb_frames?: string; duration?: string }> };
    const first = data.streams?.[0];
    return { duration: Number(data.format?.duration || 0), width: first?.width, height: first?.height, codec: first?.codec_name, sampleRate: Number(first?.sample_rate || 0) || undefined, channels: first?.channels, frames: Number(first?.nb_frames) || undefined, videoDuration: Number(first?.duration) || undefined };
  }
  /** Dosyadaki GERÇEK kare sayısı. `nb_frames` MP4'te güvenilmez/boş olabilir. */
  async countFrames(filePath: string): Promise<number> {
    try {
      const { stdout } = await execFileAsync(this.ffprobePath, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'json', filePath], { timeout: 60000, maxBuffer: 5 * 1024 * 1024 });
      const data = JSON.parse(stdout) as { streams?: Array<{ nb_read_frames?: string }> };
      return Number(data.streams?.[0]?.nb_read_frames || 0);
    } catch { return 0; }
  }
  run(jobId: string, args: string[], options: FFmpegRunOptions = {}): Promise<void> {
    return this.execute(jobId, args, options);
  }
  runWithInput(jobId: string, args: string[], input: (stdin: Writable) => Promise<void>, options: FFmpegRunOptions = {}): Promise<void> {
    return this.execute(jobId, args, options, input);
  }
  private execute(jobId: string, args: string[], options: FFmpegRunOptions, input?: (stdin: Writable) => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ffmpegPath, ['-hide_banner', '-y', ...args], { windowsHide: true });
      this.active.set(jobId, child); let stderr = ''; let finalLine = ''; let inputError: Error | undefined;
      let inputFinished: Promise<void> | undefined;
      const abort = () => { child.kill('SIGKILL'); }; if (options.signal) { if (options.signal.aborted) abort(); else options.signal.addEventListener('abort', abort, { once: true }); }
      if (input) {
        child.stdin.on('error', (error) => { if (!options.signal?.aborted) inputError = error; });
        inputFinished = input(child.stdin).catch((error: unknown) => {
          inputError = error instanceof Error ? error : new Error(String(error));
          if (!options.signal?.aborted) child.kill('SIGKILL');
        });
      }
      child.stderr.on('data', (chunk: Buffer) => { const text = chunk.toString(); stderr = `${stderr}${text}`.slice(-40000); finalLine = text.trim().split('\n').pop() || ''; const matches = [...text.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)]; if (matches.length && options.onProgress) { const last = matches.at(-1)!; const seconds = Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]); options.onProgress(seconds, finalLine); } });
      child.on('error', (error) => { this.active.delete(jobId); reject(new Error(`FFmpeg başlatılamadı: ${error.message}`)); });
      child.on('close', (code) => {
        void (async () => {
          await inputFinished;
          this.active.delete(jobId); options.signal?.removeEventListener('abort', abort);
          if (options.signal?.aborted) reject(new DOMException('İşlem iptal edildi.', 'AbortError'));
          else if (inputError) reject(new Error(`FFmpeg girdi akışı başarısız: ${inputError.message}`));
          else if (code === 0) resolve();
          else reject(new Error(`FFmpeg ${code} koduyla kapandı.\n${stderr.split('\n').slice(-12).join('\n')}`));
        })();
      });
    });
  }
  cancel(jobId: string): void { const child = this.active.get(jobId); if (child) child.kill('SIGKILL'); }
  cancelAll(): void { for (const child of this.active.values()) child.kill('SIGKILL'); this.active.clear(); }
}
