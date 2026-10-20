import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/game/config';
import { PlayerShip } from '../src/game/entities/PlayerShip';
import { ProgressionSystem, selectUpgradeChoices } from '../src/game/progression/ProgressionSystem';
import { UPGRADE_DEFINITIONS } from '../src/game/progression/upgradeDefinitions';
import {
  createCombatStats,
  type UpgradeId,
} from '../src/game/progression/types';

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function maxedLevels(except?: UpgradeId): Record<UpgradeId, number> {
  return Object.fromEntries(
    UPGRADE_DEFINITIONS.map((definition) => [
      definition.id,
      definition.id === except
        ? Math.max(0, definition.maxLevel - 1)
        : definition.maxLevel,
    ]),
  ) as Record<UpgradeId, number>;
}

describe('ProgressionSystem', () => {
  it('levels up only when experience reaches the threshold and queues one choice', () => {
    const player = new PlayerShip();
    const progression = new ProgressionSystem(player, createRandom(1));
    const threshold = GAME_CONFIG.progression.baseExperience;

    expect(progression.currentLevel).toBe(1);
    expect(progression.currentExperience).toBe(0);
    expect(progression.experienceRequired).toBe(threshold);

    progression.addExperience(threshold - 1);
    expect(progression.currentLevel).toBe(1);
    expect(progression.hasPendingLevelUp).toBe(false);

    progression.addExperience(1);
    expect(progression.currentLevel).toBe(2);
    expect(progression.currentExperience).toBe(0);
    expect(progression.hasPendingLevelUp).toBe(true);
    expect(player.status.level).toBe(2);

    player.dispose();
  });

  it('offers exactly three unique and legal upgrades', () => {
    const player = new PlayerShip();
    const progression = new ProgressionSystem(player, createRandom(42));
    progression.addExperience(GAME_CONFIG.progression.baseExperience);

    const offers = progression.beginUpgradeSelection();

    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((offer) => offer.id)).size).toBe(3);

    for (const offer of offers) {
      const definition = UPGRADE_DEFINITIONS.find(
        (candidate) => candidate.id === offer.id,
      );
      expect(definition).toBeDefined();
      expect(offer.nextLevel).toBeGreaterThanOrEqual(1);
      expect(offer.nextLevel).toBeLessThanOrEqual(offer.maxLevel);
      expect(offer.description.length).toBeGreaterThan(0);
    }

    player.dispose();
  });

  it('applies the chosen upgrade to shared gameplay stats', () => {
    const player = new PlayerShip();
    const progression = new ProgressionSystem(player, createRandom(7));
    progression.addExperience(GAME_CONFIG.progression.baseExperience);

    const offers = progression.beginUpgradeSelection();
    const chosen = offers[0];
    if (!chosen) {
      throw new Error('Expected an upgrade offer');
    }

    const before = {
      ...progression.combatStats,
      maxHealth: player.status.maxHealth,
      armor: player.armor,
    };

    expect(progression.applyUpgrade(chosen.id)).toBe(true);
    expect(progression.hasPendingLevelUp).toBe(false);
    expect(progression.applyUpgrade(chosen.id)).toBe(false);

    const stats = progression.combatStats;
    const changed =
      stats.weaponDamage !== before.weaponDamage ||
      stats.fireInterval !== before.fireInterval ||
      stats.projectileCount !== before.projectileCount ||
      stats.weaponRange !== before.weaponRange ||
      stats.moveSpeed !== before.moveSpeed ||
      stats.secondaryLevel !== before.secondaryLevel ||
      stats.torpedoLevel !== before.torpedoLevel ||
      stats.missileLevel !== before.missileLevel ||
      stats.experienceMultiplier !== before.experienceMultiplier ||
      stats.magnetRadiusBonus !== before.magnetRadiusBonus ||
      stats.repairOnKill !== before.repairOnKill ||
      player.status.maxHealth !== before.maxHealth ||
      player.armor !== before.armor;

    expect(changed).toBe(true);
    expect(progression.getUpgradeLevel(chosen.id)).toBe(1);

    player.dispose();
  });

  it('excludes maxed upgrades and never returns duplicates', () => {
    const onlyHealth = selectUpgradeChoices(
      UPGRADE_DEFINITIONS,
      maxedLevels('health'),
      3,
      createRandom(99),
    );

    expect(onlyHealth).toHaveLength(1);
    expect(onlyHealth[0]?.id).toBe('health');

    const none = selectUpgradeChoices(
      UPGRADE_DEFINITIONS,
      maxedLevels(),
      3,
      createRandom(4),
    );
    expect(none).toHaveLength(0);
  });

  it('all upgrade definitions mutate the expected run state', () => {
    for (const definition of UPGRADE_DEFINITIONS) {
      const player = new PlayerShip();
      const stats = createCombatStats();
      const before = { ...stats };
      const beforeHealth = player.status.health;
      const beforeMaxHealth = player.status.maxHealth;
      const beforeArmor = player.armor;

      definition.apply({ stats, player });

      switch (definition.id) {
        case 'damage':
          expect(stats.weaponDamage).toBeGreaterThan(before.weaponDamage);
          break;
        case 'fireRate':
          expect(stats.fireInterval).toBeLessThan(before.fireInterval);
          break;
        case 'projectileCount':
          expect(stats.projectileCount).toBeGreaterThan(
            before.projectileCount,
          );
          break;
        case 'range':
          expect(stats.weaponRange).toBeGreaterThan(before.weaponRange);
          break;
        case 'speed':
          expect(stats.moveSpeed).toBeGreaterThan(before.moveSpeed);
          break;
        case 'health':
          expect(player.status.maxHealth).toBeGreaterThan(beforeMaxHealth);
          expect(player.status.health).toBeGreaterThanOrEqual(beforeHealth);
          break;
        case 'secondary':
          expect(stats.secondaryLevel).toBeGreaterThan(
            before.secondaryLevel,
          );
          break;
        case 'torpedo':
          expect(stats.torpedoLevel).toBeGreaterThan(before.torpedoLevel);
          break;
        case 'missile':
          expect(stats.missileLevel).toBeGreaterThan(before.missileLevel);
          break;
        case 'armor':
          expect(player.armor).toBeGreaterThan(beforeArmor);
          break;
        case 'repair':
          expect(stats.repairOnKill).toBeGreaterThan(before.repairOnKill);
          break;
        case 'magnet':
          expect(stats.magnetRadiusBonus).toBeGreaterThan(
            before.magnetRadiusBonus,
          );
          break;
        case 'experience':
          expect(stats.experienceMultiplier).toBeGreaterThan(
            before.experienceMultiplier,
          );
          break;
      }

      player.dispose();
    }
  });

  it('queues multiple level-ups from a single large experience gain', () => {
    const player = new PlayerShip();
    const progression = new ProgressionSystem(player, createRandom(3));
    const firstThreshold = GAME_CONFIG.progression.baseExperience;
    const secondThreshold =
      firstThreshold + GAME_CONFIG.progression.experienceGrowth;

    progression.addExperience(firstThreshold + secondThreshold);

    expect(progression.currentLevel).toBe(3);
    expect(progression.hasPendingLevelUp).toBe(true);

    const offers = progression.beginUpgradeSelection();
    const first = offers[0];
    if (!first) {
      throw new Error('Expected an upgrade offer');
    }

    expect(progression.applyUpgrade(first.id)).toBe(true);
    expect(progression.hasPendingLevelUp).toBe(true);

    const nextOffers = progression.beginUpgradeSelection();
    expect(nextOffers).toHaveLength(3);

    player.dispose();
  });

  it('starts a fresh run with default state', () => {    const firstPlayer = new PlayerShip();
    const firstProgression = new ProgressionSystem(
      firstPlayer,
      createRandom(5),
    );
    firstProgression.addExperience(1000);
    const offers = firstProgression.beginUpgradeSelection();
    const firstOffer = offers[0];
    if (!firstOffer) {
      throw new Error('Expected an upgrade offer');
    }
    firstProgression.applyUpgrade(firstOffer.id);

    const secondPlayer = new PlayerShip();
    const secondProgression = new ProgressionSystem(
      secondPlayer,
      createRandom(5),
    );

    expect(secondProgression.currentLevel).toBe(1);
    expect(secondProgression.currentExperience).toBe(0);
    expect(secondProgression.hasPendingLevelUp).toBe(false);
    expect(secondProgression.combatStats).toEqual(createCombatStats());
    expect(secondPlayer.status.level).toBe(1);
    expect(secondPlayer.status.maxHealth).toBe(
      GAME_CONFIG.player.maxHealth,
    );

    firstPlayer.dispose();
    secondPlayer.dispose();
  });
});

