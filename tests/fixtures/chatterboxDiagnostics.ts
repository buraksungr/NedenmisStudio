import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface TurkishQualityCase { id: string; audio: string; text: string; required: boolean }
export type TurkishAbDiagnostic = Record<string, unknown>;

/** Persist every completed case before a later assertion or export can fail. */
export function createPartialDiagnosticsWriter(manifestPath?: string, resultPath?: string) {
  return async (qualityCases: TurkishQualityCase[], abDiagnostics: TurkishAbDiagnostic[]): Promise<void> => {
    if (manifestPath) { await mkdir(dirname(manifestPath), { recursive: true }); await writeFile(manifestPath, JSON.stringify({ cases: qualityCases }, null, 2), 'utf8'); }
    if (resultPath) { const path = join(dirname(resultPath), 'turkish-ab-progress.json'); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(abDiagnostics, null, 2), 'utf8'); }
  };
}
