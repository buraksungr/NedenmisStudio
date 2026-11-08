import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Windows dağıtım kapılarının zorunlu sırası', () => {
  it('gökyüzü E2E → ASR → ZIP → bağımsız ZIP testi → NSIS → kurulu uygulama → Release sırasını korur', async () => {
    const workflow = await readFile('.github/workflows/windows-release.yml', 'utf8');
    const names = [
      '- name: Gerçek gökyüzü V3, sayı WAVları ve Rayleigh MP4 E2E',
      '- name: Bağımsız Türkçe ASR anlaşılırlık kapısı',
      '- name: Windows x64 unpacked üretim (installer yok)',
      '- name: Taşınabilir ZIP',
      '- name: ZIP’ten bağımsız aç, kopya SQLite, Rayleigh önizleme ve MP4 doğrula',
      '- name: Windows x64 NSIS kurucusu',
      '- name: Kur, terminalsiz aç ve SQLite doğrula',
      '- name: GitHub Release',
    ];
    const positions = names.map((name) => workflow.indexOf(name));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(workflow).toContain('run: ./scripts/test-portable.ps1');
    expect(workflow.indexOf('run: npm run pack:win-dir')).toBeLessThan(workflow.indexOf('run: node scripts/package-portable.mjs'));
  });

  it('portable test gerçek ZIP çıkarımını, bağımsız SQLite kopyasını ve gökyüzü exportunu kullanır', async () => {
    const script = await readFile('scripts/test-portable.ps1', 'utf8');
    expect(script).toContain('Expand-Archive');
    expect(script).toContain('Copy-Item $sourceDatabase $copiedDatabase');
    expect(script).toContain("$env:NEDENMIS_SMOKE_PROJECT = 'Gökyüzü neden mavi görünür?'");
    expect(script).toContain("installerUsed=$false");
    expect(script).toContain('nb_read_frames');
  });
});
