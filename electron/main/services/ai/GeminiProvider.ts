import type { ConnectionTestResult, Project } from '../../../../shared/types.js';
import type { CredentialStore } from '../../infrastructure/CredentialStore.js';
import type { LlmProvider, ScriptGenerationInput } from './LlmProvider.js';

export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini'; readonly name = 'Google Gemini';
  constructor(private readonly credentials: CredentialStore) {}
  private async generate(prompt: string): Promise<string> {
    const key = this.credentials.get(this.id); if (!key) throw new Error('Gemini API anahtarı Ayarlar bölümünden eklenmelidir.');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000), body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: .7 } }) });
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || `Gemini isteği başarısız (${response.status}).`);
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim(); if (!text) throw new Error('Gemini boş yanıt döndürdü.'); return text;
  }
  async generateScript(input: ScriptGenerationInput): Promise<string> {
    const research = input.research.sources.map((s) => `${s.title}: ${s.snippet}`).join('\n');
    return this.generate(`Nedenmiş kanalı için ${input.targetDuration} saniyelik, ${input.narrationStyle} tonda Türkçe Shorts anlatımı yaz. Konu: ${input.topic}. Ek not: ${input.instructions}. Tam üç paragraf üret: (1) konuya özgü, güçlü ve kısa merak kancası; (2) kısa cümlelerle temel bilimsel açıklama; (3) tekrar etmeyen, akılda kalıcı tek cümlelik sonuç. 'Kısacası', 'Bir dahaki sefere' ve genel geçer kapanışlar kullanma. Gereksiz giriş, akademik dolgu ve tekrar ekleme. Yalnızca seslendirilecek metni ver; başlık veya bölüm etiketi yazma, uydurma olgu ve kaynak ekleme. Kaynaklar:\n${research || 'Kaynak yok; kesin ve şüpheli ayrıntılardan kaçın.'}`);
  }
  rewrite(_project: Project, selectedText: string, instruction: string): Promise<string> { return this.generate(`Türkçe metni "${instruction}" talimatına göre yeniden yaz; olguları değiştirme ve sadece yeni metni ver:\n${selectedText}`); }
  async test(): Promise<ConnectionTestResult> { const started = Date.now(); try { await this.generate('Yalnızca Hazır yaz.'); return { ok: true, message: 'Gemini bağlantısı ve metin üretimi doğrulandı.', latencyMs: Date.now() - started }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Gemini testi başarısız.' }; } }
}
