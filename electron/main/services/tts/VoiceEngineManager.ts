import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { cpus, freemem } from 'node:os';
import { dirname, join } from 'node:path';
import { x as extractTar } from 'tar';
import type { VoiceEngineProgress, VoiceEngineStatus } from '../../../../shared/types.js';
import type { Logger } from '../../infrastructure/Logger.js';
import type { SettingsRepository } from '../../infrastructure/database/SettingsRepository.js';
import { CHATTERBOX_DEPENDENCY_PROFILE, CHATTERBOX_SOURCE_REVISION, CHATTERBOX_SOURCE_URL } from './ChatterboxSource.js';

const PYTHON_RELEASE = '20250317';
const PYTHON_VERSION = '3.11.11';
const RUNTIME_FILES = {
  win32: 'cpython-3.11.11+20250317-x86_64-pc-windows-msvc-install_only_stripped.tar.gz',
  linux: 'cpython-3.11.11+20250317-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz',
} as const;
const REQUIRED_MODEL_FILES = ['ve.pt', 't3_mtl23ls_v3.safetensors', 's3gen.pt', 'grapheme_mtl_merged_expanded_v1.json', 'conds.pt', 'Cangjie5_TC.json'];
interface StoredState { dependenciesInstalled?: boolean; sourceRevision?: string; dependencyProfile?: string; modelDownloaded?: boolean; verifiedAt?: string; lastGenerationSeconds?: number; lastReferenceSha256?: string; pythonVersion?: string; torchVersion?: string }
export interface ChatterboxGeneration { outputPath: string; duration: number; generationSeconds: number; modelLoadSeconds: number; referenceSha256: string; model: string; checkpoint: string; device: string; torch: string }
interface GenerationInput { id: string; text: string; referencePath: string; outputPath: string; exaggeration: number; cfgWeight: number; temperature: number }

function friendlyProcessError(message: string): string {
  if (/403|429|rate limit/i.test(message)) return 'Model indirme sunucusu isteği sınırladı. Daha sonra yeniden deneyin; yarım indirilen dosyalar korunur.';
  if (/ENOENT|not found|bulunamadı/i.test(message)) return 'Yönetilen Python veya gerekli dosya bulunamadı. Yerel bileşen kurulumunu yeniden çalıştırın.';
  if (/memory|bellek|out of memory/i.test(message)) return 'Chatterbox için kullanılabilir RAM yetersiz. Diğer uygulamaları kapatıp daha kısa bir metin deneyin.';
  return message.split('\n').filter(Boolean).slice(-4).join('\n') || 'Ses motoru işlemi tamamlanamadı.';
}

