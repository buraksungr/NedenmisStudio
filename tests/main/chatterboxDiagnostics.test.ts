import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPartialDiagnosticsWriter } from '../fixtures/chatterboxDiagnostics.js';

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'nedenmis-chatterbox-diagnostics-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe('Chatterbox kısmi A/B kanıtları', () => {
  it('sonraki adım başarısız olsa bile tamamlanan WAV, token ve [tr] tanılarını korur', async () => {
    const manifestPath = join(directory, 'release', 'quality.json'); const resultPath = join(directory, 'release', 'result.json');
    const save = createPartialDiagnosticsWriter(manifestPath, resultPath);
    const audio = join(directory, 'build10-lowercase-english.wav');
    const diagnostic = { id: 'build10-lowercase-english', duration: 5.25, generationSeconds: 81.2, referenceSha256: 'a'.repeat(64), normalizedText: 'buz, yoğunluğu…', decodedText: '[tr]buz...', tokenCount: 4, tokenIds: [739, 100, 101, 102], languageTokenId: 739, unknownTokens: 0, seed: 20261107 };
    await save([{ id: diagnostic.id, audio, text: 'Buz suda yüzer.', required: false }], [diagnostic]);
    await expect(async () => { throw new Error('Simüle edilmiş sonraki video/assertion hatası'); }).rejects.toThrow('Simüle edilmiş');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const partial = JSON.parse(await readFile(join(directory, 'release', 'turkish-ab-progress.json'), 'utf8'));
    expect(manifest.cases).toHaveLength(1); expect(manifest.cases[0].audio).toBe(audio);
    expect(partial).toHaveLength(1); expect(partial[0].tokenIds).toEqual([739, 100, 101, 102]);
    expect(partial[0].tokenIds[0]).toBe(partial[0].languageTokenId); expect(partial[0].decodedText).toContain('[tr]');
    expect(partial[0].unknownTokens).toBe(0); expect(partial[0].duration).toBeGreaterThan(0);
  });
});
