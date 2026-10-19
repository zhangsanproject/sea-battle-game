import type { UpgradeDefinition } from './types';

const DAMAGE_STEP = 4;
const FIRE_INTERVAL_FACTOR = 0.88;
const MIN_FIRE_INTERVAL = 0.25;
const PROJECTILE_STEP = 1;
const RANGE_STEP = 4;
const SPEED_STEP = 1.2;
const HEALTH_STEP = 20;

export const UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  {
    id: 'damage',
    title: '强化弹头',
    tag: '火力',
    maxLevel: 5,
    getDescription: (stats) =>
      `主炮伤害 ${stats.weaponDamage} → ${stats.weaponDamage + DAMAGE_STEP}`,
    apply: ({ stats }) => {
      stats.weaponDamage += DAMAGE_STEP;
    },
  },
  {
    id: 'fireRate',
    title: '快速装填',
    tag: '火力',
    maxLevel: 5,
    getDescription: (stats) => {
      const nextInterval = Math.max(
        MIN_FIRE_INTERVAL,
        stats.fireInterval * FIRE_INTERVAL_FACTOR,
      );
      return `射击间隔 ${stats.fireInterval.toFixed(2)}s → ${nextInterval.toFixed(2)}s`;
    },
    apply: ({ stats }) => {
      stats.fireInterval = Math.max(
        MIN_FIRE_INTERVAL,
        stats.fireInterval * FIRE_INTERVAL_FACTOR,
      );
    },
  },
  {
    id: 'projectileCount',
    title: '多联炮击',
    tag: '火力',
    maxLevel: 3,
    getDescription: (stats) =>
      `每轮齐射 ${stats.projectileCount} → ${stats.projectileCount + PROJECTILE_STEP} 发`,
    apply: ({ stats }) => {
      stats.projectileCount += PROJECTILE_STEP;
    },
  },
  {
    id: 'range',
    title: '远程校准',
    tag: '射控',
    maxLevel: 4,
    getDescription: (stats) =>
      `主炮射程 ${Math.round(stats.weaponRange)} → ${Math.round(stats.weaponRange + RANGE_STEP)}`,
    apply: ({ stats }) => {
      stats.weaponRange += RANGE_STEP;
    },
  },
  {
    id: 'speed',
    title: '轮机增压',
    tag: '机动',
    maxLevel: 4,
    getDescription: (stats) =>
      `航速 ${stats.moveSpeed.toFixed(1)} → ${(stats.moveSpeed + SPEED_STEP).toFixed(1)}`,
    apply: ({ stats }) => {
      stats.moveSpeed += SPEED_STEP;
    },
  },
  {
    id: 'health',
    title: '船体加固',
    tag: '生存',
    maxLevel: 4,
    getDescription: (_stats, player) =>
      `耐久上限 ${player.status.maxHealth} → ${player.status.maxHealth + HEALTH_STEP}，并恢复 ${HEALTH_STEP}`,
    apply: ({ player }) => {
      player.status.maxHealth += HEALTH_STEP;
      player.status.health = Math.min(
        player.status.maxHealth,
        player.status.health + HEALTH_STEP,
      );
    },
  },
];
