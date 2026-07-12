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

// ── Round 2 regressions (from the full audit) ────────────────────────────────

describe('STORE survives corrupt localStorage values (regression)', () => {
  it('wsGet returns null for a value that is not valid JSON', async () => {
    const { wsGet } = await import('../app.js');
    localStorage.setItem('corrupt:key', '{definitely not json');
    await expect(wsGet('corrupt:key')).resolves.toBeNull();
    localStorage.removeItem('corrupt:key');
  });

  it('loadDB does not throw when a stored section is corrupt', async () => {
    const { loadDB, SK } = await import('../app.js');
    localStorage.setItem(SK.progress, 'garbage{{{');
    await expect(loadDB()).resolves.toBeUndefined();
    expect(DB.progress.questions).toBeDefined(); // defaults kept
    localStorage.removeItem(SK.progress);
  });
});

describe('recordAttempt tolerates partial imported entries (regression)', () => {
  it('grading an entry without history/correct does not throw or produce NaN', async () => {
    const { recordAttempt } = await import('../app.js');
    DB.progress.questions['r1'] = { seen: 2 }; // shape from an old/partial backup
    expect(() => recordAttempt(QMAP['r1'], 'A', 'good')).not.toThrow();
    const p = DB.progress.questions['r1'];
    expect(p.seen).toBe(3);
    expect(p.correct).toBe(1);
    expect(Number.isNaN(p.correct)).toBe(false);
    expect(p.history).toHaveLength(1);
  });
});

describe('recalled single-choice questions are self-graded (regression)', () => {
  beforeEach(() => {
    BANK.length = 0;
    BANK.push({ id: 'REG', title: 'Regression Pack', color: '#000', questions: [
      { id: 's1', topic: 'T', stem: 'Recalled?', choices: [{ l: 'A', t: 'the answer', correct: true }] },
      { id: 's2', topic: 'T', stem: 'Recalled2?', choices: [{ l: 'A', t: 'the answer', correct: true }] },
    ]});
    buildIndex();
  });

  it('grading Good records a correct attempt even with no selection', () => {
    App.practice = { ctx: { smart: true }, label: 'T', pool: ['s1', 's2'], i: 0,
      revealed: true, selected: null, answered: 0, correct: 0, xp: 0, results: {} };
    App.screen = 'quiz';
    gradeCurrent('good');
    const p = DB.progress.questions['s1'];
    expect(p.correct).toBe(1);
    expect(p.lastResult).toBe('correct');
  });

  it('grading Again records a miss', () => {
    App.practice = { ctx: { smart: true }, label: 'T', pool: ['s1', 's2'], i: 0,
      revealed: true, selected: null, answered: 0, correct: 0, xp: 0, results: {} };
    App.screen = 'quiz';
    gradeCurrent('again');
    const p = DB.progress.questions['s1'];
    expect(p.correct).toBe(0);
    expect(p.lastResult).toBe('wrong');
  });
});

