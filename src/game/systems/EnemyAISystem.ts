import { Vector2, Vector3 } from 'three';
import { GAME_CONFIG } from '../config';
import type { EnemyShip } from '../entities/EnemyShip';
import type { PlayerShip } from '../entities/PlayerShip';
import type { EnemyManager } from './EnemyManager';
import type { ProjectileSystem } from './ProjectileSystem';
import { clampToArena, moveTowards, normalizeAngle, rotateTowardsAngle } from './movementMath';

export class EnemyAISystem {
  private readonly playerAimPoint = new Vector3();
  private readonly muzzlePosition = new Vector3();
  private readonly volleyDirection = new Vector3();
  private readonly volleyPerpendicular = new Vector3();
  private readonly volleyTarget = new Vector3();
  private readonly position2D = new Vector2();

  constructor(
    private readonly player: PlayerShip,
    private readonly enemies: EnemyManager,
    private readonly projectiles: ProjectileSystem,
  ) {}

  update(deltaTime: number): void {
    const playerPosition = this.player.root.position;
    this.player.getAimPoint(this.playerAimPoint);

    for (const enemy of this.enemies.getEnemies()) {
      if (!enemy.isTargetable) {
        continue;
      }

      enemy.tickFireCooldown(deltaTime);

      const offsetX = playerPosition.x - enemy.root.position.x;
      const offsetZ = playerPosition.z - enemy.root.position.z;
      const distanceSq = offsetX * offsetX + offsetZ * offsetZ;
      const distance = Math.sqrt(distanceSq);

      if (distance < 0.0001) {
        continue;
      }

      const directionX = offsetX / distance;
      const directionZ = offsetZ / distance;
      const desiredYaw = Math.atan2(-offsetX, -offsetZ);

      enemy.root.rotation.y = rotateTowardsAngle(
        enemy.root.rotation.y,
        desiredYaw,
        enemy.profile.turnSpeed * deltaTime,
      );

      let moveX = 0;
      let moveZ = 0;
      let speedFactor = 1;

      if (distance > enemy.profile.preferredRange + enemy.profile.rangeTolerance) {
        moveX = directionX;
        moveZ = directionZ;
      } else if (
        distance <
        enemy.profile.preferredRange - enemy.profile.rangeTolerance
      ) {
        moveX = -directionX;
        moveZ = -directionZ;
      } else {
        moveX = -directionZ * enemy.strafeDirection;
        moveZ = directionX * enemy.strafeDirection;
        speedFactor = enemy.profile.strafeSpeedFactor;
      }

      const targetSpeed = enemy.profile.maxSpeed * speedFactor;
      moveTowards(
        enemy.velocity,
        moveX * targetSpeed,
        moveZ * targetSpeed,
        enemy.profile.acceleration * deltaTime,
      );

      enemy.root.position.x += enemy.velocity.x * deltaTime;
      enemy.root.position.z += enemy.velocity.y * deltaTime;

      this.position2D.set(enemy.root.position.x, enemy.root.position.z);
      clampToArena(this.position2D, enemy.velocity, GAME_CONFIG.arena.radius);
      enemy.root.position.x = this.position2D.x;
      enemy.root.position.z = this.position2D.y;

      if (
        distance > enemy.profile.attackRange ||
        !enemy.isReadyToFire
      ) {
        continue;
      }

      const aimError = Math.abs(
        normalizeAngle(desiredYaw - enemy.root.rotation.y),
      );
      if (aimError > enemy.profile.aimTolerance) {
        continue;
      }

      enemy.getMuzzleWorldPosition(this.muzzlePosition);
      this.fireEnemyVolley(enemy);
      enemy.resetFireCooldown();
      enemy.triggerMuzzleFlash();
    }
  }

  private fireEnemyVolley(enemy: EnemyShip): void {
    const count = Math.max(1, Math.round(enemy.profile.projectileCount));

    this.volleyDirection.subVectors(
      this.playerAimPoint,
      this.muzzlePosition,
    );
    this.volleyDirection.y = 0;
    const horizontalDistance = this.volleyDirection.length();

    if (horizontalDistance > 0.0001) {
      this.volleyDirection.multiplyScalar(1 / horizontalDistance);
      this.volleyPerpendicular.set(
        -this.volleyDirection.z,
        0,
        this.volleyDirection.x,
      );
    } else {
      this.volleyPerpendicular.set(1, 0, 0);
    }

    for (let index = 0; index < count; index += 1) {
      const centeredIndex = index - (count - 1) * 0.5;
      this.volleyTarget
        .copy(this.playerAimPoint)
        .addScaledVector(
          this.volleyPerpendicular,
          centeredIndex *
            enemy.profile.spreadRadians *
            horizontalDistance,
        );

      const kind = enemy.profile.projectileKind;

      this.projectiles.fire(this.muzzlePosition, this.volleyTarget, {
        owner: 'enemy',
        speed: enemy.profile.projectileSpeed,
        damage: enemy.profile.projectileDamage,
        maxDistance: enemy.profile.projectileMaxDistance,
        kind,
        // Torpedoes run on the surface and missiles launch upward, so only
        // flat-trajectory shells arc under gravity.
        gravity:
          kind === 'torpedo' || kind === 'missile'
            ? 0
            : GAME_CONFIG.weapon.shellGravity,
      });
    }
  }
}
