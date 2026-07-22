import { createHash } from 'node:crypto';
import type { Cultivator, HeavenRuleSet, ToolCall, WorldState } from '@xiuxian/protocol';
import { compileRuleSet, type CompiledRuleSet } from './rules.js';
import { canonicalJson } from './state.js';

export interface BattleIntent {
  actorId: string;
  actionIndex: number;
  call: Extract<ToolCall, { name: 'guard' | 'move' | 'useTechnique' }>;
}

export interface BattleInput {
  battleSeed: string;
  round: number;
  participantIds: string[];
  world: WorldState;
  intents: BattleIntent[];
  rules?: HeavenRuleSet | CompiledRuleSet;
  environmentTags?: string[];
}

export interface BattleFact {
  id: string;
  phase: 'defense' | 'movement' | 'attack' | 'status';
  actorId: string;
  targetId: string;
  success: boolean;
  amount: number;
  text: string;
}

export interface BattleResult {
  round: number;
  cultivators: Record<string, Cultivator>;
  facts: BattleFact[];
  defeatedIds: string[];
  stateHash: string;
}

type GuardIntent = BattleIntent & { call: Extract<ToolCall, { name: 'guard' }> };
type MoveIntent = BattleIntent & { call: Extract<ToolCall, { name: 'move' }> };
type TechniqueIntent = BattleIntent & { call: Extract<ToolCall, { name: 'useTechnique' }> };

const isGuardIntent = (intent: BattleIntent): intent is GuardIntent => intent.call.name === 'guard';
const isMoveIntent = (intent: BattleIntent): intent is MoveIntent => intent.call.name === 'move';
const isTechniqueIntent = (intent: BattleIntent): intent is TechniqueIntent => intent.call.name === 'useTechnique';

export function hashRandom(...parts: Array<string | number>): number {
  const digest = createHash('sha256').update(parts.join('\u001f')).digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}

const realmFactor = { 炼气: 1, 筑基: 1.45, 金丹: 2.1 } as const;

function sortedIntents(intents: readonly BattleIntent[], cultivators: Readonly<Record<string, Cultivator>>): BattleIntent[] {
  return [...intents].sort((left, right) =>
    (cultivators[right.actorId]?.stats.speed ?? -Infinity) - (cultivators[left.actorId]?.stats.speed ?? -Infinity)
    || left.actorId.localeCompare(right.actorId)
    || left.actionIndex - right.actionIndex,
  );
}

function toRules(rules: BattleInput['rules']): CompiledRuleSet | undefined {
  if (!rules) return undefined;
  return 'applyModifiers' in rules ? rules : compileRuleSet(rules);
}

