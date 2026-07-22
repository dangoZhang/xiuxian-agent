import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolCall } from '@xiuxian/protocol';
import { continuingCombatEvent, deriveProgressionEvents, elapsedTimeEvents, GameService, globalMortalityEvents, nonCombatTechniqueEvents, projectResolvedMemories } from '../src/game-service.js';
import { GameEventBus } from '../src/events.js';
import { ModelGateway } from '../src/model/gateway.js';
import { GameRepository } from '../src/repository.js';
import { SessionStore } from '../src/session-store.js';
import { AppError } from '../src/errors.js';
import { gameState } from './fixtures.js';

const cultivate: ToolCall = { id: 'cultivate', name: 'cultivate', arguments: { method: '引气剑诀' } };

describe('game completion rules', () => {
  afterEach(() => vi.restoreAllMocks());
  it('progresses to Golden Core and then produces a model-independent settled ending fact', () => {
    const foundation = gameState({ playerStats: { realm: '筑基', qi: 100 } });
    expect(deriveProgressionEvents(foundation, foundation.world.cultivators.player!, [cultivate], []))
      .toContainEqual({ type: 'realm.change', cultivatorId: 'player', realm: '金丹' });

    const goldenCore = gameState({ playerStats: { realm: '金丹', qi: 100 } });
    expect(deriveProgressionEvents(goldenCore, goldenCore.world.cultivators.player!, [cultivate], []))
      .toContainEqual({ type: 'ending', ending: '证道' });
  });

  it('settles demonic ending and lifespan death as domain events', () => {
    const demonic = gameState({ playerStats: { realm: '金丹', qi: 100, statuses: ['入魔'] } });
    expect(deriveProgressionEvents(demonic, demonic.world.cultivators.player!, [cultivate], []))
      .toContainEqual({ type: 'ending', ending: '入魔' });

    const dying = gameState({ playerStats: { lifespan: 1 } });
    expect(elapsedTimeEvents(dying, 3)).toContainEqual({ type: 'ending', ending: '陨落' });
  });

  it('schedules another battle round only while two living participants share a location', () => {
    const state = gameState();
    const previous = {
      id: 'battle', day: 1, priority: 0, insertionSequence: 0, type: 'combat' as const,
      participantIds: ['player', 'enemy'], locationId: 'mountain', perceptionRadius: 1,
      causeIds: [], payload: { combat: true, round: 1 },
    };
    const next = continuingCombatEvent(state, previous, 'fact');
    expect(next).toMatchObject({ type: 'combat', participantIds: ['player', 'enemy'], causeIds: ['fact'] });
    expect(next?.payload).toMatchObject({ round: 2 });

    state.world.cultivators.enemy!.stats.hp = 0;
    expect(continuingCombatEvent(state, previous, 'fact')).toBeNull();
  });

  it('does not pull a player who withdrew into a later NPC-only combat round', () => {
    const state = gameState();
    state.world.cultivators.player!.locationId = 'valley';
    state.world.cultivators.third = { ...structuredClone(state.world.cultivators.enemy!), id: 'third', name: '青松' };
    const previous = {
      id: 'battle', day: 1, priority: 0, insertionSequence: 0, type: 'combat' as const,
      participantIds: ['player', 'enemy', 'third'], locationId: 'mountain', perceptionRadius: 1,
      causeIds: [], payload: { combat: true, round: 2 },
    };
    expect(continuingCombatEvent(state, previous, 'fact')).toBeNull();
  });

  it('settles non-combat techniques and projects observable calls into private memory', () => {
    const state = gameState();
    const technique: ToolCall = { id: 'strike', name: 'useTechnique', arguments: { name: '引气剑诀', target: 'enemy' } };
    expect(nonCombatTechniqueEvents(state, state.world.cultivators.player!, [technique], []))
      .toContainEqual({ type: 'resource.change', cultivatorId: 'enemy', resource: 'hp', amount: -20 });
    const entry = {
      id: 'observe-entry', day: 1, phase: 'player' as const, sequence: 1, source: 'player' as const, kind: 'action' as const,
      actorIds: ['player'], causeIds: [], visibility: ['public'], text: '我观察赤羽。',
      structuredPayload: { calls: [{ id: 'o', name: 'observe', arguments: { target: 'enemy' } }], domainEvents: [] }, cost: { sense: 2, qi: 0 },
    };
    const projected = projectResolvedMemories(state, [entry]);
    expect(projected.privateMemories[0]).toMatchObject({ cultivatorId: 'player', text: '观察：enemy', causeIds: ['observe-entry'] });
  });

  it('turns lethal NPC non-combat technique effects into player death', () => {
    const state = gameState();
    state.world.cultivators.enemy!.techniques[0]!.power = 100;
    const call: ToolCall = { id: 'lethal', name: 'useTechnique', arguments: { name: '引气剑诀', target: 'player' } };
    const effects = nonCombatTechniqueEvents(state, state.world.cultivators.enemy!, [call], []);
    expect(globalMortalityEvents(state, effects)).toEqual([{ type: 'ending', ending: '陨落' }]);
  });

  it('continues the on-demand loop after a command until the next player decision', async () => {
    const state = gameState({
      queue: [{
        id: 'decision', day: 1, priority: 0, insertionSequence: 0, type: 'decision', participantIds: ['player'],
        locationId: 'mountain', perceptionRadius: 0, causeIds: [], payload: { proposal: {
          id: 'opening', title: '开山修行', trigger: { type: 'immediate', causeIds: [] }, participantIds: ['player'],
          locationId: 'mountain', perceptionRadius: 0, risk: 0.2, deadlineDay: 3,
          stakes: '三日内筑基', candidateConsequences: ['结缘', '错失机缘'],
        } },
      }],
    });
    state.status = 'awaiting_player';
    state.world.cultivators.enemy!.locationId = 'valley';
    const repository = new GameRepository(':memory:');
    const sessions = new SessionStore(60_000);
    const session = sessions.create({
      default: { baseUrl: 'https://example.com/v1', apiKey: 'memory-only', model: 'model' }, maxConcurrency: 2, roles: {},
    });
    repository.create(state, session.id);
    vi.spyOn(ModelGateway.prototype, 'structured').mockImplementation(async (_role, _envelope, _schema, context) => {
      if (context.requestType === 'PlayerIntent') return {
        rawText: '修炼', goal: '引气筑基', targetIds: [], calls: [cultivate],
      } as never;
      if (context.requestType === 'FateEventProposal') return {
        id: 'fate-2', title: '云谷传音', trigger: { type: 'immediate', causeIds: [] }, participantIds: ['player'],
        locationId: 'mountain', perceptionRadius: 0, risk: 0.2, deadlineDay: null,
        stakes: '是否回应', candidateConsequences: ['结缘', '拒绝'],
      } as never;
      if (context.requestType === 'FateDeadlineResolution') return {
        selectedConsequence: '结缘', rationale: '主角如期筑基', effects: [],
      } as never;
      throw new Error(`Unexpected request ${context.requestType}`);
    });
    vi.spyOn(ModelGateway.prototype, 'narrative').mockResolvedValue('灵气入体，远处又有传音而来。');
    const service = new GameService(repository, sessions, new GameEventBus(), 2_000, 2);

    const result = await service.command(state.id, '修炼', 0);
    expect(result.status).toBe('awaiting_player');
    expect(result.revision).toBe(2);
    expect(result.world.day).toBe(3);
    expect(result.world.cultivators.player?.stats.realm).toBe('筑基');
    expect(result.queue.some(({ type }) => type === 'decision')).toBe(true);
    expect(result.chronicle.some(({ source }) => source === 'fate')).toBe(true);
    expect(result.chronicle.some(({ structuredPayload }) => structuredPayload && typeof structuredPayload === 'object' && 'proposalId' in structuredPayload)).toBe(true);
    repository.close();
  });

  it('returns a paused latest state when fate fails after commit and can retry from that revision', async () => {
    const state = gameState({
      playerStats: { qi: 0 },
      queue: [{
        id: 'decision', day: 1, priority: 0, insertionSequence: 0, type: 'decision', participantIds: ['player'],
        locationId: 'mountain', perceptionRadius: 0, causeIds: [], payload: {},
      }],
    });
    state.status = 'awaiting_player';
    state.world.cultivators.enemy!.locationId = 'valley';
    const repository = new GameRepository(':memory:');
    const sessions = new SessionStore(60_000);
    const session = sessions.create({
      default: { baseUrl: 'https://example.com/v1', apiKey: 'memory-only', model: 'model' }, maxConcurrency: 2, roles: {},
    });
    repository.create(state, session.id);
    let failFate = true;
    vi.spyOn(ModelGateway.prototype, 'structured').mockImplementation(async (_role, _envelope, _schema, context) => {
      if (context.requestType === 'PlayerIntent') return {
        rawText: '修炼', goal: '恢复灵力', targetIds: [], calls: [cultivate],
      } as never;
      if (context.requestType === 'FateEventProposal') {
        if (failFate) throw new AppError('MODEL_TIMEOUT', '命运推演超时', 504);
        return {
          id: 'retry-fate', title: '山门客至', trigger: { type: 'immediate', causeIds: [] }, participantIds: ['player'],
          locationId: 'mountain', perceptionRadius: 0, risk: 0.1, deadlineDay: null,
          stakes: '是否相见', candidateConsequences: ['相见', '避而不见'],
        } as never;
      }
      throw new Error(`Unexpected request ${context.requestType}`);
    });
    vi.spyOn(ModelGateway.prototype, 'narrative').mockResolvedValue('山中灵气缓缓归来。');
    const service = new GameService(repository, sessions, new GameEventBus(), 2_000, 2);

    const paused = await service.command(state.id, '修炼', 0);
    expect(paused).toMatchObject({ status: 'paused', revision: 1, pauseReason: '命运推演超时' });
    expect(repository.get(state.id)).toMatchObject({ status: 'running', revision: 1 });

    failFate = false;
    const retried = await service.advance(state.id, paused.revision);
    expect(retried).toMatchObject({ status: 'awaiting_player', revision: 2 });
    expect(retried.chronicle.filter(({ source }) => source === 'player')).toHaveLength(1);
    repository.close();
  });
});
