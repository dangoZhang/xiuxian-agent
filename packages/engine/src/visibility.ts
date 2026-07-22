import type { ChronicleEntry, Cultivator, GameState, Location, PrivateMemory } from '@xiuxian/protocol';

export interface VisibleCultivator {
  id: string;
  name: string;
  isPlayer: boolean;
  locationId: string;
  sectId: string | null;
  publicDescription: string;
  stats: Cultivator['stats'];
  techniques: Cultivator['techniques'];
  relations: Cultivator['relations'];
  personality?: string[];
  hiddenGoals?: string[];
  plan?: Cultivator['plan'];
}

export interface CultivatorView {
  self: VisibleCultivator;
  locations: Record<string, Location>;
  cultivators: Record<string, VisibleCultivator>;
  chronicle: ChronicleEntry[];
  memories: PrivateMemory[];
}

function locationIdsInRange(state: GameState, start: string, range: number): Set<string> {
  const visible = new Set([start]);
  let frontier = [start];
  for (let distance = 0; distance < range && frontier.length > 0; distance += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const adjacent of state.world.locations[id]?.adjacentIds ?? []) {
        if (!visible.has(adjacent)) { visible.add(adjacent); next.push(adjacent); }
      }
    }
    frontier = next;
  }
  return visible;
}

function visibleCultivator(cultivator: Cultivator, self: boolean): VisibleCultivator {
  const common: VisibleCultivator = {
    id: cultivator.id,
    name: cultivator.name,
    isPlayer: cultivator.isPlayer,
    locationId: cultivator.locationId,
    sectId: cultivator.sectId,
    publicDescription: cultivator.publicDescription,
    stats: structuredClone(cultivator.stats),
    techniques: structuredClone(cultivator.techniques),
    relations: self ? structuredClone(cultivator.relations) : cultivator.relations.filter(({ affinity }) => affinity >= 0).map((relation) => structuredClone(relation)),
  };
  if (self) {
    common.personality = [...cultivator.personality];
    common.hiddenGoals = [...cultivator.hiddenGoals];
    common.plan = structuredClone(cultivator.plan);
  }
  return common;
}

/** Produces the only state shape suitable for a cultivator model prompt. */
export function projectCultivatorView(state: GameState, actorId: string): CultivatorView {
  const actor = state.world.cultivators[actorId];
  if (!actor) throw new Error(`Unknown cultivator ${actorId}`);
  const visibleLocations = locationIdsInRange(state, actor.locationId, actor.perceptionRange);
  const locations = Object.fromEntries([...visibleLocations].sort().flatMap((id) => {
    const location = state.world.locations[id];
    return location ? [[id, structuredClone(location)] as const] : [];
  }));
  const cultivators = Object.fromEntries(Object.values(state.world.cultivators)
    .filter((cultivator) => cultivator.id === actorId || visibleLocations.has(cultivator.locationId))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((cultivator) => [cultivator.id, visibleCultivator(cultivator, cultivator.id === actorId)]));
  const chronicle = state.chronicle
    .filter((entry) => entry.visibility.includes(actorId) || entry.visibility.includes('*'))
    .slice(-actor.memoryDepth)
    .map((entry) => structuredClone(entry));
  const memories = state.privateMemories
    .filter((memory) => memory.cultivatorId === actorId)
    .slice(-actor.memoryDepth)
    .map((memory) => structuredClone(memory));
  return { self: cultivators[actorId]!, locations, cultivators, chronicle, memories };
}
