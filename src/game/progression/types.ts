import type { PlayerShip } from '../entities/PlayerShip';
import { GAME_CONFIG } from '../config';

export interface CombatStats {
  weaponDamage: number;
  fireInterval: number;
  projectileCount: number;
  weaponRange: number;
  moveSpeed: number;
  secondaryLevel: number;
  torpedoLevel: number;
  missileLevel: number;
  experienceMultiplier: number;
  magnetRadiusBonus: number;
  repairOnKill: number;
}

export type UpgradeId =
  | 'damage'
  | 'fireRate'
  | 'projectileCount'
  | 'range'
  | 'speed'
  | 'health'
  | 'secondary'
  | 'torpedo'
  | 'missile'
  | 'armor'
  | 'repair'
  | 'magnet'
  | 'experience';

export interface UpgradeContext {
  stats: CombatStats;
  player: PlayerShip;
}

export interface UpgradeDefinition {
  id: UpgradeId;
  title: string;
  tag: string;
  maxLevel: number;
  getDescription: (stats: CombatStats, player: PlayerShip) => string;
  apply: (context: UpgradeContext) => void;
}

export interface UpgradeOffer {
  id: UpgradeId;
  title: string;
  tag: string;
  description: string;
  nextLevel: number;
  maxLevel: number;
}

export function createCombatStats(): CombatStats {
  return {
    weaponDamage: GAME_CONFIG.weapon.projectileDamage,
    fireInterval: GAME_CONFIG.weapon.fireInterval,
    projectileCount: GAME_CONFIG.weapon.projectileCount,
    weaponRange: GAME_CONFIG.weapon.range,
    moveSpeed: GAME_CONFIG.player.maxSpeed,
    secondaryLevel: GAME_CONFIG.playerWeapons.secondary.initialLevel,
    torpedoLevel: GAME_CONFIG.playerWeapons.torpedo.initialLevel,
    missileLevel: GAME_CONFIG.playerWeapons.missile.initialLevel,
    experienceMultiplier: 1,
    magnetRadiusBonus: 0,
    repairOnKill: 0,
  };
}
