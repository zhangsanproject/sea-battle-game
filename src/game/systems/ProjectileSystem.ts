import * as THREE from 'three';
import { GAME_CONFIG, type ProjectileKind } from '../config';
import type { EnemyShip } from '../entities/EnemyShip';
import type { PlayerShip } from '../entities/PlayerShip';
import type { EnemyManager } from './EnemyManager';
import { segmentIntersectsSphere } from './collision';

const PROJECTILE_POOL_SIZE = 80;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
/** Recorded positions kept per projectile for the curved tracer trail. */
const TRAIL_POINTS = 8;

export type ProjectileOwner = 'player' | 'enemy';

export interface ProjectileFireOptions {
  owner: ProjectileOwner;
  speed: number;
  damage: number;
  maxDistance: number;
  kind?: ProjectileKind;
  /** Guided missiles steer toward this target until it is destroyed. */
  homingTarget?: EnemyShip | null;
  /** Missiles climb straight up for this long before homing in. */
  verticalLaunchSeconds?: number;
  turnRate?: number;
  splashRadius?: number;
  splashDamageFactor?: number;
  /** Downward pull applied to the projectile. Shells arc when this is > 0. */
  gravity?: number;
}

export interface ProjectileSystemOptions {
  enemies: EnemyManager;
  player: PlayerShip;
  onEnemyKilled: (enemy: EnemyShip) => void;
  onEnemyHit?: (
    position: THREE.Vector3,
    enemy: EnemyShip,
    kind: ProjectileKind,
    damage: number,
  ) => void;
  onPlayerHit: (damageTaken: number) => void;
  /** Emits smoke / wake puffs behind missiles and torpedoes while they fly. */
  onTrailPuff?: (position: THREE.Vector3, kind: ProjectileKind) => void;
  /** Fires whenever a projectile actually leaves its slot (for run stats). */
  onFired?: (owner: ProjectileOwner, kind: ProjectileKind) => void;
}

interface ProjectileSlot {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  owner: ProjectileOwner;
  kind: ProjectileKind;
  speed: number;
  damage: number;
  distanceRemaining: number;
  homingTarget: EnemyShip | null;
  launchPhaseRemaining: number;
  turnRate: number;
  splashRadius: number;
  splashDamageFactor: number;
  gravity: number;
  /** Shells follow their (arcing) velocity vector instead of the launch line. */
  orientWithVelocity: boolean;
  trailTimer: number;
  trailRed: number;
  trailGreen: number;
  trailBlue: number;
  /** Byte offset of this slot inside the shared trail history buffer. */
  trailOffset: number;
  active: boolean;
}

/**
 * Solves the low-arc launch velocity that lands a projectile on `target` under
 * constant gravity. Returns false when the target is out of reach at `speed`,
 * so the caller can fall back to a straight shot.
 */
export function solveBallisticVelocity(
  origin: THREE.Vector3,
  target: THREE.Vector3,
  speed: number,
  gravity: number,
  out: THREE.Vector3,
): boolean {
  if (speed <= 0) {
    return false;
  }

  const deltaX = target.x - origin.x;
  const deltaZ = target.z - origin.z;
  const deltaY = target.y - origin.y;

  if (gravity <= 0) {
    out.set(deltaX, deltaY, deltaZ).normalize().multiplyScalar(speed);
    return true;
  }

  const horizontal = Math.hypot(deltaX, deltaZ);

  if (horizontal < 0.0001) {
    out.set(0, deltaY >= 0 ? speed : -speed, 0);
    return true;
  }

  const speedSq = speed * speed;
  const discriminant =
    speedSq * speedSq -
    gravity * (gravity * horizontal * horizontal + 2 * deltaY * speedSq);

  if (discriminant < 0) {
    return false;
  }

  const tangent =
    (speedSq - Math.sqrt(discriminant)) / (gravity * horizontal);
  const cosine = 1 / Math.sqrt(1 + tangent * tangent);

  out.set(
    (deltaX / horizontal) * speed * cosine,
    speed * tangent * cosine,
    (deltaZ / horizontal) * speed * cosine,
  );
  return true;
}

