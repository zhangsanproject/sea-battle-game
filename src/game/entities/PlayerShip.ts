import * as THREE from 'three';
import { disposeObject3D } from '../../utils/dispose';
import { GAME_CONFIG } from '../config';
import { normalizeAngle, rotateTowardsAngle } from '../systems/movementMath';

export interface PlayerStatus {
  health: number;
  maxHealth: number;
  level: number;
}

const HULL_COLOR = 0x17384f;
/**
 * Global hull scale. Kept in sync with the enemy `visualScale` values (both are
 * 20% smaller than the original art) so the ship-to-ship size ratio holds.
 */
const HULL_SCALE = 0.8;
const HULL_ACCENT_COLOR = 0x8b3b3c;
const DECK_COLOR = 0xc69b64;
const DECK_DARK_COLOR = 0x83603f;
const CABIN_COLOR = 0xd8d2c1;
const METAL_COLOR = 0x394951;
const DARK_METAL_COLOR = 0x1e2b31;
const GOLD_COLOR = 0xd5b060;

function createShipOutline(scale = 1): THREE.Shape {
  const outline = new THREE.Shape();

  outline.moveTo(-1.9 * scale, -4.8 * scale);
  outline.bezierCurveTo(
    -2.28 * scale,
    -3.4 * scale,
    -2.25 * scale,
    1.1 * scale,
    -1.6 * scale,
    2.9 * scale,
  );
  outline.quadraticCurveTo(
    -1.12 * scale,
    4.2 * scale,
    0,
    5.55 * scale,
  );
  outline.quadraticCurveTo(
    1.12 * scale,
    4.2 * scale,
    1.6 * scale,
    2.9 * scale,
  );
  outline.bezierCurveTo(
    2.25 * scale,
    1.1 * scale,
    2.28 * scale,
    -3.4 * scale,
    1.9 * scale,
    -4.8 * scale,
  );
  outline.quadraticCurveTo(
    0,
    -5.25 * scale,
    -1.9 * scale,
    -4.8 * scale,
  );

  return outline;
}

function createHullGeometry(): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(createShipOutline(), {
    depth: 1.05,
    steps: 1,
    curveSegments: 14,
    bevelEnabled: true,
    bevelThickness: 0.16,
    bevelSize: 0.13,
    bevelSegments: 2,
  });

  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();

  const bounds = geometry.boundingBox;
  if (!bounds) {
    return geometry;
  }

  const height = bounds.max.y - bounds.min.y;
  geometry.scale(1, 1.28 / height, 1);
  geometry.computeBoundingBox();

  const scaledBounds = geometry.boundingBox;
  if (scaledBounds) {
    geometry.translate(0, -scaledBounds.min.y - 0.55, 0);
  }

  return geometry;
}

