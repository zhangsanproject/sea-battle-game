import {
  DANGER_STAGES,
  ENEMY_PROFILES,
  GAME_CONFIG,
  type DangerStage,
  type EnemyProfile,
} from '../config';
import type { PlayerShip } from '../entities/PlayerShip';
import type { DangerSystem } from './DangerSystem';
import type { EnemyManager } from './EnemyManager';

export type SpawnRandomSource = () => number;

interface SpawnPosition {
  x: number;
  z: number;
}

export class EnemySpawner {
  private spawnTimer: number = GAME_CONFIG.spawner.initialSpawnTimer;
  private elapsed = 0;
  private bossCount = 0;
  private nextBossAt: number = GAME_CONFIG.boss.firstSpawnAtSeconds;

  constructor(
    private readonly enemies: EnemyManager,
    private readonly player: PlayerShip,
    private readonly danger: DangerSystem,
    private readonly random: SpawnRandomSource = Math.random,
  ) {}

  update(deltaTime: number, stage: DangerStage): void {
    this.elapsed += deltaTime;

    // Bosses run on a clock instead of a single scripted beat, so a three
    // minute run has two clear peaks and an endless run keeps producing them.
    const activeBoss = this.enemies.getBoss();
    if (!activeBoss && this.elapsed >= this.nextBossAt) {
      this.spawnBoss(stage, this.bossCount);
      this.bossCount += 1;
      this.nextBossAt = this.elapsed + GAME_CONFIG.boss.intervalSeconds;
      return;
    }

    // A boss used to freeze reinforcements for its whole lifetime, which left
    // the arena empty for the better part of a minute. Keep the swarm coming,
    // just thinner and slower so the boss still owns the fight.
    const cap = activeBoss
      ? Math.max(
          4,
          Math.ceil(
            stage.targetEnemyCount *
              GAME_CONFIG.spawner.bossReinforcementFactor,
          ),
        )
      : stage.targetEnemyCount;
    const interval = activeBoss
      ? stage.spawnIntervalSeconds *
        GAME_CONFIG.spawner.bossSpawnIntervalFactor
      : stage.spawnIntervalSeconds;

    const activeEnemies =
      this.enemies.getEnemies().length - (activeBoss ? 1 : 0);
    this.spawnTimer -= deltaTime;

    if (this.spawnTimer > 0) {
      return;
    }

    if (activeEnemies >= cap) {
      this.spawnTimer = interval;
      return;
    }

    this.spawnNormalEnemy(stage);
    this.spawnTimer = interval;
  }

  private spawnNormalEnemy(stage: DangerStage): void {
    const position = this.findSpawnPosition();
    const baseProfile = this.pickEnemyProfile(stage);
    const eliteChance = Math.min(
      GAME_CONFIG.spawner.eliteMaxChance,
      GAME_CONFIG.spawner.eliteBaseChance +
        (stage.tier - 1) * GAME_CONFIG.spawner.eliteChancePerTier,
    );
    const isElite = this.random() < eliteChance;
    let profile = this.danger.scaleProfile(baseProfile, stage);

    if (isElite) {
      profile = this.applyEliteModifiers(profile);
    }

    const playerPosition = this.player.root.position;
    const heading = Math.atan2(
      position.x - playerPosition.x,
      position.z - playerPosition.z,
    );
    const initialFireDelay =
      GAME_CONFIG.spawner.initialFireDelayMin +
      this.random() *
        (GAME_CONFIG.spawner.initialFireDelayMax -
          GAME_CONFIG.spawner.initialFireDelayMin);
    const strafeDirection: 1 | -1 = this.random() < 0.5 ? -1 : 1;

    this.enemies.spawnEnemy(
      profile,
      position.x,
      position.z,
      heading,
      initialFireDelay,
      strafeDirection,
      { isElite },
    );
  }

  private spawnBoss(stage: DangerStage, index: number): void {
    const position = this.findBossSpawnPosition();
    const playerPosition = this.player.root.position;
    const heading = Math.atan2(
      position.x - playerPosition.x,
      position.z - playerPosition.z,
    );
    // Every boss after the first is a heavier version of the same hull, so an
    // endless run keeps escalating instead of recycling the opening fight.
    // The danger multiplier is deliberately NOT applied here: at tier 3 it
    // turned the 60-second boss into a 740 HP wall the player could not break
    // before the escorts finished them off.
    const growth = Math.pow(GAME_CONFIG.boss.healthGrowth, index);
    const scaled = this.danger.scaleProfile(ENEMY_PROFILES.boss, stage);
    const profile: EnemyProfile = {
      ...scaled,
      maxHealth: Math.max(
        1,
        Math.round(ENEMY_PROFILES.boss.maxHealth * growth),
      ),
    };

    this.enemies.spawnEnemy(
      profile,
      position.x,
      position.z,
      heading,
      GAME_CONFIG.boss.initialFireDelay,
      1,
      { isBoss: true },
    );
  }

