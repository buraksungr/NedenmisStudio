import type { Scene, ScriptSections } from './types.js';

const empty: ScriptSections = { hook: '', explanation: '', conclusion: '' };

export function composeScript(sections: ScriptSections): string {
  return [sections.hook, sections.explanation, sections.conclusion].map((part) => part.trim()).filter(Boolean).join('\n\n');
}

function valid(sections: ScriptSections): boolean {
  return Boolean(sections.hook.trim() && sections.explanation.trim() && sections.conclusion.trim());
}

function sentences(text: string): string[] {
  return (text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).map((item) => item.trim()).filter(Boolean);
}

function labeledSections(script: string): ScriptSections | undefined {
  const expression = /(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*\*)?(kanca|hook|aç[iı]klama|gelişme|sonuç)(?:\*\*)?\s*:?[ \t]*(?:\n|$)/giu;
  const matches = [...script.matchAll(expression)];
  if (!matches.some((match) => /sonuç/i.test(match[1])) || !matches.some((match) => /kanca|hook/i.test(match[1]))) return undefined;
  const sections = { ...empty };
  matches.forEach((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : script.length;
    const value = script.slice(start, end).trim();
    if (/kanca|hook/i.test(match[1])) sections.hook += `${sections.hook ? '\n\n' : ''}${value}`;
    else if (/sonuç/i.test(match[1])) sections.conclusion += `${sections.conclusion ? '\n\n' : ''}${value}`;
    else sections.explanation += `${sections.explanation ? '\n\n' : ''}${value}`;
  });
  return valid(sections) ? sections : undefined;
}

/** Düz metni veya etiketli sağlayıcı yanıtını üç zorunlu anlatım bölümüne ayırır. */
export function parseScriptSections(script: string): ScriptSections {
  const clean = script.trim();
  const labeled = labeledSections(clean);
  if (labeled) return labeled;
  const paragraphs = clean.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length >= 3) {
    const sections = { hook: paragraphs[0], explanation: paragraphs.slice(1, -1).join('\n\n'), conclusion: paragraphs.at(-1)! };
    if (valid(sections)) return sections;
  }
  const parts = sentences(clean);
  if (parts.length >= 3) {
    const sections = { hook: parts[0], explanation: parts.slice(1, -1).join(' '), conclusion: parts.at(-1)! };
    if (valid(sections)) return sections;
  }
  throw new Error('Senaryo; boş olmayan kanca, açıklama ve sonuç bölümlerinden oluşmalıdır. Sonuç cümlesini ayrı bir paragraf olarak ekleyin.');
}

export function scriptSectionsFromScenes(scenes: Scene[]): ScriptSections | undefined {
  const sections = {
    hook: scenes.filter((scene) => scene.section === 'hook').map((scene) => scene.narration.trim()).filter(Boolean).join(' '),
    explanation: scenes.filter((scene) => scene.section === 'explanation').map((scene) => scene.narration.trim()).filter(Boolean).join(' '),
    conclusion: scenes.filter((scene) => scene.section === 'conclusion').map((scene) => scene.narration.trim()).filter(Boolean).join(' '),
  };
  return valid(sections) ? sections : undefined;
}
