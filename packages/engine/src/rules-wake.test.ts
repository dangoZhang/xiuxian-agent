import { describe, expect, it } from 'vitest';
import { compileRuleSet } from './rules.js';
import { materializeRuleEffects } from './rule-effects.js';
import { queueEvent, testRules, testWorld } from './test-fixtures.js';
import { selectAwakeCultivators } from './wake.js';
import { createInitialGameState, reduceChronicle } from './state.js';
import { projectCultivatorView } from './visibility.js';

describe('heaven rules and agent waking', () => {
  it('compiles only registered modifiers and conditional effects', () => {
    const compiled = compileRuleSet(testRules);
    expect(compiled.applyModifiers('damage', 10, ['剑'])).toBeCloseTo(11);
    expect(compiled.applyModifiers('damage', 10, ['丹'])).toBe(10);
    expect(compiled.effectsFor('on_oath', { grave: true })).toHaveLength(1);
    expect(compiled.effectsFor('on_oath', { grave: false })).toHaveLength(0);
    expect(compiled.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('materializes compiled effects with strict target semantics', () => {
    const compiled = compileRuleSet(testRules);
    const effects = compiled.effectsFor('on_oath', { grave: true });
    const result = materializeRuleEffects(effects, {
      actorId: 'a',
      targetId: 'b',
      participantIds: ['b', 'a'],
      allCultivatorIds: ['c', 'b', 'a'],
      day: 7,
      locationId: 'mountain',
      nextInsertionSequence: 12,
      causeIds: ['oath-entry'],
    });
    expect(result).toEqual({
      domainEvents: [{ type: 'relation.change', cultivatorId: 'a', targetId: 'b', amount: 5 }],
      nextInsertionSequence: 12,
    });
  });

  it('expands world and participant targets and schedules deterministic queue events', () => {
    const result = materializeRuleEffects([
      { type: 'resource.change', target: 'world', resource: 'qi', amount: 3 },
      { type: 'status.add', target: 'participants', status: '天雷印', duration: 2 },
      { type: 'event.schedule', eventKind: 'fate', delayDays: 5, priority: -2 },
    ], {
      actorId: 'a',
      targetId: 'b',
      participantIds: ['b', 'a', 'b'],
      allCultivatorIds: ['c', 'b', 'a'],
      day: 7,
      locationId: 'mountain',
      nextInsertionSequence: 12,
      causeIds: ['cause'],
    });
    expect(result.domainEvents.slice(0, 3)).toEqual([
      { type: 'resource.change', cultivatorId: 'a', resource: 'qi', amount: 3 },
      { type: 'resource.change', cultivatorId: 'b', resource: 'qi', amount: 3 },
      { type: 'resource.change', cultivatorId: 'c', resource: 'qi', amount: 3 },
    ]);
    expect(result.domainEvents).toContainEqual({ type: 'status.add', cultivatorId: 'a', status: '天雷印' });
    expect(result.domainEvents).toContainEqual({ type: 'status.add', cultivatorId: 'b', status: '天雷印' });
    expect(result.domainEvents).toContainEqual({
      type: 'queue.schedule',
      event: expect.objectContaining({ id: 'rule-event-12', day: 9, type: 'resolve', insertionSequence: 12 }),
    });
    expect(result.domainEvents).toContainEqual({
      type: 'queue.schedule',
      event: expect.objectContaining({ id: 'rule-event-13', day: 12, type: 'fate', priority: -2, insertionSequence: 13 }),
    });
    expect(result.nextInsertionSequence).toBe(14);
  });

  it('rejects a missing target context', () => {
    const context = {
      actorId: 'a', participantIds: ['a'], allCultivatorIds: ['a', 'b'], day: 1,
      locationId: 'mountain', nextInsertionSequence: 0, causeIds: [],
    } as const;
    expect(() => materializeRuleEffects([
      { type: 'status.remove', target: 'target', status: '伤' },
    ], context)).toThrow('requires targetId');
  });

  it('wakes only named, perceiving, due, conflicting, or fighting cultivators', () => {
    const world = testWorld();
    world.cultivators.c!.plan = { goal: '阻止a', dueDay: 20, targetIds: ['a'] };
    const awake = selectAwakeCultivators(world, queueEvent({ participantIds: ['a'], perceptionRadius: 1 }));
    expect(awake.map(({ cultivator }) => cultivator.id)).toEqual(['a', 'b', 'c']);
    expect(awake.find(({ cultivator }) => cultivator.id === 'a')?.reasons).toContain('participant');
    expect(awake.find(({ cultivator }) => cultivator.id === 'b')?.reasons).toContain('perception');
    expect(awake.find(({ cultivator }) => cultivator.id === 'c')?.reasons).toContain('goal_conflict');
  });

  it('filters hidden goals, private events, and memory depth from agent context', () => {
    const world = testWorld();
    world.cultivators.a!.memoryDepth = 1;
    let state = createInitialGameState({ id: 'game', engineVersion: '0.1.0', randomSeed: 'seed', rules: testRules, world });
    state.privateMemories.push(
      { id: 'old', cultivatorId: 'a', day: 0, text: '旧事', causeIds: [] },
      { id: 'new', cultivatorId: 'a', day: 1, text: '新事', causeIds: [] },
      { id: 'secret-b', cultivatorId: 'b', day: 1, text: '乙的秘密', causeIds: [] },
    );
    state = reduceChronicle(state, [{
      id: 'visible', day: 1, phase: 'fate', sequence: 1, source: 'fate', kind: 'event', actorIds: [], causeIds: [], visibility: ['a'], text: '可见', structuredPayload: {}, cost: { sense: 0, qi: 0 },
    }, {
      id: 'hidden', day: 1, phase: 'agent', sequence: 2, source: 'cultivator', kind: 'action', actorIds: ['b'], causeIds: [], visibility: ['b'], text: '不可见', structuredPayload: {}, cost: { sense: 1, qi: 0 },
    }]);
    const view = projectCultivatorView(state, 'a');
    expect(view.chronicle.map(({ id }) => id)).toEqual(['visible']);
    expect(view.memories.map(({ id }) => id)).toEqual(['new']);
    expect(view.cultivators.b).not.toHaveProperty('hiddenGoals');
    expect(view.self.hiddenGoals).toEqual(['证道']);
  });
});
