import { app, BrowserWindow, net, protocol, shell } from 'electron';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createAppContext, type AppContext } from './services/AppContext.js';
import { registerIpc } from './ipc/registerIpc.js';

const directory = fileURLToPath(new URL('.', import.meta.url));
let mainWindow: BrowserWindow | undefined; let context: AppContext | undefined; let initialStorage = '';

protocol.registerSchemesAsPrivileged([{ scheme: 'nedenmis-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

function inside(path: string, root: string): boolean { const rel = relative(resolve(root), resolve(path)); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); }
function registerMediaProtocol(): void {
  protocol.handle('nedenmis-media', async (request) => {
    try {
      const token = new URL(request.url).pathname.slice(1); const filePath = Buffer.from(token, 'base64url').toString('utf8');
      const allowedRoots = [initialStorage, context?.settings.get().storagePath].filter(Boolean) as string[];
      if (!filePath || !allowedRoots.some((root) => inside(filePath, root)) || !existsSync(filePath)) return new Response('Medya bulunamadı', { status: 404 });
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch { return new Response('Geçersiz medya adresi', { status: 400 }); }
  });
}

async function createWindow(): Promise<void> {
  initialStorage = join(app.getPath('userData'), 'storage');
  context = createAppContext(initialStorage, join(app.getPath('userData'), 'nedenmis-studio.sqlite'), (progress) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('exports:progress', progress); }, app.isPackaged ? join(process.resourcesPath, 'voice-engine') : join(app.getAppPath(), 'voice-engine'), (progress) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('voice-engine:progress', progress); });
  const referenceTarget = join(initialStorage, 'assets', 'reference_voice.wav');
  if (existsSync(referenceTarget) && !context.mediaRepository.list('reference-voice').length) {
    context.mediaRepository.upsertByPath({ kind: 'reference-voice', name: 'Nedenmiş referans sesi', path: referenceTarget, mimeType: 'audio/wav', size: statSync(referenceTarget).size });
  }
  const sourceReference = join(app.getAppPath(), 'assets', 'reference_voice.wav');
  if (!app.isPackaged && existsSync(sourceReference) && !context.mediaRepository.list('reference-voice').length) {
    try { await context.media.importReference(sourceReference); } catch (error) { context.logger.warn('Kaynak referans ses içe aktarılamadı', error); }
  }
  registerMediaProtocol();
  mainWindow = new BrowserWindow({
    width: 1480, height: 960, minWidth: 1120, minHeight: 720, show: false, backgroundColor: '#101411', title: 'Nedenmiş Studio',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { preload: join(directory, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, devTools: Boolean(process.env.VITE_DEV_SERVER_URL) },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => { const current = mainWindow?.webContents.getURL(); if (current && url !== current && !url.startsWith('file:') && !url.startsWith('http://localhost:5173')) { event.preventDefault(); } });
  registerIpc(context, mainWindow, initialStorage);
  if (process.env.NEDENMIS_SMOKE_TEST) mainWindow.webContents.once('did-finish-load', () => { void (async () => { const report = { ok: true, packaged: app.isPackaged, platform: process.platform, arch: process.arch, version: app.getVersion(), userData: app.getPath('userData'), database: join(app.getPath('userData'), 'nedenmis-studio.sqlite'), storage: initialStorage, voiceBridgeExists: existsSync(app.isPackaged ? join(process.resourcesPath, 'voice-engine', 'bridge.py') : join(app.getAppPath(), 'voice-engine', 'bridge.py')), ffmpegVersion: await context!.ffmpeg.version(), rendererLoaded: true }; await writeFile(process.env.NEDENMIS_SMOKE_TEST!, JSON.stringify(report, null, 2), 'utf8'); setTimeout(() => app.quit(), 400); })().catch(async (error) => { context?.logger.error('Smoke testi başarısız', error); await writeFile(process.env.NEDENMIS_SMOKE_TEST!, JSON.stringify({ ok: false, error: String(error) }), 'utf8'); app.exit(1); }); });
  if (process.env.VITE_DEV_SERVER_URL) await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL); else await mainWindow.loadFile(join(directory, '../renderer/index.html'));
  mainWindow.on('closed', () => { mainWindow = undefined; });
}

app.whenReady().then(createWindow).catch((error) => { console.error('Uygulama başlatılamadı', error); app.exit(1); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0 && app.isReady()) void createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { context?.render.cancelAll(); context?.voiceEngine.close(); });
app.on('will-quit', () => { context?.database.close(); });
process.on('uncaughtException', (error) => context?.logger.error('Yakalanmayan ana süreç hatası', error));
process.on('unhandledRejection', (error) => context?.logger.error('Yakalanmayan Promise hatası', error));
