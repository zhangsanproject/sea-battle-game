import type { PlayerStatus } from '../game/entities/PlayerShip';
import type { UpgradeId, UpgradeOffer } from '../game/progression/types';
import type { GameHud, GameOverStats, SoundControls } from './GameHud';

export class HUD implements GameHud {
  private readonly root: HTMLElement;
  private readonly levelValue: HTMLElement;
  private readonly healthValue: HTMLElement;
  private readonly maxHealthValue: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly healthTrack: HTMLElement;
  private readonly killToast: HTMLElement;
  private readonly experiencePanel: HTMLElement;
  private readonly experienceText: HTMLElement;
  private readonly experienceFill: HTMLElement;
  private readonly experienceTrack: HTMLElement;
  private readonly dangerValue: HTMLElement;
  private readonly damageFlash: HTMLElement;
  private readonly gameOver: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly resultTime: HTMLElement;
  private readonly resultKills: HTMLElement;
  private readonly resultLevel: HTMLElement;
  private readonly resultBossKills: HTMLElement;
  private readonly resultDamage: HTMLElement;
  private readonly resultAccuracy: HTMLElement;
  private readonly resultStreak: HTMLElement;
  private readonly resultBest: HTMLElement;
  private readonly resultRecord: HTMLElement;
  private readonly bossPanel: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bossTrack: HTMLElement;
  private readonly bossWarning: HTMLElement;
  private readonly soundButton: HTMLButtonElement;
  private readonly soundControls: SoundControls | null;
  private readonly levelUp: HTMLElement;
  private readonly levelUpLevel: HTMLElement;
  private readonly upgradeOptions: HTMLElement;
  private readonly onRestart: () => void;
  private upgradeSelectionHandler: ((id: UpgradeId) => void) | null = null;
  private upgradeChoicePending = false;
  private lastExperience = -1;
  private lastBossRatio = -1;
  private disposed = false;
  private restartPending = false;

