# Türkçe Chatterbox Multilingual V3 — kaynak analizi ve kalite kapısı

## Kapsam

Build 10'daki rastgele hece benzeri Türkçe çıktı, kullanıcının MP4 dosyası olmadan kaynak kod, sabit model/sürüm bilgileri ve tekrarlanabilir üretimlerle inceleniyor. WAV üretmek veya test sürecinin sıfır dönmesi konuşma kalitesi kanıtı sayılmıyor.

## Kaynak koddan doğrulananlar

- Uygulama resmî `resemble-ai/chatterbox` kaynağını `ab55923c27757c90cfcc407baa57dc25a7d25217` revizyonunda kullanıyor.
- Genel V3 yolu `t3_mtl23ls_v3.safetensors` ile **`s3gen.pt`** yükler. Resmî genel V3 demo da aynı decoder'ı kullanır. `s3gen_v3.pt`, ayrı tek-dil paketlerine aittir; genel V3 için körlemesine değiştirilmemiştir.
- Arşivlenmiş genel `mtl_tts.py` / `MTLTokenizer` yolu varsayılan olarak **lowercase + NFKD** uygular.
- Resmî `ResembleAI/Chatterbox-Multilingual-TTS-V3` Space T3 yapılandırması **`NFKD,fullcase`** kullanır. Bu, V2 varsayılanından somut bir V3 çalıştırma farkıdır.
- Resmî Space ayrıca VAD ile hazırlanmış yaklaşık altı saniyelik referans ve farklı bir T3 inference sarmalayıcısı kullanır. Bu farklar tek başına kök neden ilan edilmemiştir.
- Build 10 testi İngilizce sentetik SAPI referansı kullanıyordu. Referans dilinin hedef dille eşleşmesi gerektiği resmî dokümantasyonla uyumludur; ancak İngilizce referansın bu çıktıdaki payı ancak A/B sonucuyla belirlenebilir.
- Upstream issue #551, V3 için başka dillerde native referansla da kalite gerilemesi bildirir. Bu olası model sınırlılığıdır, uygulamanın Türkçe çıktısı için kanıtlanmış kök neden değildir.

## Uygulanan üretim değişiklikleri

- Model varlıkları hareketli `main` yerine `5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18` revizyonuna sabitlendi. Manager yalnızca bu snapshot'taki zorunlu T3/S3Gen/tokenizer/VE dosyalarını kabul eder.
- V3 üretim tokenizer'ı resmî V3 profiline uygun olarak **NFKD + fullcase** çağırır. Eski lowercase yolu yalnızca tanı A/B baseline'ı olarak tutulur.
- `[tr]` token'ının ilk token olduğu doğrulanır; normalize/decode edilmiş metin, token sayısı, `[UNK]` sayısı, seed, örnekleme hızı ve kanal sonuçta kaydedilir. `[tr]` eklenemezse üretim durur.
- PCM16 WAV yolu değiştirilmedi: modelin `sr` değeri (24 kHz), mono, sıkıştırılmış PCM16; sonraki mevcut FFmpeg yolu 48 kHz stereo AAC karışımını yapar.
- Windows SAPI yalnızca Build 10 baseline referansını üretmek için test fixture'ıdır; Türkçe anlatım motoru veya fallback değildir.

## Kontrollü deney

Aynı metin, seed (`20261107`), `exaggeration=0.5`, `cfgWeight=0.5`, `temperature=0.8` ile dört gerçek üretim:

1. Build 10 lowercase + İngilizce SAPI referansı.
2. V3 fullcase + aynı İngilizce referans.
3. Build 10 lowercase + gerçek Türkçe referans.
4. V3 fullcase + aynı Türkçe referans.

Türkçe fixture resmî demonun `tr_m.flac` dosyasıdır ve yalnızca geçici CI doğrulama materyali olarak kullanılır; kaynak koda veya kurulum paketine eklenmez. Ayrıca tam doğal Türkçe örnek, dört sahneli anlatım, kaynak kodlu MP4 ve kurulu uygulamanın kendi WAV/MP4 çıktıları üretilir.

