import { describe, it, expect } from 'vitest';

/* Cross-device sync merge logic.
   These are the data-loss-critical paths: two devices studying offline must
   combine without losing an attempt and without inflating counters when the
   same payload is merged twice. */

const attempt = (date, answer, correct, grade) => ({ date, answer, correct, grade });

// Device A: answered on the 19th (right) and the 20th (wrong).
const DEV_A = {
  seen: 2, correct: 1, lastSeen: '2026-07-20', lastResult: 'wrong', marked: false,
  srs: { interval: 1 },
  history: [attempt('2026-07-19', 'A', true, 'good'), attempt('2026-07-20', 'B', false, 'again')],
};
// Device B: same 19th attempt (already synced) plus a new one on the 21st.
const DEV_B = {
  seen: 2, correct: 2, lastSeen: '2026-07-21', lastResult: 'correct', marked: true,
  srs: { interval: 6 },
  history: [attempt('2026-07-19', 'A', true, 'good'), attempt('2026-07-21', 'C', true, 'easy')],
};

describe('mergeQuestionProgress', () => {
  it('unions history without duplicating the attempt both devices already had', async () => {
    const { mergeQuestionProgress } = await import('../app.js');
    expect(mergeQuestionProgress(DEV_A, DEV_B).history).toHaveLength(3);
  });

  it('derives seen from the union and never lets correct exceed it', async () => {
    const { mergeQuestionProgress } = await import('../app.js');
    const m = mergeQuestionProgress(DEV_A, DEV_B);
    expect(m.seen).toBe(3);
    expect(m.correct).toBe(2);
    expect(m.correct).toBeLessThanOrEqual(m.seen);
  });

  it('keeps the SRS state from the most recent review', async () => {
    const { mergeQuestionProgress } = await import('../app.js');
    expect(mergeQuestionProgress(DEV_A, DEV_B).srs.interval).toBe(6);
    expect(mergeQuestionProgress(DEV_B, DEV_A).srs.interval).toBe(6);
  });

  it('is order-independent', async () => {
    const { mergeQuestionProgress } = await import('../app.js');
    const ab = mergeQuestionProgress(DEV_A, DEV_B);
    const ba = mergeQuestionProgress(DEV_B, DEV_A);
    expect(ab.seen).toBe(ba.seen);
    expect(ab.history).toHaveLength(ba.history.length);
  });

  it('is idempotent — re-syncing the same remote never inflates counters', async () => {
    const { mergeQuestionProgress } = await import('../app.js');
    const once = mergeQuestionProgress(DEV_A, DEV_B);
    const twice = mergeQuestionProgress(once, DEV_B);
    expect(twice.seen).toBe(once.seen);
    expect(twice.history).toHaveLength(once.history.length);
  });

  it('survives a one-sided merge and an imported backup with no history', async () => {
    const { mergeQuestionProgress } = await import('../app.js');
    expect(mergeQuestionProgress(null, DEV_B).seen).toBe(2);
    expect(mergeQuestionProgress(DEV_A, null).seen).toBe(2);
    // legacy import: counters but no history rows — must not shrink to 0
    expect(mergeQuestionProgress({ seen: 5, correct: 4, history: [] }, { seen: 0, correct: 0, history: [] }).seen).toBe(5);
  });
});

describe('mergeProgress', () => {
  const LOCAL = {
    questions: { q1: DEV_A },
    xpLog: { '2026-07-20': 50 }, timeLog: { '2026-07-20': 600 }, xp: 50,
    checklist: { a: true }, streak: { current: 3, lastStudied: '2026-07-20' },
  };
  const REMOTE = {
    questions: { q1: DEV_B, q2: { seen: 1, correct: 1, lastSeen: '2026-07-21', history: [attempt('2026-07-21', 'A', true)] } },
    xpLog: { '2026-07-20': 50, '2026-07-21': 30 }, timeLog: { '2026-07-21': 300 }, xp: 80,
    checklist: { b: true }, streak: { current: 4, lastStudied: '2026-07-21' },
  };

  it('brings in questions seen only on the other device', async () => {
    const { mergeProgress } = await import('../app.js');
    const m = mergeProgress(LOCAL, REMOTE);
    expect(m.questions.q1).toBeTruthy();
    expect(m.questions.q2).toBeTruthy();
  });

  it('takes the max for a given day so XP is never double-counted', async () => {
    const { mergeProgress } = await import('../app.js');
    const m = mergeProgress(LOCAL, REMOTE);
    expect(m.xpLog['2026-07-20']).toBe(50); // not 100
    expect(m.xpLog['2026-07-21']).toBe(30);
  });

  it('unions the checklist and keeps the better streak', async () => {
    const { mergeProgress } = await import('../app.js');
    const m = mergeProgress(LOCAL, REMOTE);
    expect(m.checklist).toEqual({ a: true, b: true });
    expect(m.streak.current).toBe(4);
    expect(m.streak.lastStudied).toBe('2026-07-21');
  });

  it('keeps local progress intact when the account has nothing yet', async () => {
    const { mergeProgress } = await import('../app.js');
    expect(mergeProgress(LOCAL, {}).questions.q1.seen).toBe(2);
  });
});

describe('buildSyncPayload', () => {
  const heavy = {
    seen: 60, correct: 30,
    history: Array.from({ length: 60 }, (_, i) => attempt(`2026-07-${String((i % 28) + 1).padStart(2, '0')}`, 'A', i % 2 === 0)),
  };
  const DB_LIKE = { progress: { questions: { qX: heavy } }, exams: [], settings: { dailyGoal: 30, theme: 'dark', maintainer: true } };

  it('trims history to the cap so the doc stays under the 1 MiB Firestore limit', async () => {
    const { buildSyncPayload } = await import('../app.js');
    const p = buildSyncPayload(DB_LIKE, 20);
    expect(p.progress.questions.qX.history).toHaveLength(20);
    expect(p.progress.questions.qX.seen).toBe(60); // counters survive trimming
  });

  it('does not mutate the live DB while building the upload', async () => {
    const { buildSyncPayload } = await import('../app.js');
    buildSyncPayload(DB_LIKE, 5);
    expect(heavy.history).toHaveLength(60);
  });

  it('syncs study preferences but leaves device-local settings behind', async () => {
    const { buildSyncPayload } = await import('../app.js');
    const p = buildSyncPayload(DB_LIKE, 20);
    expect(p.settings.dailyGoal).toBe(30);
    expect(p.settings.theme).toBeUndefined();
    expect(p.settings.maintainer).toBeUndefined();
  });
});

describe('mergeRecords', () => {
  it('unions exam records by id without duplicating', async () => {
    const { mergeRecords } = await import('../app.js');
    expect(mergeRecords([{ id: 1 }], [{ id: 1 }, { id: 2 }], 'id')).toHaveLength(2);
    expect(mergeRecords([{ id: 1 }, { id: 2 }], [{ id: 2 }], 'id')).toHaveLength(2);
  });
});
