import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  gameStateSchema,
  queueEventSchema,
  saveFileSchema,
  type ChronicleEntry,
  type Cultivator,
  type GameState,
  type HeavenRuleSet,
  type QueueEvent,
  type SaveFile,
  type WorldState,
} from '@xiuxian/protocol';

export const domainEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('resource.change'), cultivatorId: z.string().min(1), resource: z.enum(['hp', 'qi', 'senseMax', 'lifespan']), amount: z.number().finite() }),
  z.object({ type: z.literal('realm.change'), cultivatorId: z.string().min(1), realm: z.enum(['炼气', '筑基', '金丹']) }),
  z.object({ type: z.literal('status.add'), cultivatorId: z.string().min(1), status: z.string().min(1) }),
  z.object({ type: z.literal('status.remove'), cultivatorId: z.string().min(1), status: z.string().min(1) }),
  z.object({ type: z.literal('move'), cultivatorId: z.string().min(1), locationId: z.string().min(1) }),
  z.object({ type: z.literal('relation.change'), cultivatorId: z.string().min(1), targetId: z.string().min(1), amount: z.number().finite() }),
  z.object({ type: z.literal('plan.set'), cultivatorId: z.string().min(1), goal: z.string().min(1), dueDay: z.number().int().nonnegative(), targetIds: z.array(z.string().min(1)) }),
  z.object({ type: z.literal('ending'), ending: z.enum(['证道', '陨落', '入魔']) }),
  z.object({ type: z.literal('queue.schedule'), event: queueEventSchema }),
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;

export interface ResolvedPayload { domainEvents: DomainEvent[] }

export function canonicalJson(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, candidate: unknown) => {
    if (candidate && typeof candidate === 'object') {
      if (seen.has(candidate)) throw new TypeError('Cannot hash cyclic state');
      seen.add(candidate);
      if (!Array.isArray(candidate)) {
        return Object.fromEntries(Object.entries(candidate).sort(([a], [b]) => a.localeCompare(b)));
      }
    }
    return candidate;
  });
}

export function stableStateHash(state: GameState): string {
  return createHash('sha256').update(canonicalJson(gameStateSchema.parse(state))).digest('hex');
}

export function validateGameStateInvariants(state: GameState): void {
  const playerIds = Object.values(state.world.cultivators).filter(({ isPlayer }) => isPlayer).map(({ id }) => id);
  if (playerIds.length !== 1) throw new Error(`Game must contain exactly one player cultivator; found ${playerIds.length}`);
  for (const cultivator of Object.values(state.world.cultivators)) {
    if (!state.world.locations[cultivator.locationId]) throw new Error(`Cultivator ${cultivator.id} has unknown location ${cultivator.locationId}`);
    if (cultivator.sectId !== null && !state.world.sects[cultivator.sectId]) throw new Error(`Cultivator ${cultivator.id} has unknown sect ${cultivator.sectId}`);
    if (cultivator.stats.hp > cultivator.stats.hpMax || cultivator.stats.qi > cultivator.stats.qiMax) throw new Error(`Cultivator ${cultivator.id} exceeds resource maximum`);
    for (const relation of cultivator.relations) if (!state.world.cultivators[relation.targetId]) throw new Error(`Cultivator ${cultivator.id} has relation to unknown ${relation.targetId}`);
  }
  for (const sect of Object.values(state.world.sects)) if (!state.world.locations[sect.locationId]) throw new Error(`Sect ${sect.id} has unknown location ${sect.locationId}`);

  const entryIds = new Set<string>();
  let previousSequence = -1;
  for (const entry of state.chronicle) {
    if (entryIds.has(entry.id)) throw new Error(`Duplicate chronicle entry ${entry.id}`);
    if (entry.sequence <= previousSequence) throw new Error(`Non-monotonic chronicle sequence ${entry.sequence}`);
    for (const causeId of entry.causeIds) if (!entryIds.has(causeId)) throw new Error(`Chronicle cause ${causeId} does not precede ${entry.id}`);
    entryIds.add(entry.id);
    previousSequence = entry.sequence;
  }
  if (state.chronicle.length > 0 && state.sequence !== previousSequence) throw new Error('State sequence does not match chronicle tail');
  for (const memory of state.privateMemories) {
    if (!state.world.cultivators[memory.cultivatorId]) throw new Error(`Memory ${memory.id} has unknown owner ${memory.cultivatorId}`);
    for (const causeId of memory.causeIds) if (!entryIds.has(causeId)) throw new Error(`Memory ${memory.id} has unknown cause ${causeId}`);
  }
  const insertionSequences = new Set<number>();
  for (const event of state.queue) {
    if (insertionSequences.has(event.insertionSequence)) throw new Error(`Duplicate queue insertion sequence ${event.insertionSequence}`);
    insertionSequences.add(event.insertionSequence);
    if (event.locationId !== null && !state.world.locations[event.locationId]) throw new Error(`Queue event ${event.id} has unknown location ${event.locationId}`);
    for (const actorId of event.participantIds) if (!state.world.cultivators[actorId]) throw new Error(`Queue event ${event.id} has unknown participant ${actorId}`);
    for (const causeId of event.causeIds) if (!entryIds.has(causeId)) throw new Error(`Queue event ${event.id} has unknown cause ${causeId}`);
    if (event.insertionSequence >= state.nextInsertionSequence) throw new Error('nextInsertionSequence does not exceed queued events');
  }
  if ((state.status === 'ended') !== (state.ending !== null)) throw new Error('Ending and game status disagree');
}

