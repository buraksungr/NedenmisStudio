import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export class Logger {
  constructor(private readonly directory: string) { mkdirSync(directory, { recursive: true }); }
  private write(level: string, message: string, details?: unknown): void {
    const safeDetails = details instanceof Error ? details.stack : details ? JSON.stringify(details).replace(/(api[_-]?key|authorization)["'\s:=]+[^,"'\s}]+/gi, '$1=[gizlendi]') : '';
    const line = `${new Date().toISOString()} [${level}] ${message}${safeDetails ? ` ${safeDetails}` : ''}\n`;
    try { appendFileSync(join(this.directory, 'nedenmis-studio.log'), line, 'utf8'); } catch { /* Günlük yazılamasa da uygulama çalışır. */ }
    if (level === 'ERROR') console.error(message, details || '');
  }
  info(message: string, details?: unknown): void { this.write('INFO', message, details); }
  warn(message: string, details?: unknown): void { this.write('WARN', message, details); }
  error(message: string, details?: unknown): void { this.write('ERROR', message, details); }
}
