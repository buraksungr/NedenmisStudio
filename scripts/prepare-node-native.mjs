import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let usable = false;
try { const Database = require('better-sqlite3'); const database = new Database(':memory:'); database.close(); usable = true; } catch { usable = false; }
if (!usable) {
  console.log('better-sqlite3, Node.js test ABI’si için yeniden hazırlanıyor…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'; const result = spawnSync(npm, ['rebuild', 'better-sqlite3'], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status || 1);
}
