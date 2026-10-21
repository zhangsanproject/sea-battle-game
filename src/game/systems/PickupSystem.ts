import * as THREE from 'three';
import { GAME_CONFIG } from '../config';
import type { PlayerShip } from '../entities/PlayerShip';

const PICKUP_POOL_SIZE = 40;

interface PickupSlot {
  mesh: THREE.Mesh;
  value: number;
  phase: number;
  active: boolean;
}

export class PickupSystem {
  readonly root = new THREE.Group();

  private readonly slots: PickupSlot[] = [];
  private readonly geometry = new THREE.OctahedronGeometry(0.42, 0);
  private readonly material = new THREE.MeshStandardMaterial({
    color: 0xffd77a,
    emissive: 0xff9b37,
    emissiveIntensity: 1.8,
    metalness: 0.42,
    roughness: 0.24,
  });
  private readonly ringGeometry = new THREE.TorusGeometry(0.62, 0.035, 6, 28);
  private readonly ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffcf75,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly targetPoint = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();
  private readonly onCollected: (value: number) => void;
  private disposed = false;

  constructor(onCollected: (value: number) => void) {
    this.root.name = 'Pickups';
    this.onCollected = onCollected;

    for (let index = 0; index < PICKUP_POOL_SIZE; index += 1) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.name = `ResourceOrb-${index}`;
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      const halo = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
      halo.rotation.x = Math.PI / 2;
      mesh.add(halo);

      this.root.add(mesh);

      this.slots.push({
        mesh,
        value: 0,
        phase: 0,
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

  spawn(position: THREE.Vector3, value: number): void {
    if (this.disposed || value <= 0) {
      return;
    }

    const slot = this.findAvailableSlot();
    if (!slot) {
      return;
    }

    slot.mesh.position.set(
      position.x,
      GAME_CONFIG.pickup.orbHeight,
      position.z,
    );
    slot.mesh.rotation.set(0, 0, 0);
    slot.mesh.scale.setScalar(1);
    slot.mesh.visible = true;
    slot.value = value;
    slot.phase = position.x * 0.41 + position.z * 0.29;
    slot.active = true;
  }

  update(
    deltaTime: number,
    elapsedTime: number,
    player: PlayerShip,
    magnetRadiusBonus = 0,
  ): void {
    if (this.disposed) {
      return;
    }

    player.getAimPoint(this.targetPoint);
    const collectRadiusSq =
      GAME_CONFIG.pickup.collectRadius * GAME_CONFIG.pickup.collectRadius;
    const magnetRadius =
      GAME_CONFIG.pickup.magnetRadius + Math.max(0, magnetRadiusBonus);
    const magnetRadiusSq = magnetRadius * magnetRadius;

    for (const slot of this.slots) {
      if (!slot.active) {
        continue;
      }

      this.toTarget.subVectors(this.targetPoint, slot.mesh.position);
      const distanceSq = this.toTarget.lengthSq();

      if (distanceSq <= collectRadiusSq) {
        slot.active = false;
        slot.mesh.visible = false;
        this.onCollected(slot.value);
        continue;
      }

      if (distanceSq <= magnetRadiusSq) {
        const distance = Math.sqrt(distanceSq);
        this.toTarget.multiplyScalar(
          (GAME_CONFIG.pickup.magnetSpeed * deltaTime) / distance,
        );
        slot.mesh.position.add(this.toTarget);
        slot.mesh.rotation.y += deltaTime * 3.2;
        slot.mesh.scale.setScalar(1.15);
        continue;
      }

      slot.mesh.position.y =
        GAME_CONFIG.pickup.orbHeight +
        Math.sin(elapsedTime * 2.2 + slot.phase) *
          GAME_CONFIG.pickup.bobHeight;
      slot.mesh.rotation.y += deltaTime * 1.4;
      slot.mesh.rotation.x += deltaTime * 0.55;
      const pulse = 1 + Math.sin(elapsedTime * 3 + slot.phase) * 0.06;
      slot.mesh.scale.setScalar(pulse);
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.active = false;
      slot.mesh.visible = false;
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.root.clear();
    this.geometry.dispose();
    this.material.dispose();
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
    this.slots.length = 0;
  }

  private findAvailableSlot(): PickupSlot | null {
    for (const slot of this.slots) {
      if (!slot.active) {
        return slot;
      }
    }
    return null;
  }
}
