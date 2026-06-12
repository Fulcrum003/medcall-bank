import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordAttempt, bumpStreak, bumpDaily, dueCount, seenCount, masteredCount,
  DB, BANK, QMAP, buildIndex, today, addDays, resetDB
} from '../app.js';

const q1 = {
  id: 'q1', packId: 'TST', topic: 'Topic A',
  choices: [{ l: 'A', t: 'Wrong', correct: false }, { l: 'B', t: 'Right', correct: true }],
};

const setupBank = () => {
  BANK.length = 0;
  BANK.push({ id: 'TST', title: 'Test', color: '#000', questions: [q1] });
  buildIndex();
};

beforeEach(() => {
  resetDB();
  setupBank();
  document.body.innerHTML = '<main id="app"></main>';
});

// ---- bumpStreak ----
describe('bumpStreak', () => {
  it('sets streak to 1 on first study', () => {
    bumpStreak();
    expect(DB.progress.streak.current).toBe(1);
    expect(DB.progress.streak.lastStudied).toBe(today());
  });

  it('does not increment if already studied today', () => {
    DB.progress.streak = { current: 5, lastStudied: today() };
    bumpStreak();
    expect(DB.progress.streak.current).toBe(5);
  });

  it('increments streak on consecutive day', () => {
    DB.progress.streak = { current: 3, lastStudied: addDays(today(), -1) };
    bumpStreak();
    expect(DB.progress.streak.current).toBe(4);
  });

  it('resets streak to 1 after a gap of 2+ days', () => {
    DB.progress.streak = { current: 10, lastStudied: addDays(today(), -2) };
    bumpStreak();
    expect(DB.progress.streak.current).toBe(1);
  });

  it('updates lastStudied to today after each call', () => {
    bumpStreak();
    expect(DB.progress.streak.lastStudied).toBe(today());
  });
});

// ---- bumpDaily ----
describe('bumpDaily', () => {
  it('initializes daily count to 1 on first call', () => {
    bumpDaily();
    expect(DB.progress.daily.count).toBe(1);
    expect(DB.progress.daily.date).toBe(today());
  });

  it('increments existing daily count', () => {
    DB.progress.daily = { date: today(), count: 5, celebrated: false };
    bumpDaily();
    expect(DB.progress.daily.count).toBe(6);
  });

  it('resets count when date changes', () => {
    DB.progress.daily = { date: '2020-01-01', count: 15, celebrated: false };
    bumpDaily();
    expect(DB.progress.daily.count).toBe(1);
    expect(DB.progress.daily.date).toBe(today());
  });
});

// ---- recordAttempt ----
describe('recordAttempt', () => {
  it('increments seen count', () => {
    recordAttempt(q1, 'B', 'good');
    expect(DB.progress.questions['q1'].seen).toBe(1);
  });

  it('increments correct count when answer is right', () => {
    recordAttempt(q1, 'B', 'good'); // B is correct
    expect(DB.progress.questions['q1'].correct).toBe(1);
  });

  it('does not increment correct when answer is wrong', () => {
    recordAttempt(q1, 'A', 'again'); // A is wrong
    expect(DB.progress.questions['q1'].correct).toBe(0);
  });

  it('okOverride=true forces ok regardless of answer', () => {
    recordAttempt(q1, 'A', 'good', true); // A is wrong but override = true
    expect(DB.progress.questions['q1'].correct).toBe(1);
  });

  it('okOverride=false forces wrong regardless of answer', () => {
    recordAttempt(q1, 'B', 'good', false); // B is correct but override = false
    expect(DB.progress.questions['q1'].correct).toBe(0);
  });

  it('appends to history array', () => {
    recordAttempt(q1, 'B', 'good');
    recordAttempt(q1, 'A', 'again');
    const h = DB.progress.questions['q1'].history;
    expect(h).toHaveLength(2);
    expect(h[0].answer).toBe('B');
    expect(h[0].correct).toBe(true);
    expect(h[1].answer).toBe('A');
    expect(h[1].correct).toBe(false);
  });

  it('updates srs when grade is provided', () => {
    recordAttempt(q1, 'B', 'good');
    expect(DB.progress.questions['q1'].srs).not.toBeNull();
    expect(DB.progress.questions['q1'].srs.reps).toBe(1);
  });

  it('does not update srs when grade is null (exam mode)', () => {
    recordAttempt(q1, 'B', null);
    expect(DB.progress.questions['q1'].srs).toBeNull();
  });

  it('accumulates across multiple calls', () => {
    recordAttempt(q1, 'B', 'good');
    recordAttempt(q1, 'B', 'good');
    recordAttempt(q1, 'A', 'again');
    const p = DB.progress.questions['q1'];
    expect(p.seen).toBe(3);
    expect(p.correct).toBe(2);
  });

  it('sets lastResult', () => {
    recordAttempt(q1, 'B', 'good');
    expect(DB.progress.questions['q1'].lastResult).toBe('correct');
    recordAttempt(q1, 'A', 'again');
    expect(DB.progress.questions['q1'].lastResult).toBe('wrong');
  });
});

