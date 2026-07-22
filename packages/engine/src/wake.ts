import type { Cultivator, QueueEvent, WorldState } from '@xiuxian/protocol';

export type WakeReason = 'participant' | 'perception' | 'plan_due' | 'goal_conflict' | 'combat';
export interface AwakeCultivator { cultivator: Cultivator; reasons: WakeReason[] }

function locationDistance(world: WorldState, from: string, to: string): number {
  if (from === to) return 0;
  const visited = new Set([from]);
  let frontier = [from];
  for (let distance = 1; frontier.length > 0; distance += 1) {
    const next: string[] = [];
    for (const locationId of frontier) {
      for (const adjacent of world.locations[locationId]?.adjacentIds ?? []) {
        if (adjacent === to) return distance;
        if (!visited.has(adjacent)) { visited.add(adjacent); next.push(adjacent); }
      }
    }
    frontier = next;
  }
  return Number.POSITIVE_INFINITY;
}

export function selectAwakeCultivators(world: WorldState, event: QueueEvent): AwakeCultivator[] {
  const targets = new Set(event.participantIds);
  const payloadTargets = new Set(
    typeof event.payload === 'object' && event.payload !== null && 'targetIds' in event.payload && Array.isArray(event.payload.targetIds)
      ? event.payload.targetIds.filter((value): value is string => typeof value === 'string')
      : [],
  );

  return Object.values(world.cultivators)
    .filter((cultivator) => cultivator.stats.hp > 0)
    .map((cultivator): AwakeCultivator => {
      const reasons: WakeReason[] = [];
      if (targets.has(cultivator.id)) reasons.push('participant');
      if (event.type === 'combat' && targets.has(cultivator.id)) reasons.push('combat');
      if (cultivator.plan && cultivator.plan.dueDay <= event.day) reasons.push('plan_due');
      if (cultivator.plan?.targetIds.some((id) => targets.has(id) || payloadTargets.has(id))) reasons.push('goal_conflict');
      if (event.locationId !== null) {
        const distance = locationDistance(world, cultivator.locationId, event.locationId);
        const range = Math.min(cultivator.perceptionRange, event.perceptionRadius);
        if (distance <= range) reasons.push('perception');
      }
      return { cultivator, reasons: [...new Set(reasons)] };
    })
    .filter(({ reasons }) => reasons.length > 0)
    .sort((a, b) => a.cultivator.id.localeCompare(b.cultivator.id));
}
