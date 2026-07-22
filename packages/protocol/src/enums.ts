import { z } from 'zod';

export const sourceSchema = z.enum(['heaven', 'fate', 'player', 'cultivator']);
export const phaseSchema = z.enum(['rule', 'fate', 'player', 'agent', 'resolve', 'narrate']);
export const chronicleKindSchema = z.enum([
  'rule',
  'event',
  'dialogue',
  'action',
  'combat',
  'breakthrough',
]);
export const realmSchema = z.enum(['炼气', '筑基', '金丹']);
export const gameStatusSchema = z.enum(['awaiting_player', 'running', 'paused', 'ended']);
export const endingSchema = z.enum(['证道', '陨落', '入魔']);
export const errorCodeSchema = z.enum([
  'MODEL_CONFIG_MISSING',
  'MODEL_UNREACHABLE',
  'MODEL_CAPABILITY_MISSING',
  'MODEL_OUTPUT_INVALID',
  'MODEL_TIMEOUT',
  'MODEL_RATE_LIMITED',
  'TOOL_UNKNOWN',
  'TOOL_INVALID_ARGUMENTS',
  'TOOL_OUT_OF_SENSE',
  'TOOL_NOT_VISIBLE',
  'TOOL_OUT_OF_RANGE',
  'TOOL_INSUFFICIENT_QI',
  'RULE_DSL_UNSUPPORTED',
  'STALE_REVISION',
  'SAVE_SCHEMA_INVALID',
  'SAVE_VERSION_UNSUPPORTED',
  'MICROSTEP_LIMIT',
  'COMBAT_INTENT_MISSING',
  'INTERNAL_ERROR',
]);

export type Source = z.infer<typeof sourceSchema>;
export type Phase = z.infer<typeof phaseSchema>;
export type ChronicleKind = z.infer<typeof chronicleKindSchema>;
export type Realm = z.infer<typeof realmSchema>;
export type GameStatus = z.infer<typeof gameStatusSchema>;
export type Ending = z.infer<typeof endingSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
