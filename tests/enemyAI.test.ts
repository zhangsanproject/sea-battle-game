import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerShip } from '../src/game/entities/PlayerShip';
import { EnemyAISystem } from '../src/game/systems/EnemyAISystem';
import { EnemyManager } from '../src/game/systems/EnemyManager';
import { ProjectileSystem } from '../src/game/systems/ProjectileSystem';

describe('EnemyAISystem', () => {
  it('closes distance, fires at the player, and deals damage', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const camera = new PerspectiveCamera();
    camera.position.set(0, 18, 24);

    let playerHits = 0;
    const projectiles = new ProjectileSystem({
      enemies,
      player,
      onEnemyKilled: () => {},
      onPlayerHit: () => {
        playerHits += 1;
      },
    });
    const ai = new EnemyAISystem(player, enemies, projectiles);

    const firstEnemy = enemies.getEnemies()[0];
    if (!firstEnemy) {
      throw new Error('Expected an initial enemy');
    }

    const initialPosition = new Vector3().copy(firstEnemy.root.position);
    const initialDistance = Math.hypot(
      initialPosition.x - player.root.position.x,
      initialPosition.z - player.root.position.z,
    );

    const fixedDelta = 1 / 60;

    for (let frame = 0; frame < 60 * 7; frame += 1) {
      const time = frame * fixedDelta;
      ai.update(fixedDelta);
      enemies.update(fixedDelta, time, camera);
      projectiles.update(fixedDelta);

      if (player.isDestroyed) {
        break;
      }
    }

    const movedDistance = firstEnemy.root.position.distanceTo(initialPosition);
    const finalDistance = Math.hypot(
      firstEnemy.root.position.x - player.root.position.x,
      firstEnemy.root.position.z - player.root.position.z,
    );

    expect(movedDistance).toBeGreaterThan(1);
    expect(finalDistance).toBeLessThan(initialDistance);
    expect(playerHits).toBeGreaterThan(0);
    expect(player.status.health).toBeLessThan(player.status.maxHealth);
    expect(player.status.health).toBeGreaterThanOrEqual(0);

    projectiles.dispose();
    enemies.dispose();
    player.dispose();
  });
});
