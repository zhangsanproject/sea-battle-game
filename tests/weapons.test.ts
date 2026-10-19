import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCombatStats } from '../src/game/progression/types';
import { PlayerShip } from '../src/game/entities/PlayerShip';
import { EnemyManager } from '../src/game/systems/EnemyManager';
import { ProjectileSystem } from '../src/game/systems/ProjectileSystem';
import { SecondaryWeaponSystem } from '../src/game/systems/SecondaryWeaponSystem';
import { TargetingSystem } from '../src/game/systems/TargetingSystem';
import { TorpedoSystem } from '../src/game/systems/TorpedoSystem';

describe('expanded player weapons', () => {
  it('builds secondary hardpoints and fires a burst from them', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const stats = createCombatStats();
    player.setSecondaryWeaponLevel(stats.secondaryLevel);
    expect(
      player.getSecondaryMuzzleWorldPositions(
        Array.from({ length: 2 }, () => new Vector3()),
      ),
    ).toBe(2);

    let fireCalls = 0;
    const projectiles = new ProjectileSystem({
      enemies,
      player,
      onEnemyKilled: () => {},
      onPlayerHit: () => {},
    });
    const secondary = new SecondaryWeaponSystem(
      player,
      enemies,
      new TargetingSystem(),
      projectiles,
      stats,
      () => {
        fireCalls += 1;
      },
    );

    for (let frame = 0; frame < 300; frame += 1) {
      secondary.update(1 / 60);
      if (fireCalls > 0) {
        break;
      }
    }

    expect(fireCalls).toBeGreaterThan(0);
    expect(projectiles.getActiveCount()).toBeGreaterThan(0);

    projectiles.dispose();
    enemies.dispose();
    player.dispose();
  });

  it('unlocks torpedoes and fires a torpedo projectile', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const stats = createCombatStats();
    stats.torpedoLevel = 1;
    player.setTorpedoWeaponLevel(1);

    let fireCalls = 0;
    const projectiles = new ProjectileSystem({
      enemies,
      player,
      onEnemyKilled: () => {},
      onPlayerHit: () => {},
    });
    const torpedoes = new TorpedoSystem(
      player,
      enemies,
      new TargetingSystem(),
      projectiles,
      stats,
      () => {
        fireCalls += 1;
      },
    );

    for (let frame = 0; frame < 30; frame += 1) {
      torpedoes.update(1 / 60);
      if (fireCalls > 0) {
        break;
      }
    }

    expect(fireCalls).toBe(1);
    expect(projectiles.getActiveCount()).toBe(1);

    projectiles.dispose();
    enemies.dispose();
    player.dispose();
  });

  it('increases player armor through the armor stat', () => {
    const player = new PlayerShip();
    const originalArmor = player.armor;
    const firstHit = player.takeDamage(20);

    player.armor += 2;
    const secondHit = player.takeDamage(20);

    expect(secondHit).toBeLessThan(firstHit);
    expect(player.armor).toBe(originalArmor + 2);

    player.dispose();
  });
});
