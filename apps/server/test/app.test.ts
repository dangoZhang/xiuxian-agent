import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { ServerConfig } from '../src/config.js';
import { GameService } from '../src/game-service.js';
import { gameState } from './fixtures.js';

const config: ServerConfig = {
  port: 8787,
  hostname: '127.0.0.1',
  databasePath: ':memory:',
  modelTimeoutMs: 2_000,
  sessionTtlMs: 60_000,
  maxAgentConcurrency: 2,
  webDistPath: 'unused',
  isProduction: false,
};

function postGame(app: ReturnType<typeof createApp>['app'], body: unknown) {
  return app.request('/api/games', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/games', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates a game from sessionId alone', async () => {
    const create = vi.spyOn(GameService.prototype, 'create').mockResolvedValue(gameState());
    const instance = createApp({ config });

    const response = await postGame(instance.app, { sessionId: 'session' });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ game: { id: 'game' } });
    expect(create).toHaveBeenCalledWith('session');
    instance.repository.close();
  });

  it.each([
    ['origin', { sessionId: 'session', origin: '旧身世' }],
    ['background', { sessionId: 'session', background: '旧背景' }],
  ])('accepts the legacy %s field', async (_field, body) => {
    const create = vi.spyOn(GameService.prototype, 'create').mockResolvedValue(gameState());
    const instance = createApp({ config });

    const response = await postGame(instance.app, body);

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith('session');
    instance.repository.close();
  });

  it('rejects a request without sessionId', async () => {
    const create = vi.spyOn(GameService.prototype, 'create').mockResolvedValue(gameState());
    const instance = createApp({ config });

    const response = await postGame(instance.app, { origin: '旧身世' });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'SAVE_SCHEMA_INVALID' });
    expect(create).not.toHaveBeenCalled();
    instance.repository.close();
  });
});
