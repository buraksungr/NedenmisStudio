import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi, ExportProgress } from '../../shared/types.js';

const invoke = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
const api: AppApi = {
  projects: { list: invoke('projects:list'), get: invoke('projects:get'), create: invoke('projects:create'), update: invoke('projects:update'), remove: invoke('projects:remove'), duplicate: invoke('projects:duplicate'), rename: invoke('projects:rename') },
  topics: { discover: invoke('topics:discover') }, research: { run: invoke('research:run') },
  ai: { generateScript: invoke('ai:script'), generateScenes: invoke('ai:scenes'), rewrite: invoke('ai:rewrite') },
  visuals: { regenerate: invoke('visuals:regenerate'), generateAll: invoke('visuals:all') },
  tts: { providers: invoke('tts:providers'), preview: invoke('tts:preview'), generateProject: invoke('tts:project') },
  media: { list: invoke('media:list'), import: invoke('media:import'), remove: invoke('media:remove'), addToTimeline: invoke('media:add-to-timeline') },
  settings: { get: invoke('settings:get'), update: invoke('settings:update'), setApiKey: invoke('settings:key'), clearApiKey: invoke('settings:key-clear'), test: invoke('settings:test'), chooseDirectory: invoke('settings:choose-directory'), chooseFFmpeg: invoke('settings:choose-ffmpeg') },
  identity: { get: invoke('identity:get'), update: invoke('identity:update') },
  exports: { list: invoke('exports:list'), start: invoke('exports:start'), cancel: invoke('exports:cancel'), reveal: invoke('exports:reveal'), onProgress(callback: (progress: ExportProgress) => void) { const listener = (_event: Electron.IpcRendererEvent, progress: ExportProgress) => callback(progress); ipcRenderer.on('exports:progress', listener); return () => ipcRenderer.removeListener('exports:progress', listener); } },
  dashboard: { stats: invoke('dashboard:stats') },
  system: { info: invoke('system:info'), mediaUrl(path?: string) { return path ? `nedenmis-media://local/${Buffer.from(path, 'utf8').toString('base64url')}` : ''; }, openExternal: invoke('system:open-external') },
};
contextBridge.exposeInMainWorld('nedenmis', api);
