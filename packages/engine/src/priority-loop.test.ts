import { describe, expect, it } from 'vitest';
import { advanceOnDemand } from './loop.js';
import { createEventQueue } from './priority-queue.js';
import { queueEvent } from './test-fixtures.js';

describe('stable event queue', () => {
  it('sorts by day, priority and stable insertion sequence', () => {
    const queue = createEventQueue([
      queueEvent({ id: 'late', day: 10, insertionSequence: 3 }),
      queueEvent({ id: 'second', priority: 1, insertionSequence: 2 }),
      queueEvent({ id: 'first', priority: 1, insertionSequence: 1 }),
      queueEvent({ id: 'urgent', priority: -1, insertionSequence: 4 }),
    ]);
    expect(queue.toSortedArray().map(({ id }) => id)).toEqual(['urgent', 'first', 'second', 'late']);
  });

  it('jumps directly to day 10 without empty day events', async () => {
    const result = await advanceOnDemand([queueEvent({ id: 'day-10', day: 10 })], () => ({}));
    expect(result.day).toBe(10);
    expect(result.processed.map(({ id }) => id)).toEqual(['day-10']);
  });

  it('stops runaway causal chains after 32 microsteps', async () => {
    let sequence = 1;
    const result = await advanceOnDemand([queueEvent()], (event) => ({
      scheduled: [queueEvent({ id: `event-${sequence}`, insertionSequence: sequence++ })],
    }));
    expect(result.reason).toBe('microstep_limit');
    expect(result.microsteps).toBe(32);
    expect(result.remaining).toHaveLength(1);
  });
});
