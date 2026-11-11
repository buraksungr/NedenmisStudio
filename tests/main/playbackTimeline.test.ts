import { describe, expect, it } from 'vitest';
import {
  buildPlaybackTimeline, clampPlayhead, openingFadeOpacity, outgoingTransitionSeconds, sceneBoundaries,
  sceneIndexAt, sceneLocalTime, transitionAt, CROSSFADE_SECONDS, FRAME_RATE, snapToFrame,
} from '../../shared/playback.js';
import type { Scene } from '../../shared/types.js';
import { createIceAnimationProject } from '../fixtures/iceAnimationProject.js';
import { createSkyAnimationProject } from '../fixtures/skyAnimationProject.js';

function scenesOf(durations: number[], transition: Scene['transition'] = 'fade'): Scene[] {
  return durations.map((duration, index) => ({ ...createSkyAnimationProject().scenes[0], id: `s${index + 1}`, number: index + 1, duration, transition }));
}

describe('Paylaşılan oynatma zaman modeli', () => {
  it('sahne başlangıçlarını ve toplam süreyi sahne sürelerinden türetir', () => {
    const timeline = buildPlaybackTimeline(scenesOf([4, 15.1, 5.14]));
    expect(timeline.starts).toEqual([0, 4, 19.1]);
    expect(timeline.duration).toBeCloseTo(24.24, 6);
    expect(sceneBoundaries(timeline)).toEqual([0, 4, 19.1, 24.24]);
  });

  it('50 saniyelik altı sahneli projede her zaman damgasını doğru sahneye eşler', () => {
    const timeline = buildPlaybackTimeline(scenesOf([8, 9, 7.5, 10, 9.5, 6]));
    expect(timeline.duration).toBeCloseTo(50, 6);
    const probes: Array<[number, number]> = [[0, 0], [7.999, 0], [8, 1], [16.9, 1], [17, 2], [24.4, 2], [24.5, 3], [34.4, 3], [34.5, 4], [43.9, 4], [44, 5], [49.999, 5], [50, 5]];
    for (const [time, expected] of probes) expect(sceneIndexAt(timeline, time), `t=${time}`).toBe(expected);
  });

  it('oynatma başlığını proje sınırlarına sabitler ve NaN üretmez', () => {
    const timeline = buildPlaybackTimeline(scenesOf([2, 2]));
    expect(clampPlayhead(-5, timeline.duration)).toBe(0);
    expect(clampPlayhead(99, timeline.duration)).toBe(4);
    expect(clampPlayhead(Number.NaN, timeline.duration)).toBe(0);
    expect(sceneLocalTime(timeline, 1, 2.5)).toBeCloseTo(.5, 6);
  });

  it('geçiş penceresi dışa aktarımla aynı süreyi kullanır', () => {
    const fade = buildPlaybackTimeline(scenesOf([2, 2, 2], 'fade'));
    expect(outgoingTransitionSeconds(fade, 0)).toBe(CROSSFADE_SECONDS);
    expect(outgoingTransitionSeconds(fade, 2)).toBe(0);
    expect(transitionAt(fade, 2.1)?.incomingIndex).toBe(1);
    // Pencerenin ortası tam olarak 0.5 olmalı — pencere artık tam kareye oturur.
    expect(transitionAt(fade, 2 + CROSSFADE_SECONDS / 2)?.progress).toBeCloseTo(.5, 6);
    expect(transitionAt(fade, 2.1)?.progress).toBeCloseTo(.1 / CROSSFADE_SECONDS, 4);
    // Pencere tam kare olmalı; yarım karelik pencereler birleştirmede kare yutar.
    expect(Math.round(CROSSFADE_SECONDS * FRAME_RATE)).toBeCloseTo(CROSSFADE_SECONDS * FRAME_RATE, 9);
    expect(transitionAt(fade, 1.5)).toBeUndefined();
    // Sert kesme: bindirme yok, sınırda doğrudan yeni sahne.
    const cuts = buildPlaybackTimeline(scenesOf([2, 2], 'none'));
    expect(outgoingTransitionSeconds(cuts, 0)).toBe(0);
    expect(transitionAt(cuts, 1.999)).toBeUndefined();
    expect(transitionAt(cuts, 2)?.incomingIndex).toBe(1);
  });

  it('ilk sahnenin açılış soluklaşması dışa aktarımla aynı eğridedir', () => {
    const timeline = buildPlaybackTimeline(scenesOf([4, 2]));
    expect(openingFadeOpacity(timeline, 0)).toBe(0);
    expect(openingFadeOpacity(timeline, .25)).toBeCloseTo(.5, 6);
    expect(openingFadeOpacity(timeline, 1)).toBe(1);
    const hardCut = buildPlaybackTimeline(scenesOf([4, 2], 'none'));
    expect(openingFadeOpacity(hardCut, 0)).toBe(1);
  });

  it('dört sahneli 50 saniyelik kurguda geçişler toplam süreyi değiştirmez', () => {
    const project = createIceAnimationProject(12.5);
    const timeline = buildPlaybackTimeline(project.scenes);
    expect(timeline.duration).toBeCloseTo(50, 6);
    expect(timeline.starts).toEqual([0, 12.5, 25, 37.5]);
    expect(sceneIndexAt(timeline, 49.9)).toBe(3);
  });

  it('geçiş pencereleri tam kareye oturur ve kare kaybını önler', () => {
    // Ölçülen hata: tam kare olmayan pencere, birleştirmede kare tekilleşmesine
    // ve 21 saniyelik kurgunun 20.9 saniyeye inmesine yol açıyordu.
    for (const value of [0.3333333, 0.32, 1.017, 2.4999]) expect(snapToFrame(value) * FRAME_RATE).toBeCloseTo(Math.round(snapToFrame(value) * FRAME_RATE), 9);
    const timeline = buildPlaybackTimeline(scenesOf([5, 6, 5.5, 4.5]));
    expect(timeline.duration).toBe(21);
    expect(outgoingTransitionSeconds(timeline, 0) * FRAME_RATE).toBeCloseTo(Math.round(outgoingTransitionSeconds(timeline, 0) * FRAME_RATE), 9);
  });
});
