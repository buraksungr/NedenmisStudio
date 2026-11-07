# Yönetilen Chatterbox bileşeni

- Model: **ResembleAI/chatterbox — Multilingual V3**, `t3_mtl23ls_v3.safetensors`
- Python: yönetilen, izole **3.11.11**; kullanıcının Python 3.14 kurulumuna dokunulmaz
- PyTorch: **2.6.0 CPU** ve torchaudio **2.6.0 CPU**
- Kaynak kod: resmî V3 destekli [`ab55923c`](https://github.com/resemble-ai/chatterbox/commit/ab55923c27757c90cfcc407baa57dc25a7d25217) commit’i; PyPI 0.1.7 wheel’i yalnızca V2 yüklediği için kullanılmaz
- Çalışma: CPU, float32, en fazla 4 iş parçacığı, kalıcı worker
- Konum: uygulamanın kullanıcı depolama alanında `voice-engine/`

Electron içindeki **Ses Stüdyosu → Chatterbox → Yerel bileşeni kur / modeli indir** düğmesi runtime, bağımlılıklar ve modeli indirir. Model Hugging Face üzerinden bir kez indirilir ve sonraki açılışlarda çevrimdışı kullanılır. Kurulum birkaç GB disk alanı ve uzun bir ilk indirme gerektirir.

Resmî Chatterbox projesi Ağustos 2026'da emekli araştırma projesi olarak duyurulmuştur; artık bakım yapılmamaktadır. Kod/model MIT koşullarıyla sunulur. Yalnızca açık izniniz olan referans sesleri kullanın. Üretilen sesin konuşmacı benzerliği veya ticari kullanım uygunluğu otomatik olarak garanti edilmez; yayın öncesi dinleyerek doğrulayın.

Bağımsız teknik sınama:

```bash
python bridge.py status
python bridge.py download
python bridge.py worker --snapshot "MODEL_SNAPSHOT_YOLU" --threads 4
```

Worker standart girdiden JSON Lines alır. Her istekte `text`, `reference_path`, `output_path`, `exaggeration`, `cfg_weight`, `temperature` ve `repetition_penalty` alanları kullanılabilir.