export class VoiceEngineManager {
  readonly root: string;
  private readonly runtimeRoot: string;
  private readonly modelsRoot: string;
  private setupPromise?: Promise<VoiceEngineStatus>;
  private worker?: ChildProcessWithoutNullStreams;
  private queue: Promise<unknown> = Promise.resolve();
  private current?: { resolve: (value: ChatterboxGeneration) => void; reject: (error: Error) => void };
  private workerBuffer = '';
  private workerStderr = '';
  constructor(storagePath: () => string, private readonly resources: string, private readonly repository: SettingsRepository, private readonly logger: Logger, private readonly referencePath: () => string | undefined, private readonly emit: (progress: VoiceEngineProgress) => void) {
    this.root = join(storagePath(), 'voice-engine'); this.runtimeRoot = join(this.root, 'runtime'); this.modelsRoot = join(this.root, 'models');
  }
  private state(): StoredState { return this.repository.get<StoredState>('voice-engine-v3', {}); }
  private saveState(patch: StoredState): void { this.repository.set('voice-engine-v3', { ...this.state(), ...patch }); }
  private python(): string { return join(this.runtimeRoot, process.platform === 'win32' ? 'python.exe' : 'bin/python'); }
  private bridge(): string { return join(this.resources, 'bridge.py'); }
  private snapshot(): string | undefined {
    const snapshots = join(this.modelsRoot, 'hub', 'models--ResembleAI--chatterbox', 'snapshots');
    if (!existsSync(snapshots)) return undefined;
    for (const entry of readdirSyncSafe(snapshots)) { const path = join(snapshots, entry); if (REQUIRED_MODEL_FILES.every((file) => existsSync(join(path, file)))) return path; }
    return undefined;
  }
  async status(): Promise<VoiceEngineStatus> {
    const state = this.state(); const snapshot = this.snapshot();
    return { runtimeInstalled: existsSync(this.python()), dependenciesInstalled: Boolean(state.dependenciesInstalled && state.sourceRevision === CHATTERBOX_SOURCE_REVISION && state.dependencyProfile === CHATTERBOX_DEPENDENCY_PROFILE && existsSync(this.python())), modelDownloaded: Boolean(snapshot), referenceAvailable: Boolean(this.referencePath() && existsSync(this.referencePath()!)), verifiedAt: state.verifiedAt, lastGenerationSeconds: state.lastGenerationSeconds, pythonVersion: state.pythonVersion, torchVersion: state.torchVersion, setupRunning: Boolean(this.setupPromise), modelPath: snapshot, componentPath: this.root };
  }
  private progress(stage: VoiceEngineProgress['stage'], message: string, extra: Partial<VoiceEngineProgress> = {}): void { this.emit({ stage, message, ...extra }); }
  setup(): Promise<VoiceEngineStatus> {
    if (this.setupPromise) return this.setupPromise;
    this.setupPromise = this.performSetup().catch((error) => { this.logger.error('Chatterbox kurulumu başarısız', error); throw new Error(friendlyProcessError(error instanceof Error ? error.message : String(error))); }).finally(() => { this.setupPromise = undefined; });
    return this.setupPromise;
  }
  private async performSetup(): Promise<VoiceEngineStatus> {
    await mkdir(this.root, { recursive: true });
    if (!existsSync(this.python())) await this.installRuntime();
    if (!this.state().dependenciesInstalled || this.state().sourceRevision !== CHATTERBOX_SOURCE_REVISION || this.state().dependencyProfile !== CHATTERBOX_DEPENDENCY_PROFILE) await this.installDependencies();
    if (!this.snapshot()) await this.downloadModel();
    this.progress('complete', 'Chatterbox Multilingual V3 yerel bileşeni hazır. Gerçek klonlama sınaması yapabilirsiniz.', { progress: 1 });
    return this.status();
  }
  private runtimeUrl(file: string): string { return `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/${file.replace('+', '%2B')}`; }
  private async installRuntime(): Promise<void> {
    const file = process.platform === 'win32' ? RUNTIME_FILES.win32 : RUNTIME_FILES.linux;
    if (!file) throw new Error('Bu işletim sistemi için yönetilen Python desteklenmiyor. Python 3.11 ile kaynak kurulumu kullanın.');
    const downloads = join(this.root, 'downloads'); await mkdir(downloads, { recursive: true }); const archive = join(downloads, file);
    if (!existsSync(archive)) {
      this.progress('runtime', `İzole Python ${PYTHON_VERSION} indiriliyor…`, { progress: 0 });
      const response = await fetch(this.runtimeUrl(file)); if (!response.ok) throw new Error(`Python indirilemedi (HTTP ${response.status}).`);
      const total = Number(response.headers.get('content-length') || 0); const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(archive, bytes); this.progress('runtime', 'Python paketi indirildi; bütünlük doğrulanıyor.', { downloadedBytes: bytes.length, totalBytes: total || bytes.length, progress: .8 });
    }
    const checksumResponse = await fetch(`${this.runtimeUrl(file)}.sha256`); if (!checksumResponse.ok) throw new Error('Python SHA-256 dosyası indirilemedi.');
    const expected = (await checksumResponse.text()).trim().split(/\s+/)[0]; const actual = createHash('sha256').update(await readFile(archive)).digest('hex');
    if (expected.toLowerCase() !== actual) { await unlink(archive).catch(() => undefined); throw new Error('Python arşivinin SHA-256 doğrulaması başarısız. Dosya silindi; kurulumu yeniden deneyin.'); }
    this.progress('runtime', 'İzole Python açılıyor…', { progress: .9 }); await mkdir(this.runtimeRoot, { recursive: true }); await extractTar({ file: archive, cwd: this.runtimeRoot, strip: 1 });
    if (!existsSync(this.python())) throw new Error('Python arşivi açıldı ancak çalıştırılabilir dosya bulunamadı.');
  }
  private async installDependencies(): Promise<void> {
    this.progress('dependencies', 'CPU-only PyTorch ve ses bağımlılıkları kuruluyor. Bu adım birkaç GB indirebilir…', { progress: 0 });
    await this.run(this.python(), ['-m', 'ensurepip', '--upgrade'], 'dependencies');
    await this.run(this.python(), ['-m', 'pip', 'install', '--upgrade', '--only-binary=:all:', 'pip', 'setuptools', 'wheel'], 'dependencies');
    await this.run(this.python(), ['-m', 'pip', 'install', '--only-binary=:all:', 'numpy==1.26.4'], 'dependencies');
    await this.run(this.python(), ['-m', 'pip', 'install', '--only-binary=:all:', 'torch==2.6.0', 'torchaudio==2.6.0', '--index-url', 'https://download.pytorch.org/whl/cpu'], 'dependencies');
    await this.run(this.python(), ['-m', 'pip', 'install', '--only-binary=:all:', '-r', join(this.resources, 'requirements-runtime.txt')], 'dependencies');
    this.progress('dependencies', 'Resmî Chatterbox Multilingual V3 kaynak kodu kuruluyor…');
    await this.run(this.python(), ['-m', 'pip', 'install', '--no-deps', '--force-reinstall', '--no-build-isolation', CHATTERBOX_SOURCE_URL], 'dependencies');
    const output = await this.run(this.python(), [this.bridge(), 'status'], 'dependencies');
    const statusLine = output.split('\n').filter((line) => line.includes('"event": "status"')).at(-1);
    if (!statusLine) throw new Error('Chatterbox bağımlılıkları doğrulanamadı.');
    const details = JSON.parse(statusLine) as { python: string; torch: string; cuda: boolean; v3_supported: boolean; watermarker_ready: boolean };
    if (details.cuda) throw new Error('CPU-only kurulum beklenirken CUDA etkin PyTorch bulundu. Yönetilen bileşeni yeniden kurun.');
    if (!details.v3_supported) throw new Error('Kurulan Chatterbox paketi Multilingual V3 desteklemiyor. V2’ye geri dönülmeyecek; resmî V3 kaynak kurulumunu yeniden deneyin.');
    if (!details.watermarker_ready) throw new Error('Perth watermark bileşeni CPU’da başlatılamadı. setuptools/PyYAML bağımlılıklarını içeren yönetilen kurulumu yeniden çalıştırın.');
    this.saveState({ dependenciesInstalled: true, sourceRevision: CHATTERBOX_SOURCE_REVISION, dependencyProfile: CHATTERBOX_DEPENDENCY_PROFILE, pythonVersion: details.python, torchVersion: details.torch });
  }
  private async downloadModel(): Promise<void> {
    this.progress('model', 'Chatterbox Multilingual V3 modeli Hugging Face üzerinden indiriliyor…', { progress: 0 });
    let downloadedBytes = 0; const timer = setInterval(() => { void directorySize(join(this.modelsRoot, 'hub')).then((size) => { if (size !== downloadedBytes) { downloadedBytes = size; this.progress('model', `Model indiriliyor · ${(size / 1024 ** 2).toFixed(0)} MB`, { downloadedBytes: size }); } }).catch(() => undefined); }, 2000);
    try {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3 && !this.snapshot(); attempt += 1) {
        try { await this.run(this.python(), [this.bridge(), 'download'], 'model', { HF_HOME: this.modelsRoot, HF_HUB_DISABLE_XET: '1' }); lastError = undefined; }
        catch (error) { lastError = error; this.logger.warn(`Model indirme denemesi ${attempt} başarısız`, error); if (attempt < 3) { this.progress('model', `İndirme kesildi; ${attempt + 1}. deneme başlıyor. Yarım dosyalar korunuyor…`); await new Promise((resolve) => setTimeout(resolve, 5000)); } }
      }
      if (lastError && !this.snapshot()) throw lastError;
    }
    finally { clearInterval(timer); }
    if (!this.snapshot()) throw new Error('Model indirmesi tamamlandı ancak V3 dosyalarının tamamı bulunamadı.'); this.saveState({ modelDownloaded: true });
  }
  private run(command: string, args: string[], stage: VoiceEngineProgress['stage'], extraEnv: NodeJS.ProcessEnv = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true, env: { ...process.env, HF_HOME: this.modelsRoot, ...extraEnv } }); let output = ''; let errors = '';
      child.stdout.on('data', (chunk: Buffer) => { const text = chunk.toString(); output = `${output}${text}`.slice(-80000); for (const line of text.split('\n').filter((item) => item.trim())) this.logger.info(`Voice engine ${stage}: ${line.trim().slice(0, 1000)}`); });
      child.stderr.on('data', (chunk: Buffer) => { const text = chunk.toString(); errors = `${errors}${text}`.slice(-40000); const line = text.trim().split('\n').filter(Boolean).at(-1); if (line) this.progress(stage, line.slice(0, 240)); });
      child.on('error', reject); child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(errors || output || `İşlem ${code} koduyla kapandı.`)));
    });
  }
  synthesize(input: GenerationInput): Promise<ChatterboxGeneration> {
    const operation = this.queue.then(() => this.performSynthesis(input), () => this.performSynthesis(input)); this.queue = operation; return operation;
  }
  private async performSynthesis(input: GenerationInput): Promise<ChatterboxGeneration> {
    const status = await this.status();
    if (!status.runtimeInstalled || !status.dependenciesInstalled || !status.modelDownloaded) throw new Error('Chatterbox henüz kurulmadı. Ses Stüdyosu’ndan yerel bileşeni ve V3 modelini indirin.');
    if (!input.referencePath || !existsSync(input.referencePath)) throw new Error('Gerçek ses klonlama için önce referans ses yükleyin.');
    await mkdir(dirname(input.outputPath), { recursive: true }); const snapshot = this.snapshot()!;
    if (!this.worker) this.startWorker(snapshot);
    return new Promise<ChatterboxGeneration>((resolve, reject) => {
      this.current = { resolve, reject };
      const request = { id: input.id, text: input.text, reference_path: input.referencePath, output_path: input.outputPath, exaggeration: input.exaggeration, cfg_weight: input.cfgWeight, temperature: input.temperature };
      this.worker!.stdin.write(`${JSON.stringify(request)}\n`, (error) => { if (error) { this.current = undefined; reject(error); } });
    });
  }
  private startWorker(snapshot: string): void {
    const memoryLimit = freemem() < 6 * 1024 ** 3 ? 2 : 4; const threads = Math.max(1, Math.min(memoryLimit, cpus().length)); this.workerStderr = ''; this.workerBuffer = '';
    this.progress('generation', `Chatterbox V3 CPU üzerinde yükleniyor · ${threads} iş parçacığı…`);
    const child = spawn(this.python(), [this.bridge(), 'worker', '--snapshot', snapshot, '--threads', String(threads)], { windowsHide: true, env: { ...process.env, HF_HOME: this.modelsRoot, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', HF_HUB_DISABLE_XET: '1' } });
    this.worker = child;
    child.stdout.on('data', (chunk: Buffer) => { this.workerBuffer += chunk.toString(); let index = this.workerBuffer.indexOf('\n'); while (index >= 0) { const line = this.workerBuffer.slice(0, index); this.workerBuffer = this.workerBuffer.slice(index + 1); this.handleWorkerLine(line); index = this.workerBuffer.indexOf('\n'); } });
    child.stderr.on('data', (chunk: Buffer) => { const text = chunk.toString(); this.workerStderr = `${this.workerStderr}${text}`.slice(-30000); const line = text.trim().split('\n').filter(Boolean).at(-1); if (line) this.progress('generation', line.replace(/\r/g, '').slice(0, 220)); });
    child.on('error', (error) => { this.current?.reject(error); this.current = undefined; this.worker = undefined; });
    child.on('close', () => { if (this.current) { this.current.reject(new Error(friendlyProcessError(this.workerStderr || 'Chatterbox worker beklenmedik şekilde kapandı.'))); this.current = undefined; } this.worker = undefined; });
  }
  private handleWorkerLine(line: string): void {
    if (!line.trim()) return; let event: Record<string, unknown>;
    try { event = JSON.parse(line) as Record<string, unknown>; } catch { this.logger.warn(`Chatterbox çıktısı: ${line.slice(0, 500)}`); return; }
    const type = String(event.event || '');
    if (type === 'result' && this.current) {
      const generation: ChatterboxGeneration = { outputPath: String(event.output_path), duration: Number(event.duration), generationSeconds: Number(event.generation_seconds), modelLoadSeconds: Number(event.model_load_seconds), referenceSha256: String(event.reference_sha256), model: String(event.model), checkpoint: String(event.checkpoint), device: String(event.device), torch: String(event.torch) };
      this.saveState({ verifiedAt: new Date().toISOString(), lastGenerationSeconds: generation.generationSeconds, lastReferenceSha256: generation.referenceSha256 }); this.current.resolve(generation); this.current = undefined;
    } else if (type === 'error' && this.current) { this.current.reject(workerError(event, 'Chatterbox sentezi başarısız.')); this.current = undefined; }
    else if (type === 'fatal' && this.current) { this.current.reject(workerError(event, 'Chatterbox worker başlatılamadı.')); this.current = undefined; }
    else this.progress('generation', type === 'ready' ? 'Model yüklendi; Türkçe konuşma üretiliyor…' : type === 'reference_loading' ? 'Referans konuşmacı özellikleri çıkarılıyor…' : `Chatterbox: ${type}`);
  }
  close(): void { if (this.worker) { this.worker.stdin.end(); this.worker.kill(); this.worker = undefined; } }
}

function workerError(event: Record<string, unknown>, fallback: string): Error {
  const message = String(event.message || fallback); const traceback = typeof event.traceback === 'string' ? event.traceback : '';
  return new Error(traceback ? `${message}\n${traceback}` : message);
}
function readdirSyncSafe(path: string): string[] { try { return readdirSync(path); } catch { return []; } }
async function directorySize(path: string): Promise<number> { if (!existsSync(path)) return 0; let total = 0; for (const entry of await readdir(path, { withFileTypes: true })) { const child = join(path, entry.name); if (entry.isDirectory()) total += await directorySize(child); else { try { total += (await stat(child)).size; } catch { /* Yarım dosya bir sonraki turda okunur. */ } } } return total; }
