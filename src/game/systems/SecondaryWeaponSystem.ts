import { Vector3 } from 'three';
import { GAME_CONFIG } from '../config';
import type { PlayerShip } from '../entities/PlayerShip';
import type { CombatStats } from '../progression/types';
import type { EnemyManager } from './EnemyManager';
import type { ProjectileSystem } from './ProjectileSystem';
import type { TargetingSystem } from './TargetingSystem';

export class SecondaryWeaponSystem {
  private readonly aimPoint = new Vector3();
  private readonly muzzlePositions = [new Vector3(), new Vector3()];
  private cooldown = 0;

  constructor(
    private readonly player: PlayerShip,
    private readonly enemies: EnemyManager,
    private readonly targeting: TargetingSystem,
    private readonly projectiles: ProjectileSystem,
    private readonly stats: CombatStats,
    private readonly onFire?: () => void,
  ) {}

  update(deltaTime: number): void {
    if (this.stats.secondaryLevel <= 0) {
      return;
    }

    this.cooldown = Math.max(0, this.cooldown - deltaTime);

    const config = GAME_CONFIG.playerWeapons.secondary;
    const range =
      config.baseRange +
      (this.stats.secondaryLevel - 1) * config.rangePerLevel;
    const target = this.targeting.findNearestTarget(
      this.player.root.position,
      this.enemies.getEnemies(),
      range,
    );

    if (!target) {
      return;
    }

    target.getAimPoint(this.aimPoint);
    const aligned = this.player.aimSecondaryWeaponsAt(
      this.aimPoint,
      deltaTime,
    );

    if (!aligned || this.cooldown > 0) {
      return;
    }

    const muzzleCount =
      this.player.getSecondaryMuzzleWorldPositions(this.muzzlePositions);
    if (muzzleCount === 0) {
      return;
    }

    const damage = Math.max(
      2,
      Math.round(
        this.stats.weaponDamage * config.baseDamageFactor +
          (this.stats.secondaryLevel - 1) * config.damagePerLevel,
      ),
    );
    const fireInterval = Math.max(
      config.minFireInterval,
      config.baseFireInterval -
        (this.stats.secondaryLevel - 1) *
          config.fireIntervalPerLevel,
    );

    for (let index = 0; index < muzzleCount; index += 1) {
      const muzzle = this.muzzlePositions[index];
      if (!muzzle) {
        continue;
      }

      this.projectiles.fire(muzzle, this.aimPoint, {
        owner: 'player',
        speed: GAME_CONFIG.weapon.projectileSpeed,
        damage,
        maxDistance: GAME_CONFIG.weapon.projectileMaxDistance,
        kind: 'secondary',
        gravity: GAME_CONFIG.weapon.shellGravity,
      });
    }

    this.onFire?.();
    this.cooldown = fireInterval;
  }
}