// ---- dueCount ----
describe('dueCount', () => {
  it('returns 0 when no questions have been seen', () => {
    expect(dueCount()).toBe(0);
  });

  it('returns 0 for a question with no srs (new card)', () => {
    DB.progress.questions['q1'] = { seen: 1, correct: 1, srs: null };
    expect(dueCount()).toBe(0);
  });

  it('counts question as due when srs.due <= today', () => {
    DB.progress.questions['q1'] = { seen: 1, srs: { due: today() } };
    expect(dueCount()).toBe(1);
  });

  it('counts overdue question (due date in the past)', () => {
    DB.progress.questions['q1'] = { seen: 1, srs: { due: addDays(today(), -3) } };
    expect(dueCount()).toBe(1);
  });

  it('does not count future due date', () => {
    DB.progress.questions['q1'] = { seen: 1, srs: { due: addDays(today(), 5) } };
    expect(dueCount()).toBe(0);
  });

  it('filters by packId', () => {
    // TST pack has q1; add an empty OTHER pack too
    BANK.push({ id: 'OTHER', title: 'Other', color: '#000', questions: [] });
    buildIndex();
    DB.progress.questions['q1'] = { seen: 1, srs: { due: today() } };
    expect(dueCount('TST')).toBe(1);
    expect(dueCount('OTHER')).toBe(0);
  });
});

// ---- seenCount ----
describe('seenCount', () => {
  it('returns 0 when no questions seen', () => {
    expect(seenCount('TST')).toBe(0);
  });

  it('counts a seen question', () => {
    DB.progress.questions['q1'] = { seen: 1 };
    expect(seenCount('TST')).toBe(1);
  });

  it('does not double count', () => {
    DB.progress.questions['q1'] = { seen: 5 }; // seen multiple times counts as 1
    expect(seenCount('TST')).toBe(1);
  });
});

// ---- masteredCount ----
describe('masteredCount', () => {
  it('returns 0 when no mastered questions', () => {
    DB.progress.questions['q1'] = { seen: 5, srs: { interval: 10 } };
    expect(masteredCount('TST')).toBe(0);
  });

  it('counts question with interval >= 21 as mastered', () => {
    DB.progress.questions['q1'] = { seen: 5, srs: { interval: 21 } };
    expect(masteredCount('TST')).toBe(1);
  });

  it('exactly 21 is mastered', () => {
    DB.progress.questions['q1'] = { seen: 5, srs: { interval: 21 } };
    expect(masteredCount('TST')).toBe(1);
  });

  it('interval 20 is not mastered', () => {
    DB.progress.questions['q1'] = { seen: 5, srs: { interval: 20 } };
    expect(masteredCount('TST')).toBe(0);
  });
});
