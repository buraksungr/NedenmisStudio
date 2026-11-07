import { safeStorage } from 'electron';
import type { SettingsRepository } from './database/SettingsRepository.js';

/** API anahtarları yalnızca ana süreçte tutulur. Destekleniyorsa işletim sistemi şifrelemesi kullanılır. */
export class CredentialStore {
  constructor(private readonly settings: SettingsRepository) {}

  set(providerId: string, value: string): void {
    if (!/^[a-z0-9-]+$/.test(providerId)) throw new Error('Geçersiz sağlayıcı kimliği.');
    const clean = value.trim();
    if (!clean) { this.clear(providerId); return; }
    const encrypted = safeStorage.isEncryptionAvailable() ? `safe:${safeStorage.encryptString(clean).toString('base64')}` : `plain:${Buffer.from(clean, 'utf8').toString('base64')}`;
    this.settings.set(`credential:${providerId}`, encrypted);
  }

  get(providerId: string): string | undefined {
    const stored = this.settings.get<string>(`credential:${providerId}`, '');
    if (!stored) return process.env[`${providerId.replaceAll('-', '_').toUpperCase()}_API_KEY`];
    try {
      if (stored.startsWith('safe:')) return safeStorage.decryptString(Buffer.from(stored.slice(5), 'base64'));
      if (stored.startsWith('plain:')) return Buffer.from(stored.slice(6), 'base64').toString('utf8');
    } catch { return undefined; }
    return undefined;
  }

  has(providerId: string): boolean { return Boolean(this.get(providerId)); }
  clear(providerId: string): void { this.settings.delete(`credential:${providerId}`); }
}
