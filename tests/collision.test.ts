import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { segmentIntersectsSphere } from '../src/game/systems/collision';

describe('segmentIntersectsSphere', () => {
  it('detects a segment passing through a target', () => {
    expect(
      segmentIntersectsSphere(
        new Vector3(0, 0, 0),
        new Vector3(10, 0, 0),
        new Vector3(5, 0, 0),
        1,
      ),
    ).toBe(true);
  });

  it('detects a target at the segment endpoint', () => {
    expect(
      segmentIntersectsSphere(
        new Vector3(0, 0, 0),
        new Vector3(10, 0, 0),
        new Vector3(10, 0, 0),
        0.5,
      ),
    ).toBe(true);
  });

  it('rejects a segment that misses the target', () => {
    expect(
      segmentIntersectsSphere(
        new Vector3(0, 0, 0),
        new Vector3(10, 0, 0),
        new Vector3(5, 2, 0),
        1,
      ),
    ).toBe(false);
  });

  it('rejects a target beyond the segment ends', () => {
    expect(
      segmentIntersectsSphere(
        new Vector3(0, 0, 0),
        new Vector3(10, 0, 0),
        new Vector3(12, 0, 0),
        1,
      ),
    ).toBe(false);
  });
});
