/**
 * Single source of truth for gameplay tuning.
 * Model proportions and purely visual values stay with their model files.
 */

export type EnemyProfileId =
  | 'raider'
  | 'interceptor'
  | 'gunboat'
  | 'destroyer'
  | 'torpedoBoat'
  | 'missileBoat'
  | 'cruiser'
  | 'artilleryBarge'
  | 'boss';

export type ProjectileKind = 'shell' | 'secondary' | 'torpedo' | 'missile';

export interface EnemyProfile {
  id: EnemyProfileId;
  maxHealth: number;
  armor: number;
  maxSpeed: number;
  acceleration: number;
  turnSpeed: number;
  preferredRange: number;
  rangeTolerance: number;
  attackRange: number;
  fireInterval: number;
  projectileSpeed: number;
  projectileDamage: number;
  projectileCount: number;
  spreadRadians: number;
  projectileKind: ProjectileKind;
  projectileMaxDistance: number;
  aimTolerance: number;
  experienceValue: number;
  hitRadius: number;
  aimPointHeight: number;
  sinkDuration: number;
  visualScale: number;
  strafeSpeedFactor: number;
  hullColor: number;
}

export interface EnemySpawnConfig {
  profile: EnemyProfileId;
  x: number;
  z: number;
  initialFireDelay: number;
  strafeDirection: 1 | -1;
}

export interface SpawnWeight {
  profile: EnemyProfileId;
  weight: number;
  /** Enemy type becomes eligible at this danger tier. */
  minTier: number;
}

export interface DangerStage {
  tier: number;
  startsAtSeconds: number;
  healthMultiplier: number;
  armorBonus: number;
  damageMultiplier: number;
  fireIntervalMultiplier: number;
  experienceMultiplier: number;
  targetEnemyCount: number;
  spawnIntervalSeconds: number;
}

/**
 * Bounded danger curve. After the final stage the game stays at the last tier,
 * preventing unbounded linear scaling during exceptionally long runs.
 */
export const DANGER_STAGES: readonly DangerStage[] = [
  {
    tier: 1,
    startsAtSeconds: 0,
    healthMultiplier: 1,
    armorBonus: 0,
    damageMultiplier: 1,
    fireIntervalMultiplier: 1,
    experienceMultiplier: 1,
    targetEnemyCount: 12,
    spawnIntervalSeconds: 2.0,
  },
  {
    tier: 2,
    startsAtSeconds: 12,
    healthMultiplier: 1.12,
    armorBonus: 1,
    damageMultiplier: 1.06,
    fireIntervalMultiplier: 0.97,
    experienceMultiplier: 1.08,
    targetEnemyCount: 14,
    spawnIntervalSeconds: 1.9,
  },
  {
    tier: 3,
    startsAtSeconds: 35,
    healthMultiplier: 1.28,
    armorBonus: 1,
    damageMultiplier: 1.13,
    fireIntervalMultiplier: 0.94,
    experienceMultiplier: 1.16,
    targetEnemyCount: 16,
    spawnIntervalSeconds: 1.8,
  },
  {
    tier: 4,
    startsAtSeconds: 65,
    healthMultiplier: 1.47,
    armorBonus: 2,
    damageMultiplier: 1.21,
    fireIntervalMultiplier: 0.9,
    experienceMultiplier: 1.26,
    targetEnemyCount: 18,
    spawnIntervalSeconds: 1.7,
  },
  {
    tier: 5,
    startsAtSeconds: 100,
    healthMultiplier: 1.7,
    armorBonus: 3,
    damageMultiplier: 1.3,
    fireIntervalMultiplier: 0.86,
    experienceMultiplier: 1.36,
    targetEnemyCount: 20,
    spawnIntervalSeconds: 1.6,
  },
  {
    tier: 6,
    startsAtSeconds: 140,
    healthMultiplier: 1.95,
    armorBonus: 4,
    damageMultiplier: 1.4,
    fireIntervalMultiplier: 0.82,
    experienceMultiplier: 1.48,
    targetEnemyCount: 22,
    spawnIntervalSeconds: 1.5,
  },
];

