import { describe, expect, it } from 'vitest';
import { SubtitleService } from '../../electron/main/services/subtitle/SubtitleService.js';
import { generateSubtitleCues } from '../../shared/utils.js';
import { sampleProject } from '../helpers.js';

describe('ASS altyazı üretimi', () => {
  it('Türkçe metni, konumu, rengi ve vurguyu ASS içine güvenle yerleştirir', () => { const project = sampleProject(); project.scenes = [{ id: 's1', number: 1, narration: 'Işık neden saçılır?', visualDescription: '', visualPrompt: '', assetType: 'procedural', duration: 3, transition: 'fade', cameraMovement: 'static', subtitles: generateSubtitleCues('Işık neden saçılır?', 3), subtitleTiming: 'estimated', status: 'ready' }]; project.subtitleStyle.uppercase = true; const ass = new SubtitleService().createAss(project); expect(ass).toContain('PlayResX: 1080'); expect(ass).toContain('IŞIK'); expect(ass).toContain('Dialogue: 0,0:00:00.00'); expect(ass).toContain('Alignment'); });
});
