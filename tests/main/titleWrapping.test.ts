import { describe, expect, it } from 'vitest';
import { buildArtworkSvg, measureTitleWidth, TITLE_FONT_SIZE, TITLE_SAFE_WIDTH, wrapTitle } from '../../shared/visuals/sceneArtwork.js';
import { DEFAULT_IDENTITY } from '../../shared/defaults.js';
import type { Project, Scene } from '../../shared/types.js';

const project = (topic: string) => ({ topic, subtitleStyle: { position: 'bottom' } } as unknown as Project);
const scene = { number: 1, narration: 'Sıcak hava yukarı çıkar', duration: 10 } as unknown as Scene;

/**
 * Regresyon (Build 40): başlık tek satır olarak basılıyordu ve uzun Türkçe
 * başlıklar 1080 px kompozisyonu taşıyordu. Gerçek Chromium ölçümü:
 * "Mum alevi neden yukarı doğru yanar ve neden titrer" → 1304,9 px.
 */
describe('Başlık sarma', () => {
  it('uzun Türkçe başlığı güvenli alan içinde satırlara böler', () => {
    const lines = wrapTitle('Mum alevi neden yukarı doğru yanar ve neden titrer');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measureTitleWidth(line)).toBeLessThanOrEqual(TITLE_SAFE_WIDTH);
  });

  it('kısa başlığı tek satırda bırakır', () => {
    expect(wrapTitle('Buz neden yüzer')).toEqual(['Buz neden yüzer']);
  });

  it('hiçbir satır güvenli alanı taşmaz (çok uzun başlık)', () => {
    const lines = wrapTitle('Mum alevi neden yukarı doğru yanar, titrer ve neden turuncu ile mavi iki ayrı renkte görünür');
    expect(lines.length).toBeLessThanOrEqual(3);
    for (const line of lines) expect(measureTitleWidth(line)).toBeLessThanOrEqual(TITLE_SAFE_WIDTH);
  });

  it('üretilen SVG başlığı 42 karakterde kesmez', () => {
    const topic = 'Mum alevi neden yukarı doğru yanar ve neden titrer';
    const svg = buildArtworkSvg(project(topic), scene, DEFAULT_IDENTITY, '');
    // Eski davranış "…" ile 42 karakterde kırpıyordu; artık tam metin sarılır.
    expect(svg).not.toContain(`>${topic.slice(0, 42)}…<`);
    expect(svg).toContain('yanar ve neden titrer');
    for (const line of wrapTitle(topic)) expect(svg).toContain(`>${line}<`);
  });

  it('SVG kompozisyon boyutu 1080×1920 kalır (dışa aktarım bozulmaz)', () => {
    const svg = buildArtworkSvg(project('Test'), scene, DEFAULT_IDENTITY, '');
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1920"');
    expect(svg).toContain('viewBox="0 0 1080 1920"');
    expect(TITLE_FONT_SIZE).toBe(47);
  });

  it('glif ölçümü Türkçe karakterleri doğru sayar', () => {
    // ı/i ince, m geniş: aynı uzunlukta farklı genişlik üretmeli.
    expect(measureTitleWidth('mmm')).toBeGreaterThan(measureTitleWidth('ııı'));
    expect(measureTitleWidth('şğüöç')).toBeGreaterThan(0);
  });
});
