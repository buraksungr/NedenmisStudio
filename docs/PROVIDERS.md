# Sağlayıcı genişletme rehberi

Nedenmiş Studio sağlayıcıları ana süreçte arayüzler üzerinden kayıt eder:

- `LlmProvider`: senaryo, sahne yönetimi ve yeniden yazma
- `ResearchProvider`: kaynaklı web araştırması
- `VisualProvider`: sahne varlığı üretimi
- `TtsProvider`: ses listesi, sentez, hız/perde ve referans yetenekleri

Yeni sağlayıcı sınıfını ilgili arayüzle yazın, `AppContext.ts` içindeki provider `Map` kaydına ekleyin ve `SettingsService.ts` içindeki genel tanımı oluşturun. Tanımda ticari kullanım notu, yerel/bulut durumu ve referans ses desteği doğru olmalıdır. Anahtarları `CredentialStore` ile alın; renderer'a döndürmeyin.

Araştırma sağlayıcıları yalnızca gerçekten erişilen URL'leri kaydetmelidir. Otomatik snippet'ler `uncertain` olarak işaretlenmelidir. TTS sağlayıcısı referans sesi kullanmıyorsa `referenceVoiceSupported=false` kalmalı ve sonuçta açıklayıcı `notice` döndürmelidir.

Render varlıkları proje depolama alanına yazılır. Ağır yerel modeller varsayılan olarak yüklenmemeli; CPU/RAM gereksinimi sağlayıcı tanımında gösterilmelidir.