  constructor(
    root: HTMLElement,
    onRestart: () => void,
    soundControls?: SoundControls,
  ) {
    this.root = root;
    this.onRestart = onRestart;
    this.soundControls = soundControls ?? null;

    this.root.innerHTML = `
      <section class="hud" aria-label="战船状态">
        <header class="hud__brand">
          <p class="hud__kicker">SEA OVERLORD · 原型海域</p>
          <h1 class="hud__title">海战霸主</h1>
          <div class="hud__brand-rule" aria-hidden="true"></div>
        </header>

        <div class="hud__level" aria-label="战船等级">
          <span class="hud__level-label">LEVEL</span>
          <strong class="hud__level-value" data-level>1</strong>
        </div>

        <button
          class="hud__sound"
          type="button"
          data-sound-toggle
          aria-pressed="true"
          aria-label="切换音效"
        >
          音效 开
        </button>

        <div class="hud__experience" data-experience-panel aria-label="经验值">
          <div class="hud__experience-heading">
            <span class="hud__experience-label">EXP</span>
            <span class="hud__experience-text" data-experience-text>0 / 30</span>
          </div>
          <div
            class="hud__experience-track"
            data-experience-track
            role="progressbar"
            aria-label="经验值"
            aria-valuemin="0"
            aria-valuemax="30"
            aria-valuenow="0"
          >
            <div class="hud__experience-fill" data-experience-fill></div>
          </div>
        </div>

        <div
          class="hud__toast"
          data-kill-toast
          role="status"
          aria-live="polite"
        ></div>

        <p class="hud__hint" aria-hidden="true">
          WASD / 方向键移动
          <span class="hud__hint-divider">·</span>
          主炮 / 副炮 / 鱼雷 / 导弹自动开火
        </p>

        <section class="hud__status" aria-label="战船生命值">
          <div class="hud__status-heading">
            <span class="hud__status-label">船体耐久</span>
            <span class="hud__status-number">
              <span data-health>100</span><span class="hud__status-divider">/</span><span data-max-health>100</span>
            </span>
          </div>
          <div
            class="hud__health-track"
            data-health-track
            role="progressbar"
            aria-label="船体耐久"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="100"
          >
            <div class="hud__health-fill" data-health-fill></div>
            <div class="hud__health-ticks" aria-hidden="true"></div>
          </div>
          <div class="hud__meta">
            <span>旗舰 · 曙光号</span>
            <span>危险度 <span class="hud__danger-value" data-danger>1</span></span>
          </div>
        </section>

        <div class="hud__damage-flash" data-damage-flash aria-hidden="true"></div>
        <div class="hud__critical" data-critical aria-hidden="true"></div>

        <div class="hud__boss" data-boss hidden>
          <div class="hud__boss-heading">
            <span class="hud__boss-mark">BOSS</span>
            <strong class="hud__boss-name" data-boss-name>深海霸主</strong>
          </div>
          <div
            class="hud__boss-track"
            data-boss-track
            role="progressbar"
            aria-label="Boss 生命值"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="100"
          >
            <div class="hud__boss-fill" data-boss-fill></div>
          </div>
          <div class="hud__boss-warning" data-boss-warning hidden>
            ⚠ 重炮锁定 · 立即规避
          </div>
        </div>

        <div class="hud__gameover" data-gameover hidden>
          <div
            class="hud__gameover-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gameover-title"
          >
            <p class="hud__gameover-kicker">FLAGSHIP LOST</p>
            <h2 class="hud__gameover-title" id="gameover-title">旗舰战沉</h2>
            <p class="hud__gameover-subtitle">海域 01 · 战斗结束</p>
            <p class="hud__gameover-record" data-result-record hidden>
              ★ 新纪录
            </p>
            <dl class="hud__gameover-stats">
              <div>
                <dt>存活时间</dt>
                <dd data-result-time>00:00</dd>
              </div>
              <div>
                <dt>击沉敌舰</dt>
                <dd data-result-kills>0</dd>
              </div>
              <div>
                <dt>最高等级</dt>
                <dd data-result-level>1</dd>
              </div>
              <div>
                <dt>Boss 击杀</dt>
                <dd data-result-boss-kills>0</dd>
              </div>
              <div>
                <dt>总伤害</dt>
                <dd data-result-damage>0</dd>
              </div>
              <div>
                <dt>命中率</dt>
                <dd data-result-accuracy>—</dd>
              </div>
              <div>
                <dt>最高连击</dt>
                <dd data-result-streak>0</dd>
              </div>
              <div>
                <dt>历史最佳</dt>
                <dd data-result-best>0 舰</dd>
              </div>
            </dl>
            <button class="hud__restart" type="button" data-restart>
              重新起航
            </button>
          </div>
        </div>

        <div class="hud__levelup" data-levelup hidden>
          <section
            class="hud__levelup-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="levelup-title"
          >
            <p class="hud__gameover-kicker">LEVEL UP</p>
            <h2 class="hud__levelup-title" id="levelup-title">选择强化</h2>
            <p class="hud__levelup-subtitle">
              战斗暂停 · 等级 <span data-levelup-level>2</span> · 选择一项继续
            </p>
            <div class="hud__upgrade-options" data-upgrade-options></div>
          </section>
        </div>
      </section>
    `;

    this.levelValue = this.query('[data-level]');
    this.healthValue = this.query('[data-health]');
    this.maxHealthValue = this.query('[data-max-health]');
    this.healthFill = this.query('[data-health-fill]');
    this.healthTrack = this.query('[data-health-track]');
    this.killToast = this.query('[data-kill-toast]');
    this.experiencePanel = this.query('[data-experience-panel]');
    this.experienceText = this.query('[data-experience-text]');
    this.experienceFill = this.query('[data-experience-fill]');
    this.experienceTrack = this.query('[data-experience-track]');
    this.dangerValue = this.query('[data-danger]');
    this.damageFlash = this.query('[data-damage-flash]');
    this.gameOver = this.query('[data-gameover]');
    this.restartButton = this.query<HTMLButtonElement>('[data-restart]');
    this.resultTime = this.query('[data-result-time]');
    this.resultKills = this.query('[data-result-kills]');
    this.resultLevel = this.query('[data-result-level]');
    this.resultBossKills = this.query('[data-result-boss-kills]');
    this.resultDamage = this.query('[data-result-damage]');
    this.resultAccuracy = this.query('[data-result-accuracy]');
    this.resultStreak = this.query('[data-result-streak]');
    this.resultBest = this.query('[data-result-best]');
    this.resultRecord = this.query('[data-result-record]');
    this.bossPanel = this.query('[data-boss]');
    this.bossName = this.query('[data-boss-name]');
    this.bossFill = this.query('[data-boss-fill]');
    this.bossTrack = this.query('[data-boss-track]');
    this.bossWarning = this.query('[data-boss-warning]');
    this.soundButton = this.query<HTMLButtonElement>('[data-sound-toggle]');
    this.levelUp = this.query('[data-levelup]');
    this.levelUpLevel = this.query('[data-levelup-level]');
    this.upgradeOptions = this.query('[data-upgrade-options]');

    this.restartButton.addEventListener('click', this.handleRestartClick);
    this.upgradeOptions.addEventListener('click', this.handleUpgradeClick);

    if (this.soundControls) {
      this.updateSoundButton(this.soundControls.enabled);
      this.soundButton.addEventListener('click', this.handleSoundToggle);
    } else {
      this.soundButton.hidden = true;
    }
  }

