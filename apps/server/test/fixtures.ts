import { createInitialGameState } from '@xiuxian/engine';
import type { Cultivator, GameState, HeavenRuleSet, QueueEvent, WorldState } from '@xiuxian/protocol';

export const rules: HeavenRuleSet = {
  schemaVersion: 1,
  ruleVersion: 1,
  effectiveFromSequence: 0,
  constants: { breakthroughQi: 100, baseLifespan: 80 },
  modifiers: [],
  triggers: [],
  descriptions: ['灵气有度，寿元有终。'],
};

export function cultivator(id: string, player: boolean, overrides: Partial<Cultivator['stats']> = {}): Cultivator {
  return {
    id,
    name: player ? '沈玄' : '赤羽',
    isPlayer: player,
    locationId: 'mountain',
    sectId: null,
    publicDescription: player ? '山中散修' : '负剑客',
    personality: ['谨慎'],
    hiddenGoals: ['结丹'],
    perceptionRange: 1,
    memoryDepth: 4,
    stats: {
      hp: 100, hpMax: 100, qi: 100, qiMax: 100, senseMax: 5, focusSlots: 2,
      speed: player ? 12 : 10, lifespan: 80, realm: '炼气', statuses: [], ...overrides,
    },
    techniques: [{
      id: `${id}-sword`, name: '引气剑诀', route: '剑', power: 10, qiCost: 5, tags: ['剑'], counters: [], target: 'single',
      effects: [{ id: 'cut', type: 'damage', value: 10, chance: 1 }],
    }],
    relations: [], memoryEntryIds: [], plan: null,
  };
}

export function gameState(options: {
  playerStats?: Partial<Cultivator['stats']>;
  enemyStats?: Partial<Cultivator['stats']>;
  queue?: QueueEvent[];
} = {}): GameState {
  const world: WorldState = {
    id: 'world', name: '太虚界', premise: '道途争先', day: 1,
    locations: {
      mountain: { id: 'mountain', name: '玄山', region: '东境', adjacentIds: ['valley'], tags: ['山'] },
      valley: { id: 'valley', name: '云谷', region: '东境', adjacentIds: ['mountain'], tags: ['谷'] },
    },
    sects: {},
    cultivators: {
      player: cultivator('player', true, options.playerStats),
      enemy: cultivator('enemy', false, options.enemyStats),
    },
  };
  return createInitialGameState({
    id: 'game', engineVersion: '0.1.0', randomSeed: 'seed', rules, world,
    ...(options.queue === undefined ? {} : { queue: options.queue }),
  });
}