function trailRgb(kind: ProjectileKind, owner: ProjectileOwner): [number, number, number] {
  if (owner === 'enemy') {
    return kind === 'missile' ? [1, 0.45, 0.2] : [1, 0.36, 0.22];
  }

  if (kind === 'missile') {
    return [0.45, 0.85, 1];
  }
  if (kind === 'torpedo') {
    return [1, 0.92, 0.72];
  }
  if (kind === 'secondary') {
    return [1, 0.72, 0.3];
  }
  return [1, 0.82, 0.36];
}

export class ProjectileSystem {
  readonly root = new THREE.Group();

  private readonly slots: ProjectileSlot[] = [];
  private readonly direction = new THREE.Vector3();
  private readonly missileForward = new THREE.Vector3();
  private readonly turnAxis = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly targetPoint = new THREE.Vector3();
  private readonly impactPoint = new THREE.Vector3();
  private readonly ballisticVelocity = new THREE.Vector3();
  private readonly trailGeometry = new THREE.BufferGeometry();
  private readonly trailPositions = new Float32Array(
    PROJECTILE_POOL_SIZE * (TRAIL_POINTS - 1) * 2 * 3,
  );
  private readonly trailColors = new Float32Array(
    PROJECTILE_POOL_SIZE * (TRAIL_POINTS - 1) * 2 * 3,
  );
  private readonly trailLine: THREE.LineSegments;
  /** Per-slot ring of recent positions, newest first. */
  private readonly trailHistory = new Float32Array(
    PROJECTILE_POOL_SIZE * TRAIL_POINTS * 3,
  );
  private readonly geometry: THREE.CylinderGeometry;
  private readonly playerMaterial: THREE.MeshStandardMaterial;
  private readonly enemyMaterial: THREE.MeshStandardMaterial;
  private readonly torpedoMaterial: THREE.MeshStandardMaterial;
  private readonly enemyTorpedoMaterial: THREE.MeshStandardMaterial;
  private readonly missileMaterial: THREE.MeshStandardMaterial;
  private readonly enemyMissileMaterial: THREE.MeshStandardMaterial;
  private readonly enemies: EnemyManager;
  private readonly player: PlayerShip;
  private readonly onEnemyKilled: (enemy: EnemyShip) => void;
  private readonly onEnemyHit:
    | ((
        position: THREE.Vector3,
        enemy: EnemyShip,
        kind: ProjectileKind,
        damage: number,
      ) => void)
    | null;
  private readonly onPlayerHit: (damageTaken: number) => void;
  private readonly onTrailPuff:
    | ((position: THREE.Vector3, kind: ProjectileKind) => void)
    | null;
  private readonly onFired:
    | ((owner: ProjectileOwner, kind: ProjectileKind) => void)
    | null;
  private disposed = false;

