import type { QueueEvent } from '@xiuxian/protocol';
import { createEventQueue, StablePriorityQueue } from './priority-queue.js';

export type AdvanceStopReason = 'awaiting_player' | 'game_ended' | 'model_error' | 'microstep_limit' | 'queue_empty';

export interface AdvanceStepResult {
  scheduled?: QueueEvent[];
  stop?: Exclude<AdvanceStopReason, 'microstep_limit' | 'queue_empty'>;
}

export interface AdvanceResult {
  day: number;
  microsteps: number;
  processed: QueueEvent[];
  remaining: QueueEvent[];
  reason: AdvanceStopReason;
}

/** Advances directly to due events; it never manufactures empty-day ticks. */
export async function advanceOnDemand(
  events: Iterable<QueueEvent> | StablePriorityQueue<QueueEvent>,
  handle: (event: QueueEvent, microstep: number) => Promise<AdvanceStepResult> | AdvanceStepResult,
  maxMicrosteps = 32,
): Promise<AdvanceResult> {
  if (!Number.isInteger(maxMicrosteps) || maxMicrosteps < 1) throw new RangeError('maxMicrosteps must be a positive integer');
  const queue = events instanceof StablePriorityQueue ? events : createEventQueue(events);
  const processed: QueueEvent[] = [];
  let day = queue.peek()?.day ?? 0;

  while (processed.length < maxMicrosteps) {
    const event = queue.pop();
    if (!event) return { day, microsteps: processed.length, processed, remaining: [], reason: 'queue_empty' };
    day = event.day;
    processed.push(event);
    const result = await handle(event, processed.length);
    for (const scheduled of result.scheduled ?? []) queue.push(scheduled);
    if (result.stop) {
      return { day, microsteps: processed.length, processed, remaining: queue.toSortedArray(), reason: result.stop };
    }
  }

  return { day, microsteps: processed.length, processed, remaining: queue.toSortedArray(), reason: 'microstep_limit' };
}
