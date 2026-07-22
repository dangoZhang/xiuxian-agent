import { describe, expect, it } from 'vitest';
import { reduceChronicle } from '@xiuxian/engine';
import { GameRepository } from '../src/repository.js';
import { SessionStore } from '../src/session-store.js';
import { gameState } from './fixtures.js';

describe('persistence and secret boundaries', () => {
  it('atomically commits one revision and rejects stale commits without changing state', () => {
    const repository = new GameRepository(':memory:');
    const initial = gameState();
    repository.create(initial, 'session');
    const entry = {
      id: 'entry', day: 1, phase: 'player' as const, sequence: 1, source: 'player' as const, kind: 'action' as const,
      actorIds: ['player'], causeIds: [], visibility: ['public'], text: '我按剑而行。', structuredPayload: {}, cost: { sense: 1, qi: 0 },
    };
    const next = reduceChronicle(initial, [entry]);
    repository.commit(initial.id, 0, next, [entry]);
    expect(repository.get(initial.id).revision).toBe(1);
    expect(() => repository.commit(initial.id, 0, next, [])).toThrow();
    expect(repository.get(initial.id).chronicle).toHaveLength(1);
    repository.close();
  });

  it('returns only redacted session metadata while retaining the key in process memory', () => {
    const store = new SessionStore(10_000, () => 100);
    const created = store.create({
      default: { baseUrl: 'https://example.com/v1', apiKey: 'top-secret', model: 'model' },
      maxConcurrency: 2, roles: {},
    });
    expect(JSON.stringify(created)).not.toContain('top-secret');
    expect(store.get(created.id).config.default.apiKey).toBe('top-secret');
  });

  it('rebinds a persisted game to a new in-memory session id without storing model secrets', () => {
    const repository = new GameRepository(':memory:');
    repository.create(gameState(), 'expired-session');
    repository.bindSession('game', 'fresh-session');
    expect(repository.sessionIdFor('game')).toBe('fresh-session');
    expect(JSON.stringify(repository.get('game'))).not.toContain('apiKey');
    repository.close();
  });

  it('restores an exported state over the same game id and replaces later events atomically', () => {
    const repository = new GameRepository(':memory:');
    const initial = gameState();
    repository.create(initial, 'old-session');
    const entry = {
      id: 'later', day: 2, phase: 'fate' as const, sequence: 1, source: 'fate' as const, kind: 'event' as const,
      actorIds: ['player'], causeIds: [], visibility: ['public'], text: '后来之事', structuredPayload: {}, cost: { sense: 0, qi: 0 },
    };
    repository.commit('game', 0, reduceChronicle(initial, [entry]), [entry]);
    repository.restore(initial, 'new-session');
    expect(repository.get('game')).toMatchObject({ revision: 0, chronicle: [] });
    expect(repository.sessionIdFor('game')).toBe('new-session');
    repository.close();
  });
});
