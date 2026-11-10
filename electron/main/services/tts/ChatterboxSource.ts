// PyPI 0.1.7 wheel'i yalnızca Multilingual V2 yükler. V3 destekli resmî kaynağı sabitleriz.
export const CHATTERBOX_SOURCE_REVISION = 'ab55923c27757c90cfcc407baa57dc25a7d25217';
export const CHATTERBOX_DEPENDENCY_PROFILE = 'v3-cpu-2';
export const CHATTERBOX_SOURCE_URL = `https://codeload.github.com/resemble-ai/chatterbox/zip/${CHATTERBOX_SOURCE_REVISION}`;
export const CHATTERBOX_SOURCE_PROJECT = 'https://github.com/resemble-ai/chatterbox';
export const CHATTERBOX_MODEL_REVISION = '5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18';
// Sabitlenen commit'teki Türkçe metin yolunun dosya özetleri. Kurulum bu özetleri
// doğrular: PyPI 0.1.7 wheel'i aynı sürüm numarasını taşıdığı için sürüm yetmez.
export const CHATTERBOX_EXPECTED_HASHES = {
  mtlTts: '936759044e54cffe8c68b91b32e01da0bc032a1e084f769f0403080d86ad153c',
  tokenizer: 'e169f02f14b008e8e7a4f29df66ecafaa29972ff4a38724b51545b8563861889',
} as const;
