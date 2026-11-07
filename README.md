# Nedenmiş Studio 1.1

Nedenmiş Studio; Türkçe konu keşfi, kaynaklı araştırma, senaryo, sahne görselleri, **gerçek Chatterbox Multilingual V3 ses klonlama**, altyazı, çok kanallı edit ve FFmpeg ile 1080×1920 MP4 üretimini tek Windows masaüstü uygulamasında birleştirir.

## Windows kurulumu

GitHub Releases bölümündeki dosyalar:

- **`NedenmisStudio-Setup.exe`** — Windows 10/11 x64 NSIS kurucusu
- **`NedenmisStudio-Portable.zip`** — kurulumsuz taşınabilir paket
- **`NedenmisStudio.zip`** — eksiksiz kaynak kod, şema, testler ve belgeler

Kurucuyu çalıştırın, kurulum klasörünü seçin ve **Nedenmiş Studio** kısayolunu açın. PowerShell, Vite veya ayrı bir sunucu gerekmez. Electron, React, ana süreç, SQLite, FFmpeg ve üretim varlıkları pakete dahildir.

> **Chatterbox modeli installer içine gömülmez.** 500M model ve CPU bağımlılıkları birkaç GB yer kapladığı için ilk kullanımda uygulama içinden indirilir. Böylece installer makul boyutta kalır; model yalnızca bir kez indirilir ve sonraki açılışlarda çevrimdışı kullanılır.

## Chatterbox’ı ilk kez kurma

1. Uygulamada **Ses Stüdyosu → Chatterbox Multilingual V3** seçin.
2. **Kur ve modeli indir** düğmesine basın.
3. İlerleme alanında üç aşamayı izleyin:
   - izole Python 3.11.11,
   - CPU-only PyTorch 2.6 ve ses bağımlılıkları,
   - Chatterbox Multilingual V3 model dosyaları.
4. **Referans kaydı yükle** ile izinli WAV, MP3 veya M4A kaydınızı seçin.
5. Kayıt otomatik olarak mono, 24 kHz, 16 bit PCM WAV’a dönüştürülür ve kullanıcı veri klasöründeki `storage/assets/reference_voice.wav` konumunda saklanır.
6. **Gerçek klonlamayı sına** düğmesine basın. Bu düğme bağlantı kontrolü yapmaz; gerçek Türkçe metni, gerçek referans koşullarıyla V3 modelinden geçirir, WAV üretir ve FFprobe ile doğrular.
7. Başarılı testten sonra **Sesi dinle** ile önizleme üretin veya **Varsayılan yap ve projeye uygula** ile anlatıcıyı aktif projeye atayın.

