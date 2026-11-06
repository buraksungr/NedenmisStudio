import { generateSubtitleCues, sceneStartTimes } from '../../../../shared/utils.js';
import type { Project } from '../../../../shared/types.js';
import type { ProjectRepository } from '../../infrastructure/database/ProjectRepository.js';

/** Zaman çizelgesi değişikliklerinde altyazıların sahne içi konumunu korur. */
export class ProjectService {
  constructor(private readonly projects: ProjectRepository) {}
  update(incoming: Project): Project {
    const previous = this.projects.get(incoming.id); const oldStarts = sceneStartTimes(previous.scenes); const newStarts = sceneStartTimes(incoming.scenes);
    incoming.scenes = incoming.scenes.map((scene, newIndex) => {
      const oldIndex = previous.scenes.findIndex((item) => item.id === scene.id);
      if (oldIndex < 0) return { ...scene, subtitles: generateSubtitleCues(scene.narration, scene.duration, newStarts[newIndex]) };
      const old = previous.scenes[oldIndex]; const ratio = scene.duration / Math.max(.2, old.duration);
      const structureChanged = scene.narration !== old.narration && scene.subtitles === old.subtitles;
      return { ...scene, subtitles: structureChanged ? generateSubtitleCues(scene.narration, scene.duration, newStarts[newIndex]) : scene.subtitles.map((cue) => ({ ...cue, start: newStarts[newIndex] + (cue.start - oldStarts[oldIndex]) * ratio, end: newStarts[newIndex] + (cue.end - oldStarts[oldIndex]) * ratio })) };
    });
    incoming.recoveryNote = undefined; return this.projects.update(incoming);
  }
}