export const ENEMY_PROFILES: Record<EnemyProfileId, EnemyProfile> = {
  raider: {
    id: 'raider',
    maxHealth: 22,
    armor: 0,
    maxSpeed: 6.5,
    acceleration: 8,
    turnSpeed: 1.8,
    preferredRange: 14,
    rangeTolerance: 2.5,
    attackRange: 26,
    fireInterval: 2.4,
    projectileSpeed: 26,
    projectileDamage: 4,
    projectileCount: 1,
    spreadRadians: 0,
    projectileKind: 'shell',
    projectileMaxDistance: 32,
    aimTolerance: 0.14,
    experienceValue: 9,
    hitRadius: 2.0,
    aimPointHeight: 0.85,
    sinkDuration: 1.6,
    visualScale: 0.62,
    strafeSpeedFactor: 0.35,
    hullColor: 0x67272a,
  },
  gunboat: {
    id: 'gunboat',
    maxHealth: 30,
    armor: 1,
    maxSpeed: 4.6,
    acceleration: 5.5,
    turnSpeed: 1.2,
    preferredRange: 19,
    rangeTolerance: 3,
    attackRange: 29,
    fireInterval: 3.0,
    projectileSpeed: 24,
    projectileDamage: 7,
    projectileCount: 1,
    spreadRadians: 0,
    projectileKind: 'shell',
    projectileMaxDistance: 36,
    aimTolerance: 0.16,
    experienceValue: 14,
    hitRadius: 2.2,
    aimPointHeight: 0.95,
    sinkDuration: 1.9,
    visualScale: 0.78,
    strafeSpeedFactor: 0.28,
    hullColor: 0x552023,
  },
  destroyer: {
    id: 'destroyer',
    maxHealth: 110,
    armor: 2,
    maxSpeed: 3.6,
    acceleration: 4.5,
    turnSpeed: 0.9,
    preferredRange: 22,
    rangeTolerance: 3,
    attackRange: 33,
    fireInterval: 3,
    projectileSpeed: 27,
    projectileDamage: 8,
    projectileCount: 3,
    spreadRadians: 0.05,
    projectileKind: 'shell',
    projectileMaxDistance: 38,
    aimTolerance: 0.2,
    experienceValue: 22,
    hitRadius: 2.6,
    aimPointHeight: 1.1,
    sinkDuration: 2.1,
    visualScale: 0.95,
    strafeSpeedFactor: 0.22,
    hullColor: 0x43312f,
  },
  torpedoBoat: {
    id: 'torpedoBoat',
    maxHealth: 36,
    armor: 0,
    maxSpeed: 9,
    acceleration: 13,
    turnSpeed: 2.6,
    preferredRange: 11,
    rangeTolerance: 2,
    attackRange: 22,
    fireInterval: 4.2,
    projectileSpeed: 17,
    projectileDamage: 10,
    projectileCount: 1,
    spreadRadians: 0,
    projectileKind: 'torpedo',
    projectileMaxDistance: 30,
    aimTolerance: 0.18,
    experienceValue: 16,
    hitRadius: 1.75,
    aimPointHeight: 0.8,
    sinkDuration: 1.5,
    visualScale: 0.62,
    strafeSpeedFactor: 0.6,
    hullColor: 0x6b3b22,
  },
  interceptor: {
    id: 'interceptor',
    maxHealth: 18,
    armor: 0,
    maxSpeed: 9.6,
    acceleration: 15,
    turnSpeed: 2.8,
    preferredRange: 8,
    rangeTolerance: 1.8,
    attackRange: 17,
    fireInterval: 1.8,
    projectileSpeed: 30,
    projectileDamage: 3,
    projectileCount: 1,
    spreadRadians: 0.02,
    projectileKind: 'secondary',
    projectileMaxDistance: 22,
    aimTolerance: 0.12,
    experienceValue: 11,
    hitRadius: 1.55,
    aimPointHeight: 0.7,
    sinkDuration: 1.3,
    visualScale: 0.55,
    strafeSpeedFactor: 0.85,
    hullColor: 0x7c3122,
  },
  missileBoat: {
    id: 'missileBoat',
    maxHealth: 60,
    armor: 1,
    maxSpeed: 7,
    acceleration: 10,
    turnSpeed: 2,
    preferredRange: 19,
    rangeTolerance: 3,
    attackRange: 31,
    fireInterval: 4.0,
    projectileSpeed: 20,
    projectileDamage: 8,
    projectileCount: 2,
    spreadRadians: 0.07,
    projectileKind: 'missile',
    projectileMaxDistance: 36,
    aimTolerance: 0.2,
    experienceValue: 18,
    hitRadius: 2.0,
    aimPointHeight: 0.82,
    sinkDuration: 1.7,
    visualScale: 0.7,
    strafeSpeedFactor: 0.42,
    hullColor: 0x5b3a21,
  },
  cruiser: {
    id: 'cruiser',
    maxHealth: 170,
    armor: 3,
    maxSpeed: 3.2,
    acceleration: 4.2,
    turnSpeed: 0.85,
    preferredRange: 24,
    rangeTolerance: 3.5,
    attackRange: 36,
    fireInterval: 2.9,
    projectileSpeed: 25,
    projectileDamage: 9,
    projectileCount: 4,
    spreadRadians: 0.045,
    projectileKind: 'shell',
    projectileMaxDistance: 42,
    aimTolerance: 0.22,
    experienceValue: 30,
    hitRadius: 2.9,
    aimPointHeight: 1.2,
    sinkDuration: 2.3,
    visualScale: 1.12,
    strafeSpeedFactor: 0.18,
    hullColor: 0x3b2a2c,
  },
  artilleryBarge: {
    id: 'artilleryBarge',
    maxHealth: 145,
    armor: 2,
    maxSpeed: 2.6,
    acceleration: 3,
    turnSpeed: 0.6,
    preferredRange: 30,
    rangeTolerance: 4,
    attackRange: 42,
    fireInterval: 4,
    projectileSpeed: 31,
    projectileDamage: 14,
    projectileCount: 1,
    spreadRadians: 0,
    projectileKind: 'shell',
    projectileMaxDistance: 48,
    aimTolerance: 0.1,
    experienceValue: 34,
    hitRadius: 3.0,
    aimPointHeight: 1.25,
    sinkDuration: 2.5,
    visualScale: 1.18,
    strafeSpeedFactor: 0.12,
    hullColor: 0x3a3530,
  },
  boss: {
    id: 'boss',
    maxHealth: 400,
    armor: 4,
    maxSpeed: 3.2,
    acceleration: 4,
    turnSpeed: 0.9,
    preferredRange: 21,
    rangeTolerance: 3,
    attackRange: 34,
    fireInterval: 2.3,
    projectileSpeed: 24,
    projectileDamage: 16,
    projectileCount: 2,
    spreadRadians: 0.045,
    projectileKind: 'shell',
    projectileMaxDistance: 42,
    aimTolerance: 0.24,
    experienceValue: 180,
    hitRadius: 4.8,
    aimPointHeight: 1.65,
    sinkDuration: 2.8,
    visualScale: 1.6,
    strafeSpeedFactor: 0.24,
    hullColor: 0x481b20,
  },
};

