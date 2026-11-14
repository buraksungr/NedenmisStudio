import type { ProjectStatus } from '@shared/types';

export const STATUS: Record<ProjectStatus, { label: string; tone: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }> = {
  draft: { label: 'Taslak', tone: 'neutral' }, researched: { label: 'Araştırıldı', tone: 'blue' }, script_ready: { label: 'Senaryo hazır', tone: 'blue' },
  scenes_ready: { label: 'Sahne planı', tone: 'amber' }, production: { label: 'Üretimde', tone: 'amber' }, ready: { label: 'Kurguya hazır', tone: 'green' },
  rendering: { label: 'İşleniyor', tone: 'blue' }, completed: { label: 'Tamamlandı', tone: 'green' }, error: { label: 'Hata', tone: 'red' },
};
export function shortDate(value: string): string { return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
export function relativeDate(value: string): string { const diff = Date.now() - new Date(value).getTime(); const days = Math.floor(diff / 86400000); if (days <= 0) return 'Bugün'; if (days === 1) return 'Dün'; if (days < 7) return `${days} gün önce`; return shortDate(value); }
export function bytes(value?: number): string { if (!value) return '—'; const units = ['B', 'KB', 'MB', 'GB']; let size = value; let index = 0; while (size >= 1024 && index < units.length - 1) { size /= 1024; index++; } return `${size.toFixed(index > 1 ? 1 : 0)} ${units[index]}`; }
export function plainError(error: unknown): string { return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '') : String(error); }
