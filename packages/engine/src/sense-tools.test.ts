import { describe, expect, it } from 'vitest';
import { SenseLedger, WeightedSemaphore } from './sense.js';
import { ActionDraftTransaction, validateToolCall } from './tools.js';
import { testWorld } from './test-fixtures.js';

describe('sense and tool constraints', () => {
  it('charges planning once, enforces focus slots and rolls transactions back', () => {
    const ledger = new SenseLedger();
    ledger.openWindow('a', 3, 1);
    ledger.begin('tx');
    expect(ledger.reservePlanning('a', 'tx')).toBe(true);
    expect(ledger.reservePlanning('a', 'tx')).toBe(false);
    ledger.finishPlanning('a');
    expect(ledger.spend('a', 2, 'tx')).toBe(true);
    expect(ledger.get('a').remaining).toBe(0);
    ledger.rollback('tx');
    expect(ledger.get('a')).toMatchObject({ remaining: 3, focusInUse: 0 });
  });

  it('does not charge an illegal tool and charges a valid action', () => {
    const ledger = new SenseLedger();
    ledger.openWindow('a', 5, 1);
    const world = testWorld();
    const illegal = validateToolCall({ id: 'bad', name: 'move', arguments: { destination: 'cave' } }, { actorId: 'a', world, ledger });
    expect(illegal).toMatchObject({ ok: false, code: 'TOOL_OUT_OF_RANGE' });
    expect(ledger.get('a').remaining).toBe(5);
    const valid = validateToolCall({ id: 'ok', name: 'useTechnique', arguments: { name: '青锋诀', target: 'b' } }, { actorId: 'a', world, ledger });
    expect(valid).toMatchObject({ ok: true, cost: 2, mode: 'action' });
    expect(ledger.get('a').remaining).toBe(3);
    const tinyLedger = new SenseLedger();
    tinyLedger.openWindow('a', 1, 1);
    const overBudget = validateToolCall({ id: 'costly', name: 'useTechnique', arguments: { name: '青锋诀', target: 'b' } }, { actorId: 'a', world, ledger: tinyLedger });
    expect(overBudget).toMatchObject({ ok: false, code: 'TOOL_OUT_OF_SENSE' });
    expect(tinyLedger.get('a').remaining).toBe(1);
  });

  it('rolls back every draft when one call fails', () => {
    const ledger = new SenseLedger();
    ledger.openWindow('a', 4, 1);
    const transaction = new ActionDraftTransaction('round', { actorId: 'a', world: testWorld(), ledger });
    expect(transaction.submit({ id: 'one', name: 'guard', arguments: { target: 'a' } }).ok).toBe(true);
    expect(transaction.submit({ id: 'two', name: 'move', arguments: { destination: 'cave' } }).ok).toBe(false);
    transaction.rollback();
    expect(ledger.get('a').remaining).toBe(4);
  });

  it('never exceeds weighted global concurrency', async () => {
    const semaphore = new WeightedSemaphore(2);
    let active = 0;
    let peak = 0;
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    const tasks = Array.from({ length: 5 }, () => semaphore.run(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await gate;
      active -= 1;
    }));
    await Promise.resolve();
    expect(peak).toBe(2);
    releaseGate();
    await Promise.all(tasks);
    expect(peak).toBe(2);
    expect(semaphore.available).toBe(2);
  });
});
