import { Vector3 } from 'three';
import { GAME_CONFIG } from '../config';
import type { PlayerShip } from '../entities/PlayerShip';
import type { CombatStats } from '../progression/types';
import type { EnemyManager } from './EnemyManager';
import type { ProjectileSystem } from './ProjectileSystem';
import type { TargetingSystem } from './TargetingSystem';

export class TorpedoSystem {
  private readonly aimPoint = new Vector3();
  private readonly muzzlePositions = [new Vector3(), new Vector3()];
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
    if (this.stats.torpedoLevel <= 0) {
      return;
    }

    this.cooldown = Math.max(0, this.cooldown - deltaTime);

    const target = this.targeting.findNearestTarget(
      this.player.root.position,
      this.enemies.getEnemies(),
      GAME_CONFIG.playerWeapons.torpedo.range,
    );

    if (!target || this.cooldown > 0) {
      return;
    }

    target.getAimPoint(this.aimPoint);
    const muzzleCount =
      this.player.getTorpedoMuzzleWorldPositions(this.muzzlePositions);
    if (muzzleCount === 0) {
      return;
    }

    const torpedoesPerVolley =
      this.stats.torpedoLevel >= 2 ? Math.min(2, muzzleCount) : 1;
    const config = GAME_CONFIG.playerWeapons.torpedo;
    const damage =
      config.baseDamage +
      (this.stats.torpedoLevel - 1) * config.damagePerLevel;

    for (let index = 0; index < torpedoesPerVolley; index += 1) {
      const muzzleIndex = (this.nextTube + index) % muzzleCount;
      const muzzle = this.muzzlePositions[muzzleIndex];
      if (!muzzle) {
        continue;
      }

      this.projectiles.fire(muzzle, this.aimPoint, {
        owner: 'player',
        speed: config.projectileSpeed,
        damage,
        maxDistance: config.projectileMaxDistance,
        kind: 'torpedo',
      });
    }

    this.nextTube = (this.nextTube + torpedoesPerVolley) % muzzleCount;
    this.onFire?.();
    this.cooldown = Math.max(
      0.9,
      config.baseFireInterval -
        (this.stats.torpedoLevel - 1) *
          config.fireIntervalPerLevel,
    );
  }
}
