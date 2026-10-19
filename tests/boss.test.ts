import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ENEMY_PROFILES } from '../src/game/config';
import { PlayerShip } from '../src/game/entities/PlayerShip';
import { BossSystem } from '../src/game/systems/BossSystem';
import { EnemyManager } from '../src/game/systems/EnemyManager';
import { ProjectileSystem } from '../src/game/systems/ProjectileSystem';

describe('BossSystem', () => {
  it('telegraphs its special attack and damages a stationary player', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const boss = enemies.spawnEnemy(
      ENEMY_PROFILES.boss,
      0,
      -18,
      0,
      0,
      1,
      { isBoss: true },
    );
    if (!boss) {
      throw new Error('Expected a boss');
    }

    let playerHits = 0;
    let warningShown = false;
    let warningHidden = false;

    const system = new BossSystem({
      player,
      enemies,
      onPlayerHit: () => {
        playerHits += 1;
      },
      onWarningChanged: (active) => {
        warningShown = warningShown || active;
        warningHidden = warningHidden || !active;
      },
    });

    for (let frame = 0; frame < 60 * 5; frame += 1) {
      system.update(1 / 60);
    }

    expect(warningShown).toBe(true);
    expect(warningHidden).toBe(true);
    expect(playerHits).toBeGreaterThan(0);
    expect(player.status.health).toBeLessThan(player.status.maxHealth);

    system.dispose();
    enemies.dispose();
    player.dispose();
  });

  it('can be killed through the normal player projectile pipeline', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const boss = enemies.spawnEnemy(
      ENEMY_PROFILES.boss,
      0,
      -10,
      0,
      0,
      1,
      { isBoss: true },
    );
    if (!boss) {
      throw new Error('Expected a boss');
    }

    let killedBoss = false;
    const projectiles = new ProjectileSystem({
      enemies,
      player,
      onEnemyKilled: (enemy) => {
        killedBoss = killedBoss || enemy.isBoss;
      },
      onPlayerHit: () => {},
    });

    const target = new Vector3();
    boss.getAimPoint(target);
    projectiles.fire(
      new Vector3(0, target.y, 0),
      target,
      {
        owner: 'player',
        speed: 60,
        damage: 999999,
        maxDistance: 30,
      },
    );

    for (let frame = 0; frame < 30; frame += 1) {
      projectiles.update(1 / 60);
    }

    expect(killedBoss).toBe(true);
    expect(boss.isTargetable).toBe(false);

    projectiles.dispose();
    enemies.dispose();
    player.dispose();
  });
});
