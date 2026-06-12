import { describe, it, expect, vi } from 'vitest';
import { addDays, fmtTime, esc } from '../app.js';

describe('addDays', () => {
  it('adds days to a date string', () => {
    expect(addDays('2024-01-15', 5)).toBe('2024-01-20');
  });

  it('handles month boundary', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
  });

  it('handles leap year day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // 2024 is a leap year
  });

  it('handles leap year boundary', () => {
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
  });

  it('handles year boundary', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
  });

  it('handles zero increment', () => {
    expect(addDays('2024-06-15', 0)).toBe('2024-06-15');
  });

  it('handles negative increment', () => {
    expect(addDays('2024-06-15', -1)).toBe('2024-06-14');
  });

  it('handles large increment', () => {
    expect(addDays('2024-01-01', 365)).toBe('2024-12-31'); // 2024 is a leap year (366 days)
  });

  it('returns a 10-character ISO date string', () => {
    const result = addDays('2024-01-01', 1);
    expect(result).toHaveLength(10);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('fmtTime', () => {
  it('formats zero seconds', () => {
    expect(fmtTime(0)).toBe('0:00');
  });

  it('formats 59 seconds', () => {
    expect(fmtTime(59)).toBe('0:59');
  });

  it('formats exactly one minute', () => {
    expect(fmtTime(60)).toBe('1:00');
  });

  it('formats one hour minus one second', () => {
    expect(fmtTime(3599)).toBe('59:59');
  });

  it('pads single-digit seconds', () => {
    expect(fmtTime(65)).toBe('1:05');
  });

  it('clamps negative values to 0', () => {
    expect(fmtTime(-5)).toBe('0:00');
  });

  it('rounds fractional seconds', () => {
    expect(fmtTime(1.7)).toBe('0:02');
  });
});

describe('esc', () => {
  it('escapes ampersand', () => {
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes greater-than', () => {
    expect(esc('x > y')).toBe('x &gt; y');
  });

  it('escapes double quotes', () => {
    expect(esc('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes multiple special chars in one string', () => {
    expect(esc('<a href="x&y">')).toBe('&lt;a href=&quot;x&amp;y&quot;&gt;');
  });

  it('passes through plain text unchanged', () => {
    expect(esc('hello world 123')).toBe('hello world 123');
  });

  it('coerces non-string via String()', () => {
    expect(esc(42)).toBe('42');
    expect(esc(null)).toBe('null');
  });
});
