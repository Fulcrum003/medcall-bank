import { describe, it, expect, beforeEach } from 'vitest';
import { buildIndex, correctLabel, BANK, QMAP, resetDB } from '../app.js';

const testPack = {
  id: 'TST',
  title: 'Test Pack',
  color: '#ff0000',
  questions: [
    { id: 'q1', topic: 'Topic A', choices: [{ l: 'A', t: 'Wrong', correct: false }, { l: 'B', t: 'Right', correct: true }] },
    { id: 'q2', topic: 'Topic B', choices: [{ l: 'A', t: 'Right', correct: true }] },
  ],
};

beforeEach(() => {
  resetDB();
  BANK.length = 0;
  BANK.push(testPack);
  buildIndex();
});

describe('buildIndex', () => {
  it('populates QMAP with all questions', () => {
    expect(Object.keys(QMAP)).toHaveLength(2);
    expect(QMAP['q1']).toBeDefined();
    expect(QMAP['q2']).toBeDefined();
  });

  it('injects packId onto each question', () => {
    expect(QMAP['q1'].packId).toBe('TST');
    expect(QMAP['q2'].packId).toBe('TST');
  });

  it('injects packTitle onto each question', () => {
    expect(QMAP['q1'].packTitle).toBe('Test Pack');
  });

  it('injects system from pack title when question has none', () => {
    expect(QMAP['q1'].system).toBe('Test Pack');
  });

  it('preserves existing system on question', () => {
    BANK.length = 0;
    BANK.push({ id: 'P', title: 'Pack', color: '#000', questions: [
      { id: 'q3', system: 'Override', choices: [] },
    ]});
    buildIndex();
    expect(QMAP['q3'].system).toBe('Override');
  });

  it('clears stale entries when called again', () => {
    BANK.length = 0;
    BANK.push({ id: 'NEW', title: 'New', color: '#000', questions: [{ id: 'q99', choices: [] }] });
    buildIndex();
    expect(QMAP['q1']).toBeUndefined();
    expect(QMAP['q99']).toBeDefined();
  });
});

describe('correctLabel', () => {
  it('returns the label of the correct choice', () => {
    const q = { choices: [{ l: 'A', correct: false }, { l: 'B', correct: true }] };
    expect(correctLabel(q)).toBe('B');
  });

  it('returns the first correct label', () => {
    const q = { choices: [{ l: 'A', correct: true }, { l: 'B', correct: true }] };
    expect(correctLabel(q)).toBe('A');
  });

  it('returns null when no choice is correct', () => {
    const q = { choices: [{ l: 'A', correct: false }] };
    expect(correctLabel(q)).toBeNull();
  });

  it('returns null for empty choices array', () => {
    expect(correctLabel({ choices: [] })).toBeNull();
  });

  it('handles choice with no correct property', () => {
    const q = { choices: [{ l: 'A' }, { l: 'B', correct: true }] };
    expect(correctLabel(q)).toBe('B');
  });
});
