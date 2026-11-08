import { describe, expect, it } from 'vitest';
import { LocalScriptProvider } from '../../electron/main/services/ai/LocalScriptProvider.js';
import { OfflineResearchProvider } from '../../electron/main/services/research/ResearchProviders.js';
import { parseEdgeVtt } from '../../electron/main/services/tts/EdgeTtsProvider.js';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { SettingsRepository } from '../../electron/main/infrastructure/database/SettingsRepository.js';
import { SettingsService } from '../../electron/main/services/settings/SettingsService.js';
import type { CredentialStore } from '../../electron/main/infrastructure/CredentialStore.js';

describe('Sağlayıcı davranışları', () => {
  it('çevrimdışı araştırma yapılmış gibi davranmaz', async () => { const result = await new OfflineResearchProvider().research(); expect(result.status).toBe('unavailable'); expect(result.sources).toHaveLength(0); expect(result.note).toContain('araştırması yapılmadı'); });
  it('yerel senaryo kaynak yokken olgu uydurmak yerine taslağı belirtir', async () => { const script = await new LocalScriptProvider().generateScript({ topic: 'Deneme konusu', category: 'Bilim', targetDuration: 45, narrationStyle: 'belgesel', instructions: '', research: { status: 'unavailable', sources: [] } }); expect(script).toContain('çevrimdışı yapısal taslak'); expect(script).toContain('doğrulanmamış bir olgu'); });
  it('yerel senaryo gerçek araştırma özetlerini kullanır', async () => { const script = await new LocalScriptProvider().generateScript({ topic: 'Işık', category: 'Bilim', targetDuration: 30, narrationStyle: 'belgesel', instructions: '', research: { status: 'completed', sources: [{ id: 's1', title: 'Kaynak', url: 'https://example.com', snippet: 'Işık bir dalgadır.', retrievedAt: new Date().toISOString(), claims: [{ text: 'Işık bir dalgadır. Parçacık gibi de davranabilir.', confidence: 'uncertain' }] }] } }); expect(script).toContain('Işık bir dalgadır'); });
  it('Edge kelime sınırlarını okunabilir altyazı ifadelerinde gruplar', () => { const cues = parseEdgeVtt('WEBVTT\n\n00:00:00.000 --> 00:00:00.400\nMerak\n\n00:00:00.400 --> 00:00:00.900\netmek\n\n00:00:01.000 --> 00:00:01.600\ngüzeldir.'); expect(cues.length).toBeGreaterThan(0); expect(cues[0].text).toContain('Merak'); expect(cues.at(-1)!.end).toBe(1.6); });
  it('sağlayıcı ayarları renderer’a API anahtarı döndürmez', () => { const db = new AppDatabase(':memory:'); const credentials = { has: (id: string) => id === 'openai' } as unknown as CredentialStore; const service = new SettingsService(new SettingsRepository(db), credentials, '/tmp/nedenmis'); const settings = service.get(); expect(settings.providers.find((p) => p.id === 'openai')?.configured).toBe(true); expect(JSON.stringify(settings)).not.toContain('apiKey'); expect(JSON.stringify(settings)).not.toContain('sk-'); expect(service.update({ theme: 'light' }).theme).toBe('light'); db.close(); });
});
