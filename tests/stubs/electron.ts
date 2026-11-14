/**
 * Testler için `electron` modülü taklidi.
 *
 * Üretim kodunda `electron` gerçek Electron çalışma zamanıdır; vitest
 * (node ortamı) altında içe aktarılamaz. Bu taklit yalnızca IPC kayıt
 * yeteneğini sağlar: `ipcMain.handle` çağrıları toplanır, `app.getVersion`
 * sabit döner, `dialog`/`shell` çağrıları güvenli yanıt verir.
 *
 * Hiçbir işlevselliği değiştirmez — yalnızca "hangi kanal hangi girdiyi
 * bekliyor" sözleşmesini gerçek çağrı yolu üzerinden sınamaya izin verir.
 */
export const handlers = new Map<string, (...args: any[]) => unknown>();

export const ipcMain = {
  // Electron'da `ipcMain.handle` dinleyicisi `(event, ...args)` alır. Taklit,
  // testlerin doğrudan `handler(...args)` çağırmasına izin vermek için event'i
  // kendisi ekler; böylece iş argümanları kaymaz.
  handle(channel: string, listener: (...args: any[]) => unknown): void {
    handlers.set(channel, (...args: any[]) => listener({ sender: {} }, ...args));
  },
  removeHandler(channel: string): void { handlers.delete(channel); },
  on(): void { /* testte kullanılmaz */ },
  once(): void { /* testte kullanılmaz */ },
};

export const app = {
  getVersion(): string { return '1.1.0-test'; },
  getPath(): string { return '/tmp'; },
  isPackaged: false,
  on(): void { /* testte kullanılmaz */ },
  whenReady(): Promise<void> { return Promise.resolve(); },
};

export const dialog = {
  async showOpenDialog(): Promise<{ canceled: boolean; filePaths: string[] }> { return { canceled: true, filePaths: [] }; },
  async showMessageBox(): Promise<{ response: number }> { return { response: 0 }; },
};

export const shell = {
  async openExternal(): Promise<void> { /* testte kullanılmaz */ },
  showItemInFolder(): void { /* testte kullanılmaz */ },
};

export default { app, dialog, ipcMain, shell };
