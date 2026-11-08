import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { DEFAULT_IDENTITY } from '../../shared/defaults.js';
import { renderAnimatedSceneSvg, resolveAnimation, resolveAnimationPreset } from '../../shared/visuals/sceneAnimation.js';
import { sceneAnimationSchema } from '../../shared/validation.js';
import { createIceAnimationProject } from '../fixtures/iceAnimationProject.js';
import { sampleProject } from '../helpers.js';

function pixels(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize(270, 480).removeAlpha().raw().toBuffer();
}
function meanDifference(a: Buffer, b: Buffer): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

describe('Gerçek bilimsel nesne animasyonu', () => {
  it('gökyüzü konusunu orbital yerine hareketli Rayleigh fotonlarına yönlendirir', async () => {
    const project = sampleProject(); project.topic = 'Gökyüzü neden mavi görünür?';
    const scene = { ...createIceAnimationProject().scenes[0], narration: 'Güneş ışığı atmosferdeki moleküllerde saçılır.', visualDescription: 'Mavi ışık saçılımı', animation: undefined };
    expect(resolveAnimationPreset(project, scene)).toBe('light-scattering');
    const firstSvg = renderAnimatedSceneSvg(project, scene, DEFAULT_IDENTITY, .1);
    const laterSvg = renderAnimatedSceneSvg(project, scene, DEFAULT_IDENTITY, .9);
    const photon = (svg: string) => svg.match(/data-light-photon="0"[^>]*transform="([^"]+)/)?.[1];
    const scattered = (svg: string) => svg.match(/data-scattered-photon="0"[^>]*cx="([^"]+)/)?.[1];
    expect(photon(firstSvg)).not.toBe(photon(laterSvg)); expect(scattered(firstSvg)).not.toBe(scattered(laterSvg));
    expect(firstSvg).toContain('data-air-molecule='); expect(meanDifference(await pixels(firstSvg), await pixels(laterSvg))).toBeGreaterThan(.2);
  });

  it('dört buz sahnesini otomatik olarak dört farklı modele ayırır', () => {
    const project = createIceAnimationProject();
    const expected = ['liquid-molecules', 'crystallization', 'lattice-expansion', 'floating-ice'];
    project.scenes.forEach((scene, index) => {
      scene.animation = { ...scene.animation!, preset: 'auto' };
      expect(resolveAnimationPreset(project, scene)).toBe(expected[index]);
    });
  });

  it('molekül, kristal, genişleme ve yüzme değerlerini zamana göre değiştirir', () => {
    const project = createIceAnimationProject();
    const frames = project.scenes.map((scene) => [0, .9].map((time) => renderAnimatedSceneSvg(project, scene, DEFAULT_IDENTITY, time)));
    expect(new Set(frames.map(([svg]) => svg.match(/data-animation-preset="([^"]+)"/)?.[1])).size).toBe(4);
    frames.forEach(([first, later]) => expect(later).not.toBe(first));

    const liquidTransform = (svg: string) => svg.match(/data-molecule-id="liquid-0"[^>]*transform="([^"]+)"/)?.[1];
    expect(liquidTransform(frames[0][0])).not.toBe(liquidTransform(frames[0][1]));
    const crystalProgress = (svg: string) => Number(svg.match(/data-crystal-progress="([^"]+)"/)?.[1]);
    expect(crystalProgress(frames[1][1])).toBeGreaterThan(crystalProgress(frames[1][0]));
    expect(frames[1][0]).not.toContain('data-crystal-progress="1"');
    const expansion = (svg: string) => Number(svg.match(/data-expansion="([^"]+)"/)?.[1]);
    expect(expansion(frames[2][1])).toBeGreaterThan(expansion(frames[2][0]));
    const iceTransform = (svg: string) => svg.match(/data-floating-ice="true" transform="([^"]+)"/)?.[1];
    expect(iceTransform(frames[3][0])).not.toBe(iceTransform(frames[3][1]));
    expect(frames[3][0].match(/data-wave="true" d="([^"]+)"/)?.[1]).not.toBe(frames[3][1].match(/data-wave="true" d="([^"]+)"/)?.[1]);
  });

  it('kristal motifini yıldız yerine eşit kenarlı altıgen çevrimlerle bağlar', () => {
    const project = createIceAnimationProject(); const scene = project.scenes[1];
    const svg = renderAnimatedSceneSvg(project, scene, DEFAULT_IDENTITY, scene.duration);
    const bonds = [...svg.matchAll(/<line data-crystal-bond="[^"]+" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)].slice(0, 6);
    expect(bonds).toHaveLength(6); const degree = new Map<string, number>();
    bonds.forEach((bond) => {
      const [x1, y1, x2, y2] = bond.slice(1).map(Number);
      expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(135, 1);
      for (const point of [`${x1},${y1}`, `${x2},${y2}`]) degree.set(point, (degree.get(point) || 0) + 1);
    });
    expect(degree.size).toBe(6); expect([...degree.values()].every((value) => value === 2)).toBe(true);
  });

  it('dört modelin rasterleştirilmiş gerçek pikselleri hareket eder', async () => {
    const project = createIceAnimationProject();
    for (const scene of project.scenes) {
      const first = await pixels(renderAnimatedSceneSvg(project, scene, DEFAULT_IDENTITY, .1));
      const later = await pixels(renderAnimatedSceneSvg(project, scene, DEFAULT_IDENTITY, .9));
      expect(meanDifference(first, later), scene.animation?.preset).toBeGreaterThan(.5);
    }
  });

  it.each([
    ['light-scattering', 'light-scattering'], ['orbital', 'orbital'], ['galaxy', 'galaxy'], ['cellular', 'cellular'],
    ['energy-waves', 'energy-waves'], ['geological', 'geological'],
    ['weather-systems', 'weather-systems'], ['river-flow', 'river-flow'],
    ['reaction', 'reaction'], ['neural', 'neural'], ['data-flow', 'data-flow'],
    ['generic-particles', 'generic-particles'],
  ] as const)('%s ön ayarında gerçek nesne/piksel hareketi üretir', async (preset, layer) => {
    const project = createIceAnimationProject(); project.topic = 'Bilimsel hareket';
    const scene = { ...project.scenes[0], animation: { enabled: true, preset, speed: 1, intensity: 1, particleCount: 24 } };
    const firstSvg = renderAnimatedSceneSvg(project, scene, DEFAULT_IDENTITY, .1);
    const laterSvg = renderAnimatedSceneSvg(project, scene, DEFAULT_IDENTITY, .9);
    expect(firstSvg).toContain(`data-animation-layer="${layer}"`);
    expect(laterSvg).not.toBe(firstSvg);
    expect(meanDifference(await pixels(firstSvg), await pixels(laterSvg))).toBeGreaterThan(.05);
  });

  it('eski projeleri otomatik etkin animasyonla açar ve ayarları sınırlar', () => {
    const project = sampleProject();
    const scene = { ...createIceAnimationProject().scenes[0], animation: undefined };
    const resolved = resolveAnimation({ ...project, topic: 'Water molecules' }, scene);
    expect(resolved).toMatchObject({ enabled: true, preset: 'liquid-molecules', speed: 1, intensity: 1, particleCount: 24 });
    expect(sceneAnimationSchema.safeParse({ enabled: true, preset: 'auto', speed: 1, intensity: 1, particleCount: 24 }).success).toBe(true);
    expect(sceneAnimationSchema.safeParse({ enabled: true, preset: 'auto', speed: 8, intensity: 1, particleCount: 24 }).success).toBe(false);
    expect(sceneAnimationSchema.safeParse({ enabled: true, preset: 'auto', speed: 1, intensity: 1, particleCount: 500 }).success).toBe(false);
  });

  it.each([
    ['Why do planets orbit the Sun?', 'orbital'],
    ['How does a galaxy rotate?', 'galaxy'],
    ['How do blood cells move?', 'cellular'],
    ['How does a magnetic field work?', 'energy-waves'],
    ['Why do tectonic plates move?', 'geological'],
    ['How do clouds, wind and rain form?', 'weather-systems'],
    ['How does a river carry sediment?', 'river-flow'],
    ['What happens in a chemical reaction?', 'reaction'],
    ['How do neurons in the brain signal?', 'neural'],
    ['How does data flow through a circuit?', 'data-flow'],
  ])('konuya uygun hareket seçer: %s', (topic, preset) => {
    const project = sampleProject(); project.topic = topic;
    const scene = createIceAnimationProject().scenes[0];
    expect(resolveAnimationPreset({ ...project, topic }, { ...scene, narration: '', visualDescription: '', animation: undefined })).toBe(preset);
  });
});
