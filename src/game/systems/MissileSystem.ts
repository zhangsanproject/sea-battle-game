import { Vector3 } from 'three';
import { GAME_CONFIG } from '../config';
import type { PlayerShip } from '../entities/PlayerShip';
import type { CombatStats } from '../progression/types';
import type { EnemyManager } from './EnemyManager';
import type { ProjectileSystem } from './ProjectileSystem';
import type { TargetingSystem } from './TargetingSystem';

const MISSILE_MUZZLE_CAPACITY = 4;

/**
 * Guided missile battery. Missiles are launched from the deck pods and steer
 * toward the locked target, dealing splash damage on impact.
 */
export class MissileSystem {
  private readonly aimPoint = new Vector3();
  private readonly muzzlePositions = Array.from(
    { length: MISSILE_MUZZLE_CAPACITY },
    () => new Vector3(),
  );
  private cooldown = 0;
  private nextTube = 0;

  constructor(
    private readonly player: PlayerShip,
    private readonly enemies: EnemyManager,
    private readonly targeting: TargetingSystem,
    private readonly projectiles: ProjectileSystem,
    private readonly stats: CombatStats,
    private readonly onFire?: () => void,
  ) {}

  update(deltaTime: number): void {
    if (this.stats.missileLevel <= 0) {
      return;
    }

    this.cooldown = Math.max(0, this.cooldown - deltaTime);

    const config = GAME_CONFIG.playerWeapons.missile;
    const target = this.targeting.findNearestTarget(
      this.player.root.position,
      this.enemies.getEnemies(),
      config.range,
    );

    if (!target || this.cooldown > 0) {
      return;
    }

    target.getAimPoint(this.aimPoint);
    const muzzleCount =
      this.player.getMissileMuzzleWorldPositions(this.muzzlePositions);
    if (muzzleCount === 0) {
      return;
    }

    const missilesPerVolley = Math.min(
      muzzleCount,
      this.stats.missileLevel,
    );
    const damage =
      config.baseDamage +
      (this.stats.missileLevel - 1) * config.damagePerLevel;

    for (let index = 0; index < missilesPerVolley; index += 1) {
      const muzzle =
        this.muzzlePositions[(this.nextTube + index) % muzzleCount];
      if (!muzzle) {
        continue;
      }

      this.projectiles.fire(muzzle, this.aimPoint, {
        owner: 'player',
        speed: config.projectileSpeed,
        damage,
        maxDistance: config.projectileMaxDistance,
        kind: 'missile',
        homingTarget: target,
        verticalLaunchSeconds: config.verticalLaunchSeconds,
        turnRate: config.turnRate,
        splashRadius: config.splashRadius,
        splashDamageFactor: config.splashDamageFactor,
      });
    }

    this.nextTube = (this.nextTube + missilesPerVolley) % muzzleCount;
    this.onFire?.();
    this.cooldown = Math.max(
      config.minFireInterval,
      config.baseFireInterval -
        (this.stats.missileLevel - 1) * config.fireIntervalPerLevel,
    );
  }
}
