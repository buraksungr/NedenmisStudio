import type { ChannelIdentity, ConnectionTestResult, Project, Scene } from '../../../../shared/types.js';

export interface VisualProvider {
  readonly id: string;
  readonly name: string;
  generate(project: Project, scene: Scene, identity: ChannelIdentity, outputPath: string): Promise<void>;
  test(): Promise<ConnectionTestResult>;
}
