import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioClip, Project, Scene } from '@shared/types';
import {
  buildPlaybackTimeline, clampPlayhead, openingFadeOpacity, sceneIndexAt, sceneLocalTime, transitionAt,
  type PlaybackTimeline, type TransitionState,
} from '@shared/playback';

interface Options { project: Project | undefined; muted: boolean }

/** Projenin bittiği kabul edilen eşik: bu noktadan sonra Play videoyu baştan başlatır. */
const END_TOLERANCE = 0.02;

export interface PlaybackState {
  /** Tarayıcının bildirdiği gerçek anlatım süreleri (anahtar: `narration:<sceneId>`). */
  narrationDurations: Record<string, number>;
  playing: boolean;
  /** Oynatma başlığındaki mutlak zaman. */
  currentTime: number;
  duration: number;
  timeline: PlaybackTimeline;
  currentScene?: Scene;
  currentIndex: number;
  /** Sahnenin kendi başlangıcına göre yerel zamanı (animasyon kare zamanı). */
  localTime: number;
  activeCues: Scene['subtitles'];
  musicClip?: AudioClip;
  sfxClip?: AudioClip;
  transition?: TransitionState;
  incomingScene?: Scene;
  transitionProgress: number;
  openingOpacity: number;
  seek(time: number): void;
  play(): void;
  pause(): void;
  toggle(): void;
  restart(): void;
  step(delta: number): void;
  /** Sahne/müzik/efekt ses elemanlarını oynatma saatine bağlar. */
  registerAudio(key: string, element: HTMLAudioElement | null): void;
}

/**
 * Editör önizlemesinin gerçek video oynatıcısı.
 *
 * Kök neden: eski önizleme zamanı yalnızca `<audio>` elemanının `timeupdate`
 * olayıyla ilerliyordu. Anlatımı olmayan sahnede 50 ms'lik bir sayaç devreye
 * giriyor, anlatım sesi biten sahnede ise zaman bir sonraki sahneye sıçrıyordu.
 * Bu yüzden oynatma başlığı duruyor ve önizleme ilk sahnede kalıyordu.
 *
 * Yeni model tek bir `requestAnimationFrame` saatinden beslenir; anlatım, müzik
 * ve efekt sesleri bu saate tabi kölelerdir. Böylece sesler, altyazılar,
 * animasyonlar ve sahne geçişleri aynı oynatma başlığını izler.
 */
