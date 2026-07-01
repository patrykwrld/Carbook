import { describe, expect, it } from 'vitest';
import {
  checkAbuse,
  hasAlreadyFlagged,
  MAX_COMMENTS_PER_USER_PER_DAY,
  MAX_COMMENTS_PER_USER_PER_PLATE_PER_DAY,
  MIN_SECONDS_BETWEEN_COMMENTS,
  recordComment,
  recordFlag,
} from '../src/abuse';

class InMemoryKV {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

function kv(): any {
  return new InMemoryKV();
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('checkAbuse + recordComment', () => {
  it('allows a fresh user/plate combination', async () => {
    const store = kv();
    const result = await checkAbuse(store, 'user1', 'ABC123', Date.now());
    expect(result.allowed).toBe(true);
  });

  it('blocks a second comment posted too soon after the first', async () => {
    const store = kv();
    const t0 = Date.now();
    await recordComment(store, 'user1', 'ABC123', t0);
    const result = await checkAbuse(store, 'user1', 'ABC123', t0 + 1000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('TOO_FAST');
  });

  it('allows a second comment once the minimum interval has passed', async () => {
    const store = kv();
    const t0 = Date.now();
    await recordComment(store, 'user1', 'ABC123', t0);
    const result = await checkAbuse(store, 'user1', 'ABC123', t0 + MIN_SECONDS_BETWEEN_COMMENTS * 1000 + 1);
    expect(result.allowed).toBe(true);
  });

  it('enforces the daily comment cap across distinct plates', async () => {
    const store = kv();
    let t = Date.now();
    const plates = Array.from({ length: MAX_COMMENTS_PER_USER_PER_DAY }, (_, i) => `PLATE${i}`);
    for (const plate of plates) {
      const check = await checkAbuse(store, 'user1', plate, t);
      expect(check.allowed).toBe(true);
      await recordComment(store, 'user1', plate, t);
      t += MIN_SECONDS_BETWEEN_COMMENTS * 1000 + 1;
    }
    const overLimit = await checkAbuse(store, 'user1', 'ONE_MORE', t);
    expect(overLimit.allowed).toBe(false);
    expect(overLimit.reason).toBe('DAILY_LIMIT_EXCEEDED');
  });

  it('mitigates single-plate targeting by one user', async () => {
    const store = kv();
    let t = Date.now();
    for (let i = 0; i < MAX_COMMENTS_PER_USER_PER_PLATE_PER_DAY; i++) {
      const check = await checkAbuse(store, 'user1', 'TARGET1', t);
      expect(check.allowed).toBe(true);
      await recordComment(store, 'user1', 'TARGET1', t);
      t += MIN_SECONDS_BETWEEN_COMMENTS * 1000 + 1;
    }
    const overLimit = await checkAbuse(store, 'user1', 'TARGET1', t);
    expect(overLimit.allowed).toBe(false);
    expect(overLimit.reason).toBe('PLATE_TARGETING_LIMIT_EXCEEDED');
  });

  it('does not consume the daily quota when a check is rejected', async () => {
    const store = kv();
    const t0 = Date.now();
    await recordComment(store, 'user1', 'ABC123', t0);
    await checkAbuse(store, 'user1', 'ABC123', t0 + 500); // rejected: too fast
    const dailyRaw = await store.get('user:user1:daily_count');
    expect(dailyRaw).toBe('1');
  });

  it('tracks per-plate and per-day counters independently per user', async () => {
    const store = kv();
    const t0 = Date.now();
    await recordComment(store, 'user1', 'ABC123', t0);
    const otherUserCheck = await checkAbuse(store, 'user2', 'ABC123', t0 + 500);
    expect(otherUserCheck.allowed).toBe(true);
  });
});

describe('flag dedupe', () => {
  it('lets a user flag a comment once', async () => {
    const store = kv();
    expect(await hasAlreadyFlagged(store, 'user1', 42)).toBe(false);
    await recordFlag(store, 'user1', 42);
    expect(await hasAlreadyFlagged(store, 'user1', 42)).toBe(true);
  });

  it('tracks flags independently per comment and per user', async () => {
    const store = kv();
    await recordFlag(store, 'user1', 1);
    expect(await hasAlreadyFlagged(store, 'user1', 2)).toBe(false);
    expect(await hasAlreadyFlagged(store, 'user2', 1)).toBe(false);
  });
});
