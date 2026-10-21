import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { DANGER_STAGES, GAME_CONFIG } from '../src/game/config';
import { PlayerShip } from '../src/game/entities/PlayerShip';
import { DangerSystem } from '../src/game/systems/DangerSystem';
import { EnemyManager } from '../src/game/systems/EnemyManager';
import { EnemySpawner } from '../src/game/systems/EnemySpawner';

/**
 * The run is authored as a three-minute arc: six danger tiers, two bosses, then
 * endless layers. These tests pin the shape so a balance pass cannot quietly
 * flatten it again.
 */
describe('three-minute run structure', () => {
  it('walks all six authored tiers inside three minutes', () => {
    const danger = new DangerSystem();

    expect(danger.getStage(0).tier).toBe(1);
    expect(danger.getStage(29).tier).toBe(1);
    expect(danger.getStage(30).tier).toBe(2);
    expect(danger.getStage(60).tier).toBe(3);
    expect(danger.getStage(90).tier).toBe(4);
    expect(danger.getStage(120).tier).toBe(5);
    expect(danger.getStage(150).tier).toBe(6);
    expect(danger.getStage(179).tier).toBe(6);
    expect(danger.getStage(180).tier).toBe(7);
  });

  it('keeps the swarm flowing faster than the player can clear it early on', () => {
    const danger = new DangerSystem();
    const opening = danger.getStage(0);

    // Spawning must out-pace a single main gun, otherwise the arena empties
    // out between kills and the opening minute feels turn-based.
    const mainGunDps =
      GAME_CONFIG.weapon.projectileDamage * GAME_CONFIG.weapon.projectileCount /
      GAME_CONFIG.weapon.fireInterval;
    const raiderHealth = 22;
    const killsPerSecond = mainGunDps / raiderHealth;
    const spawnsPerSecond = 1 / opening.spawnIntervalSeconds;

    expect(spawnsPerSecond).toBeLessThan(killsPerSecond);
    expect(spawnsPerSecond).toBeGreaterThanOrEqual(0.45);
    // At least eight boats should arrive inside the opening 30 seconds, on top
    // of the four that start on the board.
    expect(opening.spawnIntervalSeconds * 8).toBeLessThan(30);
  });

  it('grows enemy hulls far faster than the old curve did', () => {
    const last = DANGER_STAGES[DANGER_STAGES.length - 1];
    if (!last) {
      throw new Error('Expected danger stages');
    }

    // A 1.95x ceiling could not survive a 20x damage build; the player ended
    // up farming an empty arena by minute three.
    expect(last.healthMultiplier).toBeGreaterThanOrEqual(3);
  });

  it('sends two bosses in the first three minutes', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const danger = new DangerSystem();
    const spawner = new EnemySpawner(enemies, player, danger, () => 0.5);
    const camera = new PerspectiveCamera();
    camera.position.set(0, 18, 24);

    const spawnTimes: number[] = [];
    const step = 1 / 30;
    let elapsed = 0;
    let bossAlive = false;

    while (elapsed < 210) {
      elapsed += step;
      spawner.update(step, danger.getStage(elapsed));

      const boss = enemies.getBoss();
      if (!boss) {
        bossAlive = false;
        continue;
      }

      if (!bossAlive) {
        spawnTimes.push(elapsed);
        bossAlive = true;
      }

      // Pretend the player sinks it immediately so the next beat can fire.
      boss.takeDamage(boss.profile.maxHealth + boss.profile.armor + 1);
      enemies.update(step, elapsed, camera);
    }

    expect(spawnTimes.length).toBe(2);
    expect(spawnTimes[0]).toBeGreaterThanOrEqual(
      GAME_CONFIG.boss.firstSpawnAtSeconds,
    );
    expect(spawnTimes[0]).toBeLessThan(
      GAME_CONFIG.boss.firstSpawnAtSeconds + 2,
    );
    expect(spawnTimes[1]).toBeGreaterThanOrEqual(
      GAME_CONFIG.boss.firstSpawnAtSeconds +
        GAME_CONFIG.boss.intervalSeconds,
    );

    enemies.dispose();
    player.dispose();
  });

  it('makes each boss heavier than the last', () => {
    expect(GAME_CONFIG.boss.healthGrowth).toBeGreaterThan(1);
    // Three bosses in, the hull should be over twice the opening boss.
    expect(Math.pow(GAME_CONFIG.boss.healthGrowth, 3)).toBeGreaterThan(2);
  });
});

describe('portrait framing', () => {
  it('keeps the visible half-width at least as wide as the spawn ring', () => {
    // A portrait phone is the tight case: the camera pulls back by
    // 0.94 / aspect, which keeps the horizontal half-width constant no matter
    // how tall the screen is. If that width drops below the closest spawn
    // distance, boats die off-screen and the player never sees them arrive.
    const aspect = 390 / 844;
    const viewScale = Math.min(Math.max(0.94 / aspect, 1), 2.45);
    const cameraDistance = Math.hypot(10, 16.5, 22) * viewScale;
    const halfHeight = Math.tan((48 / 2) * (Math.PI / 180));
    const halfWidth = cameraDistance * halfHeight * aspect;

    expect(halfWidth).toBeGreaterThanOrEqual(
      GAME_CONFIG.spawner.minSpawnDistance,
    );
  });

  it('does not shrink the player ship below a recognisable size', () => {
    const aspect = 390 / 844;
    const viewScale = Math.min(Math.max(0.94 / aspect, 1), 2.45);
    const cameraDistance = Math.hypot(10, 16.5, 22) * viewScale;
    const visibleHeight = 2 * cameraDistance * Math.tan((48 / 2) * (Math.PI / 180));
    // The hull silhouette is about 4.8 units long after the 0.8 hull scale.
    const shipShare = 4.8 / visibleHeight;

    expect(shipShare).toBeGreaterThan(0.04);
    expect(shipShare).toBeLessThan(0.14);
  });
});
