import type * as THREE from 'three';
import type { EnemyShip } from '../entities/EnemyShip';

export class TargetingSystem {
  /**
   * Picks a target inside `maxRange`. A boss always wins over escort chaff:
   * otherwise the auto-turrets spend the whole fight clearing the escort ring
   * while the boss takes no damage at all.
   */
  findNearestTarget(
    origin: THREE.Vector3,
    enemies: readonly EnemyShip[],
    maxRange: number,
  ): EnemyShip | null {
    const maxRangeSq = maxRange * maxRange;
    let nearest: EnemyShip | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;
    let boss: EnemyShip | null = null;
    let bossDistanceSq = Number.POSITIVE_INFINITY;

    for (const enemy of enemies) {
      if (!enemy.isTargetable) {
        continue;
      }

      const offsetX = enemy.root.position.x - origin.x;
      const offsetZ = enemy.root.position.z - origin.z;
      const distanceSq = offsetX * offsetX + offsetZ * offsetZ;

      if (distanceSq > maxRangeSq) {
        continue;
      }

      if (enemy.isBoss) {
        if (distanceSq < bossDistanceSq) {
          boss = enemy;
          bossDistanceSq = distanceSq;
        }
        continue;
      }

      if (distanceSq >= nearestDistanceSq) {
        continue;
      }

      nearest = enemy;
      nearestDistanceSq = distanceSq;
    }

    return boss ?? nearest;
  }
}
