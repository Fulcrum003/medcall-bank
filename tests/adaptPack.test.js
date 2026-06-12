import { describe, it, expect } from 'vitest';
import { adaptPack } from '../app.js';

const baseChoice = { label: 'A', text: 'Option A', correct: true, explanation: 'Reason A' };
const baseQuestion = {
  id: 'q1',
  stem: 'What is X?',
  choices: [baseChoice, { label: 'B', text: 'Option B', correct: false, explanation: 'Reason B' }],
  keyPoint: 'Key point here',
};

describe('adaptPack — basic structure', () => {
  it('maps packId, title, and color', () => {
    const pack = adaptPack({ packId: 'TEST', title: 'Test Pack', color: '#ff0000', questions: [] });
    expect(pack.id).toBe('TEST');
    expect(pack.title).toBe('Test Pack');
    expect(pack.color).toBe('#ff0000');
  });

  it('defaults color to #3fb6a8 when absent', () => {
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [] });
    expect(pack.color).toBe('#3fb6a8');
  });

  it('produces empty questions array from empty input', () => {
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [] });
    expect(pack.questions).toEqual([]);
  });
});

describe('adaptPack — question field mapping', () => {
  it('maps id, stem, keyPoint', () => {
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [baseQuestion] });
    const q = pack.questions[0];
    expect(q.id).toBe('q1');
    expect(q.stem).toBe('What is X?');
    expect(q.keyPoint).toBe('Key point here');
  });

  it('maps choice fields: label→l, text→t, correct, explanation→e', () => {
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [baseQuestion] });
    const c = pack.questions[0].choices[0];
    expect(c.l).toBe('A');
    expect(c.t).toBe('Option A');
    expect(c.correct).toBe(true);
    expect(c.e).toBe('Reason A');
  });

  it('defaults type to "mcq" when absent', () => {
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [baseQuestion] });
    expect(pack.questions[0].type).toBe('mcq');
  });

  it('preserves explicit type (e.g. "emq", "sa")', () => {
    const q = { ...baseQuestion, type: 'emq' };
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [q] });
    expect(pack.questions[0].type).toBe('emq');
  });
});

describe('adaptPack — system and topic parsing', () => {
  it('topic with " · " separator: system = first part, topic = rest', () => {
    const q = { ...baseQuestion, topic: 'Surgery · Haemorrhage' };
    const pack = adaptPack({ packId: 'P', title: 'Pack Title', questions: [q] });
    const out = pack.questions[0];
    expect(out.system).toBe('Surgery');
    expect(out.topic).toBe('Haemorrhage');
  });

  it('topic without separator: topic passes through, system falls back to pack title', () => {
    const q = { ...baseQuestion, topic: 'PPH' };
    const pack = adaptPack({ packId: 'P', title: 'Obstetrics', questions: [q] });
    const out = pack.questions[0];
    expect(out.system).toBe('Obstetrics');
    expect(out.topic).toBe('PPH');
  });

  it('explicit q.system overrides pack title', () => {
    const q = { ...baseQuestion, system: 'My System', topic: 'My Topic' };
    const pack = adaptPack({ packId: 'P', title: 'Pack Title', questions: [q] });
    expect(pack.questions[0].system).toBe('My System');
  });

  it('absent topic defaults to "General"', () => {
    const q = { id: 'q2', stem: 'X?', choices: [] };
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [q] });
    expect(pack.questions[0].topic).toBe('General');
  });
});

describe('adaptPack — source and reference', () => {
  it('source as string passes through cleanly', () => {
    const q = { ...baseQuestion, source: 'Block 2 · Univ of Kufa' };
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [q] });
    expect(pack.questions[0].source).toBe('Block 2 · Univ of Kufa');
  });

  it('source as object {paper, institution} is joined with " · "', () => {
    const q = { ...baseQuestion, source: { paper: 'Paper A', institution: 'Hospital B' } };
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [q] });
    expect(pack.questions[0].source).toBe('Paper A · Hospital B');
  });

  it('explicit reference field is used', () => {
    const q = { ...baseQuestion, reference: 'My Ref' };
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [q] });
    expect(pack.questions[0].reference).toBe('My Ref');
  });

  it('falls back to source.paper as reference when no reference field', () => {
    const q = { ...baseQuestion, source: { paper: 'Paper X', institution: 'Inst' } };
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [q] });
    expect(pack.questions[0].reference).toBe('Paper X');
  });

  it('falls back to "Other" when no reference available', () => {
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [{ id: 'q', stem: 'S', choices: [] }] });
    expect(pack.questions[0].reference).toBe('Other');
  });
});

describe('adaptPack — optional fields', () => {
  it('keyDiff (keyDifferentiator) is mapped', () => {
    const q = { ...baseQuestion, keyDifferentiator: 'The diff' };
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [q] });
    expect(pack.questions[0].keyDiff).toBe('The diff');
  });

  it('summaryTable is mapped to sum', () => {
    const sum = { headers: ['A', 'B'], rows: [['x', 'y']] };
    const q = { ...baseQuestion, summaryTable: sum };
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [q] });
    expect(pack.questions[0].sum).toEqual(sum);
  });

  it('flag is mapped with renamed fields', () => {
    const flag = { severity: 'HIGH', appAnswer: 'B', correctAnswer: 'A', source: 'NICE', note: 'Note' };
    const q = { ...baseQuestion, flag };
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [q] });
    const f = pack.questions[0].flag;
    expect(f.severity).toBe('HIGH');
    expect(f.app).toBe('B');
    expect(f.correct).toBe('A');
    expect(f.source).toBe('NICE');
    expect(f.note).toBe('Note');
  });

  it('absent flag produces undefined', () => {
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [baseQuestion] });
    expect(pack.questions[0].flag).toBeUndefined();
  });

  it('absent modelAnswer produces null', () => {
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [baseQuestion] });
    expect(pack.questions[0].modelAnswer).toBeNull();
  });

  it('absent optionsTitle produces null', () => {
    const pack = adaptPack({ packId: 'P', title: 'T', questions: [baseQuestion] });
    expect(pack.questions[0].optionsTitle).toBeNull();
  });
});