/** Resolves from a frozen round snapshot. Randomness is keyed, never consumed sequentially. */
export function resolveBattle(input: BattleInput): BattleResult {
  if (!Number.isInteger(input.round) || input.round < 1) throw new RangeError('round must be positive');
  const participantIds = [...new Set(input.participantIds)].sort();
  const frozen = Object.fromEntries(participantIds.map((id) => {
    const cultivator = input.world.cultivators[id];
    if (!cultivator) throw new Error(`Unknown combat participant ${id}`);
    return [id, structuredClone(cultivator)];
  }));
  const aliveIds = participantIds.filter((id) => frozen[id]!.stats.hp > 0);
  const intentKeys = new Set<string>();
  for (const intent of input.intents) {
    if (!frozen[intent.actorId]) throw new Error(`Intent actor ${intent.actorId} is not a participant`);
    const key = `${intent.actorId}:${intent.actionIndex}`;
    if (intentKeys.has(key)) throw new Error(`Duplicate combat action ${key}`);
    intentKeys.add(key);
  }
  const missing = aliveIds.filter((id) => !input.intents.some(({ actorId }) => actorId === id));
  if (missing.length > 0) throw new Error(`COMBAT_INTENT_MISSING: ${missing.join(', ')}`);
  const output = structuredClone(frozen);
  const rules = toRules(input.rules);
  const facts: BattleFact[] = [];
  const shields = new Map<string, number>();
  const escaped = new Set<string>();
  const qiSpent = new Map<string, number>();
  const damage = new Map<string, number>();
  const statuses = new Map<string, Set<string>>();
  const intents = sortedIntents(input.intents, frozen);

  for (const intent of intents.filter(isGuardIntent)) {
    const actor = frozen[intent.actorId];
    const targetId = intent.call.arguments.target;
    if (!actor || actor.stats.hp <= 0 || !frozen[targetId] || actor.locationId !== frozen[targetId]?.locationId) continue;
    shields.set(targetId, Math.min(0.75, (shields.get(targetId) ?? 0) + 0.35));
    facts.push({ id: `guard:${intent.actorId}:${intent.actionIndex}`, phase: 'defense', actorId: intent.actorId, targetId, success: true, amount: 0.35, text: `${actor.name}护住${frozen[targetId]?.name ?? targetId}` });
  }

  for (const intent of intents.filter(isMoveIntent)) {
    const actor = frozen[intent.actorId];
    if (!actor || actor.stats.hp <= 0) continue;
    const destination = intent.call.arguments.destination;
    const adjacent = input.world.locations[actor.locationId]?.adjacentIds.includes(destination) ?? false;
    const opponents = participantIds.map((id) => frozen[id]).filter((candidate): candidate is Cultivator => Boolean(candidate && candidate.id !== actor.id && candidate.stats.hp > 0));
    const fastestOpponent = Math.max(0, ...opponents.map(({ stats }) => stats.speed));
    const probability = Math.max(0.1, Math.min(0.9, 0.5 + (actor.stats.speed - fastestOpponent) / 100));
    const success = adjacent && !actor.stats.statuses.includes('禁锢') && hashRandom(input.battleSeed, input.round, actor.id, intent.actionIndex, 'retreat') < probability;
    if (success) { output[actor.id]!.locationId = destination; escaped.add(actor.id); }
    facts.push({ id: `move:${actor.id}:${intent.actionIndex}`, phase: 'movement', actorId: actor.id, targetId: destination, success, amount: 0, text: success ? `${actor.name}脱离战场` : `${actor.name}退路受阻` });
  }

  for (const intent of intents.filter(isTechniqueIntent)) {
    const actor = frozen[intent.actorId];
    if (!actor || actor.stats.hp <= 0 || escaped.has(actor.id)) continue;
    const technique = actor.techniques.find(({ name }) => name === intent.call.arguments.name);
    if (!technique) continue;
    const alreadySpent = qiSpent.get(actor.id) ?? 0;
    if (alreadySpent + technique.qiCost > actor.stats.qi) {
      facts.push({ id: `attack:${actor.id}:${intent.actionIndex}`, phase: 'attack', actorId: actor.id, targetId: intent.call.arguments.target, success: false, amount: 0, text: `${actor.name}灵力不足` });
      continue;
    }
    qiSpent.set(actor.id, alreadySpent + technique.qiCost);
    const targetIds = technique.target === 'area'
      ? participantIds.filter((id) => id !== actor.id)
      : [technique.target === 'self' ? actor.id : intent.call.arguments.target];

    for (const targetId of targetIds.sort()) {
      const target = frozen[targetId];
      if (!target || target.stats.hp <= 0 || escaped.has(targetId) || actor.locationId !== target.locationId && technique.target !== 'self') continue;
      for (const effect of [...technique.effects].sort((a, b) => a.id.localeCompare(b.id))) {
        const roll = hashRandom(input.battleSeed, input.round, actor.id, intent.actionIndex, effect.id, targetId);
        const success = roll < effect.chance;
        if (effect.type === 'damage' && success) {
          const counter = technique.counters.some((tag) => target.stats.statuses.includes(tag)) ? 1.25 : 1;
          const variance = 0.85 + hashRandom(input.battleSeed, input.round, actor.id, intent.actionIndex, effect.id, targetId, 'damage') * 0.3;
          const base = (technique.power + effect.value) * realmFactor[actor.stats.realm] * counter * variance;
          const modified = rules?.applyModifiers('damage', base, [...technique.tags, ...(input.environmentTags ?? [])]) ?? base;
          const amount = Math.max(0, Math.round(modified * (1 - (shields.get(targetId) ?? 0))));
          damage.set(targetId, (damage.get(targetId) ?? 0) + amount);
          facts.push({ id: `attack:${actor.id}:${intent.actionIndex}:${effect.id}:${targetId}`, phase: 'attack', actorId: actor.id, targetId, success: true, amount, text: `${technique.name}造成${amount}点伤害` });
        } else if (effect.type === 'heal' && success) {
          const amount = Math.max(0, Math.round(rules?.applyModifiers('healing', effect.value, technique.tags) ?? effect.value));
          damage.set(targetId, (damage.get(targetId) ?? 0) - amount);
          facts.push({ id: `heal:${actor.id}:${intent.actionIndex}:${effect.id}:${targetId}`, phase: 'attack', actorId: actor.id, targetId, success: true, amount, text: `${technique.name}恢复${amount}点气血` });
        } else if (effect.type === 'status' && success && effect.status) {
          const targetStatuses = statuses.get(targetId) ?? new Set<string>();
          targetStatuses.add(effect.status);
          statuses.set(targetId, targetStatuses);
          facts.push({ id: `status:${actor.id}:${intent.actionIndex}:${effect.id}:${targetId}`, phase: 'status', actorId: actor.id, targetId, success: true, amount: 0, text: `${target.name}陷入${effect.status}` });
        } else if (!success) {
          facts.push({ id: `miss:${actor.id}:${intent.actionIndex}:${effect.id}:${targetId}`, phase: 'attack', actorId: actor.id, targetId, success: false, amount: 0, text: `${technique.name}未能奏效` });
        }
      }
    }
  }

  for (const id of participantIds) {
    const cultivator = output[id]!;
    cultivator.stats.qi = Math.max(0, cultivator.stats.qi - (qiSpent.get(id) ?? 0));
    cultivator.stats.hp = Math.max(0, Math.min(cultivator.stats.hpMax, cultivator.stats.hp - (damage.get(id) ?? 0)));
    for (const status of statuses.get(id) ?? []) if (!cultivator.stats.statuses.includes(status)) cultivator.stats.statuses.push(status);
    if (cultivator.stats.hp <= 0 && cultivator.stats.statuses.includes('护命')) {
      cultivator.stats.hp = 1;
      cultivator.stats.statuses = cultivator.stats.statuses.filter((status) => status !== '护命');
      facts.push({ id: `lifesave:${id}`, phase: 'status', actorId: id, targetId: id, success: true, amount: 1, text: `${cultivator.name}的护命之力保住一线生机` });
    }
    cultivator.stats.statuses.sort();
  }

  facts.sort((a, b) => {
    const phases = { defense: 0, movement: 1, attack: 2, status: 3 };
    return phases[a.phase] - phases[b.phase] || a.id.localeCompare(b.id);
  });
  const defeatedIds = participantIds.filter((id) => output[id]!.stats.hp <= 0);
  const stateHash = createHash('sha256').update(canonicalJson({ cultivators: output, defeatedIds, round: input.round })).digest('hex');
  return { round: input.round, cultivators: output, facts, defeatedIds, stateHash };
}
