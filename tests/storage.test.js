import { describe, it, expect, beforeEach } from 'vitest';

describe('STORE adapter (localStorage in jsdom)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and retrieves a string value', async () => {
    const { wsGet, wsSet } = await import('../app.js');
    await wsSet('test:key', 'hello');
    const val = await wsGet('test:key');
    expect(val).toBe('hello');
  });

  it('stores and retrieves an object', async () => {
    const { wsGet, wsSet } = await import('../app.js');
    const obj = { a: 1, b: [1, 2, 3] };
    await wsSet('test:obj', obj);
    const result = await wsGet('test:obj');
    expect(result).toEqual(obj);
  });

  it('returns null for an unset key', async () => {
    const { wsGet } = await import('../app.js');
    const result = await wsGet('test:nonexistent');
    expect(result).toBeNull();
  });

  it('overwrites existing value', async () => {
    const { wsGet, wsSet } = await import('../app.js');
    await wsSet('test:x', 1);
    await wsSet('test:x', 2);
    expect(await wsGet('test:x')).toBe(2);
  });

  it('STORE kind is "local" in jsdom environment', async () => {
    const { STORE } = await import('../app.js');
    expect(STORE.kind).toBe('local');
  });
});
