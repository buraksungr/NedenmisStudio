import { estimateSpeechDuration } from '../../../../shared/utils.js';
import type { ConnectionTestResult, Project } from '../../../../shared/types.js';
import type { LlmProvider, ScriptGenerationInput } from './LlmProvider.js';

/**
 * Anahtarsız yapısal taslak üretir. Bilmediği olguları uydurmaz; araştırma özetlerini
 * kaynaklarıyla birlikte kullanır ve web yoksa metni doğrulanması gereken taslak olarak işaretler.
 */
export class LocalScriptProvider implements LlmProvider {
  readonly id = 'local-script'; readonly name = 'Yerel senaryo taslağı';
  async generateScript(input: ScriptGenerationInput): Promise<string> {
    const verifiedSnippets = input.research.sources.flatMap((source) => source.claims.map((claim) => claim.text)).filter(Boolean).slice(0, 3);
    const topic = input.topic.replace(/[.!?]+$/, '');
    const paragraphs: string[] = [];
    paragraphs.push(`${topic}… Peki bu sorunun ardındaki düşündürücü ayrıntı ne?`);
    if (verifiedSnippets.length) {
      const cleaned = verifiedSnippets.map((text) => text.replace(/\s+/g, ' ').replace(/\[[^\]]+\]/g, '').trim()).join(' ');
      const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [];
      paragraphs.push(sentences.slice(0, Math.max(2, Math.round(input.targetDuration / 25))).join(' ').trim() || 'Bu konuyu anlamak için kaynaklardaki temel açıklamayı adım adım ele alalım.');
    } else {
      paragraphs.push('Bu bir çevrimdışı yapısal taslaktır. Konunun nedenini ve temel mekanizmasını açıklamak için güvenilir kaynaklardan araştırma ekleyin; burada doğrulanmamış bir olgu yer almıyor.');
      paragraphs.push('Açıklamayı, önce gözlemlediğimiz olayla başlatıp ardından bu olayı oluşturan süreci basit bir örnekle gösterecek şekilde düzenleyin. Teknik terimleri yalnızca gerekli olduklarında kullanın.');
    }
    if (input.instructions) paragraphs.push(`Hazırlık notu: ${input.instructions}`);
    paragraphs.push(`Kısacası, ${topic.toLocaleLowerCase('tr-TR')} sorusu gördüğümüz şeyin ötesindeki süreci merak etmemizi sağlıyor. Bir dahaki sefere baktığınızda, bu ayrıntıyı da fark edeceksiniz.`);
    let script = paragraphs.filter(Boolean).join('\n\n');
    const targetWords = Math.round(input.targetDuration / 60 * 138);
    const words = script.split(/\s+/);
    if (words.length > targetWords * 1.25) script = words.slice(0, Math.max(45, targetWords)).join(' ') + '.';
    void estimateSpeechDuration(script, input.narrationStyle);
    return script;
  }
  async rewrite(project: Project, selectedText: string, instruction: string): Promise<string> {
    const clean = selectedText.trim();
    if (instruction === 'shorten') return clean.split(/\s+/).slice(0, Math.max(8, Math.round(clean.split(/\s+/).length * .65))).join(' ').replace(/[,;:]\s*([^.!?]*)$/, '') + (/[.!?]$/.test(clean) ? '' : '.');
    if (instruction === 'hook') return `Peki ${project.topic.toLocaleLowerCase('tr-TR')} sorusunun en şaşırtıcı yanı ne? ${clean}`;
    if (instruction === 'conclusion') return `${clean.replace(/[.!?]+$/, '')}. İşte sıradan görünen şeyleri olağanüstü yapan da tam olarak bu ayrıntı.`;
    return clean.replace(/\s+/g, ' ').replace(/\bçok\b/gi, 'oldukça').trim();
  }
  async test(): Promise<ConnectionTestResult> { return { ok: true, message: 'Yerel taslak hazır. Web araştırması olmadan olgusal içerik üretmez.' }; }
}
