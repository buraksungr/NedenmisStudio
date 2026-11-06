# Mimari

## Sınırlar

- `shared/`: renderer ve ana süreç arasındaki alan tipleri, varsayılanlar, doğrulama ve saf yardımcılar.
- `electron/main/infrastructure/`: SQLite, şifreli kimlik bilgileri, FFmpeg, günlük ve repository altyapısı.
- `electron/main/services/`: konu, araştırma, senaryo, görsel, TTS, medya, altyazı, ses ve render kullanım durumları.
- `electron/main/ipc/`: Zod doğrulamalı ince IPC adaptörü.
- `electron/preload/`: yalnızca izinli API'yi açığa çıkaran contextBridge.
- `src/renderer/`: React sayfaları, görünüm bileşenleri ve StudioContext.

Bağımlılıklar arayüzler ve fabrika fonksiyonu (`createAppContext`) üzerinden verilir. Repository'ler SQLite satırlarını alan nesnelerine dönüştürür. Sağlayıcı haritaları strateji seçimini ayarlara bağlar. Renderer API anahtarı veya doğrudan dosya sistemi erişimi almaz.

## Render hattı

1. Her sahne için CPU uyumlu H.264 ara video; zoom/pan ve dikey kırpma.
2. FFmpeg 5+ varsa `xfade`, yoksa karartmalı concat.
3. Anlatım/müzik/efektlerde trim, gecikme, seviye, fade, pad ve limiter.
4. Anlatım ve müzik varsa `sidechaincompress` ile anlatım önceliği.
5. ASS altyazıları, H.264/AAC son kodlama ve `faststart`.

Her render AbortController taşır. İlerleme ana pencereye olay olarak gönderilir; React iş parçacığı FFmpeg'i çalıştırmaz.
