# Nedenmiş Studio 1.1 — Doğrulanmış Test Raporu

**Rapor tarihi:** 7 Kasım 2026  
**Ana Windows doğrulaması:** [GitHub Actions çalışması 42375347063](https://github.com/buraksungr/NedenmisStudio/actions/runs/42375347063)  
**Sonuç:** **BAŞARILI — 26 dk 29 sn**  
**Test edilen uygulama kaynak commit’i:** `89fb12d9da82750a3a15937b5306b9e2856e00b0`  
**CI pull-request merge commit’i:** `dc332224942fc51c3401f9382dbf22d84fa778b0`

> `NedenmisStudio-Setup.exe` gerçekten üretildi, sessizce kuruldu ve kurulu uygulama terminal/Vite olmadan açıldı. Kurulu EXE, kalıcı SQLite projesini yeniden okudu ve paketlenmiş Chatterbox Multilingual V3 ile gerçek referanslı Türkçe WAV üretti. Bu rapor hedef i7-7660U cihazında veya insan kulağıyla kalite değerlendirmesi yapıldığını iddia etmez.

## 1. İndirilebilir, doğrulanmış Windows paketleri

**Release:** [Nedenmiş Studio 1.1.0 · Windows x64 · Build 10](https://github.com/buraksungr/NedenmisStudio/releases/tag/windows-v1.1.0-build10)  
Özel GitHub deposundaki bağlantılar için kullanıcının GitHub yetkisiyle oturum açması gerekir.

| Dosya | Durum | Boyut | SHA-256 |
|---|---|---:|---|
| [`NedenmisStudio-Setup.exe`](https://github.com/buraksungr/NedenmisStudio/releases/download/windows-v1.1.0-build10/NedenmisStudio-Setup.exe) | Üretildi, NSIS ile kuruldu ve kurulu uygulama test edildi | 294.069.518 bayt (280,5 MiB) | `2464b16e40d699f1ff734fc78d20f1947fe6aba31f54bcbd3c10fe6bf3b8996a` |
| [`NedenmisStudio-Portable.zip`](https://github.com/buraksungr/NedenmisStudio/releases/download/windows-v1.1.0-build10/NedenmisStudio-Portable.zip) | Üretildi; ayrı portable açılış testi yapılmadı | 398.988.766 bayt (380,6 MiB) | `c0cf590e3f9cfd7de78b22cb6bd60ce169604bf69e20a1eba84b535680679c46` |
| [`chatterbox-test-result.json`](https://github.com/buraksungr/NedenmisStudio/releases/download/windows-v1.1.0-build10/chatterbox-test-result.json) | Gerçek kaynak V3/MP4 ölçümleri | 884 bayt | Release asset’i ve `docs/verification/windows-build10/` kopyası |
| [`installer-test-result.json`](https://github.com/buraksungr/NedenmisStudio/releases/download/windows-v1.1.0-build10/installer-test-result.json) | Kurulu EXE/V3 ölçümleri | 963 bayt | Release asset’i ve `docs/verification/windows-build10/` kopyası |

Gerçek WAV/MP4 kanıtları ayrıca CI çalışmasının **NedenmisStudio-Windows-Test-Kanitlari** artifact’ındadır. Artifact ID: `13576331181`. Windows x64 paket artifact ID: `13576750005`.

## 2. Test ortamları

### Windows CI — asıl installer ve V3 kanıtı

- GitHub `windows-latest`, Windows x64
- Node.js **24.22.0**
- Electron **45.2.3**
- Yönetilen, izole CPython **3.11.11**
- PyTorch/torchaudio **2.6.0 CPU**; kurulumda CUDA etkinliği reddedilir
- Paketlenmiş FFmpeg **6.1.1**
- CPU: **AMD EPYC 7763**, CI’ya ayrılan **2 mantıksal çekirdek**
- Toplam RAM: **8 GB**; test sonunda boş RAM: **3,1 GB**
- Gerçek V3 worker: serbest RAM nedeniyle **2 iş parçacığı**, CPU, float32

### Yerel Linux sandbox — tamamlayıcı birim/entegrasyon kanıtı

- Linux x64, Node.js **22.22.3**, CPU-only
- Typecheck, ESLint, production build ve standart testler çalıştırıldı.
- Electron’ın yerel binary’si sandbox indirme kısıtı nedeniyle burada açılmadı; gerçek Electron testleri Windows CI’da yapıldı.

**Önemli:** CI donanımı kullanıcının hedef **Windows 10 / Intel Core i7-7660U** cihazı değildir. Aşağıdaki süreler hedef cihaz benchmark’ı olarak kullanılamaz.

## 3. Başarılı Windows CI adımları

| Test / aşama | Sonuç | Doğrulanan kanıt |
|---|---|---|
| `npm ci` ve Electron runtime doğrulaması | Başarılı | Windows Electron binary’si mevcut; eksikse resmî paketten açıkça indiriliyor |
| TypeScript typecheck | Başarılı | Renderer, Electron main/preload, shared ve test tipleri |
| ESLint `--max-warnings=0` | Başarılı | Uyarısız |
| Standart Vitest paketi | **25 başarılı, 1 koşullu skip** | Gerçek Chatterbox testi standart pakette simüle edilmez; ayrı ve zorunlu CI adımında çalışır |
| Vite/Electron production build | Başarılı | Production renderer, main ve preload üretildi |
| Geliştirme Electron açılışı | Başarılı | `rendererLoaded=true`, SQLite, FFmpeg ve voice bridge mevcut |
| Paketsiz production Electron açılışı (`npm start`) | Başarılı | `app.isPackaged=false` doğru kabul edildi; production renderer yüklendi |
| Gerçek referans WAV üretimi | Başarılı | Windows SAPI ile gerçek, dinlenebilir sentetik konuşmacı WAV’ı; insan kaydı olduğu iddia edilmez |
| Yönetilen Python/CPU bağımlılıkları | Başarılı | İzole Python, CPU PyTorch, resmî V3 kaynak kodu ve CPU Perth watermark başlatması doğrulandı |
| Multilingual V3 model indirmesi | Başarılı | Altı zorunlu dosya ve `t3_mtl23ls_v3.safetensors`; V2’ye geri dönüş yok |
| Referanslı Türkçe V3 önizlemesi | Başarılı | V3 checkpoint, `device=cpu`, referans SHA-256, geçerli WAV ve FFprobe |
| İki sahne tam anlatım | Başarılı | 9,04 sn ve 10,52 sn gerçek V3 anlatımı; sahne süreleri anlatımı karşılıyor |
| Dikey MP4 | Başarılı | **20 sn, 1080×1920, H.264**, gerçek prosedürel görseller, V3 anlatımı ve altyazı |
| SQLite kapat/yeniden aç | Başarılı | İki sahne ve diskteki anlatım dosyaları kalıcı |
| NSIS `NedenmisStudio-Setup.exe` | Başarılı | Windows x64 kurucusu ve `win-unpacked` üretildi |
| Portable ZIP | Başarılı paketleme | ZIP oluşturuldu; bağımsız açılışı ayrıca test edilmedi |
| Sessiz NSIS kurulumu | Başarılı | `%LOCALAPPDATA%\Programs\NedenmisStudio\NedenmisStudio.exe` |
| Kurulu uygulamayı terminalsiz açma | Başarılı | `app.isPackaged=true`, renderer, SQLite, paket FFmpeg ve voice bridge |
| Kurulu uygulamada kalıcılık | Başarılı | Kaynak E2E’deki **1 proje** kurulu EXE tarafından yeniden okundu |
| **Kurulu EXE içinde gerçek V3 sentezi** | **Başarılı** | Paketlenmiş worker, aynı referans SHA-256, V3 checkpoint, CPU ve yeni WAV |
| Release yükleme | Başarılı | Setup, portable ve iki sonuç JSON’u Release asset’i oldu |

## 4. Gerçek V3 ölçümleri

### Kaynak uygulama testi

- Model: **Chatterbox Multilingual V3**
- Checkpoint: **`t3_mtl23ls_v3.safetensors`**
- Cihaz: **CPU**
- Referans SHA-256: `f22a1080dc9b32b03f10fe079461d10d9a6471e4874b86209fc1907525f3d9d3`
- Üretilen önizleme: **7,92 saniye**
- Ölçülen V3 çıkarımı: **146,277 saniye**
- Yaklaşık üretim/ses süresi oranı: **18,47×**
- İki sahne anlatım süreleri: **9,04 / 10,52 saniye**

### Kurulu NSIS uygulaması testi

- Üretilen önizleme: **8,24 saniye**
- Ölçülen V3 çıkarımı: **121,904 saniye**
- Yaklaşık üretim/ses süresi oranı: **14,79×**
- Checkpoint ve referans SHA-256 kaynak testle aynı.
- `persistentProjectsReopened=1`, `launchWithoutTerminal=true`, `voiceBridge=true`.
- Kurulu test, kaynak E2E’nin indirdiği model/runtime önbelleğini kullandı; **4 GB model ikinci kez indirilmedi**. Böylece hem kalıcı önbellek hem paketlenmiş kaynak yolları hem de kurulu uygulamada gerçek çıkarım sınandı.

Bu süreler modelin `generate()` çağrısını ölçer; ilk Python/pip/model indirme ve model yükleme süresi dahil değildir. CI toplam iş süresi **26 dk 29 sn**dir.

## 5. Yerel tamamlayıcı testler

| Komut / test | Sonuç |
|---|---|
| `npm run typecheck` | Başarılı |
| `npm run lint` | Başarılı |
| `npm run build` | Başarılı |
| `npx vitest run` | **11 dosya başarılı, 1 koşullu skip; 25 test başarılı, 1 skip** |
| Gerçek WAV/MP3/M4A referans dönüşümü | Başarılı: mono, 24 kHz, 16-bit PCM WAV; kısa kayıt reddi |
| SQLite CRUD ve yeniden açma | Başarılı |
| Sağlayıcı yönlendirme | Başarılı: proje/önizleme seçimi zorunlu; bilinmeyen sağlayıcı hata; sessiz fallback yok |
| Boş `selectedText` yeniden yazma | Başarılı: UI eylemi kapalı; IPC gönderilmiyor; backend güvenli reddetme |
| Gerçek prosedürel PNG | Başarılı: 1080×1920 |
| FFmpeg ses miksajı | Başarılı |
| Gerçek RenderService MP4 | Başarılı: 1080×1920 H.264 |
| Ayrı `ffprobe -select_streams a:0` assertion’ı | **Başarılı: `codec_name=aac`** |
| `npm audit --omit=dev` | **0 güvenlik açığı** |

AAC assertion’ı bu rapor hazırlanırken yerel gerçek RenderService çıktısı üzerinde çalıştırıldı. Windows Build 10 sonuç JSON’u yalnızca ilk video akışının `h264` değerini kaydetti; Windows MP4 ses codec’i için ayrı bir alan raporlanmadı.

Tam development `npm audit` sonucu bu ortamda **19 geliştirme-bağımlılığı uyarısı** (17 moderate, 2 critical) vermektedir. Production bağımlılıkları için sonuç sıfırdır; geliştirme uyarıları “yok” diye gösterilmemiştir.

## 6. Çözülen gerçek entegrasyon hataları

- PyPI `chatterbox-tts==0.1.7` wheel’inin V2 checkpoint yüklediği gerçek Windows testiyle bulundu. Yalnızca parametreyi kaldırıp V2’ye düşmek yerine resmî V3 destekli `ab55923c27757c90cfcc407baa57dc25a7d25217` kaynak commit’i sabitlendi.
- `resemble-perth 1.0.1` içindeki sessiz `PerthImplicitWatermarker=None` davranışı bulundu. Uyumlu setuptools, PyYAML ve pydub eklendi; watermark CPU’da gerçekten başlatılmadan kurulum “hazır” sayılmıyor.
- Node 24 Windows `spawn EINVAL`, eksik Electron binary’si, PowerShell stderr/pipeline ve smoke assertion hataları giderildi.
- Python fatal/sentez hataları artık Electron’a tam traceback ile döner; kullanıcıya temiz Türkçe hata, teknik loglara ayrıntı verilir.
- CI, gerçek model ve kurulu uygulama V3 testi geçmeden installer/Release adımına ilerlemeyecek şekilde zorunlu hale getirildi.

## 7. Başarılı sayılmayan veya henüz yapılmayan testler

| Konu | Durum / sınır |
|---|---|
| Kullanıcının Windows 10 + i7-7660U cihazında kurulum ve benchmark | **Yapılmadı.** CI x64 Windows ve 2 çekirdek AMD EPYC kullandı. |
| Konuşmacı benzerliği, Türkçe telaffuz, doğallık ve insan kaynağına yakınlık | **Dinleyerek ölçülmedi.** Teknik olarak gerçek V3 referans koşulları ve dosya üretimi doğrulandı. Örnekler kullanıcı tarafından dinlenmeli. |
| İnsan sesiyle manuel referans testi | **Yapılmadı.** CI gerçek WAV olan sentetik Windows SAPI konuşmacısını kullandı. WAV/MP3/M4A dönüşümü ayrıca gerçek dosyalarla test edildi. |
| Renderer’daki işletim sistemi dosya seçiciyle manuel upload | **Otomatik UI testi yapılmadı.** Backend import/dönüşüm ve kurulu uygulama import yolu test edildi. |
| Portable ZIP’i açıp kullanma | **Yapılmadı.** ZIP üretildi ve hash’i kaydedildi; NSIS kurulumu test edildi. |
| Kurulu uygulamada sıfırdan 4 GB indirme | **Tekrarlanmadı.** İlk indirme kaynak E2E’de doğrulandı; kurulu test kalıcı cache ve gerçek paket içi çıkarımı doğruladı. |
| OpenAI, Gemini, Tavily, Azure ve Edge canlı servisleri | **Yapılmadı.** Anahtar/dış servis testi yok; başarılı oldukları iddia edilmiyor. |
| Kare kare profesyonel NLE özellikleri | Kapsam dışı; editör sahne/klips düzeyindedir. |

## 8. Kanıt dosyaları ve tekrar üretme

Kaynak teslimdeki makine okunabilir kayıtlar:

- `docs/verification/windows-build10/ci-run.json`
- `docs/verification/windows-build10/chatterbox-test-result.json`
- `docs/verification/windows-build10/installer-test-result.json`

Standart kontroller:

```powershell
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm audit --omit=dev
```

Windows paketleri:

```powershell
npm run dist:win
npm run pack:portable
```

Gerçek model testi yalnızca açık ortam değişkenleriyle çalışır; mock veya alternatif TTS kullanmaz. CI tanımı: `.github/workflows/windows-release.yml`. Test: `tests/integration/chatterbox.e2e.test.ts`.

## Sonuç

Windows x64 NSIS installer ve portable paket gerçek olarak üretildi. NSIS kurulumu, terminalsiz production açılışı, SQLite kalıcılığı, paketlenmiş FFmpeg, gerçek referanslı Chatterbox Multilingual V3 CPU çıkarımı ve dikey MP4 zinciri Windows CI’da başarıyla tamamlandı. Hedef i7 cihaz performansı, portable açılışı ve sesin algısal kalitesi ayrı kullanıcı doğrulaması gerektirir.
