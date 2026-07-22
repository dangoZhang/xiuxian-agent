import {
  toolCallSchema,
  type ErrorCode,
  type ToolCall,
  type ToolName,
  type WorldState,
} from '@xiuxian/protocol';
import { SenseLedger } from './sense.js';
import type { DomainEvent } from './state.js';

export const TOOL_DEFINITIONS: Readonly<Record<ToolName, { cost: number; mode: 'read' | 'action' }>> = Object.freeze({
  observe: { cost: 1, mode: 'read' },
  remember: { cost: 1, mode: 'read' },
  move: { cost: 1, mode: 'action' },
  speak: { cost: 1, mode: 'action' },
  cultivate: { cost: 2, mode: 'action' },
  useTechnique: { cost: 2, mode: 'action' },
  guard: { cost: 1, mode: 'action' },
  scheme: { cost: 2, mode: 'action' },
});

export type ToolValidationResult =
  | { ok: true; call: ToolCall; cost: number; mode: 'read' | 'action'; domainEvents: DomainEvent[] }
  | { ok: false; code: ErrorCode; reason: string };

export interface ToolValidationContext {
  actorId: string;
  world: WorldState;
  ledger: SenseLedger;
  transactionId?: string;
  day?: number;
}

const fail = (code: ErrorCode, reason: string): ToolValidationResult => ({ ok: false, code, reason });

function targetAtSameLocation(world: WorldState, actorId: string, targetId: string): boolean {
  const actor = world.cultivators[actorId];
  const target = world.cultivators[targetId];
  return Boolean(actor && target && actor.locationId === target.locationId);
}

function canPerceive(world: WorldState, actorId: string, targetId: string): boolean {
  const actor = world.cultivators[actorId];
  if (!actor) return false;
  const targetLocation = world.cultivators[targetId]?.locationId ?? (world.locations[targetId] ? targetId : undefined);
  if (!targetLocation) return false;
  const visited = new Set([actor.locationId]);
  let frontier = [actor.locationId];
  if (targetLocation === actor.locationId) return true;
  for (let distance = 1; distance <= actor.perceptionRange; distance += 1) {
    const next: string[] = [];
    for (const locationId of frontier) {
      for (const adjacent of world.locations[locationId]?.adjacentIds ?? []) {
        if (adjacent === targetLocation) return true;
        if (!visited.has(adjacent)) { visited.add(adjacent); next.push(adjacent); }
      }
    }
    frontier = next;
  }
  return false;
}

export function validateToolCall(input: unknown, context: ToolValidationContext): ToolValidationResult {
  const parsed = toolCallSchema.safeParse(input);
  if (!parsed.success) return fail('TOOL_INVALID_ARGUMENTS', parsed.error.issues[0]?.message ?? 'Invalid tool call');
  const call = parsed.data;
  const actor = context.world.cultivators[context.actorId];
  if (!actor) return fail('TOOL_NOT_VISIBLE', `Unknown actor ${context.actorId}`);
  const definition = TOOL_DEFINITIONS[call.name];
  const domainEvents: DomainEvent[] = [];

  switch (call.name) {
    case 'observe': {
      if (!canPerceive(context.world, actor.id, call.arguments.target)) return fail('TOOL_NOT_VISIBLE', `${call.arguments.target} is outside perception`);
      break;
    }
    case 'remember':
      if (actor.memoryDepth === 0) return fail('TOOL_NOT_VISIBLE', 'No accessible memories');
      break;
    case 'move':
      if (!context.world.locations[actor.locationId]?.adjacentIds.includes(call.arguments.destination)) {
        return fail('TOOL_OUT_OF_RANGE', `${call.arguments.destination} is not adjacent`);
      }
      domainEvents.push({ type: 'move', cultivatorId: actor.id, locationId: call.arguments.destination });
      break;
    case 'speak':
      if (!targetAtSameLocation(context.world, actor.id, call.arguments.target) && !actor.stats.statuses.includes('传音')) {
        return fail('TOOL_OUT_OF_RANGE', 'Target is not present and no transmission is available');
      }
      break;
    case 'cultivate':
      if (!actor.techniques.some(({ name }) => name === call.arguments.method)) return fail('TOOL_INVALID_ARGUMENTS', 'Unknown cultivation method');
      domainEvents.push({ type: 'resource.change', cultivatorId: actor.id, resource: 'qi', amount: Math.ceil(actor.stats.qiMax * 0.1) });
      break;
    case 'useTechnique': {
      const technique = actor.techniques.find(({ name }) => name === call.arguments.name);
      if (!technique) return fail('TOOL_INVALID_ARGUMENTS', 'Unknown technique');
      if (actor.stats.qi < technique.qiCost) return fail('TOOL_INSUFFICIENT_QI', 'Insufficient qi');
      if (technique.target !== 'self' && !targetAtSameLocation(context.world, actor.id, call.arguments.target)) return fail('TOOL_OUT_OF_RANGE', 'Target is not in technique range');
      domainEvents.push({ type: 'resource.change', cultivatorId: actor.id, resource: 'qi', amount: -technique.qiCost });
      break;
    }
    case 'guard':
      if (call.arguments.target !== actor.id && !targetAtSameLocation(context.world, actor.id, call.arguments.target)) return fail('TOOL_OUT_OF_RANGE', 'Guard target is not present');
      break;
    case 'scheme':
      domainEvents.push({ type: 'plan.set', cultivatorId: actor.id, goal: call.arguments.goal, dueDay: (context.day ?? context.world.day) + 1, targetIds: [] });
      break;
  }

  // All semantic checks precede charging: rejected calls never spend tool sense.
  if (!context.ledger.spend(actor.id, definition.cost, context.transactionId)) return fail('TOOL_OUT_OF_SENSE', `Need ${definition.cost} sense`);
  return { ok: true, call, cost: definition.cost, mode: definition.mode, domainEvents };
}

export class ActionDraftTransaction {
  readonly #drafts: ToolValidationResult[] = [];
  #closed = false;

  constructor(readonly id: string, readonly context: Omit<ToolValidationContext, 'transactionId'>) {
    context.ledger.begin(id);
  }

  submit(call: unknown): ToolValidationResult {
    if (this.#closed) throw new Error('Transaction is closed');
    const result = validateToolCall(call, { ...this.context, transactionId: this.id });
    this.#drafts.push(result);
    return result;
  }

  commit(): ToolValidationResult[] {
    if (this.#closed) throw new Error('Transaction is closed');
    if (this.#drafts.some((draft) => !draft.ok)) throw new Error('Cannot commit a transaction containing invalid calls');
    this.context.ledger.commit(this.id);
    this.#closed = true;
    return structuredClone(this.#drafts);
  }

  rollback(): void {
    if (this.#closed) throw new Error('Transaction is closed');
    this.context.ledger.rollback(this.id);
    this.#closed = true;
  }
}
