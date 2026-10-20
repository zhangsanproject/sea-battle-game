import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCombatStats } from '../src/game/progression/types';
import { PlayerShip } from '../src/game/entities/PlayerShip';
import { EnemyManager } from '../src/game/systems/EnemyManager';
import { MissileSystem } from '../src/game/systems/MissileSystem';
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

  it('builds missile pods and launches guided missiles', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const stats = createCombatStats();
    player.setMissileWeaponLevel(stats.missileLevel);

    expect(
      player.getMissileMuzzleWorldPositions(
        Array.from({ length: 4 }, () => new Vector3()),
      ),
    ).toBe(4);

    let fireCalls = 0;
    const projectiles = new ProjectileSystem({
      enemies,
      player,
      onEnemyKilled: () => {},
      onPlayerHit: () => {},
    });
    const missiles = new MissileSystem(
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
      missiles.update(1 / 60);
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

  it('steers missiles into the locked target and damages nearby ships', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const primary = enemies.getEnemies()[0];
    if (!primary) {
      throw new Error('Expected a starting enemy');
    }

    const nearby = enemies.spawnEnemy(
      primary.profile,
      primary.root.position.x + 1.5,
      primary.root.position.z,
      0,
      0,
      1,
    );
    if (!nearby) {
      throw new Error('Expected a nearby enemy');
    }

    const projectiles = new ProjectileSystem({
      enemies,
      player,
      onEnemyKilled: () => {},
      onPlayerHit: () => {},
    });
    const origin = new Vector3(
      primary.root.position.x,
      2,
      primary.root.position.z - 12,
    );
    const aimPoint = primary.getAimPoint(new Vector3());

    projectiles.fire(origin, aimPoint, {
      owner: 'player',
      speed: 26,
      damage: 30,
      maxDistance: 68,
      kind: 'missile',
      homingTarget: primary,
      verticalLaunchSeconds: 0.3,
      turnRate: 3.2,
      splashRadius: 3.8,
      splashDamageFactor: 0.55,
    });

    for (let frame = 0; frame < 600; frame += 1) {
      projectiles.update(1 / 60);
      if (projectiles.getActiveCount() === 0) {
        break;
      }
    }

    expect(projectiles.getActiveCount()).toBe(0);
    expect(primary.currentHealth).toBeLessThan(primary.maxHealth);
    expect(nearby.currentHealth).toBeLessThan(nearby.maxHealth);

    projectiles.dispose();
    enemies.dispose();
    player.dispose();
  });

  it('launches missiles vertically before pitching toward the target', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const target = enemies.getEnemies()[0];
    if (!target) {
      throw new Error('Expected a starting enemy');
    }

    const projectiles = new ProjectileSystem({
      enemies,
      player,
      onEnemyKilled: () => {},
      onPlayerHit: () => {},
    });
    const origin = new Vector3(
      target.root.position.x,
      2,
      target.root.position.z - 3.5,
    );

    projectiles.fire(origin, target.getAimPoint(new Vector3()), {
      owner: 'player',
      speed: 26,
      damage: 30,
      maxDistance: 68,
      kind: 'missile',
      homingTarget: target,
      verticalLaunchSeconds: 0.3,
      turnRate: 3.2,
      splashRadius: 3.8,
      splashDamageFactor: 0.55,
    });

    for (let frame = 0; frame < 10; frame += 1) {
      projectiles.update(1 / 60);
    }

    expect(projectiles.getActiveCount()).toBe(1);
    expect(target.currentHealth).toBe(target.maxHealth);

    for (let frame = 0; frame < 600; frame += 1) {
      projectiles.update(1 / 60);
      if (projectiles.getActiveCount() === 0) {
        break;
      }
    }

    expect(target.currentHealth).toBeLessThan(target.maxHealth);

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
