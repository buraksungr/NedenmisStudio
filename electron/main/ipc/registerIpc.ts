import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';
import { cpus, freemem, totalmem } from 'node:os';
import { mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { apiKeySchema, idSchema, projectInputSchema, projectSchema, ttsRequestSchema, urlSchema } from '../../../shared/validation.js';
import type { AppContext } from '../services/AppContext.js';
import type { MediaKind, VoiceProviderDetails } from '../../../shared/types.js';

const pair = <A, B>(a: z.ZodType<A>, b: z.ZodType<B>) => z.tuple([a, b]);
const mediaKinds = z.enum(['generated-image', 'image', 'video', 'music', 'sfx', 'narration', 'reference-voice']);

export function registerIpc(context: AppContext, window: BrowserWindow, initialStorage: string): void {
  const handle = (channel: string, listener: (...args: any[]) => unknown) => ipcMain.handle(channel, async (_event, ...args) => {
    try { return await listener(...args); }
    catch (error) {
      context.logger.error(`IPC hatası · ${channel}`, error);
      if (error instanceof z.ZodError) { const issue = error.issues[0]; const field = issue?.path.join('.'); const message = field === 'selectedText' ? 'Yeniden yazılacak metin boş olamaz. Önce metin seçin.' : `${field ? `${field}: ` : ''}${issue?.message || 'Girdi doğrulanamadı.'}`; throw new Error(message); }
      const message = error instanceof Error ? error.message : 'İşlem tamamlanamadı. Ayrıntılar günlük dosyasına kaydedildi.';
      throw new Error(message.length > 900 ? `${message.slice(0, 900)}…` : message);
    }
  });
  handle('projects:list', () => context.projects.list());
  handle('projects:get', (id) => context.projects.markOpened(idSchema.parse(id)));
  handle('projects:create', async (input) => {
    const parsed = projectInputSchema.parse(input); const identity = context.settings.identity();
    let project = context.projects.create(parsed, identity);
    project.voice = { ...context.settings.get().defaultVoice };
    if (!parsed.narrationStyle) project.narrationStyle = identity.defaultNarrationStyle;
    if (!parsed.visualStyle) project.visualStyle = identity.visualStyle;
    project = context.projects.update(project);
    if (identity.defaultMusicPath) {
      const music = context.mediaRepository.list('music').find((item) => item.path === identity.defaultMusicPath);
      if (music) project = await context.media.addToTimeline(project.id, music.id, 0);
    }
    return project;
  });
  handle('projects:update', (project) => context.projectService.update(projectSchema.parse(project)));
  handle('projects:remove', (id) => context.projects.remove(idSchema.parse(id)));
  handle('projects:duplicate', (id) => context.projects.duplicate(idSchema.parse(id)));
  handle('projects:rename', (id, name) => context.projects.rename(...pair(idSchema, z.string().min(1).max(120)).parse([id, name])));
  handle('topics:discover', (category) => context.topics.discover(z.string().max(80).optional().parse(category)));
  handle('research:run', (id) => context.research.run(idSchema.parse(id)));
  handle('ai:script', (id) => context.ai.generate(idSchema.parse(id)));
  handle('ai:scenes', (id) => context.ai.generateScenes(idSchema.parse(id)));
  handle('ai:rewrite', (request) => { const data = z.object({ projectId: idSchema, selectedText: z.string().trim().min(1, 'Yeniden yazılacak metin boş olamaz.').max(10000), instruction: z.string().max(1000), customInstruction: z.string().optional() }).parse(request); return context.ai.rewrite(data.projectId, data.selectedText, data.instruction === 'custom' ? data.customInstruction || 'Daha akıcı yaz' : data.instruction); });
  handle('visuals:regenerate', (id, sceneId) => context.visuals.regenerate(...pair(idSchema, idSchema).parse([id, sceneId])));
  handle('visuals:all', (id) => context.visuals.generateAll(idSchema.parse(id)));
  handle('tts:providers', async () => { const engine = await context.voiceEngine.status(); return context.tts.details((provider): Omit<VoiceProviderDetails, 'voices' | 'supportsSpeed' | 'supportsPitch'> => {
    const config = context.settings.definitions().find((item) => item.id === provider.id)!;
    return { ...config, configured: provider.id === 'chatterbox-multilingual-v3' ? engine.dependenciesInstalled && engine.modelDownloaded : config.configured, referenceVoiceSupported: provider.referenceVoiceSupported };
  }); });
  handle('tts:preview', (request) => context.tts.preview(ttsRequestSchema.parse(request)));
  handle('tts:project', (id) => context.tts.generateProject(idSchema.parse(id)));
  handle('voice-engine:status', () => context.voiceEngine.status());
  handle('voice-engine:setup', () => context.voiceEngine.setup());
  handle('media:list', (kind) => context.media.list(mediaKinds.optional().parse(kind) as MediaKind | undefined));
  handle('media:import', async (kind) => {
    const parsed = mediaKinds.parse(kind); const result = await dialog.showOpenDialog(window, { title: 'Nedenmiş Studio · Medya içe aktar', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Desteklenen medya', extensions: parsed === 'image' ? ['png', 'jpg', 'jpeg', 'webp', 'gif'] : parsed === 'video' ? ['mp4', 'mov', 'webm'] : ['wav', 'mp3', 'm4a', 'aac', 'ogg'] }] });
    return result.canceled ? [] : context.media.import(result.filePaths, parsed);
  });
  handle('media:remove', (id) => context.media.remove(idSchema.parse(id)));
  handle('media:add-to-timeline', (projectId, mediaId, start) => context.media.addToTimeline(...z.tuple([idSchema, idSchema, z.number().nonnegative()]).parse([projectId, mediaId, start])));
  handle('settings:get', () => context.settings.get());
  handle('settings:update', (patch) => context.settings.update(z.record(z.string(), z.any()).parse(patch)));
  handle('settings:key', (providerId, key) => { const [id, value] = pair(idSchema, apiKeySchema).parse([providerId, key]); context.credentials.set(id, value); });
  handle('settings:key-clear', (providerId) => context.credentials.clear(idSchema.parse(providerId)));
  handle('settings:test', async (providerId) => {
    const id = idSchema.parse(providerId); const provider = context.llmProviders.get(id) || context.researchProviders.get(id) || context.ttsProviders.get(id) || context.visualProviders.get(id);
    if (!provider) return { ok: false, message: 'Sağlayıcı bulunamadı.' }; return provider.test();
  });
  handle('settings:choose-directory', async (purpose) => { const result = await dialog.showOpenDialog(window, { title: purpose === 'storage' ? 'Depolama klasörünü seçin' : 'Video çıktı klasörünü seçin', properties: ['openDirectory', 'createDirectory'] }); return result.canceled ? undefined : result.filePaths[0]; });
  handle('settings:choose-ffmpeg', async () => { const result = await dialog.showOpenDialog(window, { title: 'ffmpeg çalıştırılabilir dosyasını seçin', properties: ['openFile'], filters: [{ name: 'FFmpeg', extensions: [process.platform === 'win32' ? 'exe' : '*'] }] }); return result.canceled ? undefined : result.filePaths[0]; });
  handle('identity:get', () => context.settings.identity());
  handle('identity:update', (identity) => context.settings.updateIdentity(identity));
  handle('exports:list', () => context.exports.list());
  handle('exports:start', (projectId) => context.render.start(idSchema.parse(projectId)));
  handle('exports:cancel', (exportId) => context.render.cancel(idSchema.parse(exportId)));
  handle('exports:reveal', async (path) => { if (context.exports.list().some((record) => record.outputPath === path)) shell.showItemInFolder(String(path)); else throw new Error('Dışa aktarım kaydı bulunamadı.'); });
  handle('dashboard:stats', () => context.projects.stats());
  handle('system:info', async () => { let ffmpegAvailable = true; let ffmpegVersion: string | undefined; try { ffmpegVersion = await context.ffmpeg.version(); } catch (error) { ffmpegAvailable = false; context.logger.warn('FFmpeg kullanılamıyor', error); } return { platform: process.platform, version: app.getVersion(), ffmpegAvailable, ffmpegVersion, storagePath: context.settings.get().storagePath || initialStorage, cpuCores: cpus().length, totalMemoryGB: Math.round(totalmem() / 1024 ** 3 * 10) / 10, freeMemoryGB: Math.round(freemem() / 1024 ** 3 * 10) / 10 }; });
  handle('system:open-external', (url) => shell.openExternal(urlSchema.parse(url)));
  handle('storage:ensure', async () => { await mkdir(context.settings.get().storagePath, { recursive: true }); });
}
