import type { SseEvent } from '@xiuxian/protocol';

type Listener = (event: SseEvent) => void;

export class GameEventBus {
  readonly #listeners = new Map<string, Set<Listener>>();
  readonly #sequences = new Map<string, number>();

  nextSequence(gameId: string): number {
    const sequence = (this.#sequences.get(gameId) ?? 0) + 1;
    this.#sequences.set(gameId, sequence);
    return sequence;
  }

  publish(gameId: string, event: SseEvent): void {
    this.#sequences.set(gameId, Math.max(this.#sequences.get(gameId) ?? 0, event.sequence));
    for (const listener of this.#listeners.get(gameId) ?? []) listener(event);
  }

  subscribe(gameId: string, listener: Listener): () => void {
    const listeners = this.#listeners.get(gameId) ?? new Set<Listener>();
    listeners.add(listener);
    this.#listeners.set(gameId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(gameId);
    };
  }
}

export function encodeSse(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}
