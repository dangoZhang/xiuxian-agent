import { createHash } from 'node:crypto';
import { heavenRuleSetSchema, type HeavenRuleSet, type RuleEffect } from '@xiuxian/protocol';
import { canonicalJson } from './state.js';

export interface CompiledRuleSet {
  ruleVersion: number;
  effectiveFromSequence: number;
  contentHash: string;
  constants: Readonly<Record<string, number>>;
  applyModifiers(target: HeavenRuleSet['modifiers'][number]['target'], base: number, tags?: readonly string[]): number;
  effectsFor(trigger: HeavenRuleSet['triggers'][number]['trigger'], facts?: Readonly<Record<string, string | number | boolean>>): RuleEffect[];
}

const matches = (conditions: Record<string, string | number | boolean>, facts: Readonly<Record<string, string | number | boolean>>): boolean =>
  Object.entries(conditions).every(([key, value]) => facts[key] === value);

export function compileRuleSet(input: unknown): CompiledRuleSet {
  const rules = heavenRuleSetSchema.parse(input);
  const hashable = { ...rules, contentHash: undefined };
  const contentHash = createHash('sha256').update(canonicalJson(hashable)).digest('hex');
  if (rules.contentHash && rules.contentHash !== contentHash) throw new Error('Heaven rule content hash mismatch');

  return Object.freeze({
    ruleVersion: rules.ruleVersion,
    effectiveFromSequence: rules.effectiveFromSequence,
    contentHash,
    constants: Object.freeze({ ...rules.constants }),
    applyModifiers(target: HeavenRuleSet['modifiers'][number]['target'], base: number, tags: readonly string[] = []): number {
      return rules.modifiers
        .filter((modifier) => modifier.target === target && modifier.whenTags.every((tag) => tags.includes(tag)))
        .reduce((value, modifier) => {
          switch (modifier.operation) {
            case 'add': return value + modifier.value;
            case 'multiply': return value * modifier.value;
            case 'min': return Math.min(value, modifier.value);
            case 'max': return Math.max(value, modifier.value);
          }
        }, base);
    },
    effectsFor(trigger: HeavenRuleSet['triggers'][number]['trigger'], facts: Readonly<Record<string, string | number | boolean>> = {}): RuleEffect[] {
      return rules.triggers
        .filter((candidate) => candidate.trigger === trigger && matches(candidate.conditions, facts))
        .flatMap((candidate) => candidate.effects);
    },
  });
}