export function usePlayback({ project, muted }: Options): PlaybackState {
  const timeline = useMemo(() => buildPlaybackTimeline(project?.scenes || []), [project?.scenes]);
  const duration = timeline.duration;
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [narrationDurations, setNarrationDurations] = useState<Record<string, number>>({});

  const timeRef = useRef(0);
  const durationRef = useRef(duration); durationRef.current = duration;
  const projectRef = useRef(project); projectRef.current = project;
  const clockRef = useRef<{ origin?: number; startAt: number } | undefined>(undefined);
  /** Aynı React turunda okunabilmesi için oynatma durumunun eşzamanlı kopyası. */
  const playingNow = useRef(false);
  const setPlayingState = useCallback((next: boolean) => { playingNow.current = next; setPlaying(next); }, []);
  void playing; void setPlaying;
  const frameRef = useRef(0);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  const commit = useCallback((time: number) => {
    const safe = clampPlayhead(time, durationRef.current);
    timeRef.current = safe;
    setCurrentTime(safe);
    return safe;
  }, []);

  // Proje kimliği değişince oynatma sıfırlanır; süre düzenlemeleri başlığı
  // korur, yalnızca yeni sınırın dışına taşarsa sabitler.
  useEffect(() => { setPlayingState(false); clockRef.current = undefined; commit(0); }, [project?.id, commit, setPlayingState]);
  useEffect(() => { if (timeRef.current > duration) commit(duration); }, [duration, commit]);

  /**
   * Oynatma saati sahibidir; medya elemanları ona tabidir. Bir kez oynatılan
   * sahnede ses elemanı bittiğinde video ilerlemeye devam eder.
   */
  const seek = useCallback((time: number) => {
    const safe = commit(time);
    // Oynatma sırasında arama: saat bir sonraki karede yeniden çapalanır.
    if (playingNow.current) clockRef.current = { startAt: safe };
    return safe;
  }, [commit]);
  const play = useCallback(() => {
    if (!durationRef.current) return;
    // Sonda "Oynat"a basmak videoyu baştan başlatır; aksi hâlde ilk kare
    // hemen süre sonuna eşitlenip oynatma anında biterdi.
    const startAt = timeRef.current >= durationRef.current - END_TOLERANCE ? commit(0) : timeRef.current;
    clockRef.current = { startAt };
    setPlayingState(true);
  }, [commit, setPlayingState]);
  const pause = useCallback(() => { clockRef.current = undefined; setPlayingState(false); }, [setPlayingState]);
  const toggle = useCallback(() => { if (playingNow.current) pause(); else play(); }, [pause, play]);
  const restart = useCallback(() => { commit(0); clockRef.current = { startAt: 0 }; setPlayingState(true); }, [commit, setPlayingState]);
  const step = useCallback((delta: number) => { pause(); commit(timeRef.current + delta); }, [commit, pause]);

  // Tek gerçek saat: oynatma başlığı her karede `requestAnimationFrame`
  // zaman damgasından türetilir. Ayrı bir duvar saati kullanılmaz; böylece
  // kare zamanı, ses senkronu ve oynatma başlığı aynı kaynağa dayanır.
  useEffect(() => {
    if (!playing) return;
    if (clockRef.current === undefined) clockRef.current = { startAt: timeRef.current };
    const tick = (now: number) => {
      const clock = clockRef.current;
      if (clock) {
        if (clock.origin === undefined) clock.origin = now;
        const next = clock.startAt + (now - clock.origin) / 1000;
        if (next >= durationRef.current) {
          commit(durationRef.current);
          clockRef.current = undefined;
          setPlayingState(false);
          return;
        }
        commit(next);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [playing, commit, setPlayingState]);

  // --- Sahne, altyazı ve geçiş bilgisi ---------------------------------------
  const currentIndex = sceneIndexAt(timeline, currentTime);
  const currentScene = currentIndex >= 0 ? timeline.slots[currentIndex]?.scene : undefined;
  const localTime = currentIndex >= 0 ? sceneLocalTime(timeline, currentIndex, currentTime) : 0;
  const activeCues = useMemo(
    () => (currentScene?.subtitles || []).filter((cue) => currentTime >= cue.start && currentTime < cue.end),
    [currentScene, currentTime],
  );
  const transition = transitionAt(timeline, currentTime);
  const incomingScene = transition ? timeline.slots[transition.incomingIndex]?.scene : undefined;
  const openingOpacity = openingFadeOpacity(timeline, currentTime);
  const musicClip = project?.audio.musicClips.find((clip) => currentTime >= clip.start && currentTime < clip.start + clip.duration);
  const sfxClip = project?.audio.sfxClips.find((clip) => currentTime >= clip.start && currentTime < clip.start + clip.duration);

  // --- Ses köleleri -----------------------------------------------------------
  const registerAudio = useCallback((key: string, element: HTMLAudioElement | null) => {
    if (!element) { audioRefs.current.delete(key); return; }
    audioRefs.current.set(key, element);
    // Tarayıcı medya motoru yüklendiği anda gerçek süreyi bildirir; sahte
    // sürelerle oynamak yerine bunu yalnızca tanı olarak yayınlarız.
    const report = () => { if (Number.isFinite(element.duration)) setNarrationDurations((current) => current[key] === element.duration ? current : { ...current, [key]: element.duration }); };
    element.addEventListener('loadedmetadata', report);
    element.addEventListener('durationchange', report);
    if (element.readyState >= 1) report();
  }, []);
  const getAudio = (key: string) => audioRefs.current.get(key) || null;

  const syncElement = (element: HTMLAudioElement | null, desired: number, limit: number, volume: number) => {
    if (!element) return;
    element.volume = muted ? 0 : Math.min(1, Math.max(0, volume));
    const target = Math.max(0, Math.min(desired, Math.max(0, limit)));
    if (playingNow.current) {
      if (Math.abs(element.currentTime - target) > .25) element.currentTime = target;
      if (element.paused) {
        // play() bazı ortamlarda değer döndürmez (eski WebView, test ortamı); olsa da
        // otomatik oynatma engeli saati durdurmaz — tek yetkili saat rAF'tir.
        try {
          const started = element.play() as Promise<void> | undefined;
          if (started?.catch) started.catch(() => undefined);
        } catch { /* Sessizce yutulur: saat ilerlemeye devam eder. */ }
      }
    } else element.pause();
  };

  useEffect(() => {
    const audio = project?.audio;
    if (currentScene) {
      syncElement(getAudio(`narration:${currentScene.id}`), Math.max(0, currentTime - (timeline.slots[currentIndex]?.start ?? 0)), (currentScene.duration || 0) - .06, Math.min(1, audio?.narrationVolume ?? 1));
    }
    const ducked = Boolean(audio?.musicDucking && currentScene?.narrationPath);
    if (musicClip) syncElement(getAudio(`music:${musicClip.id}`), currentTime - musicClip.start + musicClip.trimStart, musicClip.duration + musicClip.trimStart - .06, (audio?.musicVolume ?? 0) * (musicClip.volume || 1) * (ducked ? .4 : 1));
    if (sfxClip) syncElement(getAudio(`sfx:${sfxClip.id}`), currentTime - sfxClip.start + sfxClip.trimStart, sfxClip.duration + sfxClip.trimStart - .06, (audio?.sfxVolume ?? 0) * (sfxClip.volume || 1));
  }, [currentTime, currentScene, currentIndex, musicClip, sfxClip, muted, playing, timeline, project?.audio]);

  // Klavye: Boşluk oynat/duraklat, oklar 1 sn, Home/End başa/sona.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches('input,textarea,select,[contenteditable=true]')) return;
      if (event.code === 'Space') { event.preventDefault(); toggle(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
      else if (event.key === 'Home') { event.preventDefault(); seek(0); }
      else if (event.key === 'End') { event.preventDefault(); seek(durationRef.current); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [seek, step, toggle]);

  // Proje kapanırken hiçbir ses çalmaya devam etmemeli.
  useEffect(() => () => { for (const element of audioRefs.current.values()) element.pause(); audioRefs.current.clear(); }, []);

  return {
    playing, currentTime, duration, timeline, currentScene, currentIndex, localTime, activeCues, musicClip, sfxClip,
    transition, incomingScene, transitionProgress: transition?.progress ?? 0, openingOpacity,
    seek, play, pause, toggle, restart, step, registerAudio, narrationDurations,
  };
}
