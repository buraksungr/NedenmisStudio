import type { AppDatabase } from './Database.js';

export class SettingsRepository {
  constructor(private readonly database: AppDatabase) {}

  get<T>(key: string, fallback: T): T {
    const row = this.database.connection.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return fallback;
    try { return JSON.parse(row.value) as T; } catch { return fallback; }
  }

  set<T>(key: string, value: T): void {
    this.database.connection.prepare(`INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .run(key, JSON.stringify(value), new Date().toISOString());
  }

  delete(key: string): void { this.database.connection.prepare('DELETE FROM settings WHERE key = ?').run(key); }
}
