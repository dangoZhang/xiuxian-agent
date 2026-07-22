import { describe, expect, it } from 'vitest';
import type { BattleIntent } from './combat.js';
import { resolveBattle } from './combat.js';
import { testRules, testWorld } from './test-fixtures.js';

describe('order-independent combat', () => {
  it('produces the same state hash for every intent input order', () => {
    const world = testWorld();
    const intents: BattleIntent[] = [
      { actorId: 'a', actionIndex: 0, call: { id: 'a1', name: 'useTechnique', arguments: { name: '青锋诀', target: 'b' } } },
      { actorId: 'b', actionIndex: 0, call: { id: 'b1', name: 'guard', arguments: { target: 'b' } } },
      { actorId: 'b', actionIndex: 1, call: { id: 'b2', name: 'useTechnique', arguments: { name: '青锋诀', target: 'a' } } },
    ];
    const base = { battleSeed: 'fixed-seed', round: 2, participantIds: ['a', 'b'], world, rules: testRules };
    const forward = resolveBattle({ ...base, intents });
    const reverse = resolveBattle({ ...base, intents: [...intents].reverse(), participantIds: ['b', 'a'] });
    expect(reverse.stateHash).toBe(forward.stateHash);
    expect(reverse.cultivators).toEqual(forward.cultivators);
    expect(reverse.facts).toEqual(forward.facts);
    expect(forward.cultivators.a?.stats.qi).toBe(45);
    expect(forward.cultivators.b?.stats.hp).toBeLessThan(100);
  });

  it('refuses to resolve before every living participant submits', () => {
    const world = testWorld();
    expect(() => resolveBattle({
      battleSeed: 'seed', round: 1, participantIds: ['a', 'b'], world,
      intents: [{ actorId: 'a', actionIndex: 0, call: { id: 'a1', name: 'guard', arguments: { target: 'a' } } }],
    })).toThrow('COMBAT_INTENT_MISSING');
  });
});
