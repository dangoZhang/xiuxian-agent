import { z } from 'zod';
import { sourceSchema } from './enums.js';

const endpointSchema = z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
  message: 'Base URL must use HTTP or HTTPS',
});

export const modelEndpointSchema = z.object({
  baseUrl: endpointSchema,
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

export const modelConfigSchema = z.object({
  default: modelEndpointSchema,
  maxConcurrency: z.number().int().min(1).max(64),
  roles: z.object({
    heaven: modelEndpointSchema.optional(),
    fate: modelEndpointSchema.optional(),
    cultivator: modelEndpointSchema.optional(),
    narration: modelEndpointSchema.optional(),
  }).default({}),
});

export const modelCapabilitySchema = z.object({
  structuredOutput: z.boolean(),
  toolCalling: z.boolean(),
  streamingText: z.boolean(),
});

export const modelTestResultSchema = z.object({
  ok: z.boolean(),
  capabilities: modelCapabilitySchema,
  latencyMs: z.number().nonnegative(),
  failures: z.array(z.string()),
});

export const narrationRequestSchema = z.object({
  source: sourceSchema,
  actorId: z.string().min(1).nullable(),
  factEntryIds: z.array(z.string().min(1)).min(1),
  viewpoint: z.string().min(1),
});

export type ModelEndpoint = z.infer<typeof modelEndpointSchema>;
export type ModelConfig = z.infer<typeof modelConfigSchema>;
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;
export type ModelTestResult = z.infer<typeof modelTestResultSchema>;
export type NarrationRequest = z.infer<typeof narrationRequestSchema>;
