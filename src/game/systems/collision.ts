import type { Vector3 } from 'three';

/**
 * Returns true when the swept segment from start to end passes within
 * `radius` of center. Uses squared distances and allocates no objects.
 */
export function segmentIntersectsSphere(
  start: Vector3,
  end: Vector3,
  center: Vector3,
  radius: number,
): boolean {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentZ = end.z - start.z;
  const toCenterX = center.x - start.x;
  const toCenterY = center.y - start.y;
  const toCenterZ = center.z - start.z;

  const segmentLengthSq =
    segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ;

  if (segmentLengthSq === 0) {
    const distanceSq =
      toCenterX * toCenterX + toCenterY * toCenterY + toCenterZ * toCenterZ;
    return distanceSq <= radius * radius;
  }

  const projection = Math.min(
    1,
    Math.max(
      0,
      (toCenterX * segmentX + toCenterY * segmentY + toCenterZ * segmentZ) /
        segmentLengthSq,
    ),
  );

  const closestX = start.x + segmentX * projection;
  const closestY = start.y + segmentY * projection;
  const closestZ = start.z + segmentZ * projection;
  const distanceX = center.x - closestX;
  const distanceY = center.y - closestY;
  const distanceZ = center.z - closestZ;

  return (
    distanceX * distanceX + distanceY * distanceY + distanceZ * distanceZ <=
    radius * radius
  );
}
