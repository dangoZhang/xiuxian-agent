import { z } from 'zod';
import { realmSchema } from './enums.js';

export const relationSchema = z.object({
  targetId: z.string().min(1),
  affinity: z.number().int().min(-100).max(100),
  karmaDebt: z.number().int(),
  labels: z.array(z.string().min(1)),
});

export const techniqueSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  route: z.enum(['剑', '丹', '阵', '魔']),
  power: z.number().nonnegative(),
  qiCost: z.number().int().nonnegative(),
  tags: z.array(z.string().min(1)),
  counters: z.array(z.string().min(1)),
  target: z.enum(['self', 'single', 'area']),
  effects: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(['damage', 'heal', 'status', 'move']),
    value: z.number().finite(),
    status: z.string().min(1).optional(),
    chance: z.number().min(0).max(1).default(1),
  })),
});

export const combatStatsSchema = z.object({
  hp: z.number().nonnegative(),
  hpMax: z.number().positive(),
  qi: z.number().nonnegative(),
  qiMax: z.number().positive(),
  senseMax: z.number().int().positive(),
  focusSlots: z.number().int().positive(),
  speed: z.number().finite(),
  lifespan: z.number().int().nonnegative(),
  realm: realmSchema,
  statuses: z.array(z.string().min(1)),
});

export const planSchema = z.object({
  goal: z.string().min(1),
  dueDay: z.number().int().nonnegative(),
  targetIds: z.array(z.string().min(1)),
}).nullable();

export const cultivatorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isPlayer: z.boolean(),
  locationId: z.string().min(1),
  sectId: z.string().min(1).nullable(),
  publicDescription: z.string().min(1),
  personality: z.array(z.string().min(1)),
  hiddenGoals: z.array(z.string().min(1)),
  perceptionRange: z.number().int().nonnegative(),
  memoryDepth: z.number().int().nonnegative(),
  stats: combatStatsSchema,
  techniques: z.array(techniqueSchema),
  relations: z.array(relationSchema),
  memoryEntryIds: z.array(z.string().min(1)),
  plan: planSchema,
});

export const locationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  region: z.string().min(1),
  adjacentIds: z.array(z.string().min(1)),
  tags: z.array(z.string().min(1)),
});

export const sectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  locationId: z.string().min(1),
  route: z.enum(['剑', '丹', '阵', '魔']),
});

export const worldGenesisSchema = z.object({
  name: z.string().min(1),
  premise: z.string().min(1),
  locations: z.array(locationSchema).min(3),
  sects: z.array(sectSchema).min(2),
  characterSlots: z.array(z.object({
    id: z.string().min(1),
    role: z.string().min(1),
    locationId: z.string().min(1),
  })).length(7),
});

export const cultivatorProfileSchema = cultivatorSchema.omit({
  memoryEntryIds: true,
  plan: true,
}).extend({
  memoryEntryIds: z.array(z.string().min(1)).default([]),
  plan: planSchema.default(null),
});

export const worldStateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  premise: z.string().min(1),
  day: z.number().int().nonnegative(),
  locations: z.record(z.string(), locationSchema),
  sects: z.record(z.string(), sectSchema),
  cultivators: z.record(z.string(), cultivatorSchema),
});

export type Relation = z.infer<typeof relationSchema>;
export type Technique = z.infer<typeof techniqueSchema>;
export type CombatStats = z.infer<typeof combatStatsSchema>;
export type Cultivator = z.infer<typeof cultivatorSchema>;
export type Location = z.infer<typeof locationSchema>;
export type Sect = z.infer<typeof sectSchema>;
export type WorldGenesis = z.infer<typeof worldGenesisSchema>;
export type CultivatorProfile = z.infer<typeof cultivatorProfileSchema>;
export type WorldState = z.infer<typeof worldStateSchema>;
