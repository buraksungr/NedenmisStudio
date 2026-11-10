import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Windows dağıtım kapılarının zorunlu sırası', () => {
  it('gökyüzü E2E → ASR → ZIP → bağımsız ZIP testi → NSIS → kurulu uygulama → Release sırasını korur', async () => {
    const workflow = readFileSync('.github/workflows/windows-release.yml', 'utf8');
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
    const script = readFileSync('scripts/test-portable.ps1', 'utf8');
    expect(script).toContain('Expand-Archive');
    expect(script).toContain('Copy-Item $sourceDatabase $copiedDatabase');
    expect(script).toContain("$env:NEDENMIS_SMOKE_PROJECT = 'Gökyüzü neden mavi görünür?'");
    expect(script).toContain("installerUsed=$false");
    expect(script).toContain('nb_read_frames');
  });

  it('yayın öncesi Chatterbox V3 kaynak/model kimliğini doğrular', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/windows-release.yml'), 'utf8');
    expect(workflow).toContain('scripts/verify-chatterbox-source.py');
    expect(workflow).toContain('release/chatterbox-source.json');
    const script = readFileSync(join(process.cwd(), 'scripts/verify-chatterbox-source.py'), 'utf8');
    expect(script).toContain('ab55923c27757c90cfcc407baa57dc25a7d25217');
    expect(script).toContain('5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18');
    expect(script).toContain('SOURCE_REVISION =');
    expect(script).toContain('MODEL_REVISION =');
    // TypeScript tarafındaki beklenen özetler Python testindeki özetlerle aynı olmalı.
    const source = readFileSync(join(process.cwd(), 'electron/main/services/tts/ChatterboxSource.ts'), 'utf8');
    const python = readFileSync(join(process.cwd(), 'voice-engine/test_bridge.py'), 'utf8');
    for (const digest of source.match(/[a-f0-9]{64}/g) ?? []) expect(python).toContain(digest);
  });
});
