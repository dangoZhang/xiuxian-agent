import { describe, expect, it } from 'vitest';
import {
  createGameRequestSchema,
  gameStateSchema,
  heavenRuleSetSchema,
  modelConfigSchema,
  saveFileSchema,
  sourceSchema,
  toolCallSchema,
} from './index.js';

describe('protocol schemas', () => {
  it('creates a game from a model session alone and tolerates legacy fields', () => {
    expect(createGameRequestSchema.parse({ sessionId: 'session' })).toEqual({ sessionId: 'session' });
    expect(createGameRequestSchema.parse({ sessionId: 'session', origin: '旧身世' })).toEqual({ sessionId: 'session' });
    expect(createGameRequestSchema.parse({ sessionId: 'session', background: '旧背景' })).toEqual({ sessionId: 'session' });
    expect(createGameRequestSchema.safeParse({ origin: '旧身世' }).success).toBe(false);
  });

  it('rejects unsupported sources and DSL operations', () => {
    expect(sourceSchema.safeParse('battle').success).toBe(false);
    expect(heavenRuleSetSchema.safeParse({
      schemaVersion: 1,
      ruleVersion: 1,
      effectiveFromSequence: 0,
      constants: {},
      modifiers: [{ id: 'evil', target: 'damage', operation: 'eval', value: 1, whenTags: [] }],
      triggers: [],
      descriptions: ['天地有序'],
    }).success).toBe(false);
  });

  it('requires a real model secret and bounded concurrency', () => {
    expect(modelConfigSchema.safeParse({
      default: { baseUrl: 'https://example.com/v1', apiKey: '', model: 'x' },
      maxConcurrency: 0,
    }).success).toBe(false);
  });

  it('rejects malformed tool calls before the engine sees them', () => {
    expect(toolCallSchema.safeParse({ id: '1', name: 'useTechnique', arguments: { name: '剑诀' } }).success).toBe(false);
  });

  it('rejects partial and corrupt saves', () => {
    expect(saveFileSchema.safeParse({ format: 'xiuxian-agent-save', schemaVersion: 1 }).success).toBe(false);
    expect(gameStateSchema.safeParse({ schemaVersion: 1 }).success).toBe(false);
  });
});
