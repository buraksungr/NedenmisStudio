import { z } from 'zod';
import type { Project, SubtitleStyle } from './types.js';

export const projectInputSchema = z.object({
  name: z.string().max(120).optional(), topic: z.string().trim().min(3).max(500),
  category: z.string().max(80).optional(), mode: z.enum(['automatic', 'custom']),
  instructions: z.string().max(4000).optional(), targetDuration: z.number().min(15).max(300).optional(),
  narrationStyle: z.enum(['belgesel', 'samimi', 'enerjik', 'sakin']).optional(),
  visualStyle: z.enum(['belgesel', 'minimal', 'infografik', 'sinematik', 'illustrasyon']).optional(),
});

export const subtitleSchema = z.object({ id: z.string(), start: z.number().nonnegative(), end: z.number().nonnegative(), text: z.string().max(1000), emphasis: z.array(z.string()).optional() });
export const audioClipSchema = z.object({ id: z.string(), mediaId: z.string().optional(), kind: z.enum(['music', 'sfx']), name: z.string(), path: z.string(), start: z.number().nonnegative(), duration: z.number().positive(), trimStart: z.number().nonnegative(), volume: z.number().min(0).max(2), fadeIn: z.number().nonnegative(), fadeOut: z.number().nonnegative() });
export const projectSchema = z.object({
  id: z.string(), name: z.string().trim().min(1).max(120), topic: z.string().max(500), category: z.string(), mode: z.enum(['automatic', 'custom']), status: z.enum(['draft', 'researched', 'script_ready', 'scenes_ready', 'production', 'ready', 'rendering', 'completed', 'error']),
  instructions: z.string().max(4000), targetDuration: z.number().min(1).max(300), narrationStyle: z.enum(['belgesel', 'samimi', 'enerjik', 'sakin']), visualStyle: z.enum(['belgesel', 'minimal', 'infografik', 'sinematik', 'illustrasyon']), script: z.string().max(50000),
  scenes: z.array(z.object({ id: z.string(), number: z.number().int().positive(), narration: z.string().max(10000), visualDescription: z.string().max(5000), visualPrompt: z.string().max(5000), assetPath: z.string().optional(), assetType: z.enum(['procedural', 'ai-image', 'imported-image', 'video']), duration: z.number().min(.2).max(300), transition: z.enum(['fade', 'dissolve', 'slide', 'none']), cameraMovement: z.enum(['static', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right']), subtitles: z.array(subtitleSchema), subtitleTiming: z.enum(['estimated', 'aligned']), narrationPath: z.string().optional(), narrationDuration: z.number().optional(), visualProvider: z.string().optional(), status: z.enum(['empty', 'ready', 'generating', 'error']), error: z.string().optional() })).max(100),
  research: z.custom<Project['research']>((value) => Boolean(value && typeof value === 'object' && 'status' in value && 'sources' in value)), audio: z.object({ narrationVolume: z.number().min(0).max(2), musicVolume: z.number().min(0).max(2), sfxVolume: z.number().min(0).max(2), musicDucking: z.boolean(), musicClips: z.array(audioClipSchema), sfxClips: z.array(audioClipSchema) }),
  subtitleStyle: z.custom<SubtitleStyle>((value) => Boolean(value && typeof value === 'object' && 'fontFamily' in value && 'fontSize' in value)), brand: z.object({ channelName: z.string().max(120), primaryColor: z.string().max(20), secondaryColor: z.string().max(20) }).optional(), voice: z.object({ providerId: z.string(), voiceId: z.string(), speed: z.number().min(.5).max(2), pitch: z.number().min(-12).max(12) }),
  createdAt: z.string(), updatedAt: z.string(), lastOpenedAt: z.string().optional(), recoveryNote: z.string().optional(),
});

export const voiceSelectionSchema = z.object({ providerId: z.string(), voiceId: z.string(), speed: z.number().min(.5).max(2), pitch: z.number().min(-12).max(12) });
export const ttsRequestSchema = z.object({ text: z.string().trim().min(1).max(10000), selection: voiceSelectionSchema, referenceVoicePath: z.string().optional() });
export const idSchema = z.string().min(1).max(160);
export const apiKeySchema = z.string().max(1000);
export const urlSchema = z.string().url().refine((url) => ['https:', 'http:'].includes(new URL(url).protocol), 'Yalnızca HTTP(S) adresleri açılabilir.');
