import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  render, gradeCurrent, App, DB, BANK, QMAP, buildIndex, resetDB,
} from '../app.js';

const questions = [
  { id: 'r1', topic: 'T', stem: 'Q1?', choices: [{ l: 'A', t: 'right', correct: true }, { l: 'B', t: 'wrong', correct: false }] },
  { id: 'r2', topic: 'T', stem: 'Q2?', choices: [{ l: 'A', t: 'right', correct: true }, { l: 'B', t: 'wrong', correct: false }] },
  { id: 'r3', topic: 'T', stem: 'Q3?', choices: [{ l: 'A', t: 'right', correct: true }, { l: 'B', t: 'wrong', correct: false }] },
];

beforeEach(() => {
  resetDB();
  BANK.length = 0;
  BANK.push({ id: 'REG', title: 'Regression Pack', color: '#000', questions });
  buildIndex();
  document.body.innerHTML = '<main id="app"></main>';
  App.practice = null;
  App.exam = null;
  App.examResult = null;
  App.screen = 'home';
});

describe('exam timer is cleared when leaving the exam runner via nav (regression)', () => {
  it('render() on a non-exam screen clears a live exam interval', () => {
    vi.useFakeTimers();
    try {
      const tick = vi.fn();
      App.exam = {
        ids: ['r1'], order: { r1: questions[0].choices }, i: 0, answers: {},
        flags: new Set(), timerMode: 'total', timeLeft: 60, total: 60,
        startedAt: Date.now(), timerId: setInterval(tick, 1000),
      };
      // Simulate the sidebar "Home" click: screen changes, render runs.
      App.screen = 'home';
      render();
      expect(App.exam.timerId).toBeNull();
      vi.advanceTimersByTime(5000);
      expect(tick).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('render() while still on exam-runner keeps the interval alive', () => {
    vi.useFakeTimers();
    try {
      const tick = vi.fn();
      App.exam = {
        ids: ['r1'], order: { r1: questions[0].choices }, i: 0, answers: {},
        flags: new Set(), timerMode: 'total', timeLeft: 60, total: 60,
        startedAt: Date.now(), timerId: setInterval(tick, 1000),
      };
      App.screen = 'exam-runner';
      render(); // e.g. after answering / jumping between questions
      expect(App.exam.timerId).not.toBeNull();
      vi.advanceTimersByTime(3000);
      expect(tick).toHaveBeenCalledTimes(3);
      clearInterval(App.exam.timerId);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('re-grading an already-answered question is a no-op (regression)', () => {
  function startSession() {
    App.practice = {
      ctx: { smart: true }, label: 'Test', pool: ['r1', 'r2', 'r3'], i: 0,
      revealed: false, selected: null, answered: 0, correct: 0, xp: 0, results: {},
    };
    App.screen = 'quiz';
  }

  it('grading normally counts once', () => {
    startSession();
    App.practice.selected = 'A'; // correct
    gradeCurrent('good');
    expect(App.practice.answered).toBe(1);
    expect(App.practice.correct).toBe(1);
    expect(DB.progress.questions['r1'].seen).toBe(1);
    expect(App.practice.i).toBe(1); // advanced
  });

  it('re-grading after back-navigation does not double-count', () => {
    startSession();
    const s = App.practice;
    s.selected = 'A';
    gradeCurrent('good'); // answer q1 -> i=1
    const xpAfterFirst = DB.progress.xp || 0;

    // Simulate the Back button (nav-q handler): return to index 0, reset state.
    s.i = 0; s.revealed = false; s.selected = 'B';
    gradeCurrent('again'); // attempt to re-grade q1

    expect(s.answered).toBe(1);                          // not 2
    expect(s.correct).toBe(1);                           // unchanged
    expect(DB.progress.questions['r1'].seen).toBe(1);    // no double attempt
    expect(DB.progress.xp || 0).toBe(xpAfterFirst);      // no XP farming
    expect(s.i).toBe(1);                                 // moved forward instead
  });

  it('session totals can never exceed the pool size', () => {
    startSession();
    const s = App.practice;
    // Answer q1 and q2, then repeatedly re-grade q1 via back-jumps.
    s.selected = 'A'; gradeCurrent('good');
    s.selected = 'A'; gradeCurrent('good');
    for (let k = 0; k < 5; k++) {
      if (!App.practice) break; // session ended
      s.i = 0; s.revealed = false; s.selected = 'A';
      gradeCurrent('good');
    }
    if (App.practice) {
      expect(App.practice.answered).toBeLessThanOrEqual(3);
    } else {
      // Session completed: recorded totals must still be within pool size.
      expect(App.lastSession.answered).toBeLessThanOrEqual(3);
    }
    expect(DB.progress.questions['r1'].seen).toBe(1);
  });
});
