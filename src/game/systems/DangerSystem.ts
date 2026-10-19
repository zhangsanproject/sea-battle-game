import {
  DANGER_STAGES,
  type DangerStage,
  type EnemyProfile,
} from '../config';

export class DangerSystem {
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

    return current;
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
