import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { retainVerificationArtifacts } from '../helpers.js';

/**
 * Gerçek Chatterbox V3 Türkçe üretimi + bağımsız Türkçe ASR.
 *
 * Ağır testtir: yalnızca NEDENMIS_TURKISH_TTS_E2E=1 ve kurulmuş yerel V3 bileşeni
 * varken çalışır. ASR sonuçları insan dinlemesi sayılmaz.
 */
const execFileAsync = promisify(execFile);
const enabled = process.env.NEDENMIS_TURKISH_TTS_E2E === '1';

const CASES = [
  { id: 'turkish-characters', text: 'Işık İĞDIR çığlığı şoförün ölçümünü gösterdi; güvercin ğ ile ünlüydü.', marker: 'çğışöü' },
  { id: 'numbers-units', text: 'Sıcaklık eksi sekiz derece, rüzgâr yirmi beş kilometre bölü saniye, alan yedi yüz seksen üç bin beş yüz altmış iki kilometre kare.', marker: 'kilometre' },
  { id: 'proper-nouns', text: "TÜBİTAK'ın Çankırı'daki ölçümünde Niğde, Şanlıurfa ve İstanbul karşılaştırıldı.", marker: 'TÜBİTAK' },
  { id: 'long-sentence', text: 'Buzun suda yüzmesinin nedeni, su donarken moleküllerin düzenli ve açık bir kristal kafes oluşturması, bu kafesin daha fazla yer kaplaması ve böylece buzun yoğunluğunun sudan daha düşük kalmasıdır.', marker: 'kristal' },
  { id: 'conversational', text: 'Bakın, aslında olay çok basit: buz sudan hafif olduğu için yüzüyor, o kadar!', marker: 'buz' },
  { id: 'suffixes', text: "Ankara'ya, İzmir'den, Bursa'da, Trabzon'a giden yolları ölçtük ve sonuçları karşılaştırdık.", marker: 'Ankara' },
  { id: 'ordinal-and-percent', text: 'Yarışmada üçüncü oldu; sıcaklık yüzde on dört virgül beş arttı.', marker: 'üçüncü' },
];

/**
 * Kurulu paketin kimliğini doğrudan yönetilen Python üzerinden okur.
 * Ayarlar veritabanındaki bayraklara güvenmek, yanlış kurulumu gizleyebilir.
 */
