import type { ConnectionTestResult, NarrationStyle, Project, ResearchResult, SceneSection } from '../../../../shared/types.js';

export interface ScriptGenerationInput { topic: string; category: string; targetDuration: number; narrationStyle: NarrationStyle; instructions: string; research: ResearchResult }
export interface SceneDirection { narration: string; visualDescription: string; visualPrompt: string; section?: SceneSection }

export interface LlmProvider {
  readonly id: string;
  readonly name: string;
  generateScript(input: ScriptGenerationInput): Promise<string>;
  directScenes?(project: Project): Promise<SceneDirection[]>;
  rewrite(project: Project, selectedText: string, instruction: string): Promise<string>;
  test(): Promise<ConnectionTestResult>;
}
