import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const development = process.argv.includes('--dev'); const marker = join(tmpdir(), `nedenmis-smoke-${Date.now()}.json`);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npm, [development ? 'run' : 'start', ...(development ? ['dev'] : [])], { cwd: process.cwd(), env: { ...process.env, NEDENMIS_SMOKE_TEST: marker }, stdio: 'inherit', windowsHide: false });
let done = false;
function stop() { if (child.exitCode !== null) return; if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGTERM'); }
const deadline = Date.now() + 120000;
child.on('exit', () => { done = true; });
try {
  while (!done && !existsSync(marker) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 500));
  if (!existsSync(marker)) throw new Error('Electron smoke testi 120 saniye içinde sonuç üretmedi.');
  const report = JSON.parse(await readFile(marker, 'utf8'));
  if (!report.ok || !report.rendererLoaded || !report.voiceBridgeExists || !report.ffmpegVersion || report.packaged !== !development) throw new Error(`Electron smoke doğrulaması başarısız: ${JSON.stringify(report)}`);
  console.log(`${development ? 'Geliştirme' : 'Üretim'} Electron açılışı başarılı: ${JSON.stringify(report)}`);
} finally { stop(); await rm(marker, { force: true }); }
