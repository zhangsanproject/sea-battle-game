import * as THREE from 'three';
import { GAME_CONFIG } from '../config';
import { disposeObject3D } from '../../utils/dispose';
import type { EnemyShip } from '../entities/EnemyShip';
import type { PlayerShip } from '../entities/PlayerShip';
import type { EnemyManager } from './EnemyManager';

export interface BossSystemOptions {
  player: PlayerShip;
  enemies: EnemyManager;
  onPlayerHit: (damageTaken: number) => void;
  onWarningChanged: (active: boolean) => void;
  onDetonated?: (position: THREE.Vector3) => void;
}

export class BossSystem {
  readonly root = new THREE.Group();

  private readonly warningGroup = new THREE.Group();
  private readonly warningRingMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4532,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly warningFillMaterial = new THREE.MeshBasicMaterial({
    color: 0xd52d20,
    transparent: true,
    opacity: 0.09,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly warningCenter = new THREE.Vector3();
  private readonly player: PlayerShip;
  private readonly enemies: EnemyManager;
  private readonly onPlayerHit: (damageTaken: number) => void;
  private readonly onWarningChanged: (active: boolean) => void;
  private readonly onDetonated:
    | ((position: THREE.Vector3) => void)
    | null;

  private activeBoss: EnemyShip | null = null;
  private warningActive = false;
  private warningElapsed = 0;
  private specialCooldown: number =
    GAME_CONFIG.boss.specialInitialCooldown;
  private disposed = false;

  constructor(options: BossSystemOptions) {
    this.root.name = 'BossSystem';
    this.player = options.player;
    this.enemies = options.enemies;
    this.onPlayerHit = options.onPlayerHit;
    this.onWarningChanged = options.onWarningChanged;
    this.onDetonated = options.onDetonated ?? null;

    this.warningGroup.name = 'BossSpecialWarning';
    this.warningGroup.visible = false;
    this.warningGroup.rotation.x = -Math.PI / 2;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 48),
      this.warningRingMaterial,
    );
    ring.renderOrder = 6;
    this.warningGroup.add(ring);

    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 48),
      this.warningFillMaterial,
    );
    fill.renderOrder = 5;
    this.warningGroup.add(fill);

    this.root.add(this.warningGroup);
  }

  update(deltaTime: number): void {
    if (this.disposed) {
      return;
    }

    const boss = this.enemies.getBoss();

    if (!boss || this.player.isDestroyed) {
      this.activeBoss = null;
      this.cancelWarning();
      return;
    }

    if (boss !== this.activeBoss) {
      this.activeBoss = boss;
      this.specialCooldown = GAME_CONFIG.boss.specialInitialCooldown;
      this.cancelWarning();
    }

    if (this.warningActive) {
      this.warningElapsed += deltaTime;
      const progress = Math.min(
        this.warningElapsed / GAME_CONFIG.boss.telegraphSeconds,
        1,
      );

      this.warningGroup.scale.setScalar(
        GAME_CONFIG.boss.blastRadius * (0.9 + progress * 0.12),
      );
      this.warningRingMaterial.opacity = 0.42 + progress * 0.34;
      this.warningFillMaterial.opacity = 0.08 + progress * 0.14;

      if (progress >= 1) {
        this.detonate();
      }
      return;
    }

    this.specialCooldown -= deltaTime;
    if (this.specialCooldown > 0) {
      return;
    }

    const offsetX =
      this.player.root.position.x - boss.root.position.x;
    const offsetZ =
      this.player.root.position.z - boss.root.position.z;
    const distanceSq = offsetX * offsetX + offsetZ * offsetZ;
    const maxRange = boss.profile.attackRange + 4;

    if (distanceSq > maxRange * maxRange) {
      return;
    }

    this.startWarning();
  }

  cancelWarning(): void {
    if (!this.warningActive) {
      return;
    }

    this.warningActive = false;
    this.warningElapsed = 0;
    this.warningGroup.visible = false;
    this.onWarningChanged(false);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.cancelWarning();
    disposeObject3D(this.root);
    this.root.clear();
  }

  private startWarning(): void {
    this.warningActive = true;
    this.warningElapsed = 0;
    this.warningCenter.set(
      this.player.root.position.x,
      0.9,
      this.player.root.position.z,
    );
    this.warningGroup.position.copy(this.warningCenter);
    this.warningGroup.scale.setScalar(
      GAME_CONFIG.boss.blastRadius * 0.9,
    );
    this.warningRingMaterial.opacity = 0.42;
    this.warningFillMaterial.opacity = 0.08;
    this.warningGroup.visible = true;
    this.onWarningChanged(true);
  }

  private detonate(): void {
    this.onDetonated?.(this.warningCenter);

    const offsetX =
      this.player.root.position.x - this.warningCenter.x;
    const offsetZ =
      this.player.root.position.z - this.warningCenter.z;

    if (
      offsetX * offsetX + offsetZ * offsetZ <=
      GAME_CONFIG.boss.blastRadius * GAME_CONFIG.boss.blastRadius
    ) {
      const damageTaken = this.player.takeDamage(
        GAME_CONFIG.boss.specialDamage,
      );
      if (damageTaken > 0) {
        this.onPlayerHit(damageTaken);
      }
    }

    this.cancelWarning();
    this.specialCooldown = GAME_CONFIG.boss.specialIntervalSeconds;
  }
}
