import type { Vector2 } from 'three';

const TAU = Math.PI * 2;

/** Wraps an angle into the range (-PI, PI]. */
export function normalizeAngle(angle: number): number {
  let wrapped = angle % TAU;

  if (wrapped <= -Math.PI) {
    wrapped += TAU;
  } else if (wrapped > Math.PI) {
    wrapped -= TAU;
  }

  return wrapped;
}

/** Rotates from current toward target by at most maxStep radians. */
export function rotateTowardsAngle(
  current: number,
  target: number,
  maxStep: number,
): number {
  if (maxStep <= 0) {
    return current;
  }

  const difference = normalizeAngle(target - current);

  if (Math.abs(difference) <= maxStep) {
    return normalizeAngle(target);
  }

  return normalizeAngle(current + Math.sign(difference) * maxStep);
}

/** Moves a 2D velocity toward a target by at most maxDelta units. */
export function moveTowards(
  current: Vector2,
  targetX: number,
  targetY: number,
  maxDelta: number,
): void {
  const differenceX = targetX - current.x;
  const differenceY = targetY - current.y;
  const distance = Math.hypot(differenceX, differenceY);

  if (distance === 0) {
    return;
  }

  if (distance <= maxDelta) {
    current.set(targetX, targetY);
    return;
  }

  const scale = maxDelta / distance;
  current.x += differenceX * scale;
  current.y += differenceY * scale;
}

/**
 * Keeps a ground position inside a circular arena.
 * Outward velocity is removed so the ship can still slide along the boundary.
 */
export function clampToArena(
  position: Vector2,
  velocity: Vector2,
  radius: number,
): void {
  const distance = Math.hypot(position.x, position.y);

  if (distance <= radius || distance === 0) {
    return;
  }

  const normalX = position.x / distance;
  const normalY = position.y / distance;

  position.set(normalX * radius, normalY * radius);

  const outwardSpeed = velocity.x * normalX + velocity.y * normalY;
  if (outwardSpeed > 0) {
    velocity.x -= normalX * outwardSpeed;
    velocity.y -= normalY * outwardSpeed;
  }
}
