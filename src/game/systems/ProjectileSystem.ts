import * as THREE from 'three';
import { GAME_CONFIG, type ProjectileKind } from '../config';
import type { EnemyShip } from '../entities/EnemyShip';
import type { PlayerShip } from '../entities/PlayerShip';
import type { EnemyManager } from './EnemyManager';
import { segmentIntersectsSphere } from './collision';

const PROJECTILE_POOL_SIZE = 48;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

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
}

export interface ProjectileSystemOptions {
  enemies: EnemyManager;
  player: PlayerShip;
  onEnemyKilled: (enemy: EnemyShip) => void;
  onEnemyHit?: (
    position: THREE.Vector3,
    enemy: EnemyShip,
    kind: ProjectileKind,
  ) => void;
  onPlayerHit: (damageTaken: number) => void;
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
  active: boolean;
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
      ) => void)
    | null;
  private readonly onPlayerHit: (damageTaken: number) => void;
  private disposed = false;

  constructor(options: ProjectileSystemOptions) {
    this.root.name = 'Projectiles';
    this.enemies = options.enemies;
    this.player = options.player;
    this.onEnemyKilled = options.onEnemyKilled;
    this.onEnemyHit = options.onEnemyHit ?? null;
    this.onPlayerHit = options.onPlayerHit;

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
        active: false,
      });
    }
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

    if (verticalLaunchSeconds > 0) {
      this.direction.set(0, 1, 0);
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
    slot.mesh.scale.setScalar(
      kind === 'torpedo'
        ? 1.9
        : kind === 'missile'
          ? 1.35
          : kind === 'secondary'
            ? 0.58
            : 1,
    );
    slot.mesh.quaternion.setFromUnitVectors(WORLD_UP, this.direction);
    slot.mesh.visible = true;
    slot.velocity.copy(this.direction).multiplyScalar(options.speed);
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
    slot.active = true;
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

      const stepDistance = slot.speed * deltaTime;
      this.previousPosition.copy(slot.mesh.position);
      slot.mesh.position.addScaledVector(slot.velocity, deltaTime);
      slot.distanceRemaining -= stepDistance;

      let hit = false;

      if (slot.owner === 'player') {
        hit = this.updatePlayerProjectile(slot);
      } else {
        hit = this.updateEnemyProjectile(slot);
      }

      if (!hit && slot.distanceRemaining <= 0) {
        this.deactivate(slot);
      }
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      if (slot.active) {
        this.deactivate(slot);
      }
    }
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

    const killed = primaryTarget.takeDamage(slot.damage);
    this.onEnemyHit?.(this.impactPoint, primaryTarget, slot.kind);

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
  }
}
