import { Vector2 } from 'three';
import type { SoundPlayer } from '../audio/SoundPlayer';
import type {
  InputSource,
  PlatformAdapter,
} from '../platform/PlatformAdapter';
import type { GameHud } from '../ui/GameHud';
import { GAME_CONFIG } from './config';
import type { EnemyShip } from './entities/EnemyShip';
import { PlayerShip } from './entities/PlayerShip';
import { GameLoop } from './GameLoop';
import { ProgressionSystem } from './progression/ProgressionSystem';
import type { UpgradeId } from './progression/types';
import type { SceneManager } from './SceneManager';
import { BossSystem } from './systems/BossSystem';
import { DangerSystem } from './systems/DangerSystem';
import { EnemyAISystem } from './systems/EnemyAISystem';
import { EffectSystem } from './systems/EffectSystem';
import { EnemyManager } from './systems/EnemyManager';
import { EnemySpawner } from './systems/EnemySpawner';
import { MissileSystem } from './systems/MissileSystem';
import { PickupSystem } from './systems/PickupSystem';
import { PlayerControlSystem } from './systems/PlayerControlSystem';
import { ProjectileSystem } from './systems/ProjectileSystem';
import { SecondaryWeaponSystem } from './systems/SecondaryWeaponSystem';
import { TargetingSystem } from './systems/TargetingSystem';
import { TorpedoSystem } from './systems/TorpedoSystem';
import { WeaponSystem } from './systems/WeaponSystem';

type GamePhase = 'playing' | 'upgrade' | 'gameover';

export interface GameServices {
  sceneManager: SceneManager;
  hud: GameHud;
  sound: SoundPlayer;
  platform: PlatformAdapter;
  /** Optional DOM root used by the web input implementation. */
  inputHost?: HTMLElement | null;
}

export class Game {
  private readonly sceneManager: SceneManager;
  private readonly playerShip: PlayerShip;
  private readonly enemyManager: EnemyManager;
  private readonly dangerSystem: DangerSystem;
  private readonly enemySpawner: EnemySpawner;
  private readonly bossSystem: BossSystem;
  private readonly effectSystem: EffectSystem;
  private readonly projectileSystem: ProjectileSystem;
  private readonly pickupSystem: PickupSystem;
  private readonly platform: PlatformAdapter;
  private readonly inputManager: InputSource;
  private readonly playerControl: PlayerControlSystem;
  private readonly enemyAI: EnemyAISystem;
  private readonly weaponSystem: WeaponSystem;
  private readonly secondaryWeaponSystem: SecondaryWeaponSystem;
  private readonly torpedoSystem: TorpedoSystem;
  private readonly missileSystem: MissileSystem;
  private readonly progression: ProgressionSystem;
  private readonly hud: GameHud;
  private readonly loop: GameLoop;
  private readonly sound: SoundPlayer;
  private readonly inputVector = new Vector2();
  private unsubscribePause: (() => void) | null = null;
  private unsubscribeResume: (() => void) | null = null;
  private phase: GamePhase = 'playing';
  private survivalSeconds = 0;
  private dangerTier = 1;
  private kills = 0;
  private bossKills = 0;
  private started = false;
  private disposed = false;

