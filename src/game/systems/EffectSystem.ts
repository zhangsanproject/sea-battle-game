import * as THREE from 'three';
import type { ProjectileKind } from '../config';

const PARTICLE_POOL_SIZE = 128;

interface EffectSlot {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  velocity: THREE.Vector3;
  age: number;
  duration: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
  drag: number;
  gravity: number;
  active: boolean;
}

interface ParticleOptions {
  color: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  duration: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
  drag: number;
  /** Downward acceleration, for sparks and water that should fall back down. */
  gravity?: number;
  /** Smoke and foam read better alpha-blended than additive. */
  additive?: boolean;
}

/**
 * Pooled particle effects: muzzle smoke, impact sparks, water splashes and
 * explosions. Everything is one shared unit sphere, so a burst costs no
 * allocation at runtime.
 */
export class EffectSystem {
  readonly root = new THREE.Group();

  private readonly slots: EffectSlot[] = [];
  private readonly geometry = new THREE.SphereGeometry(1, 8, 6);
  private disposed = false;

  constructor() {
    this.root.name = 'CombatEffects';

    for (let index = 0; index < PARTICLE_POOL_SIZE; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffa34a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.name = `Effect-${index}`;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      this.root.add(mesh);

      this.slots.push({
        mesh,
        velocity: new THREE.Vector3(),
        age: 0,
        duration: 1,
        startScale: 0.2,
        endScale: 1,
        startOpacity: 1,
        drag: 1.8,
        gravity: 0,
        active: false,
      });
    }
  }

  spawnHit(position: THREE.Vector3): void {
    this.spawnParticle(position, {
      color: 0xffd28e,
      velocityX: (Math.random() - 0.5) * 3,
      velocityY: 1.2 + Math.random() * 2,
      velocityZ: (Math.random() - 0.5) * 3,
      duration: 0.24,
      startScale: 0.1,
      endScale: 0.32,
      startOpacity: 0.9,
      drag: 3,
    });
  }

  /**
   * Impact break-up for a projectile hit: flash, sparks, a water spout and a
   * puff of smoke. Heavier rounds throw more of everything.
   */
  spawnImpact(
    position: THREE.Vector3,
    kind: ProjectileKind = 'shell',
  ): void {
    const heavy = kind === 'missile' || kind === 'torpedo';
    const scale = heavy ? 1.35 : kind === 'secondary' ? 0.7 : 1;

    this.spawnParticle(position, {
      color: 0xfff3c8,
      velocityX: 0,
      velocityY: 0.4,
      velocityZ: 0,
      duration: 0.12,
      startScale: 0.55 * scale,
      endScale: 1.25 * scale,
      startOpacity: 0.95,
      drag: 0,
    });

    const sparkCount = heavy ? 12 : 8;
    for (let index = 0; index < sparkCount; index += 1) {
      const angle = (index / sparkCount) * Math.PI * 2 + Math.random() * 0.5;
      const speed = (3.4 + Math.random() * 4.2) * scale;

      this.spawnParticle(position, {
        color: index % 3 === 0 ? 0xfff0c0 : 0xffa04a,
        velocityX: Math.cos(angle) * speed,
        velocityY: 1.4 + Math.random() * 3.2,
        velocityZ: Math.sin(angle) * speed,
        duration: 0.16 + Math.random() * 0.14,
        startScale: 0.1 * scale,
        endScale: 0.14 * scale,
        startOpacity: 1,
        drag: 4.5,
        gravity: 16,
      });
    }

    if (!heavy) {
      for (let index = 0; index < 3; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 1.4;

        this.spawnParticle(position, {
          color: 0xa9e2f0,
          velocityX: Math.cos(angle) * speed,
          velocityY: 2.6 + Math.random() * 1.8,
          velocityZ: Math.sin(angle) * speed,
          duration: 0.3 + Math.random() * 0.15,
          startScale: 0.14,
          endScale: 0.42,
          startOpacity: 0.6,
          drag: 2.4,
          gravity: 12,
          additive: false,
        });
      }
    }

    this.spawnParticle(position, {
      color: 0x3a4046,
      velocityX: (Math.random() - 0.5) * 0.8,
      velocityY: 0.7 + Math.random() * 0.6,
      velocityZ: (Math.random() - 0.5) * 0.8,
      duration: 0.42 + Math.random() * 0.2,
      startScale: 0.22 * scale,
      endScale: 0.75 * scale,
      startOpacity: 0.42,
      drag: 2.6,
      additive: false,
    });
  }

  /** Gun smoke blown out of the barrel right after a shot. */
  spawnMuzzleSmoke(
    position: THREE.Vector3,
    directionX: number,
    directionZ: number,
  ): void {
    const length = Math.hypot(directionX, directionZ) || 1;
    const forwardX = directionX / length;
    const forwardZ = directionZ / length;

    for (let index = 0; index < 2; index += 1) {
      const speed = 2.2 + Math.random();

      this.spawnParticle(position, {
        color: 0x9aa6ac,
        velocityX: forwardX * speed + (Math.random() - 0.5),
        velocityY: 0.5 + Math.random() * 0.9,
        velocityZ: forwardZ * speed + (Math.random() - 0.5),
        duration: 0.34 + Math.random() * 0.16,
        startScale: 0.14,
        endScale: 0.62,
        startOpacity: 0.34,
        drag: 3.4,
        additive: false,
      });
    }
  }

