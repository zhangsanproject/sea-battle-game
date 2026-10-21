import { describe, expect, it } from 'vitest';
import {
  EMPTY_RECORDS,
  RECORDS_KEY,
  loadRecords,
  submitRun,
} from '../src/game/records';
import type { KeyValueStorage } from '../src/platform/PlatformAdapter';

function createStorage(seed: Record<string, string> = {}): KeyValueStorage {
  const values = new Map<string, string>(Object.entries(seed));

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

const SUMMARY = {
  survivalSeconds: 92.7,
  kills: 14,
  level: 7,
  bossKills: 1,
  bestStreak: 5,
};

describe('run records', () => {
  it('starts empty when nothing has been stored', () => {
    expect(loadRecords(createStorage())).toEqual(EMPTY_RECORDS);
  });

  it('survives a missing storage implementation', () => {
    expect(loadRecords(null)).toEqual(EMPTY_RECORDS);
    expect(submitRun(null, SUMMARY).isNewRecord).toBe(true);
  });

  it('writes the run and reports the first record', () => {
    const storage = createStorage();
    const result = submitRun(storage, SUMMARY);

    expect(result.isNewRecord).toBe(true);
    expect(result.previousBestKills).toBe(0);
    expect(result.records.bestKills).toBe(14);
    expect(result.records.totalRuns).toBe(1);

    const reloaded = loadRecords(storage);
    expect(reloaded).toEqual(result.records);
  });

  it('keeps the best of each field independently', () => {
    const storage = createStorage();

    submitRun(storage, {
      survivalSeconds: 200,
      kills: 9,
      level: 12,
      bossKills: 0,
      bestStreak: 3,
    });

    const second = submitRun(storage, {
      survivalSeconds: 60,
      kills: 3,
      level: 4,
      bossKills: 2,
      bestStreak: 7,
    });

    expect(second.records.bestSurvivalSeconds).toBe(200);
    expect(second.records.bestKills).toBe(9);
    expect(second.records.bestLevel).toBe(12);
    expect(second.records.bestBossKills).toBe(2);
    expect(second.records.bestStreak).toBe(7);
    expect(second.records.totalRuns).toBe(2);
  });

  it('only flags a record when the kill count is beaten', () => {
    const storage = createStorage();
    submitRun(storage, SUMMARY);

    const worse = submitRun(storage, { ...SUMMARY, kills: 13 });
    expect(worse.isNewRecord).toBe(false);
    expect(worse.previousBestKills).toBe(14);

    const tie = submitRun(storage, { ...SUMMARY, kills: 14 });
    expect(tie.isNewRecord).toBe(false);

    const better = submitRun(storage, { ...SUMMARY, kills: 15 });
    expect(better.isNewRecord).toBe(true);
    expect(better.records.bestKills).toBe(15);
  });

  it('falls back to zeros when the stored payload is corrupt', () => {
    const storage = createStorage({ [RECORDS_KEY]: '{not json' });
    expect(loadRecords(storage)).toEqual(EMPTY_RECORDS);

    const garbage = createStorage({
      [RECORDS_KEY]: JSON.stringify({ bestKills: -4, totalRuns: 'many' }),
    });
    expect(loadRecords(garbage)).toEqual(EMPTY_RECORDS);
  });

  it('still returns a result when the write throws', () => {
    const storage = createStorage();
    const throwing: KeyValueStorage = {
      ...storage,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };

    const result = submitRun(throwing, SUMMARY);
    expect(result.records.bestKills).toBe(14);
    expect(result.isNewRecord).toBe(true);
  });

  it('ignores fractional values when comparing', () => {
    const storage = createStorage();
    const result = submitRun(storage, { ...SUMMARY, kills: 4.9 });

    expect(result.records.bestKills).toBe(4);
  });
});
