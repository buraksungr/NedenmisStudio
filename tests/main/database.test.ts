import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { MediaRepository } from '../../electron/main/infrastructure/database/MediaRepository.js';
import { SettingsRepository } from '../../electron/main/infrastructure/database/SettingsRepository.js';
import { ExportRepository } from '../../electron/main/infrastructure/database/ExportRepository.js';
import { projectInput } from '../helpers.js';

let database: AppDatabase;
beforeEach(() => { database = new AppDatabase(':memory:'); }); afterEach(() => { database.close(); vi.useRealTimers(); });

describe('SQLite kalıcılığı ve depolar', () => {
  it('migrasyonları ve WAL uyumlu tabloları oluşturur', () => { expect(database.connection.pragma('user_version', { simple: true })).toBe(1); const tables = database.connection.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>; expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining(['projects', 'media', 'settings', 'exports'])); });
  it('proje oluşturur, otomatik kayıt verisini günceller, çoğaltır, adlandırır ve siler', () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-01-01T00:00:00.000Z');
    const repository = new ProjectRepository(database); const project = repository.create(projectInput()); expect(project.id).toMatch(/^project_/); expect(project.brand?.channelName).toBe('Nedenmiş');
    project.script = 'Türkçe ışık açıklaması.'; vi.advanceTimersByTime(1); const saved = repository.update(project); expect(repository.get(project.id).script).toBe('Türkçe ışık açıklaması.'); expect(saved.updatedAt).not.toBe(project.createdAt);
    const duplicate = repository.duplicate(project.id); expect(duplicate.id).not.toBe(project.id); expect(duplicate.name).toContain('kopya');
    expect(repository.rename(project.id, 'Yeni ışık hikâyesi').name).toBe('Yeni ışık hikâyesi'); expect(repository.list()).toHaveLength(2); expect(repository.stats().projectCount).toBe(2);
    repository.remove(duplicate.id); expect(repository.list()).toHaveLength(1); repository.remove(project.id); expect(repository.list()).toHaveLength(0);
  });
  it('yarım kalan renderı kurtarır', () => { const repository = new ProjectRepository(database); const project = repository.create(projectInput()); project.status = 'rendering'; repository.update(project); expect(repository.recoverInterrupted()).toBe(1); expect(repository.get(project.id).status).toBe('ready'); expect(repository.get(project.id).recoveryNote).toContain('kurtarıldı'); });
  it('medya ve dışa aktarım kayıtlarını ilişkilendirir', () => {
    const projects = new ProjectRepository(database); const project = projects.create(projectInput()); const media = new MediaRepository(database); const exports = new ExportRepository(database);
    const item = media.create({ kind: 'image', name: 'ışık.png', path: '/tmp/ışık.png', mimeType: 'image/png', size: 120, projectId: project.id }); expect(item.kind).toBe('image'); expect(media.list('image')[0].name).toBe('ışık.png');
    const record = exports.create(project.id, project.name, '/tmp/video.mp4', 'standard'); exports.update(record.id, { status: 'completed', progress: 100, fileSize: 456 }); expect(exports.get(record.id).fileSize).toBe(456); expect(exports.list()[0].projectId).toBe(project.id);
    projects.remove(project.id); expect(media.list()[0].projectId).toBeUndefined(); expect(exports.list()).toHaveLength(0);
  });
  it('ayarları JSON olarak saklar fakat veritabanı kimlik bilgisi içermez', () => { const settings = new SettingsRepository(database); settings.set('app', { theme: 'dark', outputPath: 'D:\\Videolar' }); expect(settings.get('app', { theme: '' }).theme).toBe('dark'); settings.delete('app'); expect(settings.get('app', null)).toBeNull(); });
});