  constructor(services: GameServices) {
    this.sound = services.sound;
    this.platform = services.platform;
    this.sceneManager = services.sceneManager;
    this.hud = services.hud;

    this.playerShip = new PlayerShip();
    this.enemyManager = new EnemyManager();
    this.dangerSystem = new DangerSystem();
    this.enemySpawner = new EnemySpawner(
      this.enemyManager,
      this.playerShip,
      this.dangerSystem,
    );
    this.sceneManager.add(this.playerShip.root, this.enemyManager.root);

    this.progression = new ProgressionSystem(this.playerShip);
    this.playerShip.setSecondaryWeaponLevel(
      this.progression.combatStats.secondaryLevel,
    );
    this.playerShip.setTorpedoWeaponLevel(
      this.progression.combatStats.torpedoLevel,
    );
    this.playerShip.setMissileWeaponLevel(
      this.progression.combatStats.missileLevel,
    );

    this.hud.update(this.playerShip.status);
    this.hud.setExperience(
      this.progression.currentExperience,
      this.progression.experienceRequired,
    );
    this.hud.setDangerTier(this.dangerTier);

    this.inputManager = this.platform.createInput(
      services.inputHost ?? null,
    );

    this.pickupSystem = new PickupSystem((value) => {
      this.handleExperienceCollected(value);
    });
    this.sceneManager.add(this.pickupSystem.root);

    this.effectSystem = new EffectSystem();
    this.sceneManager.add(this.effectSystem.root);

    this.projectileSystem = new ProjectileSystem({
      enemies: this.enemyManager,
      player: this.playerShip,
      onEnemyKilled: (enemy) => {
        this.handleEnemyKilled(enemy);
      },
      onEnemyHit: (position, _enemy, kind) => {
        this.effectSystem.spawnImpact(position, kind);
        if (kind === 'missile' || kind === 'torpedo') {
          this.effectSystem.spawnExplosion(
            position,
            kind === 'missile' ? 0.9 : 0.6,
          );
          this.sound.playHit();
          this.sceneManager.shake(0.13, 0.18);
        }
      },
      onPlayerHit: (damageTaken) => {
        this.handlePlayerHit(damageTaken);
      },
      onTrailPuff: (position, kind) => {
        this.effectSystem.spawnTrailPuff(position, kind);
      },
    });
    this.sceneManager.add(this.projectileSystem.root);

    this.bossSystem = new BossSystem({
      player: this.playerShip,
      enemies: this.enemyManager,
      onPlayerHit: (damageTaken) => {
        this.handlePlayerHit(damageTaken);
      },
      onWarningChanged: (active) => {
        this.hud.setBossWarning(active);
      },
      onDetonated: (position) => {
        this.effectSystem.spawnExplosion(position, 1.5);
        this.sound.playExplosion();
        this.sceneManager.shake(0.6, 0.55);
      },
    });
    this.sceneManager.add(this.bossSystem.root);

    const targeting = new TargetingSystem();
    this.playerControl = new PlayerControlSystem(
      this.playerShip,
      this.sceneManager.camera,
      this.progression.combatStats,
    );
    this.enemyAI = new EnemyAISystem(
      this.playerShip,
      this.enemyManager,
      this.projectileSystem,
    );
    this.weaponSystem = new WeaponSystem(
      this.playerShip,
      this.enemyManager,
      targeting,
      this.projectileSystem,
      this.progression.combatStats,
      (muzzle, aim) => {
        this.sound.playCannon();
        this.effectSystem.spawnMuzzleSmoke(
          muzzle,
          aim.x - muzzle.x,
          aim.z - muzzle.z,
        );
        this.sceneManager.shake(0.05, 0.09);
      },
    );
    this.secondaryWeaponSystem = new SecondaryWeaponSystem(
      this.playerShip,
      this.enemyManager,
      targeting,
      this.projectileSystem,
      this.progression.combatStats,
      () => this.sound.playSecondary(),
    );
    this.torpedoSystem = new TorpedoSystem(
      this.playerShip,
      this.enemyManager,
      targeting,
      this.projectileSystem,
      this.progression.combatStats,
      () => this.sound.playTorpedo(),
    );
    this.missileSystem = new MissileSystem(
      this.playerShip,
      this.enemyManager,
      targeting,
      this.projectileSystem,
      this.progression.combatStats,
      () => this.sound.playMissile(),
    );

    this.loop = new GameLoop({
      fixedUpdate: (deltaTime, elapsedTime) => {
        this.update(deltaTime, elapsedTime);
      },
      render: (frameDelta) => {
        this.sceneManager.update(frameDelta, this.playerShip.root.position);
        this.sceneManager.render();
        this.hud.render(frameDelta);
      },
    });
  }

