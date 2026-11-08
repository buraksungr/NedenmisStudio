import type { ResearchResult } from '../../../../shared/types.js';
import type { ProjectRepository } from '../../infrastructure/database/ProjectRepository.js';
import type { ResearchProvider } from './ResearchProvider.js';

export class ResearchService {
  constructor(private readonly projects: ProjectRepository, private readonly providers: Map<string, ResearchProvider>, private activeProviderId: () => string) {}
  async run(projectId: string): Promise<ResearchResult> {
    const project = this.projects.get(projectId);
    const provider = this.providers.get(this.activeProviderId()) || this.providers.get('offline-curated')!;
    try {
      const result = await provider.research(project.topic, project.category);
      project.research = result; if (result.status === 'completed') project.status = 'researched'; this.projects.update(project); return result;
    } catch (error) {
      const result: ResearchResult = { status: 'failed', provider: provider.name, sources: [], note: error instanceof Error ? error.message : 'Araştırma tamamlanamadı.' };
      project.research = result; this.projects.update(project); return result;
    }
  }
}
