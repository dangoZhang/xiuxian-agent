import { randomUUID } from 'node:crypto';
import { modelConfigSchema, type ModelConfig } from '@xiuxian/protocol';
import { AppError } from './errors.js';

interface ModelSession {
  readonly id: string;
  readonly config: ModelConfig;
  readonly createdAt: number;
  expiresAt: number;
}

export type PublicSession = Omit<ModelSession, 'config'> & {
  readonly models: {
    readonly default: string;
    readonly roles: Readonly<Record<string, string>>;
    readonly maxConcurrency: number;
  };
};

export class SessionStore {
  readonly #sessions = new Map<string, ModelSession>();
  constructor(private readonly ttlMs: number, private readonly now: () => number = Date.now) {}

  create(input: unknown): PublicSession {
    const config = modelConfigSchema.parse(input);
    const createdAt = this.now();
    const session: ModelSession = {
      id: randomUUID(), config, createdAt, expiresAt: createdAt + this.ttlMs,
    };
    this.#sessions.set(session.id, session);
    return this.#public(session);
  }

  get(id: string): ModelSession {
    this.sweep();
    const session = this.#sessions.get(id);
    if (!session) throw new AppError('MODEL_CONFIG_MISSING', '模型会话不存在或已过期', 401);
    session.expiresAt = this.now() + this.ttlMs;
    return session;
  }

  delete(id: string): void { this.#sessions.delete(id); }

  sweep(): void {
    const now = this.now();
    for (const [id, session] of this.#sessions) if (session.expiresAt <= now) this.#sessions.delete(id);
  }

  #public(session: ModelSession): PublicSession {
    const roles: Record<string, string> = {};
    for (const [role, endpoint] of Object.entries(session.config.roles)) {
      if (endpoint) roles[role] = endpoint.model;
    }
    return {
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      models: { default: session.config.default.model, roles, maxConcurrency: session.config.maxConcurrency },
    };
  }
}
