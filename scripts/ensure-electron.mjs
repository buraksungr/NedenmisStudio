import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const executable = join('node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
if (!existsSync(executable)) {
  console.log('Electron runtime eksik; resmî paket binary’si açıkça indiriliyor…');
  const env = { ...process.env }; delete env.ELECTRON_SKIP_BINARY_DOWNLOAD;
  const result = spawnSync(process.execPath, [join('node_modules', 'electron', 'install.js')], { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!existsSync(executable)) throw new Error(`Electron çalıştırılabilir dosyası hâlâ bulunamadı: ${executable}`);
console.log(`Electron runtime doğrulandı: ${executable}`);
