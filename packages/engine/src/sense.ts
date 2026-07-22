export interface SenseWindow {
  actorId: string;
  senseMax: number;
  remaining: number;
  focusSlots: number;
  focusInUse: number;
}

interface Snapshot { remaining: number; focusInUse: number }

export class SenseLedger {
  readonly #windows = new Map<string, SenseWindow>();
  readonly #transactions = new Map<string, Map<string, Snapshot>>();

  openWindow(actorId: string, senseMax: number, focusSlots: number): SenseWindow {
    if (!Number.isInteger(senseMax) || senseMax < 1 || !Number.isInteger(focusSlots) || focusSlots < 1) {
      throw new RangeError('senseMax and focusSlots must be positive integers');
    }
    const window = { actorId, senseMax, remaining: senseMax, focusSlots, focusInUse: 0 };
    this.#windows.set(actorId, window);
    return { ...window };
  }

  get(actorId: string): SenseWindow {
    const window = this.#windows.get(actorId);
    if (!window) throw new Error(`No open sense window for ${actorId}`);
    return { ...window };
  }

  begin(transactionId: string): void {
    if (this.#transactions.has(transactionId)) throw new Error(`Duplicate transaction ${transactionId}`);
    this.#transactions.set(transactionId, new Map());
  }

  reservePlanning(actorId: string, transactionId?: string): boolean {
    const window = this.#require(actorId);
    if (window.remaining < 1 || window.focusInUse >= window.focusSlots) return false;
    this.#capture(transactionId, actorId, window);
    window.remaining -= 1;
    window.focusInUse += 1;
    return true;
  }

  finishPlanning(actorId: string): void {
    const window = this.#require(actorId);
    if (window.focusInUse < 1) throw new Error(`No planning slot held by ${actorId}`);
    window.focusInUse -= 1;
  }

  spend(actorId: string, cost: number, transactionId?: string): boolean {
    if (!Number.isInteger(cost) || cost < 0) throw new RangeError('cost must be a non-negative integer');
    const window = this.#require(actorId);
    if (window.remaining < cost) return false;
    this.#capture(transactionId, actorId, window);
    window.remaining -= cost;
    return true;
  }

  commit(transactionId: string): void {
    if (!this.#transactions.delete(transactionId)) throw new Error(`Unknown transaction ${transactionId}`);
  }

  rollback(transactionId: string): void {
    const snapshots = this.#transactions.get(transactionId);
    if (!snapshots) throw new Error(`Unknown transaction ${transactionId}`);
    for (const [actorId, snapshot] of snapshots) {
      const window = this.#require(actorId);
      window.remaining = snapshot.remaining;
      window.focusInUse = snapshot.focusInUse;
    }
    this.#transactions.delete(transactionId);
  }

  #require(actorId: string): SenseWindow {
    const window = this.#windows.get(actorId);
    if (!window) throw new Error(`No open sense window for ${actorId}`);
    return window;
  }

  #capture(transactionId: string | undefined, actorId: string, window: SenseWindow): void {
    if (!transactionId) return;
    const transaction = this.#transactions.get(transactionId);
    if (!transaction) throw new Error(`Unknown transaction ${transactionId}`);
    if (!transaction.has(actorId)) transaction.set(actorId, { remaining: window.remaining, focusInUse: window.focusInUse });
  }
}

interface Waiter {
  weight: number;
  resolve: (release: () => void) => void;
}

/** FIFO weighted semaphore; queued work cannot exceed global model concurrency. */
export class WeightedSemaphore {
  readonly capacity: number;
  #available: number;
  readonly #queue: Waiter[] = [];

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
    this.capacity = capacity;
    this.#available = capacity;
  }

  get available(): number { return this.#available; }
  get pending(): number { return this.#queue.length; }

  acquire(weight = 1): Promise<() => void> {
    if (!Number.isInteger(weight) || weight < 1 || weight > this.capacity) {
      return Promise.reject(new RangeError(`weight must be between 1 and ${this.capacity}`));
    }
    return new Promise((resolve) => {
      this.#queue.push({ weight, resolve });
      this.#drain();
    });
  }

  async run<T>(task: () => Promise<T> | T, weight = 1): Promise<T> {
    const release = await this.acquire(weight);
    try { return await task(); } finally { release(); }
  }

  #drain(): void {
    const waiter = this.#queue[0];
    if (!waiter || waiter.weight > this.#available) return;
    this.#queue.shift();
    this.#available -= waiter.weight;
    let released = false;
    waiter.resolve(() => {
      if (released) return;
      released = true;
      this.#available += waiter.weight;
      this.#drain();
    });
    this.#drain();
  }
}
