import type { QueueEvent, RuleEffect } from '@xiuxian/protocol';
import type { DomainEvent } from './state.js';

const QUEUE_EVENT_TYPES = new Set<QueueEvent['type']>([
  'rule',
  'fate',
  'decision',
  'agent_plan',
  'combat',
  'resolve',
]);

export interface RuleEffectContext {
  actorId: string;
  targetId?: string;
  participantIds: readonly string[];
  /** Required because the DSL target `world` means every cultivator, not merely participants. */
  allCultivatorIds: readonly string[];
  day: number;
  locationId: string | null;
  nextInsertionSequence: number;
  causeIds: readonly string[];
}

export interface MaterializedRuleEffects {
  domainEvents: DomainEvent[];
  nextInsertionSequence: number;
}

const uniqueSorted = (ids: readonly string[]): string[] => [...new Set(ids)].sort((a, b) => a.localeCompare(b));

function assertContext(context: RuleEffectContext): Set<string> {
  if (!Number.isInteger(context.day) || context.day < 0) throw new RangeError('Rule effect day must be a non-negative integer');
  if (!Number.isInteger(context.nextInsertionSequence) || context.nextInsertionSequence < 0) {
    throw new RangeError('Rule effect insertion sequence must be a non-negative integer');
  }
  const allIds = new Set(context.allCultivatorIds);
  if (allIds.size === 0) throw new Error('Rule effect context requires all cultivator IDs');
  if (!allIds.has(context.actorId)) throw new Error(`Unknown rule actor ${context.actorId}`);
  if (context.targetId !== undefined && !allIds.has(context.targetId)) throw new Error(`Unknown rule target ${context.targetId}`);
  for (const participantId of context.participantIds) {
    if (!allIds.has(participantId)) throw new Error(`Unknown rule participant ${participantId}`);
  }
  return allIds;
}

function resolveTargets(
  target: Extract<RuleEffect, { type: 'resource.change' | 'status.add' | 'status.remove' | 'relation.change' }>['target'],
  context: RuleEffectContext,
  allIds: ReadonlySet<string>,
): string[] {
  switch (target) {
    case 'actor':
    case 'self':
      return [context.actorId];
    case 'target':
      if (context.targetId === undefined) throw new Error('Rule effect target requires targetId');
      return [context.targetId];
    case 'participants':
      return uniqueSorted(context.participantIds);
    case 'world':
      return [...allIds].sort((a, b) => a.localeCompare(b));
  }
}

function scheduledEvent(
  sequence: number,
  day: number,
  type: QueueEvent['type'],
  priority: number,
  context: RuleEffectContext,
  payload: QueueEvent['payload'],
): QueueEvent {
  return {
    id: `rule-event-${sequence}`,
    day,
    priority,
    insertionSequence: sequence,
    type,
    participantIds: uniqueSorted(context.participantIds),
    locationId: context.locationId,
    perceptionRadius: 0,
    causeIds: [...context.causeIds],
    payload,
  };
}

/**
 * Converts validated Heaven DSL effects into reducer-owned facts.
 * The function is pure: callers commit its returned events only after the surrounding transaction succeeds.
 */
export function materializeRuleEffects(
  effects: readonly RuleEffect[],
  context: RuleEffectContext,
): MaterializedRuleEffects {
  const allIds = assertContext(context);
  const domainEvents: DomainEvent[] = [];
  let insertionSequence = context.nextInsertionSequence;

  for (const effect of effects) {
    switch (effect.type) {
      case 'resource.change': {
        for (const cultivatorId of resolveTargets(effect.target, context, allIds)) {
          domainEvents.push({
            type: 'resource.change',
            cultivatorId,
            resource: effect.resource,
            amount: effect.amount,
          });
        }
        break;
      }
      case 'status.add': {
        const targetIds = resolveTargets(effect.target, context, allIds);
        for (const cultivatorId of targetIds) {
          domainEvents.push({ type: 'status.add', cultivatorId, status: effect.status });
        }
        if (effect.duration !== undefined) {
          const expirationEvents: DomainEvent[] = targetIds.map((cultivatorId) => ({
            type: 'status.remove', cultivatorId, status: effect.status,
          }));
          const event = scheduledEvent(
            insertionSequence,
            context.day + effect.duration,
            'resolve',
            0,
            { ...context, participantIds: targetIds },
            { domainEvents: expirationEvents, ruleGenerated: true },
          );
          domainEvents.push({ type: 'queue.schedule', event });
          insertionSequence += 1;
        }
        break;
      }
      case 'status.remove':
        for (const cultivatorId of resolveTargets(effect.target, context, allIds)) {
          domainEvents.push({ type: 'status.remove', cultivatorId, status: effect.status });
        }
        break;
      case 'relation.change':
        for (const targetId of resolveTargets(effect.target, context, allIds)) {
          domainEvents.push({
            type: 'relation.change',
            cultivatorId: context.actorId,
            targetId,
            amount: effect.amount,
          });
        }
        break;
      case 'event.schedule': {
        if (!QUEUE_EVENT_TYPES.has(effect.eventKind as QueueEvent['type'])) {
          throw new Error(`Unsupported scheduled event type ${effect.eventKind}`);
        }
        const type = effect.eventKind as QueueEvent['type'];
        const event = scheduledEvent(
          insertionSequence,
          context.day + effect.delayDays,
          type,
          effect.priority,
          context,
          { ruleGenerated: true },
        );
        domainEvents.push({ type: 'queue.schedule', event });
        insertionSequence += 1;
        break;
      }
    }
  }

  return { domainEvents, nextInsertionSequence: insertionSequence };
}
