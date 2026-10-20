import * as THREE from 'three';
import { disposeObject3D } from '../../utils/dispose';
import type { EnemyProfile } from '../config';

const HULL_DARK_COLOR = 0x20191a;
const DECK_COLOR = 0x594337;
const SAIL_COLOR = 0x962f2b;
const METAL_COLOR = 0x252d30;
const RED_GLOW_COLOR = 0xff4b2f;

const HEALTH_BAR_WIDTH = 3.05;
const HEALTH_BAR_Y = 4.35;
const MUZZLE_LOCAL_POSITION = new THREE.Vector3(0, 0.8, -3.35);

export interface EnemyShipOptions {
  profile: EnemyProfile;
  x: number;
  z: number;
  heading: number;
  initialFireDelay: number;
  strafeDirection: 1 | -1;
  isElite?: boolean;
  isBoss?: boolean;
}

function createEnemyOutline(scale = 1): THREE.Shape {
  const outline = new THREE.Shape();

  outline.moveTo(-1.5 * scale, -3.7 * scale);
  outline.lineTo(-1.92 * scale, 0.2 * scale);
  outline.lineTo(-1.22 * scale, 2.55 * scale);
  outline.lineTo(0, 4.7 * scale);
  outline.lineTo(1.22 * scale, 2.55 * scale);
  outline.lineTo(1.92 * scale, 0.2 * scale);
  outline.lineTo(1.5 * scale, -3.7 * scale);
  outline.lineTo(0, -4.15 * scale);
  outline.closePath();

  return outline;
}

function createEnemyHullGeometry(): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(createEnemyOutline(), {
    depth: 0.78,
    steps: 1,
    curveSegments: 4,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.08,
    bevelSegments: 1,
  });

  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();

  const bounds = geometry.boundingBox;
  if (!bounds) {
    return geometry;
  }

  const height = bounds.max.y - bounds.min.y;
  geometry.scale(1, 1.0 / height, 1);
  geometry.computeBoundingBox();

  const scaledBounds = geometry.boundingBox;
  if (scaledBounds) {
    geometry.translate(0, -scaledBounds.min.y - 0.45, 0);
  }

  return geometry;
}

