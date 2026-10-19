import { Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  clampToArena,
  moveTowards,
  normalizeAngle,
  rotateTowardsAngle,
} from '../src/game/systems/movementMath';

describe('movementMath', () => {
  it('wraps angles into (-PI, PI]', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(Math.PI * 2 + 0.25)).toBeCloseTo(0.25, 6);
    expect(normalizeAngle(-Math.PI * 2 - 0.25)).toBeCloseTo(-0.25, 6);
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 6);
  });

  it('turns along the shortest arc without overshooting', () => {
    expect(rotateTowardsAngle(3.0, -3.0, 0.1)).toBeCloseTo(3.1, 6);
    expect(rotateTowardsAngle(0, 1, 2)).toBeCloseTo(1, 6);
    expect(rotateTowardsAngle(-1, 1, 5)).toBeCloseTo(1, 6);
  });

  it('moves velocity toward a target using a maximum delta', () => {
    const velocity = new Vector2(0, 0);
    moveTowards(velocity, 10, 0, 3);
    expect(velocity.x).toBeCloseTo(3, 6);
    expect(velocity.y).toBeCloseTo(0, 6);

    moveTowards(velocity, 10, 0, 20);
    expect(velocity.x).toBeCloseTo(10, 6);
    expect(velocity.y).toBeCloseTo(0, 6);
  });

  it('clamps positions to the arena and removes outward velocity', () => {
    const position = new Vector2(12, 0);
    const velocity = new Vector2(5, 3);

    clampToArena(position, velocity, 10);

    expect(position.x).toBeCloseTo(10, 6);
    expect(position.y).toBeCloseTo(0, 6);
    expect(velocity.x).toBeCloseTo(0, 6);
    expect(velocity.y).toBeCloseTo(3, 6);
  });

  it('leaves inward and tangential motion untouched inside the arena', () => {
    const position = new Vector2(4, 0);
    const velocity = new Vector2(0, 3);

    clampToArena(position, velocity, 10);

    expect(position.x).toBe(4);
    expect(position.y).toBe(0);
    expect(velocity.x).toBe(0);
    expect(velocity.y).toBe(3);
  });
});
