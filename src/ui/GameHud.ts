import type { PlayerStatus } from '../game/entities/PlayerShip';
import type { UpgradeId, UpgradeOffer } from '../game/progression/types';

export interface GameOverStats {
  survivalSeconds: number;
  kills: number;
  level: number;
  bossKills: number;
  /** Total damage the player dealt this run. */
  damageDealt?: number;
  /** Hits divided by shots, 0..1. Omitted when no shot was fired. */
  accuracy?: number;
  /** Longest chain of kills inside the combo window. */
  bestStreak?: number;
  /** Stored best kill count, shown for comparison. */
  bestKills?: number;
  /** True when this run beat the stored record. */
  isNewRecord?: boolean;
  /** How many runs have been played before this one. */
  totalRuns?: number;
}

export interface SoundControls {
  enabled: boolean;
  toggle: () => boolean;
}

/**
 * Rendering and interaction surface shared by the web HUD and the
 * mini-game canvas HUD. Game logic only talks to this interface.
 */
export interface GameHud {
  update(status: PlayerStatus): void;
  setExperience(current: number, required: number): void;
  setDangerTier(tier: number): void;
  setBossHealth(name: string, ratio: number): void;
  hideBossHealth(): void;
  setBossWarning(active: boolean): void;
  showDamageFeedback(): void;
  showKillFeedback(message?: string): void;
  showUpgradeChoices(
    offers: readonly UpgradeOffer[],
    level: number,
    onSelect: (id: UpgradeId) => void,
  ): void;
  hideUpgradeChoices(): void;
  showGameOver(stats: GameOverStats): void;
  /**
   * Optional floating combat text. Implementations that cannot project world
   * space (the DOM HUD) simply leave it out.
   */
  showDamageNumber?(amount: number, x: number, y: number, z: number): void;
  render(deltaTime: number): void;
  dispose(): void;
}
