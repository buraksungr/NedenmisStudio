import { context } from 'esbuild';
import { spawn } from 'node:child_process';

const common = { bundle: true, platform: 'node', target: 'node20', sourcemap: true, external: ['electron', 'better-sqlite3', 'sharp', '@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe'], logLevel: 'info' };
const processes = [];
const main = await context({ ...common, entryPoints: ['electron/main/index.ts'], outfile: 'dist/main/index.js', format: 'esm' });
const preload = await context({ ...common, entryPoints: ['electron/preload/index.ts'], outfile: 'dist/preload/index.cjs', format: 'cjs' });
await Promise.all([main.watch(), preload.watch()]);
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], { stdio: 'inherit' }); processes.push(vite);
let ready = false;
for (let i = 0; i < 60; i += 1) { try { const response = await fetch('http://127.0.0.1:5173'); if (response.ok) { ready = true; break; } } catch { /* Vite henüz hazır değil. */ } await new Promise((resolve) => setTimeout(resolve, 500)); }
if (!ready) { console.error('Vite başlatılamadı.'); vite.kill(); process.exit(1); }
const electron = spawn(process.platform === 'win32' ? 'node_modules/electron/dist/electron.exe' : 'node_modules/electron/dist/electron', ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5173' } }); processes.push(electron);
function shutdown() { for (const child of processes) child.kill(); void main.dispose(); void preload.dispose(); }
electron.on('exit', () => { shutdown(); process.exit(); }); process.on('SIGINT', () => { shutdown(); process.exit(); }); process.on('SIGTERM', () => { shutdown(); process.exit(); });
