import { extname, resolve, sep } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { z, ZodError } from 'zod';
import { createGameRequestSchema, modelConfigSchema } from '@xiuxian/protocol';
import type { ServerConfig } from './config.js';
import { AppError, errorBody, statusOf } from './errors.js';
import { encodeSse, GameEventBus } from './events.js';
import { GameService } from './game-service.js';
import { testModelConfig } from './model/gateway.js';
import { GameRepository } from './repository.js';
import { SessionStore } from './session-store.js';

const modelBodySchema = z.object({
  config: modelConfigSchema.optional(),
  modelConfig: modelConfigSchema.optional(),
}).superRefine((value, context) => {
  if (!value.config && !value.modelConfig) context.addIssue({ code: 'custom', message: 'modelConfig is required' });
});
const commandSchema = z.object({
  text: z.string().min(1).max(8000).optional(),
  rawText: z.string().min(1).max(8000).optional(),
  revision: z.number().int().nonnegative().optional(),
}).superRefine((value, context) => {
  if (!value.text && !value.rawText) context.addIssue({ code: 'custom', message: 'text is required' });
});
const advanceSchema = z.object({ revision: z.number().int().nonnegative().optional() });
const importSchema = z.object({ sessionId: z.string().min(1), save: z.unknown() });
const rebindSchema = z.object({
  sessionId: z.string().min(1).optional(),
  config: modelConfigSchema.optional(),
  modelConfig: modelConfigSchema.optional(),
}).superRefine((value, context) => {
  if (!value.sessionId && !value.config && !value.modelConfig) context.addIssue({ code: 'custom', message: 'sessionId or modelConfig is required' });
});

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

export interface AppDependencies {
  readonly config: ServerConfig;
  readonly repository?: GameRepository;
  readonly sessions?: SessionStore;
  readonly events?: GameEventBus;
}

export function createApp(dependencies: AppDependencies) {
  const { config } = dependencies;
  const repository = dependencies.repository ?? new GameRepository(config.databasePath);
  const sessions = dependencies.sessions ?? new SessionStore(config.sessionTtlMs);
  const events = dependencies.events ?? new GameEventBus();
  const games = new GameService(repository, sessions, events, config.modelTimeoutMs, config.maxAgentConcurrency);
  const app = new Hono();

  app.get('/api/health', (context) => context.json({ ok: true, service: '修仙agent' }));

  app.post('/api/model/test', async (context) => {
    const body = modelBodySchema.parse(await context.req.json());
    const config = body.modelConfig ?? body.config;
    if (!config) throw new AppError('MODEL_CONFIG_MISSING', '缺少模型配置', 400);
    return context.json(await testModelConfig(config, dependencies.config.modelTimeoutMs));
  });

  app.post('/api/sessions', async (context) => {
    const body = modelBodySchema.parse(await context.req.json());
    const config = body.modelConfig ?? body.config;
    if (!config) throw new AppError('MODEL_CONFIG_MISSING', '缺少模型配置', 400);
    const tested = await testModelConfig(config, dependencies.config.modelTimeoutMs);
    if (!tested.ok) throw new AppError('MODEL_CAPABILITY_MISSING', `模型未通过能力校验：${tested.failures.join('、')}`, 422, tested);
    const session = sessions.create(config);
    return context.json({ ...session, sessionId: session.id, test: tested }, 201);
  });

  app.post('/api/games', async (context) => {
    const body = createGameRequestSchema.parse(await context.req.json());
    const game = await games.create(body.sessionId);
    return context.json({ game }, 201);
  });

  app.get('/api/games/:id', (context) => context.json({ game: games.get(context.req.param('id')) }));

  app.post('/api/games/:id/commands', async (context) => {
    const body = commandSchema.parse(await context.req.json());
    const game = await games.command(context.req.param('id'), body.rawText ?? body.text ?? '', body.revision);
    return context.json({ game });
  });

  app.post('/api/games/:id/advance', async (context) => {
    const raw = await context.req.json().catch(() => ({}));
    const body = advanceSchema.parse(raw);
    return context.json({ game: await games.advance(context.req.param('id'), body.revision) });
  });

  app.post('/api/games/:id/session', async (context) => {
    const body = rebindSchema.parse(await context.req.json());
    let sessionId = body.sessionId;
    let publicSession: ReturnType<SessionStore['create']> | undefined;
    const modelConfig = body.modelConfig ?? body.config;
    if (modelConfig) {
      const tested = await testModelConfig(modelConfig, dependencies.config.modelTimeoutMs);
      if (!tested.ok) throw new AppError('MODEL_CAPABILITY_MISSING', `模型未通过能力校验：${tested.failures.join('、')}`, 422, tested);
      publicSession = sessions.create(modelConfig);
      sessionId = publicSession.id;
    }
    if (!sessionId) throw new AppError('MODEL_CONFIG_MISSING', '缺少可用模型会话', 400);
    const game = games.rebind(context.req.param('id'), sessionId);
    return context.json({ game, sessionId, ...(publicSession ? { session: publicSession } : {}) });
  });

  app.get('/api/games/:id/export', (context) => {
    const id = context.req.param('id');
    context.header('content-disposition', `attachment; filename="xiuxian-agent-${id}.json"`);
    return context.json(games.export(id));
  });

  app.post('/api/games/import', async (context) => {
    const body = importSchema.parse(await context.req.json());
    return context.json({ game: games.import(body.sessionId, body.save) }, 201);
  });

  app.get('/api/games/:id/events', (context) => {
    const gameId = context.req.param('id');
    games.get(gameId);
    let unsubscribe = () => {};
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(': connected\n\n'));
        unsubscribe = events.subscribe(gameId, (event) => controller.enqueue(encodeSse(event)));
        heartbeat = setInterval(() => controller.enqueue(new TextEncoder().encode(': heartbeat\n\n')), 15_000);
        const close = () => {
          unsubscribe();
          if (heartbeat) clearInterval(heartbeat);
          try { controller.close(); } catch { /* connection already closed */ }
        };
        context.req.raw.signal.addEventListener('abort', close, { once: true });
      },
      cancel() {
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  });

  app.notFound(async (context) => {
    if (!config.isProduction || context.req.path.startsWith('/api/')) return context.json({ code: 'NOT_FOUND', message: '接口不存在' }, 404);
    const root = resolve(config.webDistPath);
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(context.req.url).pathname); }
    catch { return context.text('Bad request', 400); }
    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const candidate = resolve(root, requested);
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return context.text('Forbidden', 403);
    try {
      const body = await readFile(candidate);
      return new Response(body, { headers: { 'content-type': MIME[extname(candidate)] ?? 'application/octet-stream' } });
    } catch {
      if (extname(requested)) return context.text('Not found', 404);
      try {
        const index = await readFile(resolve(root, 'index.html'));
        return new Response(index, { headers: { 'content-type': MIME['.html']! } });
      } catch { return context.text('Web build not found', 404); }
    }
  });

  app.onError((error, context) => {
    if (error instanceof ZodError) return context.json({ code: 'SAVE_SCHEMA_INVALID', message: '请求数据无效', details: error.issues }, 400);
    return context.json(errorBody(error), statusOf(error) as 400);
  });

  return { app, repository, sessions, events, games };
}
