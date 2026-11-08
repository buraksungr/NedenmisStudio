import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = resolve(root, '../NedenmisStudio.zip');
const skipDirectories = new Set(['.git', 'node_modules', 'dist', 'release', 'coverage', 'storage', '.venv-tts', '.cache', 'test-results']);
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name); const rel = relative(root, path);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) {
      if (entry.name === '.env' || entry.name === 'NedenmisStudio.zip' || entry.name.endsWith('.log') || /\.(sqlite|sqlite-shm|sqlite-wal|exe|blockmap)$/.test(entry.name) || rel === 'assets/reference_voice.wav') continue;
      files.push({ path, rel });
    }
  }
}
await walk(root);
const output = createWriteStream(outputPath); const archive = archiver('zip', { zlib: { level: 9 } });
const completed = new Promise((resolvePromise, reject) => { output.on('close', resolvePromise); archive.on('error', reject); });
archive.pipe(output);
for (const file of files.sort((a, b) => a.rel.localeCompare(b.rel))) archive.file(file.path, { name: `NedenmisStudio/${file.rel.replaceAll('\\', '/')}` });
await archive.finalize(); await completed;
const info = await stat(outputPath);
console.log(`NedenmisStudio.zip hazır: ${files.length} dosya, ${(info.size / 1024 / 1024).toFixed(2)} MB\n${outputPath}`);
