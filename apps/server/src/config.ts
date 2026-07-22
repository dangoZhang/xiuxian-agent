import { resolve } from 'node:path';

function integerEnv(name: string, fallback: number, minimum = 1): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return value;
}

export interface ServerConfig {
  readonly port: number;
  readonly hostname: string;
  readonly databasePath: string;
  readonly modelTimeoutMs: number;
  readonly sessionTtlMs: number;
  readonly maxAgentConcurrency: number;
  readonly webDistPath: string;
  readonly isProduction: boolean;
}

export function loadConfig(): ServerConfig {
  return {
    port: integerEnv('PORT', 8787),
    hostname: process.env.HOST?.trim() || '127.0.0.1',
    databasePath: process.env.DATABASE_PATH ?? resolve(process.cwd(), 'data/xiuxian.sqlite'),
    modelTimeoutMs: integerEnv('MODEL_TIMEOUT_MS', 60_000),
    sessionTtlMs: integerEnv('SESSION_TTL_MS', 12 * 60 * 60 * 1000),
    maxAgentConcurrency: integerEnv('MAX_AGENT_CONCURRENCY', 4),
    webDistPath: resolve(process.env.WEB_DIST_PATH ?? resolve(process.cwd(), 'apps/web/dist')),
    isProduction: process.env.NODE_ENV === 'production',
  };
}
