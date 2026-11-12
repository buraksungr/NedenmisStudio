# Prosedürel animasyon ve dört sahne doğrulaması

## Ortak uygulama

Önizleme ve export aynı `renderAnimatedSceneSvg(project, scene, identity, time)` zaman çizelgesini kullanır. Renderer bunu React SVG olarak gösterir; export aynı SVG'yi Sharp ile RGBA karelere rasterleştirip backpressure uygulanan FFmpeg rawvideo/libx264 girişine akıtır. Statik görsel pan/zoom veya altyazı değişimi animasyon olarak sayılmaz.

Kullanıcı arayüzü, mevcut görsel kimlik, import edilen medya, procedural olmayan görseller, geçişler, anlatım ve altyazı yolları korunur. Animasyon ayarları optional ve sınırlıdır; eski projeler `auto` çözümlemesiyle açılır.

## Kapsam

- Sıvı molekülleri: titreşim, dönme, yer değiştirme, kabarcık ve dalga.
- Kristal oluşumu: düzensiz moleküllerden üç eşit kenarlı altıgen çevrime yakınsama ve bağ oluşumu.
- Kafes genişlemesi: altıgenlerin zamanla ölçeklenmesi, hacim göstergesi ve titreşim.
- Yüzen buz: bob/tilt, dalgalar, su altı molekülleri, kaldırma oku ve yaklaşık %90 su altı geometrisi.
- Orbital, galaksi, hücresel, enerji/dalgalar, jeolojik, reaksiyon, nöral, veri akışı ve genel parçacıklar.
- Hava sistemi: hareketli bulutlar, yağış, rüzgâr ve dönen güneş.
- Nehir: iki cubic Bézier segmentini izleyen taşınan parçacıklar ve akan çizgi.

Görsel kontrolde ilk kristal bağlarının altıgen yerine yıldız oluşturduğu bulundu ve düzeltildi. Son MP4 karelerinde üç gerçek altıgen çevrim görüldü.

Windows CI'da container süresi doğru olduğu hâlde yalnızca 38/144 video karesi bulunan bir `xfade` hatası yakalandı. FFmpeg 7.0.2 ile yerelde birebir üretildi; aşama probe'ları kaybı `visual.mp4` birleşimine yerleştirdi. Rawvideo çıkışındaki `-t`, transition overlap için gereken 37. kareyi buduyor ve ilk input transition offset'inde EOF oluyordu. Procedural segmentlerde süre artık tam `-frames:v` ile belirleniyor, girişler normalize ediliyor ve son MP4 `nb_frames` kontrolünden geçmeden `completed` olamıyor. Aynı reprodüksiyon düzeltme sonrası 37/37/37/36 segment ve 144/144 final karesi verdi.

## Yerel gerçek export kanıtı

Proje: **Why does ice float on water?** — dört farklı sahne, statik kamera, bilinen süreli PCM fixture'ları. Bu fixture konuşma kalitesi testi değildir.

- FFmpeg 7.0.2 `xfade` yolu, gerçek fade/dissolve/slide geçişleriyle: 1080×1920, 30 FPS, H.264/AAC, 4.800 saniye; `-count_frames` ile **144/144 video karesi** ve 4.800 saniye video stream süresi doğrulandı.
- Statik kamerada, geçişler bittikten sonra alınan iki farklı zamanın ortalama piksel farkı:
  - liquid: 7.4606
  - crystallization: 10.3147
  - lattice expansion: 9.8552
  - floating ice: 5.2168
- Son entegrasyon çalışması yaklaşık 60 saniyede tamamlandı.
- Her altyazı cue'su kendi sahnesi içinde; anlatım karışım offset'leri sahne başlangıçlarıyla aynı.
- Son dört MP4 karesi ayrıca çıkarılıp görsel olarak incelendi.

Yerel, git'e eklenmeyen kanıtlar `.verification/animation/` altındadır. Windows CI ve kurulu uygulama sonucu bundan ayrıdır.

## Otomatik testler

- `tests/main/animation.test.ts`: bütün ön ayarlarda Sharp raster piksel hareketi, determinizm, sınıflandırma, eski proje uyumluluğu, gerçek altıgen kenar/degree geometrisi.
- `tests/renderer/AnimatedScene.test.tsx`: DOM'da gerçek frame-time ilerlemesi ve SVG değişimi.
- `tests/renderer/App.test.tsx`: dört sahneli proje editörü, oynatma ve preset kontrolü.
- `tests/integration/ice-animation.test.ts`: gerçek 1080×1920 CPU export, MP4 kareleri, piksel hareketi, codec/FPS ve altyazı/anlatım zamanı.
- Kurulu Windows uygulaması testi: kalıcı projeyi editörde açar, animasyonun `data-frame-time` ve SVG'sinin ilerlediğini doğrular ve uygulamanın kendi dört sahneli MP4 export'unu üretir. Sonuç CI raporunda ayrı tutulur.