async function readInstalledIdentity(context: { voiceEngine: { status(): Promise<{ componentPath: string }> }; settings?: unknown }): Promise<{ mtlTtsSha256?: string; tokenizerSha256?: string; v3Supported?: boolean; packageVersion?: string }> {
  const { componentPath } = await context.voiceEngine.status();
  const python = process.env.NEDENMIS_VOICE_PYTHON || (process.platform === 'win32' ? join(componentPath, 'runtime', 'python.exe') : join(componentPath, 'runtime', 'bin', 'python'));
  expect(existsSync(python), `yönetilen Python bulunamadı: ${python}`).toBe(true);
  const { stdout } = await execFileAsync(python, [join(process.cwd(), 'voice-engine', 'bridge.py'), 'status'], { env: { ...process.env, HF_HOME: join(componentPath, 'models'), PYTHONIOENCODING: 'utf-8', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' }, timeout: 300_000 });
  const line = stdout.split('\n').filter((item) => item.includes('"event": "status"')).at(-1);
  if (!line) throw new Error(`bridge.py status çıktısı okunamadı: ${stdout.slice(-500)}`);
  const parsed = JSON.parse(line) as { mtl_tts_sha256?: string; tokenizer_sha256?: string; v3_supported?: boolean; package_version?: string };
  return { mtlTtsSha256: parsed.mtl_tts_sha256, tokenizerSha256: parsed.tokenizer_sha256, v3Supported: parsed.v3_supported, packageVersion: parsed.package_version };
}

describe.skipIf(!enabled)('Gerçek Chatterbox V3 Türkçe üretimi ve ASR değerlendirmesi', () => {
  it('yedi Türkçe vakayı üretir, WAV kimliğini doğrular ve ASR raporu yazar', async () => {
    const storage = resolve(process.env.NEDENMIS_CHATTERBOX_STORAGE || join(process.cwd(), '.chatterbox-test-storage'));
    const outputDirectory = join(storage, 'previews', 'build20-turkish');
    await mkdir(outputDirectory, { recursive: true });
    const { createAppContext } = await import('../../electron/main/services/AppContext.js');
    const context = createAppContext(storage, join(storage, 'build20-tts.sqlite'), () => undefined, join(process.cwd(), 'voice-engine'), (progress) => console.log(`[V3 ${progress.stage}] ${progress.message}`));
    const report: Array<Record<string, unknown>> = [];
    try {
      // ÖNEMLİ: e2e testi yönetilen bileşeni kurar ve durum bilgisini AYNI depolama
      // klasöründeki ayar veritabanına yazar. Bu test kurulum yapmaz; ama kurulu
      // bileşeni doğrulaması için durum kaydını gerçek dosyalardan yeniden üretir.
      // Aksi hâlde doğru kurulu bir ortamda bile "Chatterbox henüz kurulmadı" hatası
      // alınıyordu (CI 43033196862).
      await context.voiceEngine.adoptInstalled();
      const status = await context.voiceEngine.status();
      expect(status.runtimeInstalled, 'yönetilen Python kurulu olmalı').toBe(true);
      expect(status.modelDownloaded, 'Multilingual V3 ağırlıkları indirilmiş olmalı').toBe(true);
      // Paket kimliği ayarlar veritabanından DEĞİL, kurulu paketin kendisinden okunur:
      // `bridge.py status` gerçek dosya özetlerini ve paket sürümünü bildirir.
      const installed = await readInstalledIdentity(context);
      expect(installed.mtlTtsSha256, 'kurulu mtl_tts.py özeti').toBe('936759044e54cffe8c68b91b32e01da0bc032a1e084f769f0403080d86ad153c');
      expect(installed.tokenizerSha256, 'kurulu tokenizer özeti').toBe('e169f02f14b008e8e7a4f29df66ecafaa29972ff4a38724b51545b8563861889');
      expect(installed.v3Supported, 'kurulu paket V3 desteklemeli').toBe(true);
      expect(installed.packageVersion, 'chatterbox-tts sürümü').toBeTruthy();
      const reference = process.env.NEDENMIS_CHATTERBOX_TURKISH_REFERENCE;
      if (!reference || !existsSync(reference)) throw new Error('Gerçek Türkçe referans ses gerekli (NEDENMIS_CHATTERBOX_TURKISH_REFERENCE).');
      const imported = await context.media.importReference(reference);
      const project = context.projects.create({ topic: 'Türkçe kalite', name: 'Türkçe kalite', category: 'Bilim', mode: 'custom', targetDuration: 30 });
      project.voice = { providerId: 'chatterbox-multilingual-v3', voiceId: 'reference-tr', speed: 1, pitch: 0, exaggeration: .5, cfgWeight: .5, temperature: .8 };
      context.projects.update(project);

      for (const item of CASES) {
        const path = join(outputDirectory, `${item.id}.wav`);
        const preview = await context.tts.preview({ text: item.text, selection: project.voice, referenceVoicePath: imported.path });
        await copyFile(preview.path, path);
        const probe = await context.ffmpeg.probe(path);
        // ASR öncesi teknik kapı: gerçek 24 kHz mono WAV, makul süre, sessizlik değil.
        expect(probe.sampleRate, `${item.id} örnekleme`).toBe(24000);
        expect(probe.channels, `${item.id} kanal`).toBe(1);
        expect(probe.duration, `${item.id} süre`).toBeGreaterThan(.8);
        const characteristics = await execFileAsync(context.ffmpeg.ffmpegPath, ['-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '-']);
        const mean = /mean_volume: (-?[\d.]+) dB/.exec(characteristics.stderr)?.[1];
        expect(Number(mean), `${item.id} ortalama ses düzeyi`).toBeGreaterThan(-40);
        expect(preview.engine?.checkpoint).toBe('t3_mtl23ls_v3.safetensors');
        expect(preview.engine?.textPreprocessing).toBe('NFKD,fullcase');
        expect(preview.engine?.unknownTokens).toBe(0);
        expect(preview.engine?.decodedText).toContain('[tr]');
        const asrPath = join(outputDirectory, `${item.id}-asr.json`);
        const asrPython = process.env.NEDENMIS_ASR_PYTHON || process.env.NEDENMIS_VOICE_PYTHON || 'python';
        const { stdout } = await execFileAsync(asrPython, ['scripts/turkish_asr_eval.py', '--audio', path, '--text', item.text, '--case', item.id, '--output', asrPath]);
        const asr = JSON.parse(stdout.trim().split('\n').at(-1)!) as { status: string; cer?: number; wer?: number };
        report.push({ id: item.id, text: item.text, audio: path, duration: probe.duration, meanDb: Number(mean), checkpoint: preview.engine?.checkpoint, asrStatus: asr.status, cer: asr.cer, wer: asr.wer, asrReport: asrPath });
        // ASR yoksa bu bir "başarı" değildir; sessizce geçilmez.
        expect(asr.status, `${item.id} ASR değerlendirmesi yapılamadı`).toBe('evaluated');
        expect(asr.cer!, `${item.id} CER`).toBeLessThanOrEqual(.35);
      }
      const output = join(process.cwd(), '.verification', 'build20-tts', 'turkish-tts-asr.json');
      await mkdir(join(process.cwd(), '.verification', 'build20-tts'), { recursive: true });
      await writeFile(output, JSON.stringify({ cases: report, model: 'Chatterbox Multilingual V3', checkpoint: 't3_mtl23ls_v3.safetensors', humanListeningPerformed: false, note: 'ASR yalnızca anlaşılırlık kanıtıdır; insan dinlemesi yapılmadı.' }, null, 2), 'utf8');
      retainVerificationArtifacts(outputDirectory, 'build20-tts/audio', true);
    } finally { context.voiceEngine.close(); context.database.close(); }
  }, 3_600_000);
});

afterAll(() => { /* Temizlik yok: kanıt dosyaları .verification altında tutulur. */ });
