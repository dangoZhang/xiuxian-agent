import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  cultivatorProfileSchema,
  fateEventProposalSchema,
  gameStateSchema,
  heavenRulePatchSchema,
  heavenRuleSetSchema,
  playerIntentSchema,
  toolCallSchema,
  worldGenesisSchema,
  type ChronicleEntry,
  type Cultivator,
  type FateEventProposal,
  type GameState,
  type HeavenRuleSet,
  type QueueEvent,
  type ToolCall,
  type ToolName,
  type WorldGenesis,
  type WorldState,
} from '@xiuxian/protocol';
import {
  ActionDraftTransaction,
  compileRuleSet,
  createInitialGameState,
  domainEventSchema,
  exportSave,
  hashRandom,
  importSave,
  reduceChronicle,
  resolveBattle,
  selectAwakeCultivators,
  SenseLedger,
  stableStateHash,
  WeightedSemaphore,
  type BattleIntent,
  type DomainEvent,
} from '@xiuxian/engine';
import {
  cultivatorProfilePrompt,
  cultivatorTurnPrompt,
  fateEventPrompt,
  fateResolutionPrompt,
  heavenRulePatchPrompt,
  heavenRuleSetPrompt,
  narrationPrompt,
  playerIntentPrompt,
  worldGenesisPrompt,
  type JsonRecord,
} from '@xiuxian/prompts';
import { AppError } from './errors.js';
import { GameEventBus } from './events.js';
import { ModelGateway } from './model/gateway.js';
import { GameRepository } from './repository.js';
import { rulesForBattleFacts, rulesForDomainEvents, triggerRuleEffects } from './rule-runtime.js';
import { SessionStore } from './session-store.js';

const ENGINE_VERSION = '0.1.0';
const ALL_TOOLS: readonly ToolName[] = ['observe', 'remember', 'move', 'speak', 'cultivate', 'useTechnique', 'guard', 'scheme'];
const COMBAT_TOOLS: readonly ToolName[] = ['move', 'useTechnique', 'guard'];

const DSL_REGISTRY = {
  constants: ['auraMultiplier', 'baseLifespan', 'breakthroughQi', 'damageMultiplier', 'healingMultiplier', 'tribulationPower'],
  modifierTargets: ['damage', 'healing', 'qiCost', 'lifespan', 'breakthrough'],
  modifierOperations: ['add', 'multiply', 'min', 'max'],
  triggers: ['on_breakthrough', 'on_injury', 'on_oath', 'on_kill', 'on_time', 'on_location', 'epoch_change'],
  effects: ['resource.change', 'status.add', 'status.remove', 'event.schedule', 'relation.change'],
  effectResources: ['hp', 'qi', 'senseMax', 'lifespan'],
  effectTargets: ['self', 'actor', 'target', 'participants', 'world'],
  scheduledEventTypes: ['rule', 'fate', 'decision', 'agent_plan', 'combat'],
  triggerFacts: {
    on_breakthrough: ['day', 'actorId', 'fromRealm', 'toRealm'],
    on_injury: ['day', 'actorId', 'targetId', 'amount'],
    on_oath: ['day', 'actorId', 'status'],
    on_kill: ['day', 'actorId', 'targetId'],
    on_time: ['day', 'daysElapsed'],
    on_location: ['day', 'actorId', 'locationId'],
    epoch_change: ['day', 'ruleVersion'],
  },
} as const;

const jsonValueSchema = z.json();
type JsonValue = z.infer<typeof jsonValueSchema>;
function json(value: unknown): JsonValue {
  return jsonValueSchema.parse(JSON.parse(JSON.stringify(value)));
}

const fateEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('resource.change'), cultivatorId: z.string().min(1), resource: z.enum(['hp', 'qi', 'lifespan']), amount: z.number().finite() }),
  z.object({ type: z.literal('status.add'), cultivatorId: z.string().min(1), status: z.string().min(1) }),
  z.object({ type: z.literal('status.remove'), cultivatorId: z.string().min(1), status: z.string().min(1) }),
  z.object({ type: z.literal('relation.change'), cultivatorId: z.string().min(1), targetId: z.string().min(1), amount: z.number().min(-100).max(100) }),
]);

function fateDueSchema(participants: readonly string[], consequences: readonly string[]) {
  const allowed = new Set(participants);
  return z.object({
    selectedConsequence: z.string().min(1),
    rationale: z.string().min(1).max(2000),
    effects: z.array(fateEffectSchema),
  }).superRefine((resolution, context) => {
    if (!consequences.includes(resolution.selectedConsequence)) context.addIssue({ code: 'custom', path: ['selectedConsequence'], message: 'Must select an original candidate consequence' });
    for (const effect of resolution.effects) {
      if (!allowed.has(effect.cultivatorId)) context.addIssue({ code: 'custom', path: ['effects'], message: `Effect actor ${effect.cultivatorId} is not a participant` });
      if (effect.type === 'relation.change' && !allowed.has(effect.targetId)) context.addIssue({ code: 'custom', path: ['effects'], message: `Relation target ${effect.targetId} is not a participant` });
    }
  });
}

function proposalFromPayload(payload: unknown): FateEventProposal | undefined {
  if (!payload || typeof payload !== 'object' || !('proposal' in payload)) return undefined;
  const parsed = fateEventProposalSchema.safeParse(payload.proposal);
  return parsed.success ? parsed.data : undefined;
}

function record(value: unknown): JsonRecord { return value as JsonRecord; }
function records(values: readonly unknown[]): readonly JsonRecord[] { return values as readonly JsonRecord[]; }

function semanticWorldSchema() {
  return worldGenesisSchema.superRefine((world, context) => {
    const locationIds = new Set(world.locations.map(({ id }) => id));
    const sectIds = new Set(world.sects.map(({ id }) => id));
    const slotIds = new Set(world.characterSlots.map(({ id }) => id));
    const regions = new Set(world.locations.map(({ region }) => region));
    if (regions.size !== 3) context.addIssue({ code: 'custom', path: ['locations'], message: 'World must contain exactly three regions' });
    if (world.sects.length !== 2) context.addIssue({ code: 'custom', path: ['sects'], message: 'World must contain exactly two sects' });
    if (world.characterSlots.length !== 7) context.addIssue({ code: 'custom', path: ['characterSlots'], message: 'World must contain one player and six cultivator slots' });
    if (locationIds.size !== world.locations.length) context.addIssue({ code: 'custom', path: ['locations'], message: 'Location ids must be unique' });
    if (sectIds.size !== world.sects.length) context.addIssue({ code: 'custom', path: ['sects'], message: 'Sect ids must be unique' });
    if (slotIds.size !== world.characterSlots.length) context.addIssue({ code: 'custom', path: ['characterSlots'], message: 'Character slot ids must be unique' });
    for (const location of world.locations) for (const adjacent of location.adjacentIds) {
      if (!locationIds.has(adjacent)) context.addIssue({ code: 'custom', path: ['locations'], message: `Unknown adjacent location ${adjacent}` });
    }
    for (const sect of world.sects) if (!locationIds.has(sect.locationId)) context.addIssue({ code: 'custom', path: ['sects'], message: `Unknown sect location ${sect.locationId}` });
    for (const slot of world.characterSlots) if (!locationIds.has(slot.locationId)) context.addIssue({ code: 'custom', path: ['characterSlots'], message: `Unknown slot location ${slot.locationId}` });
  });
}

