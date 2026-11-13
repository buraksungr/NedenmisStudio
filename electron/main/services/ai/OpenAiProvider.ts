import type { ConnectionTestResult, Project } from '../../../../shared/types.js';
import type { CredentialStore } from '../../infrastructure/CredentialStore.js';
import type { LlmProvider, SceneDirection, ScriptGenerationInput } from './LlmProvider.js';

function scriptPrompt(input: ScriptGenerationInput): string {
  const sources = input.research.sources.map((source, index) => `KAYNAK ${index + 1}: ${source.title}\n${source.url}\n${source.snippet}`).join('\n\n');
  return `Türkçe YouTube Shorts anlatım metni yaz. Konu: ${input.topic}. Kategori: ${input.category}. Hedef süre: ${input.targetDuration} saniye. Anlatım: ${input.narrationStyle}. Ek talimat: ${input.instructions || 'yok'}.\nTam üç paragraf kullan: ilk paragraf konuya özgü güçlü ve kısa bir merak kancası; orta paragraf temel mekanizmayı kısa, doğal ve konuşma diline yakın cümlelerle açıklama; son paragraf önceki cümleleri tekrarlamayan, akılda kalıcı tek cümlelik sonuç. Yaklaşık ${Math.round(input.targetDuration * 2.2)} kelime kullan. Genel girişler, 'Kısacası', 'Bir dahaki sefere', tekrarlı kapanışlar ve gereksiz akademik dil kullanma. Başlık, madde işareti, bölüm etiketi, sahne etiketi ve kaynakça yazma; yalnızca seslendirilecek doğal Türkçe paragraflar üret. Uydurma bilgi, sayı veya kaynak ekleme. Kesin olmayan iddiaları kesinmiş gibi sunma.\n${sources ? `Yalnızca aşağıdaki kaynak özetlerinde desteklenen olguları kullan:\n${sources}` : 'Araştırma kaynağı yok. Kesin olgular uydurma; genel ve temel bilimsel açıklamada kal, emin olmadığın ayrıntıları çıkar.'}`;
}

export class OpenAiProvider implements LlmProvider {
  readonly id = 'openai'; readonly name = 'OpenAI';
  constructor(private readonly credentials: CredentialStore) {}
  private async chat(prompt: string, json = false): Promise<string> {
    const key = this.credentials.get(this.id); if (!key) throw new Error('OpenAI API anahtarı Ayarlar bölümünden eklenmelidir.');
    const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000), body: JSON.stringify({ model: 'gpt-4o-mini', temperature: .7, messages: [{ role: 'system', content: 'Nedenmiş kanalı için bilimsel sorumluluk taşıyan, doğal Türkçe yazan kısa video senaryo editörüsün.' }, { role: 'user', content: prompt }], ...(json ? { response_format: { type: 'json_object' } } : {}) }) });
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || `OpenAI isteği başarısız (${response.status}).`);
    const content = data.choices?.[0]?.message?.content?.trim(); if (!content) throw new Error('OpenAI boş bir yanıt döndürdü.'); return content;
  }
  generateScript(input: ScriptGenerationInput): Promise<string> { return this.chat(scriptPrompt(input)); }
  async directScenes(project: Project): Promise<SceneDirection[]> {
    const content = await this.chat(`Aşağıdaki Türkçe anlatımı en fazla ${Math.max(3, Math.ceil(project.targetDuration / 10))} sahneye böl. Her sahne anlatımla doğrudan ilgili, bilimsel süreci gösteren özgün bir dikey video görseli olsun; rastgele stok görüntü önerme. JSON şeması: {"scenes":[{"narration":"metnin değiştirilmemiş bölümü","visualDescription":"Türkçe sahne yönetmeni açıklaması","visualPrompt":"1080x1920 görsel üretim istemi, altyazısız"}]}. Metin: ${project.script}`, true);
    const parsed = JSON.parse(content) as { scenes?: SceneDirection[] }; if (!parsed.scenes?.length) throw new Error('Sahne yanıtı okunamadı.'); return parsed.scenes;
  }
  rewrite(_project: Project, selectedText: string, instruction: string): Promise<string> { return this.chat(`Aşağıdaki Türkçe metni şu talimatla yeniden yaz: ${instruction}. Anlamı ve olgusal doğruluğu koru, yalnızca yeni metni döndür.\n\n${selectedText}`); }
  async test(): Promise<ConnectionTestResult> { const started = Date.now(); try { await this.chat('Yalnızca "Hazır" yaz.'); return { ok: true, message: 'OpenAI bağlantısı ve metin üretimi doğrulandı.', latencyMs: Date.now() - started }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'OpenAI testi başarısız.' }; } }
}
