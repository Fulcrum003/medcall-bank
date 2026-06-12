import { describe, it, expect, beforeEach } from 'vitest';
import { importProgress, DB, resetDB, today } from '../app.js';

beforeEach(() => {
  resetDB();
  document.body.innerHTML = '<main id="app"></main>';
});

describe('importProgress', () => {
  it('imports all three sections from valid JSON', () => {
    const data = {
      progress: { questions: { q1: { seen: 3, correct: 2 } }, resume: null, streak: { current: 5, lastStudied: today() } },
      exams: [{ examId: 'exam-1', score: 8 }],
      settings: { newPerDay: 30 },
    };
    importProgress(JSON.stringify(data));
    expect(DB.progress.questions['q1'].seen).toBe(3);
    expect(DB.exams[0].examId).toBe('exam-1');
    expect(DB.settings.newPerDay).toBe(30);
  });

  it('imports only progress when exams and settings absent', () => {
    const data = { progress: { questions: { q2: { seen: 1 } }, resume: null, streak: { current: 1, lastStudied: today() } } };
    importProgress(JSON.stringify(data));
    expect(DB.progress.questions['q2']).toBeTruthy();
    expect(DB.exams).toEqual([]); // unchanged
  });

  it('merges settings (does not wipe existing keys)', () => {
    DB.settings.passMark = 60;
    const data = { settings: { newPerDay: 25 } };
    importProgress(JSON.stringify(data));
    expect(DB.settings.newPerDay).toBe(25);
    expect(DB.settings.passMark).toBe(60); // preserved
  });

  it('does not mutate DB on invalid JSON', () => {
    const before = JSON.stringify(DB);
    importProgress('not valid json {{{{');
    expect(JSON.stringify(DB)).toBe(before);
  });

  it('handles empty string gracefully', () => {
    expect(() => importProgress('')).not.toThrow();
  });

  it('handles valid JSON that lacks progress/exams/settings keys', () => {
    expect(() => importProgress(JSON.stringify({ other: 'data' }))).not.toThrow();
    expect(DB.progress.questions).toEqual({});
  });
});
