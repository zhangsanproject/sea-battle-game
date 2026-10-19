import * as THREE from 'three';

const PARTICLE_POOL_SIZE = 72;

interface EffectSlot {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  velocity: THREE.Vector3;
  age: number;
  duration: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
  drag: number;
  active: boolean;
}

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
    options: {
      color: number;
      velocityX: number;
      velocityY: number;
      velocityZ: number;
      duration: number;
      startScale: number;
      endScale: number;
      startOpacity: number;
      drag: number;
    },
  ): void {
    if (this.disposed) {
      return;
    }

    const slot = this.findAvailableSlot();
    if (!slot) {
      return;
    }

    slot.mesh.position.set(
      position.x,
      Math.max(0.4, position.y + 0.9),
      position.z,
    );
    slot.mesh.scale.setScalar(options.startScale);
    slot.mesh.material.color.setHex(options.color);
    slot.mesh.material.opacity = options.startOpacity;
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