function playableRuleSchema(maxBreakthroughQi: number) {
  return heavenRuleSetSchema.superRefine((rules, context) => {
    const threshold = rules.constants.breakthroughQi;
    if (threshold === undefined || threshold <= 0) {
      context.addIssue({ code: 'custom', path: ['constants', 'breakthroughQi'], message: 'A positive breakthroughQi is required' });
    }
    if (threshold !== undefined && threshold > maxBreakthroughQi) {
      context.addIssue({ code: 'custom', path: ['constants', 'breakthroughQi'], message: `breakthroughQi cannot exceed the player qiMax (${maxBreakthroughQi})` });
    }
    if (rules.constants.baseLifespan === undefined || rules.constants.baseLifespan <= 0) {
      context.addIssue({ code: 'custom', path: ['constants', 'baseLifespan'], message: 'A positive baseLifespan is required' });
    }
    if (rules.contentHash !== undefined) context.addIssue({ code: 'custom', path: ['contentHash'], message: 'contentHash is assigned by the server and must be omitted' });
  });
}

function playablePatchSchema(maxBreakthroughQi: number) {
  return heavenRulePatchSchema.superRefine((patch, context) => {
    const threshold = patch.nextRuleSet.constants.breakthroughQi;
    if (threshold === undefined || threshold <= 0) context.addIssue({ code: 'custom', path: ['nextRuleSet', 'constants', 'breakthroughQi'], message: 'A positive breakthroughQi is required' });
    if (threshold !== undefined && threshold > maxBreakthroughQi) context.addIssue({ code: 'custom', path: ['nextRuleSet', 'constants', 'breakthroughQi'], message: `breakthroughQi cannot exceed the player qiMax (${maxBreakthroughQi})` });
    if (patch.nextRuleSet.constants.baseLifespan === undefined || patch.nextRuleSet.constants.baseLifespan <= 0) context.addIssue({ code: 'custom', path: ['nextRuleSet', 'constants', 'baseLifespan'], message: 'A positive baseLifespan is required' });
    if (patch.nextRuleSet.contentHash !== undefined) context.addIssue({ code: 'custom', path: ['nextRuleSet', 'contentHash'], message: 'contentHash is assigned by the server and must be omitted' });
  });
}

function profileSchema(
  slot: WorldGenesis['characterSlots'][number],
  world: WorldGenesis,
  player: boolean,
  requiredRoute: '剑' | '丹' | '阵' | '魔',
) {
  const slotIds = new Set(world.characterSlots.map(({ id }) => id));
  const sectIds = new Set(world.sects.map(({ id }) => id));
  return cultivatorProfileSchema.superRefine((profile, context) => {
    if (profile.id !== slot.id) context.addIssue({ code: 'custom', path: ['id'], message: `Profile id must be ${slot.id}` });
    if (profile.locationId !== slot.locationId) context.addIssue({ code: 'custom', path: ['locationId'], message: `Initial location must be ${slot.locationId}` });
    if (profile.isPlayer !== player) context.addIssue({ code: 'custom', path: ['isPlayer'], message: `isPlayer must be ${String(player)}` });
    if (profile.stats.senseMax < 3) context.addIssue({ code: 'custom', path: ['stats', 'senseMax'], message: 'senseMax must allow planning and one action' });
    if (profile.stats.hp > profile.stats.hpMax) context.addIssue({ code: 'custom', path: ['stats', 'hp'], message: 'hp cannot exceed hpMax' });
    if (profile.stats.qi > profile.stats.qiMax) context.addIssue({ code: 'custom', path: ['stats', 'qi'], message: 'qi cannot exceed qiMax' });
    if (profile.sectId !== null && !sectIds.has(profile.sectId)) context.addIssue({ code: 'custom', path: ['sectId'], message: `Unknown sect ${profile.sectId}` });
    if (!profile.techniques.some(({ route }) => route === requiredRoute)) context.addIssue({ code: 'custom', path: ['techniques'], message: `Profile must know one ${requiredRoute} route technique` });
    for (const relation of profile.relations) if (!slotIds.has(relation.targetId)) {
      context.addIssue({ code: 'custom', path: ['relations'], message: `Unknown relation target ${relation.targetId}` });
    }
  });
}

function fateSchema(state: GameState) {
  return fateEventProposalSchema.superRefine((proposal, context) => {
    const player = firstPlayer(state);
    if (!proposal.participantIds.includes(player.id)) context.addIssue({ code: 'custom', path: ['participantIds'], message: 'The player must be a participant at a decision point' });
    for (const id of proposal.participantIds) if (!state.world.cultivators[id]) {
      context.addIssue({ code: 'custom', path: ['participantIds'], message: `Unknown participant ${id}` });
    }
    if (!state.world.locations[proposal.locationId]) context.addIssue({ code: 'custom', path: ['locationId'], message: `Unknown location ${proposal.locationId}` });
    if (proposal.risk >= 0.65) for (const id of proposal.participantIds) {
      if (state.world.cultivators[id]?.locationId !== proposal.locationId) context.addIssue({ code: 'custom', path: ['participantIds'], message: `Combat participant ${id} is not at ${proposal.locationId}` });
    }
    if (proposal.deadlineDay !== null && proposal.deadlineDay < state.world.day) {
      context.addIssue({ code: 'custom', path: ['deadlineDay'], message: 'Deadline cannot precede current day' });
    }
  });
}

function withContentHash(rules: HeavenRuleSet): HeavenRuleSet {
  const compiled = compileRuleSet(rules);
  return heavenRuleSetSchema.parse({ ...rules, contentHash: compiled.contentHash });
}

function publicCultivator(cultivator: Cultivator): JsonRecord {
  const { hiddenGoals: _hidden, personality: _personality, memoryEntryIds: _memory, plan: _plan, ...visible } = cultivator;
  return record(visible);
}

function visibleContext(state: GameState, actor: Cultivator, event: QueueEvent): {
  visibleWorld: JsonRecord;
  visibleActors: readonly JsonRecord[];
  memory: readonly JsonRecord[];
} {
  const actors = Object.values(state.world.cultivators)
    .filter((candidate) => candidate.id === actor.id || candidate.locationId === actor.locationId)
    .map((candidate) => candidate.id === actor.id ? record(candidate) : publicCultivator(candidate));
  const allowedMemories = new Set(actor.memoryEntryIds.slice(-actor.memoryDepth));
  const memory = state.privateMemories.filter((entry) => entry.cultivatorId === actor.id && allowedMemories.has(entry.id));
  return {
    visibleWorld: record({
      day: state.world.day,
      location: state.world.locations[actor.locationId],
      rules: { ruleVersion: state.rules.ruleVersion, descriptions: state.rules.descriptions },
    }),
    visibleActors: actors,
    memory: records(memory),
  };
}

function makeEntry(input: Omit<ChronicleEntry, 'id'>): ChronicleEntry {
  return { id: randomUUID(), ...input };
}

function filterKnownCauses(state: GameState, ids: readonly string[]): string[] {
  const known = new Set(state.chronicle.map(({ id }) => id));
  return ids.filter((id) => known.has(id));
}

function firstPlayer(state: GameState): Cultivator {
  const player = Object.values(state.world.cultivators).find(({ isPlayer }) => isPlayer);
  if (!player) throw new AppError('SAVE_SCHEMA_INVALID', '存档中缺少玩家修士', 422);
  return player;
}

function eventDomainDiff(before: Cultivator, after: Cultivator): DomainEvent[] {
  const result: DomainEvent[] = [];
  for (const resource of ['hp', 'qi', 'senseMax', 'lifespan'] as const) {
    const delta = after.stats[resource] - before.stats[resource];
    if (delta !== 0) result.push({ type: 'resource.change', cultivatorId: before.id, resource, amount: delta });
  }
  if (before.locationId !== after.locationId) result.push({ type: 'move', cultivatorId: before.id, locationId: after.locationId });
  for (const status of after.stats.statuses) if (!before.stats.statuses.includes(status)) result.push({ type: 'status.add', cultivatorId: before.id, status });
  for (const status of before.stats.statuses) if (!after.stats.statuses.includes(status)) result.push({ type: 'status.remove', cultivatorId: before.id, status });
  return result;
}