  /** Exhaust smoke behind a missile, or a foam wake behind a torpedo. */
  spawnTrailPuff(position: THREE.Vector3, kind: ProjectileKind): void {
    if (kind === 'torpedo') {
      this.spawnParticle(position, {
        color: 0xdff2f6,
        velocityX: (Math.random() - 0.5) * 1.2,
        velocityY: 0.5 + Math.random() * 0.5,
        velocityZ: (Math.random() - 0.5) * 1.2,
        duration: 0.26,
        startScale: 0.13,
        endScale: 0.34,
        startOpacity: 0.5,
        drag: 3,
        additive: false,
      });
      return;
    }

    this.spawnParticle(position, {
      color: 0xa8b0b4,
      velocityX: (Math.random() - 0.5) * 0.6,
      velocityY: 0.3 + Math.random() * 0.4,
      velocityZ: (Math.random() - 0.5) * 0.6,
      duration: 0.3,
      startScale: 0.1,
      endScale: 0.4,
      startOpacity: 0.32,
      drag: 2.4,
      additive: false,
    });
  }

  spawnExplosion(position: THREE.Vector3, scale = 1): void {
    const particleCount = 11;

    for (let index = 0; index < particleCount; index += 1) {
      const angle = (index / particleCount) * Math.PI * 2;
      const speed = (2.5 + Math.random() * 4.5) * scale;
      const color =
        index % 3 === 0 ? 0xffe3a0 : index % 3 === 1 ? 0xff7a31 : 0xd93b24;

      this.spawnParticle(position, {
        color,
        velocityX: Math.cos(angle) * speed,
        velocityY: 1.5 + Math.random() * 3.2,
        velocityZ: Math.sin(angle) * speed,
        duration: 0.55 + Math.random() * 0.45,
        startScale: 0.22 * scale,
        endScale: (0.9 + Math.random() * 0.9) * scale,
        startOpacity: 0.9,
        drag: 1.2,
      });
    }

    this.spawnParticle(position, {
      color: 0xfff2c4,
      velocityX: 0,
      velocityY: 0.8,
      velocityZ: 0,
      duration: 0.24,
      startScale: 0.8 * scale,
      endScale: 2.0 * scale,
      startOpacity: 0.8,
      drag: 0,
    });

    this.spawnParticle(position, {
      color: 0x353b40,
      velocityX: 0,
      velocityY: 1.4,
      velocityZ: 0,
      duration: 0.9,
      startScale: 0.6 * scale,
      endScale: 1.7 * scale,
      startOpacity: 0.34,
      drag: 0.8,
      additive: false,
    });
  }

  update(deltaTime: number): void {
    if (this.disposed) {
      return;
    }

    for (const slot of this.slots) {
      if (!slot.active) {
        continue;
      }

      slot.age += deltaTime;
      const progress = Math.min(slot.age / slot.duration, 1);
      const dragFactor = Math.max(0, 1 - slot.drag * deltaTime);

      slot.velocity.multiplyScalar(dragFactor);
      slot.velocity.y -= slot.gravity * deltaTime;
      slot.mesh.position.addScaledVector(slot.velocity, deltaTime);
      slot.mesh.scale.setScalar(
        slot.startScale + (slot.endScale - slot.startScale) * progress,
      );
      slot.mesh.material.opacity = slot.startOpacity * (1 - progress);

      if (progress >= 1) {
        slot.active = false;
        slot.mesh.visible = false;
      }
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

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (const slot of this.slots) {
      slot.active = false;
      slot.mesh.material.dispose();
    }
    this.geometry.dispose();
    this.root.clear();
    this.slots.length = 0;
  }

  private spawnParticle(
    position: THREE.Vector3,
    options: ParticleOptions,
  ): void {
    if (this.disposed) {
      return;
    }

    const slot = this.findAvailableSlot();
    if (!slot) {
      return;
    }

    const additive = options.additive !== false;

    slot.mesh.position.set(
      position.x,
      Math.max(0.4, position.y + 0.9),
      position.z,
    );
    slot.mesh.scale.setScalar(options.startScale);
    slot.mesh.material.color.setHex(options.color);
    slot.mesh.material.opacity = options.startOpacity;
    slot.mesh.material.blending = additive
      ? THREE.AdditiveBlending
      : THREE.NormalBlending;
    slot.mesh.visible = true;
    slot.velocity.set(
      options.velocityX,
      options.velocityY,
      options.velocityZ,
    );
    slot.age = 0;
    slot.duration = options.duration;
    slot.startScale = options.startScale;
    slot.endScale = options.endScale;
    slot.startOpacity = options.startOpacity;
    slot.drag = options.drag;
    slot.gravity = options.gravity ?? 0;
    slot.active = true;
  }

  private findAvailableSlot(): EffectSlot | null {
    for (const slot of this.slots) {
      if (!slot.active) {
        return slot;
      }
    }
    return null;
  }
}
