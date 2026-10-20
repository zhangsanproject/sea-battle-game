import { GAME_CONFIG } from '../config';
import type { PlayerShip } from '../entities/PlayerShip';
import { UPGRADE_DEFINITIONS } from './upgradeDefinitions';
import {
  createCombatStats,
  type CombatStats,
  type UpgradeDefinition,
  type UpgradeId,
  type UpgradeOffer,
} from './types';

export type RandomSource = () => number;

export function selectUpgradeChoices(
  definitions: readonly UpgradeDefinition[],
  levels: Readonly<Record<UpgradeId, number>>,
  count: number,
  random: RandomSource,
): UpgradeDefinition[] {
  const eligible = definitions.filter(
    (definition) => levels[definition.id] < definition.maxLevel,
  );

  const choiceCount = Math.min(Math.max(0, count), eligible.length);

  for (let index = 0; index < choiceCount; index += 1) {
    const randomValue = Math.min(Math.max(random(), 0), 0.999999);
    const swapIndex =
      index + Math.floor(randomValue * (eligible.length - index));
    const current = eligible[index];
    const selected = eligible[swapIndex];

    if (!current || !selected) {
      continue;
    }

    eligible[index] = selected;
    eligible[swapIndex] = current;
  }

  return eligible.slice(0, choiceCount);
}

export class ProgressionSystem {
  readonly combatStats: CombatStats = createCombatStats();

  private readonly upgradeLevels: Record<UpgradeId, number> = {
    damage: 0,
    fireRate: 0,
    projectileCount: 0,
    range: 0,
    speed: 0,
    health: 0,
    secondary: 0,
    torpedo: 0,
    missile: 0,
    armor: 0,
    repair: 0,
    magnet: 0,
    experience: 0,
  };

  private currentOffers: UpgradeOffer[] = [];
  private currentOfferIds = new Set<UpgradeId>();
  private level = 1;
  private experience = 0;
  private experienceToNext: number;
  private pendingLevelUps = 0;

  constructor(
    private readonly player: PlayerShip,
    private readonly random: RandomSource = Math.random,
  ) {
    this.experienceToNext = GAME_CONFIG.progression.baseExperience;
    this.player.status.level = this.level;
  }

  get currentLevel(): number {
    return this.level;
  }

  get currentExperience(): number {
    return this.experience;
  }

  get experienceRequired(): number {
    return this.experienceToNext;
  }

  get hasPendingLevelUp(): boolean {
    return this.pendingLevelUps > 0;
  }

  addExperience(amount: number): number {
    if (amount <= 0) {
      return 0;
    }

    this.experience += amount;
    let gainedLevels = 0;

    while (this.experience >= this.experienceToNext) {
      this.experience -= this.experienceToNext;
      this.level += 1;
      gainedLevels += 1;
      this.pendingLevelUps += 1;
      this.experienceToNext =
        GAME_CONFIG.progression.baseExperience +
        (this.level - 1) * GAME_CONFIG.progression.experienceGrowth;
    }

    if (gainedLevels > 0) {
      this.player.status.level = this.level;
    }

    return gainedLevels;
  }

  beginUpgradeSelection(): UpgradeOffer[] {
    if (this.pendingLevelUps <= 0) {
      return [];
    }

    if (this.currentOffers.length > 0) {
      return this.currentOffers;
    }

    const choices = selectUpgradeChoices(
      UPGRADE_DEFINITIONS,
      this.upgradeLevels,
      GAME_CONFIG.progression.upgradeChoiceCount,
      this.random,
    );

    this.currentOffers = choices.map((definition) => ({
      id: definition.id,
      title: definition.title,
      tag: definition.tag,
      description: definition.getDescription(
        this.combatStats,
        this.player,
      ),
      nextLevel: this.upgradeLevels[definition.id] + 1,
      maxLevel: definition.maxLevel,
    }));
    this.currentOfferIds = new Set(this.currentOffers.map((offer) => offer.id));

    return this.currentOffers;
  }

  applyUpgrade(id: UpgradeId): boolean {
    if (!this.currentOfferIds.has(id)) {
      return false;
    }

    const definition = UPGRADE_DEFINITIONS.find(
      (candidate) => candidate.id === id,
    );
    if (!definition) {
      return false;
    }

    if (this.upgradeLevels[id] >= definition.maxLevel) {
      return false;
    }

    definition.apply({
      stats: this.combatStats,
      player: this.player,
    });
    this.upgradeLevels[id] += 1;
    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
    this.currentOffers = [];
    this.currentOfferIds.clear();
    return true;
  }

  getUpgradeLevel(id: UpgradeId): number {
    return this.upgradeLevels[id];
  }
}
