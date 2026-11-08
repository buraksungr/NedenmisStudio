import { describe, expect, it } from 'vitest';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { ScriptService } from '../../electron/main/services/ai/ScriptService.js';
import { LocalScriptProvider } from '../../electron/main/services/ai/LocalScriptProvider.js';
import { ProjectService } from '../../electron/main/services/projects/ProjectService.js';
import { DEFAULT_IDENTITY } from '../../shared/defaults.js';
import { composeScript, parseScriptSections } from '../../shared/script.js';
import { projectInput } from '../helpers.js';

function setup() {
  const database = new AppDatabase(':memory:'); const projects = new ProjectRepository(database);
  const local = new LocalScriptProvider();
  const scripts = new ScriptService(projects, new Map([[local.id, local]]), () => local.id, () => ({ ...DEFAULT_IDENTITY, outroEnabled: true }));
  const project = projects.create(projectInput({ topic: 'Gökyüzü neden mavi görünür?', name: 'Gökyüzü neden mavi görünür?', targetDuration: 30 }));
  return { database, projects, scripts, project };
}

describe('Kanca, açıklama ve sonuç bölümleri', () => {
  it('etiketli ve düz metinleri üç ayrı bölüm olarak okur', () => {
    const labeled = parseScriptSections('KANCA:\nBir soru?\n\nAÇIKLAMA:\nKısa açıklama.\n\nSONUÇ:\nKalıcı sonuç.');
    expect(labeled).toEqual({ hook: 'Bir soru?', explanation: 'Kısa açıklama.', conclusion: 'Kalıcı sonuç.' });
    expect(parseScriptSections(composeScript(labeled))).toEqual(labeled);
    expect(() => parseScriptSections('Kanca. Açıklama yok.')).toThrow(/sonuç/i);
  });

  it('özlü gökyüzü senaryosu üretir ve genel outro yerine gerçek sonucu son sahne yapar', async () => {
    const { database, projects, scripts, project } = setup();
    try {
      const generated = await scripts.generate(project.id);
      expect(generated.scriptSections?.hook).toContain('Güneş’in ışığı beyaz');
      expect(generated.scriptSections?.explanation).toContain('450 nanometre');
      expect(generated.scriptSections?.conclusion).toContain('beyaz ışığın');
      expect(generated.script).not.toContain('Kısacası');
      expect(generated.script.split(/\s+/).length).toBeLessThan(85);
      const scenes = await scripts.generateScenes(project.id);
      expect(scenes.scenes).toHaveLength(3);
      expect(scenes.scenes[0].section).toBe('hook');
      expect(scenes.scenes.at(-1)?.section).toBe('conclusion');
      expect(scenes.scenes.at(-1)?.narration).toBe(generated.scriptSections?.conclusion);
      expect(scenes.scenes.some((scene) => scene.section === 'outro')).toBe(false);
      expect(scenes.scenes.every((scene) => scene.animation?.enabled && scene.cameraMovement === 'static')).toBe(true);
      expect(projects.get(project.id).scenes.at(-1)?.narration).toBe(generated.scriptSections?.conclusion);
    } finally { database.close(); }
  });

  it('editörde değiştirilen sonucu, ana senaryoyu ve altyazıyı kalıcı olarak eşitler', async () => {
    const { database, projects, scripts, project } = setup();
    try {
      await scripts.generate(project.id); const generated = await scripts.generateScenes(project.id);
      const edited = projects.get(project.id); const conclusion = edited.scenes.at(-1)!;
      conclusion.narration = 'Gökyüzünün mavisi, ışığın bize ulaşan saçılmış hâlidir.';
      const saved = new ProjectService(projects).update(edited);
      expect(saved.scriptSections?.conclusion).toBe(conclusion.narration);
      expect(saved.script.endsWith(conclusion.narration)).toBe(true);
      expect(saved.scenes.at(-1)?.subtitles.map((cue) => cue.text).join(' ')).toContain('saçılmış');
      expect(projects.get(project.id).scriptSections?.conclusion).toBe(conclusion.narration);
      expect(generated.scenes.at(-1)?.section).toBe('conclusion');
    } finally { database.close(); }
  });
});
