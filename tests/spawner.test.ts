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

    expect(enemies.getEnemies()).toHaveLength(4);

    const victim = enemies.getEnemies()[0];
    if (!victim) {
      throw new Error('Expected an initial enemy');
    }
    victim.takeDamage(999999);
    enemies.update(3, 0, camera);
    expect(enemies.getEnemies()).toHaveLength(3);

    const tierOne = danger.getStage(0);
    spawner.update(7, tierOne);

    const activeEnemies = enemies.getEnemies();
    expect(activeEnemies).toHaveLength(4);

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

    // A short step so the boss clock (60s) is still in the future, but long
    // enough to clear the 2.2s spawn timer.
    spawner.update(3, tierOne);
    expect(enemies.getEnemies()).toHaveLength(5);

    enemies.dispose();
    player.dispose();
  });

  it('unlocks heavier ship types as the danger tier rises', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const danger = new DangerSystem();
    const spawner = new EnemySpawner(
      enemies,
      player,
      danger,
      () => 0.95,
    );
    const camera = new PerspectiveCamera();
    camera.position.set(0, 18, 24);

    // The boss clock fires at 60 s, which lands in danger tier 3.
    const tierThree = danger.getStage(61);
    spawner.update(61, tierThree);

    const boss = enemies.getBoss();
    expect(boss).not.toBeNull();
    boss?.takeDamage(999999);
    enemies.update(5, 0, camera);
    expect(enemies.getBoss()).toBeNull();

    spawner.update(7, danger.getStage(61));

    const activeEnemies = enemies.getEnemies();
    const spawned = activeEnemies[activeEnemies.length - 1];
    if (!spawned) {
      throw new Error('Expected a spawned enemy');
    }

    expect(spawned.profile.id).toBe('destroyer');
    expect(spawned.isElite).toBe(false);

    enemies.dispose();
    player.dispose();
  });

  it('spawns a scaled boss and keeps a thinner swarm arriving', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const danger = new DangerSystem();
    const spawner = new EnemySpawner(
      enemies,
      player,
      danger,
      () => 0.8,
    );
    const stage = danger.getStage(150);

    spawner.update(61, stage);

    expect(enemies.getEnemies()).toHaveLength(5);
    const boss = enemies.getBoss();
    expect(boss).not.toBeNull();
    if (!boss) {
      throw new Error('Expected a spawned boss');
    }

    expect(boss.isBoss).toBe(true);
    // The boss keeps its authored hull; only successive bosses scale up.
    expect(boss.profile.maxHealth).toBe(ENEMY_PROFILES.boss.maxHealth);
    expect(boss.profile.armor).toBeGreaterThan(
      ENEMY_PROFILES.boss.armor,
    );

    // Reinforcements continue during a boss fight instead of drying up, but
    // they must stay below the normal cap.
    spawner.update(100, stage);
    const escorts = enemies.getEnemies().length - 1;
    expect(escorts).toBeGreaterThan(4);
    expect(escorts).toBeLessThanOrEqual(
      Math.ceil(stage.targetEnemyCount * GAME_CONFIG.spawner.bossReinforcementFactor),
    );

    enemies.dispose();
    player.dispose();
  });

  it('builds every configured enemy type', () => {
    const enemies = new EnemyManager();

    for (const profile of Object.values(ENEMY_PROFILES)) {
      const enemy = enemies.spawnEnemy(profile, 0, 0, 0, 1, 1);
      expect(enemy).not.toBeNull();
      expect(enemy?.profile.id).toBe(profile.id);
    }

    enemies.dispose();
  });
});
