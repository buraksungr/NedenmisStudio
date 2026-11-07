import type { ConnectionTestResult, ResearchResult } from '../../../../shared/types.js';

export interface ResearchProvider {
  readonly id: string;
  readonly name: string;
  research(topic: string, category: string): Promise<ResearchResult>;
  test(): Promise<ConnectionTestResult>;
}

export function unavailableResearch(note: string): ResearchResult {
  return { status: 'unavailable', sources: [], note };
}
