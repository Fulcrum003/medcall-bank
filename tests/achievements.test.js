import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateAchievements, achStats, DB, BANK, QMAP, buildIndex, resetDB } from '../app.js';

beforeEach(() => {
  resetDB();
  BANK.length = 0;
  BANK.push({ id: 'P', title: 'Pack', color: '#000', questions: [
    { id: 'q1', choices: [{ l: 'A', correct: true }] },
  ]});
  buildIndex();
  document.body.innerHTML = '<main id="app"></main>';
});

describe('achStats', () => {
  it('returns zero values with fresh DB', () => {
    const s = achStats();
    expect(s.answered).toBe(0);
    expect(s.mastered).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.bestExam).toBe(0);
  });

  it('counts total answered from question.seen', () => {
    DB.progress.questions['q1'] = { seen: 7, correct: 5 };
    const s = achStats();
    expect(s.answered).toBe(7);
  });

  it('counts mastered questions (interval >= 21)', () => {
    DB.progress.questions['q1'] = { seen: 10, srs: { interval: 25 } };
    const s = achStats();
    expect(s.mastered).toBe(1);
  });

  it('does not count interval < 21 as mastered', () => {
    DB.progress.questions['q1'] = { seen: 5, srs: { interval: 20 } };
    const s = achStats();
    expect(s.mastered).toBe(0);
  });

  it('calculates bestExam from DB.exams', () => {
    DB.exams = [{ percent: 45 }, { percent: 88 }, { percent: 62 }];
    const s = achStats();
    expect(s.bestExam).toBe(88);
  });

  it('reads streak from DB.progress', () => {
    DB.progress.streak = { current: 14, lastStudied: '2024-01-01' };
    const s = achStats();
    expect(s.streak).toBe(14);
  });

  it('merges extra overrides', () => {
    const s = achStats({ perfectSet: true, customKey: 42 });
    expect(s.perfectSet).toBe(true);
    expect(s.customKey).toBe(42);
  });
});

describe('evaluateAchievements', () => {
  it('unlocks "first" achievement on first question answered', () => {
    DB.progress.questions['q1'] = { seen: 1, correct: 1 };
    const newly = evaluateAchievements();
    expect(newly.some(a => a.id === 'first')).toBe(true);
    expect(DB.progress.achievements['first']).toBeTruthy();
  });

  it('does not re-unlock an already unlocked achievement', () => {
    DB.progress.questions['q1'] = { seen: 1, correct: 1 };
    DB.progress.achievements = { first: '2024-01-01' };
    const newly = evaluateAchievements();
    expect(newly.some(a => a.id === 'first')).toBe(false);
  });

  it('unlocks "exam80" when bestExam >= 80', () => {
    DB.exams = [{ percent: 85 }];
    const newly = evaluateAchievements();
    expect(newly.some(a => a.id === 'exam80')).toBe(true);
  });

  it('does not unlock "exam80" when bestExam < 80', () => {
    DB.exams = [{ percent: 75 }];
    const newly = evaluateAchievements();
    expect(newly.some(a => a.id === 'exam80')).toBe(false);
  });

  it('unlocks streak achievements', () => {
    DB.progress.streak = { current: 7, lastStudied: '2024-01-01' };
    const newly = evaluateAchievements();
    expect(newly.some(a => a.id === 'streak7')).toBe(true);
    expect(newly.some(a => a.id === 'streak3')).toBe(true);
  });

  it('returns empty array when no new achievements', () => {
    const newly = evaluateAchievements();
    expect(newly).toHaveLength(0);
  });

  it('unlocks perfectSet with extra override', () => {
    // Need 10+ answered to also check answered>=10
    for (let i = 0; i < 10; i++) {
      DB.progress.questions[`q${i}`] = { seen: 1, correct: 1, srs: null };
    }
    const newly = evaluateAchievements({ perfectSet: true });
    expect(newly.some(a => a.id === 'perfect')).toBe(true);
  });
});
