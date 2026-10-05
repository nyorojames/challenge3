// Unit tests for the FIFO overdue rule. Pure function: no database needed.
import { describe, expect, it } from 'vitest';
import { computeDueStatus } from '../src/services/ledger.js';

const TODAY = '2026-10-05';

describe('computeDueStatus (FIFO)', () => {
  it('no credit sales -> nothing due', () => {
    expect(computeDueStatus([], 0, TODAY)).toEqual({ due_date: null, overdue: false, days_overdue: 0 });
  });

  it('unpaid sale past its due date -> overdue, with days counted', () => {
    const sales = [{ amount: 800, due_date: '2026-09-22' }];
    expect(computeDueStatus(sales, 300, TODAY)).toEqual({ due_date: '2026-09-22', overdue: true, days_overdue: 13 });
  });

  it('old debt paid in full, then new credit due in the future -> NOT overdue', () => {
    const sales = [
      { amount: 1160, due_date: '2026-09-10' }, // fully covered by the payment
      { amount: 368, due_date: '2026-10-08' },
    ];
    expect(computeDueStatus(sales, 1160, TODAY)).toEqual({ due_date: '2026-10-08', overdue: false, days_overdue: 0 });
  });

  it('payment covers only part of the oldest sale -> still overdue on that sale', () => {
    const sales = [
      { amount: 1000, due_date: '2026-09-30' },
      { amount: 500, due_date: '2026-10-20' },
    ];
    expect(computeDueStatus(sales, 999, TODAY)).toMatchObject({ due_date: '2026-09-30', overdue: true });
  });

  it('due date passed but balance is fully paid -> not overdue', () => {
    const sales = [{ amount: 490, due_date: '2026-10-02' }];
    expect(computeDueStatus(sales, 490, TODAY)).toEqual({ due_date: null, overdue: false, days_overdue: 0 });
  });

  it('due today is not overdue yet', () => {
    const sales = [{ amount: 365, due_date: TODAY }];
    expect(computeDueStatus(sales, 0, TODAY).overdue).toBe(false);
  });

  it('no due date at all -> never overdue', () => {
    expect(computeDueStatus([{ amount: 185, due_date: null }], 0, TODAY).overdue).toBe(false);
  });

  it('undated older sale does not hide a later sale that is past due', () => {
    const sales = [
      { amount: 200, due_date: null },
      { amount: 300, due_date: '2026-10-01' },
    ];
    expect(computeDueStatus(sales, 0, TODAY)).toMatchObject({ due_date: '2026-10-01', overdue: true });
  });

  it('overpaid (customer has credit with the shop) -> not overdue', () => {
    const sales = [{ amount: 100, due_date: '2026-09-01' }];
    expect(computeDueStatus(sales, 150, TODAY).overdue).toBe(false);
  });
});