  update(status: PlayerStatus): void {
    const maxHealth = Math.max(1, status.maxHealth);
    const health = Math.min(Math.max(status.health, 0), maxHealth);
    const healthRatio = health / maxHealth;

    this.levelValue.textContent = String(status.level);
    this.healthValue.textContent = String(Math.ceil(health));
    this.maxHealthValue.textContent = String(Math.ceil(maxHealth));
    this.healthFill.style.transform = `scaleX(${healthRatio})`;
    this.healthTrack.setAttribute('aria-valuenow', String(Math.round(health)));
    this.healthTrack.setAttribute('aria-valuemax', String(Math.round(maxHealth)));
    this.healthTrack.classList.toggle('is-low', healthRatio <= 0.3);
    this.root.classList.toggle('is-critical', healthRatio <= 0.3);
  }

  setExperience(current: number, required: number): void {
    const safeRequired = Math.max(1, required);
    const safeCurrent = Math.min(Math.max(0, current), safeRequired);
    const ratio = safeCurrent / safeRequired;
    const valueChanged = Math.floor(safeCurrent) !== this.lastExperience;

    this.experienceText.textContent = `${Math.floor(safeCurrent)} / ${Math.floor(safeRequired)}`;
    this.experienceFill.style.transform = `scaleX(${ratio})`;
    this.experienceTrack.setAttribute(
      'aria-valuenow',
      String(Math.floor(safeCurrent)),
    );
    this.experienceTrack.setAttribute(
      'aria-valuemax',
      String(Math.floor(safeRequired)),
    );

    if (valueChanged && this.lastExperience >= 0) {
      this.experiencePanel.classList.remove('is-gaining');
      void this.experiencePanel.offsetWidth;
      this.experiencePanel.classList.add('is-gaining');
    }

    this.lastExperience = Math.floor(safeCurrent);
  }

  setDangerTier(tier: number): void {
    this.dangerValue.textContent = String(Math.max(1, Math.floor(tier)));
  }

  setBossHealth(name: string, ratio: number): void {
    const safeRatio = Math.min(Math.max(ratio, 0), 1);

    if (this.bossPanel.hidden) {
      this.bossPanel.hidden = false;
    }

    if (this.bossName.textContent !== name) {
      this.bossName.textContent = name;
    }

    if (this.lastBossRatio !== safeRatio) {
      this.bossFill.style.transform = `scaleX(${safeRatio})`;
      this.bossTrack.setAttribute(
        'aria-valuenow',
        String(Math.round(safeRatio * 100)),
      );
      this.lastBossRatio = safeRatio;
    }
  }

  hideBossHealth(): void {
    if (!this.bossPanel.hidden) {
      this.bossPanel.hidden = true;
    }
    if (!this.bossWarning.hidden) {
      this.bossWarning.hidden = true;
      this.bossWarning.classList.remove('is-active');
    }
    this.lastBossRatio = -1;
  }

  setBossWarning(active: boolean): void {
    if (this.bossPanel.hidden) {
      return;
    }

    this.bossWarning.hidden = !active;
    this.bossWarning.classList.toggle('is-active', active);
  }

  showDamageFeedback(): void {
    this.damageFlash.classList.remove('is-visible');
    void this.damageFlash.offsetWidth;
    this.damageFlash.classList.add('is-visible');
  }

  showKillFeedback(message = '敌舰击沉'): void {
    this.killToast.textContent = message;
    this.killToast.classList.remove('is-visible');
    // Restart the CSS animation when kills happen in quick succession.
    void this.killToast.offsetWidth;
    this.killToast.classList.add('is-visible');
  }

