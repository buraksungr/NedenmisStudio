import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
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
  async probe(filePath: string): Promise<{ duration: number; width?: number; height?: number; codec?: string }> {
    const { stdout } = await execFileAsync(this.ffprobePath, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name', '-of', 'json', filePath], { timeout: 20000, maxBuffer: 5 * 1024 * 1024 });
    const data = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ width?: number; height?: number; codec_name?: string }> };
    return { duration: Number(data.format?.duration || 0), width: data.streams?.[0]?.width, height: data.streams?.[0]?.height, codec: data.streams?.[0]?.codec_name };
  }
  run(jobId: string, args: string[], options: FFmpegRunOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ffmpegPath, ['-hide_banner', '-y', ...args], { windowsHide: true });
      this.active.set(jobId, child); let stderr = ''; let finalLine = '';
      const abort = () => { child.kill('SIGKILL'); }; if (options.signal) { if (options.signal.aborted) abort(); else options.signal.addEventListener('abort', abort, { once: true }); }
      child.stderr.on('data', (chunk: Buffer) => { const text = chunk.toString(); stderr = `${stderr}${text}`.slice(-40000); finalLine = text.trim().split('\n').pop() || ''; const matches = [...text.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)]; if (matches.length && options.onProgress) { const last = matches.at(-1)!; const seconds = Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]); options.onProgress(seconds, finalLine); } });
      child.on('error', (error) => { this.active.delete(jobId); reject(new Error(`FFmpeg başlatılamadı: ${error.message}`)); });
      child.on('close', (code) => { this.active.delete(jobId); options.signal?.removeEventListener('abort', abort); if (code === 0) resolve(); else if (options.signal?.aborted) reject(new DOMException('İşlem iptal edildi.', 'AbortError')); else reject(new Error(`FFmpeg ${code} koduyla kapandı.\n${stderr.split('\n').slice(-12).join('\n')}`)); });
    });
  }
  cancel(jobId: string): void { const child = this.active.get(jobId); if (child) child.kill('SIGKILL'); }
  cancelAll(): void { for (const child of this.active.values()) child.kill('SIGKILL'); this.active.clear(); }
}
