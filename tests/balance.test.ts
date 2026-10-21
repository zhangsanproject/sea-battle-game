import { describe, expect, it } from 'vitest';
import {
  DANGER_STAGES,
  ENEMY_PROFILES,
  GAME_CONFIG,
  type EnemyProfileId,
} from '../src/game/config';

/** Damage a single main-gun shell lands on a hull after its armour. */
function shellDamageOn(id: EnemyProfileId): number {
  const profile = ENEMY_PROFILES[id];
  return Math.max(1, GAME_CONFIG.weapon.projectileDamage - profile.armor);
}

/** How many shells a full main-gun salvo puts into the air. */
const SALVO = GAME_CONFIG.weapon.projectileCount;

function shellsToSink(id: EnemyProfileId): number {
  return Math.ceil(ENEMY_PROFILES[id].maxHealth / shellDamageOn(id));
}

describe('early-game swarm pacing', () => {
  it('keeps the opening wave crowded', () => {
    expect(DANGER_STAGES[0]?.targetEnemyCount ?? 0).toBeGreaterThanOrEqual(10);
  });

  it('lets a single salvo remove anything in the opening wave', () => {
    // The whole point of the opening minute: point at a small boat, it dies.
    const opening = ['raider', 'interceptor', 'gunboat'] as const;

    for (const id of opening) {
      expect(shellsToSink(id)).toBeLessThanOrEqual(SALVO);
    }
  });

  it('leaves no opening chaff that shrugs off a shell', () => {
    for (const id of ['raider', 'interceptor', 'gunboat'] as const) {
      expect(
        shellDamageOn(id) / ENEMY_PROFILES[id].maxHealth,
      ).toBeGreaterThan(0.4);
    }
  });

  it('still makes the heavy hulls worth a second salvo', () => {
    expect(shellsToSink('destroyer')).toBeGreaterThan(SALVO);
    expect(shellsToSink('cruiser')).toBeGreaterThan(SALVO);
    expect(shellsToSink('boss')).toBeGreaterThan(SALVO * 4);
  });

  it('ramps the pressure instead of flattening it', () => {
    for (let index = 1; index < DANGER_STAGES.length; index += 1) {
      const previous = DANGER_STAGES[index - 1];
      const current = DANGER_STAGES[index];
      if (!previous || !current) {
        throw new Error('danger stage gap');
      }

      expect(current.targetEnemyCount).toBeGreaterThan(
        previous.targetEnemyCount,
      );
      expect(current.spawnIntervalSeconds).toBeLessThan(
        previous.spawnIntervalSeconds,
      );
    }
  });

  it('spawns fast enough that the arena actually fills up', () => {
    const first = DANGER_STAGES[0];
    if (!first) {
      throw new Error('missing opening stage');
    }

    // Otherwise the count cap could never be reached in a normal run.
    expect(first.spawnIntervalSeconds * first.targetEnemyCount).toBeLessThan(
      40,
    );
  });
});

describe('swarm density limits', () => {
  it('keeps the smallest hulls visually small', () => {
    expect(ENEMY_PROFILES.interceptor.visualScale).toBeLessThan(0.6);
    expect(ENEMY_PROFILES.raider.visualScale).toBeLessThan(0.7);
    expect(ENEMY_PROFILES.boss.visualScale).toBeGreaterThan(
      ENEMY_PROFILES.raider.visualScale * 2,
    );
  });

  it('scales the hit radius with the hull so shots do not miss thin air', () => {
    for (const profile of Object.values(ENEMY_PROFILES)) {
      expect(profile.hitRadius).toBeGreaterThan(profile.visualScale * 2);
    }
  });

  it('keeps a full swarm survivable for more than a few seconds', () => {
    const raider = ENEMY_PROFILES.raider;
    const player = GAME_CONFIG.player;
    // Every raider in range, firing on cooldown, after the player's armour.
    const dpsPerRaider =
      Math.max(1, raider.projectileDamage - player.armor) / raider.fireInterval;
    const fullSwarmDps =
      dpsPerRaider * (DANGER_STAGES[0]?.targetEnemyCount ?? 1);

    expect(player.maxHealth / fullSwarmDps).toBeGreaterThan(5);
  });
});
