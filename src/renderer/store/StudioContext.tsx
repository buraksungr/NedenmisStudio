import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import type { AppSettings, ChannelIdentity, Project } from '@shared/types';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export type Page = 'dashboard' | 'create' | 'projects' | 'editor' | 'voice' | 'media' | 'settings';
interface Toast { id: number; message: string; tone: 'success' | 'error' | 'info' }
interface StudioValue {
  page: Page; navigate(page: Page): void;
  projects: Project[]; settings: AppSettings; identity: ChannelIdentity; activeProject?: Project;
  ready: boolean; busy: string;
  refreshProjects(): Promise<void>; refreshSettings(): Promise<void>;
  openProject(id: string): Promise<void>; setActiveProject(project?: Project): void;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>; saveIdentity(identity: ChannelIdentity): Promise<void>;
  run<T>(label: string, operation: () => Promise<T>, successMessage?: string): Promise<T>;
  toast(message: string, tone?: Toast['tone']): void;
}
const StudioContext = createContext<StudioValue | undefined>(undefined);

export function StudioProvider({ children }: PropsWithChildren): ReactNode {
  const [page, setPage] = useState<Page>('dashboard'); const [projects, setProjects] = useState<Project[]>([]); const [settings, setSettings] = useState<AppSettings>(); const [identity, setIdentity] = useState<ChannelIdentity>();
  const [activeProject, setActiveProject] = useState<Project>(); const [ready, setReady] = useState(false); const [busy, setBusy] = useState(''); const [toasts, setToasts] = useState<Toast[]>([]); const toastId = useRef(0);
  const toast = useCallback((message: string, tone: Toast['tone'] = 'info') => { const id = ++toastId.current; setToasts((current) => [...current, { id, message, tone }]); window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), tone === 'error' ? 8000 : 4000); }, []);
  const refreshProjects = useCallback(async () => { setProjects(await window.nedenmis.projects.list()); }, []);
  const refreshSettings = useCallback(async () => { const [nextSettings, nextIdentity] = await Promise.all([window.nedenmis.settings.get(), window.nedenmis.identity.get()]); setSettings(nextSettings); setIdentity(nextIdentity); }, []);
  useEffect(() => { Promise.all([refreshProjects(), refreshSettings()]).then(() => setReady(true)).catch((error) => { toast(`Uygulama başlatılamadı: ${error.message}`, 'error'); setReady(true); }); }, [refreshProjects, refreshSettings, toast]);
  useEffect(() => { const handler = (event: PromiseRejectionEvent) => { event.preventDefault(); const reason = event.reason as { message?: string; nedenmisHandled?: boolean }; if (!reason?.nedenmisHandled) toast((reason?.message || 'Beklenmeyen bir işlem hatası oluştu.').replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ''), 'error'); }; window.addEventListener('unhandledrejection', handler); return () => window.removeEventListener('unhandledrejection', handler); }, [toast]);
  useEffect(() => { if (!settings) return; const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.classList.toggle('dark', dark); }, [settings]);
  const run = useCallback(async <T,>(label: string, operation: () => Promise<T>, successMessage?: string): Promise<T> => { setBusy(label); try { const result = await operation(); if (successMessage) toast(successMessage, 'success'); return result; } catch (error) { const raw = error instanceof Error ? error.message : String(error); toast(raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ''), 'error'); if (error && typeof error === 'object') Object.assign(error, { nedenmisHandled: true }); throw error; } finally { setBusy(''); } }, [toast]);
  const value = useMemo<StudioValue>(() => ({
    page, navigate: (next) => setPage(next), projects, settings: settings!, identity: identity!, activeProject, ready, busy, refreshProjects, refreshSettings,
    openProject: async (id) => { const project = await run('Proje açılıyor', () => window.nedenmis.projects.get(id)); setActiveProject(project); setPage('editor'); },
    setActiveProject,
    saveSettings: async (patch) => { const next = await window.nedenmis.settings.update(patch); setSettings(next); return next; },
    saveIdentity: async (next) => { await window.nedenmis.identity.update(next); setIdentity(next); },
    run, toast,
  }), [page, projects, settings, identity, activeProject, ready, busy, refreshProjects, refreshSettings, run, toast]);
  return <StudioContext.Provider value={value}>{children}<div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-[380px] flex-col gap-2"><AnimatePresence>{toasts.map((item) => <motion.div key={item.id} initial={{ opacity: 0, y: 12, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 30 }} className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-panel p-4 shadow-float"><div className={`mt-0.5 ${item.tone === 'error' ? 'text-red-500' : item.tone === 'success' ? 'text-emerald-500' : 'text-sky-500'}`}>{item.tone === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}</div><p className="flex-1 whitespace-pre-wrap text-xs leading-5 text-ink">{item.message}</p><button className="text-muted hover:text-ink" onClick={() => setToasts((current) => current.filter((toastItem) => toastItem.id !== item.id))}><X size={15} /></button></motion.div>)}</AnimatePresence></div></StudioContext.Provider>;
}
export function useStudio(): StudioValue { const value = useContext(StudioContext); if (!value) throw new Error('StudioProvider eksik'); return value; }