  constructor(options: ProjectileSystemOptions) {
    this.root.name = 'Projectiles';
    this.enemies = options.enemies;
    this.player = options.player;
    this.onEnemyKilled = options.onEnemyKilled;
    this.onEnemyHit = options.onEnemyHit ?? null;
    this.onPlayerHit = options.onPlayerHit;
    this.onTrailPuff = options.onTrailPuff ?? null;
    this.onFired = options.onFired ?? null;

    this.geometry = new THREE.CylinderGeometry(0.07, 0.105, 0.72, 6);
    this.playerMaterial = new THREE.MeshStandardMaterial({
      color: 0xffc35e,
      emissive: 0xff7a26,
      emissiveIntensity: 1.9,
      metalness: 0.3,
      roughness: 0.28,
    });
    this.enemyMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6a4a,
      emissive: 0xff2d16,
      emissiveIntensity: 2.1,
      metalness: 0.25,
      roughness: 0.3,
    });
    this.torpedoMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff0c2,
      emissive: 0xff9b3a,
      emissiveIntensity: 2.4,
      metalness: 0.4,
      roughness: 0.22,
    });
    this.enemyTorpedoMaterial = new THREE.MeshStandardMaterial({
      color: 0xff7454,
      emissive: 0xff2a12,
      emissiveIntensity: 2.5,
      metalness: 0.35,
      roughness: 0.25,
    });
    this.missileMaterial = new THREE.MeshStandardMaterial({
      color: 0xd7f6ff,
      emissive: 0x39c7ff,
      emissiveIntensity: 2.8,
      metalness: 0.45,
      roughness: 0.2,
    });
    this.enemyMissileMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd6c2,
      emissive: 0xff5a24,
      emissiveIntensity: 2.8,
      metalness: 0.4,
      roughness: 0.22,
    });

    for (let index = 0; index < PROJECTILE_POOL_SIZE; index += 1) {
      const mesh = new THREE.Mesh(this.geometry, this.playerMaterial);
      mesh.name = `Projectile-${index}`;
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.root.add(mesh);

      this.slots.push({
        mesh,
        velocity: new THREE.Vector3(),
        owner: 'player',
        kind: 'shell',
        speed: 0,
        damage: 0,
        distanceRemaining: 0,
        homingTarget: null,
        launchPhaseRemaining: 0,
        turnRate: 0,
        splashRadius: 0,
        splashDamageFactor: 0,
        gravity: 0,
        orientWithVelocity: false,
        trailTimer: 0,
        trailRed: 1,
        trailGreen: 0.8,
        trailBlue: 0.4,
        trailOffset: index * TRAIL_POINTS * 3,
        active: false,
      });
    }

    // One additive line batch carries every tracer trail, so the whole effect
    // costs a single draw call no matter how many rounds are in the air.
    const positionAttribute = new THREE.BufferAttribute(this.trailPositions, 3);
    const colorAttribute = new THREE.BufferAttribute(this.trailColors, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
    this.trailGeometry.setAttribute('position', positionAttribute);
    this.trailGeometry.setAttribute('color', colorAttribute);

    this.trailLine = new THREE.LineSegments(
      this.trailGeometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.trailLine.name = 'ProjectileTrails';
    this.trailLine.frustumCulled = false;
    this.trailLine.renderOrder = 9;
    this.root.add(this.trailLine);
  }

  getActiveCount(): number {
    let count = 0;
    for (const slot of this.slots) {
      if (slot.active) {
        count += 1;
      }
    }
    return count;
  }

  fire(
    origin: THREE.Vector3,
    target: THREE.Vector3,
    options: ProjectileFireOptions,
  ): void {
    if (this.disposed) {
      return;
    }

    const kind = options.kind ?? 'shell';
    const verticalLaunchSeconds =
      kind === 'missile' ? Math.max(0, options.verticalLaunchSeconds ?? 0) : 0;
    const gravity =
      verticalLaunchSeconds > 0 ? 0 : Math.max(0, options.gravity ?? 0);

    let ballistic = false;

    if (verticalLaunchSeconds > 0) {
      this.direction.set(0, 1, 0);
    } else if (gravity > 0) {
      ballistic = solveBallisticVelocity(
        origin,
        target,
        options.speed,
        gravity,
        this.ballisticVelocity,
      );
      if (ballistic) {
        this.direction
          .copy(this.ballisticVelocity)
          .normalize();
      } else {
        this.direction.subVectors(target, origin);
        if (this.direction.lengthSq() < 0.0001) {
          return;
        }
        this.direction.normalize();
      }
    } else {
      this.direction.subVectors(target, origin);
      if (this.direction.lengthSq() < 0.0001) {
        return;
      }
      this.direction.normalize();
    }

    const slot = this.findAvailableSlot();
    if (!slot) {
      return;
    }

    slot.mesh.position.copy(origin);
    slot.mesh.material =
      kind === 'torpedo'
        ? options.owner === 'player'
          ? this.torpedoMaterial
          : this.enemyTorpedoMaterial
        : kind === 'missile'
          ? options.owner === 'player'
            ? this.missileMaterial
            : this.enemyMissileMaterial
          : options.owner === 'player'
            ? this.playerMaterial
            : this.enemyMaterial;
    // Shells are drawn as a stretched tracer, missiles and torpedoes keep
    // their fatter body so the silhouette still reads at a distance.
    if (kind === 'torpedo') {
      slot.mesh.scale.setScalar(1.9);
    } else if (kind === 'missile') {
      slot.mesh.scale.setScalar(1.35);
    } else if (kind === 'secondary') {
      slot.mesh.scale.set(0.58, 0.95, 0.58);
    } else {
      slot.mesh.scale.set(0.92, 1.75, 0.92);
    }
    slot.mesh.quaternion.setFromUnitVectors(WORLD_UP, this.direction);
    slot.mesh.visible = true;
    if (ballistic) {
      slot.velocity.copy(this.ballisticVelocity);
    } else {
      slot.velocity.copy(this.direction).multiplyScalar(options.speed);
    }
    slot.owner = options.owner;
    slot.kind = kind;
    slot.speed = options.speed;
    slot.damage = options.damage;
    slot.distanceRemaining = options.maxDistance;
    slot.homingTarget =
      kind === 'missile' ? (options.homingTarget ?? null) : null;
    slot.launchPhaseRemaining = verticalLaunchSeconds;
    slot.turnRate = options.turnRate ?? 0;
    slot.splashRadius = options.splashRadius ?? 0;
    slot.splashDamageFactor = options.splashDamageFactor ?? 0;
    slot.gravity = ballistic ? gravity : 0;
    slot.orientWithVelocity = ballistic && kind !== 'missile';
    slot.trailTimer = 0;

    const [red, green, blue] = trailRgb(kind, options.owner);
    slot.trailRed = red;
    slot.trailGreen = green;
    slot.trailBlue = blue;
    slot.active = true;

    this.resetTrail(slot, origin);
    this.onFired?.(options.owner, kind);
  }

  update(deltaTime: number): void {
    if (this.disposed) {
      return;
    }

    for (const slot of this.slots) {
      if (!slot.active) {
        continue;
      }

      if (slot.kind === 'missile') {
        if (slot.launchPhaseRemaining > 0) {
          slot.launchPhaseRemaining = Math.max(
            0,
            slot.launchPhaseRemaining - deltaTime,
          );
        } else {
          this.steerMissile(slot, deltaTime);
        }
      }

      if (slot.gravity > 0) {
        slot.velocity.y -= slot.gravity * deltaTime;

        if (slot.orientWithVelocity && slot.velocity.lengthSq() > 0.0001) {
          this.direction.copy(slot.velocity).normalize();
          slot.mesh.quaternion.setFromUnitVectors(WORLD_UP, this.direction);
        }
      }

      const stepDistance = slot.velocity.length() * deltaTime;
      this.previousPosition.copy(slot.mesh.position);
      slot.mesh.position.addScaledVector(slot.velocity, deltaTime);
      slot.distanceRemaining -= stepDistance;

      let hit = false;

      if (slot.owner === 'player') {
        hit = this.updatePlayerProjectile(slot);
      } else {
        hit = this.updateEnemyProjectile(slot);
      }

      if (hit) {
        continue;
      }

      if (slot.distanceRemaining <= 0) {
        this.deactivate(slot);
        continue;
      }

      this.recordTrail(slot);
      this.emitTrailPuff(slot, deltaTime);
    }

    this.updateTrailBuffer();
  }

  clear(): void {
    for (const slot of this.slots) {
      if (slot.active) {
        this.deactivate(slot);
      }
    }
    this.trailColors.fill(0);
    this.trailGeometry.getAttribute('color').needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (const slot of this.slots) {
      slot.active = false;
    }
    this.root.clear();
    this.geometry.dispose();
    this.trailGeometry.dispose();
    (this.trailLine.material as THREE.Material).dispose();
    this.playerMaterial.dispose();
    this.enemyMaterial.dispose();
    this.torpedoMaterial.dispose();
    this.enemyTorpedoMaterial.dispose();
    this.missileMaterial.dispose();
    this.enemyMissileMaterial.dispose();
    this.slots.length = 0;
  }

  private updatePlayerProjectile(slot: ProjectileSlot): boolean {
    for (const enemy of this.enemies.getEnemies()) {
      if (!enemy.isTargetable) {
        continue;
      }

      enemy.getAimPoint(this.targetPoint);

      if (
        !segmentIntersectsSphere(
          this.previousPosition,
          slot.mesh.position,
          this.targetPoint,
          enemy.profile.hitRadius,
        )
      ) {
        continue;
      }

      this.applyPlayerImpact(slot, enemy);
      return true;
    }

    return false;
  }

  private applyPlayerImpact(
    slot: ProjectileSlot,
    primaryTarget: EnemyShip,
  ): void {
    this.impactPoint.copy(slot.mesh.position);

    // Armour is resolved inside takeDamage; ask for the same number first so
    // the damage text matches what the hull actually lost.
    const dealtDamage = primaryTarget.previewDamage(slot.damage);
    const killed = primaryTarget.takeDamage(slot.damage);
    this.onEnemyHit?.(this.impactPoint, primaryTarget, slot.kind, dealtDamage);

    if (killed) {
      this.onEnemyKilled(primaryTarget);
    }

    if (slot.splashRadius > 0) {
      const splashDamage = Math.max(
        1,
        Math.round(slot.damage * slot.splashDamageFactor),
      );
      const splashRadiusSq = slot.splashRadius * slot.splashRadius;

      for (const enemy of this.enemies.getEnemies()) {
        if (enemy === primaryTarget || !enemy.isTargetable) {
          continue;
        }

        enemy.getAimPoint(this.targetPoint);
        if (
          this.impactPoint.distanceToSquared(this.targetPoint) >
          splashRadiusSq
        ) {
          continue;
        }

        if (enemy.takeDamage(splashDamage)) {
          this.onEnemyKilled(enemy);
        }
      }
    }

    this.deactivate(slot);
  }

  private steerMissile(slot: ProjectileSlot, deltaTime: number): void {
    const target = slot.homingTarget;

    if (target?.isTargetable) {
      target.getAimPoint(this.targetPoint);
      this.direction.subVectors(this.targetPoint, slot.mesh.position);
    } else {
      this.direction.set(0, 0, 0);
    }

    this.missileForward.copy(slot.velocity).normalize();

    if (this.direction.lengthSq() > 0.0001) {
      this.direction.normalize();

      const angle = this.missileForward.angleTo(this.direction);
      if (angle > 0.0001) {
        this.turnAxis.crossVectors(this.missileForward, this.direction);

        if (this.turnAxis.lengthSq() < 0.000001) {
          // Parallel or opposite headings: choose any perpendicular axis.
          this.turnAxis.set(1, 0, 0).cross(this.missileForward);
          if (this.turnAxis.lengthSq() < 0.000001) {
            this.turnAxis.set(0, 0, 1);
          }
        }

        this.turnAxis.normalize();
        this.missileForward.applyAxisAngle(
          this.turnAxis,
          Math.min(angle, slot.turnRate * deltaTime),
        );
        slot.velocity.copy(this.missileForward).multiplyScalar(slot.speed);
      }
    }

    slot.mesh.quaternion.setFromUnitVectors(WORLD_UP, this.missileForward);
  }

  private updateEnemyProjectile(slot: ProjectileSlot): boolean {
    if (this.player.isDestroyed) {
      return false;
    }

    this.player.getAimPoint(this.targetPoint);

    if (
      !segmentIntersectsSphere(
        this.previousPosition,
        slot.mesh.position,
        this.targetPoint,
        GAME_CONFIG.player.hitRadius,
      )
    ) {
      return false;
    }

    const damageTaken = this.player.takeDamage(slot.damage);
    this.deactivate(slot);

    if (damageTaken > 0) {
      this.onPlayerHit(damageTaken);
    }

    return true;
  }

  private findAvailableSlot(): ProjectileSlot | null {
    for (const slot of this.slots) {
      if (!slot.active) {
        return slot;
      }
    }
    return null;
  }

  private deactivate(slot: ProjectileSlot): void {
    slot.active = false;
    slot.mesh.visible = false;
    slot.homingTarget = null;
    slot.launchPhaseRemaining = 0;
    slot.splashRadius = 0;
    slot.splashDamageFactor = 0;
    slot.gravity = 0;
    slot.orientWithVelocity = false;
    slot.trailTimer = 0;
  }

  /** Fills a slot's history so a fresh round does not draw a line to the last. */
  private resetTrail(slot: ProjectileSlot, origin: THREE.Vector3): void {
    const base = slot.trailOffset;

    for (let point = 0; point < TRAIL_POINTS; point += 1) {
      const index = base + point * 3;
      this.trailHistory[index] = origin.x;
      this.trailHistory[index + 1] = origin.y;
      this.trailHistory[index + 2] = origin.z;
    }
  }

  private recordTrail(slot: ProjectileSlot): void {
    const base = slot.trailOffset;
    const stride = TRAIL_POINTS * 3;

    this.trailHistory.copyWithin(base + 3, base, base + stride - 3);
    this.trailHistory[base] = slot.mesh.position.x;
    this.trailHistory[base + 1] = slot.mesh.position.y;
    this.trailHistory[base + 2] = slot.mesh.position.z;
  }

  private emitTrailPuff(slot: ProjectileSlot, deltaTime: number): void {
    if (!this.onTrailPuff) {
      return;
    }

    if (slot.kind !== 'missile' && slot.kind !== 'torpedo') {
      return;
    }

    slot.trailTimer -= deltaTime;

    if (slot.trailTimer > 0) {
      return;
    }

    slot.trailTimer = slot.kind === 'missile' ? 0.03 : 0.055;
    this.onTrailPuff(slot.mesh.position, slot.kind);
  }

  /** Rewrites the shared line batch: one fading segment per recorded step. */
  private updateTrailBuffer(): void {
    const positions = this.trailPositions;
    const colors = this.trailColors;
    const history = this.trailHistory;
    const segments = TRAIL_POINTS - 1;
    let cursor = 0;

    for (const slot of this.slots) {
      if (!slot.active) {
        for (let segment = 0; segment < segments; segment += 1) {
          colors[cursor] = 0;
          colors[cursor + 1] = 0;
          colors[cursor + 2] = 0;
          colors[cursor + 3] = 0;
          colors[cursor + 4] = 0;
          colors[cursor + 5] = 0;
          cursor += 6;
        }
        continue;
      }

      const base = slot.trailOffset;

      for (let segment = 0; segment < segments; segment += 1) {
        const head = base + segment * 3;
        const tail = head + 3;

        positions[cursor] = history[head] ?? 0;
        positions[cursor + 1] = history[head + 1] ?? 0;
        positions[cursor + 2] = history[head + 2] ?? 0;
        positions[cursor + 3] = history[tail] ?? 0;
        positions[cursor + 4] = history[tail + 1] ?? 0;
        positions[cursor + 5] = history[tail + 2] ?? 0;

        const fade = 1 - segment / segments;
        const level = fade * fade;

        colors[cursor] = slot.trailRed * level;
        colors[cursor + 1] = slot.trailGreen * level;
        colors[cursor + 2] = slot.trailBlue * level;
        colors[cursor + 3] = slot.trailRed * level * 0.8;
        colors[cursor + 4] = slot.trailGreen * level * 0.8;
        colors[cursor + 5] = slot.trailBlue * level * 0.8;

        cursor += 6;
      }
    }

    const positionAttribute = this.trailGeometry.getAttribute('position');
    const colorAttribute = this.trailGeometry.getAttribute('color');
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
  }
}