describe('weapon unlocks', () => {
  it('starts a run with the main gun only', () => {
    const player = new PlayerShip();
    const progression = new ProgressionSystem(player, createRandom(13));
    const stats = progression.combatStats;

    expect(stats.secondaryLevel).toBe(0);
    expect(stats.torpedoLevel).toBe(0);
    expect(stats.missileLevel).toBe(0);

    player.setSecondaryWeaponLevel(stats.secondaryLevel);
    player.setTorpedoWeaponLevel(stats.torpedoLevel);
    player.setMissileWeaponLevel(stats.missileLevel);

    expect(
      player.getSecondaryMuzzleWorldPositions([new Vector3(), new Vector3()]),
    ).toBe(0);
    expect(
      player.getMissileMuzzleWorldPositions(
        Array.from({ length: 4 }, () => new Vector3()),
      ),
    ).toBe(0);

    player.dispose();
  });

  it('offers a locked weapon first while any weapon is still missing', () => {
    const player = new PlayerShip();
    // random() === 0 keeps the unlock branch deterministic.
    const progression = new ProgressionSystem(player, () => 0);
    progression.addExperience(GAME_CONFIG.progression.baseExperience);

    const offers = progression.beginUpgradeSelection();
    const first = offers[0];

    expect(first).toBeDefined();
    expect(['secondary', 'torpedo', 'missile']).toContain(first?.id);
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((offer) => offer.id)).size).toBe(3);

    player.dispose();
  });

  it('stops pushing the same weapon once it is installed', () => {
    const player = new PlayerShip();
    const progression = new ProgressionSystem(player, () => 0);
    progression.addExperience(600);

    const offers = progression.beginUpgradeSelection();
    const unlock = offers[0];
    if (!unlock) {
      throw new Error('Expected an unlock offer');
    }

    expect(progression.applyUpgrade(unlock.id)).toBe(true);

    const nextOffers = progression.beginUpgradeSelection();
    expect(nextOffers[0]?.id).not.toBe(unlock.id);

    player.dispose();
  });

  it('guarantees a weapon on the first level-up even with unlucky rolls', () => {
    const player = new PlayerShip();
    // 0.99 fails the coin flip, so only the first-level guarantee can fire.
    const progression = new ProgressionSystem(player, () => 0.99);
    progression.addExperience(GAME_CONFIG.progression.baseExperience);

    const offers = progression.beginUpgradeSelection();
    const weaponIds = offers
      .map((offer) => offer.id)
      .filter((id) => ['secondary', 'torpedo', 'missile'].includes(id));

    expect(weaponIds.length).toBeGreaterThan(0);

    player.dispose();
  });

  it('falls back to the normal pool once every weapon is installed', () => {
    const player = new PlayerShip();
    const progression = new ProgressionSystem(player, () => 0);
    progression.addExperience(5000);

    for (let step = 0; step < 20; step += 1) {
      const offers = progression.beginUpgradeSelection();
      if (offers.length === 0) {
        break;
      }
      const weapon = offers.find((offer) =>
        ['secondary', 'torpedo', 'missile'].includes(offer.id),
      );
      progression.applyUpgrade(weapon?.id ?? offers[0]!.id);
      if (
        progression.combatStats.secondaryLevel > 0 &&
        progression.combatStats.torpedoLevel > 0 &&
        progression.combatStats.missileLevel > 0
      ) {
        break;
      }
    }

    expect(progression.combatStats.secondaryLevel).toBeGreaterThan(0);
    expect(progression.combatStats.torpedoLevel).toBeGreaterThan(0);
    expect(progression.combatStats.missileLevel).toBeGreaterThan(0);

    player.dispose();
  });
});