Model ve bağımlılıklar Ayarlar’da gösterilen depolama alanının `voice-engine/` klasöründedir. Yarım kalan indirmeler yeniden denemede kullanılabilir. Hugging Face, GitHub, PyPI ve `download.pytorch.org` erişimi ilk kurulumda gereklidir. Yönetici, V3 API’si bulunan resmî [`ab55923c`](https://github.com/resemble-ai/chatterbox/commit/ab55923c27757c90cfcc407baa57dc25a7d25217) kaynak commit’ini sabitler; yalnızca V2 yükleyen PyPI 0.1.7 wheel’ini kullanmaz.

### Gerçek klonlama nasıl çalışır?

- Python köprüsü `ChatterboxMultilingualTTS.from_local(..., t3_model="v3")` ile yalnızca `t3_mtl23ls_v3.safetensors` kontrol noktasını yükler.
- Yüklediğiniz kayıt `prepare_conditionals(reference)` ile konuşmacı gömmesi ve koşullarına dönüştürülür.
- Her Türkçe üretim `language_id="tr"` ile aynı V3 worker üzerinde yapılır.
- Referans profili tüm sahnelerde yeniden kullanılır; her sahne için model yeniden başlatılmaz.
- Referansın SHA-256 değeri ve V3 çıkarım süresi başarılı sonuçla birlikte kaydedilir.
- Chatterbox başarısızsa uygulama **SAPI, Edge veya Azure’a sessizce geçmez**. Kurulum/referans hatasını gösterir.
- Üretilen WAV FFprobe ile doğrulanmadan “klonlama başarılı” denmez. Konuşmacı benzerliği otomatik ölçülmez; örneği dinleyerek değerlendirmeniz gerekir.

Resmî [Chatterbox deposu](https://github.com/resemble-ai/chatterbox) Türkçe dahil 23 dili ve V3 API’sini belgeler. Proje Ağustos 2026’da emekli araştırma projesi olarak duyurulmuştur; artık bakım yapılmamaktadır. Kod/model MIT koşullarıyla sunulur. Yalnızca açık izniniz olan sesleri kullanın ve yayın koşullarını kendiniz doğrulayın.

### Donanım ve Python uyumluluğu

Hedef makine: Windows 10 x64, Intel Core i7-7660U, ayrık GPU yok, Node.js 24.22.0 ve mevcut Python 3.14.6.

- Uygulama gerçek CPU/RAM miktarını **Sistem bilgisi** üzerinden okur; RAM kapasitesi varsayılmaz.
- V3 yaklaşık 500M parametrelidir ve bu CPU’da gerçek zamanlı çalışması beklenmemelidir. İlk model yüklemesi ve sahne başına çıkarım uzun sürebilir.
- CPU worker en fazla dört iş parçacığı, float32 ve tekil sahne kuyruğu kullanır. Aynı anda birden fazla model başlatılmaz.
- Kısa sahneler, düşük eşzamanlı uygulama sayısı ve yeterli boş RAM önerilir. Bellek yetersizse uygulama bunu açıkça bildirir; başka motora geçmez.
- Resmî Chatterbox geliştirme ortamı Python 3.11’dir. Bu nedenle uygulama **Python 3.14.6 kurulumunuza dokunmaz** ve kendi kullanıcı klasöründe izole Python 3.11.11 kullanır.
- PyTorch/torchaudio 2.6 yalnızca CPU paket deposundan kurulur; CUDA toolkit veya NVIDIA sürücüsü gerekmez.
- Daha güçlü donanım yoksa pratik seçenek kısa sahnelerle yerel V3 kullanmaktır. Klonlama şart değilse Azure/Edge/SAPI elle seçilebilir; bunların standart sesleri referans klonlamaz.

### Model parametreleri

- **Konuşma hızı:** V3 çıktısına FFmpeg `atempo` uygulanır.
- **İfade yoğunluğu:** `exaggeration`
- **Yönlendirme ağırlığı:** `cfg_weight`
- **Örnekleme sıcaklığı:** `temperature`

Model perde kontrolü sunmadığı için Chatterbox’ta perde düğmesi gösterilmez. Türkçe telaffuz ve konuşmacı benzerliği kayda/metne göre değişebilir; yayın öncesi dinleme zorunludur.

## Alternatif TTS sağlayıcıları

Bunlar birincil motor değildir ve yalnızca kullanıcı seçerse kullanılır:

- **Azure AI Speech:** Ahmet/Emel Türkçe kurumsal nöral sesler; anahtar ve bölge gerekir.
- **Edge Neural TTS:** isteğe bağlı izole `edge-tts` ortamı; Ahmet/Emel ve kelime zamanlaması.
- **Windows SAPI:** kurulu Türkçe Windows konuşma paketiyle çevrimdışı ses.

Seçim hem önizlemeye hem de **Varsayılan yap ve projeye uygula** sonrasında proje anlatımına uygulanır. Standart Azure, Edge ve SAPI sesleri referans klonlamaz; arayüz bunu açıkça belirtir.

Edge’i mevcut Python’dan ayrı kurmak isterseniz:

```powershell
py -3.12 -m venv .venv-tts
.\.venv-tts\Scripts\python.exe -m pip install edge-tts
```

Python yolunu **Ayarlar → Genel ve üretim → İzole TTS Python** alanına girin. Bu ortam Chatterbox’ın yönetilen Python 3.11 ortamından bağımsızdır.

## Kaynak koddan çalıştırma

Gereksinimler: Windows 10/11 x64, **Node.js 24.22.0** veya uyumlu Node 24, npm ve internet.

```powershell
npm ci
npm run dev
```

`npm ci` Electron binary’lerini ve Electron için native SQLite ABI’sini hazırlar. `predev`/`prestart` Electron ABI’sini, `pretest` ise Node test ABI’sini kontrol eder. Native derleme gerekirse Visual Studio “Desktop development with C++” Build Tools gerekebilir.

Üretim kodunu doğrulama:

```powershell
npm run build
npm run start
```

Windows kurucusu ve taşınabilir paket:

```powershell
npm run test
npm run dist:win
npm run pack:portable
```

Çıktılar:

```text
release\NedenmisStudio-Setup.exe
release\NedenmisStudio-Portable.zip
```

## Testler

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm audit --omit=dev
```

Gerçek model testi standart testlerde **simüle edilmez ve otomatik çalıştırılmaz**. Windows CI, sentetik ve izinli bir SAPI konuşmacı referansı üretip şu zinciri gerçek modelle çalıştırır:

1. Yönetilen Python ve CPU bağımlılıklarını kurar.
2. Multilingual V3 modelini indirir.
3. Referansı mono 24 kHz WAV’a dönüştürür.
4. Türkçe referanslı önizleme üretir.
5. İki sahnenin tamamını aynı konuşmacı koşullarıyla seslendirir.
6. Prosedürel görseller ve altyazılarla 1080×1920 H.264/AAC MP4 üretir.
7. SQLite veritabanını kapatıp yeniden açarak kalıcılığı doğrular.
8. NSIS kurar ve kurulu uygulamayı terminal/Vite olmadan açar.

Ayrıntılı, tarihli sonuçlar ve yapılamayan testler için **TEST_REPORT.md** dosyasına bakın.

## Video üretim akışı

1. **Yeni video → Otomatik üretim** veya **Özel üretim** seçin.
2. Konu, kategori, süre, anlatım ve görsel stili belirleyin.
3. Araştırmayı çalıştırın; kaynak URL’lerini ve doğrulanmamış özetleri inceleyin.
4. Senaryoyu üretin/düzenleyin. Yeniden yazma için önce metin seçin; seçim yoksa düğmeler kapalıdır.
5. Sahne planını ve her sahneye özel görsel yönetmen açıklamasını oluşturun.
6. Prosedürel infografikleri üretin veya OpenAI görsel sağlayıcısını yapılandırın.
7. Chatterbox referansını doğrulayıp projeyi seslendirin.
8. Editörde sahne sırası, süre, video/görsel, altyazı, geçiş, kamera ve ses kanallarını düzenleyin.
9. **Dışa aktar → MP4 oluştur** ile CPU renderı başlatın. İlk denemede Hızlı taslak seçin.

## Diğer AI sağlayıcıları

**Ayarlar → Yapay zekâ sağlayıcıları** bölümünden OpenAI, Gemini ve Tavily anahtarlarını girebilirsiniz. Anahtarlar renderer’a döndürülmez; desteklenen sistemlerde Electron `safeStorage` kullanılır. “Sına” gerçek sağlayıcıya istek atabilir ve hesap kotası tüketebilir.

API’siz kullanım: yerel yapısal senaryo taslağı, çevrimdışı konu havuzu, prosedürel görseller, medya kitaplığı, editör, FFmpeg ve Chatterbox modeli indirildikten sonra yerel ses üretimi.

`.env.example` yalnızca yer tutucu değişken adları içerir. Gerçek `.env`, anahtar, kullanıcı veritabanı ve referans kayıtlar Git/ZIP paketine eklenmez.

## Veri konumları ve güvenlik

- SQLite, ayarlar, medya, referans, model ve önizlemeler Electron `userData`/depolama klasöründedir; geçici build klasöründe tutulmaz.
- Şema: `electron/main/infrastructure/database/schema.sql`
- Node integration kapalı, context isolation ve sandbox açıktır.
- IPC girdileri Zod ile doğrulanır. Hatalar kullanıcıya temiz Türkçe mesajla gösterilir; teknik ayrıntılar `logs/nedenmis-studio.log` içindedir.
- Medya protokolü yalnızca izinli depolama köklerine erişir.
- Projeler otomatik kaydedilir; yarım renderlar kurtarılır.
- FFmpeg ve Python worker ayrı işlemlerdir; arayüz iş parçacığında model/render çalıştırılmaz.

## Bilinen sınırlar

- Editör sahne/klips düzeyindedir; kare kare profesyonel NLE değildir.
- Araştırma özetleri otomatik olgu doğrulaması değildir.
- Chatterbox altyazıları tahminidir; Edge kelime sınırları sağlayabilir.
- Eski FFmpeg yedeğinde `xfade` yoksa karartmalı concat kullanılır. Modern geçişler için FFmpeg 5+ önerilir.
- V3’ün i7-7660U üzerindeki süresi metin uzunluğu ve kullanılabilir RAM’e bağlıdır; gerçek zamanlı üretim vaat edilmez.
- Kurulum, model barındırma veya PyTorch altyapısı değişirse **Yerel bileşeni kur** ve **Gerçek klonlamayı sına** adımlarını yeniden çalıştırın.
