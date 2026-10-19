import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ENEMY_PROFILES,
  GAME_CONFIG,
  type EnemyProfileId,
} from '../src/game/config';
import { EnemyShip } from '../src/game/entities/EnemyShip';
import { PlayerShip } from '../src/game/entities/PlayerShip';
import { createCombatStats } from '../src/game/progression/types';
import { EnemyManager } from '../src/game/systems/EnemyManager';
import { ProjectileSystem } from '../src/game/systems/ProjectileSystem';
import { TargetingSystem } from '../src/game/systems/TargetingSystem';
import { WeaponSystem } from '../src/game/systems/WeaponSystem';

function createEnemy(
  profileId: EnemyProfileId,
  x: number,
  z: number,
): EnemyShip {
  return new EnemyShip({
    profile: ENEMY_PROFILES[profileId],
    x,
    z,
    heading: 0,
    initialFireDelay: 0,
    strafeDirection: 1,
  });
}

describe('targeting and combat', () => {
  it('targets the nearest living enemy inside range', () => {
    const near = createEnemy('raider', 5, 0);
    const far = createEnemy('raider', 20, 0);
    const outOfRange = createEnemy('raider', 100, 0);
    far.takeDamage(far.maxHealth + far.profile.armor);
    const targeting = new TargetingSystem();

    const target = targeting.findNearestTarget(
      new Vector3(0, 0, 0),
      [far, near, outOfRange],
      GAME_CONFIG.weapon.range,
    );

    expect(target).toBe(near);

    near.dispose();
    far.dispose();
    outOfRange.dispose();
  });

  it('applies damage, disables a dead target, and leaves it targetable when damaged', () => {
    const enemy = createEnemy('raider', 8, 0);

    expect(enemy.isTargetable).toBe(true);
    expect(enemy.takeDamage(30)).toBe(false);
    expect(enemy.isTargetable).toBe(true);
    expect(enemy.currentHealth).toBe(enemy.maxHealth - 30);

    expect(enemy.takeDamage(enemy.maxHealth + enemy.profile.armor)).toBe(true);
    expect(enemy.isTargetable).toBe(false);
    expect(enemy.currentHealth).toBe(0);
    expect(enemy.takeDamage(10)).toBe(false);

    const target = new TargetingSystem().findNearestTarget(
      new Vector3(0, 0, 0),
      [enemy],
      GAME_CONFIG.weapon.range,
    );
    expect(target).toBeNull();

    enemy.dispose();
  });

  it('applies enemy profile armor to incoming damage', () => {
    const gunboat = createEnemy('gunboat', 10, 0);
    const damage = 10;
    const expectedDamage = damage - gunboat.profile.armor;

    expect(gunboat.takeDamage(damage)).toBe(false);
    expect(gunboat.currentHealth).toBe(gunboat.maxHealth - expectedDamage);

    gunboat.dispose();
  });

  it('applies player armor and reports destruction', () => {
    const player = new PlayerShip();
    const initialHealth = player.status.health;

    const firstDamage = player.takeDamage(30);
    expect(firstDamage).toBe(30 - GAME_CONFIG.player.armor);
    expect(player.status.health).toBe(initialHealth - firstDamage);
    expect(player.isDestroyed).toBe(false);

    const lethalDamage = player.takeDamage(1000);
    expect(lethalDamage).toBe(initialHealth - firstDamage);
    expect(player.status.health).toBe(0);
    expect(player.isDestroyed).toBe(true);
    expect(player.takeDamage(10)).toBe(0);

    player.dispose();
  });

  it('prevents enemy shells from damaging ships and player shells from hitting the player', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const targetEnemy = enemies.getEnemies()[0];
    if (!targetEnemy) {
      throw new Error('Expected an initial enemy');
    }

    let playerHits = 0;
    const projectiles = new ProjectileSystem({
      enemies,
      player,
      onEnemyKilled: () => {},
      onPlayerHit: () => {
        playerHits += 1;
      },
    });

    const targetPoint = new Vector3();
    const enemyHealthBefore = targetEnemy.currentHealth;
    targetEnemy.getAimPoint(targetPoint);

    const enemyShotOrigin = targetPoint.clone();
    enemyShotOrigin.z += 5;
    projectiles.fire(enemyShotOrigin, targetPoint, {
      owner: 'enemy',
      speed: 26,
      damage: 999,
      maxDistance: 20,
    });

    for (let frame = 0; frame < 30; frame += 1) {
      projectiles.update(1 / 60);
    }

    expect(targetEnemy.currentHealth).toBe(enemyHealthBefore);
    expect(targetEnemy.isTargetable).toBe(true);
    expect(playerHits).toBe(0);

    const playerHealthBefore = player.status.health;
    const enemyHealthBeforePlayerShot = targetEnemy.currentHealth;
    targetEnemy.getAimPoint(targetPoint);
    const playerShotOrigin = targetPoint.clone();
    playerShotOrigin.z += 5;

    projectiles.fire(playerShotOrigin, targetPoint, {
      owner: 'player',
      speed: 38,
      damage: 20,
      maxDistance: 20,
    });

    for (let frame = 0; frame < 30; frame += 1) {
      projectiles.update(1 / 60);
    }

    expect(targetEnemy.currentHealth).toBeLessThan(
      enemyHealthBeforePlayerShot,
    );
    expect(player.status.health).toBe(playerHealthBefore);

    projectiles.dispose();
    enemies.dispose();
    player.dispose();
  });

  it('fires the upgraded number of shells per volley', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const stats = createCombatStats();
    stats.projectileCount = 4;

    const projectiles = new ProjectileSystem({
      enemies,
      player,
      onEnemyKilled: () => {},
      onPlayerHit: () => {},
    });
    const weapon = new WeaponSystem(
      player,
      enemies,
      new TargetingSystem(),
      projectiles,
      stats,
    );

    for (let frame = 0; frame < 120; frame += 1) {
      weapon.update(1 / 60);
      if (projectiles.getActiveCount() > 0) {
        break;
      }
    }

    expect(projectiles.getActiveCount()).toBe(4);

    projectiles.dispose();
    enemies.dispose();
    player.dispose();
  });

  it('runs the full auto-fire, projectile-hit and sink loop', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const camera = new PerspectiveCamera();
    camera.position.set(0, 12, 20);

    let sunkCount = 0;
    const projectiles = new ProjectileSystem({
      enemies,
      player,
      onEnemyKilled: () => {
        sunkCount += 1;
      },
      onPlayerHit: () => {},
    });
    const weapon = new WeaponSystem(
      player,
      enemies,
      new TargetingSystem(),
      projectiles,
      createCombatStats(),
    );

    const fixedDelta = 1 / 60;
    const elapsed = 30;

    for (
      let frame = 0;
      frame < Math.ceil(elapsed / fixedDelta);
      frame += 1
    ) {
      const time = frame * fixedDelta;
      enemies.update(fixedDelta, time, camera);
      weapon.update(fixedDelta);
      projectiles.update(fixedDelta);
    }

    expect(sunkCount).toBe(GAME_CONFIG.enemySpawns.length);
    expect(enemies.getEnemies().length).toBe(0);

    projectiles.dispose();
    enemies.dispose();
    player.dispose();
  });
});
