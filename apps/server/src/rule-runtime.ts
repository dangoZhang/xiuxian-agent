import type { GameState, HeavenRuleSet } from '@xiuxian/protocol';
import {
  compileRuleSet,
  materializeRuleEffects,
  type BattleFact,
  type DomainEvent,
  type MaterializedRuleEffects,
} from '@xiuxian/engine';

type RuleTrigger = HeavenRuleSet['triggers'][number]['trigger'];

export interface RuleTriggerContext {
  readonly actorId: string;
  readonly targetId?: string;
  readonly participantIds?: readonly string[];
  readonly day?: number;
  readonly locationId?: string | null;
  readonly causeIds?: readonly string[];
  readonly nextInsertionSequence?: number;
}

export function rulesForBattleFacts(
  state: GameState,
  facts: readonly BattleFact[],
  resultingHp: Readonly<Record<string, number>>,
  context: Omit<RuleTriggerContext, 'actorId' | 'targetId'> = {},
): MaterializedRuleEffects {
  const domainEvents: DomainEvent[] = [];
  let nextInsertionSequence = context.nextInsertionSequence ?? state.nextInsertionSequence;
  const participantIds = context.participantIds ?? [];

  const append = (trigger: RuleTrigger, fact: BattleFact) => {
    const output = triggerRuleEffects(state, trigger, {
      day: context.day ?? state.world.day,
      actorId: fact.actorId,
      targetId: fact.targetId,
      amount: fact.amount,
    }, {
      actorId: fact.actorId,
      targetId: fact.targetId,
      participantIds,
      ...(context.day === undefined ? {} : { day: context.day }),
      ...(context.locationId === undefined ? {} : { locationId: context.locationId }),
      ...(context.causeIds === undefined ? {} : { causeIds: context.causeIds }),
      nextInsertionSequence,
    });
    domainEvents.push(...output.domainEvents);
    nextInsertionSequence = output.nextInsertionSequence;
  };

  const damaging = facts.filter((fact) => fact.success && fact.amount > 0 && fact.id.startsWith('attack:'));
  for (const fact of damaging) append('on_injury', fact);

  const defeated = new Set(Object.entries(resultingHp).filter(([, hp]) => hp <= 0).map(([id]) => id));
  for (const targetId of defeated) {
    const credited = damaging
      .filter((fact) => fact.targetId === targetId)
      .sort((left, right) => right.amount - left.amount || left.actorId.localeCompare(right.actorId))[0];
    if (credited && (state.world.cultivators[targetId]?.stats.hp ?? 0) > 0) append('on_kill', credited);
  }

  for (const fact of facts.filter((candidate) => candidate.success && candidate.id.startsWith('move:'))) {
    const output = triggerRuleEffects(state, 'on_location', {
      day: context.day ?? state.world.day,
      actorId: fact.actorId,
      locationId: fact.targetId,
    }, {
      actorId: fact.actorId,
      participantIds,
      ...(context.day === undefined ? {} : { day: context.day }),
      locationId: fact.targetId,
      ...(context.causeIds === undefined ? {} : { causeIds: context.causeIds }),
      nextInsertionSequence,
    });
    domainEvents.push(...output.domainEvents);
    nextInsertionSequence = output.nextInsertionSequence;
  }

  return { domainEvents, nextInsertionSequence };
}

export function triggerRuleEffects(
  state: GameState,
  trigger: RuleTrigger,
  facts: Readonly<Record<string, string | number | boolean>>,
  context: RuleTriggerContext,
): MaterializedRuleEffects {
  const effects = compileRuleSet(state.rules).effectsFor(trigger, facts);
  if (effects.length === 0) {
    return {
      domainEvents: [],
      nextInsertionSequence: context.nextInsertionSequence ?? state.nextInsertionSequence,
    };
  }
  return materializeRuleEffects(effects, {
    actorId: context.actorId,
    ...(context.targetId === undefined ? {} : { targetId: context.targetId }),
    participantIds: context.participantIds ?? [context.actorId],
    allCultivatorIds: Object.keys(state.world.cultivators),
    day: context.day ?? state.world.day,
    locationId: context.locationId ?? state.world.cultivators[context.actorId]?.locationId ?? null,
    nextInsertionSequence: context.nextInsertionSequence ?? state.nextInsertionSequence,
    causeIds: context.causeIds ?? [],
  });
}

export function rulesForDomainEvents(
  state: GameState,
  causalActorId: string,
  events: readonly DomainEvent[],
  context: Omit<RuleTriggerContext, 'actorId' | 'targetId'> = {},
): MaterializedRuleEffects {
  const domainEvents: DomainEvent[] = [];
  const participantIds = context.participantIds ?? [causalActorId];
  let nextInsertionSequence = context.nextInsertionSequence ?? state.nextInsertionSequence;
  const hpDelta = new Map<string, number>();

  const append = (
    trigger: RuleTrigger,
    facts: Readonly<Record<string, string | number | boolean>>,
    actorId: string,
    targetId?: string,
    locationId?: string | null,
  ) => {
    const materialized = triggerRuleEffects(state, trigger, facts, {
      actorId,
      ...(targetId === undefined ? {} : { targetId }),
      participantIds,
      ...(context.day === undefined ? {} : { day: context.day }),
      ...(locationId === undefined && context.locationId === undefined
        ? {}
        : { locationId: locationId ?? context.locationId ?? null }),
      ...(context.causeIds === undefined ? {} : { causeIds: context.causeIds }),
      nextInsertionSequence,
    });
    domainEvents.push(...materialized.domainEvents);
    nextInsertionSequence = materialized.nextInsertionSequence;
  };

  for (const event of events) {
    if (event.type === 'resource.change' && event.resource === 'hp' && event.amount < 0) {
      hpDelta.set(event.cultivatorId, (hpDelta.get(event.cultivatorId) ?? 0) + event.amount);
      append('on_injury', {
        day: context.day ?? state.world.day,
        actorId: causalActorId,
        targetId: event.cultivatorId,
        amount: event.amount,
      }, causalActorId, event.cultivatorId);
    } else if (event.type === 'realm.change') {
      append('on_breakthrough', {
        day: context.day ?? state.world.day,
        actorId: event.cultivatorId,
        fromRealm: state.world.cultivators[event.cultivatorId]?.stats.realm ?? '未知',
        toRealm: event.realm,
      }, event.cultivatorId, undefined);
    } else if (event.type === 'move') {
      append('on_location', {
        day: context.day ?? state.world.day,
        actorId: event.cultivatorId,
        locationId: event.locationId,
      }, event.cultivatorId, undefined, event.locationId);
    } else if (event.type === 'status.add' && event.status.includes('誓')) {
      append('on_oath', {
        day: context.day ?? state.world.day,
        actorId: event.cultivatorId,
        status: event.status,
      }, event.cultivatorId);
    }
  }

  for (const [targetId, delta] of hpDelta) {
    const target = state.world.cultivators[targetId];
    if (target && target.stats.hp > 0 && target.stats.hp + delta <= 0) {
      append('on_kill', {
        day: context.day ?? state.world.day,
        actorId: causalActorId,
        targetId,
      }, causalActorId, targetId);
    }
  }

  return { domainEvents, nextInsertionSequence };
}
