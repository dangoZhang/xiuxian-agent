import { describe, expect, it } from 'vitest';
import { rulesForBattleFacts, rulesForDomainEvents, triggerRuleEffects } from '../src/rule-runtime.js';
import { gameState } from './fixtures.js';

describe('heaven rule runtime', () => {
  it('materializes time and breakthrough triggers into reducer-owned facts', () => {
    const state = gameState();
    state.rules.triggers = [
      {
        id: 'waning-aura',
        trigger: 'on_time',
        conditions: {},
        effects: [{ type: 'resource.change', target: 'world', resource: 'qi', amount: -2 }],
      },
      {
        id: 'foundation-mark',
        trigger: 'on_breakthrough',
        conditions: { toRealm: '筑基' },
        effects: [{ type: 'status.add', target: 'self', status: '道基初成', duration: 3 }],
      },
    ];

    const time = triggerRuleEffects(state, 'on_time', { day: 2, daysElapsed: 1 }, {
      actorId: 'player', participantIds: ['player', 'enemy'], day: 2,
    });
    expect(time.domainEvents).toEqual([
      { type: 'resource.change', cultivatorId: 'enemy', resource: 'qi', amount: -2 },
      { type: 'resource.change', cultivatorId: 'player', resource: 'qi', amount: -2 },
    ]);

    const breakthrough = rulesForDomainEvents(state, 'player', [
      { type: 'realm.change', cultivatorId: 'player', realm: '筑基' },
    ], { causeIds: ['entry-1'] });
    expect(breakthrough.domainEvents).toEqual(expect.arrayContaining([
      { type: 'status.add', cultivatorId: 'player', status: '道基初成' },
      expect.objectContaining({ type: 'queue.schedule' }),
    ]));
  });

  it('uses settled battle facts for injury and kill triggers', () => {
    const state = gameState({ enemyStats: { hp: 8 } });
    state.rules.triggers = [
      {
        id: 'blood-debt', trigger: 'on_injury', conditions: {},
        effects: [{ type: 'status.add', target: 'target', status: '流血' }],
      },
      {
        id: 'killer-cost', trigger: 'on_kill', conditions: {},
        effects: [{ type: 'resource.change', target: 'actor', resource: 'qi', amount: -5 }],
      },
    ];
    const output = rulesForBattleFacts(state, [{
      id: 'attack:player:0:cut:enemy', phase: 'attack', actorId: 'player', targetId: 'enemy',
      success: true, amount: 12, text: '剑伤',
    }], { player: 100, enemy: 0 }, { participantIds: ['player', 'enemy'] });
    expect(output.domainEvents).toEqual([
      { type: 'status.add', cultivatorId: 'enemy', status: '流血' },
      { type: 'resource.change', cultivatorId: 'player', resource: 'qi', amount: -5 },
    ]);
  });
});
