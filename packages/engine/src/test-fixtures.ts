import type { Cultivator, HeavenRuleSet, QueueEvent, WorldState } from '@xiuxian/protocol';

export const testRules: HeavenRuleSet = {
  schemaVersion: 1,
  ruleVersion: 1,
  effectiveFromSequence: 0,
  constants: { damageMultiplier: 1 },
  modifiers: [{ id: 'sword-law', target: 'damage', operation: 'multiply', value: 1.1, whenTags: ['剑'] }],
  triggers: [{ id: 'oath', trigger: 'on_oath', conditions: { grave: true }, effects: [{ type: 'relation.change', target: 'target', amount: 5 }] }],
  descriptions: ['剑出有痕，誓出有因。'],
};

export function cultivator(id: string, locationId = 'mountain'): Cultivator {
  return {
    id,
    name: id,
    isPlayer: id === 'player',
    locationId,
    sectId: null,
    publicDescription: `${id}立于风中`,
    personality: ['沉着'],
    hiddenGoals: ['证道'],
    perceptionRange: 1,
    memoryDepth: 8,
    stats: {
      hp: 100,
      hpMax: 100,
      qi: 50,
      qiMax: 50,
      senseMax: 5,
      focusSlots: 2,
      speed: id === 'a' ? 15 : 10,
      lifespan: 100,
      realm: '炼气',
      statuses: [],
    },
    techniques: [{
      id: 'sword',
      name: '青锋诀',
      route: '剑',
      power: 12,
      qiCost: 5,
      tags: ['剑'],
      counters: ['破绽'],
      target: 'single',
      effects: [{ id: 'cut', type: 'damage', value: 5, chance: 1 }],
    }],
    relations: [],
    memoryEntryIds: ['memory-1'],
    plan: null,
  };
}

export function testWorld(): WorldState {
  const player = cultivator('a');
  player.isPlayer = true;
  return {
    id: 'world',
    name: '玄微界',
    premise: '灵潮将至',
    day: 1,
    locations: {
      mountain: { id: 'mountain', name: '问道山', region: '北境', adjacentIds: ['town'], tags: ['山'] },
      town: { id: 'town', name: '青石城', region: '北境', adjacentIds: ['mountain', 'cave'], tags: ['城'] },
      cave: { id: 'cave', name: '无明洞', region: '北境', adjacentIds: ['town'], tags: ['洞'] },
    },
    sects: {
      sword: { id: 'sword', name: '青锋门', locationId: 'mountain', route: '剑' },
      pill: { id: 'pill', name: '丹霞谷', locationId: 'cave', route: '丹' },
    },
    cultivators: {
      a: player,
      b: cultivator('b'),
      c: cultivator('c', 'cave'),
    },
  };
}

export function queueEvent(overrides: Partial<QueueEvent> = {}): QueueEvent {
  return {
    id: 'event',
    day: 1,
    priority: 0,
    insertionSequence: 0,
    type: 'fate',
    participantIds: [],
    locationId: 'mountain',
    perceptionRadius: 1,
    causeIds: [],
    payload: {},
    ...overrides,
  };
}
