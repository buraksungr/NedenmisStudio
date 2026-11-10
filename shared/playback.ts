import type { Scene } from './types.js';

/**
 * Önizleme ve MP4 dışa aktarımı aynı zaman modelini kullanmak zorundadır.
 * Bu dosya tek doğruluk kaynağıdır: sahne başlangıçları, geçiş pencereleri ve
 * oynatma başlığındaki (playhead) sahne seçimi buradan hesaplanır.
 */

/** Geçişli sahnelerde xfade/soluklaşma penceresinin süresi (saniye). */
export const CROSSFADE_SECONDS = 0.32;
/** `transition: 'none'` sahnelerde iki klip arasında bırakılan en küçük bindirme. */
export const HARD_CUT_OVERLAP_SECONDS = 0.01;
/** İlk sahnenin giriş soluklaşması en fazla bu süre kadar sürer. */
export const FIRST_SCENE_FADE_SECONDS = 0.5;

export interface SceneSlot {
  scene: Scene;
  index: number;
  /** Zaman çizelgesindeki mutlak başlangıç. */
  start: number;
  /** Zaman çizelgesindeki mutlak bitiş (start + duration). */
  end: number;
  duration: number;
}

export interface PlaybackTimeline {
  slots: SceneSlot[];
  starts: number[];
  duration: number;
}

/**
 * Sahnelerin `duration` değerlerinden zaman çizelgesini üretir. Dışa aktarım da
 * bu süreleri kullanır: toplam süre her zaman sahne sürelerinin toplamıdır,
 * geçişler yalnızca komşu klipleri bindirir (toplam süreyi kısaltmaz).
 */
export function buildPlaybackTimeline(scenes: Scene[]): PlaybackTimeline {
  const slots: SceneSlot[] = [];
  const starts: number[] = [];
  let cursor = 0;
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const duration = Math.max(0, Number.isFinite(scene.duration) ? scene.duration : 0);
    starts.push(Number(cursor.toFixed(6)));
    slots.push({ scene, index, start: cursor, end: cursor + duration, duration });
    cursor += duration;
  }
  return { slots, starts, duration: Number(cursor.toFixed(6)) };
}

/** Oynatma başlığındaki zamanı [0, süre] aralığına sabitler. */
export function clampPlayhead(time: number, duration: number): number {
  if (!Number.isFinite(time)) return 0;
  return Math.min(Math.max(0, duration), Math.max(0, time));
}

/**
 * Verilen mutlak zamanda hangi sahnenin gösterileceğini belirler.
 * Bitiş anı bir sonraki sahneye aittir; son sahnenin sonu son sahneyi korur.
 */
export function sceneIndexAt(timeline: PlaybackTimeline, time: number): number {
  if (!timeline.slots.length) return -1;
  const safe = clampPlayhead(time, timeline.duration);
  for (let index = 0; index < timeline.slots.length; index += 1) {
    const slot = timeline.slots[index];
    if (safe < slot.end) return index;
  }
  return timeline.slots.length - 1;
}

/** Bir sahnenin oynatma başlığındaki yerel zamanı (kendi başlangıcına göre). */
export function sceneLocalTime(timeline: PlaybackTimeline, index: number, time: number): number {
  const slot = timeline.slots[index];
  if (!slot) return 0;
  return clampPlayhead(time, timeline.duration) - slot.start;
}

/**
 * Verilen sahnenin sonundan sonraki klibe köprü oluşturan geçiş süresi.
 * Dışa aktarımda `nextTransition` olarak da bu değer kullanılır.
 */
export function outgoingTransitionSeconds(timeline: PlaybackTimeline, index: number): number {
  const next = timeline.slots[index + 1];
  if (!next) return 0;
  return next.scene.transition === 'none' ? HARD_CUT_OVERLAP_SECONDS : CROSSFADE_SECONDS;
}

export interface TransitionState {
  /** Sönmekte olan sahne. */
  outgoingIndex: number;
  incomingIndex: number;
  /** 0 → yalnızca giden sahne, 1 → yalnızca gelen sahne. */
  progress: number;
  duration: number;
}

/**
 * Oynatma başlığı bir geçiş penceresinde ise iki sahnenin karışım bilgisini
 * verir. Dışa aktarımdaki xfade penceresiyle birebir aynı aralıktır; böylece
 * önizleme ve MP4 aynı kareyi aynı zamanda gösterir.
 */
export function transitionAt(timeline: PlaybackTimeline, time: number): TransitionState | undefined {
  if (timeline.slots.length < 2) return undefined;
  const safe = clampPlayhead(time, timeline.duration);
  for (let index = 1; index < timeline.slots.length; index += 1) {
    const slot = timeline.slots[index];
    const duration = slot.scene.transition === 'none' ? HARD_CUT_OVERLAP_SECONDS : CROSSFADE_SECONDS;
    if (safe >= slot.start && safe < slot.start + duration) {
      return { outgoingIndex: index - 1, incomingIndex: index, progress: (safe - slot.start) / duration, duration };
    }
  }
  return undefined;
}

/**
 * İlk sahnenin açılış soluklaşması. Dışa aktarımdaki `fade=t=in` ile aynı
 * süre hesabıdır; önizleme de kararmadan başlar.
 */
export function openingFadeOpacity(timeline: PlaybackTimeline, time: number): number {
  const first = timeline.slots[0];
  if (!first || first.scene.transition === 'none') return 1;
  const fade = Math.min(FIRST_SCENE_FADE_SECONDS, first.duration / 3);
  if (fade <= 0) return 1;
  return clampPlayhead(time, fade) / fade;
}

/** Sahne sınırlarında oynatma başlığı için kullanılabilir hedef listesi. */
export function sceneBoundaries(timeline: PlaybackTimeline): number[] {
  return [...timeline.starts, timeline.duration].map((value) => Number(value.toFixed(6)));
}
