import { describe, expect, it } from 'vitest';
import { cultivatorTurnPrompt, narrationPrompt, playerIntentPrompt, promptJson } from '../src/index.js';

describe('prompt boundaries', () => {
  it('removes known secret fields before interpolation', () => {
    expect(promptJson({ name: '玄离', apiKey: 'secret', hiddenGoal: '杀人' })).toBe('{\n  "name": "玄离"\n}');
  });

  it('preserves player command and forbids invented intent', () => {
    const result = playerIntentPrompt({ rawCommand: '我向山上走', player: {}, visibleState: {}, allowedTools: ['move'] });
    expect(result.prompt).toContain('我向山上走');
    expect(result.system).toContain('不得替玩家');
  });

  it('passes only explicitly visible cultivator context', () => {
    const result = cultivatorTurnPrompt({
      self: { id: 'c1' }, visibleWorld: {}, visibleActors: [], memory: [], event: {},
      remainingSense: 2, focusSlots: 1, allowedTools: ['observe'],
    });
    expect(result.prompt).toContain('剩余神识：2');
    expect(result.system).toContain('只知道提供给你');
  });

  it('limits narration to settled facts', () => {
    const result = narrationPrompt({ source: 'fate', viewpointName: '无名客', settledFacts: [], causes: [], visibleState: {} });
    expect(result.system).toContain('已结算事实');
    expect(result.system).toContain('不得添加');
  });
});
