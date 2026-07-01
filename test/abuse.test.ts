import { describe, expect, it } from 'vitest';
import {
  checkAbuse,
  MAX_SUBMISSIONS_PER_USER_PER_DAY,
  MAX_SUBMISSIONS_PER_USER_PER_PLATE_PER_DAY,
  recordSubmission,
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

describe('checkAbuse + recordSubmission', () => {
  it('allows a fresh user/plate/type combination', async () => {
    const store = kv();
    const result = await checkAbuse(store, 'user1', 'ABC123', 'SAFE_DRIVING');
    expect(result.allowed).toBe(true);
  });

  it('blocks a duplicate user+plate+type submission', async () => {
    const store = kv();
    await recordSubmission(store, 'user1', 'ABC123', 'SAFE_DRIVING');
    const result = await checkAbuse(store, 'user1', 'ABC123', 'SAFE_DRIVING');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('DUPLICATE_SUBMISSION');
  });

  it('allows the same user to submit a different feedback type for the same plate', async () => {
    const store = kv();
    await recordSubmission(store, 'user1', 'ABC123', 'SAFE_DRIVING');
    const result = await checkAbuse(store, 'user1', 'ABC123', 'LET_MERGE');
    expect(result.allowed).toBe(true);
  });

  it('enforces the daily submission cap across distinct plates', async () => {
    const store = kv();
    const plates = ['A1', 'A2', 'A3', 'A4', 'A5'];
    for (const plate of plates) {
      const check = await checkAbuse(store, 'user1', plate, 'SAFE_DRIVING');
      expect(check.allowed).toBe(true);
      await recordSubmission(store, 'user1', plate, 'SAFE_DRIVING');
    }
    expect(plates.length).toBe(MAX_SUBMISSIONS_PER_USER_PER_DAY);
    const overLimit = await checkAbuse(store, 'user1', 'A6', 'SAFE_DRIVING');
    expect(overLimit.allowed).toBe(false);
    expect(overLimit.reason).toBe('DAILY_LIMIT_EXCEEDED');
  });

  it('mitigates single-plate targeting by one user', async () => {
    const store = kv();
    const types: Array<'SAFE_DRIVING' | 'LET_MERGE' | 'AGGRESSIVE_DRIVING'> = [
      'SAFE_DRIVING',
      'LET_MERGE',
      'AGGRESSIVE_DRIVING',
    ];
    for (let i = 0; i < MAX_SUBMISSIONS_PER_USER_PER_PLATE_PER_DAY; i++) {
      const check = await checkAbuse(store, 'user1', 'TARGET1', types[i]);
      expect(check.allowed).toBe(true);
      await recordSubmission(store, 'user1', 'TARGET1', types[i]);
    }
    const nextType = types[MAX_SUBMISSIONS_PER_USER_PER_PLATE_PER_DAY];
    const overLimit = await checkAbuse(store, 'user1', 'TARGET1', nextType);
    expect(overLimit.allowed).toBe(false);
    expect(overLimit.reason).toBe('PLATE_TARGETING_LIMIT_EXCEEDED');
  });

  it('does not consume quota when a check is rejected', async () => {
    const store = kv();
    await recordSubmission(store, 'user1', 'ABC123', 'SAFE_DRIVING');
    await checkAbuse(store, 'user1', 'ABC123', 'SAFE_DRIVING'); // rejected duplicate, not recorded
    const dailyRaw = await store.get('user:user1:daily_count');
    expect(dailyRaw).toBe('1');
  });
});