function createExtrudedDetail(
  scale: number,
  depth: number,
): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(createShipOutline(scale), {
    depth,
    steps: 1,
    curveSegments: 14,
    bevelEnabled: false,
  });

  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export class PlayerShip {
  readonly root = new THREE.Group();
  readonly status: PlayerStatus = {
    health: GAME_CONFIG.player.maxHealth,
    maxHealth: GAME_CONFIG.player.maxHealth,
    level: 1,
  };
  armor = GAME_CONFIG.player.armor;

  private readonly visual = new THREE.Group();
  private readonly gun = new THREE.Group();
  private readonly muzzleMarkers: THREE.Object3D[] = [];
  private readonly secondaryGroup = new THREE.Group();
  private readonly secondaryTurrets: Array<{
    pivot: THREE.Group;
    muzzle: THREE.Object3D;
  }> = [];
  private readonly torpedoGroup = new THREE.Group();
  private readonly torpedoMuzzles: THREE.Object3D[] = [];
  private readonly missileGroup = new THREE.Group();
  private readonly missileMuzzles: THREE.Object3D[] = [];
  private secondaryWeaponsBuilt = false;
  private torpedoWeaponsBuilt = false;
  private missileWeaponsBuilt = false;
  private readonly muzzleFlashes: THREE.Mesh[] = [];
  private readonly muzzleFlashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffcf7a,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private muzzleFlashTime = 0;
  private recoilTime = 0;
  private readonly gunRestZ = -1.92;
  private evolutionTier = 1;
  private disposed = false;

  constructor() {
    this.root.name = 'PlayerShip';
    this.visual.name = 'PlayerShipVisual';
    // Portrait phones only show about 13 units either side, so the hull is
    // scaled down to leave room for more boats on screen. Turrets, muzzles and
    // evolution parts are all children of `visual`, so they follow for free.
    this.visual.scale.setScalar(HULL_SCALE);
    this.root.add(this.visual);

    this.buildHull();
    this.buildDeckDetails();
    this.buildCabin();
    this.buildMainGun();
    this.buildMast();

    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = object.userData.noShadow !== true;
        object.receiveShadow = true;
      }
    });
  }

  updateVisual(elapsedTime: number, deltaTime: number): void {
    this.visual.position.y = Math.sin(elapsedTime * 1.08) * 0.055;
    this.visual.rotation.z = Math.sin(elapsedTime * 0.76 + 0.4) * 0.012;
    this.visual.rotation.x = Math.sin(elapsedTime * 0.92 + 1.2) * 0.007;

    if (this.muzzleFlashTime > 0) {
      this.muzzleFlashTime = Math.max(0, this.muzzleFlashTime - deltaTime);
      const visible = this.muzzleFlashTime > 0;
      for (const flash of this.muzzleFlashes) {
        flash.visible = visible;
      }
    }

    if (this.recoilTime > 0) {
      this.recoilTime = Math.max(0, this.recoilTime - deltaTime);
      // The whole turret slides back into its mount, then eases forward again.
      const recoil = this.recoilTime / 0.12;
      this.gun.position.z = this.gunRestZ + recoil * recoil * 0.3;
    }
  }

  /**
   * Aims the independent main turret at a world-space point.
   * Returns true when the barrel is close enough to fire.
   */
  aimTurretAt(worldTarget: THREE.Vector3, deltaTime: number): boolean {
    const deltaX = worldTarget.x - this.root.position.x;
    const deltaZ = worldTarget.z - this.root.position.z;

    if (deltaX * deltaX + deltaZ * deltaZ < 0.0001) {
      return true;
    }

    const desiredWorldYaw = Math.atan2(-deltaX, -deltaZ);
    const desiredLocalYaw = normalizeAngle(
      desiredWorldYaw - this.root.rotation.y,
    );

    this.gun.rotation.y = rotateTowardsAngle(
      this.gun.rotation.y,
      desiredLocalYaw,
      GAME_CONFIG.turret.turnSpeed * deltaTime,
    );

    return (
      Math.abs(normalizeAngle(desiredLocalYaw - this.gun.rotation.y)) <=
      GAME_CONFIG.turret.aimTolerance
    );
  }

  relaxTurret(deltaTime: number): void {
    this.gun.rotation.y = rotateTowardsAngle(
      this.gun.rotation.y,
      0,
      GAME_CONFIG.turret.turnSpeed * deltaTime,
    );
  }

  getMuzzleWorldPositions(out: THREE.Vector3[]): number {
    this.root.updateMatrixWorld(true);

    let count = 0;
    for (const marker of this.muzzleMarkers) {
      const target = out[count];
      if (!target) {
        break;
      }
      marker.getWorldPosition(target);
      count += 1;
    }

    return count;
  }

  triggerMuzzleFlash(): void {
    this.muzzleFlashTime = 0.075;
    this.recoilTime = 0.12;
    for (const flash of this.muzzleFlashes) {
      flash.visible = true;
    }
  }

  getAimPoint(out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.root.position.x,
      this.root.position.y + GAME_CONFIG.player.aimPointHeight,
      this.root.position.z,
    );
  }

  setSecondaryWeaponLevel(level: number): void {
    if (level > 0 && !this.secondaryWeaponsBuilt) {
      this.buildSecondaryWeaponTurrets();
      this.secondaryWeaponsBuilt = true;
    }

    this.secondaryGroup.visible = level > 0;
  }

  aimSecondaryWeaponsAt(
    worldTarget: THREE.Vector3,
    deltaTime: number,
  ): boolean {
    if (this.secondaryTurrets.length === 0) {
      return false;
    }

    const deltaX = worldTarget.x - this.root.position.x;
    const deltaZ = worldTarget.z - this.root.position.z;
    const desiredWorldYaw = Math.atan2(-deltaX, -deltaZ);
    const desiredLocalYaw = normalizeAngle(
      desiredWorldYaw - this.root.rotation.y,
    );
    let aligned = true;

    for (const turret of this.secondaryTurrets) {
      turret.pivot.rotation.y = rotateTowardsAngle(
        turret.pivot.rotation.y,
        desiredLocalYaw,
        GAME_CONFIG.playerWeapons.secondary.turretTurnSpeed *
          deltaTime,
      );

      if (
        Math.abs(
          normalizeAngle(desiredLocalYaw - turret.pivot.rotation.y),
        ) > GAME_CONFIG.playerWeapons.secondary.aimTolerance
      ) {
        aligned = false;
      }
    }

    return aligned;
  }

  getSecondaryMuzzleWorldPositions(out: THREE.Vector3[]): number {
    this.root.updateMatrixWorld(true);

    let count = 0;
    for (const turret of this.secondaryTurrets) {
      const target = out[count];
      if (!target) {
        break;
      }
      turret.muzzle.getWorldPosition(target);
      count += 1;
    }

    return count;
  }

  setTorpedoWeaponLevel(level: number): void {
    if (level > 0 && !this.torpedoWeaponsBuilt) {
      this.buildTorpedoLaunchers();
      this.torpedoWeaponsBuilt = true;
    }

    this.torpedoGroup.visible = level > 0;
  }

  getTorpedoMuzzleWorldPositions(out: THREE.Vector3[]): number {
    this.root.updateMatrixWorld(true);

    let count = 0;
    for (const muzzle of this.torpedoMuzzles) {
      const target = out[count];
      if (!target) {
        break;
      }
      muzzle.getWorldPosition(target);
      count += 1;
    }

    return count;
  }

  setMissileWeaponLevel(level: number): void {
    if (level > 0 && !this.missileWeaponsBuilt) {
      this.buildMissileLaunchers();
      this.missileWeaponsBuilt = true;
    }

    this.missileGroup.visible = level > 0;
  }

  getMissileMuzzleWorldPositions(out: THREE.Vector3[]): number {
    this.root.updateMatrixWorld(true);

    let count = 0;
    for (const muzzle of this.missileMuzzles) {
      const target = out[count];
      if (!target) {
        break;
      }
      muzzle.getWorldPosition(target);
      count += 1;
    }

    return count;
  }

  heal(amount: number): number {
    if (amount <= 0 || this.status.health <= 0) {
      return 0;
    }

    const previousHealth = this.status.health;
    this.status.health = Math.min(
      this.status.maxHealth,
      this.status.health + amount,
    );
    return this.status.health - previousHealth;
  }

  get evolutionStage(): number {
    return this.evolutionTier;
  }

  /**
   * Adds programmatically generated weapon and armor geometry when the run
   * reaches configured level thresholds. Returns true when the ship changed.
   */
  applyEvolution(level: number): boolean {
    if (this.disposed) {
      return false;
    }

    let targetTier = 1;
    for (const threshold of GAME_CONFIG.evolution.levels) {
      if (level >= threshold) {
        targetTier += 1;
      }
    }

    let evolved = false;

    while (this.evolutionTier < targetTier) {
      this.evolutionTier += 1;
      this.buildEvolutionStage(this.evolutionTier);
      evolved = true;
    }

    return evolved;
  }

  get isDestroyed(): boolean {
    return this.status.health <= 0;
  }

  /** Returns the actual damage applied after armor. */
  takeDamage(rawDamage: number): number {
    if (rawDamage <= 0 || this.status.health <= 0) {
      return 0;
    }

    const damage = Math.max(1, Math.round(rawDamage - this.armor));
    const appliedDamage = Math.min(this.status.health, damage);
    this.status.health -= appliedDamage;
    return appliedDamage;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    disposeObject3D(this.root);
    this.root.clear();
    this.muzzleMarkers.length = 0;
    this.muzzleFlashes.length = 0;
    this.secondaryTurrets.length = 0;
    this.torpedoMuzzles.length = 0;
    this.missileMuzzles.length = 0;
  }

  private buildHull(): void {
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: HULL_COLOR,
      metalness: 0.24,
      roughness: 0.52,
      flatShading: true,
    });
    const stripeMaterial = new THREE.MeshStandardMaterial({
      color: HULL_ACCENT_COLOR,
      metalness: 0.15,
      roughness: 0.62,
    });
    const deckMaterial = new THREE.MeshStandardMaterial({
      color: DECK_COLOR,
      metalness: 0.02,
      roughness: 0.83,
    });

    const hull = new THREE.Mesh(createHullGeometry(), hullMaterial);
    hull.name = 'Hull';
    this.visual.add(hull);

    const stripe = new THREE.Mesh(
      createExtrudedDetail(1.028, 0.13),
      stripeMaterial,
    );
    stripe.name = 'HullAccent';
    stripe.position.y = 0.11;
    this.visual.add(stripe);

    const deck = new THREE.Mesh(
      createExtrudedDetail(0.84, 0.1),
      deckMaterial,
    );
    deck.name = 'Deck';
    deck.position.y = 0.7;
    this.visual.add(deck);

    const deckOutlinePoints = createShipOutline(0.84)
      .getPoints(96)
      .map((point) => new THREE.Vector3(point.x, 0.825, -point.y));
    const deckOutlineGeometry = new THREE.BufferGeometry().setFromPoints(
      deckOutlinePoints,
    );
    const deckOutline = new THREE.LineLoop(
      deckOutlineGeometry,
      new THREE.LineBasicMaterial({
        color: GOLD_COLOR,
        transparent: true,
        opacity: 0.42,
      }),
    );
    deckOutline.name = 'DeckTrim';
    this.visual.add(deckOutline);

    const centrePlank = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.018, 4.5),
      new THREE.MeshStandardMaterial({
        color: DECK_DARK_COLOR,
        roughness: 0.9,
      }),
    );
    centrePlank.position.set(0, 0.81, -0.5);
    this.visual.add(centrePlank);
  }

  private buildDeckDetails(): void {
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: METAL_COLOR,
      metalness: 0.72,
      roughness: 0.36,
    });

    const hatch = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.04, 0.92),
      new THREE.MeshStandardMaterial({
        color: 0x5a4834,
        metalness: 0.08,
        roughness: 0.75,
      }),
    );
    hatch.position.set(-0.72, 0.85, 0.55);
    this.visual.add(hatch);

    const hatchRim = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 0.045, 1.02),
      metalMaterial,
    );
    hatchRim.position.set(-0.72, 0.835, 0.55);
    this.visual.add(hatchRim);

    const bollardGeometry = new THREE.CylinderGeometry(0.075, 0.09, 0.24, 8);
    for (const [x, z] of [
      [-1.15, 3.55],
      [1.15, 3.55],
      [-1.2, -1.6],
      [1.2, -1.6],
    ] as const) {
      const bollard = new THREE.Mesh(bollardGeometry, metalMaterial);
      bollard.position.set(x, 0.92, z);
      this.visual.add(bollard);
    }

    const railMaterial = new THREE.MeshStandardMaterial({
      color: GOLD_COLOR,
      metalness: 0.68,
      roughness: 0.34,
    });
    const postGeometry = new THREE.CylinderGeometry(0.026, 0.032, 0.2, 6);
    const railGeometry = new THREE.BoxGeometry(0.04, 0.04, 4.25);

    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeometry, railMaterial);
      rail.position.set(side * 1.7, 1.0, 1.2);
      this.visual.add(rail);

      for (const z of [-0.8, 0.2, 1.2, 2.2, 3.2]) {
        const post = new THREE.Mesh(postGeometry, metalMaterial);
        post.position.set(side * 1.7, 0.905, z);
        this.visual.add(post);
      }
    }

    const plankSeamGeometry = new THREE.BoxGeometry(0.012, 0.01, 3.9);
    const plankSeamMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b6946,
      roughness: 0.95,
    });
    for (const x of [-1.05, -0.52, 0.52, 1.05]) {
      const seam = new THREE.Mesh(plankSeamGeometry, plankSeamMaterial);
      seam.position.set(x, 0.806, 0.25);
      this.visual.add(seam);
    }
  }

  private buildCabin(): void {
    const cabinMaterial = new THREE.MeshStandardMaterial({
      color: CABIN_COLOR,
      metalness: 0.04,
      roughness: 0.62,
      flatShading: true,
    });
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x263a43,
      metalness: 0.28,
      roughness: 0.54,
      flatShading: true,
    });
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x17333c,
      emissive: 0xffc66e,
      emissiveIntensity: 0.48,
      metalness: 0.38,
      roughness: 0.24,
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: METAL_COLOR,
      metalness: 0.72,
      roughness: 0.36,
    });
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: GOLD_COLOR,
      metalness: 0.72,
      roughness: 0.3,
    });

    const cabinBase = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.8, 1.65),
      cabinMaterial,
    );
    cabinBase.position.set(0, 1.22, 2.42);
    this.visual.add(cabinBase);

    const cabinRoof = new THREE.Mesh(
      new THREE.BoxGeometry(2.14, 0.11, 1.79),
      roofMaterial,
    );
    cabinRoof.position.set(0, 1.67, 2.42);
    this.visual.add(cabinRoof);

    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.42, 0.92),
      cabinMaterial,
    );
    bridge.position.set(0, 1.91, 2.42);
    this.visual.add(bridge);

    const bridgeRoof = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.09, 1.04),
      roofMaterial,
    );
    bridgeRoof.position.set(0, 2.16, 2.42);
    this.visual.add(bridgeRoof);

    for (const x of [-0.56, 0, 0.56]) {
      const window = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.22, 0.045),
        windowMaterial,
      );
      window.position.set(x, 1.27, 1.575);
      this.visual.add(window);
    }

    for (const x of [-0.31, 0.31]) {
      const window = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.15, 0.035),
        windowMaterial,
      );
      window.position.set(x, 1.92, 1.94);
      this.visual.add(window);
    }

    for (const side of [-1, 1]) {
      for (const z of [2.16, 2.66]) {
        const window = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.2, 0.3),
          windowMaterial,
        );
        window.position.set(side * 1.012, 1.27, z);
        this.visual.add(window);
      }
    }

    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.68, 12),
      metalMaterial,
    );
    funnel.position.set(0, 1.15, 3.52);
    this.visual.add(funnel);

    const funnelBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.205, 0.205, 0.075, 12),
      goldMaterial,
    );
    funnelBand.position.set(0, 1.37, 3.52);
    this.visual.add(funnelBand);

    const navigationLightGeometry = new THREE.SphereGeometry(0.055, 8, 6);
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(
        navigationLightGeometry,
        new THREE.MeshStandardMaterial({
          color: side < 0 ? 0xff5b4d : 0x5cf1a1,
          emissive: side < 0 ? 0xff3b2f : 0x35e38b,
          emissiveIntensity: 1.1,
          roughness: 0.4,
        }),
      );
      light.position.set(side * 0.69, 2.0, 1.92);
      this.visual.add(light);
    }
  }

  private buildMainGun(): void {
    const turretMaterial = new THREE.MeshStandardMaterial({
      color: 0x65757b,
      metalness: 0.55,
      roughness: 0.38,
      flatShading: true,
    });
    const darkMetalMaterial = new THREE.MeshStandardMaterial({
      color: DARK_METAL_COLOR,
      metalness: 0.72,
      roughness: 0.32,
    });
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: GOLD_COLOR,
      metalness: 0.74,
      roughness: 0.28,
    });

    this.gun.name = 'MainGun';
    this.gun.position.set(0, 0.82, -1.92);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.8, 0.2, 20),
      darkMetalMaterial,
    );
    base.position.y = 0.1;
    this.gun.add(base);

    const baseTrim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.75, 0.045, 20),
      goldMaterial,
    );
    baseTrim.position.y = 0.195;
    this.gun.add(baseTrim);

    const turret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.73, 0.46, 8),
      turretMaterial,
    );
    turret.rotation.y = Math.PI / 8;
    turret.scale.z = 1.35;
    turret.position.y = 0.45;
    this.gun.add(turret);

    const turretRoof = new THREE.Mesh(
      new THREE.CylinderGeometry(0.49, 0.55, 0.08, 8),
      turretMaterial,
    );
    turretRoof.rotation.y = Math.PI / 8;
    turretRoof.scale.z = 1.25;
    turretRoof.position.y = 0.72;
    this.gun.add(turretRoof);

    const mantlet = new THREE.Mesh(
      new THREE.BoxGeometry(1.14, 0.3, 0.32),
      darkMetalMaterial,
    );
    mantlet.position.set(0, 0.46, -0.72);
    this.gun.add(mantlet);

    const barrelGeometry = new THREE.CylinderGeometry(0.072, 0.082, 2.15, 12);
    const sleeveGeometry = new THREE.CylinderGeometry(0.1, 0.115, 0.34, 12);
    const muzzleGeometry = new THREE.CylinderGeometry(0.092, 0.102, 0.27, 12);
    const muzzleBandGeometry = new THREE.CylinderGeometry(
      0.105,
      0.105,
      0.055,
      12,
    );
    const muzzleFlashGeometry = new THREE.SphereGeometry(0.19, 8, 6);

    for (const x of [-0.22, 0.22]) {
      const barrel = new THREE.Mesh(barrelGeometry, darkMetalMaterial);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(x, 0.47, -1.68);
      this.gun.add(barrel);

      const sleeve = new THREE.Mesh(sleeveGeometry, turretMaterial);
      sleeve.rotation.x = Math.PI / 2;
      sleeve.position.set(x, 0.47, -0.93);
      this.gun.add(sleeve);

      const muzzle = new THREE.Mesh(muzzleGeometry, darkMetalMaterial);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(x, 0.47, -2.62);
      this.gun.add(muzzle);

      const muzzleBand = new THREE.Mesh(muzzleBandGeometry, goldMaterial);
      muzzleBand.rotation.x = Math.PI / 2;
      muzzleBand.position.set(x, 0.47, -2.5);
      this.gun.add(muzzleBand);

      const muzzleMarker = new THREE.Object3D();
      muzzleMarker.position.set(x, 0.47, -2.78);
      this.gun.add(muzzleMarker);
      this.muzzleMarkers.push(muzzleMarker);

      const muzzleFlash = new THREE.Mesh(
        muzzleFlashGeometry,
        this.muzzleFlashMaterial,
      );
      muzzleFlash.position.copy(muzzleMarker.position);
      muzzleFlash.scale.set(1, 0.62, 1);
      muzzleFlash.visible = false;
      muzzleFlash.userData.noShadow = true;
      this.gun.add(muzzleFlash);
      this.muzzleFlashes.push(muzzleFlash);
    }

    this.visual.add(this.gun);
  }

  private buildEvolutionStage(stage: number): void {
    if (stage === 2) {
      this.addExtraMainBarrel(-0.56);
      this.addExtraMainBarrel(0.56);
      return;
    }

    if (stage === 3) {
      this.addBowArmor(false);
      return;
    }

    if (stage === 4) {
      this.addExtraMainBarrel(0);
      this.addBowArmor(true);
      this.addSternGlow();
      return;
    }

    if (stage === 5) {
      this.addRadarArray();
      return;
    }

    if (stage === 6) {
      this.addBeltArmor();
      return;
    }

    if (stage === 7) {
      this.addBowRam();
      return;
    }

    if (stage === 8) {
      this.addAuxiliaryStacks();
      return;
    }

    if (stage === 9) {
      this.addEnergyTrim();
      return;
    }

    if (stage === 10) {
      this.addCommandCrown();
    }
  }

  private addExtraMainBarrel(x: number): void {
    const darkMetalMaterial = new THREE.MeshStandardMaterial({
      color: DARK_METAL_COLOR,
      metalness: 0.72,
      roughness: 0.32,
    });
    const turretMaterial = new THREE.MeshStandardMaterial({
      color: 0x65757b,
      metalness: 0.55,
      roughness: 0.38,
      flatShading: true,
    });
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: GOLD_COLOR,
      metalness: 0.74,
      roughness: 0.28,
    });

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.082, 2.15, 12),
      darkMetalMaterial,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(x, 0.47, -1.68);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    this.gun.add(barrel);

    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.115, 0.34, 12),
      turretMaterial,
    );
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.set(x, 0.47, -0.93);
    sleeve.castShadow = true;
    sleeve.receiveShadow = true;
    this.gun.add(sleeve);

    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.092, 0.102, 0.27, 12),
      darkMetalMaterial,
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(x, 0.47, -2.62);
    muzzle.castShadow = true;
    muzzle.receiveShadow = true;
    this.gun.add(muzzle);

    const muzzleBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.055, 12),
      goldMaterial,
    );
    muzzleBand.rotation.x = Math.PI / 2;
    muzzleBand.position.set(x, 0.47, -2.5);
    muzzleBand.castShadow = true;
    muzzleBand.receiveShadow = true;
    this.gun.add(muzzleBand);

    const marker = new THREE.Object3D();
    marker.position.set(x, 0.47, -2.78);
    this.gun.add(marker);
    this.muzzleMarkers.push(marker);

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 8, 6),
      this.muzzleFlashMaterial,
    );
    flash.position.copy(marker.position);
    flash.scale.set(1, 0.62, 1);
    flash.visible = false;
    flash.userData.noShadow = true;
    this.gun.add(flash);
    this.muzzleFlashes.push(flash);
  }

  private buildSecondaryWeaponTurrets(): void {
    this.secondaryGroup.name = 'SecondaryWeaponTurrets';
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: DARK_METAL_COLOR,
      metalness: 0.72,
      roughness: 0.34,
    });
    const turretMaterial = new THREE.MeshStandardMaterial({
      color: 0x65757b,
      metalness: 0.55,
      roughness: 0.4,
      flatShading: true,
    });
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: GOLD_COLOR,
      metalness: 0.72,
      roughness: 0.3,
    });

    for (const side of [-1, 1]) {
      const mount = new THREE.Group();
      mount.position.set(side * 1.28, 0.84, 0.15);

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.4, 0.14, 10),
        metalMaterial,
      );
      base.position.y = 0.06;
      mount.add(base);

      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.34, 0.035, 10),
        goldMaterial,
      );
      ring.position.y = 0.14;
      mount.add(ring);

      const pivot = new THREE.Group();
      pivot.position.y = 0.25;

      const turret = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.31, 0.2, 6),
        turretMaterial,
      );
      pivot.add(turret);

      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.055, 0.95, 8),
        metalMaterial,
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, -0.5);
      pivot.add(barrel);

      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0.02, -0.99);
      pivot.add(muzzle);

      mount.add(pivot);
      this.secondaryGroup.add(mount);
      this.secondaryTurrets.push({ pivot, muzzle });
    }

    this.secondaryGroup.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.visual.add(this.secondaryGroup);
  }

  private buildTorpedoLaunchers(): void {
    this.torpedoGroup.name = 'TorpedoLaunchers';
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x26343a,
      metalness: 0.72,
      roughness: 0.34,
    });
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: GOLD_COLOR,
      metalness: 0.7,
      roughness: 0.3,
    });

    for (const side of [-1, 1]) {
      const launcher = new THREE.Group();
      launcher.position.set(side * 1.18, 0.86, 0.82);

      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.17, 1.1, 10),
        metalMaterial,
      );
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, 0, -0.3);
      launcher.add(tube);

      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.07, 10),
        goldMaterial,
      );
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 0, -0.62);
      launcher.add(band);

      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0, -0.88);
      launcher.add(muzzle);

      this.torpedoGroup.add(launcher);
      this.torpedoMuzzles.push(muzzle);
    }

    this.torpedoGroup.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.visual.add(this.torpedoGroup);
  }

  private buildMissileLaunchers(): void {
    this.missileGroup.name = 'MissileLaunchers';
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x334952,
      metalness: 0.62,
      roughness: 0.4,
      flatShading: true,
    });
    const cellMaterial = new THREE.MeshStandardMaterial({
      color: 0x111b1f,
      metalness: 0.55,
      roughness: 0.58,
      flatShading: true,
    });
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: GOLD_COLOR,
      metalness: 0.72,
      roughness: 0.3,
    });

    for (const side of [-1, 1]) {
      const pod = new THREE.Group();
      pod.position.set(side * 0.88, 1.72, 2.42);

      const mount = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.1, 0.98),
        goldMaterial,
      );
      mount.position.y = 0.05;
      pod.add(mount);

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.3, 0.92),
        bodyMaterial,
      );
      body.position.y = 0.24;
      pod.add(body);

      for (const cellZ of [-0.23, 0.23]) {
        const hatch = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.035, 0.3),
          cellMaterial,
        );
        hatch.position.set(0, 0.405, cellZ);
        pod.add(hatch);

        const muzzle = new THREE.Object3D();
        muzzle.position.set(0, 0.47, cellZ);
        pod.add(muzzle);
        this.missileMuzzles.push(muzzle);
      }

      this.missileGroup.add(pod);
    }

    this.missileGroup.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.visual.add(this.missileGroup);
  }

  private addBowArmor(heavy: boolean): void {
    const armorMaterial = new THREE.MeshStandardMaterial({
      color: heavy ? 0x3a4f58 : 0x2c424d,
      metalness: 0.66,
      roughness: 0.38,
      flatShading: true,
    });
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: GOLD_COLOR,
      metalness: 0.76,
      roughness: 0.28,
    });

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(heavy ? 1.3 : 0.95, 0.07, heavy ? 1.6 : 1.1),
      armorMaterial,
    );
    plate.position.set(0, heavy ? 0.9 : 0.865, -3.35);
    plate.castShadow = true;
    plate.receiveShadow = true;
    this.visual.add(plate);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(heavy ? 1.4 : 1.05, 0.035, 0.08),
      goldMaterial,
    );
    trim.position.set(0, heavy ? 0.945 : 0.91, heavy ? -4.12 : -3.88);
    trim.castShadow = true;
    trim.receiveShadow = true;
    this.visual.add(trim);
  }

  private addSternGlow(): void {
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 0x8fe8df,
      emissive: 0x36d9cd,
      emissiveIntensity: 1.6,
      metalness: 0.3,
      roughness: 0.28,
    });

    for (const x of [-0.52, 0.52]) {
      const engine = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.12, 0.07),
        glowMaterial,
      );
      engine.position.set(x, 0.53, 4.55);
      engine.castShadow = false;
      engine.receiveShadow = false;
      this.visual.add(engine);
    }
  }

  private addRadarArray(): void {
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f434d,
      metalness: 0.7,
      roughness: 0.34,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x8fefff,
      toneMapped: false,
    });

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.055, 1.25, 8),
      metalMaterial,
    );
    mast.position.set(0, 2.35, 3.02);
    mast.castShadow = true;
    this.visual.add(mast);

    const crossbar = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.045, 0.045),
      metalMaterial,
    );
    crossbar.position.set(0, 2.72, 3.02);
    crossbar.castShadow = true;
    this.visual.add(crossbar);

    const dish = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.05, 18),
      metalMaterial,
    );
    dish.rotation.x = Math.PI / 2;
    dish.position.set(0, 2.88, 2.9);
    dish.castShadow = true;
    this.visual.add(dish);

    const emitter = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 8),
      glowMaterial,
    );
    emitter.position.set(0, 3.02, 3.02);
    emitter.userData.noShadow = true;
    this.visual.add(emitter);
  }

  private addBeltArmor(): void {
    const armorMaterial = new THREE.MeshStandardMaterial({
      color: 0x2c4652,
      metalness: 0.68,
      roughness: 0.36,
      flatShading: true,
    });
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: GOLD_COLOR,
      metalness: 0.76,
      roughness: 0.28,
    });

    for (const side of [-1, 1]) {
      const belt = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.32, 2.6),
        armorMaterial,
      );
      belt.position.set(side * 2.12, 0.66, 0.2);
      belt.castShadow = true;
      belt.receiveShadow = true;
      this.visual.add(belt);

      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 2.4),
        goldMaterial,
      );
      trim.position.set(side * 2.2, 0.84, 0.2);
      trim.castShadow = true;
      this.visual.add(trim);
    }
  }

  private addBowRam(): void {
    const ramMaterial = new THREE.MeshStandardMaterial({
      color: 0xa8874a,
      metalness: 0.82,
      roughness: 0.26,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd889,
      toneMapped: false,
    });

    const ram = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 1.25, 8),
      ramMaterial,
    );
    ram.rotation.x = -Math.PI / 2;
    ram.position.set(0, 0.6, -5.3);
    ram.castShadow = true;
    this.visual.add(ram);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.1, 8),
      ramMaterial,
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.6, -4.72);
    collar.castShadow = true;
    this.visual.add(collar);

    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.12, 0.55),
        ramMaterial,
      );
      fin.position.set(side * 0.32, 0.6, -4.9);
      fin.rotation.y = side * 0.2;
      fin.castShadow = true;
      this.visual.add(fin);
    }

    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      glowMaterial,
    );
    tip.position.set(0, 0.6, -5.9);
    tip.userData.noShadow = true;
    this.visual.add(tip);
  }

  private addAuxiliaryStacks(): void {
    const stackMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a3438,
      metalness: 0.7,
      roughness: 0.36,
    });
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: GOLD_COLOR,
      metalness: 0.74,
      roughness: 0.3,
    });

    const sternPlate = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.05, 0.9),
      new THREE.MeshStandardMaterial({
        color: 0x4a3d2e,
        metalness: 0.3,
        roughness: 0.62,
      }),
    );
    sternPlate.position.set(0, 0.79, 4.1);
    sternPlate.receiveShadow = true;
    this.visual.add(sternPlate);

    for (const side of [-1, 1]) {
      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.17, 0.95, 10),
        stackMaterial,
      );
      stack.position.set(side * 1.18, 1.1, 3.92);
      stack.castShadow = true;
      stack.receiveShadow = true;
      this.visual.add(stack);

      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.07, 10),
        goldMaterial,
      );
      band.position.set(side * 1.18, 1.4, 3.92);
      band.castShadow = true;
      this.visual.add(band);

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.12, 0.07, 10),
        stackMaterial,
      );
      cap.position.set(side * 1.18, 1.6, 3.92);
      cap.castShadow = true;
      this.visual.add(cap);
    }
  }

  private addEnergyTrim(): void {
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x66e5ff,
      toneMapped: false,
    });

    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.03, 4.2),
        glowMaterial,
      );
      strip.position.set(side * 1.82, 0.9, 0.25);
      strip.userData.noShadow = true;
      this.visual.add(strip);
    }

    const sternStrip = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.03, 0.04),
      glowMaterial,
    );
    sternStrip.position.set(0, 0.9, 4.3);
    sternStrip.userData.noShadow = true;
    this.visual.add(sternStrip);

    const emblem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.17, 0),
      glowMaterial,
    );
    emblem.position.set(0, 1.0, -4.5);
    emblem.userData.noShadow = true;
    this.visual.add(emblem);
  }

  private addCommandCrown(): void {
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: GOLD_COLOR,
      metalness: 0.8,
      roughness: 0.24,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd065,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.045, 8, 32),
      glowMaterial,
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, 3.72, 1.18);
    halo.userData.noShadow = true;
    this.visual.add(halo);

    for (const side of [-1, 1]) {
      const rudder = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.62, 0.6),
        goldMaterial,
      );
      rudder.position.set(side * 1.22, 1.05, 4.45);
      rudder.rotation.y = side * 0.18;
      rudder.castShadow = true;
      this.visual.add(rudder);

      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.06, 0.08),
        goldMaterial,
      );
      brace.position.set(side * 1.0, 0.78, 4.45);
      brace.rotation.y = side * 0.18;
      brace.castShadow = true;
      this.visual.add(brace);
    }
  }

  private buildMast(): void {
    const mastMaterial = new THREE.MeshStandardMaterial({
      color: 0x33474f,
      metalness: 0.6,
      roughness: 0.42,
    });
    const flagMaterial = new THREE.MeshStandardMaterial({
      color: 0xb33a32,
      metalness: 0.05,
      roughness: 0.72,
      side: THREE.DoubleSide,
    });

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.065, 2.55, 8),
      mastMaterial,
    );
    mast.position.set(0, 2.1, 1.18);
    this.visual.add(mast);

    const crossbeam = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.055, 0.055),
      mastMaterial,
    );
    crossbeam.position.set(0, 2.86, 1.18);
    this.visual.add(crossbeam);

    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.82, 0.46, 4, 2),
      flagMaterial,
    );
    flag.position.set(0.43, 3.08, 1.18);
    this.visual.add(flag);

    const mastLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffdf9a,
        emissive: 0xffbe52,
        emissiveIntensity: 1.4,
        roughness: 0.3,
      }),
    );
    mastLight.position.set(0, 3.4, 1.18);
    this.visual.add(mastLight);
  }
}
