import {
  DANGER_STAGES,
  type DangerStage,
  type EnemyProfile,
} from '../config';

/**
 * After the authored curve ends, difficulty keeps stacking every 30 seconds so
 * an endless run never settles into "already won". Health grows fastest: it is
 * the only lever that keeps a maxed build from farming an empty arena.
 */
const OVERTIME_LAYER_SECONDS = 30;
const OVERTIME_HEALTH_GROWTH = 1.12;
const OVERTIME_DAMAGE_GROWTH = 1.06;
const OVERTIME_EXPERIENCE_GROWTH = 1.08;
const OVERTIME_INTERVAL_FACTOR = 0.96;
/** Armour creeps up far more slowly: flat armour guts low-damage side guns. */
const OVERTIME_LAYERS_PER_ARMOUR = 3;
const MIN_SPAWN_INTERVAL_SECONDS = 0.2;
/** 15 minutes of overtime; beyond this the multipliers would just overflow. */
const MAX_OVERTIME_LAYERS = 30;

export class DangerSystem {
  private overtimeStage: DangerStage | null = null;
  private overtimeLayer = -1;

  getStage(elapsedSeconds: number): DangerStage {
    const safeElapsed = Math.max(0, elapsedSeconds);
    let current = DANGER_STAGES[0];

    if (!current) {
      throw new Error('DANGER_STAGES must contain at least one stage');
    }

    for (const stage of DANGER_STAGES) {
      if (stage.startsAtSeconds > safeElapsed) {
        break;
      }
      current = stage;
    }

    const last = DANGER_STAGES[DANGER_STAGES.length - 1];
    if (!last) {
      return current;
    }

    const overtime = Math.min(
      MAX_OVERTIME_LAYERS,
      Math.floor(
        (safeElapsed - last.startsAtSeconds) / OVERTIME_LAYER_SECONDS,
      ),
    );
    if (overtime <= 0) {
      return current;
    }

    // getStage runs every frame, so the synthesized stage is cached until the
    // player crosses into the next layer.
    if (this.overtimeLayer === overtime && this.overtimeStage) {
      return this.overtimeStage;
    }

    this.overtimeLayer = overtime;
    this.overtimeStage = {
      ...last,
      tier: last.tier + overtime,
      healthMultiplier:
        last.healthMultiplier * Math.pow(OVERTIME_HEALTH_GROWTH, overtime),
      armorBonus:
        last.armorBonus + Math.floor(overtime / OVERTIME_LAYERS_PER_ARMOUR),
      damageMultiplier:
        last.damageMultiplier * Math.pow(OVERTIME_DAMAGE_GROWTH, overtime),
      experienceMultiplier:
        last.experienceMultiplier *
        Math.pow(OVERTIME_EXPERIENCE_GROWTH, overtime),
      spawnIntervalSeconds: Math.max(
        MIN_SPAWN_INTERVAL_SECONDS,
        last.spawnIntervalSeconds *
          Math.pow(OVERTIME_INTERVAL_FACTOR, overtime),
      ),
    };

    return this.overtimeStage;
  }

  scaleProfile(
    profile: EnemyProfile,
    stage: DangerStage,
  ): EnemyProfile {
    return {
      ...profile,
      maxHealth: Math.max(
        1,
        Math.round(profile.maxHealth * stage.healthMultiplier),
      ),
      armor: profile.armor + stage.armorBonus,
      projectileDamage: Math.max(
        1,
        Math.round(profile.projectileDamage * stage.damageMultiplier),
      ),
      fireInterval: Math.max(
        0.75,
        profile.fireInterval * stage.fireIntervalMultiplier,
      ),
      experienceValue: Math.max(
        1,
        Math.round(profile.experienceValue * stage.experienceMultiplier),
      ),
    };
  }
}
