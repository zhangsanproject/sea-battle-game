import type { KeyValueStorage } from '../platform/PlatformAdapter';

/** Numbers produced by a single run and compared against the stored best. */
export interface RunSummary {
  survivalSeconds: number;
  kills: number;
  level: number;
  bossKills: number;
  bestStreak: number;
}

export interface RunRecords {
  bestKills: number;
  bestSurvivalSeconds: number;
  bestLevel: number;
  bestBossKills: number;
  bestStreak: number;
  totalRuns: number;
}

export interface RecordResult {
  records: RunRecords;
  /** True when this run beat the stored kill count. */
  isNewRecord: boolean;
  previousBestKills: number;
}

export const RECORDS_KEY = 'sea-battle:records';

export const EMPTY_RECORDS: RunRecords = {
  bestKills: 0,
  bestSurvivalSeconds: 0,
  bestLevel: 0,
  bestBossKills: 0,
  bestStreak: 0,
  totalRuns: 0,
};

function toCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

/**
 * Reads the persisted best-of record.
 * Storage can be missing (mini-game runtime without `tt`, tests), hold a
 * half-written value, or be a different schema; every case falls back to
 * zeros instead of throwing mid-run.
 */
export function loadRecords(storage: KeyValueStorage | null): RunRecords {
  if (!storage) {
    return { ...EMPTY_RECORDS };
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(RECORDS_KEY);
  } catch {
    return { ...EMPTY_RECORDS };
  }

  if (!raw) {
    return { ...EMPTY_RECORDS };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      bestKills: toCount(parsed.bestKills),
      bestSurvivalSeconds: toCount(parsed.bestSurvivalSeconds),
      bestLevel: toCount(parsed.bestLevel),
      bestBossKills: toCount(parsed.bestBossKills),
      bestStreak: toCount(parsed.bestStreak),
      totalRuns: toCount(parsed.totalRuns),
    };
  } catch {
    return { ...EMPTY_RECORDS };
  }
}

/**
 * Merges a finished run into the stored record and writes it back.
 * The kill count is the headline metric, everything else only ever grows.
 */
export function submitRun(
  storage: KeyValueStorage | null,
  summary: RunSummary,
): RecordResult {
  const previous = loadRecords(storage);
  const records: RunRecords = {
    bestKills: Math.max(previous.bestKills, toCount(summary.kills)),
    bestSurvivalSeconds: Math.max(
      previous.bestSurvivalSeconds,
      toCount(summary.survivalSeconds),
    ),
    bestLevel: Math.max(previous.bestLevel, toCount(summary.level)),
    bestBossKills: Math.max(previous.bestBossKills, toCount(summary.bossKills)),
    bestStreak: Math.max(previous.bestStreak, toCount(summary.bestStreak)),
    totalRuns: previous.totalRuns + 1,
  };

  try {
    storage?.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // A failed write only costs the next session's comparison.
  }

  return {
    records,
    isNewRecord: records.bestKills > previous.bestKills,
    previousBestKills: previous.bestKills,
  };
}
