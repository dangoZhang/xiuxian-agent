import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { app } = createApp({ config });

serve({ fetch: app.fetch, port: config.port, hostname: config.hostname }, (info) => {
  process.stdout.write(`修仙agent server listening on http://${config.hostname}:${info.port}\n`);
});

export { createApp } from './app.js';
export { GameService } from './game-service.js';
export { GameRepository } from './repository.js';
export { SessionStore } from './session-store.js';
export { GameEventBus } from './events.js';
export { testModelConfig, testModelEndpoint, ModelGateway } from './model/gateway.js';
