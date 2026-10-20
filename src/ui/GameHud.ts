import type { PlayerStatus } from '../game/entities/PlayerShip';
import type { UpgradeId, UpgradeOffer } from '../game/progression/types';

export interface GameOverStats {
  survivalSeconds: number;
  kills: number;
  level: number;
  bossKills: number;
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
  render(deltaTime: number): void;
  dispose(): void;
}
