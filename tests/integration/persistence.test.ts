import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { MediaRepository } from '../../electron/main/infrastructure/database/MediaRepository.js';
import { projectInput } from '../helpers.js';

const directory = await mkdtemp(join(tmpdir(), 'nedenmis-restart-')); afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
describe('Uygulama yeniden açılışı', () => {
  it('dosyalı SQLite üzerinde projeyi, sahneleri ve referans profil kaydını korur', () => {
    const path = join(directory, 'studio.sqlite'); const first = new AppDatabase(path); const projects = new ProjectRepository(first); const media = new MediaRepository(first); const project = projects.create(projectInput({ name: 'Yeniden açılan proje' })); project.script = 'Kalıcı Türkçe metin'; projects.update(project); media.upsertByPath({ kind: 'reference-voice', name: 'Kalıcı referans', path: join(directory, 'reference_voice.wav'), mimeType: 'audio/wav', size: 123, duration: 8 }); const id = project.id; first.close();
    const second = new AppDatabase(path); const restored = new ProjectRepository(second).get(id); expect(restored.name).toBe('Yeniden açılan proje'); expect(restored.script).toBe('Kalıcı Türkçe metin'); expect(new MediaRepository(second).list('reference-voice')[0].duration).toBe(8); second.close();
  });
});