  private pickEnemyProfile(stage: DangerStage): EnemyProfile {
    // Weights stop shifting once the authored curve ends. Without the clamp the
    // chaff would be pushed past zero and every overtime spawn would be a
    // capital ship, which turns the run into a wall.
    const weightTier = Math.min(stage.tier, DANGER_STAGES.length);
    const eligible = GAME_CONFIG.spawner.spawnWeights
      .filter((candidate) => weightTier >= candidate.minTier)
      .map((candidate) => ({
        profile: candidate.profile,
        weight: Math.max(
          0,
          candidate.weight +
            (candidate.weightPerTier ?? 0) * (weightTier - candidate.minTier),
        ),
      }))
      .filter((candidate) => candidate.weight > 0);

    if (eligible.length === 0) {
      return ENEMY_PROFILES.raider;
    }

    const totalWeight = eligible.reduce(
      (total, candidate) => total + candidate.weight,
      0,
    );
    let roll = this.random() * totalWeight;
    let selected = eligible[eligible.length - 1];

    for (const candidate of eligible) {
      roll -= candidate.weight;
      if (roll <= 0) {
        selected = candidate;
        break;
      }
    }

    if (!selected) {
      return ENEMY_PROFILES.raider;
    }

    return ENEMY_PROFILES[selected.profile];
  }

  private applyEliteModifiers(profile: EnemyProfile): EnemyProfile {
    return {
      ...profile,
      maxHealth: Math.round(
        profile.maxHealth * GAME_CONFIG.spawner.eliteHealthMultiplier,
      ),
      armor:
        profile.armor + GAME_CONFIG.spawner.eliteArmorBonus,
      projectileDamage: Math.round(
        profile.projectileDamage *
          GAME_CONFIG.spawner.eliteDamageMultiplier,
      ),
      experienceValue: Math.round(
        profile.experienceValue *
          GAME_CONFIG.spawner.eliteExperienceMultiplier,
      ),
      visualScale:
        profile.visualScale *
        GAME_CONFIG.spawner.eliteVisualScaleMultiplier,
    };
  }

  private findBossSpawnPosition(): SpawnPosition {
    const playerPosition = this.player.root.position;
    const arenaLimit = GAME_CONFIG.arena.radius - 3;
    const forwardX = playerPosition.x;
    const forwardZ = playerPosition.z - 24;

    if (Math.hypot(forwardX, forwardZ) <= arenaLimit) {
      return { x: forwardX, z: forwardZ };
    }

    const playerDistanceFromCenter = Math.hypot(
      playerPosition.x,
      playerPosition.z,
    );

    if (playerDistanceFromCenter > 0.001) {
      return {
        x:
          playerPosition.x -
          (playerPosition.x / playerDistanceFromCenter) * 22,
        z:
          playerPosition.z -
          (playerPosition.z / playerDistanceFromCenter) * 22,
      };
    }

    return { x: playerPosition.x, z: playerPosition.z - 22 };
  }

  private findSpawnPosition(): SpawnPosition {
    const playerPosition = this.player.root.position;
    const arenaLimit = GAME_CONFIG.arena.radius - 2;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = this.random() * Math.PI * 2;
      const distance =
        GAME_CONFIG.spawner.minSpawnDistance +
        this.random() *
          (GAME_CONFIG.spawner.maxSpawnDistance -
            GAME_CONFIG.spawner.minSpawnDistance);
      const candidateX = playerPosition.x + Math.cos(angle) * distance;
      const candidateZ = playerPosition.z + Math.sin(angle) * distance;

      if (
        Math.hypot(candidateX, candidateZ) > arenaLimit ||
        Math.hypot(
          candidateX - playerPosition.x,
          candidateZ - playerPosition.z,
        ) <
          GAME_CONFIG.spawner.minSpawnDistance * 0.7
      ) {
        continue;
      }

      return { x: candidateX, z: candidateZ };
    }

    const playerDistanceFromCenter = Math.hypot(
      playerPosition.x,
      playerPosition.z,
    );

    if (playerDistanceFromCenter > 0.001) {
      return {
        x:
          playerPosition.x -
          (playerPosition.x / playerDistanceFromCenter) *
            GAME_CONFIG.spawner.minSpawnDistance,
        z:
          playerPosition.z -
          (playerPosition.z / playerDistanceFromCenter) *
            GAME_CONFIG.spawner.minSpawnDistance,
      };
    }

    const angle = this.random() * Math.PI * 2;
    return {
      x:
        playerPosition.x +
        Math.cos(angle) * GAME_CONFIG.spawner.minSpawnDistance,
      z:
        playerPosition.z +
        Math.sin(angle) * GAME_CONFIG.spawner.minSpawnDistance,
    };
  }
}