export function deriveProgressionEvents(
  state: GameState,
  actor: Cultivator,
  calls: readonly ToolCall[],
  baseEvents: readonly DomainEvent[],
): DomainEvent[] {
  const result: DomainEvent[] = [...baseEvents];
  let hp = actor.stats.hp;
  let qi = actor.stats.qi;
  let lifespan = actor.stats.lifespan;
  const statuses = new Set(actor.stats.statuses);
  for (const event of baseEvents) {
    if (event.type === 'resource.change' && event.cultivatorId === actor.id) {
      if (event.resource === 'hp') hp = Math.max(0, Math.min(actor.stats.hpMax, hp + event.amount));
      if (event.resource === 'qi') qi = Math.max(0, Math.min(actor.stats.qiMax, qi + event.amount));
      if (event.resource === 'lifespan') lifespan = Math.max(0, lifespan + event.amount);
    }
    if (event.type === 'status.add' && event.cultivatorId === actor.id) statuses.add(event.status);
    if (event.type === 'status.remove' && event.cultivatorId === actor.id) statuses.delete(event.status);
  }
  if (actor.isPlayer && (hp <= 0 || lifespan <= 0)) {
    result.push({ type: 'ending', ending: '陨落' });
    return result;
  }
  const threshold = state.rules.constants.breakthroughQi;
  if (!calls.some(({ name }) => name === 'cultivate') || threshold === undefined || qi < threshold) return result;
  if (actor.stats.realm === '炼气') {
    result.push({ type: 'resource.change', cultivatorId: actor.id, resource: 'qi', amount: -threshold });
    result.push({ type: 'realm.change', cultivatorId: actor.id, realm: '筑基' });
  } else if (actor.stats.realm === '筑基') {
    result.push({ type: 'resource.change', cultivatorId: actor.id, resource: 'qi', amount: -threshold });
    result.push({ type: 'realm.change', cultivatorId: actor.id, realm: '金丹' });
  } else if (actor.isPlayer) {
    result.push({ type: 'ending', ending: statuses.has('入魔') ? '入魔' : '证道' });
  }
  return result;
}

export function nonCombatTechniqueEvents(
  state: GameState,
  actor: Cultivator,
  calls: readonly ToolCall[],
  baseEvents: readonly DomainEvent[],
): DomainEvent[] {
  const result: DomainEvent[] = [...baseEvents];
  const compiled = compileRuleSet(state.rules);
  for (const call of calls) {
    if (call.name !== 'useTechnique') continue;
    const technique = actor.techniques.find(({ name }) => name === call.arguments.name);
    if (!technique) continue;
    const targetId = technique.target === 'self' ? actor.id : call.arguments.target;
    if (!state.world.cultivators[targetId]) continue;
    for (const effect of technique.effects) {
      const succeeds = hashRandom(state.randomSeed, state.sequence, state.world.day, actor.id, call.id, effect.id, targetId) < effect.chance;
      if (!succeeds) continue;
      if (effect.type === 'damage') {
        const amount = Math.max(0, Math.round(compiled.applyModifiers('damage', technique.power + effect.value, technique.tags)));
        result.push({ type: 'resource.change', cultivatorId: targetId, resource: 'hp', amount: -amount });
      } else if (effect.type === 'heal') {
        const amount = Math.max(0, Math.round(compiled.applyModifiers('healing', effect.value, technique.tags)));
        result.push({ type: 'resource.change', cultivatorId: targetId, resource: 'hp', amount });
      } else if (effect.type === 'status' && effect.status) {
        result.push({ type: 'status.add', cultivatorId: targetId, status: effect.status });
      }
    }
  }
  return result;
}

export function globalMortalityEvents(state: GameState, events: readonly DomainEvent[]): DomainEvent[] {
  if (events.some(({ type }) => type === 'ending')) return [];
  const player = firstPlayer(state);
  let hp = player.stats.hp;
  let lifespan = player.stats.lifespan;
  for (const event of events) {
    if (event.type !== 'resource.change' || event.cultivatorId !== player.id) continue;
    if (event.resource === 'hp') hp = Math.max(0, Math.min(player.stats.hpMax, hp + event.amount));
    if (event.resource === 'lifespan') lifespan = Math.max(0, lifespan + event.amount);
  }
  return hp <= 0 || lifespan <= 0 ? [{ type: 'ending', ending: '陨落' }] : [];
}

export function elapsedTimeEvents(state: GameState, toDay: number, causeIds: readonly string[] = []): DomainEvent[] {
  const days = Math.max(0, toDay - state.world.day);
  if (days === 0) return [];
  const events: DomainEvent[] = Object.values(state.world.cultivators).map((cultivator) => ({
    type: 'resource.change', cultivatorId: cultivator.id, resource: 'lifespan', amount: -days,
  }));
  const player = firstPlayer(state);
  const allIds = Object.keys(state.world.cultivators);
  const rules = triggerRuleEffects(state, 'on_time', { day: toDay, daysElapsed: days }, {
    actorId: player.id,
    participantIds: allIds,
    day: toDay,
    locationId: player.locationId,
    causeIds,
    nextInsertionSequence: state.nextInsertionSequence,
  });
  events.push(...rules.domainEvents);
  events.push(...globalMortalityEvents(state, events));
  return events;
}

export function continuingCombatEvent(state: GameState, previous: QueueEvent, causeId: string): QueueEvent | null {
  const playerId = firstPlayer(state).id;
  const alive = previous.participantIds
    .map((id) => state.world.cultivators[id])
    .filter((cultivator): cultivator is Cultivator => Boolean(cultivator && cultivator.stats.hp > 0));
  const locations = new Map<string, Cultivator[]>();
  for (const cultivator of alive) locations.set(cultivator.locationId, [...(locations.get(cultivator.locationId) ?? []), cultivator]);
  const continuing = [...locations.values()].find((group) => group.length >= 2 && group.some(({ id }) => id === playerId));
  if (!continuing) return null;
  const previousRound = Number(previous.payload && typeof previous.payload === 'object' && 'round' in previous.payload ? previous.payload.round : 1);
  return {
    id: randomUUID(), day: state.world.day, priority: 0, insertionSequence: state.nextInsertionSequence,
    type: 'combat', participantIds: continuing.map(({ id }) => id), locationId: continuing[0]!.locationId,
    perceptionRadius: previous.perceptionRadius, causeIds: [causeId],
    payload: json({ ...(previous.payload && typeof previous.payload === 'object' ? previous.payload : {}), combat: true, round: previousRound + 1 }),
  };
}

export function projectResolvedMemories(state: GameState, entries: readonly ChronicleEntry[]): GameState {
  const projected = structuredClone(state);
  for (const entry of entries) {
    const payload = entry.structuredPayload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('calls' in payload) || !Array.isArray(payload.calls)) continue;
    const actorId = entry.actorIds[0];
    const actor = actorId ? projected.world.cultivators[actorId] : undefined;
    if (!actor) continue;
    for (const raw of payload.calls) {
      const parsed = toolCallSchema.safeParse(raw);
      if (!parsed.success) continue;
      const call = parsed.data;
      let text: string;
      if (call.name === 'observe') text = `观察：${call.arguments.target}`;
      else if (call.name === 'remember') text = `回忆：${call.arguments.query}`;
      else if (call.name === 'speak') text = `对 ${call.arguments.target} 说：${call.arguments.words}`;
      else continue;
      const memory = { id: randomUUID(), cultivatorId: actor.id, day: entry.day, text, causeIds: [entry.id] };
      projected.privateMemories.push(memory);
      actor.memoryEntryIds.push(memory.id);
    }
  }
  return gameStateSchema.parse(projected);
}

