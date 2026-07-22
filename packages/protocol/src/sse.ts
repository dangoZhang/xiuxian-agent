import { z } from 'zod';
import { errorCodeSchema, sourceSchema } from './enums.js';
import { chronicleEntrySchema } from './game.js';

const envelope = {
  callId: z.string().min(1),
  source: sourceSchema,
  actorId: z.string().min(1).nullable(),
  sequence: z.number().int().nonnegative(),
};

export const sseEventSchema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('call.started'), requestType: z.string().min(1) }),
  z.object({ ...envelope, type: z.literal('text.delta'), delta: z.string() }),
  z.object({ ...envelope, type: z.literal('tool.called'), toolCallId: z.string().min(1), tool: z.string().min(1) }),
  z.object({ ...envelope, type: z.literal('call.completed'), usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }) }),
  z.object({ ...envelope, type: z.literal('entry.resolved'), entry: chronicleEntrySchema }),
  z.object({ ...envelope, type: z.literal('game.paused'), code: errorCodeSchema, reason: z.string().min(1) }),
]);

export type SseEvent = z.infer<typeof sseEventSchema>;
