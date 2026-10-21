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

/** Upgrades that install a weapon instead of improving one. */
const WEAPON_UNLOCK_IDS: readonly UpgradeId[] = [
  'secondary',
  'torpedo',
  'missile',
];

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
      // Levelling is the only renewable source of hull repair in a run that
      // has no health pickups. Without it a long run is a one-way slide into
      // zero no matter how well the player plays.
      const heal = Math.round(
        this.player.status.maxHealth *
          GAME_CONFIG.progression.levelUpHealRatio *
          gainedLevels,
      );
      this.player.status.health = Math.min(
        this.player.status.maxHealth,
        this.player.status.health + heal,
      );
    }

    return gainedLevels;
  }

  /**
   * Grants a level-up that did not come from experience: sidebar re-visit or a
   * rewarded video. Keeps the level curve and the level-up heal consistent with
   * a normal level so the reward cannot be told apart from real progress.
   */
  grantBonusLevelUp(): void {
    this.level += 1;
    this.pendingLevelUps += 1;
    this.experienceToNext =
      GAME_CONFIG.progression.baseExperience +
      (this.level - 1) * GAME_CONFIG.progression.experienceGrowth;
    this.player.status.level = this.level;

    const heal = Math.round(
      this.player.status.maxHealth *
        GAME_CONFIG.progression.levelUpHealRatio,
    );
    this.player.status.health = Math.min(
      this.player.status.maxHealth,
      this.player.status.health + heal,
    );
  }

  beginUpgradeSelection(): UpgradeOffer[] {
    if (this.pendingLevelUps <= 0) {
      return [];
    }

    if (this.currentOffers.length > 0) {
      return this.currentOffers;
    }

    const choices = this.pickDefinitions(UPGRADE_DEFINITIONS);

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

  /**
   * Shows the weapon unlocks early: while a weapon is still at level 0 there
   * is a configured chance that one card is that weapon, so a run does not
   * spend its first levels firing the main gun alone. The very first level-up
   * of a run always offers one, since the main gun alone kills too slowly.
   */
  private pickDefinitions(
    definitions: readonly UpgradeDefinition[],
  ): UpgradeDefinition[] {
    const count = GAME_CONFIG.progression.upgradeChoiceCount;
    const lockedWeapons = definitions.filter(
      (definition) =>
        WEAPON_UNLOCK_IDS.includes(definition.id) &&
        this.upgradeLevels[definition.id] === 0,
    );
    const installedWeapons = WEAPON_UNLOCK_IDS.filter(
      (id) => this.upgradeLevels[id] > 0,
    ).length;

    const forced: UpgradeDefinition[] = [];
    const forceUnlock =
      installedWeapons === 0 ||
      this.random() < GAME_CONFIG.progression.weaponUnlockOfferChance;

    if (lockedWeapons.length > 0 && forceUnlock) {
      const index = Math.min(
        lockedWeapons.length - 1,
        Math.floor(this.random() * lockedWeapons.length),
      );
      const picked = lockedWeapons[index];
      if (picked) {
        forced.push(picked);
      }
    }

    const forcedIds = new Set(forced.map((definition) => definition.id));
    const rest = selectUpgradeChoices(
      definitions.filter((definition) => !forcedIds.has(definition.id)),
      this.upgradeLevels,
      count - forced.length,
      this.random,
    );

    return [...forced, ...rest];
  }
}
