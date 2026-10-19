import * as THREE from 'three';
import { GAME_CONFIG } from '../config';
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
}

export interface ProjectileSystemOptions {
  enemies: EnemyManager;
  player: PlayerShip;
  onEnemyKilled: (enemy: EnemyShip) => void;
  onEnemyHit?: (position: THREE.Vector3, enemy: EnemyShip) => void;
  onPlayerHit: (damageTaken: number) => void;
}

interface ProjectileSlot {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  owner: ProjectileOwner;
  speed: number;
  damage: number;
  distanceRemaining: number;
  active: boolean;
}

export class ProjectileSystem {
  readonly root = new THREE.Group();

  private readonly slots: ProjectileSlot[] = [];
  private readonly direction = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly targetPoint = new THREE.Vector3();
  private readonly geometry: THREE.CylinderGeometry;
  private readonly playerMaterial: THREE.MeshStandardMaterial;
  private readonly enemyMaterial: THREE.MeshStandardMaterial;
  private readonly enemies: EnemyManager;
  private readonly player: PlayerShip;
  private readonly onEnemyKilled: (enemy: EnemyShip) => void;
  private readonly onEnemyHit:
    | ((position: THREE.Vector3, enemy: EnemyShip) => void)
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
        speed: 0,
        damage: 0,
        distanceRemaining: 0,
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

    this.direction.subVectors(target, origin);
    if (this.direction.lengthSq() < 0.0001) {
      return;
    }
    this.direction.normalize();

    const slot = this.findAvailableSlot();
    if (!slot) {
      return;
    }

    slot.mesh.position.copy(origin);
    slot.mesh.material =
      options.owner === 'player' ? this.playerMaterial : this.enemyMaterial;
    slot.mesh.quaternion.setFromUnitVectors(WORLD_UP, this.direction);
    slot.mesh.visible = true;
    slot.velocity.copy(this.direction).multiplyScalar(options.speed);
    slot.owner = options.owner;
    slot.speed = options.speed;
    slot.damage = options.damage;
    slot.distanceRemaining = options.maxDistance;
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

      const killed = enemy.takeDamage(slot.damage);
      this.onEnemyHit?.(slot.mesh.position, enemy);
      this.deactivate(slot);

      if (killed) {
        this.onEnemyKilled(enemy);
      }

      return true;
    }

    return false;
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
  }
}
