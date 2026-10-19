import {
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
  private bossSpawned = false;

  constructor(
    private readonly enemies: EnemyManager,
    private readonly player: PlayerShip,
    private readonly danger: DangerSystem,
    private readonly random: SpawnRandomSource = Math.random,
  ) {}

  update(deltaTime: number, stage: DangerStage): void {
    const activeBoss = this.enemies.getBoss();

    if (activeBoss) {
      this.spawnTimer = stage.spawnIntervalSeconds;
      return;
    }

    if (
      !this.bossSpawned &&
      stage.tier >= GAME_CONFIG.boss.spawnDangerTier
    ) {
      this.spawnBoss(stage);
      this.bossSpawned = true;
      return;
    }

    const activeEnemies = this.enemies.getEnemies().length;
    this.spawnTimer -= deltaTime;

    if (this.spawnTimer > 0) {
      return;
    }

    if (activeEnemies >= stage.targetEnemyCount) {
      this.spawnTimer = stage.spawnIntervalSeconds;
      return;
    }

    this.spawnNormalEnemy(stage);
    this.spawnTimer = stage.spawnIntervalSeconds;
  }

  private spawnNormalEnemy(stage: DangerStage): void {
    const position = this.findSpawnPosition();
    const baseProfile = this.pickEnemyProfile();
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

  private spawnBoss(stage: DangerStage): void {
    const position = this.findBossSpawnPosition();
    const playerPosition = this.player.root.position;
    const heading = Math.atan2(
      position.x - playerPosition.x,
      position.z - playerPosition.z,
    );
    const profile = this.danger.scaleProfile(
      ENEMY_PROFILES.boss,
      stage,
    );

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

  private pickEnemyProfile(): EnemyProfile {
    const weights = GAME_CONFIG.spawner.spawnWeights;
    let roll = this.random();
    let selected = weights[weights.length - 1];

    for (const candidate of weights) {
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