function createEnemyDeckGeometry(): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(createEnemyOutline(0.8), {
    depth: 0.08,
    steps: 1,
    curveSegments: 4,
    bevelEnabled: false,
  });

  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export class EnemyShip {
  readonly root = new THREE.Group();
  readonly profile: EnemyProfile;
  readonly maxHealth: number;
  readonly velocity = new THREE.Vector2();
  readonly strafeDirection: 1 | -1;
  readonly isElite: boolean;
  readonly isBoss: boolean;

  private readonly visual = new THREE.Group();
  private readonly hullMaterial: THREE.MeshStandardMaterial;
  private readonly healthGroup: THREE.Group;
  private readonly healthFill: THREE.Mesh;
  private readonly bobPhase: number;
  private readonly muzzleMarker = new THREE.Object3D();
  private readonly muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0xff6d42,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );

  private health: number;
  private fireCooldown: number;
  private targetable = true;
  private sinking = false;
  private finished = false;
  private sinkElapsed = 0;
  private hitFlashTime = 0;
  private muzzleFlashTime = 0;
  private disposed = false;

  constructor(options: EnemyShipOptions) {
    this.profile = options.profile;
    this.maxHealth = options.profile.maxHealth;
    this.health = this.maxHealth;
    this.fireCooldown = options.initialFireDelay;
    this.strafeDirection = options.strafeDirection;
    this.isElite = options.isElite === true;
    this.isBoss = options.isBoss === true;

    this.root.name = `EnemyShip-${options.profile.id}`;
    this.root.position.set(options.x, 0, options.z);
    this.root.rotation.y = options.heading;
    this.bobPhase = options.x * 0.37 + options.z * 0.21;

    this.hullMaterial = new THREE.MeshStandardMaterial({
      color: options.profile.hullColor,
      emissive: new THREE.Color(RED_GLOW_COLOR),
      emissiveIntensity: 0,
      metalness: 0.24,
      roughness: 0.58,
      flatShading: true,
    });

    this.visual.name = 'EnemyShipVisual';
    this.visual.scale.setScalar(options.profile.visualScale);
    this.root.add(this.visual);
    this.buildShip();
    this.buildTypeDetails();

    if (this.isElite || this.isBoss) {
      this.buildThreatDetails();
    }

    this.muzzleMarker.position.copy(MUZZLE_LOCAL_POSITION);
    this.muzzleFlash.position.copy(MUZZLE_LOCAL_POSITION);
    this.muzzleFlash.scale.set(1, 0.65, 1);
    this.muzzleFlash.visible = false;
    this.muzzleFlash.userData.noShadow = true;
    this.visual.add(this.muzzleMarker, this.muzzleFlash);

    this.visual.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = object.userData.noShadow !== true;
        object.receiveShadow = true;
      }
    });

    this.healthGroup = new THREE.Group();
    this.healthGroup.name = 'EnemyHealthBar';
    this.healthGroup.position.set(
      0,
      HEALTH_BAR_Y * options.profile.visualScale,
      0,
    );
    this.healthGroup.scale.setScalar(
      Math.max(0.9, options.profile.visualScale),
    );

    const healthBack = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.2),
      new THREE.MeshBasicMaterial({
        color: 0x071a23,
        transparent: true,
        opacity: 0.72,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    healthBack.renderOrder = 20;
    this.healthGroup.add(healthBack);

    this.healthFill = new THREE.Mesh(
      new THREE.PlaneGeometry(HEALTH_BAR_WIDTH, 0.09),
      new THREE.MeshBasicMaterial({
        color: 0xff7052,
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.healthFill.position.z = 0.01;
    this.healthFill.renderOrder = 21;

    if (this.isElite) {
      (
        this.healthFill.material as THREE.MeshBasicMaterial
      ).color.setHex(0xffcd6e);
    }

    this.healthGroup.add(this.healthFill);
    this.healthGroup.visible = !this.isBoss;
    this.root.add(this.healthGroup);
  }

  get isTargetable(): boolean {
    return this.targetable;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  get currentHealth(): number {
    return this.health;
  }

  get experienceValue(): number {
    return this.profile.experienceValue;
  }

  get isReadyToFire(): boolean {
    return this.fireCooldown <= 0;
  }

  tickFireCooldown(deltaTime: number): void {
    this.fireCooldown = Math.max(0, this.fireCooldown - deltaTime);
  }

  resetFireCooldown(): void {
    this.fireCooldown = this.profile.fireInterval;
  }

  getAimPoint(out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.root.position.x,
      this.root.position.y + this.profile.aimPointHeight,
      this.root.position.z,
    );
  }

  getMuzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.muzzleMarker.getWorldPosition(out);
  }

  triggerMuzzleFlash(): void {
    this.muzzleFlashTime = 0.075;
    this.muzzleFlash.visible = true;
  }

  takeDamage(rawDamage: number): boolean {
    if (!this.targetable || rawDamage <= 0) {
      return false;
    }

    const damage = Math.max(1, rawDamage - this.profile.armor);
    this.health = Math.max(0, this.health - damage);
    this.updateHealthFill();

    if (this.health <= 0) {
      this.targetable = false;
      this.sinking = true;
      this.sinkElapsed = 0;
      this.healthGroup.visible = false;
      this.hullMaterial.emissiveIntensity = 0;
      this.muzzleFlash.visible = false;
      return true;
    }

    this.hitFlashTime = 0.1;
    this.hullMaterial.emissiveIntensity = 0.9;
    return false;
  }

  update(
    deltaTime: number,
    elapsedTime: number,
    camera: THREE.Camera,
  ): void {
    if (this.disposed) {
      return;
    }

    if (this.sinking) {
      this.updateSinking(deltaTime);
      return;
    }

    if (!this.targetable) {
      return;
    }

    this.visual.position.y =
      Math.sin(elapsedTime * 0.95 + this.bobPhase) * 0.045;
    this.visual.rotation.z =
      Math.sin(elapsedTime * 0.61 + this.bobPhase) * 0.008;

    if (this.hitFlashTime > 0) {
      this.hitFlashTime = Math.max(0, this.hitFlashTime - deltaTime);
      if (this.hitFlashTime === 0) {
        this.hullMaterial.emissiveIntensity = 0;
      }
    }

    if (this.muzzleFlashTime > 0) {
      this.muzzleFlashTime = Math.max(0, this.muzzleFlashTime - deltaTime);
      if (this.muzzleFlashTime === 0) {
        this.muzzleFlash.visible = false;
      }
    }

    this.healthGroup.lookAt(camera.position);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    disposeObject3D(this.root);
    this.root.clear();
  }

  private updateSinking(deltaTime: number): void {
    this.sinkElapsed += deltaTime;
    const progress = Math.min(
      this.sinkElapsed / this.profile.sinkDuration,
      1,
    );
    const eased = progress * progress;

    this.root.position.y = -3.8 * eased;
    this.root.rotation.z = 0.38 * eased;
    this.visual.rotation.x = 0.16 * eased;

    if (progress >= 1) {
      this.finished = true;
    }
  }

  private updateHealthFill(): void {
    const ratio = Math.max(0, this.health / this.maxHealth);
    this.healthFill.scale.x = ratio;
    this.healthFill.position.x = -HEALTH_BAR_WIDTH * (1 - ratio) * 0.5;
  }

  private buildTypeDetails(): void {
    if (this.profile.id === 'destroyer') {
      this.buildDestroyerDetails();
    } else if (this.profile.id === 'torpedoBoat') {
      this.buildTorpedoBoatDetails();
    } else if (this.profile.id === 'interceptor') {
      this.buildInterceptorDetails();
    } else if (this.profile.id === 'missileBoat') {
      this.buildMissileBoatDetails();
    } else if (this.profile.id === 'cruiser') {
      this.buildCruiserDetails();
    } else if (this.profile.id === 'artilleryBarge') {
      this.buildArtilleryBargeDetails();
    }
  }

  private buildDestroyerDetails(): void {
    const armorMaterial = new THREE.MeshStandardMaterial({
      color: 0x242b2e,
      metalness: 0.66,
      roughness: 0.4,
      flatShading: true,
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x374347,
      metalness: 0.72,
      roughness: 0.32,
    });
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xb69558,
      metalness: 0.72,
      roughness: 0.3,
    });

    for (const side of [-1, 1]) {
      const sideArmor = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.32, 2.2),
        armorMaterial,
      );
      sideArmor.position.set(side * 1.65, 0.65, 0.25);
      sideArmor.castShadow = true;
      sideArmor.receiveShadow = true;
      this.visual.add(sideArmor);

      const extraBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.07, 1.55, 8),
        metalMaterial,
      );
      extraBarrel.rotation.x = Math.PI / 2;
      extraBarrel.position.set(side * 0.3, 0.8, -2.48);
      extraBarrel.castShadow = true;
      extraBarrel.receiveShadow = true;
      this.visual.add(extraBarrel);
    }

    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.35, 0.75),
      armorMaterial,
    );
    bridge.position.set(0, 1.4, 2.3);
    bridge.castShadow = true;
    bridge.receiveShadow = true;
    this.visual.add(bridge);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.04, 1.1, 6),
      metalMaterial,
    );
    mast.position.set(0, 2.0, 2.3);
    mast.castShadow = true;
    this.visual.add(mast);

    const band = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.06, 0.06),
      goldMaterial,
    );
    band.position.set(0, 1.2, 1.58);
    this.visual.add(band);
  }

  private buildTorpedoBoatDetails(): void {
    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b2926,
      metalness: 0.72,
      roughness: 0.34,
    });
    const bandMaterial = new THREE.MeshStandardMaterial({
      color: 0xb06a34,
      emissive: 0x5e240e,
      emissiveIntensity: 0.5,
      metalness: 0.45,
      roughness: 0.4,
    });

    for (const side of [-1, 1]) {
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.15, 1.15, 8),
        tubeMaterial,
      );
      tube.rotation.x = Math.PI / 2;
      tube.position.set(side * 1.05, 0.68, 0.35);
      tube.castShadow = true;
      tube.receiveShadow = true;
      this.visual.add(tube);

      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.155, 0.155, 0.08, 8),
        bandMaterial,
      );
      band.rotation.x = Math.PI / 2;
      band.position.set(side * 1.05, 0.68, 0.05);
      this.visual.add(band);
    }
  }

  private buildInterceptorDetails(): void {
    const ramMaterial = new THREE.MeshStandardMaterial({
      color: 0x9a6a34,
      metalness: 0.78,
      roughness: 0.3,
    });
    const finMaterial = new THREE.MeshStandardMaterial({
      color: 0x4c2a20,
      metalness: 0.5,
      roughness: 0.48,
      flatShading: true,
    });
    const engineMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8a4a,
      emissive: 0xff3a16,
      emissiveIntensity: 1.9,
      metalness: 0.3,
      roughness: 0.28,
    });

    const ram = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 1.0, 8),
      ramMaterial,
    );
    ram.rotation.x = -Math.PI / 2;
    ram.position.set(0, 0.55, -4.15);
    ram.castShadow = true;
    this.visual.add(ram);

    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.05, 0.55),
        finMaterial,
      );
      fin.position.set(side * 1.12, 0.5, 2.9);
      fin.rotation.z = side * 0.12;
      fin.castShadow = true;
      this.visual.add(fin);

      const engine = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.08, 0.06),
        engineMaterial,
      );
      engine.position.set(side * 0.45, 0.45, 3.72);
      engine.userData.noShadow = true;
      this.visual.add(engine);
    }
  }

  private buildMissileBoatDetails(): void {
    const podMaterial = new THREE.MeshStandardMaterial({
      color: 0x2e383c,
      metalness: 0.62,
      roughness: 0.4,
      flatShading: true,
    });
    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: 0x171f22,
      metalness: 0.6,
      roughness: 0.5,
    });
    const bandMaterial = new THREE.MeshStandardMaterial({
      color: 0xe08a3a,
      emissive: 0xa8410d,
      emissiveIntensity: 1.2,
      metalness: 0.4,
      roughness: 0.34,
    });

    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.32, 1.25),
        podMaterial,
      );
      pod.position.set(side * 0.78, 0.88, 0.15);
      pod.castShadow = true;
      pod.receiveShadow = true;
      this.visual.add(pod);

      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.07, 0.1),
        bandMaterial,
      );
      band.position.set(side * 0.78, 0.98, -0.42);
      this.visual.add(band);

      for (const offset of [-0.14, 0.14]) {
        const tube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10),
          tubeMaterial,
        );
        tube.rotation.x = Math.PI / 2;
        tube.position.set(side * 0.78 + offset, 0.9, -0.5);
        this.visual.add(tube);
      }
    }

    const radarMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.04, 0.95, 6),
      tubeMaterial,
    );
    radarMast.position.set(0, 1.65, 1.9);
    radarMast.castShadow = true;
    this.visual.add(radarMast);

    const radarBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.05, 0.05),
      bandMaterial,
    );
    radarBlade.position.set(0, 2.02, 1.9);
    this.visual.add(radarBlade);
  }

  private buildCruiserDetails(): void {
    const armorMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2528,
      metalness: 0.66,
      roughness: 0.4,
      flatShading: true,
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d4247,
      metalness: 0.74,
      roughness: 0.32,
    });
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xb69558,
      metalness: 0.74,
      roughness: 0.3,
    });

    for (const side of [-1, 1]) {
      const belt = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.42, 2.8),
        armorMaterial,
      );
      belt.position.set(side * 1.72, 0.58, 0.3);
      belt.castShadow = true;
      belt.receiveShadow = true;
      this.visual.add(belt);

      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.44, 0.07, 2.9),
        goldMaterial,
      );
      band.position.set(side * 1.72, 0.83, 0.3);
      band.castShadow = true;
      this.visual.add(band);

      const mount = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.38, 0.16, 8),
        metalMaterial,
      );
      mount.position.set(side * 0.88, 0.62, -0.55);
      mount.castShadow = true;
      this.visual.add(mount);

      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.08, 1.8, 8),
        metalMaterial,
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(side * 0.88, 0.78, -1.62);
      barrel.castShadow = true;
      this.visual.add(barrel);
    }

    for (const side of [-1, 1]) {
      const funnel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.18, 0.72, 8),
        metalMaterial,
      );
      funnel.position.set(side * 0.46, 1.15, 3.1);
      funnel.castShadow = true;
      this.visual.add(funnel);

      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.06, 8),
        goldMaterial,
      );
      ring.position.set(side * 0.46, 1.3, 3.1);
      this.visual.add(ring);
    }
  }

  private buildArtilleryBargeDetails(): void {
    const armorMaterial = new THREE.MeshStandardMaterial({
      color: 0x322e29,
      metalness: 0.62,
      roughness: 0.44,
      flatShading: true,
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a453c,
      metalness: 0.76,
      roughness: 0.3,
    });
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 0xffa05a,
      emissive: 0xc23f12,
      emissiveIntensity: 1.2,
      metalness: 0.3,
      roughness: 0.3,
    });

    const gunDeck = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.18, 3.1),
      armorMaterial,
    );
    gunDeck.position.set(0, 0.7, 0.55);
    gunDeck.castShadow = true;
    gunDeck.receiveShadow = true;
    this.visual.add(gunDeck);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.14, 3.1, 10),
      metalMaterial,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.8, -2);
    barrel.castShadow = true;
    this.visual.add(barrel);

    const barrelSleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.2, 0.8, 10),
      armorMaterial,
    );
    barrelSleeve.rotation.x = Math.PI / 2;
    barrelSleeve.position.set(0, 0.8, -0.6);
    barrelSleeve.castShadow = true;
    this.visual.add(barrelSleeve);

    const muzzleBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.12, 10),
      glowMaterial,
    );
    muzzleBand.rotation.x = Math.PI / 2;
    muzzleBand.position.set(0, 0.8, -3.42);
    this.visual.add(muzzleBand);

    for (const side of [-1, 1]) {
      const sideArmor = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.36, 2.2),
        armorMaterial,
      );
      sideArmor.position.set(side * 1.62, 0.6, 0.3);
      sideArmor.castShadow = true;
      this.visual.add(sideArmor);
    }

    const rangefinder = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.36, 0.55),
      armorMaterial,
    );
    rangefinder.position.set(0, 1.5, 1.9);
    rangefinder.castShadow = true;
    this.visual.add(rangefinder);

    const rangefinderGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.04),
      glowMaterial,
    );
    rangefinderGlow.position.set(0, 1.55, 1.61);
    this.visual.add(rangefinderGlow);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.045, 1.3, 6),
      metalMaterial,
    );
    mast.position.set(0, 2.1, 1.9);
    this.visual.add(mast);
  }

  private buildThreatDetails(): void {
    const auraColor = this.isBoss ? 0xff3d2d : 0xffc857;
    const auraRadius = this.isBoss ? 6.2 : 2.7;
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(auraRadius * 0.88, auraRadius, 48),
      new THREE.MeshBasicMaterial({
        color: auraColor,
        transparent: true,
        opacity: this.isBoss ? 0.34 : 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.8;
    aura.userData.noShadow = true;
    aura.renderOrder = 4;
    this.root.add(aura);

    const goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8b56c,
      metalness: 0.72,
      roughness: 0.3,
    });
    const armorMaterial = new THREE.MeshStandardMaterial({
      color: this.isBoss ? 0x241d1f : 0x3a3030,
      metalness: 0.62,
      roughness: 0.42,
      flatShading: true,
    });

    if (this.isElite) {
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.06, 3.0),
          goldMaterial,
        );
        plate.position.set(side * 1.55, 0.6, 0.2);
        plate.castShadow = true;
        plate.receiveShadow = true;
        this.visual.add(plate);
      }
      return;
    }

    for (const side of [-1, 1]) {
      const sideArmor = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.45, 2.4),
        armorMaterial,
      );
      sideArmor.position.set(side * 1.75, 0.72, 0.35);
      sideArmor.castShadow = true;
      sideArmor.receiveShadow = true;
      this.visual.add(sideArmor);

      const sideBand = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.08, 2.5),
        goldMaterial,
      );
      sideBand.position.set(side * 1.75, 0.97, 0.35);
      sideBand.castShadow = true;
      sideBand.receiveShadow = true;
      this.visual.add(sideBand);
    }

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 12, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff6a4a,
        emissive: 0xff2f18,
        emissiveIntensity: 2.2,
        metalness: 0.35,
        roughness: 0.24,
      }),
    );
    core.position.set(0, 1.55, 2.15);
    core.userData.noShadow = true;
    this.visual.add(core);

    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.2, 0.12, 10),
      goldMaterial,
    );
    crown.position.set(0, 1.25, 2.28);
    crown.castShadow = true;
    crown.receiveShadow = true;
    this.visual.add(crown);
  }

  private buildShip(): void {
    const hullLiningMaterial = new THREE.MeshStandardMaterial({
      color: HULL_DARK_COLOR,
      metalness: 0.32,
      roughness: 0.5,
    });
    const deckMaterial = new THREE.MeshStandardMaterial({
      color: DECK_COLOR,
      metalness: 0.04,
      roughness: 0.88,
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: METAL_COLOR,
      metalness: 0.72,
      roughness: 0.36,
    });
    const sailMaterial = new THREE.MeshStandardMaterial({
      color: SAIL_COLOR,
      side: THREE.DoubleSide,
      roughness: 0.75,
      metalness: 0.02,
    });
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 0x7c1f1d,
      emissive: RED_GLOW_COLOR,
      emissiveIntensity: 1.15,
      roughness: 0.4,
      metalness: 0.2,
    });

    const hull = new THREE.Mesh(createEnemyHullGeometry(), this.hullMaterial);
    hull.name = 'EnemyHull';
    this.visual.add(hull);

    const deck = new THREE.Mesh(createEnemyDeckGeometry(), deckMaterial);
    deck.position.y = 0.51;
    this.visual.add(deck);

    const rubRail = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.15, 6.2),
      hullLiningMaterial,
    );
    rubRail.position.set(0, 0.16, 0.35);
    rubRail.rotation.y = 0.01;
    this.visual.add(rubRail);

    const ram = new THREE.Mesh(
      new THREE.ConeGeometry(0.36, 1.25, 4),
      metalMaterial,
    );
    ram.rotation.x = -Math.PI / 2;
    ram.position.set(0, 0.08, -5.12);
    this.visual.add(ram);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.55, 1.3),
      metalMaterial,
    );
    cabin.position.set(0, 0.88, 2.28);
    this.visual.add(cabin);

    const cabinRoof = new THREE.Mesh(
      new THREE.BoxGeometry(1.68, 0.08, 1.44),
      hullLiningMaterial,
    );
    cabinRoof.position.set(0, 1.19, 2.28);
    this.visual.add(cabinRoof);

    const windowSlit = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.11, 0.035),
      glowMaterial,
    );
    windowSlit.position.set(0, 0.97, 1.61);
    this.visual.add(windowSlit);

    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.19, 0.62, 8),
      metalMaterial,
    );
    funnel.position.set(0, 1.02, 3.1);
    this.visual.add(funnel);

    const funnelBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.055, 8),
      glowMaterial,
    );
    funnelBand.position.set(0, 1.14, 3.1);
    this.visual.add(funnelBand);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.055, 2.65, 7),
      metalMaterial,
    );
    mast.position.set(0, 1.82, 0.45);
    this.visual.add(mast);

    const crossbeam = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.055, 0.055),
      metalMaterial,
    );
    crossbeam.position.set(0, 2.7, 0.45);
    this.visual.add(crossbeam);

    const sailShape = new THREE.Shape();
    sailShape.moveTo(-1.35, 0);
    sailShape.lineTo(1.12, 0);
    sailShape.lineTo(0.12, 1.95);
    sailShape.closePath();

    const sail = new THREE.Mesh(
      new THREE.ShapeGeometry(sailShape),
      sailMaterial,
    );
    sail.position.set(0, 1.35, 0.62);
    this.visual.add(sail);

    const sailCross = new THREE.Mesh(
      new THREE.BoxGeometry(1.24, 0.07, 0.04),
      glowMaterial,
    );
    sailCross.position.set(-0.08, 1.94, 0.66);
    this.visual.add(sailCross);

    const turretBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.59, 0.15, 10),
      hullLiningMaterial,
    );
    turretBase.position.set(0, 0.6, -1.55);
    this.visual.add(turretBase);

    const turret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.47, 0.32, 6),
      metalMaterial,
    );
    turret.position.set(0, 0.79, -1.55);
    this.visual.add(turret);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.075, 1.65, 8),
      metalMaterial,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.8, -2.48);
    this.visual.add(barrel);

    const bowGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.055, 0.035),
      glowMaterial,
    );
    bowGlow.position.set(0, 0.39, -4.34);
    this.visual.add(bowGlow);
  }
}
