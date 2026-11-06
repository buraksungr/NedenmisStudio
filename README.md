# Nedenmiş Studio

**Nedenmiş Studio**, Türkçe merak ve bilim anlatıları için konu keşfinden 1080×1920 MP4 çıktısına kadar çalışan, Electron tabanlı bir masaüstü video üretim uygulamasıdır. Ücretli bir API olmadan proje yönetimi, yerel taslak, prosedürel infografik, medya kitaplığı, editör ve Windows sistem sesi kullanılabilir.

> Teslim paketi kaynak kodu içerir. Windows kurucusunu kendi bilgisayarınızda üretmek için aşağıdaki **Windows EXE oluşturma** bölümünü izleyin. Haricî API ve TTS bağlantıları, anahtarlarınızla ayrıca doğrulanmalıdır; hiçbir çevrimiçi özellik çalışıyormuş gibi gösterilmez.

## Öne çıkanlar

- Otomatik veya özel konu ile dört aşamalı, onaylı üretim sihirbazı
- Türkçe senaryo, seçili metni/tamamını yeniden yazma ve konuşma süresi tahmini
- Kaynak URL'si, başlığı ve doğrulanmamış iddia durumu saklayan modüler araştırma
- Her anlatım sahnesine özel yönetmen açıklaması ve CPU ile çalışan gerçek prosedürel diyagramlar
- OpenAI/Gemini metin, Tavily/bağımsız web araştırma ve OpenAI görsel sağlayıcı arayüzleri
- Windows SAPI, izole Edge TTS ve Azure AI Speech için sağlayıcıdan bağımsız seslendirme
- Görsel, anlatım, müzik ve efekt kanallarına ayrılmış zaman çizelgesi
- Sahne taşıma, süre, çoğaltma, silme, tek sahne yeniden üretme, video/görsel aktarma
- Düzenlenebilir ASS altyazıları, vurgu kelimeleri, tipografi, renk, kontur ve konum
- FFmpeg ile kamera hareketleri, geçişler, ses kırpma/konumlandırma/solma ve anlatımda müzik kısma
- Otomatik SQLite kaydı, yarım kalan render kurtarma, medya ve dışa aktarım geçmişi
- Anahtarları renderer'a göstermeyen güvenli IPC; desteklenen sistemlerde `safeStorage`
- Açık/koyu/sistem teması ve düzenlenebilir Nedenmiş kanal kimliği

## Gereksinimler

- Windows 10 veya Windows 11, 64 bit
- **Node.js 22 LTS** ve npm (Node 22 önerilir)
- İlk kurulum ve çevrimiçi sağlayıcılar için internet
- FFmpeg ayrıca kurulmak zorunda değildir; npm paketleri platforma uygun binary indirir
- Edge TTS isteğe bağlıdır; mevcut Python 3.14 kurulumunuza dokunulmaz

Uygulama GPU gerektirmez. Standart render CPU üzerinde `libx264` kullanır. Intel Core i7-7660U gibi işlemcilerde 1080×1920 üretim süresi video süresinden uzun olabilir; gerçek zamanlı render vaat edilmez. İlk denemelerde **Hızlı taslak** ön ayarını seçin.

## Kurulum

1. `NedenmisStudio.zip` dosyasını çıkarın.
2. **NedenmisStudio** klasöründe PowerShell veya Terminal açın.
3. Node.js 22'yi doğrulayın:

   ```powershell
   node --version
   npm --version
   ```

4. Bağımlılıkları kurun:

   ```powershell
   npm ci
   ```

   `postinstall` adımı `better-sqlite3` modülünü Electron sürümüne göre hazırlar. Kurumsal ağ veya proxy kullanıyorsanız npm ve GitHub erişimine izin verin. Native derleme gerekirse “Desktop development with C++” bileşeni içeren Visual Studio Build Tools gerekebilir.

5. Geliştirme modunda açın:

   ```powershell
   npm run dev
   ```

Üretim paketini yerel olarak doğrulamak için:

```powershell
npm run build
npm run start
```

## İlk yapılandırma

Uygulamayı açtıktan sonra **Ayarlar → Genel ve üretim** bölümünde:

- Tema ve çıktı kalitesini seçin.
- Video çıktı ve medya depolama klasörlerini belirleyin.
- FFmpeg durumunu **Yeniden sına** ile kontrol edin.
- Paket FFmpeg kullanılamıyorsa kendi `ffmpeg.exe` dosyanızı seçin. FFmpeg 5 veya üzeri önerilir.

**Ayarlar → Kanal kimliği** bölümünde kanal adı, slogan, logo, renkler, altyazı, açılış/kapanış, anlatım ve varsayılan müzik tercihlerini kaydedin. Yeni projeler bu kimliği kullanır; editördeki **Tasarım** sekmesinden proje bazında renk ve kanal adı değiştirilebilir.

