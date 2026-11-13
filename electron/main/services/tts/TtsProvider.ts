import type { ConnectionTestResult, TtsRequest, TtsResult, VoiceInfo } from '../../../../shared/types.js';

export interface TtsProvider {
  readonly id: string;
  readonly name: string;
  readonly supportsSpeed: boolean;
  readonly supportsPitch: boolean;
  readonly referenceVoiceSupported: boolean;
  voices(): Promise<VoiceInfo[]>;
  synthesize(request: TtsRequest, outputPath: string): Promise<Omit<TtsResult, 'path' | 'providerId'>>;
  test(): Promise<ConnectionTestResult>;
}
