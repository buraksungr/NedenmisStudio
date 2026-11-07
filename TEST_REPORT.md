# Nedenmiş Studio — Test Raporu

**Test tarihi:** 6 Kasım 2026  
**Ortam:** Linux x64, Node.js 22.22.3, npm 10.9.8, CPU-only  
**Hedef platform:** Windows 10/11 x64

Bu rapor yalnızca gerçekten çalıştırılan testleri başarılı olarak gösterir. Windows pencere testi, Windows installer üretimi ve kimlik bilgisi gerektiren dış servis testleri bu ortamda yapılmamıştır.

## Çalıştırılan komutlar ve sonuçlar

| Komut / test | Sonuç | Açıklama |
|---|---|---|
| `npm install` / bağımlılık kurulumu | Başarılı | Sandbox ağ kısıtlarında Electron binary indirmesi atlandı; kaynak paketleri ve platform FFmpeg binary'leri kuruldu. Normal Windows kurulumu `npm ci` ile yapılır. |
| `npm run typecheck` | Başarılı | Renderer, Electron ana/preload, shared ve test TypeScript projeleri hatasız. |
| `npm run lint` | Başarılı | ESLint, `--max-warnings=0`. |
| `npm run build` | Başarılı | Vite React üretim paketi ve esbuild Electron ana/preload paketleri üretildi. |
| `npm run test` | **8 dosya, 20 test başarılı** | Birim, SQLite, sağlayıcı, görsel, UI smoke, ses ve render entegrasyonu. |
| `npm audit --omit=dev` | **0 güvenlik açığı** | Electron 45.2.3, Sharp 0.35.5, Zod 4.6.7 ve better-sqlite3 13.0.3 sürümlerine güncellendi. |
| SQLite migrasyon/CRUD | Başarılı | Tablolar, proje oluşturma/güncelleme/çoğaltma/adlandırma/silme, medya ilişkileri, export ve kurtarma. |
| Proje otomatik kayıt modeli | Başarılı | Repository güncellemesi kalıcı; editör 650 ms debounce ve kapanış öncesi kayıt yolu uygulandı. |
| Sağlayıcı yapılandırması | Başarılı | Aktif sağlayıcılar, public yapılandırma ve anahtarların renderer'a dönmemesi test edildi. |
| Yerel senaryo üretimi | Başarılı | Kaynak yokken olgu uydurmayan yapısal taslak ve araştırma özeti kullanımı doğrulandı. |
| Prosedürel görsel | Başarılı | Sharp ile gerçek 1080×1920 PNG; sahneye özel ışık saçılımı ve uzay diyagramı. |
| Türkçe altyazı | Başarılı | Türkçe karakterler, ardışık zamanlar, ASS stili, vurgu ve konum. Edge VTT ayrıştırması birim testli. |
| Gerçek FFmpeg ses işlemi | Başarılı | İki gerçek ses girdisiyle konumlandırma, kırpma, fade, seviye, ducking ve AAC miksajı; ffprobe doğrulandı. |
| Gerçek örnek video renderı | Başarılı | İki prosedürel sahne + iki anlatım + ASS altyazı + geçiş + ses; **1080×1920, H.264/AAC MP4**, 30 FPS, ffprobe doğrulandı. |
| React sayfa smoke testi | Başarılı | jsdom ile Dashboard, Projeler, Medya, Ses Stüdyosu, Ayarlar, sağlayıcılar, kanal kimliği, oluşturma sihirbazı ve editör navigasyonu. |
| Windows EXE paketleme | **Yapılamadı** | Linux ortamında Windows/Electron binary indirme ve Wine bulunmuyordu. Sahte veya test edilmemiş EXE üretilmedi. `npm run dist:win` yapılandırması sağlandı. |
| Gerçek Electron pencere testi | **Yapılamadı** | Sandbox yalnızca belirli host'lara izin verdiği için Electron runtime zip'i indirilemedi. Ana/preload kodu derlendi; renderer jsdom ile test edildi. |
| OpenAI/Gemini/Tavily/Azure canlı testi | **Yapılamadı** | API anahtarı verilmedi ve ilgili host'lara çıkış yoktu. Entegrasyon kodu ve hata yönetimi var; canlı çalıştığı iddia edilmiyor. |
| Windows SAPI / Edge TTS ses üretimi | **Yapılamadı** | Windows SAPI bu Linux ortamında yok; Edge/Python çalışma zamanı ve dış servis erişimi test edilmedi. FFmpeg ile test tonu gerçek TTS yerine kullanılmadı, yalnızca ses/render entegrasyonunu sınamak için üretildi. |
| Render iptali | Kod incelemesi | AbortController ve FFmpeg süreç sonlandırma uygulandı; uzun Windows renderı üzerinde kullanıcı testi önerilir. |

## Test edilen örnek renderin teknik doğrulaması

Entegrasyon testi geçici klasörde iki gerçek PNG sahne ve iki PCM ses dosyası oluşturdu. Ardından `RenderService` ile MP4 üretti ve `ffprobe` ile şunları doğruladı:

