import type { Scene, SubtitleCue } from './types.js';

export function id(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatTime(seconds: number, milliseconds = false): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const base = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return milliseconds ? `${base},${Math.floor((safe % 1) * 1000).toString().padStart(3, '0')}` : base;
}

export function turkishWordsPerMinute(style = 'belgesel'): number {
  return ({ energetic: 165, samimi: 150, sakin: 125, belgesel: 138 } as Record<string, number>)[style] || 138;
}

export function estimateSpeechDuration(text: string, style = 'belgesel', speed = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const punctuationPauses = (text.match(/[.!?]/g)?.length || 0) * 0.22 + (text.match(/[,;:]/g)?.length || 0) * 0.1;
  return Math.max(1.2, (words / turkishWordsPerMinute(style)) * 60 / speed + punctuationPauses);
}

function splitPhrases(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const chunks = normalized.match(/[^.!?,;:]+[.!?,;:]?|\S+/g) || [normalized];
  const phrases: string[] = [];
  for (const chunk of chunks) {
    const words = chunk.trim().split(' ');
    if (words.length <= 6) { if (chunk.trim()) phrases.push(chunk.trim()); continue; }
    for (let i = 0; i < words.length; i += 5) phrases.push(words.slice(i, i + 5).join(' '));
  }
  return phrases.filter(Boolean);
}

export function generateSubtitleCues(text: string, duration: number, sceneStart = 0): SubtitleCue[] {
  const phrases = splitPhrases(text);
  const weights = phrases.map((p) => Math.max(1, p.split(/\s+/).length + p.length / 45));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let cursor = sceneStart;
  return phrases.map((phrase, index) => {
    const phraseDuration = duration * weights[index] / total;
    const cue: SubtitleCue = {
      // Mutlak zamanlar 3 ondalığa yuvarlanır, ama sahne başlangıcından ÖNCE
      // düşmemeli: 10.7333 → 10.733 yuvarlaması cue'yu sahnenin başından
      // 0.33 ms öne taşıyordu (Windows CI 43284052377). İlk cue sahne başında başlar.
      id: id('cue'), start: index === 0 ? Number(sceneStart.toFixed(3)) : Math.max(Number(sceneStart.toFixed(3)), Number(cursor.toFixed(3))), // Son cue sahne bitişini AŞMAZ (3 ondalık yuvarlama 8.4667 → 8.467 yapıyordu).
      end: (() => { const raw = index === phrases.length - 1 ? sceneStart + duration : cursor + phraseDuration; return Math.min(Number(raw.toFixed(3)), Number((sceneStart + duration).toFixed(3))); })(),
      text: phrase,
      emphasis: phrase.split(/\s+/).filter((word) => /^\d|!|\?/.test(word) || word.length > 11).slice(0, 1),
    };
    cursor += phraseDuration;
    return cue;
  });
}

export function totalDuration(scenes: Scene[]): number {
  return scenes.reduce((sum, scene) => sum + scene.duration, 0);
}

export function sceneStartTimes(scenes: Scene[]): number[] {
  let cursor = 0;
  return scenes.map((scene) => { const current = cursor; cursor += scene.duration; return current; });
}

export function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character] || character);
}

export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex -- Dosya adlarından denetim karakterleri bilinçli olarak çıkarılır.
  return name.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Nedenmis-Video';
}
