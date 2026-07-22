import { z } from 'zod';

export const toolNameSchema = z.enum([
  'observe', 'remember', 'move', 'speak', 'cultivate', 'useTechnique', 'guard', 'scheme',
]);

export const toolCallSchema = z.discriminatedUnion('name', [
  z.object({ id: z.string().min(1), name: z.literal('observe'), arguments: z.object({ target: z.string().min(1) }) }),
  z.object({ id: z.string().min(1), name: z.literal('remember'), arguments: z.object({ query: z.string().min(1) }) }),
  z.object({ id: z.string().min(1), name: z.literal('move'), arguments: z.object({ destination: z.string().min(1) }) }),
  z.object({ id: z.string().min(1), name: z.literal('speak'), arguments: z.object({ target: z.string().min(1), words: z.string().min(1).max(4000) }) }),
  z.object({ id: z.string().min(1), name: z.literal('cultivate'), arguments: z.object({ method: z.string().min(1) }) }),
  z.object({ id: z.string().min(1), name: z.literal('useTechnique'), arguments: z.object({ name: z.string().min(1), target: z.string().min(1) }) }),
  z.object({ id: z.string().min(1), name: z.literal('guard'), arguments: z.object({ target: z.string().min(1) }) }),
  z.object({ id: z.string().min(1), name: z.literal('scheme'), arguments: z.object({ goal: z.string().min(1).max(4000) }) }),
]);

export const playerIntentSchema = z.object({
  rawText: z.string().min(1).max(8000),
  goal: z.string().min(1),
  targetIds: z.array(z.string().min(1)),
  calls: z.array(toolCallSchema).min(1),
});

export const cultivatorTurnSchema = z.object({
  actionReason: z.string().min(1).max(500),
  calls: z.array(toolCallSchema).min(1),
  visibleSpeech: z.string().max(4000).nullable(),
});

export const fateEventProposalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  trigger: z.object({
    type: z.enum(['immediate', 'day', 'causal']),
    day: z.number().int().nonnegative().optional(),
    causeIds: z.array(z.string().min(1)),
  }),
  participantIds: z.array(z.string().min(1)).min(1),
  locationId: z.string().min(1),
  perceptionRadius: z.number().int().nonnegative(),
  risk: z.number().min(0).max(1),
  deadlineDay: z.number().int().nonnegative().nullable(),
  stakes: z.string().min(1),
  candidateConsequences: z.array(z.string().min(1)).min(2),
});

export type ToolName = z.infer<typeof toolNameSchema>;
export type ToolCall = z.infer<typeof toolCallSchema>;
export type PlayerIntent = z.infer<typeof playerIntentSchema>;
export type CultivatorTurn = z.infer<typeof cultivatorTurnSchema>;
export type FateEventProposal = z.infer<typeof fateEventProposalSchema>;