class GameLocks {
  readonly #tails = new Map<string, Promise<void>>();
  async run<T>(gameId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(gameId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.#tails.set(gameId, tail);
    await previous;
    try { return await task(); } finally {
      release();
      if (this.#tails.get(gameId) === tail) this.#tails.delete(gameId);
    }
  }
}

interface AgentDraft {
  readonly actor: Cultivator;
  readonly calls: ToolCall[];
  readonly domainEvents: DomainEvent[];
  readonly senseCost: number;
}

export class GameService {
  readonly #locks = new GameLocks();
  readonly #globalModelSemaphore: WeightedSemaphore;

  constructor(
    private readonly repository: GameRepository,
    private readonly sessions: SessionStore,
    private readonly events: GameEventBus,
    private readonly modelTimeoutMs: number,
    private readonly maxConcurrency: number,
  ) {
    this.#globalModelSemaphore = new WeightedSemaphore(maxConcurrency);
  }

  get(id: string): GameState { return this.repository.get(id); }

  async create(sessionId: string): Promise<GameState> {
    const session = this.sessions.get(sessionId);
    const gameId = randomUUID();
    const gateway = this.#gateway(session.config);

    const world = await gateway.structured('heaven', worldGenesisPrompt(), semanticWorldSchema(), {
      gameId, source: 'heaven', actorId: null, requestType: 'WorldGenesis',
    });
    const routes = ['剑', '丹', '阵', '魔'] as const;
    const profiles = await Promise.all(world.characterSlots.map((slot, index) => gateway.structured(
      'cultivator',
      cultivatorProfilePrompt({ slot: record({ ...slot, isPlayer: index === 0, requiredRoute: routes[index % routes.length] }), world: record(world), existingProfiles: [] }),
      profileSchema(slot, world, index === 0, routes[index % routes.length]!),
      { gameId, source: 'cultivator', actorId: slot.id, requestType: 'CultivatorProfile' },
    )));
    const worldState: WorldState = {
      id: randomUUID(), name: world.name, premise: world.premise, day: 1,
      locations: Object.fromEntries(world.locations.map((location) => [location.id, location])),
      sects: Object.fromEntries(world.sects.map((sect) => [sect.id, sect])),
      cultivators: Object.fromEntries(profiles.map((profile) => [profile.id, profile])),
    };
    const genesisPlayer = profiles.find(({ isPlayer }) => isPlayer);
    if (!genesisPlayer) throw new AppError('MODEL_OUTPUT_INVALID', '人物生成结果缺少主角', 422);

    const rawRules = await gateway.structured('heaven', heavenRuleSetPrompt({
      world: record(worldState), registry: record(DSL_REGISTRY), ruleVersion: 1,
    }), playableRuleSchema(genesisPlayer.stats.qiMax), { gameId, source: 'heaven', actorId: null, requestType: 'HeavenRuleSet' });
    const rules = withContentHash(rawRules);
    let initial = createInitialGameState({ id: gameId, engineVersion: ENGINE_VERSION, randomSeed: randomUUID(), rules, world: worldState });

    const proposal = await gateway.structured('fate', fateEventPrompt({
      visibleState: record(worldState), rules: record(rules), causes: [], dueHooks: [], currentDay: 1,
    }), fateSchema(initial), { gameId, source: 'fate', actorId: null, requestType: 'FateEventProposal' });
    const narrative = await gateway.narrative('narration', narrationPrompt({
      source: 'fate', viewpointName: firstPlayer(initial).name, settledFacts: records([proposal]), causes: [], visibleState: record(worldState),
    }), { gameId, source: 'fate', actorId: null, requestType: 'NarrationRequest' });

    const ruleEntry = makeEntry({
      day: 1, phase: 'rule', sequence: 1, source: 'heaven', kind: 'rule', actorIds: [], causeIds: [], visibility: ['public'],
      text: rules.descriptions.join('\n'), structuredPayload: json({ rules }), cost: { sense: 0, qi: 0 },
    });
    const fateEntry = makeEntry({
      day: 1, phase: 'fate', sequence: 2, source: 'fate', kind: 'event', actorIds: proposal.participantIds,
      causeIds: [ruleEntry.id], visibility: ['public'], text: narrative, structuredPayload: json({ proposal }), cost: { sense: 0, qi: 0 },
    });
    const decision = this.#decisionEvent(initial, proposal, fateEntry.id);
    initial.nextInsertionSequence += 1;
    initial = { ...initial, queue: [decision], status: 'running' };
    const state = reduceChronicle(initial, [ruleEntry, fateEntry]);
    state.status = 'awaiting_player';
    this.repository.create(gameStateSchema.parse(state), sessionId);
    this.#publishResolved(gameId, [ruleEntry, fateEntry]);
    return state;
  }

  async command(gameId: string, rawCommand: string, expectedRevision?: number): Promise<GameState> {
    return this.#locks.run(gameId, async () => {
      const state = this.repository.get(gameId);
      this.#expectRevision(state, expectedRevision);
      if (state.status !== 'awaiting_player') throw new AppError('STALE_REVISION', '当前不在玩家决策点', 409);
      const decision = [...state.queue].sort((a, b) => a.day - b.day || a.priority - b.priority || a.insertionSequence - b.insertionSequence)
        .find((event) => event.type === 'decision' || event.type === 'combat');
      if (!decision) throw new AppError('SAVE_SCHEMA_INVALID', '决策状态缺少队列事件', 500);
      const session = this.sessions.get(this.repository.sessionIdFor(gameId));
      const gateway = this.#gateway(session.config);
      let playerRoundCommitted = false;
      try {
        const player = firstPlayer(state);
        const combat = decision.type === 'combat' || Boolean(decision.payload && typeof decision.payload === 'object' && 'combat' in decision.payload && decision.payload.combat);
        const allowed = combat ? COMBAT_TOOLS : ALL_TOOLS;
        const intentSchema = playerIntentSchema.superRefine((intent, context) => {
          if (intent.rawText !== rawCommand) context.addIssue({ code: 'custom', path: ['rawText'], message: 'rawText must exactly match player input' });
          for (const call of intent.calls) if (!allowed.includes(call.name)) context.addIssue({ code: 'custom', path: ['calls'], message: `${call.name} is unavailable now` });
          if (combat && intent.calls.length !== 1) context.addIssue({ code: 'custom', path: ['calls'], message: 'Combat requires exactly one main action' });
        });
        const playerVisible = visibleContext(state, player, decision);
        const intent = await gateway.structured('cultivator', playerIntentPrompt({
          rawCommand,
          player: record(player),
          currentEvent: record(decision),
          visibleState: playerVisible.visibleWorld,
          visibleActors: playerVisible.visibleActors,
          allowedTools: allowed,
        }), intentSchema, { gameId, source: 'player', actorId: player.id, requestType: 'PlayerIntent' });

        const playerDraft = this.#validatePlayer(state, player, intent.calls);
        const wakeEvent: QueueEvent = {
          ...decision,
          participantIds: [...new Set([...decision.participantIds, ...intent.targetIds])],
          payload: combat ? decision.payload : json({
            ...(decision.payload && typeof decision.payload === 'object' ? decision.payload : {}),
            playerIntent: { rawText: intent.rawText, goal: intent.goal, targetIds: intent.targetIds, calls: intent.calls },
          }),
        };
        const awake = selectAwakeCultivators(state.world, wakeEvent)
          .map(({ cultivator }) => cultivator)
          .filter(({ id, isPlayer }) => !isPlayer && (combat ? decision.participantIds.includes(id) : true));
        const agents = await Promise.all(awake.map((actor) => this.#agentDraft(gateway, state, actor, wakeEvent, allowed)));
        const entries = await this.#settleCommand(gateway, state, decision, rawCommand, player, playerDraft, agents, combat);

        const base = structuredClone(state);
        base.queue = base.queue.filter(({ id }) => id !== decision.id);
        base.status = 'running';
        const next = projectResolvedMemories(reduceChronicle(base, entries), entries);
        const causeId = entries.at(-1)?.id;
        if (!causeId) throw new AppError('INTERNAL_ERROR', '玩家回合未产生已结算事件', 500);
        if (next.status === 'ended') {
          next.queue = [];
        } else if (combat && causeId) {
          const followingRound = continuingCombatEvent(next, decision, causeId);
          if (followingRound) {
            next.queue.push(followingRound);
            next.nextInsertionSequence += 1;
            next.status = 'awaiting_player';
          } else {
            next.queue.push(this.#followupQueue(next, decision, causeId));
            next.nextInsertionSequence += 1;
          }
        } else {
          next.queue.push(this.#followupQueue(next, decision, causeId));
          next.nextInsertionSequence += 1;
        }
        next.queue.sort((a, b) => a.day - b.day || a.priority - b.priority || a.insertionSequence - b.insertionSequence);
        this.repository.commit(gameId, state.revision, gameStateSchema.parse(next), entries);
        playerRoundCommitted = true;
        this.#publishResolved(gameId, entries);
        return next.status === 'running' ? await this.#advanceUnlocked(gameId, next.revision) : next;
      } catch (error) {
        if (playerRoundCommitted) {
          const latest = this.repository.get(gameId);
          return gameStateSchema.parse({
            ...latest,
            status: 'paused',
            pauseReason: error instanceof AppError ? error.message : '后续模型调用失败，可从已结算的玩家回合继续',
          });
        }
        this.#publishPaused(gameId, error, 'player', firstPlayer(state).id);
        throw error;
      }
    });
  }

  async advance(gameId: string, expectedRevision?: number): Promise<GameState> {
    return this.#locks.run(gameId, () => this.#advanceUnlocked(gameId, expectedRevision));
  }

  async #advanceUnlocked(gameId: string, expectedRevision?: number): Promise<GameState> {
    const state = this.repository.get(gameId);
    this.#expectRevision(state, expectedRevision);
    if (state.status === 'awaiting_player' || state.status === 'ended') return state;
    const session = this.sessions.get(this.repository.sessionIdFor(gameId));
    const gateway = this.#gateway(session.config);
    try {
        let base = structuredClone(state);
        const entries: ChronicleEntry[] = [];
        let microsteps = 0;
        while (microsteps < 32) {
          microsteps += 1;
          let event = base.queue.sort((a, b) => a.day - b.day || a.priority - b.priority || a.insertionSequence - b.insertionSequence).shift()
            ?? this.#fateQueue(base, entries.at(-1)?.id ?? base.chronicle.at(-1)?.id);
          const timeEntryId = randomUUID();
          const elapsed = elapsedTimeEvents(base, event.day, [timeEntryId]);
          if (elapsed.length > 0) {
            const timeCauses = filterKnownCauses(base, event.causeIds);
            const timeText = await gateway.narrative('narration', narrationPrompt({
              source: 'heaven', viewpointName: firstPlayer(base).name, settledFacts: records(elapsed),
              causes: records(base.chronicle.filter(({ id }) => timeCauses.includes(id))), visibleState: record(base.world),
            }), { gameId, source: 'heaven', actorId: null, requestType: 'TimePassageNarration' });
            const timeEntry: ChronicleEntry = {
              id: timeEntryId,
              day: event.day, phase: 'resolve', sequence: base.sequence + 1, source: 'heaven', kind: 'event',
              actorIds: Object.keys(base.world.cultivators), causeIds: timeCauses, visibility: ['public'],
              text: timeText,
              structuredPayload: json({ domainEvents: elapsed }), cost: { sense: 0, qi: 0 },
            };
            entries.push(timeEntry);
            base = reduceChronicle(base, [timeEntry]);
            event = { ...event, causeIds: [...event.causeIds, timeEntry.id] };
            if (base.status === 'ended') {
              base.queue = [];
              break;
            }
          }
          if (event.type === 'rule') {
            const patch = await gateway.structured('heaven', heavenRulePatchPrompt({
              currentRules: record(base.rules), settledCauses: records(base.chronicle.filter(({ id }) => event.causeIds.includes(id))),
              registry: record(DSL_REGISTRY), nextVersion: base.rules.ruleVersion + 1,
            }), playablePatchSchema(firstPlayer(base).stats.qiMax), { gameId, source: 'heaven', actorId: null, requestType: 'HeavenRulePatch' });
            base.rules = withContentHash(patch.nextRuleSet);
            const ruleEntryId = randomUUID();
            const epochEffects = triggerRuleEffects(base, 'epoch_change', {
              day: event.day,
              ruleVersion: base.rules.ruleVersion,
            }, {
              actorId: firstPlayer(base).id,
              participantIds: Object.keys(base.world.cultivators),
              day: event.day,
              causeIds: [ruleEntryId],
              nextInsertionSequence: base.nextInsertionSequence,
            });
            entries.push({
              id: ruleEntryId,
              day: event.day, phase: 'rule', sequence: state.sequence + entries.length + 1, source: 'heaven', kind: 'rule', actorIds: [],
              causeIds: [...event.causeIds], visibility: ['public'], text: base.rules.descriptions.join('\n'),
              structuredPayload: json({ patch, domainEvents: epochEffects.domainEvents }), cost: { sense: 0, qi: 0 },
            });
            base = reduceChronicle(base, [entries.at(-1)!]);
            continue;
          }
          if (event.type === 'resolve') {
            const payload = event.payload && typeof event.payload === 'object' && 'domainEvents' in event.payload
              ? z.array(domainEventSchema).parse(event.payload.domainEvents)
              : [];
            if (payload.length === 0) continue;
            const knownCauses = filterKnownCauses(base, event.causeIds);
            const text = await gateway.narrative('narration', narrationPrompt({
              source: 'heaven', viewpointName: firstPlayer(base).name, settledFacts: records(payload),
              causes: records(base.chronicle.filter(({ id }) => knownCauses.includes(id))), visibleState: record(base.world),
            }), { gameId, source: 'heaven', actorId: null, requestType: 'RuleResolutionNarration' });
            const resolutionEntry = makeEntry({
              day: event.day, phase: 'resolve', sequence: base.sequence + 1, source: 'heaven', kind: 'event', actorIds: event.participantIds,
              causeIds: knownCauses, visibility: ['public'], text, structuredPayload: json({ domainEvents: payload }), cost: { sense: 0, qi: 0 },
            });
            entries.push(resolutionEntry);
            base = reduceChronicle(base, [resolutionEntry]);
            if (base.status === 'ended') {
              base.queue = [];
              break;
            }
            continue;
          }
          if (event.type === 'combat' || event.type === 'decision') {
            base.queue.unshift(event);
            base.status = 'awaiting_player';
            break;
          }
          if (event.type === 'agent_plan') {
            const awake = selectAwakeCultivators(base.world, event)
              .map(({ cultivator }) => cultivator)
              .filter(({ isPlayer }) => !isPlayer);
            const drafts = await Promise.all(awake.map((actor) => this.#agentDraft(gateway, base, actor, event, ALL_TOOLS)));
            let insertion = base.nextInsertionSequence;
            for (const draft of drafts) {
              const entryId = randomUUID();
              const techniqueEvents = nonCombatTechniqueEvents(base, draft.actor, draft.calls, draft.domainEvents);
              const progressedEvents = deriveProgressionEvents(base, draft.actor, draft.calls, techniqueEvents);
              const domainEvents = this.#schedulePlans(progressedEvents, draft.actor, base, entryId, () => insertion++);
              const ruleEffects = rulesForDomainEvents(base, draft.actor.id, domainEvents, {
                participantIds: event.participantIds,
                day: event.day,
                locationId: draft.actor.locationId,
                causeIds: [entryId],
                nextInsertionSequence: insertion,
              });
              domainEvents.push(...ruleEffects.domainEvents);
              insertion = ruleEffects.nextInsertionSequence;
              domainEvents.push(...globalMortalityEvents(base, domainEvents));
              const text = await gateway.narrative('narration', narrationPrompt({
                source: 'cultivator', viewpointName: draft.actor.name,
                settledFacts: records([{ actorId: draft.actor.id, calls: draft.calls, domainEvents }]),
                causes: records(base.chronicle.filter(({ id }) => event.causeIds.includes(id))),
                visibleState: visibleContext(base, draft.actor, event).visibleWorld,
              }), { gameId, source: 'cultivator', actorId: draft.actor.id, requestType: 'NarrationRequest' });
              const entry: ChronicleEntry = {
                id: entryId, day: event.day, phase: 'agent', sequence: base.sequence + 1, source: 'cultivator', kind: 'action',
                actorIds: [draft.actor.id], causeIds: filterKnownCauses(base, event.causeIds), visibility: ['public'], text,
                structuredPayload: json({ calls: draft.calls, domainEvents }), cost: { sense: draft.senseCost, qi: 0 },
              };
              entries.push(entry);
              base = reduceChronicle(base, [entry]);
              if (base.status === 'ended') break;
            }
            if (base.status === 'ended') {
              base.queue = [];
              break;
            }
            continue;
          }
          if (event.type === 'fate' || base.queue.length === 0) {
            const dueProposal = event.payload && typeof event.payload === 'object' && 'kind' in event.payload && event.payload.kind === 'deadline'
              ? proposalFromPayload(event.payload)
              : undefined;
            if (dueProposal) {
              const deadlineCauses = filterKnownCauses(base, event.causeIds);
              const resolution = await gateway.structured('fate', fateResolutionPrompt({
                dueEvent: record({ proposal: dueProposal, deadlineDay: dueProposal.deadlineDay, stakes: dueProposal.stakes, candidateConsequences: dueProposal.candidateConsequences }),
                settledCauses: records(base.chronicle.filter(({ id }) => deadlineCauses.includes(id))),
                visibleState: record(base.world), rules: record(base.rules),
              }), fateDueSchema(dueProposal.participantIds, dueProposal.candidateConsequences), {
                gameId, source: 'fate', actorId: null, requestType: 'FateDeadlineResolution',
              });
              const resolutionEntryId = randomUUID();
              const effects = deriveProgressionEvents(base, firstPlayer(base), [], resolution.effects as DomainEvent[]);
              const ruleEffects = rulesForDomainEvents(base, firstPlayer(base).id, effects, {
                participantIds: dueProposal.participantIds,
                day: event.day,
                locationId: dueProposal.locationId,
                causeIds: [resolutionEntryId],
                nextInsertionSequence: base.nextInsertionSequence,
              });
              effects.push(...ruleEffects.domainEvents);
              effects.push(...globalMortalityEvents(base, effects));
              const resolutionText = await gateway.narrative('narration', narrationPrompt({
                source: 'fate', viewpointName: firstPlayer(base).name,
                settledFacts: records([{ stakes: dueProposal.stakes, ...resolution, domainEvents: effects }]),
                causes: records(base.chronicle.filter(({ id }) => deadlineCauses.includes(id))), visibleState: record(base.world),
              }), { gameId, source: 'fate', actorId: null, requestType: 'FateResolutionNarration' });
              const resolutionEntry: ChronicleEntry = {
                id: resolutionEntryId,
                day: event.day, phase: 'resolve', sequence: base.sequence + 1, source: 'fate', kind: 'event',
                actorIds: dueProposal.participantIds, causeIds: deadlineCauses, visibility: ['public'], text: resolutionText,
                structuredPayload: json({ proposalId: dueProposal.id, stakes: dueProposal.stakes, resolution, domainEvents: effects }),
                cost: { sense: 0, qi: 0 },
              };
              entries.push(resolutionEntry);
              base = reduceChronicle(base, [resolutionEntry]);
              if (base.status === 'ended') {
                base.queue = [];
                break;
              }
              event = { ...event, causeIds: [resolutionEntry.id], payload: json({ kind: 'causal', resolution }) };
            }
            const knownCauses = filterKnownCauses(base, event.causeIds);
            const proposal = await gateway.structured('fate', fateEventPrompt({
              visibleState: record(base.world), rules: record(base.rules),
              causes: records(base.chronicle.filter(({ id }) => knownCauses.includes(id))), dueHooks: records([event.payload]), currentDay: event.day,
            }), fateSchema(base), { gameId, source: 'fate', actorId: null, requestType: 'FateEventProposal' });
            const text = await gateway.narrative('narration', narrationPrompt({
              source: 'fate', viewpointName: firstPlayer(base).name, settledFacts: records([proposal]),
              causes: records(base.chronicle.filter(({ id }) => knownCauses.includes(id))), visibleState: record(base.world),
            }), { gameId, source: 'fate', actorId: null, requestType: 'NarrationRequest' });
            const fateEntry = makeEntry({
              day: event.day, phase: 'fate', sequence: state.sequence + entries.length + 1, source: 'fate', kind: 'event',
              actorIds: proposal.participantIds, causeIds: knownCauses, visibility: ['public'], text,
              structuredPayload: json({ proposal }), cost: { sense: 0, qi: 0 },
            });
            entries.push(fateEntry);
            base = reduceChronicle(base, [fateEntry]);
            base.queue.push(this.#decisionEvent(base, proposal, fateEntry.id));
            base.nextInsertionSequence += 1;
            base.status = 'awaiting_player';
            break;
          }
        }
        if (microsteps >= 32 && base.status !== 'awaiting_player') throw new AppError('MICROSTEP_LIMIT', '本次推进已达 32 个微步', 409);
        if (entries.length === 0) return gameStateSchema.parse(base);
        const next = projectResolvedMemories(structuredClone(base), entries);
        next.revision = state.revision + 1;
        this.repository.commit(gameId, state.revision, gameStateSchema.parse(next), entries);
        this.#publishResolved(gameId, entries);
      return next;
    } catch (error) {
      this.#publishPaused(gameId, error, 'fate', null);
      throw error;
    }
  }

  export(gameId: string) { return exportSave(this.repository.get(gameId)); }

  import(sessionId: string, input: unknown): GameState {
    this.sessions.get(sessionId);
    let state: GameState;
    try { state = importSave(input, ENGINE_VERSION); }
    catch (error) { throw new AppError('SAVE_SCHEMA_INVALID', error instanceof Error ? error.message : '存档无效', 422); }
    this.repository.restore(state, sessionId);
    return state;
  }

  rebind(gameId: string, sessionId: string): GameState {
    this.sessions.get(sessionId);
    const state = this.repository.get(gameId);
    this.repository.bindSession(gameId, sessionId);
    return state;
  }

  hash(gameId: string): string { return stableStateHash(this.repository.get(gameId)); }

  #gateway(config: import('@xiuxian/protocol').ModelConfig): ModelGateway {
    return new ModelGateway(config, this.modelTimeoutMs, this.events, this.maxConcurrency, this.#globalModelSemaphore);
  }

  #expectRevision(state: GameState, expected?: number): void {
    if (expected !== undefined && expected !== state.revision) throw new AppError('STALE_REVISION', `期望 revision ${expected}，当前为 ${state.revision}`, 409);
  }

  #decisionEvent(state: GameState, proposal: FateEventProposal, causeId: string): QueueEvent {
    return {
      id: randomUUID(), day: state.world.day, priority: 0, insertionSequence: state.nextInsertionSequence,
      type: proposal.risk >= 0.65 ? 'combat' : 'decision', participantIds: proposal.participantIds,
      locationId: proposal.locationId, perceptionRadius: proposal.perceptionRadius, causeIds: [causeId],
      payload: json({ proposal, combat: proposal.risk >= 0.65 }),
    };
  }

  #fateQueue(state: GameState, causeId?: string): QueueEvent {
    return {
      id: randomUUID(), day: state.world.day + 1, priority: 10, insertionSequence: state.nextInsertionSequence,
      type: 'fate', participantIds: [], locationId: null, perceptionRadius: 0,
      causeIds: causeId ? [causeId] : [], payload: json({ reason: 'causal_chain_continues' }),
    };
  }

  #followupQueue(state: GameState, decision: QueueEvent, causeId: string): QueueEvent {
    const proposal = proposalFromPayload(decision.payload);
    const dueDay = proposal?.deadlineDay !== null && proposal?.deadlineDay !== undefined && proposal.deadlineDay > state.world.day
      ? proposal.deadlineDay
      : state.world.day + 1;
    return {
      id: randomUUID(), day: dueDay, priority: 10, insertionSequence: state.nextInsertionSequence,
      type: 'fate', participantIds: proposal?.participantIds ?? [], locationId: proposal?.locationId ?? null,
      perceptionRadius: proposal?.perceptionRadius ?? 0, causeIds: [causeId],
      payload: json(proposal?.deadlineDay !== null && proposal?.deadlineDay !== undefined && proposal.deadlineDay > state.world.day
        ? { kind: 'deadline', proposal }
        : { kind: 'causal', stakes: proposal?.stakes, candidateConsequences: proposal?.candidateConsequences }),
    };
  }

  #validatePlayer(state: GameState, player: Cultivator, calls: readonly ToolCall[]): AgentDraft {
    const ledger = new SenseLedger();
    ledger.openWindow(player.id, player.stats.senseMax, player.stats.focusSlots);
    if (!ledger.reservePlanning(player.id)) throw new AppError('TOOL_OUT_OF_SENSE', '主角神识不足以解析意图', 422);
    ledger.finishPlanning(player.id);
    const tx = new ActionDraftTransaction(randomUUID(), { actorId: player.id, world: state.world, ledger, day: state.world.day });
    const results = calls.map((call) => tx.submit(call));
    const invalid = results.find((result) => !result.ok);
    if (invalid && !invalid.ok) {
      tx.rollback();
      throw new AppError(invalid.code, invalid.reason, 422);
    }
    tx.commit();
    return {
      actor: player, calls: [...calls],
      domainEvents: results.flatMap((result) => result.ok ? result.domainEvents : []),
      senseCost: player.stats.senseMax - ledger.get(player.id).remaining,
    };
  }

  async #agentDraft(gateway: ModelGateway, state: GameState, actor: Cultivator, event: QueueEvent, allowed: readonly ToolName[]): Promise<AgentDraft> {
    const ledger = new SenseLedger();
    ledger.openWindow(actor.id, actor.stats.senseMax, actor.stats.focusSlots);
    let rejected: JsonRecord | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!ledger.reservePlanning(actor.id)) throw new AppError('TOOL_OUT_OF_SENSE', `${actor.name}神识不足以重新规划`, 422);
      const visible = visibleContext(state, actor, event);
      let generated: Awaited<ReturnType<ModelGateway['toolCalls']>>;
      try {
        generated = await gateway.toolCalls('cultivator', cultivatorTurnPrompt({
          self: record(actor), visibleWorld: visible.visibleWorld, visibleActors: visible.visibleActors, memory: visible.memory,
          event: record(event), remainingSense: ledger.get(actor.id).remaining, focusSlots: actor.stats.focusSlots,
          allowedTools: allowed, ...(rejected === undefined ? {} : { rejectedCall: rejected }),
        }), { gameId: state.id, source: 'cultivator', actorId: actor.id, requestType: 'CultivatorTurn' }, allowed);
      } catch (error) {
        if (error instanceof AppError && error.code === 'MODEL_OUTPUT_INVALID' && attempt === 0) {
          rejected = record({ code: error.code, reason: error.message });
          continue;
        }
        throw error;
      } finally { ledger.finishPlanning(actor.id); }
      if (generated.calls.length > actor.stats.focusSlots) {
        rejected = record({ code: 'TOOL_OUT_OF_SENSE', reason: `调用数 ${generated.calls.length} 超过 focusSlots ${actor.stats.focusSlots}` });
        continue;
      }
      const combatWindow = event.type === 'combat' || Boolean(event.payload && typeof event.payload === 'object' && 'combat' in event.payload && event.payload.combat);
      if (combatWindow && generated.calls.length !== 1) {
        rejected = record({ code: 'COMBAT_INTENT_MISSING', reason: '战斗回合必须且只能提交一个主行动' });
        continue;
      }
      const tx = new ActionDraftTransaction(randomUUID(), { actorId: actor.id, world: state.world, ledger, day: state.world.day });
      const results = generated.calls.map((call) => tx.submit(call));
      const invalid = results.find((result) => !result.ok);
      if (invalid && !invalid.ok) {
        tx.rollback();
        rejected = record({ code: invalid.code, reason: invalid.reason });
        continue;
      }
      tx.commit();
      return {
        actor, calls: generated.calls,
        domainEvents: results.flatMap((result) => result.ok ? result.domainEvents : []),
        senseCost: actor.stats.senseMax - ledger.get(actor.id).remaining,
      };
    }
    throw new AppError('MODEL_OUTPUT_INVALID', `${actor.name}两次提交非法工具调用`, 422, rejected);
  }

  async #settleCommand(
    gateway: ModelGateway,
    state: GameState,
    decision: QueueEvent,
    rawCommand: string,
    player: Cultivator,
    playerDraft: AgentDraft,
    agents: readonly AgentDraft[],
    combat: boolean,
  ): Promise<ChronicleEntry[]> {
    const entries: ChronicleEntry[] = [];
    let insertion = state.nextInsertionSequence;
    const playerEntry = makeEntry({
      day: state.world.day, phase: 'player', sequence: state.sequence + 1, source: 'player', kind: combat ? 'combat' : 'action',
      actorIds: [player.id], causeIds: decision.causeIds, visibility: ['public'], text: rawCommand,
      structuredPayload: json({ calls: playerDraft.calls, domainEvents: [] }),
      cost: { sense: playerDraft.senseCost, qi: 0 },
    });
    const playerTechniqueEvents = nonCombatTechniqueEvents(state, player, playerDraft.calls, playerDraft.domainEvents);
    const progressedPlayerEvents = deriveProgressionEvents(state, player, playerDraft.calls, playerTechniqueEvents);
    const playerEvents = combat ? [] : this.#schedulePlans(progressedPlayerEvents, player, state, playerEntry.id, () => insertion++);
    if (!combat) {
      const ruleEffects = rulesForDomainEvents(state, player.id, playerEvents, {
        participantIds: decision.participantIds,
        day: state.world.day,
        locationId: player.locationId,
        causeIds: [playerEntry.id],
        nextInsertionSequence: insertion,
      });
      playerEvents.push(...ruleEffects.domainEvents);
      insertion = ruleEffects.nextInsertionSequence;
    }
    const settledDomainEvents: DomainEvent[] = [...playerEvents];
    playerEntry.structuredPayload = json({ calls: playerDraft.calls, domainEvents: playerEvents });
    entries.push(playerEntry);

    for (const draft of agents) {
      const techniqueEvents = nonCombatTechniqueEvents(state, draft.actor, draft.calls, draft.domainEvents);
      const progressedEvents = deriveProgressionEvents(state, draft.actor, draft.calls, techniqueEvents);
      const text = await gateway.narrative('narration', narrationPrompt({
        source: 'cultivator', viewpointName: draft.actor.name,
        settledFacts: records([{ actorId: draft.actor.id, calls: draft.calls, domainEvents: combat ? [] : progressedEvents }]),
        causes: records([playerEntry]), visibleState: visibleContext(state, draft.actor, decision).visibleWorld,
      }), { gameId: state.id, source: 'cultivator', actorId: draft.actor.id, requestType: 'NarrationRequest' });
      const entryId = randomUUID();
      const domainEvents = combat ? [] : this.#schedulePlans(progressedEvents, draft.actor, state, entryId, () => insertion++);
      if (!combat) {
        const ruleEffects = rulesForDomainEvents(state, draft.actor.id, domainEvents, {
          participantIds: decision.participantIds,
          day: state.world.day,
          locationId: draft.actor.locationId,
          causeIds: [entryId],
          nextInsertionSequence: insertion,
        });
        domainEvents.push(...ruleEffects.domainEvents);
        insertion = ruleEffects.nextInsertionSequence;
      }
      settledDomainEvents.push(...domainEvents);
      entries.push({
        id: entryId,
        day: state.world.day, phase: 'agent', sequence: state.sequence + entries.length + 1, source: 'cultivator', kind: combat ? 'combat' : 'action',
        actorIds: [draft.actor.id], causeIds: [playerEntry.id], visibility: ['public'], text,
        structuredPayload: json({ calls: draft.calls, domainEvents }),
        cost: { sense: draft.senseCost, qi: 0 },
      });
    }
    if (!combat) {
      const mortality = globalMortalityEvents(state, settledDomainEvents);
      const milestone = [...progressedPlayerEvents.filter(({ type }) => type === 'realm.change' || type === 'ending'), ...mortality];
      if (milestone.length > 0) {
        const text = await gateway.narrative('narration', narrationPrompt({
          source: 'cultivator', viewpointName: player.name, settledFacts: records(milestone), causes: records([playerEntry]),
          visibleState: visibleContext(state, player, decision).visibleWorld,
        }), { gameId: state.id, source: 'cultivator', actorId: player.id, requestType: 'MilestoneNarration' });
        entries.push(makeEntry({
          day: state.world.day, phase: 'resolve', sequence: state.sequence + entries.length + 1, source: 'cultivator',
          kind: milestone.some(({ type }) => type === 'realm.change') ? 'breakthrough' : 'action', actorIds: [player.id],
          causeIds: entries.map(({ id }) => id), visibility: ['public'], text, structuredPayload: json({ facts: milestone, domainEvents: mortality }),
          cost: { sense: 0, qi: 0 },
        }));
      }
      return entries;
    }

    const participantIds = [...new Set(decision.participantIds)];
    const drafts = [playerDraft, ...agents].filter(({ actor }) => participantIds.includes(actor.id));
    const intents: BattleIntent[] = [];
    for (const draft of drafts) {
      const call = draft.calls.find((candidate): candidate is BattleIntent['call'] => ['guard', 'move', 'useTechnique'].includes(candidate.name));
      if (!call) throw new AppError('COMBAT_INTENT_MISSING', `${draft.actor.name}未提交战斗意图`, 422);
      intents.push({ actorId: draft.actor.id, actionIndex: 0, call });
    }
    for (const id of participantIds) if (!intents.some(({ actorId }) => actorId === id)) {
      throw new AppError('COMBAT_INTENT_MISSING', `参战者 ${id} 未提交意图`, 422);
    }
    const result = resolveBattle({
      battleSeed: `${state.randomSeed}:${decision.id}`,
      round: Number(decision.payload && typeof decision.payload === 'object' && 'round' in decision.payload ? decision.payload.round : 1),
      participantIds, world: state.world, intents, rules: state.rules,
      environmentTags: state.world.locations[decision.locationId ?? '']?.tags ?? [],
    });
    const domainEvents = participantIds.flatMap((id) => eventDomainDiff(state.world.cultivators[id]!, result.cultivators[id]!));
    const battleRuleEffects = rulesForBattleFacts(
      state,
      result.facts,
      Object.fromEntries(participantIds.map((id) => [id, result.cultivators[id]!.stats.hp])),
      {
        participantIds,
        day: state.world.day,
        locationId: decision.locationId,
        causeIds: entries.map(({ id }) => id),
        nextInsertionSequence: insertion,
      },
    );
    domainEvents.push(...battleRuleEffects.domainEvents);
    domainEvents.push(...globalMortalityEvents(state, domainEvents));
    const text = await gateway.narrative('narration', narrationPrompt({
      source: 'cultivator', viewpointName: player.name, settledFacts: records(result.facts), causes: records(entries), visibleState: record({ defeatedIds: result.defeatedIds }),
    }), { gameId: state.id, source: 'cultivator', actorId: player.id, requestType: 'BattleNarration' });
    entries.push(makeEntry({
      day: state.world.day, phase: 'resolve', sequence: state.sequence + entries.length + 1, source: 'cultivator', kind: 'combat',
      actorIds: participantIds, causeIds: entries.map(({ id }) => id), visibility: ['public'], text,
      structuredPayload: json({ facts: result.facts, stateHash: result.stateHash, domainEvents }), cost: { sense: 0, qi: 0 },
    }));
    return entries;
  }

  #schedulePlans(
    domainEvents: readonly DomainEvent[],
    actor: Cultivator,
    state: GameState,
    causeEntryId: string,
    nextInsertion: () => number,
  ): DomainEvent[] {
    const scheduled: DomainEvent[] = [...domainEvents];
    for (const event of domainEvents) {
      if (event.type !== 'plan.set') continue;
      scheduled.push({
        type: 'queue.schedule',
        event: {
          id: randomUUID(), day: event.dueDay, priority: 5, insertionSequence: nextInsertion(),
          type: actor.isPlayer ? 'decision' : 'agent_plan', participantIds: [actor.id], locationId: actor.locationId,
          perceptionRadius: actor.perceptionRange, causeIds: [causeEntryId], payload: json({ plan: event.goal }),
        },
      });
    }
    return scheduled;
  }

  #publishResolved(gameId: string, entries: readonly ChronicleEntry[]): void {
    for (const entry of entries) this.events.publish(gameId, {
      type: 'entry.resolved', callId: `entry:${entry.id}`, source: entry.source, actorId: entry.actorIds[0] ?? null,
      sequence: this.events.nextSequence(gameId), entry,
    });
  }

  #publishPaused(gameId: string, error: unknown, source: 'heaven' | 'fate' | 'player' | 'cultivator', actorId: string | null): void {
    const app = error instanceof AppError ? error : new AppError('INTERNAL_ERROR', error instanceof Error ? error.message : '未知错误', 500);
    this.events.publish(gameId, {
      type: 'game.paused', callId: randomUUID(), source, actorId,
      sequence: this.events.nextSequence(gameId), code: app.code, reason: app.message,
    });
  }
}
