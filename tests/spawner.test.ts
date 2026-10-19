import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { ENEMY_PROFILES, GAME_CONFIG } from '../src/game/config';
import { PlayerShip } from '../src/game/entities/PlayerShip';
import { DangerSystem } from '../src/game/systems/DangerSystem';
import { EnemyManager } from '../src/game/systems/EnemyManager';
import { EnemySpawner } from '../src/game/systems/EnemySpawner';

describe('EnemySpawner', () => {
  it('replaces defeated enemies using danger-scaled stats', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const danger = new DangerSystem();
    const spawner = new EnemySpawner(
      enemies,
      player,
      danger,
      () => 0,
    );
    const camera = new PerspectiveCamera();
    camera.position.set(0, 18, 24);

    expect(enemies.getEnemies()).toHaveLength(3);

    const victim = enemies.getEnemies()[0];
    if (!victim) {
      throw new Error('Expected an initial enemy');
    }
    victim.takeDamage(999999);
    enemies.update(3, 0, camera);
    expect(enemies.getEnemies()).toHaveLength(2);

    const tierOne = danger.getStage(0);
    spawner.update(7, tierOne);

    const activeEnemies = enemies.getEnemies();
    expect(activeEnemies).toHaveLength(3);

    const spawned = activeEnemies[activeEnemies.length - 1];
    if (!spawned) {
      throw new Error('Expected a spawned enemy');
    }

    expect(spawned.profile.id).toBe('raider');
    expect(spawned.isElite).toBe(true);
    expect(spawned.profile.maxHealth).toBe(
      Math.round(
        Math.round(ENEMY_PROFILES.raider.maxHealth) *
          GAME_CONFIG.spawner.eliteHealthMultiplier,
      ),
    );
    expect(spawned.profile.armor).toBe(
      ENEMY_PROFILES.raider.armor +
        GAME_CONFIG.spawner.eliteArmorBonus,
    );

    spawner.update(100, tierOne);
    expect(enemies.getEnemies()).toHaveLength(3);

    enemies.dispose();
    player.dispose();
  });

  it('spawns a scaled boss and pauses normal reinforcements', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const danger = new DangerSystem();
    const spawner = new EnemySpawner(
      enemies,
      player,
      danger,
      () => 0.8,
    );
    const tierTwo = danger.getStage(12);

    spawner.update(7, tierTwo);

    expect(enemies.getEnemies()).toHaveLength(4);
    const boss = enemies.getBoss();
    expect(boss).not.toBeNull();
    if (!boss) {
      throw new Error('Expected a spawned boss');
    }

    expect(boss.isBoss).toBe(true);
    expect(boss.profile.maxHealth).toBe(
      Math.round(ENEMY_PROFILES.boss.maxHealth * 1.12),
    );
    expect(boss.profile.armor).toBeGreaterThan(
      ENEMY_PROFILES.boss.armor,
    );

    spawner.update(100, tierTwo);
    expect(enemies.getEnemies()).toHaveLength(4);

    enemies.dispose();
    player.dispose();
  });
});
