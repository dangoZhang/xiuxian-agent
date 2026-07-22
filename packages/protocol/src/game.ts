import { z } from 'zod';
import { chronicleKindSchema, endingSchema, gameStatusSchema, phaseSchema, sourceSchema } from './enums.js';
import { heavenRuleSetSchema } from './rules.js';
import { worldStateSchema } from './world.js';

export const createGameRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export const chronicleEntrySchema = z.object({
  id: z.string().min(1),
  day: z.number().int().nonnegative(),
  phase: phaseSchema,
  sequence: z.number().int().nonnegative(),
  source: sourceSchema,
  kind: chronicleKindSchema,
  actorIds: z.array(z.string().min(1)),
  causeIds: z.array(z.string().min(1)),
  visibility: z.array(z.string().min(1)),
  text: z.string(),
  structuredPayload: z.json(),
  cost: z.object({ sense: z.number().int().nonnegative(), qi: z.number().int().nonnegative() }),
});

export const queueEventSchema = z.object({
  id: z.string().min(1),
  day: z.number().int().nonnegative(),
  priority: z.number().int(),
  insertionSequence: z.number().int().nonnegative(),
  type: z.enum(['rule', 'fate', 'decision', 'agent_plan', 'combat', 'resolve', 'narrate']),
  participantIds: z.array(z.string().min(1)),
  locationId: z.string().min(1).nullable(),
  perceptionRadius: z.number().int().nonnegative(),
  causeIds: z.array(z.string().min(1)),
  payload: z.json(),
});

export const privateMemorySchema = z.object({
  id: z.string().min(1),
  cultivatorId: z.string().min(1),
  day: z.number().int().nonnegative(),
  text: z.string().min(1),
  causeIds: z.array(z.string().min(1)),
});

export const gameStateSchema = z.object({
  schemaVersion: z.literal(1),
  engineVersion: z.string().min(1),
  id: z.string().min(1),
  revision: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
  randomSeed: z.string().min(1),
  status: gameStatusSchema,
  ending: endingSchema.nullable(),
  pauseReason: z.string().nullable(),
  rules: heavenRuleSetSchema,
  world: worldStateSchema,
  chronicle: z.array(chronicleEntrySchema),
  privateMemories: z.array(privateMemorySchema),
  queue: z.array(queueEventSchema),
  nextInsertionSequence: z.number().int().nonnegative(),
});

export const saveFileSchema = z.object({
  format: z.literal('xiuxian-agent-save'),
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime(),
  stateHash: z.string().regex(/^[a-f0-9]{64}$/),
  game: gameStateSchema,
});

export type ChronicleEntry = z.infer<typeof chronicleEntrySchema>;
export type CreateGameRequest = z.infer<typeof createGameRequestSchema>;
export type QueueEvent = z.infer<typeof queueEventSchema>;
export type PrivateMemory = z.infer<typeof privateMemorySchema>;
export type GameState = z.infer<typeof gameStateSchema>;
export type SaveFile = z.infer<typeof saveFileSchema>;
