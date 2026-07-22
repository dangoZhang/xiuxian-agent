import type { QueueEvent } from '@xiuxian/protocol';

export type Comparator<T> = (left: T, right: T) => number;

export const compareQueueEvents: Comparator<QueueEvent> = (left, right) =>
  left.day - right.day
  || left.priority - right.priority
  || left.insertionSequence - right.insertionSequence;

/** Binary min-heap. A sequence tiebreaker makes queue event ordering stable. */
export class StablePriorityQueue<T> {
  readonly #items: T[] = [];
  readonly #compare: Comparator<T>;

  constructor(compare: Comparator<T>, initial: Iterable<T> = []) {
    this.#compare = compare;
    for (const item of initial) this.push(item);
  }

  get size(): number {
    return this.#items.length;
  }

  peek(): T | undefined {
    return this.#items[0];
  }

  push(item: T): void {
    this.#items.push(item);
    this.#bubbleUp(this.#items.length - 1);
  }

  pop(): T | undefined {
    const first = this.#items[0];
    const last = this.#items.pop();
    if (this.#items.length > 0 && last !== undefined) {
      this.#items[0] = last;
      this.#bubbleDown(0);
    }
    return first;
  }

  toSortedArray(): T[] {
    const copy = new StablePriorityQueue(this.#compare, this.#items);
    const result: T[] = [];
    while (copy.size > 0) result.push(copy.pop() as T);
    return result;
  }

  #bubbleUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const item = this.#items[index];
      const parentItem = this.#items[parent];
      if (item === undefined || parentItem === undefined || this.#compare(item, parentItem) >= 0) return;
      [this.#items[index], this.#items[parent]] = [parentItem, item];
      index = parent;
    }
  }

  #bubbleDown(start: number): void {
    let index = start;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      const smallestItem = this.#items[smallest];
      const leftItem = this.#items[left];
      const rightItem = this.#items[right];
      if (leftItem !== undefined && smallestItem !== undefined && this.#compare(leftItem, smallestItem) < 0) smallest = left;
      const nextSmallest = this.#items[smallest];
      if (rightItem !== undefined && nextSmallest !== undefined && this.#compare(rightItem, nextSmallest) < 0) smallest = right;
      if (smallest === index) return;
      const current = this.#items[index];
      const next = this.#items[smallest];
      if (current === undefined || next === undefined) return;
      [this.#items[index], this.#items[smallest]] = [next, current];
      index = smallest;
    }
  }
}

export const createEventQueue = (events: Iterable<QueueEvent> = []): StablePriorityQueue<QueueEvent> =>
  new StablePriorityQueue(compareQueueEvents, events);
