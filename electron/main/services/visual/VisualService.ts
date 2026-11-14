import { mkdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { ChannelIdentity, Project } from '../../../../shared/types.js';
import type { ProjectRepository } from '../../infrastructure/database/ProjectRepository.js';
import type { MediaRepository } from '../../infrastructure/database/MediaRepository.js';
import type { VisualProvider } from './VisualProvider.js';
import { classifyScene } from '../../../../shared/visuals/sceneComposition.js';

export class VisualService {
  constructor(private readonly projects: ProjectRepository, private readonly media: MediaRepository, private readonly providers: Map<string, VisualProvider>, private readonly storagePath: () => string, private readonly identity: () => ChannelIdentity, private readonly activeProviderId: () => string) {}
  private provider(): VisualProvider { return this.providers.get(this.activeProviderId()) || this.providers.get('procedural')!; }
  private async render(project: Project, sceneId: string): Promise<void> {
    const scene = project.scenes.find((item) => item.id === sceneId); if (!scene) throw new Error('Sahne bulunamadı.');
    const provider = this.provider();
    scene.status = 'generating'; scene.error = undefined; this.projects.update(project);
    try {
      const directory = join(this.storagePath(), 'projects', project.id, 'visuals'); await mkdir(directory, { recursive: true });
      const outputPath = join(directory, `${scene.id}-${provider.id}-${Date.now()}.png`);
      const channelIdentity = { ...this.identity(), ...project.brand };
      await provider.generate(project, scene, channelIdentity, outputPath);
      const info = await stat(outputPath);
      scene.assetPath = outputPath; scene.assetType = provider.id === 'procedural' ? 'procedural' : 'ai-image'; scene.visualProvider = provider.name; scene.status = 'ready';
      // BUILD 44: konu hazır bir bilimsel alana eşlenemediyse bu DURUM gizlenmez;
      // kullanıcıya konunun neden jeneral çizime düştüğü açıkça bildirilir.
      if (provider.id === 'procedural') {
        const composition = classifyScene(project, scene);
        scene.visualNote = composition.unrepresentable
          ? `Bu kavram hazır bir bilimsel görsel kalıba eşlenemedi (eşleşme: ${composition.keywords.length ? composition.keywords.join(', ') : 'yok'}). Konuya özgü bir mekanizma yerine konu imzasından türetilen genel bilimsel çizim kullanıldı; sahne metnini veya görsel yönlendirmesini özgülleştirerek daha doğru bir temsil elde edebilirsiniz.`
          : undefined;
      } else scene.visualNote = undefined;
      this.media.upsertByPath({ kind: 'generated-image', name: `${project.name} · Sahne ${scene.number}`, path: outputPath, mimeType: 'image/png', size: info.size, projectId: project.id });
      project.status = 'production';
    } catch (error) { scene.status = 'error'; scene.error = error instanceof Error ? error.message : 'Görsel üretilemedi.'; throw error; }
    finally { this.projects.update(project); }
  }
  async regenerate(projectId: string, sceneId: string): Promise<Project> { const project = this.projects.get(projectId); await this.render(project, sceneId); return this.projects.get(projectId); }
  async generateAll(projectId: string): Promise<Project> {
    const project = this.projects.get(projectId); if (!project.scenes.length) throw new Error('Önce sahne planı oluşturun.');
    const errors: string[] = [];
    for (const scene of project.scenes) { try { await this.render(project, scene.id); } catch (error) { errors.push(`Sahne ${scene.number}: ${error instanceof Error ? error.message : 'hata'}`); } }
    const updated = this.projects.get(projectId); if (errors.length) { updated.recoveryNote = errors.join('\n'); this.projects.update(updated); throw new Error(`Bazı görseller üretilemedi.\n${errors.join('\n')}`); } return updated;
  }
  async importForScene(projectId: string, sceneId: string, sourcePath: string): Promise<Project> {
    const project = this.projects.get(projectId); const scene = project.scenes.find((s) => s.id === sceneId); if (!scene) throw new Error('Sahne bulunamadı.');
    scene.assetPath = sourcePath; scene.assetType = /\.(mp4|mov|webm)$/i.test(sourcePath) ? 'video' : 'imported-image'; scene.visualProvider = 'Medya kitaplığı'; scene.status = 'ready';
    void basename; return this.projects.update(project);
  }
}