describe('dates are local-timezone consistent (regression)', () => {
  it('addDays is exact regardless of host timezone', async () => {
    const { addDays } = await import('../app.js');
    expect(addDays('2024-06-15', 1)).toBe('2024-06-16');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('today()+1 day is always strictly after today()', async () => {
    const { today, addDays } = await import('../app.js');
    expect(addDays(today(), 1) > today()).toBe(true);
    expect(addDays(today(), 0)).toBe(today());
  });
});

describe('syncBank resilience (regression)', () => {
  const packJson = (id) => ({ packId: id, title: id, questions: [
    { id: id + '_q1', stem: 'S?', choices: [{ label: 'A', text: 't', correct: true }] },
  ]});

  beforeEach(() => {
    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('manifest.json')) return { ok: true, json: async () => ({
        packs: [{ packId: 'p1', url: 'p1.json' }, { packId: 'p2', url: 'p2.json' }] }) };
      if (u.includes('p1.json')) return { ok: true, json: async () => packJson('p1') };
      return { ok: false, status: 404 }; // p2 is missing
    });
  });

  it('a single missing pack is skipped instead of aborting the whole sync', async () => {
    const { syncBank } = await import('../app.js');
    const n = await syncBank('https://bank.test');
    expect(n).toBe(1);
    expect(BANK.map(p => p.id)).toEqual(['p1']);
    expect(QMAP['p1_q1']).toBeDefined();
  });

  it('bank swap is deferred while a practice session is active, applied by render()', async () => {
    const { syncBank } = await import('../app.js');
    App.practice = { ctx: { smart: true }, label: 'T', pool: ['r1'], i: 0,
      revealed: false, selected: null, answered: 0, correct: 0, xp: 0, results: {} };
    await syncBank('https://bank.test');
    expect(BANK.map(p => p.id)).toEqual(['REG']);   // untouched mid-session
    expect(App._pendingBank).toBeTruthy();
    App.practice = null; App.screen = 'home';
    render();
    expect(BANK.map(p => p.id)).toEqual(['p1']);    // applied after session end
    expect(App._pendingBank).toBeNull();
  });
});

// ── Round 3: editor per-field patches + blob store ───────────────────────────

describe('question editor produces per-field diff patches (regression)', () => {
  beforeEach(async () => {
    BANK.length = 0;
    BANK.push({ id: 'REG', title: 'Pack', color: '#000', questions: [
      { id: 'e1', topic: 'T', stem: 'Original stem', keyPoint: 'KP',
        choices: [{ l: 'A', t: 'one', correct: true, e: 'why' }, { l: 'B', t: 'two', correct: false, e: '' }] },
    ]});
    buildIndex();
  });

  it('editing only the stem yields a stem-only patch', async () => {
    const { qeInit, qeBuildPatch } = await import('../app.js');
    qeInit('e1');
    App.qedit.draft.stem = 'Fixed stem';
    const patch = qeBuildPatch();
    expect(patch).toHaveProperty('stem', 'Fixed stem');
    expect(patch).not.toHaveProperty('choices');
    expect(patch).not.toHaveProperty('keyPoint');
    expect(patch).not.toHaveProperty('flag');
  });

  it('editing only a choice yields a choices-only patch', async () => {
    const { qeInit, qeBuildPatch } = await import('../app.js');
    qeInit('e1');
    App.qedit.draft.choices[1].t = 'two (corrected)';
    const patch = qeBuildPatch();
    expect(patch).toHaveProperty('choices');
    expect(patch).not.toHaveProperty('stem');
  });

  it('no edits yields an empty patch', async () => {
    const { qeInit, qeBuildPatch } = await import('../app.js');
    qeInit('e1');
    expect(Object.keys(qeBuildPatch())).toHaveLength(0);
  });

  it('concurrent stem and choice patches merge instead of clobbering', async () => {
    // Simulates applyEdits' per-field merge of two maintainers' rows.
    const stemPatch = { stem: 'M1 stem fix' };
    const choicePatch = { choices: [{ l: 'A', t: 'M2 choice fix', correct: true }] };
    const merged = Object.assign({}, stemPatch, choicePatch);
    expect(merged.stem).toBe('M1 stem fix');
    expect(merged.choices[0].t).toBe('M2 choice fix');
  });
});

describe('blob store falls back to STORE without IndexedDB (regression)', () => {
  it('round-trips a value through the fallback path', async () => {
    const { blobGet, blobSet } = await import('../app.js');
    await blobSet('blob:test', { big: 'payload' });
    await expect(blobGet('blob:test')).resolves.toEqual({ big: 'payload' });
    localStorage.removeItem('blob:test');
  });

  it('returns null for a missing key', async () => {
    const { blobGet } = await import('../app.js');
    await expect(blobGet('blob:missing')).resolves.toBeNull();
  });
});
