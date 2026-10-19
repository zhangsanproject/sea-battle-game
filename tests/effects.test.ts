import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { EffectSystem } from '../src/game/systems/EffectSystem';

describe('EffectSystem', () => {
  it('pools hit and explosion particles and expires them', () => {
    const effects = new EffectSystem();
    effects.spawnHit(new Vector3(0, 0, 0));
    expect(effects.getActiveCount()).toBe(1);

    effects.spawnExplosion(new Vector3(0, 0, -10), 1.2);
    expect(effects.getActiveCount()).toBeGreaterThan(1);

    for (let frame = 0; frame < 120; frame += 1) {
      effects.update(1 / 60);
    }

    expect(effects.getActiveCount()).toBe(0);

    effects.dispose();
  });

  it('does not create unbounded particles under repeated explosions', () => {
    const effects = new EffectSystem();

    for (let index = 0; index < 30; index += 1) {
      effects.spawnExplosion(new Vector3(0, 0, 0));
    }

    expect(effects.getActiveCount()).toBeLessThanOrEqual(72);

    effects.dispose();
  });
});
