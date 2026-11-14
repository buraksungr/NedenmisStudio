import { id } from '../../../../shared/utils.js';
import type { MediaItem, MediaKind } from '../../../../shared/types.js';
import type { AppDatabase } from './Database.js';

interface MediaRow { id: string; project_id?: string; kind: MediaKind; name: string; path: string; mime_type: string; size: number; duration?: number; created_at: string }

export class MediaRepository {
  constructor(private readonly database: AppDatabase) {}
  private map(row: MediaRow): MediaItem { return { id: row.id, projectId: row.project_id || undefined, kind: row.kind, name: row.name, path: row.path, mimeType: row.mime_type, size: row.size, duration: row.duration, createdAt: row.created_at }; }
  list(kind?: MediaKind): MediaItem[] {
    const rows = (kind ? this.database.connection.prepare('SELECT * FROM media WHERE kind = ? ORDER BY created_at DESC').all(kind) : this.database.connection.prepare('SELECT * FROM media ORDER BY created_at DESC').all()) as MediaRow[];
    return rows.map((row) => this.map(row));
  }
  get(mediaId: string): MediaItem {
    const row = this.database.connection.prepare('SELECT * FROM media WHERE id = ?').get(mediaId) as MediaRow | undefined;
    if (!row) throw new Error('Medya öğesi bulunamadı.');
    return this.map(row);
  }
  create(input: Omit<MediaItem, 'id' | 'createdAt'>): MediaItem {
    const item: MediaItem = { ...input, id: id('media'), createdAt: new Date().toISOString() };
    this.database.connection.prepare(`INSERT INTO media(id, project_id, kind, name, path, mime_type, size, duration, created_at)
      VALUES (@id, @projectId, @kind, @name, @path, @mimeType, @size, @duration, @createdAt)`)
      .run({ ...item, projectId: item.projectId || null, duration: item.duration || null });
    return item;
  }
  upsertByPath(input: Omit<MediaItem, 'id' | 'createdAt'>): MediaItem {
    const row = this.database.connection.prepare('SELECT id FROM media WHERE path = ?').get(input.path) as { id: string } | undefined;
    if (row) return this.get(row.id);
    return this.create(input);
  }
  remove(mediaId: string): void { this.database.connection.prepare('DELETE FROM media WHERE id = ?').run(mediaId); }
}