- Genişlik: **1080 px**
- Yükseklik: **1920 px**
- Video codec: **H.264**
- Ses codec: **AAC**
- Süre: 2 saniyeden uzun
- Dosya boyutu: boş olmayan gerçek MP4
- Proje sonucu: `completed`, ilerleme `%100`

Sandbox'taki eski yedek FFmpeg `xfade` içermediğinden bu örnekte güvenli karartma + concat yolu kullanıldı. Modern `ffmpeg-static` veya kullanıcı FFmpeg 5+ yolu bulunduğunda gerçek `xfade` dissolve/slide kodu etkinleşir; modern yol bu ortamda canlı test edilemedi.

## Tam uygulanan özellikler

- Electron güvenlik yapılandırması, context isolation, sandbox, Node integration kapalı
- Tip güvenli preload API'si ve Zod IPC doğrulaması
- SQLite migrasyonları, WAL, repository'ler, otomatik kayıt ve yarım render kurtarma
- Dashboard istatistikleri, son projeler, konu önerileri ve export geçmişi
- Otomatik/özel üretim sihirbazı ve kullanıcı onay noktaları
- Proje arama/filtreleme/açma/adlandırma/çoğaltma/silme
- Yerel ve bulut LLM sağlayıcı arayüzleri; metin üretme ve yeniden yazma
- Kaynak URL/başlık/snippet saklama ve araştırma yapılamadığını açıkça bildirme
- Deterministik sahne bölümleme, görsel yönetmen açıklaması ve tek sahne üretimi
- Gerçek prosedürel PNG görseller, kamera hareketleri ve CPU render
- Görsel/video/medya içe aktarma ve referans WAV dönüşümü
- Windows SAPI, Edge TTS ve Azure Speech sağlayıcı sınıfları
- Referans ses yükleme/değiştirme/dinleme/kaldırma; klonlama yapılmadığını bildirme
- Ayrı görsel/anlatım/müzik/efekt kanalları ve zaman çizelgesi yakınlaştırma
- Sahne ekleme/silme/çoğaltma/sıralama/süre/geçiş/kamera düzenleme
- Altyazı metni ve zamanı, vurgu, font, boyut, renk, kontur, arka plan ve konum
- Ses klibi konumu/süresi/kırpması/seviyesi/fade ayarları ve final ducking
- MP4 render, ön ayarlar, ilerleme olayları, iptal, hata kaydı ve klasörde gösterme
- Kanal kimliği ve proje bazlı görsel kimlik; açılış/kapanış sahne tercihleri
- Açık/koyu/sistem teması; tamamen Türkçe kullanıcı arayüzü

## Kısmen uygulanan / sınırlı özellikler

- **Editör:** Sahne ve klips düzeyinde güvenilir bir editördür; kare kare video kesme, ripple, slip/slide, çoklu klips seçimi ve manyetik zaman çizelgesi yoktur.
- **Araştırma:** Tavily ve bağımsız arama entegrasyonu hazırdır; canlı test yapılmadı. Bağımsız arama tam sayfa doğrulaması yerine sonuç özeti alır. İddialar otomatik doğrulanmış sayılmaz.
- **Altyazı hizalama:** Edge TTS VTT kelime sınırlarını ifadelere gruplar. SAPI ve Azure için süreler tahminidir ve arayüzde böyle belirtilir.
- **Ses klonlama:** Referans dosya altyapısı tamamdır; mevcut sağlayıcılar klonlamaz. Yetkili Custom Neural Voice veya başka bir onaylı motor eklenmelidir.
- **Önizleme:** Müzik ve efekt önizlemesi tarayıcı ses saatine bağlıdır; final karışım FFmpeg'de daha hassastır. Önizleme ducking yaklaşıktır.
- **Geçişler:** Modern FFmpeg'de `xfade`; eski yedekte karartma fallback'i.
- **Otomatik doğrulama:** LLM çıktısı ve kaynak özetleri kullanıcı incelemesi gerektirir; bilimsel doğruluk garantisi otomatik değildir.
- **Depolama taşıma:** Yeni klasör yeni dosyalara uygulanır; mevcut medya mutlak yolları korunur, otomatik veri migrasyonu yapılmaz.

## Bilinen paketleme notları

- `postinstall`, Electron ABI için native bağımlılıkları hazırlar. Windows'ta gerekirse Visual Studio C++ Build Tools kurulmalıdır.
- FFmpeg ve ffprobe binary'leri platforma göre npm üzerinden gelir. Kurumsal ağlarda özel `ffmpeg.exe` seçilebilir.
- Bu teslimde **NedenmisStudio.exe yoktur**; ortam desteklemediği için doğrulanmamış binary eklenmemiştir. Windows'ta `npm run dist:win` ile NSIS kurucusu üretilir.
- ZIP `node_modules`, `.git`, `.env`, SQLite kullanıcı verileri, referans ses, loglar ve mevcut EXE'leri içermez.
