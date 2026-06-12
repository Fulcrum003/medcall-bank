import { describe, it, expect, beforeEach } from 'vitest';
import { smartPool, DB, BANK, QMAP, buildIndex, today, addDays, resetDB } from '../app.js';

function makeQuestions(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`, topic: 'T', choices: [{ l: 'A', correct: true }]
  }));
}

beforeEach(() => {
  resetDB();
  BANK.length = 0;
  BANK.push({ id: 'P', title: 'Pack', color: '#000', questions: makeQuestions(10) });
  buildIndex();
});

describe('smartPool', () => {
  it('returns all fresh questions (up to newPerDay) when nothing is due', () => {
    DB.settings.newPerDay = 5;
    const pool = smartPool();
    expect(pool.length).toBe(5);
  });

  it('includes all due questions', () => {
    // Mark 3 questions as due
    for (let i = 0; i < 3; i++) {
      DB.progress.questions[`q${i}`] = { seen: 1, srs: { due: addDays(today(), -1) } };
    }
    DB.settings.newPerDay = 0;
    const pool = smartPool();
    expect(pool.length).toBe(3);
  });

  it('due questions appear before fresh questions', () => {
    DB.progress.questions['q0'] = { seen: 1, srs: { due: addDays(today(), -1) } };
    DB.settings.newPerDay = 3;
    const pool = smartPool();
    expect(pool[0]).toBe('q0');
  });

  it('respects newPerDay cap on fresh questions', () => {
    DB.settings.newPerDay = 2;
    const pool = smartPool();
    expect(pool.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array when nothing due and newPerDay=0', () => {
    // Mark all questions as seen with future due dates
    for (let i = 0; i < 10; i++) {
      DB.progress.questions[`q${i}`] = { seen: 1, srs: { due: addDays(today(), 10) } };
    }
    DB.settings.newPerDay = 0;
    const pool = smartPool();
    expect(pool.length).toBe(0);
  });

  it('does not include questions with future due dates as due', () => {
    for (let i = 0; i < 10; i++) {
      DB.progress.questions[`q${i}`] = { seen: 1, srs: { due: addDays(today(), 5) } };
    }
    DB.settings.newPerDay = 0;
    expect(smartPool().length).toBe(0);
  });
});
