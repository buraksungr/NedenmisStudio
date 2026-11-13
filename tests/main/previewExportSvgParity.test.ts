import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderAnimatedSceneSvg } from '../../shared/visuals/sceneAnimation.js';
import { DEFAULT_IDENTITY } from '../../shared/defaults.js';
import { measureTitleWidth, TITLE_SAFE_WIDTH, wrapTitle } from '../../shared/visuals/sceneArtwork.js';
import type { Project, Scene } from '../../shared/types.js';

const project = {
  topic: 'Mum alevi neden yukarı doğru yanar ve neden titrer',
  subtitleStyle: { position: 'bottom' },
  brand: {},
  animation: { preset: 'liquid-molecules', speed: 1, intensity: 1 },
} as unknown as Project;
const scene = {
  id: 's1', number: 1, narration: 'Sıcak hava yukarı çıkar', duration: 10,
  assetType: 'procedural', transition: 'fade', cameraMovement: 'static',
  animation: { enabled: true, preset: 'liquid-molecules', speed: 1, intensity: 1, particleCount: 12 },
  subtitles: [], subtitleTiming: 'estimated', status: 'ready',
} as unknown as Scene;

/**
 * Önizleme/dışa aktarım eşliği: ikisi de AYNI saf SVG üreticisini çağırır.
 * Bu test, önizlemenin gördüğü kompozisyonun dışa aktarılanla aynı olduğunu
 * yapısal olarak kilitler: tek kaynak, tek viewBox, tek başlık sarma kuralı.
 */
describe('Önizleme ve dışa aktarım aynı kompozisyonu kullanır', () => {
  const svg = renderAnimatedSceneSvg(project, scene, DEFAULT_IDENTITY, 1.5);

  it('tek bir 1080×1920 koordinat uzayı kullanır', () => {
    expect(svg).toContain('viewBox="0 0 1080 1920"');
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1920"');
    // Önizlemeye özel ikinci bir koordinat sistemi YOK.
    expect(svg.match(/viewBox=/g)).toHaveLength(1);
  });

  it('başlık satırları güvenli alan içinde kalır', () => {
    const lines = wrapTitle(project.topic);
    for (const line of lines) {
      expect(measureTitleWidth(line)).toBeLessThanOrEqual(TITLE_SAFE_WIDTH);
      expect(svg).toContain(`>${line}<`);
    }
  });

  it('dışa aktarıcı ile önizleme aynı üreticiyi çağırır', () => {
    // RenderService ve AnimatedScene aynı fonksiyonu kullanır.
    const renderSource = readFileSync('electron/main/services/render/RenderService.ts', 'utf8');
    const previewSource = readFileSync('src/renderer/components/AnimatedScene.tsx', 'utf8');
    expect(renderSource).toContain('renderAnimatedSceneSvg');
    expect(previewSource).toContain('renderAnimatedSceneSvg');
  });

  it('önizleme SVG yi kapsayıcısına sığdırır (kırpma yok)', () => {
    const styles = readFileSync('src/renderer/styles.css', 'utf8');
    const component = readFileSync('src/renderer/components/AnimatedScene.tsx', 'utf8');
    expect(component).toContain('scene-fit');
    // SVG width/height %100 olmalı; sabit 1080/1920 kalmamalı.
    expect(styles).toMatch(/\.scene-fit > svg \{[^}]*width: 100%/);
    expect(styles).toMatch(/\.scene-fit > svg \{[^}]*height: 100%/);
  });
});
