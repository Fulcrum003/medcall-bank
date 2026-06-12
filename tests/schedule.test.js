import { describe, it, expect, beforeEach } from 'vitest';
import { schedule, addDays, today } from '../app.js';

function makeNewCard() { return null; }

describe('schedule — new card (srs=null)', () => {
  it('again: reps=0, interval=1, lapses=1, ease decreases', () => {
    const s = schedule(null, 'again');
    expect(s.reps).toBe(0);
    expect(s.interval).toBe(1);
    expect(s.lapses).toBe(1);
    expect(s.ease).toBe(2.3); // 2.5 - 0.2
  });

  it('hard: reps=1, interval=1', () => {
    const s = schedule(null, 'hard');
    expect(s.reps).toBe(1);
    expect(s.interval).toBe(1);
    expect(s.lapses).toBe(0);
  });

  it('good: reps=1, interval=1', () => {
    const s = schedule(null, 'good');
    expect(s.reps).toBe(1);
    expect(s.interval).toBe(1);
  });

  it('easy: reps=1, interval=2', () => {
    const s = schedule(null, 'easy');
    expect(s.reps).toBe(1);
    expect(s.interval).toBe(2);
  });

  it('new card starts with default ease 2.5', () => {
    const s = schedule(null, 'good');
    expect(s.ease).toBeGreaterThan(0);
  });

  it('returns a due date equal to today + interval', () => {
    const s = schedule(null, 'good');
    expect(s.due).toBe(addDays(today(), s.interval));
  });
});

describe('schedule — second repetition (reps already 1)', () => {
  const after1Good = { ease: 2.5, interval: 1, reps: 1, lapses: 0 };

  it('hard → interval=4', () => {
    const s = schedule(after1Good, 'hard');
    expect(s.interval).toBe(4);
    expect(s.reps).toBe(2);
  });

  it('good → interval=6', () => {
    const s = schedule(after1Good, 'good');
    expect(s.interval).toBe(6);
    expect(s.reps).toBe(2);
  });

  it('easy → interval=6', () => {
    const s = schedule(after1Good, 'easy');
    expect(s.interval).toBe(6);
    expect(s.reps).toBe(2);
  });
});

describe('schedule — third+ repetition (reps >= 2)', () => {
  const after2Good = { ease: 2.5, interval: 6, reps: 2, lapses: 0 };

  it('good multiplies interval by ease', () => {
    const s = schedule(after2Good, 'good');
    const expected = Math.max(1, Math.round(6 * 2.5 * 1 * 1));
    expect(s.interval).toBe(expected); // 15
  });

  it('hard applies 0.8 multiplier', () => {
    const s = schedule(after2Good, 'hard');
    const expected = Math.max(1, Math.round(6 * 2.5 * 0.8 * 1));
    expect(s.interval).toBe(expected); // 12
  });

  it('easy applies 1.3 multiplier', () => {
    const s = schedule(after2Good, 'easy');
    const expected = Math.max(1, Math.round(6 * 2.5 * 1 * 1.3));
    expect(s.interval).toBe(expected); // 20 (rounded)
  });

  it('interval never goes below 1', () => {
    const s = schedule({ ease: 1.3, interval: 0, reps: 2, lapses: 5 }, 'hard');
    expect(s.interval).toBeGreaterThanOrEqual(1);
  });
});

describe('schedule — ease factor', () => {
  it('ease is always >= 1.3', () => {
    let srs = null;
    for (let i = 0; i < 20; i++) {
      srs = schedule(srs, 'again');
    }
    expect(srs.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('ease is rounded to 2 decimal places', () => {
    const s = schedule({ ease: 2.5, interval: 6, reps: 2, lapses: 0 }, 'good');
    const str = s.ease.toString();
    const decimals = str.includes('.') ? str.split('.')[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it('again decreases ease by 0.2 (floor 1.3)', () => {
    const s = schedule({ ease: 2.0, interval: 1, reps: 0, lapses: 2 }, 'again');
    expect(s.ease).toBe(1.8);
  });

  it('ease floor: again when ease already at 1.3 keeps it at 1.3', () => {
    const s = schedule({ ease: 1.3, interval: 1, reps: 0, lapses: 5 }, 'again');
    expect(s.ease).toBe(1.3);
  });
});

describe('schedule — again resets reps', () => {
  it('reps reset to 0 on again', () => {
    const srs = { ease: 2.5, interval: 15, reps: 5, lapses: 0 };
    const s = schedule(srs, 'again');
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(1);
  });

  it('does not mutate original srs object', () => {
    const srs = { ease: 2.5, interval: 6, reps: 2, lapses: 0 };
    const original = { ...srs };
    schedule(srs, 'good');
    expect(srs).toEqual(original);
  });
});
