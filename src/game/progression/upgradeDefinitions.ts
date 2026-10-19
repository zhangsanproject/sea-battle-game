import type { UpgradeDefinition } from './types';

const DAMAGE_STEP = 4;
const FIRE_INTERVAL_FACTOR = 0.88;
const MIN_FIRE_INTERVAL = 0.25;
const PROJECTILE_STEP = 1;
const RANGE_STEP = 4;
const SPEED_STEP = 1.2;
const HEALTH_STEP = 20;
const REPAIR_ON_KILL_STEP = 4;
const MAGNET_STEP = 2;
const EXPERIENCE_STEP = 0.12;

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
  {
    id: 'secondary',
    title: '副炮阵列',
    tag: '火力',
    maxLevel: 3,
    getDescription: (stats) =>
      `两舷副炮自动开火（当前 Lv.${stats.secondaryLevel}），威力与射速提升`,
    apply: ({ stats }) => {
      stats.secondaryLevel += 1;
    },
  },
  {
    id: 'torpedo',
    title: '鱼雷发射器',
    tag: '火力',
    maxLevel: 3,
    getDescription: (stats) =>
      stats.torpedoLevel === 0
        ? '解锁鱼雷发射器：慢速、高伤害的重型鱼雷'
        : `鱼雷伤害与装填速度提升（Lv.${stats.torpedoLevel} → Lv.${stats.torpedoLevel + 1}）`,
    apply: ({ stats }) => {
      stats.torpedoLevel += 1;
    },
  },
  {
    id: 'armor',
    title: '复合装甲',
    tag: '防御',
    maxLevel: 3,
    getDescription: (_stats, player) =>
      `装甲 ${player.armor} → ${player.armor + 1}，降低所有来源的伤害`,
    apply: ({ player }) => {
      player.armor += 1;
    },
  },
  {
    id: 'repair',
    title: '应急维修',
    tag: '生存',
    maxLevel: 3,
    getDescription: (stats) =>
      `击沉敌舰恢复 ${REPAIR_ON_KILL_STEP} 点耐久（当前每艘 +${stats.repairOnKill}）`,
    apply: ({ stats }) => {
      stats.repairOnKill += REPAIR_ON_KILL_STEP;
    },
  },
  {
    id: 'magnet',
    title: '磁性回收',
    tag: '辅助',
    maxLevel: 3,
    getDescription: (stats) =>
      `经验吸附范围 +${MAGNET_STEP}（当前额外 +${stats.magnetRadiusBonus}）`,
    apply: ({ stats }) => {
      stats.magnetRadiusBonus += MAGNET_STEP;
    },
  },
  {
    id: 'experience',
    title: '战斗记录分析',
    tag: '辅助',
    maxLevel: 3,
    getDescription: (stats) =>
      `经验获取 +${Math.round(EXPERIENCE_STEP * 100)}%（当前 +${Math.round((stats.experienceMultiplier - 1) * 100)}%）`,
    apply: ({ stats }) => {
      stats.experienceMultiplier += EXPERIENCE_STEP;
    },
  },
];