export interface InitialGameStateInput {
  id: string;
  engineVersion: string;
  randomSeed: string;
  rules: HeavenRuleSet;
  world: WorldState;
  queue?: QueueEvent[];
}

export function createInitialGameState(input: InitialGameStateInput): GameState {
  const queue = [...(input.queue ?? [])].sort((a, b) => a.day - b.day || a.priority - b.priority || a.insertionSequence - b.insertionSequence);
  const state = gameStateSchema.parse({
    schemaVersion: 1,
    engineVersion: input.engineVersion,
    id: input.id,
    revision: 0,
    sequence: 0,
    randomSeed: input.randomSeed,
    status: 'running',
    ending: null,
    pauseReason: null,
    rules: input.rules,
    world: input.world,
    chronicle: [],
    privateMemories: [],
    queue,
    nextInsertionSequence: queue.reduce((max, event) => Math.max(max, event.insertionSequence + 1), 0),
  });
  validateGameStateInvariants(state);
  return state;
}

function updateCultivator(world: WorldState, id: string, apply: (cultivator: Cultivator) => void): void {
  const cultivator = world.cultivators[id];
  if (!cultivator) throw new Error(`Unknown cultivator ${id}`);
  apply(cultivator);
}

function payloadEvents(payload: unknown): DomainEvent[] {
  if (!payload || typeof payload !== 'object' || !('domainEvents' in payload) || !Array.isArray(payload.domainEvents)) return [];
  return z.array(domainEventSchema).parse(payload.domainEvents);
}

