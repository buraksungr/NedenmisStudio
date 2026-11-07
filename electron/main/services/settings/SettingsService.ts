import { DEFAULT_IDENTITY, DEFAULT_SUBTITLE_STYLE, DEFAULT_VOICE, defaultSettings } from '../../../../shared/defaults.js';
import type { AppSettings, ChannelIdentity, ProviderPublicConfig } from '../../../../shared/types.js';
import type { SettingsRepository } from '../../infrastructure/database/SettingsRepository.js';
import type { CredentialStore } from '../../infrastructure/CredentialStore.js';
import { CHATTERBOX_SOURCE_REVISION } from '../tts/ChatterboxSource.js';

const DEFINITIONS: ProviderPublicConfig[] = [
  { id: 'local-script', kind: 'llm', name: 'Yerel senaryo taslağı', configured: true, requiresKey: false, description: 'Anahtarsız yapısal taslak; web kaynağı olmadan olgu üretmez.', referenceVoiceSupported: false, commercialNote: 'Tamamen yerel, ek lisans gerektirmez.', local: true },
  { id: 'openai', kind: 'llm', name: 'OpenAI', configured: false, requiresKey: true, description: 'Senaryo, yeniden yazma ve sahne yönetimi.', referenceVoiceSupported: false, commercialNote: 'Kullanım OpenAI koşullarına ve hesap kotanıza tabidir.', local: false },
  { id: 'gemini', kind: 'llm', name: 'Google Gemini', configured: false, requiresKey: true, description: 'Türkçe senaryo üretimi ve metin düzenleme.', referenceVoiceSupported: false, commercialNote: 'Kullanım Google AI koşullarına ve kotanıza tabidir.', local: false },
  { id: 'offline-curated', kind: 'research', name: 'Çevrimdışı konu havuzu', configured: true, requiresKey: false, description: 'Konu önerir; araştırma yapmış gibi davranmaz.', referenceVoiceSupported: false, commercialNote: 'Yerel içerik.', local: true },
  { id: 'web-search', kind: 'research', name: 'Bağımsız Web Arama', configured: true, requiresKey: false, description: 'Arama sonucu başlıkları ve özetleri; erişim ağ koşullarına bağlıdır.', referenceVoiceSupported: false, commercialNote: 'Kaynak içeriklerinin hakları sahiplerine aittir.', local: false },
  { id: 'tavily', kind: 'research', name: 'Tavily Web Araştırması', configured: false, requiresKey: true, description: 'Çok kaynaklı web arama ve içerik özetleri.', referenceVoiceSupported: false, commercialNote: 'Tavily kullanım koşulları ve kotası geçerlidir.', local: false },
  { id: 'chatterbox-multilingual-v3', kind: 'tts', name: 'Chatterbox Multilingual V3', configured: false, requiresKey: false, description: 'Yerel, gerçek zero-shot Türkçe ses klonlama. Yüklediğiniz referansı V3 modelinde kullanır; alternatif motora geçmez.', referenceVoiceSupported: true, commercialNote: 'MIT kod/model; resmî proje Ağustos 2026’da bakımsız araştırma olarak duyuruldu. Yalnızca izinli ses kullanın. Benzerlik ve ticari uygunluk yayın öncesi doğrulanmalıdır.', local: true, requirements: 'Yönetilen Python 3.11 + CPU PyTorch + V3 modeli; birkaç GB disk ve yeterli RAM' },
  { id: 'windows-sapi', kind: 'tts', name: 'Windows Türkçe Ses', configured: true, requiresKey: false, description: 'Kurulu Türkçe sistem sesleriyle çevrimdışı WAV üretimi.', referenceVoiceSupported: false, commercialNote: 'Windows seslerinin kullanım koşullarını inceleyin; doğallık kurulu sese bağlıdır.', local: true, requirements: 'Windows ve Türkçe konuşma paketi' },
  { id: 'edge-tts', kind: 'tts', name: 'Edge Neural Türkçe', configured: true, requiresKey: false, description: 'Ahmet ve Emel nöral sesleri; kelime zamanlaması döndürebilir.', referenceVoiceSupported: false, commercialNote: 'Resmî ticari kullanım garantisi verilmez; Microsoft koşullarını kontrol edin. Üretim için Azure önerilir.', local: false, requirements: 'İzole Python ortamı + edge-tts; internet' },
  { id: 'azure-speech', kind: 'tts', name: 'Azure AI Speech', configured: false, requiresKey: true, description: 'Türkçe kurumsal nöral konuşma sentezi.', referenceVoiceSupported: false, commercialNote: 'Azure kullanım koşulları ve ücretleri geçerlidir. Özel ses ayrıca onay gerektirir.', local: false, requirements: 'Azure Speech anahtarı ve bölgesi' },
  { id: 'procedural', kind: 'image', name: 'Yerel hareketli infografik', configured: true, requiresKey: false, description: 'Anlatıma özel diyagramlar, süreç görselleri ve kamera hareketleri.', referenceVoiceSupported: false, commercialNote: 'Uygulama içinde üretilir; harici görsel lisansı gerekmez.', local: true },
  { id: 'openai-images', kind: 'image', name: 'OpenAI Görsel Üretimi', configured: false, requiresKey: true, description: 'Sahne yönetmeni isteminden özgün dikey görsel üretimi.', referenceVoiceSupported: false, commercialNote: 'OpenAI koşulları ve görsel üretim ücretleri geçerlidir.', local: false },
];

export class SettingsService {
  constructor(private readonly repository: SettingsRepository, private readonly credentials: CredentialStore, private readonly initialStorage: string) {}
  get(): AppSettings {
    const settings = this.repository.get<AppSettings>('app', defaultSettings(this.initialStorage));
    const engine = this.repository.get<{ dependenciesInstalled?: boolean; sourceRevision?: string; modelDownloaded?: boolean }>('voice-engine-v3', {});
    const providers = DEFINITIONS.map((definition) => ({ ...definition, configured: definition.id === 'chatterbox-multilingual-v3' ? Boolean(engine.dependenciesInstalled && engine.sourceRevision === CHATTERBOX_SOURCE_REVISION && engine.modelDownloaded) : !definition.requiresKey || this.credentials.has(definition.id) }));
    return { ...settings, defaultVoice: { ...DEFAULT_VOICE, ...settings.defaultVoice }, providers };
  }
  update(patch: Partial<AppSettings>): AppSettings {
    const current = this.get(); const safePatch = { ...patch }; delete safePatch.providers;
    const next = { ...current, ...safePatch, language: 'tr' as const }; this.repository.set('app', next); return this.get();
  }
  identity(): ChannelIdentity { const value = this.repository.get<ChannelIdentity>('identity', DEFAULT_IDENTITY); return { ...DEFAULT_IDENTITY, ...value, subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE, ...value.subtitleStyle } }; }
  updateIdentity(identity: ChannelIdentity): ChannelIdentity { this.repository.set('identity', identity); return identity; }
  definitions(): ProviderPublicConfig[] { return this.get().providers; }
}