export const GAME_CONFIG = {
  arena: {
    radius: 46,
  },
  player: {
    maxSpeed: 10,
    acceleration: 26,
    deceleration: 22,
    turnSpeed: 4.2,
    maxHealth: 160,
    armor: 2,
    hitRadius: 2.7,
    aimPointHeight: 1.0,
  },
  turret: {
    turnSpeed: 3.6,
    aimTolerance: 0.1,
  },
  weapon: {
    range: 29,
    fireInterval: 0.85,
    projectileSpeed: 38,
    projectileDamage: 16,
    projectileCount: 2,
    projectileMaxDistance: 38,
    /** Downward pull on shells, in units per second squared. 0 = flat shot. */
    shellGravity: 14,
    /** How long the tracer streak stays visible behind a shell, in seconds. */
    tracerSeconds: 0.16,
  },
  pickup: {
    magnetRadius: 15,
    collectRadius: 1.7,
    magnetSpeed: 19,
    bobHeight: 0.12,
    orbHeight: 0.9,
  },
  progression: {
    baseExperience: 30,
    experienceGrowth: 20,
    upgradeChoiceCount: 3,
    /**
     * Chance that one card in a level-up offer is a still-locked weapon, so
     * every run reaches the secondary battery / torpedoes / missiles early.
     */
    weaponUnlockOfferChance: 0.5,
  },
  evolution: {
    levels: [2, 3, 4, 6, 8, 10, 13, 16, 20] as const,
  },
  playerWeapons: {
    // Every weapon except the main gun starts locked (level 0) and is
    // installed through its level-up upgrade.
    secondary: {
      initialLevel: 0,
      baseDamageFactor: 0.36,
      damagePerLevel: 1.5,
      baseFireInterval: 0.52,
      fireIntervalPerLevel: 0.06,
      minFireInterval: 0.2,
      baseRange: 23,
      rangePerLevel: 2,
      aimTolerance: 0.18,
      turretTurnSpeed: 4.2,
    },
    torpedo: {
      initialLevel: 0,
      baseDamage: 46,
      damagePerLevel: 16,
      baseFireInterval: 3.2,
      fireIntervalPerLevel: 0.12,
      minFireInterval: 2.4,
      baseSpeed: 16,
      speedPerLevel: 1.4,
      range: 30,
      projectileMaxDistance: 38,
    },
    missile: {
      initialLevel: 0,
      baseDamage: 30,
      damagePerLevel: 12,
      baseFireInterval: 2.8,
      fireIntervalPerLevel: 0.2,
      minFireInterval: 1.8,
      range: 34,
      projectileSpeed: 26,
      projectileMaxDistance: 68,
      verticalLaunchSeconds: 0.3,
      turnRate: 3.2,
      splashRadius: 3.8,
      splashDamageFactor: 0.55,
    },
  },
  spawner: {
    minSpawnDistance: 16,
    maxSpawnDistance: 24,
    initialSpawnTimer: 2.5,
    spawnWeights: [
      { profile: 'raider', weight: 0.3, minTier: 1 },
      { profile: 'interceptor', weight: 0.22, minTier: 1 },
      { profile: 'gunboat', weight: 0.28, minTier: 1 },
      { profile: 'torpedoBoat', weight: 0.16, minTier: 2 },
      { profile: 'missileBoat', weight: 0.14, minTier: 2 },
      { profile: 'destroyer', weight: 0.12, minTier: 3 },
      { profile: 'cruiser', weight: 0.08, minTier: 4 },
      { profile: 'artilleryBarge', weight: 0.06, minTier: 5 },
    ] satisfies SpawnWeight[],
    initialFireDelayMin: 1.2,
    initialFireDelayMax: 2.8,
    /** Fraction of the normal cap that keeps arriving while a boss is alive. */
    bossReinforcementFactor: 0.6,
    /** Boss fights stretch the reinforcement interval by this factor. */
    bossSpawnIntervalFactor: 1.4,
    eliteBaseChance: 0.12,
    eliteChancePerTier: 0.06,
    eliteMaxChance: 0.5,
    eliteHealthMultiplier: 1.6,
    eliteArmorBonus: 2,
    eliteDamageMultiplier: 1.25,
    eliteExperienceMultiplier: 2,
    eliteVisualScaleMultiplier: 1.08,
  },
  boss: {
    spawnDangerTier: 2,
    name: '深海霸主',
    initialFireDelay: 1.5,
    specialInitialCooldown: 1.2,
    specialIntervalSeconds: 6.5,
    telegraphSeconds: 1.5,
    blastRadius: 5.5,
    specialDamage: 24,
  },
  enemySpawns: [
    {
      profile: 'raider',
      x: -15,
      z: -14,
      initialFireDelay: 1.4,
      strafeDirection: 1,
    },
    {
      profile: 'torpedoBoat',
      x: 15,
      z: -16,
      initialFireDelay: 2.0,
      strafeDirection: -1,
    },
    {
      profile: 'gunboat',
      x: 0,
      z: -23,
      initialFireDelay: 2.6,
      strafeDirection: 1,
    },
    {
      profile: 'missileBoat',
      x: 20,
      z: 10,
      initialFireDelay: 3.2,
      strafeDirection: -1,
    },
  ] satisfies EnemySpawnConfig[],
  input: {
    joystickDeadzone: 0.14,
  },
} as const;
