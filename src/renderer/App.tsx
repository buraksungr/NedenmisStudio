import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clapperboard, FolderKanban, LayoutDashboard, Library, Plus, Settings, Sparkles, AudioLines, MonitorCheck } from 'lucide-react';
import { StudioProvider, useStudio, type Page } from './store/StudioContext';
import { Dashboard } from './pages/Dashboard';
import { CreateVideo } from './pages/CreateVideo';
import { Projects } from './pages/Projects';
import { Editor } from './pages/Editor';
import { VoiceStudio } from './pages/VoiceStudio';
import { MediaLibrary } from './pages/MediaLibrary';
import { SettingsPage } from './pages/SettingsPage';
import { SystemInfo } from '@shared/types';

const NAV: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Genel Bakış', icon: LayoutDashboard }, { id: 'projects', label: 'Projeler', icon: FolderKanban },
  { id: 'editor', label: 'Video Editörü', icon: Clapperboard }, { id: 'voice', label: 'Ses Stüdyosu', icon: AudioLines },
  { id: 'media', label: 'Medya Kitaplığı', icon: Library }, { id: 'settings', label: 'Ayarlar', icon: Settings },
];
const TITLES: Record<Page, { eyebrow: string; title: string }> = {
  dashboard: { eyebrow: 'Çalışma alanı', title: 'Genel Bakış' }, create: { eyebrow: 'Yeni üretim', title: 'Video Oluştur' }, projects: { eyebrow: 'Arşiv', title: 'Projeler' },
  editor: { eyebrow: 'Kurgu masası', title: 'Video Editörü' }, voice: { eyebrow: 'Anlatım', title: 'Ses Stüdyosu' }, media: { eyebrow: 'Varlıklar', title: 'Medya Kitaplığı' }, settings: { eyebrow: 'Nedenmiş Studio', title: 'Ayarlar' },
};

function Shell() {
  const { page, navigate, activeProject, ready, busy } = useStudio(); const [system, setSystem] = useState<SystemInfo>();
  useEffect(() => { window.nedenmis.system.info().then(setSystem).catch(() => undefined); }, []);
  return <div className="flex h-full bg-canvas text-ink">
    <aside className="flex w-[232px] shrink-0 flex-col bg-panel px-4 py-6">
      <button onClick={() => navigate('dashboard')} className="mb-8 flex items-center gap-3 px-2 text-left"><div className="relative flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#d8ff65] text-[#17211b] shadow-sm"><span className="text-lg font-bold tracking-[-.12em]">N?</span><span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#79b4a1]" /></div><div><div className="text-[15px] font-bold tracking-[-.04em]">Nedenmiş</div><div className="text-[9px] font-semibold uppercase tracking-[.23em] text-muted">Studio</div></div></button>
      <button onClick={() => navigate('create')} className="btn-primary mb-6 w-full"><Plus size={17} />Yeni video</button>
      <nav className="space-y-1">{NAV.map((item) => <button key={item.id} onClick={() => navigate(item.id)} className={`nav-item ${page === item.id ? 'active' : ''}`}><item.icon size={18} strokeWidth={page === item.id ? 2.2 : 1.7} />{item.label}{item.id === 'editor' && activeProject && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}</button>)}</nav>
      <div className="mt-auto px-2">
        <div className="mb-4 rounded-xl bg-raised p-3.5"><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold"><Sparkles size={14} className="text-accent" />CPU dostu üretim</div><p className="text-[10px] leading-4 text-muted">Yerel infografik motoru hazır. Ağır modeller otomatik yüklenmez.</p></div>
        <div className="flex items-center gap-2 text-[10px] text-muted"><MonitorCheck size={13} className={system?.ffmpegAvailable === false ? 'text-amber-500' : 'text-emerald-500'} /><span>{system?.ffmpegAvailable === false ? 'FFmpeg yapılandırması gerekli' : 'Yerel çalışma alanı hazır'}</span><span className="ml-auto">v{system?.version || '1.0.0'}</span></div>
      </div>
    </aside>
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-[76px] shrink-0 items-center justify-between px-8"><div><div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[.16em] text-muted">{TITLES[page].eyebrow}</div><h1 className="text-[20px] font-semibold tracking-[-.035em]">{TITLES[page].title}</h1></div><div className="flex items-center gap-3">{busy && <div className="flex items-center gap-2 rounded-full bg-panel px-3 py-2 text-[11px] text-muted"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />{busy}</div>}<div className="flex items-center gap-2 text-[11px] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Otomatik kayıt açık</div></div></header>
      <div className="min-h-0 flex-1 overflow-hidden">{!ready ? <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-muted/20 border-t-accent" /></div> : <AnimatePresence mode="wait"><motion.div key={page} className="h-full" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: .2 }}>
        {page === 'dashboard' && <Dashboard />}{page === 'create' && <CreateVideo />}{page === 'projects' && <Projects />}{page === 'editor' && <Editor />}{page === 'voice' && <VoiceStudio />}{page === 'media' && <MediaLibrary />}{page === 'settings' && <SettingsPage />}
      </motion.div></AnimatePresence>}</div>
    </main>
  </div>;
}
export function App() { return <StudioProvider><Shell /></StudioProvider>; }
