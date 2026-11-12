import { generateSubtitleCues, sceneStartTimes } from '../../../../shared/utils.js';
import { composeScript, parseScriptSections, scriptSectionsFromScenes } from '../../../../shared/script.js';
import type { Project } from '../../../../shared/types.js';
import type { ProjectRepository } from '../../infrastructure/database/ProjectRepository.js';

/** Zaman çizelgesi değişikliklerinde altyazıların sahne içi konumunu korur. */
export class ProjectService {
  constructor(private readonly projects: ProjectRepository) {}
  update(incoming: Project): Project {
    const previous = this.projects.get(incoming.id);
    const scriptChanged = incoming.script !== previous.script;
    const narrationChanged = incoming.scenes.some((scene) => scene.narration !== previous.scenes.find((item) => item.id === scene.id)?.narration);
    if (narrationChanged && !scriptChanged) {
      const sections = scriptSectionsFromScenes(incoming.scenes);
      incoming.scriptSections = sections;
      if (sections) incoming.script = composeScript(sections);
      else incoming.script = incoming.scenes.filter((scene) => scene.section === 'hook' || scene.section === 'explanation' || scene.section === 'conclusion').map((scene) => scene.narration.trim()).filter(Boolean).join('\n\n');
    } else if (incoming.script.trim()) {
      try {
        const sections = parseScriptSections(incoming.script);
        incoming.scriptSections = sections; incoming.script = composeScript(sections);
      } catch {
        // Kullanıcı metni yazarken eksik bölümler kaydedilebilir; sahne/TTS üretimi bunu doğrular.
        incoming.scriptSections = undefined;
      }
    } else incoming.scriptSections = undefined;

    const oldStarts = sceneStartTimes(previous.scenes); const newStarts = sceneStartTimes(incoming.scenes);
    incoming.scenes = incoming.scenes.map((scene, newIndex) => {
      const oldIndex = previous.scenes.findIndex((item) => item.id === scene.id);
      if (oldIndex < 0) return { ...scene, subtitles: generateSubtitleCues(scene.narration, scene.duration, newStarts[newIndex]) };
      const old = previous.scenes[oldIndex]; const ratio = scene.duration / Math.max(.2, old.duration);
      const structureChanged = scene.narration !== old.narration && JSON.stringify(scene.subtitles) === JSON.stringify(old.subtitles);
      return { ...scene, subtitles: structureChanged ? generateSubtitleCues(scene.narration, scene.duration, newStarts[newIndex]) : scene.subtitles.map((cue) => ({ ...cue, start: newStarts[newIndex] + (cue.start - oldStarts[oldIndex]) * ratio, end: newStarts[newIndex] + (cue.end - oldStarts[oldIndex]) * ratio })) };
    });
    incoming.recoveryNote = undefined; return this.projects.update(incoming);
  }
}
