import { describe, expect, it } from 'vitest';
import type { ChronicleEntry } from '@xiuxian/protocol';
import { createInitialGameState, exportSave, importSave, reduceChronicle, stableStateHash } from './state.js';
import { queueEvent, testRules, testWorld } from './test-fixtures.js';

function entry(overrides: Partial<ChronicleEntry> = {}): ChronicleEntry {
  return {
    id: 'entry-1',
    day: 1,
    phase: 'resolve',
    sequence: 1,
    source: 'cultivator',
    kind: 'action',
    actorIds: ['a'],
    causeIds: [],
    visibility: ['a', 'b'],
    text: '甲运气疗伤。',
    structuredPayload: { domainEvents: [{ type: 'resource.change', cultivatorId: 'a', resource: 'hp', amount: -12 }] },
    cost: { sense: 1, qi: 0 },
    ...overrides,
  };
}

describe('event-sourced state and saves', () => {
  it('reduces settled facts and validates causal references', () => {
    const initial = createInitialGameState({ id: 'game', engineVersion: '0.1.0', randomSeed: 'seed', rules: testRules, world: testWorld() });
    const next = reduceChronicle(initial, [entry()]);
    expect(initial.world.cultivators.a?.stats.hp).toBe(100);
    expect(next.world.cultivators.a?.stats.hp).toBe(88);
    expect(next.revision).toBe(1);
    expect(() => reduceChronicle(next, [entry({ id: 'entry-2', sequence: 2, causeIds: ['missing'] })])).toThrow('Unknown cause');
  });

  it('applies realm changes without disturbing status or ending reduction', () => {
    const initial = createInitialGameState({ id: 'game', engineVersion: '0.1.0', randomSeed: 'seed', rules: testRules, world: testWorld() });
    const next = reduceChronicle(initial, [entry({
      structuredPayload: { domainEvents: [
        { type: 'realm.change', cultivatorId: 'a', realm: '筑基' },
        { type: 'status.add', cultivatorId: 'a', status: '道基初成' },
        { type: 'ending', ending: '证道' },
      ] },
    })]);
    expect(next.world.cultivators.a?.stats.realm).toBe('筑基');
    expect(next.world.cultivators.a?.stats.statuses).toContain('道基初成');
    expect(next).toMatchObject({ status: 'ended', ending: '证道' });
  });

  it('exports and imports an identical authoritative state', () => {
    const state = createInitialGameState({
      id: 'game', engineVersion: '0.1.0', randomSeed: 'seed', rules: testRules, world: testWorld(),
      queue: [queueEvent({ id: 'later', day: 10, insertionSequence: 2 })],
    });
    const save = exportSave(state, '2026-07-23T00:00:00.000Z');
    const restored = importSave(save, '0.1.0');
    expect(stableStateHash(restored)).toBe(stableStateHash(state));
    expect(restored.queue).toEqual(state.queue);
    expect(() => importSave({ ...save, stateHash: '0'.repeat(64) })).toThrow('hash mismatch');
  });
});
