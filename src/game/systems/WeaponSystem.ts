import { Vector3 } from 'three';
import { GAME_CONFIG } from '../config';
import type { PlayerShip } from '../entities/PlayerShip';
import type { CombatStats } from '../progression/types';
import type { EnemyManager } from './EnemyManager';
import type { ProjectileSystem } from './ProjectileSystem';
import type { TargetingSystem } from './TargetingSystem';

const PROJECTILE_SPREAD_STEP = 0.6;

export class WeaponSystem {
  private readonly aimPoint = new Vector3();
  private readonly spreadTarget = new Vector3();
  private readonly spreadDirection = new Vector3();
  private readonly spreadPerpendicular = new Vector3();
  private readonly muzzlePositions = Array.from(
    { length: 8 },
    () => new Vector3(),
  );
  private cooldown = 0;

  constructor(
    private readonly player: PlayerShip,
    private readonly enemies: EnemyManager,
    private readonly targeting: TargetingSystem,
    private readonly projectiles: ProjectileSystem,
    private readonly stats: CombatStats,
    private readonly onFire?: (muzzle: Vector3, aim: Vector3) => void,
  ) {}

  update(deltaTime: number): void {
    this.cooldown = Math.max(0, this.cooldown - deltaTime);

    const target = this.targeting.findNearestTarget(
      this.player.root.position,
      this.enemies.getEnemies(),
      this.stats.weaponRange,
    );

    if (!target) {
      this.player.relaxTurret(deltaTime);
      return;
    }

    target.getAimPoint(this.aimPoint);
    const aligned = this.player.aimTurretAt(this.aimPoint, deltaTime);

    if (!aligned || this.cooldown > 0) {
      return;
    }

    const muzzleCount = this.player.getMuzzleWorldPositions(
      this.muzzlePositions,
    );
    if (muzzleCount === 0) {
      return;
    }

    const projectileCount = Math.max(
      1,
      Math.round(this.stats.projectileCount),
    );

    for (let index = 0; index < projectileCount; index += 1) {
      const muzzle = this.muzzlePositions[index % muzzleCount];
      if (!muzzle) {
        continue;
      }

      this.prepareSpreadTarget(muzzle, index, projectileCount);

      this.projectiles.fire(muzzle, this.spreadTarget, {
        owner: 'player',
        speed: GAME_CONFIG.weapon.projectileSpeed,
        damage: this.stats.weaponDamage,
        maxDistance: GAME_CONFIG.weapon.projectileMaxDistance,
        gravity: GAME_CONFIG.weapon.shellGravity,
      });
    }

    this.player.triggerMuzzleFlash();
    const firstMuzzle = this.muzzlePositions[0];
    if (firstMuzzle) {
      this.onFire?.(firstMuzzle, this.aimPoint);
    }
    this.cooldown = this.stats.fireInterval;
  }

  private prepareSpreadTarget(
    muzzle: Vector3,
    index: number,
    projectileCount: number,
  ): void {
    if (projectileCount <= 1) {
      this.spreadTarget.copy(this.aimPoint);
      return;
    }

    this.spreadDirection.subVectors(this.aimPoint, muzzle);
    this.spreadDirection.y = 0;

    if (this.spreadDirection.lengthSq() < 0.0001) {
      this.spreadPerpendicular.set(1, 0, 0);
    } else {
      this.spreadDirection.normalize();
      this.spreadPerpendicular.set(
        -this.spreadDirection.z,
        0,
        this.spreadDirection.x,
      );
    }

    const centeredIndex = index - (projectileCount - 1) * 0.5;
    this.spreadTarget
      .copy(this.aimPoint)
      .addScaledVector(
        this.spreadPerpendicular,
        centeredIndex * PROJECTILE_SPREAD_STEP,
      );
  }
}
