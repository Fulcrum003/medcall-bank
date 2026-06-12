import { describe, it, expect, beforeEach } from 'vitest';
import { submitExam, DB, BANK, QMAP, App, buildIndex, today, resetDB } from '../app.js';

const questions = [
  { id: 'e1', topic: 'CardioVasc', choices: [{ l: 'A', correct: false }, { l: 'B', correct: true }] },
  { id: 'e2', topic: 'Resp', choices: [{ l: 'A', correct: true }, { l: 'B', correct: false }] },
  { id: 'e3', topic: 'CardioVasc', choices: [{ l: 'A', correct: true }, { l: 'B', correct: false }] },
];

beforeEach(() => {
  resetDB();
  BANK.length = 0;
  BANK.push({ id: 'E', title: 'Exam Pack', color: '#000', questions });
  buildIndex();
  document.body.innerHTML = '<main id="app"></main>';
  // Set up a minimal exam state
  App.exam = {
    ids: ['e1', 'e2', 'e3'],
    order: {
      e1: questions[0].choices,
      e2: questions[1].choices,
      e3: questions[2].choices,
    },
    answers: {},
    flags: new Set(),
    timerMode: 'off',
    timeLeft: 0,
    total: 0,
    startedAt: Date.now() - 1000,
    timerId: null,
  };
  App.examReview = false;
  App.screen = 'exam-runner';
  DB.settings.passMark = 50;
});

describe('submitExam — scoring', () => {
  it('all correct: score equals total', () => {
    App.exam.answers = { e1: 'B', e2: 'A', e3: 'A' };
    submitExam(false);
    expect(App.examResult.score).toBe(3);
    expect(App.examResult.total).toBe(3);
    expect(App.examResult.percent).toBe(100);
  });

  it('all wrong: score is 0', () => {
    App.exam.answers = { e1: 'A', e2: 'B', e3: 'B' };
    submitExam(false);
    expect(App.examResult.score).toBe(0);
    expect(App.examResult.percent).toBe(0);
  });

  it('partial: 2 of 3 correct = 67%', () => {
    App.exam.answers = { e1: 'B', e2: 'A', e3: 'B' }; // e3 wrong
    submitExam(false);
    expect(App.examResult.score).toBe(2);
    expect(App.examResult.percent).toBe(67);
  });

  it('unanswered questions count as wrong', () => {
    App.exam.answers = { e1: 'B' }; // only e1 answered
    submitExam(false);
    expect(App.examResult.score).toBe(1);
    expect(App.examResult.percent).toBe(33);
  });
});

describe('submitExam — pass/fail', () => {
  it('passes when percent >= passMark', () => {
    App.exam.answers = { e1: 'B', e2: 'A', e3: 'A' }; // 100%
    DB.settings.passMark = 50;
    submitExam(false);
    expect(App.examResult.passed).toBe(true);
  });

  it('fails when percent < passMark', () => {
    App.exam.answers = { e1: 'A', e2: 'B', e3: 'B' }; // 0%
    DB.settings.passMark = 50;
    submitExam(false);
    expect(App.examResult.passed).toBe(false);
  });

  it('passes exactly at passMark boundary', () => {
    // 2/3 = 67% with passMark=67
    App.exam.answers = { e1: 'B', e2: 'A', e3: 'B' };
    DB.settings.passMark = 67;
    submitExam(false);
    expect(App.examResult.passed).toBe(true);
  });
});

describe('submitExam — byTopic', () => {
  it('groups results by topic', () => {
    App.exam.answers = { e1: 'B', e2: 'A', e3: 'A' };
    submitExam(false);
    const cv = App.examResult.byTopic.find(t => t.topic === 'CardioVasc');
    const resp = App.examResult.byTopic.find(t => t.topic === 'Resp');
    expect(cv).toBeTruthy();
    expect(cv.total).toBe(2);
    expect(cv.correct).toBe(2);
    expect(resp.total).toBe(1);
    expect(resp.correct).toBe(1);
  });
});

describe('submitExam — auto flag', () => {
  it('sets auto=true when time expires', () => {
    submitExam(true);
    expect(App.examResult.auto).toBe(true);
  });

  it('sets auto=false for manual submission', () => {
    submitExam(false);
    expect(App.examResult.auto).toBe(false);
  });
});

describe('submitExam — side effects', () => {
  it('saves exam to DB.exams', () => {
    App.exam.answers = { e1: 'B', e2: 'A', e3: 'A' };
    submitExam(false);
    expect(DB.exams.length).toBe(1);
    expect(DB.exams[0].score).toBe(3);
    expect(DB.exams[0].percent).toBe(100);
    expect(DB.exams[0].date).toBe(today());
  });

  it('awards XP: correct*10 + wrong*4', () => {
    App.exam.answers = { e1: 'B', e2: 'A', e3: 'B' }; // 2 correct, 1 wrong
    const xpBefore = DB.progress.xp || 0;
    submitExam(false);
    const expectedXP = 2 * 10 + 1 * 4; // 24
    expect(DB.progress.xp).toBe(xpBefore + expectedXP);
  });

  it('records attempt in progress for answered questions', () => {
    App.exam.answers = { e1: 'B' };
    submitExam(false);
    expect(DB.progress.questions['e1']).toBeTruthy();
    expect(DB.progress.questions['e1'].seen).toBe(1);
  });
});
