import { id } from '../../../../shared/utils.js';
import type { ExportRecord } from '../../../../shared/types.js';
import type { AppDatabase } from './Database.js';

interface ExportRow { id: string; project_id: string; project_name: string; output_path: string; preset: string; status: ExportRecord['status']; progress: number; created_at: string; completed_at?: string; error?: string; file_size?: number }

export class ExportRepository {
  constructor(private readonly database: AppDatabase) {}
  private map(row: ExportRow): ExportRecord { return { id: row.id, projectId: row.project_id, projectName: row.project_name, outputPath: row.output_path, preset: row.preset, status: row.status, progress: row.progress, createdAt: row.created_at, completedAt: row.completed_at || undefined, error: row.error || undefined, fileSize: row.file_size || undefined }; }
  list(): ExportRecord[] { return (this.database.connection.prepare('SELECT * FROM exports ORDER BY created_at DESC LIMIT 100').all() as ExportRow[]).map((row) => this.map(row)); }
  get(exportId: string): ExportRecord { const row = this.database.connection.prepare('SELECT * FROM exports WHERE id = ?').get(exportId) as ExportRow | undefined; if (!row) throw new Error('Dışa aktarım kaydı bulunamadı.'); return this.map(row); }
  create(projectId: string, projectName: string, outputPath: string, preset: string): ExportRecord {
    const record: ExportRecord = { id: id('export'), projectId, projectName, outputPath, preset, status: 'queued', progress: 0, createdAt: new Date().toISOString() };
    this.database.connection.prepare(`INSERT INTO exports(id, project_id, project_name, output_path, preset, status, progress, created_at)
      VALUES (@id, @projectId, @projectName, @outputPath, @preset, @status, @progress, @createdAt)`).run(record);
    return record;
  }
  update(exportId: string, patch: Partial<ExportRecord>): ExportRecord {
    const current = this.get(exportId); const next = { ...current, ...patch };
    this.database.connection.prepare(`UPDATE exports SET status=@status, progress=@progress, completed_at=@completedAt, error=@error, file_size=@fileSize WHERE id=@id`)
      .run({ ...next, completedAt: next.completedAt || null, error: next.error || null, fileSize: next.fileSize || null });
    return next;
  }
}
