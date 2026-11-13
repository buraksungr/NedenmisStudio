import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';

const mainOnly = process.argv.includes('--main-only');
const common = { bundle: true, platform: 'node', target: 'node20', sourcemap: true, external: ['electron', 'better-sqlite3', 'sharp', '@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe'], logLevel: 'info' };
await build({ ...common, entryPoints: ['electron/main/index.ts'], outfile: 'dist/main/index.js', format: 'esm' });
await build({ ...common, entryPoints: ['electron/preload/index.ts'], outfile: 'dist/preload/index.cjs', format: 'cjs' });
if (!mainOnly) {
  const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