  start(): void {
    if (this.started || this.disposed) {
      return;
    }

    this.started = true;
    this.unsubscribePause = this.platform.onPause(this.handlePause);
    this.unsubscribeResume = this.platform.onResume(this.handleResume);

    if (!this.platform.isPaused()) {
      this.loop.start();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.started = false;

    this.unsubscribePause?.();
    this.unsubscribeResume?.();
    this.unsubscribePause = null;
    this.unsubscribeResume = null;
    this.loop.dispose();
    this.inputManager.dispose();

    this.sceneManager.remove(
      this.playerShip.root,
      this.enemyManager.root,
      this.projectileSystem.root,
      this.pickupSystem.root,
      this.bossSystem.root,
      this.effectSystem.root,
    );
    this.bossSystem.dispose();
    this.effectSystem.dispose();
    this.projectileSystem.dispose();
    this.pickupSystem.dispose();
    this.enemyManager.dispose();
    this.playerShip.dispose();
    this.sceneManager.dispose();
    this.hud.dispose();
  }

  private update(deltaTime: number, elapsedTime: number): void {
    if (this.phase !== 'playing') {
      return;
    }

    this.survivalSeconds += deltaTime;

    const dangerStage = this.dangerSystem.getStage(this.survivalSeconds);
    if (dangerStage.tier !== this.dangerTier) {
      this.dangerTier = dangerStage.tier;
      this.hud.setDangerTier(this.dangerTier);
    }

    this.enemySpawner.update(deltaTime, dangerStage);
    this.inputManager.getMoveVector(this.inputVector);
    this.playerControl.update(this.inputVector, deltaTime);
    this.enemyAI.update(deltaTime);
    this.enemyManager.update(deltaTime, elapsedTime, this.sceneManager.camera);
    this.bossSystem.update(deltaTime);

    if (this.phase !== 'playing') {
      return;
    }

    this.weaponSystem.update(deltaTime);
    this.secondaryWeaponSystem.update(deltaTime);
    this.torpedoSystem.update(deltaTime);
    this.missileSystem.update(deltaTime);
    this.projectileSystem.update(deltaTime);

    if (this.phase !== 'playing') {
      return;
    }

    this.effectSystem.update(deltaTime);
    this.syncBossHud();
    this.pickupSystem.update(
      deltaTime,
      elapsedTime,
      this.playerShip,
      this.progression.combatStats.magnetRadiusBonus,
    );
    this.playerShip.updateVisual(elapsedTime, deltaTime);
  }

  private handleEnemyKilled(enemy: EnemyShip): void {
    if (this.phase !== 'playing') {
      return;
    }

    this.kills += 1;
    this.pickupSystem.spawn(enemy.root.position, enemy.experienceValue);
    this.effectSystem.spawnExplosion(
      enemy.root.position,
      enemy.isBoss ? 2.4 : enemy.isElite ? 1.35 : 1,
    );
    this.sound.playExplosion();
    this.sceneManager.shake(
      enemy.isBoss ? 0.45 : enemy.isElite ? 0.16 : 0.09,
      enemy.isBoss ? 0.5 : 0.22,
    );

    const repair = this.progression.combatStats.repairOnKill;
    if (repair > 0 && !this.playerShip.isDestroyed) {
      const healed = this.playerShip.heal(repair);
      if (healed > 0) {
        this.hud.update(this.playerShip.status);
      }
    }

    if (enemy.isBoss) {
      this.bossKills += 1;
      this.hud.hideBossHealth();
      this.bossSystem.cancelWarning();
      this.hud.showKillFeedback('深海霸主击沉');
    } else if (enemy.isElite) {
      this.hud.showKillFeedback('精英敌舰击沉');
    } else {
      this.hud.showKillFeedback();
    }
  }

  private syncBossHud(): void {
    const boss = this.enemyManager.getBoss();

    if (!boss) {
      this.hud.hideBossHealth();
      return;
    }

    this.hud.setBossHealth(
      GAME_CONFIG.boss.name,
      boss.currentHealth / boss.maxHealth,
    );
  }

  private handlePlayerHit(_damageTaken: number): void {
    if (this.phase !== 'playing') {
      return;
    }

    this.hud.update(this.playerShip.status);
    this.hud.showDamageFeedback();
    this.sound.playDamage();
    this.effectSystem.spawnHit(this.playerShip.root.position);
    this.sceneManager.shake(0.3, 0.3);

    if (this.playerShip.isDestroyed) {
      this.endGame();
    }
  }

  private handleExperienceCollected(value: number): void {
    if (this.phase === 'gameover') {
      return;
    }

    const gainedExperience = Math.max(
      1,
      Math.round(
        value * this.progression.combatStats.experienceMultiplier,
      ),
    );
    const gainedLevels =
      this.progression.addExperience(gainedExperience);
    this.hud.setExperience(
      this.progression.currentExperience,
      this.progression.experienceRequired,
    );

    if (gainedLevels > 0) {
      this.hud.update(this.playerShip.status);
      if (this.playerShip.applyEvolution(this.progression.currentLevel)) {
        this.hud.showKillFeedback('旗舰进化 · 新武装就位');
      }
    }

    if (this.progression.hasPendingLevelUp) {
      this.openUpgradeSelection();
    }
  }

  private openUpgradeSelection(): void {
    if (this.phase !== 'playing' || !this.progression.hasPendingLevelUp) {
      return;
    }

    const offers = this.progression.beginUpgradeSelection();
    if (offers.length === 0) {
      return;
    }

    this.phase = 'upgrade';
    this.inputManager.setEnabled(false);
    this.sound.playLevelUp();
    this.hud.showUpgradeChoices(
      offers,
      this.progression.currentLevel,
      this.handleUpgradeSelected,
    );
  }

  private readonly handleUpgradeSelected = (id: UpgradeId): void => {
    if (this.phase !== 'upgrade') {
      return;
    }

    if (!this.progression.applyUpgrade(id)) {
      return;
    }

    this.playerShip.setSecondaryWeaponLevel(
      this.progression.combatStats.secondaryLevel,
    );
    this.playerShip.setTorpedoWeaponLevel(
      this.progression.combatStats.torpedoLevel,
    );
    this.playerShip.setMissileWeaponLevel(
      this.progression.combatStats.missileLevel,
    );
    this.hud.update(this.playerShip.status);
    this.hud.setExperience(
      this.progression.currentExperience,
      this.progression.experienceRequired,
    );

    if (this.progression.hasPendingLevelUp) {
      const nextOffers = this.progression.beginUpgradeSelection();
      if (nextOffers.length > 0) {
        this.hud.showUpgradeChoices(
          nextOffers,
          this.progression.currentLevel,
          this.handleUpgradeSelected,
        );
        return;
      }
    }

    this.hud.hideUpgradeChoices();
    this.phase = 'playing';
    this.inputManager.setEnabled(true);
  };

  private endGame(): void {
    if (this.phase !== 'playing') {
      return;
    }

    this.phase = 'gameover';
    this.inputManager.setEnabled(false);
    this.projectileSystem.clear();
    this.bossSystem.cancelWarning();
    this.hud.hideBossHealth();
    this.hud.update(this.playerShip.status);
    this.hud.showGameOver({
      survivalSeconds: this.survivalSeconds,
      kills: this.kills,
      level: this.progression.currentLevel,
      bossKills: this.bossKills,
    });
  }

  private readonly handlePause = (): void => {
    if (!this.started || this.disposed) {
      return;
    }

    this.inputManager.reset();
    this.loop.stop();
  };

  private readonly handleResume = (): void => {
    if (!this.started || this.disposed) {
      return;
    }

    this.inputManager.reset();
    this.loop.start();
  };
}
