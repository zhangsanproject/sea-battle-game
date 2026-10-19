import type * as THREE from 'three';
import type { EnemyShip } from '../entities/EnemyShip';

export class TargetingSystem {
  findNearestTarget(
    origin: THREE.Vector3,
    enemies: readonly EnemyShip[],
    maxRange: number,
  ): EnemyShip | null {
    const maxRangeSq = maxRange * maxRange;
    let nearest: EnemyShip | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;

    for (const enemy of enemies) {
      if (!enemy.isTargetable) {
        continue;
      }

      const offsetX = enemy.root.position.x - origin.x;
      const offsetZ = enemy.root.position.z - origin.z;
      const distanceSq = offsetX * offsetX + offsetZ * offsetZ;

      if (distanceSq > maxRangeSq || distanceSq >= nearestDistanceSq) {
        continue;
      }

      nearest = enemy;
      nearestDistanceSq = distanceSq;
    }

    return nearest;
  }
}
