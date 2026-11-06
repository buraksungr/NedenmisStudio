import BetterSqlite3 from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, topic TEXT NOT NULL, category TEXT NOT NULL,
    status TEXT NOT NULL, mode TEXT NOT NULL, data TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_opened_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    kind TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0, duration REAL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_media_kind ON media(kind, created_at DESC);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS exports (
    id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    project_name TEXT NOT NULL, output_path TEXT NOT NULL, preset TEXT NOT NULL, status TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, completed_at TEXT, error TEXT, file_size INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_exports_created ON exports(created_at DESC);
  `,
];

export class AppDatabase {
  readonly connection: BetterSqlite3.Database;

  constructor(filePath: string) {
    if (filePath !== ':memory:') mkdirSync(dirname(filePath), { recursive: true });
    this.connection = new BetterSqlite3(filePath);
    this.connection.pragma('foreign_keys = ON');
    this.connection.pragma('busy_timeout = 5000');
    if (filePath !== ':memory:') this.connection.pragma('journal_mode = WAL');
    this.connection.pragma('synchronous = NORMAL');
    this.migrate();
  }

  private migrate(): void {
    const current = this.connection.pragma('user_version', { simple: true }) as number;
    for (let index = current; index < MIGRATIONS.length; index += 1) {
      this.connection.transaction(() => {
        this.connection.exec(MIGRATIONS[index]);
        this.connection.pragma(`user_version = ${index + 1}`);
      })();
    }
  }

  close(): void {
    if (this.connection.open) this.connection.close();
  }
}