## API yapılandırması

API anahtarlarını yalnızca **Ayarlar → Yapay zekâ sağlayıcıları** ekranından girin. Anahtarlar arayüze geri döndürülmez. `safeStorage` kullanılabiliyorsa işletim sistemi şifrelemesi uygulanır; kullanılamıyorsa yerel obfuscation kullanılacağı için kullanıcı hesabınızı koruyun.

| Amaç | Sağlayıcı | Gereken |
|---|---|---|
| Senaryo ve sahne yönetimi | Yerel taslak | Anahtarsız; web yoksa olgusal metin üretmez |
| Senaryo | OpenAI | OpenAI API anahtarı |
| Senaryo | Google Gemini | Gemini API anahtarı |
| Araştırma | Bağımsız Web Arama | Anahtarsız; ağ/sonuç erişimi değişebilir |
| Araştırma | Tavily | Tavily API anahtarı |
| Görsel | Prosedürel infografik | Anahtarsız ve çevrimdışı |
| Görsel | OpenAI Images | OpenAI görsel API anahtarı |
| Seslendirme | Azure AI Speech | Speech anahtarı ve `AZURE_SPEECH_REGION` |

Sağlayıcıyı etkinleştirdikten sonra **Sına** düğmesini kullanın. “Hazır” yalnızca yapılandırma bulunduğunu belirtir; gerçek API erişimi testle doğrulanır. Görsel ve metin üretim testleri hesabınızdan ücret/kota tüketebilir.

`.env.example` yalnızca desteklenen ortam değişkenlerinin adlarını gösterir. **Gerçek `.env` dosyaları Git'e ve ZIP'e eklenmez.** Uygulamada anahtar girmek en kolay yöntemdir. Azure bölgesi gerekiyorsa terminalde örneğin:

```powershell
$env:AZURE_SPEECH_REGION="westeurope"
npm run dev
```

## Türkçe TTS kurulumu

### Seçenek A — Windows sistem sesi (çevrimdışı)

1. Windows **Ayarlar → Saat ve dil → Konuşma** bölümünü açın.
2. Türkçe konuşma paketini ve varsa Türkçe erkek sesi kurun.
3. Nedenmiş Studio → **Ses Stüdyosu → Windows Türkçe Ses** seçeneğini seçin.
4. Kurulu sesleri yeniden yüklemek için uygulamayı yeniden başlatın ve önizleme üretin.

Bu yöntem anahtar gerektirmez. Doğallık ve ticari kullanım hakları Windows'ta kurulu sesin koşullarına bağlıdır. Referans sesten klonlama yapmaz.

### Seçenek B — Edge Neural Türkçe (izole Python)

Mevcut Python 3.14 kurulumunuzu değiştirmeden ayrı Python 3.12 ortamı oluşturun. Python 3.12 yoksa resmî python.org yükleyicisini veya `winget install Python.Python.3.12` komutunu kullanabilirsiniz.

Proje klasöründe:

```powershell
py -3.12 -m venv .venv-tts
.\.venv-tts\Scripts\python.exe -m pip install --upgrade pip
.\.venv-tts\Scripts\python.exe -m pip install edge-tts
.\.venv-tts\Scripts\python.exe -m edge_tts --version
```

Ardından **Ayarlar → Genel ve üretim → İzole TTS Python çalıştırılabilir dosyası** alanına şu yolu girin:

```text
TAM_PROJE_YOLU\.venv-tts\Scripts\python.exe
```

**Ses Stüdyosu** içinde Ahmet veya Emel sesini seçin. Edge sağlayıcısı konuşma sınırlarından altyazı hizalaması alabilir; VTT alınamazsa sürelerin tahmini olduğu açıkça gösterilir. Edge TTS'nin ticari kullanım için resmî garantisi varsayılmaz; koşulları kontrol edin. Ticari üretim için Azure AI Speech değerlendirin.

### Seçenek C — Azure AI Speech

1. Azure portalında Speech kaynağı oluşturun.
2. Anahtarı uygulamadaki Azure Speech alanına kaydedin.
3. Bölgeyi yukarıdaki ortam değişkeniyle belirtin.
4. Ahmet/Emel Türkçe sesini seçip **Sına** ve **Sesi dinle** düğmelerini kullanın.

Standart Azure sesleri referans kayıttan klonlama yapmaz. Custom Neural Voice ayrı yetkilendirme ve onay gerektirir; bu pakette klonlama yapılmış gibi gösterilmez.

## Referans ses

En güvenli yöntem **Ses Stüdyosu → Referans ses → Referans kaydı yükle** düğmesidir. WAV, MP3 veya M4A dosyası mono 24 kHz WAV'a dönüştürülür ve Ayarlar'da gösterilen depolama alanındaki `assets/reference_voice.wav` yoluna yazılır. Kaydı dinleyebilir, değiştirebilir veya kaldırabilirsiniz.

