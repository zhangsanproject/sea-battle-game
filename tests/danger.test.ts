import { describe, expect, it } from 'vitest';
import { DANGER_STAGES, ENEMY_PROFILES } from '../src/game/config';
import { DangerSystem } from '../src/game/systems/DangerSystem';

describe('DangerSystem', () => {
  it('selects danger stages at their configured time boundaries', () => {
    const danger = new DangerSystem();

    expect(danger.getStage(0).tier).toBe(1);
    expect(danger.getStage(29.99).tier).toBe(1);
    expect(danger.getStage(30).tier).toBe(2);
    expect(danger.getStage(60).tier).toBe(3);
    expect(danger.getStage(150).tier).toBe(
      DANGER_STAGES[DANGER_STAGES.length - 1]?.tier,
    );
  });

  it('keeps escalating past the authored curve instead of plateauing', () => {
    const danger = new DangerSystem();
    const atEnd = danger.getStage(150);
    const oneLayer = danger.getStage(180);
    const fiveLayers = danger.getStage(150 + 30 * 5);

    expect(oneLayer.tier).toBe(atEnd.tier + 1);
    expect(oneLayer.healthMultiplier).toBeGreaterThan(atEnd.healthMultiplier);
    expect(fiveLayers.healthMultiplier).toBeGreaterThan(
      oneLayer.healthMultiplier,
    );
    expect(fiveLayers.damageMultiplier).toBeGreaterThan(
      atEnd.damageMultiplier,
    );

    // Body count stays capped: more enemies would cost far more than the
    // health growth buys, and the frame budget is already tight at 24.
    expect(fiveLayers.targetEnemyCount).toBe(atEnd.targetEnemyCount);

    // The spawn interval tightens but never collapses into a per-frame stream.
    expect(fiveLayers.spawnIntervalSeconds).toBeGreaterThanOrEqual(0.2);
    expect(fiveLayers.spawnIntervalSeconds).toBeLessThan(
      atEnd.spawnIntervalSeconds,
    );
  });

  it('synthesizes the overtime stage once per layer', () => {
    const danger = new DangerSystem();

    // getStage runs every frame, so equal layers must return the same object
    // instead of allocating a stage per frame.
    expect(danger.getStage(181)).toBe(danger.getStage(189));
    expect(danger.getStage(212)).not.toBe(danger.getStage(181));
  });

  it('scales health, armor, damage, fire rate, and experience', () => {
    const danger = new DangerSystem();
    const stage = danger.getStage(60);
    const scaled = danger.scaleProfile(ENEMY_PROFILES.gunboat, stage);

    expect(scaled.maxHealth).toBe(
      Math.round(ENEMY_PROFILES.gunboat.maxHealth * stage.healthMultiplier),
    );
    expect(scaled.armor).toBe(
      ENEMY_PROFILES.gunboat.armor + stage.armorBonus,
    );
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

  it('keeps stage values monotonic', () => {
    let previousHealth = 0;
    let previousDamage = 0;
    let previousCount = 0;
    let previousInterval = Number.POSITIVE_INFINITY;

    for (const stage of DANGER_STAGES) {
      expect(stage.healthMultiplier).toBeGreaterThanOrEqual(previousHealth);
      expect(stage.damageMultiplier).toBeGreaterThanOrEqual(previousDamage);
      expect(stage.targetEnemyCount).toBeGreaterThanOrEqual(previousCount);
      expect(stage.spawnIntervalSeconds).toBeLessThanOrEqual(
        previousInterval,
      );
      previousHealth = stage.healthMultiplier;
      previousDamage = stage.damageMultiplier;
      previousCount = stage.targetEnemyCount;
      previousInterval = stage.spawnIntervalSeconds;
    }
  });
});