  showUpgradeChoices(
    offers: readonly UpgradeOffer[],
    level: number,
    onSelect: (id: UpgradeId) => void,
  ): void {
    if (this.disposed) {
      return;
    }

    this.upgradeChoicePending = false;
    this.upgradeSelectionHandler = onSelect;
    this.levelUpLevel.textContent = String(level);
    this.upgradeOptions.replaceChildren();

    offers.forEach((offer, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hud__upgrade-card';
      button.dataset.upgradeId = offer.id;

      const number = document.createElement('span');
      number.className = 'hud__upgrade-number';
      number.textContent = String(index + 1).padStart(2, '0');

      const tag = document.createElement('span');
      tag.className = 'hud__upgrade-tag';
      tag.textContent = offer.tag;

      const title = document.createElement('strong');
      title.className = 'hud__upgrade-title';
      title.textContent = offer.title;

      const levelText = document.createElement('span');
      levelText.className = 'hud__upgrade-level';
      levelText.textContent = `强化 ${offer.nextLevel} / ${offer.maxLevel}`;

      const description = document.createElement('span');
      description.className = 'hud__upgrade-description';
      description.textContent = offer.description;

      const action = document.createElement('span');
      action.className = 'hud__upgrade-action';
      action.textContent = '选择此项';

      button.append(number, tag, title, levelText, description, action);
      this.upgradeOptions.append(button);
    });

    this.levelUp.hidden = false;

    requestAnimationFrame(() => {
      if (this.disposed) {
        return;
      }
      const firstCard =
        this.upgradeOptions.querySelector<HTMLButtonElement>(
          '.hud__upgrade-card',
        );
      firstCard?.focus({ preventScroll: true });
    });
  }

  hideUpgradeChoices(): void {
    this.levelUp.hidden = true;
    this.upgradeOptions.replaceChildren();
    this.upgradeSelectionHandler = null;
    this.upgradeChoicePending = false;
  }

  render(_deltaTime: number): void {}

  showGameOver(stats: GameOverStats): void {
    if (this.disposed) {
      return;
    }

    this.resultTime.textContent = this.formatDuration(stats.survivalSeconds);
    this.resultKills.textContent = String(stats.kills);
    this.resultLevel.textContent = String(stats.level);
    this.resultBossKills.textContent = String(stats.bossKills);
    this.resultDamage.textContent =
      stats.damageDealt === undefined ? '—' : String(stats.damageDealt);
    this.resultAccuracy.textContent =
      stats.accuracy === undefined || stats.accuracy <= 0
        ? '—'
        : `${Math.round(stats.accuracy * 100)}%`;
    this.resultStreak.textContent =
      stats.bestStreak === undefined ? '—' : String(stats.bestStreak);
    this.resultBest.textContent =
      stats.bestKills === undefined ? '—' : `${stats.bestKills} 舰`;
    this.resultRecord.hidden = !stats.isNewRecord;
    this.gameOver.hidden = false;
    requestAnimationFrame(() => {
      if (!this.disposed) {
        this.restartButton.focus({ preventScroll: true });
      }
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.restartButton.removeEventListener('click', this.handleRestartClick);
    this.upgradeOptions.removeEventListener('click', this.handleUpgradeClick);
    this.soundButton.removeEventListener('click', this.handleSoundToggle);
    this.root.classList.remove('is-critical');
    this.root.replaceChildren();
  }

  private readonly handleSoundToggle = (): void => {
    if (!this.soundControls) {
      return;
    }

    this.updateSoundButton(this.soundControls.toggle());
  };

  private updateSoundButton(enabled: boolean): void {
    this.soundButton.textContent = enabled ? '音效 开' : '音效 关';
    this.soundButton.setAttribute('aria-pressed', String(enabled));
    this.soundButton.classList.toggle('is-muted', !enabled);
  }

  private readonly handleUpgradeClick = (event: MouseEvent): void => {
    if (this.upgradeChoicePending || !this.upgradeSelectionHandler) {
      return;
    }

    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-upgrade-id]')
        : null;
    const id = target?.dataset.upgradeId as UpgradeId | undefined;

    if (!id) {
      return;
    }

    this.upgradeChoicePending = true;
    for (const card of this.upgradeOptions.querySelectorAll('button')) {
      card.disabled = true;
    }

    const handler = this.upgradeSelectionHandler;
    this.upgradeSelectionHandler = null;
    handler(id);
  };

  private readonly handleRestartClick = (): void => {
    if (this.restartPending) {
      return;
    }
    this.restartPending = true;
    this.restartButton.disabled = true;
    this.onRestart();
  };

  private formatDuration(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  private query<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`HUD element not found: ${selector}`);
    }
    return element;
  }
}
