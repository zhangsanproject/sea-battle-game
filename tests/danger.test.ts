import { describe, expect, it } from 'vitest';
import { DANGER_STAGES, ENEMY_PROFILES } from '../src/game/config';
import { DangerSystem } from '../src/game/systems/DangerSystem';

describe('DangerSystem', () => {
  it('selects danger stages at their configured time boundaries', () => {
    const danger = new DangerSystem();

    expect(danger.getStage(0).tier).toBe(1);
    expect(danger.getStage(11.99).tier).toBe(1);
    expect(danger.getStage(12).tier).toBe(2);
    expect(danger.getStage(35).tier).toBe(3);
    expect(danger.getStage(140).tier).toBe(
      DANGER_STAGES[DANGER_STAGES.length - 1]?.tier,
    );
  });

  it('caps danger instead of scaling forever', () => {
    const danger = new DangerSystem();
    const lastStage = danger.getStage(Number.MAX_SAFE_INTEGER);

    expect(lastStage).toEqual(DANGER_STAGES[DANGER_STAGES.length - 1]);
    expect(danger.getStage(999999).tier).toBe(lastStage.tier);
  });

  it('scales health, armor, damage, fire rate, and experience', () => {
    const danger = new DangerSystem();
    const tierTwo = danger.getStage(12);
    const scaled = danger.scaleProfile(ENEMY_PROFILES.gunboat, tierTwo);

    expect(scaled.maxHealth).toBe(
      Math.round(ENEMY_PROFILES.gunboat.maxHealth * 1.12),
    );
    expect(scaled.armor).toBe(ENEMY_PROFILES.gunboat.armor + 1);
    expect(scaled.projectileDamage).toBeGreaterThanOrEqual(
      ENEMY_PROFILES.gunboat.projectileDamage,
    );
    expect(scaled.fireInterval).toBeLessThan(
      ENEMY_PROFILES.gunboat.fireInterval,
    );
    expect(scaled.experienceValue).toBeGreaterThan(
      ENEMY_PROFILES.gunboat.experienceValue,
    );
    expect(scaled.id).toBe(ENEMY_PROFILES.gunboat.id);
  });

  it('keeps stage values monotonic and bounded', () => {
    const finalStage = DANGER_STAGES[DANGER_STAGES.length - 1];
    if (!finalStage) {
      throw new Error('Expected danger stages');
    }

    let previousHealth = 0;
    let previousDamage = 0;

    for (const stage of DANGER_STAGES) {
      expect(stage.healthMultiplier).toBeGreaterThanOrEqual(previousHealth);
      expect(stage.damageMultiplier).toBeGreaterThanOrEqual(previousDamage);
      expect(stage.healthMultiplier).toBeLessThanOrEqual(
        finalStage.healthMultiplier,
      );
      expect(stage.damageMultiplier).toBeLessThanOrEqual(
        finalStage.damageMultiplier,
      );
      previousHealth = stage.healthMultiplier;
      previousDamage = stage.damageMultiplier;
    }
  });
});