Geliştirme kurulumunda kaynak klasöre `assets/reference_voice.wav` koyarsanız uygulama ilk açılışta dosyayı içe aktarmayı da dener. Bu kişisel dosya `.gitignore` ile korunur ve ZIP'e eklenmez.

Yalnızca açık izniniz olan sesleri kullanın. Mevcut üç TTS sağlayıcısı referans klonlamayı desteklemediğinden kayıt saklanır fakat klonlama yapılmış gibi davranılmaz; seçilen doğal Türkçe ses kullanılır.

## İlk videonuzu üretin

1. **Yeni video → Otomatik üretim** veya **Özel üretim** seçin.
2. Konu/kategori, hedef süre, anlatım ve görsel stili belirleyip **Projeyi oluştur** deyin.
3. Araştırma sağlayıcısını çalıştırın. Kaynak başlıklarına tıklayarak olguları kontrol edin. Web yoksa araştırma yapılmadığı belirtilir.
4. **Senaryoyu üret** deyin. Metni doğrudan düzenleyin veya seçili bölümü akıcılaştırın/kısaltın.
5. **Sahne planını oluştur** deyin ve her sahnenin anlatımla ilişkisini inceleyin.
6. **Tüm görselleri üret** deyin. Prosedürel motor API olmadan gerçek PNG diyagramları üretir.
7. Ses Stüdyosu'ndan sesi seçip test edin; ardından **Seslendir ve editöre geç** deyin.
8. Editörde sahne sırasını, süreyi, görselleri, altyazıları ve ses kanallarını düzenleyin.
9. Müzik/efekt eklemek için **Ses miksajı → Ekle** kullanın. Klips başlangıcı, süresi, kırpması, seviyesi ve solmaları düzenlenebilir.
10. **Dışa aktar → MP4 oluştur** deyin. İlk denemede Hızlı taslak; finalde Standart 1080×1920 seçin.
11. İlerlemeyi izleyin. Gerekirse **Renderi iptal et** kullanın; proje kaybolmaz. Tamamlanan dosyayı **Klasörde göster** ile açın.

**Kısayollar:** Boşluk oynat/duraklat, sol/sağ ok bir saniye hareket, zaman çizelgesinde sürükleme sahne sırasını değiştirir.

## Windows EXE oluşturma

En güvenilir paketleme Windows 10/11 x64 üzerindedir:

```powershell
npm ci
npm run test
npm run build
npm run dist:win
```

Kurucu şu konumda oluşur:

```text
release\NedenmisStudio-Setup-1.0.0.exe
```

`electron-builder` gerekirse Visual Studio Build Tools ve GitHub/npm binary indirmelerine erişim ister. Antivirüs imzasız kurucuyu uyarabilir; dağıtım öncesinde bir kod imzalama sertifikası eklemeniz önerilir. Kaynak depoda `.exe` dosyaları ve gerçek anahtarlar bulunmaz.

## Doğrulama komutları

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm audit --omit=dev
```

Ayrıntılar ve ortam sınırlamaları için **TEST_REPORT.md** dosyasına bakın.

## Veri ve güvenlik

- SQLite şeması: `electron/main/infrastructure/database/schema.sql`
- Veritabanında WAL, yabancı anahtar, busy timeout ve migrasyon sürümü kullanılır.
- Renderer'da Node entegrasyonu kapalı, context isolation ve sandbox açıktır.
- IPC girdileri Zod ile doğrulanır; medya protokolü yalnızca izinli depolama köklerini sunar.
- Medya silme, proje içinde kullanılan dosyaları korur.
- Render ayrı işlemde çalışır; kapanışta işlemler durdurulur ve yarım projeler bir sonraki açılışta kurtarılır.
- Günlükler depolama klasöründeki `logs/nedenmis-studio.log` dosyasındadır; anahtarlar günlüğe yazılmamalıdır.

## Bilinen sınırlar

- Editör güvenilir **sahne düzeyinde** bir zaman çizelgesidir; kare kare kesme, manyetik ripple ve çoklu seçim içeren profesyonel NLE değildir.
- Bağımsız web arama başlık/özet getirir; otomatik olgu doğrulaması yapmaz. Yayın öncesi kaynak kontrolü gerekir.
- Eski FFmpeg yedeğinde `xfade` yoksa sahneler güvenli karartma/birleştirme ile işlenir. Tam dissolve/slide için FFmpeg 5+ kullanın.
- Bulut sağlayıcılarının kullanılabilirliği, fiyatı, model adları ve koşulları zamanla değişebilir; bağlantı testi zorunludur.
- Referans ses yönetimi vardır; yetkili ses klonlama sağlayıcısı entegrasyonu yoktur.
