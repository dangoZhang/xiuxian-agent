import { z } from 'zod';

export const ruleConstantKeySchema = z.enum([
  'auraMultiplier',
  'baseLifespan',
  'breakthroughQi',
  'damageMultiplier',
  'healingMultiplier',
  'tribulationPower',
]);
export const ruleTargetSchema = z.enum(['self', 'actor', 'target', 'participants', 'world']);
export const ruleModifierOperationSchema = z.enum(['add', 'multiply', 'min', 'max']);
export const ruleTriggerSchema = z.enum([
  'on_breakthrough',
  'on_injury',
  'on_oath',
  'on_kill',
  'on_time',
  'on_location',
  'epoch_change',
]);
export const ruleEffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('resource.change'),
    target: ruleTargetSchema,
    resource: z.enum(['hp', 'qi', 'senseMax', 'lifespan']),
    amount: z.number().finite(),
  }),
  z.object({
    type: z.literal('status.add'),
    target: ruleTargetSchema,
    status: z.string().min(1),
    duration: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('status.remove'),
    target: ruleTargetSchema,
    status: z.string().min(1),
  }),
  z.object({
    type: z.literal('event.schedule'),
    eventKind: z.enum(['rule', 'fate', 'decision', 'agent_plan', 'combat']),
    delayDays: z.number().int().nonnegative(),
    priority: z.number().int(),
  }),
  z.object({
    type: z.literal('relation.change'),
    target: ruleTargetSchema,
    amount: z.number().int().min(-100).max(100),
  }),
]);

export const heavenRuleSetSchema = z.object({
  schemaVersion: z.literal(1),
  ruleVersion: z.number().int().positive(),
  effectiveFromSequence: z.number().int().nonnegative(),
  constants: z.partialRecord(ruleConstantKeySchema, z.number().finite()).default({}),
  modifiers: z.array(z.object({
    id: z.string().min(1),
    target: z.enum(['damage', 'healing', 'qiCost', 'lifespan', 'breakthrough']),
    operation: ruleModifierOperationSchema,
    value: z.number().finite(),
    whenTags: z.array(z.string().min(1)).default([]),
  })),
  triggers: z.array(z.object({
    id: z.string().min(1),
    trigger: ruleTriggerSchema,
    conditions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    effects: z.array(ruleEffectSchema).min(1),
  })),
  descriptions: z.array(z.string().min(1)).min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export const heavenRulePatchSchema = z.object({
  schemaVersion: z.literal(1),
  baseRuleVersion: z.number().int().positive(),
  nextRuleSet: heavenRuleSetSchema,
  reason: z.string().min(1),
}).superRefine((patch, ctx) => {
  if (patch.nextRuleSet.ruleVersion !== patch.baseRuleVersion + 1) {
    ctx.addIssue({ code: 'custom', path: ['nextRuleSet', 'ruleVersion'], message: 'Rule version must increment by one' });
  }
});

export type RuleConstantKey = z.infer<typeof ruleConstantKeySchema>;
export type RuleEffect = z.infer<typeof ruleEffectSchema>;
export type HeavenRuleSet = z.infer<typeof heavenRuleSetSchema>;
export type HeavenRulePatch = z.infer<typeof heavenRulePatchSchema>;