## Bağımsız kalite kapısı

`voice-engine/quality_check.py`, CI'a özel `faster-whisper large-v3-turbo` (CPU/int8) kullanır. ASR dili `tr` olarak zorlanır; beam size 5, VAD açık ve previous-text conditioning kapalıdır. Her çıktı için:

- bağımsız transkript ve segment zamanları;
- Unicode/karakter normalizasyonu sonrası CER ve WER;
- PCM örnekleme hızı, kanal, süre, peak, RMS, clipping ve sessizlik oranları (WAV için) kaydedilir.

Zorunlu örneklerde eşikler **CER ≤ 0.20**, **WER ≤ 0.35** ve boş olmayan transkripttir. Hem kaynak kodlu test hem kurulu uygulama testi bu kapıdan geçmeden release oluşmaz. ASR sonucu anlaşılırlık kanıtıdır; insan dinlemesi, doğal prozodi veya konuşmacı benzerliği kanıtı değildir.

## Gerçek model A/B + ASR sonucu — run 42417951334

Bağımsız `faster-whisper large-v3-turbo` (CPU/int8, forced `tr`) sonuçları:

| Örnek | CER | WER | Sonuç |
|---|---:|---:|---|
| Build 10 lowercase + İngilizce SAPI referans | 0.0000 | 0.0000 | Geçti |
| V3 fullcase + aynı İngilizce referans | 0.0000 | 0.0000 | Geçti |
| Build 10 lowercase + Türkçe referans | 0.0000 | 0.0000 | Geçti |
| V3 fullcase + aynı Türkçe referans | 0.0000 | 0.0000 | Geçti |
| Doğal uzun Türkçe metin, provider + FFmpeg yolu | 0.0000 | 0.0000 | Geçti |
| Dört sahneli export MP4/AAC | 0.0000 | 0.0000 | Geçti |

Dört A/B koşulunda da `[tr]` token ID'si **712** ve ilk tokenda bulundu; `[UNK] = 0`. Fullcase, beklenen şekilde ilk `Buz` içerik tokenını lowercase `15` yerine `278` yaptı; diğer tokenlar aynı kaldı. Seed `20261107` ile kısa A/B metni dört koşulda da bağımsız ASR tarafından doğru transcribe edildi. Uzun doğal metin ve dört sahneli videonun tamamı da doğru transcribe edildi. Noktalama farkları normalize skorlamada cezalandırılmadı.

**Kök neden çıkarımı:** Bu deney `NFKD,fullcase`in veya Türkçe referansın rastgele-hece sorununu düzelttiğini göstermiyor; Build 10 lowercase + İngilizce referans da aynı ölçümde kusursuzdu. Kullanıcının orijinal bozuk MP4'si mevcut olmadığından sorun bu kontrollü metin/seed/model koşullarında yeniden üretilemedi ve kesin kök neden hâlâ bilinmiyor. Fullcase, resmî V3 profiliyle uyum için korunuyor; bir kalite düzeltmesi olarak ilan edilmiyor. Tek bir metin/seed ve ASR, bütün olası sampling bozukluklarını veya doğal prozodiyi dışlamaz. İnsan dinlemesi yapılmadı.

Kaynak video 1080×1920, 30 FPS, **645/645 kare**, 21.5 saniye H.264 ve 48 kHz stereo AAC ölçüldü; altyazı sınırları ve SQLite kalıcılığı geçti. Bu run'da üretim ve ASR tamamlanmasına rağmen testin en sonunda DB kapatıldıktan sonra settings okunması test sıralama hatası verdi; release ve kurulu uygulama aşaması çalışmadı. Assertion DB açıkken yapılacak şekilde düzeltildi ve sonraki run'da yeniden doğrulanacak.

Ham transkript ve token kanıtı: [PR kalite yorumu](https://github.com/buraksungr/NedenmisStudio/pull/1#issuecomment-6713785237).
