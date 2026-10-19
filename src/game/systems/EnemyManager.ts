import * as THREE from 'three';
import {
  ENEMY_PROFILES,
  GAME_CONFIG,
  type EnemyProfile,
} from '../config';
import { EnemyShip } from '../entities/EnemyShip';

export class EnemyManager {
  readonly root = new THREE.Group();
  private readonly enemies: EnemyShip[] = [];
  private disposed = false;

  constructor() {
    this.root.name = 'Enemies';

    for (const spawn of GAME_CONFIG.enemySpawns) {
      // Face the player's starting position at the origin.
      const heading = Math.atan2(spawn.x, spawn.z);
      this.spawnEnemy(
        ENEMY_PROFILES[spawn.profile],
        spawn.x,
        spawn.z,
        heading,
        spawn.initialFireDelay,
        spawn.strafeDirection,
      );
    }
  }

  getEnemies(): readonly EnemyShip[] {
    return this.enemies;
  }

  getBoss(): EnemyShip | null {
    for (const enemy of this.enemies) {
      if (enemy.isBoss && enemy.isTargetable) {
        return enemy;
      }
    }
    return null;
  }

  spawnEnemy(
    profile: EnemyProfile,
    x: number,
    z: number,
    heading: number,
    initialFireDelay: number,
    strafeDirection: 1 | -1,
    flags: { isElite?: boolean; isBoss?: boolean } = {},
  ): EnemyShip | null {
    if (this.disposed) {
      return null;
    }

    const enemy = new EnemyShip({
      profile,
      x,
      z,
      heading,
      initialFireDelay,
      strafeDirection,
      isElite: flags.isElite,
      isBoss: flags.isBoss,
    });
    this.enemies.push(enemy);
    this.root.add(enemy.root);
    return enemy;
  }

  update(
    deltaTime: number,
    elapsedTime: number,
    camera: THREE.Camera,
  ): void {
    for (const enemy of this.enemies) {
      enemy.update(deltaTime, elapsedTime, camera);
    }

    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      if (!enemy || !enemy.isFinished) {
        continue;
      }

      this.root.remove(enemy.root);
      enemy.dispose();
      this.enemies.splice(index, 1);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (const enemy of this.enemies) {
      this.root.remove(enemy.root);
      enemy.dispose();
    }
    this.enemies.length = 0;
    this.root.clear();
  }
}
