import sharp from 'sharp';
import type { ChannelIdentity, ConnectionTestResult, Project, Scene } from '../../../../shared/types.js';
import { buildProceduralSvg } from '../../../../shared/visuals/sceneArtwork.js';
import { renderAnimatedSceneSvg } from '../../../../shared/visuals/sceneAnimation.js';
import type { VisualProvider } from './VisualProvider.js';

export { buildProceduralSvg } from '../../../../shared/visuals/sceneArtwork.js';

export class ProceduralVisualProvider implements VisualProvider {
  readonly id = 'procedural'; readonly name = 'Yerel hareketli infografik';
  async generate(project: Project, scene: Scene, identity: ChannelIdentity, outputPath: string): Promise<void> {
    const svg = scene.animation?.enabled !== false ? renderAnimatedSceneSvg(project, scene, identity, 0) : buildProceduralSvg(project, scene, identity);
    await sharp(Buffer.from(svg), { density: 72 }).resize(1080, 1920, { fit: 'fill' }).png({ compressionLevel: 8, quality: 90 }).toFile(outputPath);
  }
  async test(): Promise<ConnectionTestResult> { return { ok: true, message: 'CPU ile çalışan yerel prosedürel görsel ve nesne animasyonu motoru hazır; API anahtarı gerekmez.' }; }
}
