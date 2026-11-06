import { id } from '../../../../shared/utils.js';
import type { ConnectionTestResult, ResearchResult, ResearchSource } from '../../../../shared/types.js';
import type { CredentialStore } from '../../infrastructure/CredentialStore.js';
import type { ResearchProvider } from './ResearchProvider.js';
import { unavailableResearch } from './ResearchProvider.js';

export class OfflineResearchProvider implements ResearchProvider {
  readonly id = 'offline-curated'; readonly name = 'Çevrimdışı konu havuzu';
  async research(): Promise<ResearchResult> { return unavailableResearch('Web araştırması yapılmadı. Kaynaklı araştırma için Tavily veya web arama sağlayıcısını seçin. Yerel konu önerileri araştırma yapılmış anlamına gelmez.'); }
  async test(): Promise<ConnectionTestResult> { return { ok: true, message: 'Çevrimdışı konu havuzu hazır; bu mod web araştırması yapmaz.' }; }
}

export class TavilyResearchProvider implements ResearchProvider {
  readonly id = 'tavily'; readonly name = 'Tavily Web Araştırması';
  constructor(private readonly credentials: CredentialStore) {}
  async research(topic: string, category: string): Promise<ResearchResult> {
    const apiKey = this.credentials.get(this.id);
    if (!apiKey) return unavailableResearch('Tavily API anahtarı tanımlı değil; araştırma yapılmadı.');
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ query: `${topic} ${category} scientific explanation facts`, search_depth: 'advanced', max_results: 6, include_answer: false, include_raw_content: false }),
    });
    if (!response.ok) throw new Error(`Tavily araştırması başarısız (${response.status}). Anahtarı ve internet bağlantısını kontrol edin.`);
    const data = await response.json() as { results?: Array<{ url: string; title: string; content?: string; score?: number }> };
    const sources: ResearchSource[] = (data.results || []).filter((item) => item.url && item.title).map((item) => ({
      id: id('source'), url: item.url, title: item.title, snippet: (item.content || '').slice(0, 1600), retrievedAt: new Date().toISOString(),
      claims: item.content ? [{ text: item.content.slice(0, 1200), confidence: 'uncertain' }] : [],
    }));
    if (!sources.length) return { status: 'failed', provider: this.name, sources: [], note: 'Arama tamamlandı ancak kullanılabilir kaynak bulunamadı.' };
    return { status: 'completed', provider: this.name, sources, note: 'Kaynak özetleri otomatik alınmıştır. İddialar doğrulanmış sayılmaz; senaryoyu yayımlamadan önce kaynakları inceleyin.' };
  }
  async test(): Promise<ConnectionTestResult> {
    if (!this.credentials.has(this.id)) return { ok: false, message: 'Tavily API anahtarı eksik.' };
    const started = Date.now();
    try { const result = await this.research('Rayleigh scattering sky', 'Bilim'); return { ok: result.status === 'completed', message: result.status === 'completed' ? 'Tavily bağlantısı ve kaynak getirme çalışıyor.' : result.note || 'Test tamamlanamadı.', latencyMs: Date.now() - started }; }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Tavily testi başarısız.' }; }
  }
}

interface DuckMatch { url: string; title: string; snippet: string }
function decode(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
}

/** Anahtarsız, HTML sonuçlarını kullanan sınırlı sağlayıcı. Sonuçlar erişilemezse bunu açıkça bildirir. */
export class DuckDuckGoResearchProvider implements ResearchProvider {
  readonly id = 'web-search'; readonly name = 'Bağımsız Web Arama';
  async research(topic: string): Promise<ResearchResult> {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(topic)}`, { headers: { 'User-Agent': 'NedenmisStudio/1.0 research-client' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) return unavailableResearch(`Web aramasına erişilemedi (HTTP ${response.status}).`);
    const html = await response.text();
    const blocks = html.split(/class="result results_links/g).slice(1, 7);
    const matches: DuckMatch[] = [];
    for (const block of blocks) {
      const link = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/);
      if (!link) continue;
      let url = decode(link[1]);
      try { const parsed = new URL(url); const redirect = parsed.searchParams.get('uddg'); if (redirect) url = redirect; } catch { continue; }
      if (!/^https?:\/\//.test(url)) continue;
      matches.push({ url, title: decode(link[2]), snippet: snippet ? decode(snippet[1]) : '' });
    }
    if (!matches.length) return unavailableResearch('Web aramasından kaynak ayrıştırılamadı. Ağ kısıtlaması olabilir; Tavily sağlayıcısını deneyin.');
    return {
      status: 'completed', provider: this.name, retrievedAt: undefined,
      sources: matches.map((item) => ({ id: id('source'), ...item, retrievedAt: new Date().toISOString(), claims: item.snippet ? [{ text: item.snippet, confidence: 'uncertain' }] : [] })),
      note: 'Yalnızca arama sonucu başlıkları ve özetleri alındı. Bunlar bağımsız doğrulama değildir; kaynak bağlantılarını kontrol edin.',
    } as ResearchResult;
  }
  async test(): Promise<ConnectionTestResult> { const started = Date.now(); try { const result = await this.research('why is the sky blue Rayleigh'); return { ok: result.status === 'completed', message: result.note || 'Web araması çalışıyor.', latencyMs: Date.now() - started }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Web araması kullanılamıyor.' }; } }
}
