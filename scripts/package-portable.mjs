import archiver from 'archiver';
import { createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
const source = join(process.cwd(), 'release', 'win-unpacked'); if (!existsSync(source)) throw new Error('release/win-unpacked bulunamadı; önce Windows üretim paketini oluşturun.');
const output = createWriteStream(join(process.cwd(), 'release', 'NedenmisStudio-Portable.zip')); const archive = archiver('zip', { zlib: { level: 6 } });
const completed = new Promise((resolve, reject) => { output.on('close', resolve); archive.on('error', reject); }); archive.pipe(output); archive.directory(source, 'NedenmisStudio'); await archive.finalize(); await completed; console.log('NedenmisStudio-Portable.zip hazır. Model ilk kullanımda yönetilen bileşene indirilir.');