function applyDomainEvent(state: GameState, event: DomainEvent): void {
  switch (event.type) {
    case 'resource.change':
      updateCultivator(state.world, event.cultivatorId, (cultivator) => {
        const stats = cultivator.stats;
        if (event.resource === 'hp') stats.hp = Math.max(0, Math.min(stats.hpMax, stats.hp + event.amount));
        else if (event.resource === 'qi') stats.qi = Math.max(0, Math.min(stats.qiMax, stats.qi + event.amount));
        else if (event.resource === 'senseMax') stats.senseMax = Math.max(1, Math.floor(stats.senseMax + event.amount));
        else stats.lifespan = Math.max(0, Math.floor(stats.lifespan + event.amount));
      });
      return;
    case 'realm.change':
      updateCultivator(state.world, event.cultivatorId, (cultivator) => {
        cultivator.stats.realm = event.realm;
      });
      return;
    case 'status.add':
      updateCultivator(state.world, event.cultivatorId, (cultivator) => {
        if (!cultivator.stats.statuses.includes(event.status)) cultivator.stats.statuses.push(event.status);
      });
      return;
    case 'status.remove':
      updateCultivator(state.world, event.cultivatorId, (cultivator) => {
        cultivator.stats.statuses = cultivator.stats.statuses.filter((status) => status !== event.status);
      });
      return;
    case 'move':
      if (!state.world.locations[event.locationId]) throw new Error(`Unknown location ${event.locationId}`);
      updateCultivator(state.world, event.cultivatorId, (cultivator) => { cultivator.locationId = event.locationId; });
      return;
    case 'relation.change':
      updateCultivator(state.world, event.cultivatorId, (cultivator) => {
        const relation = cultivator.relations.find(({ targetId }) => targetId === event.targetId);
        if (!relation) cultivator.relations.push({ targetId: event.targetId, affinity: Math.max(-100, Math.min(100, event.amount)), karmaDebt: 0, labels: [] });
        else relation.affinity = Math.max(-100, Math.min(100, relation.affinity + event.amount));
      });
      return;
    case 'plan.set':
      updateCultivator(state.world, event.cultivatorId, (cultivator) => {
        cultivator.plan = { goal: event.goal, dueDay: event.dueDay, targetIds: [...event.targetIds] };
      });
      return;
    case 'ending':
      state.ending = event.ending;
      state.status = 'ended';
      return;
    case 'queue.schedule':
      state.queue.push(event.event);
      state.nextInsertionSequence = Math.max(state.nextInsertionSequence, event.event.insertionSequence + 1);
      return;
  }
}

/** Applies only settled chronicle facts. Draft/model output has no reducer path. */
export function reduceChronicle(previous: GameState, entries: readonly ChronicleEntry[]): GameState {
  const state = structuredClone(previous);
  const knownIds = new Set(state.chronicle.map(({ id }) => id));
  for (const entry of entries) {
    if (knownIds.has(entry.id)) throw new Error(`Duplicate chronicle entry ${entry.id}`);
    if (entry.sequence <= state.sequence && state.chronicle.length > 0) throw new Error(`Non-monotonic sequence ${entry.sequence}`);
    for (const causeId of entry.causeIds) if (!knownIds.has(causeId)) throw new Error(`Unknown cause ${causeId}`);
    for (const event of payloadEvents(entry.structuredPayload)) applyDomainEvent(state, event);
    state.chronicle.push(structuredClone(entry));
    knownIds.add(entry.id);
    state.sequence = entry.sequence;
    state.world.day = Math.max(state.world.day, entry.day);
  }
  state.queue.sort((a, b) => a.day - b.day || a.priority - b.priority || a.insertionSequence - b.insertionSequence);
  state.revision += entries.length > 0 ? 1 : 0;
  const parsed = gameStateSchema.parse(state);
  validateGameStateInvariants(parsed);
  return parsed;
}

export function exportSave(state: GameState, exportedAt = new Date().toISOString()): SaveFile {
  const game = gameStateSchema.parse(structuredClone(state));
  return saveFileSchema.parse({
    format: 'xiuxian-agent-save',
    schemaVersion: 1,
    exportedAt,
    stateHash: stableStateHash(game),
    game,
  });
}

export function importSave(input: unknown, expectedEngineVersion?: string): GameState {
  const save = saveFileSchema.parse(input);
  if (expectedEngineVersion !== undefined && save.game.engineVersion !== expectedEngineVersion) {
    throw new Error(`Unsupported engine version ${save.game.engineVersion}; expected ${expectedEngineVersion}`);
  }
  const actual = stableStateHash(save.game);
  if (actual !== save.stateHash) throw new Error('Save state hash mismatch');
  validateGameStateInvariants(save.game);
  return structuredClone(save.game);
}
