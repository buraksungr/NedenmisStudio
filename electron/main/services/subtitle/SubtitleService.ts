import { writeFile } from 'node:fs/promises';
import type { Project, SubtitleCue, SubtitleStyle } from '../../../../shared/types.js';

function assColor(hex: string): string {
  const clean = hex.replace('#', '').padEnd(6, '0').slice(0, 6); return `&H00${clean.slice(4, 6)}${clean.slice(2, 4)}${clean.slice(0, 2)}`.toUpperCase();
}
function assTime(seconds: number): string {
  const safe = Math.max(0, seconds); const hours = Math.floor(safe / 3600); const mins = Math.floor(safe % 3600 / 60); const secs = Math.floor(safe % 60); const centis = Math.floor((safe % 1) * 100);
  return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}
function assText(cue: SubtitleCue, style: SubtitleStyle): string {
  let text = (style.uppercase ? cue.text.toLocaleUpperCase('tr-TR') : cue.text).replace(/\n/g, '\\N').replace(/[{}]/g, '');
  for (const emphasis of cue.emphasis || []) {
    if (!emphasis) continue; const escaped = emphasis.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'i'), `${style.uppercase ? emphasis.toLocaleUpperCase('tr-TR') : emphasis}`);
    const target = style.uppercase ? emphasis.toLocaleUpperCase('tr-TR') : emphasis;
    text = text.replace(target, `{\\c${assColor(style.highlightColor)}\\b1}${target}{\\c${assColor(style.color)}\\b0}`);
  }
  return text;
}

export class SubtitleService {
  createAss(project: Project): string {
    const style = project.subtitleStyle; const alignment = style.position === 'top' ? 8 : style.position === 'center' ? 5 : 2;
    const borderStyle = style.backgroundOpacity > 0 ? 3 : 1; const back = assColor(style.backgroundColor).replace('&H00', `&H${Math.round((1 - style.backgroundOpacity) * 255).toString(16).padStart(2, '0')}`);
    const header = `[Script Info]\nTitle: Nedenmiş Studio Altyazı\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Nedenmis,${style.fontFamily},${style.fontSize},${assColor(style.color)},${assColor(style.highlightColor)},${assColor(style.outlineColor)},${back},0,0,0,0,100,100,0,0,${borderStyle},${style.outlineWidth},0,${alignment},70,70,${style.position === 'bottom' ? 210 : 150},1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
    const events = project.scenes.flatMap((scene) => scene.subtitles).filter((cue) => cue.text.trim() && cue.end > cue.start)
      .sort((a, b) => a.start - b.start).map((cue) => `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Nedenmis,,0,0,0,,${assText(cue, style)}`).join('\n');
    return `${header}${events}\n`;
  }
  async write(project: Project, path: string): Promise<void> { await writeFile(path, this.createAss(project), 'utf8'); }
  filterArgument(path: string): string { const escaped = path.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'"); return `ass=filename='${escaped}'`; }
}
