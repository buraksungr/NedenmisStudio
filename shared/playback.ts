import type { Scene } from './types.js';

/**
 * Önizleme ve MP4 dışa aktarımı aynı zaman modelini kullanmak zorundadır.
 * Bu dosya tek doğruluk kaynağıdır: sahne başlangıçları, geçiş pencereleri ve
 * oynatma başlığındaki (playhead) sahne seçimi buradan hesaplanır.
 */

/** Önizleme ve dışa aktarımın ortak kare hızı. */
export const FRAME_RATE = 30;

/**
 * Verilen değeri en yakın tam kareye (30 FPS) oturtur. Geçiş pencereleri ve
 * kesme noktaları tam kare olmazsa birleştirme sırasında kareler tekilleşir ve
 * toplam kare sayısı beklenenden düşük çıkar (ör. 52 s'lik kurgu 20 s'ye iner).
 */
export function snapToFrame(seconds: number): number {
  return Math.round(seconds * FRAME_RATE) / FRAME_RATE;
}

/** Geçişli sahnelerde xfade/soluklaşma penceresinin süresi (saniye) — 9 kare. */
export const CROSSFADE_SECONDS = 10 / FRAME_RATE;
/** `transition: 'none'` sahnelerde iki klip arasında bırakılan en küçük bindirme. */
export const HARD_CUT_OVERLAP_SECONDS = 0.01;
/** İlk sahnenin giriş soluklaşması en fazla bu süre kadar sürer. */
export const FIRST_SCENE_FADE_SECONDS = 0.5;

/**
 * Bir zamanı, xfade `offset` gibi FFmpeg ifadelerine yazılacak biçime getirir.
 *
 * Kritik: `toFixed(6)` bir sınırın ALTINA yuvarlayabilir. Örnek: 16.3333333…
 * → `16.333333`, yani 490. kareden 0.3 µs ÖNCE. FFmpeg bu durumda gelen klibin
 * son karesini düşürür ve MP4 beklenenden 1 kare kısa çıkar (ölçüldü: 818/819).
 * Bu yüzden değeri önce kare ızgarasına oturtup 1e-9 yukarı itiyoruz: ifade asla
 * bir kare sınırının gerisinde kalmaz, kare sayısı da tam kalır.
 */
export function frameExactSeconds(seconds: number): string {
  const frames = Math.round(seconds * FRAME_RATE);
  return (frames / FRAME_RATE + 1e-9).toFixed(9);
}

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
  // Sert kesmede bindirme yok: 10 ms'lik bir pencere 30 FPS'te yarım karedir ve
  // birleştirmede kare tekilleşmesine yol açar. Kesme, pencere başlangıcında
  // doğrudan yeni sahneye geçer (aşağıdaki transitionAt ile aynı kural).
  if (next.scene.transition === 'none') return 0;
  return snapToFrame(CROSSFADE_SECONDS);
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
    // Sert kesmede pencere yoktur: sınırda doğrudan yeni sahne gösterilir.
    if (slot.scene.transition === 'none') return slot.start === safe ? { outgoingIndex: index - 1, incomingIndex: index, progress: 1, duration: 0 } : undefined;
    const duration = CROSSFADE_SECONDS;
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

/**
 * Önizlemedeki geçiş türünü xfade karşılığına çevirir.
 *
 * Kaynak doğrulaması (FFmpeg n6.1 `libavfilter/vf_xfade.c`):
 *  - `fade` → `mix(xf0, xf1, progress)`, yani düz doğrusal karışım; siyah kare yok.
 *  - `dissolve` → `smooth >= 0.5 ? a : b`, yani piksel gürültüsüyle anlık seçim;
 *    yumuşak bir karışım DEĞİL.
 * Önizleme "fade" ve "dissolve" geçişlerini alfa karışımı olarak çizdiği için
 * ikisi de xfade'de `fade`ya karşılık gelir. `dissolve`a eşlemek önizlemeden
 * görünür biçimde farklı, gürültülü bir geçiş üretirdi.
 */
export function exportTransitionKind(transition: Scene['transition']): 'fade' | 'slideleft' {
  return transition === 'slide' ? 'slideleft' : 'fade';
}

/** Sahne sınırlarında oynatma başlığı için kullanılabilir hedef listesi. */
export function sceneBoundaries(timeline: PlaybackTimeline): number[] {
  return [...timeline.starts, timeline.duration].map((value) => Number(value.toFixed(6)));
}
