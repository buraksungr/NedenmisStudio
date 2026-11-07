import { DEFAULT_AUDIO, DEFAULT_IDENTITY, DEFAULT_VOICE, id, projectDefaults } from '../../../../shared/index.js';
import type { ChannelIdentity, DashboardStats, Project, ProjectInput } from '../../../../shared/index.js';
import type { AppDatabase } from './Database.js';

interface ProjectRow { id: string; data: string; created_at: string; updated_at: string; last_opened_at?: string }

export class ProjectRepository {
  constructor(private readonly database: AppDatabase) {}

  private hydrate(row?: ProjectRow): Project | undefined {
    if (!row) return undefined;
    const project = JSON.parse(row.data) as Project;
    return {
      ...project,
      audio: { ...DEFAULT_AUDIO, ...project.audio, musicClips: project.audio?.musicClips || [], sfxClips: project.audio?.sfxClips || [] },
      scenes: (project.scenes || []).map((scene) => ({ ...scene, subtitles: scene.subtitles || [], subtitleTiming: scene.subtitleTiming || 'estimated' })),
    };
  }

  list(): Project[] {
    const rows = this.database.connection.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as ProjectRow[];
    return rows.map((row) => this.hydrate(row)!);
  }

  get(projectId: string): Project {
    const row = this.database.connection.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRow | undefined;
    const project = this.hydrate(row);
    if (!project) throw new Error('Proje bulunamadı. Yenilenen proje listesini kontrol edin.');
    return project;
  }

  create(input: ProjectInput, identity: ChannelIdentity = DEFAULT_IDENTITY): Project {
    const values = projectDefaults(input);
    const now = new Date().toISOString();
    const project: Project = {
      ...values, id: id('project'), status: 'draft', script: '', scenes: [],
      research: { status: 'not_started', sources: [] },
      audio: { ...DEFAULT_AUDIO, musicClips: [], sfxClips: [] },
      subtitleStyle: { ...identity.subtitleStyle },
      brand: { channelName: identity.channelName, primaryColor: identity.primaryColor, secondaryColor: identity.secondaryColor },
      voice: { ...DEFAULT_VOICE, providerId: 'windows-sapi' },
      createdAt: now, updatedAt: now,
    };
    if (identity.defaultMusicPath) {
      // Kimlikteki müzik, kullanıcı zaman çizelgesine ekleyene kadar yalnızca varsayılan olarak saklanır.
    }
    this.persist(project);
    return project;
  }

  update(project: Project): Project {
    const existing = this.get(project.id);
    const next = { ...project, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    this.persist(next);
    return next;
  }

  private persist(project: Project): void {
    this.database.connection.prepare(`INSERT INTO projects(id, name, topic, category, status, mode, data, created_at, updated_at, last_opened_at)
      VALUES (@id, @name, @topic, @category, @status, @mode, @data, @createdAt, @updatedAt, @lastOpenedAt)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, topic=excluded.topic, category=excluded.category,
      status=excluded.status, mode=excluded.mode, data=excluded.data, updated_at=excluded.updated_at, last_opened_at=excluded.last_opened_at`)
      .run({ ...project, data: JSON.stringify(project), lastOpenedAt: project.lastOpenedAt || null });
  }

  markOpened(projectId: string): Project {
    const project = this.get(projectId);
    project.lastOpenedAt = new Date().toISOString();
    if (project.status === 'rendering') {
      project.status = 'ready';
      project.recoveryNote = 'Önceki oturumdaki dışa aktarım tamamlanmadan uygulama kapandı. Projeniz güvenle kurtarıldı.';
    }
    return this.update(project);
  }

  remove(projectId: string): void { this.database.connection.prepare('DELETE FROM projects WHERE id = ?').run(projectId); }

  duplicate(projectId: string): Project {
    const source = this.get(projectId);
    const now = new Date().toISOString();
    const copy: Project = {
      ...source, id: id('project'), name: `${source.name} — kopya`.slice(0, 120), status: source.scenes.length ? 'ready' : 'draft',
      createdAt: now, updatedAt: now, lastOpenedAt: undefined, recoveryNote: undefined,
      scenes: source.scenes.map((scene) => ({ ...scene, id: id('scene'), subtitles: scene.subtitles.map((cue) => ({ ...cue, id: id('cue') })) })),
      audio: { ...source.audio, musicClips: source.audio.musicClips.map((clip) => ({ ...clip, id: id('audio') })), sfxClips: source.audio.sfxClips.map((clip) => ({ ...clip, id: id('audio') })) },
    };
    this.persist(copy);
    return copy;
  }

  rename(projectId: string, name: string): Project {
    const clean = name.trim();
    if (!clean) throw new Error('Proje adı boş olamaz.');
    const project = this.get(projectId);
    project.name = clean.slice(0, 120);
    return this.update(project);
  }

  recoverInterrupted(): number {
    const rendering = this.list().filter((project) => project.status === 'rendering');
    for (const project of rendering) {
      project.status = 'ready';
      project.recoveryNote = 'Yarım kalan dışa aktarım algılandı; proje otomatik olarak kurtarıldı.';
      this.update(project);
    }
    this.database.connection.prepare(`UPDATE exports SET status = 'failed', error = 'Uygulama kapandığı için işlem yarıda kaldı.' WHERE status IN ('queued', 'rendering')`).run();
    return rendering.length;
  }

  stats(): DashboardStats {
    const projects = this.list();
    const exports = this.database.connection.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(file_size), 0) AS size FROM exports WHERE status = 'completed'`).get() as { count: number; size: number };
    const weekAgo = Date.now() - 7 * 86400000;
    return {
      projectCount: projects.length,
      completedCount: projects.filter((p) => p.status === 'completed').length,
      totalRenderedSeconds: projects.filter((p) => p.status === 'completed').reduce((sum, p) => sum + p.scenes.reduce((s, scene) => s + scene.duration, 0), 0),
      exportCount: exports.count,
      weeklyProjects: projects.filter((p) => new Date(p.createdAt).getTime() >= weekAgo).length,
    };
  }
}
