import { Vector2, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import { GAME_CONFIG } from '../game/config';
import type { PlayerStatus } from '../game/entities/PlayerShip';
import type { UpgradeId, UpgradeOffer } from '../game/progression/types';
import type {
  GameCapabilities,
  InputSource,
} from '../platform/PlatformAdapter';
import type {
  GameHud,
  GameOverStats,
  SoundControls,
} from '../ui/GameHud';
import {
  getTtRuntime,
  type TtRuntime,
  type TtTouch,
  type TtTouchEvent,
} from './runtime';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Owned by the platform, so the button and a phone call share one path. */
export interface PauseControls {
  isPaused(): boolean;
  toggle(): boolean;
}

export interface MiniGameUiOptions {
  sceneCanvas: HTMLCanvasElement;
  soundControls: SoundControls;
  pauseControls?: PauseControls;
  onRestart: () => void;
  /** Called once on the first touch; used to unlock the audio context. */
  onFirstTouch?: () => void;
  /** Extra line under the compliance notice, e.g. the operator name. */
  operatorLine?: string;
  /**
   * Open-platform entry points (sidebar, shortcut, subscribe, ads). Optional:
   * when absent every related button is hidden, which is what the web build and
   * older hosts get.
   */
  capabilities?: GameCapabilities;
  /** Called when the player taps the rewarded-video button. */
  onRewardedAd?: () => void;
}

type CapabilityAction = 'sidebar' | 'shortcut' | 'subscribe' | 'rewarded';

interface CapabilityButton {
  action: CapabilityAction;
  label: string;
}

interface DamageNumber {
  x: number;
  y: number;
  driftY: number;
  life: number;
  ttl: number;
  amount: number;
  critical: boolean;
}

const FONT_FAMILY =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const GOLD = '#e6c47a';
const GOLD_BRIGHT = '#ffe2a1';
const TEXT = '#d9edf1';
const MUTED = 'rgba(203, 231, 236, 0.62)';
const PANEL = 'rgba(4, 22, 31, 0.72)';
const DANGER = '#ff7052';
const MAX_DAMAGE_NUMBERS = 24;

/** Standard four-line health advisory required on the launch screen. */
const HEALTH_ADVISORY = [
  '抵制不良游戏，拒绝盗版游戏。',
  '注意自我保护，谨防受骗上当。',
  '适度游戏益脑，沉迷游戏伤身。',
  '合理安排时间，享受健康生活。',
];

const AGE_NOTICE = '适龄提示：本游戏适合 12 周岁以上用户。';

const PRIVACY_SECTIONS: Array<[string, string]> = [
  [
    '我们不收集什么',
    '本游戏不需要登录，也不收集姓名、手机号、身份证号、通讯录、位置等个人信息。',
  ],
  [
    '保存在设备本地的数据',
    '音效开关，以及战绩记录（最高击沉数、最长存活时间、最高等级、总对局数）。这些数据只存在本机，不会上传。',
  ],
  [
    '运行时会读取的信息',
    '屏幕尺寸、像素比与安全区，仅用于界面适配与画质调节，不用于识别你的身份。',
  ],
  [
    '第三方共享',
    '不接入广告或统计 SDK，不与任何第三方共享数据。',
  ],
  [
    '如何清除',
    '在抖音「我 - 设置 - 清除缓存」中清理小游戏数据，即可删除上述本地记录。',
  ],
];

/**
 * Canvas HUD and touch input for the Douyin mini-game build.
 * The 3D scene renders into an offscreen canvas and is composited underneath
 * these 2D overlays each frame.
 */
export class MiniGameUi implements GameHud, InputSource {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;

  private readonly canvas: HTMLCanvasElement;
  private readonly sceneCanvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly runtime: TtRuntime | null;
  private readonly soundControls: SoundControls;
  private readonly pauseControls: PauseControls | null;
  private readonly onRestart: () => void;
  private readonly capabilities: GameCapabilities | null;
  private readonly onRewardedAd: (() => void) | null;
  private readonly onFirstTouch: (() => void) | null;
  private readonly operatorLine: string | null;
  private readonly safeTop: number;
  private readonly safeBottom: number;
  private readonly defaultJoystickX: number;
  private readonly defaultJoystickY: number;
  private readonly joystickRadius = 54;
  private readonly joystickValue = new Vector2();

  private health = 1;
  private maxHealth = 1;
  private level = 1;
  private experience = 0;
  private experienceRequired = 1;
  private dangerTier = 1;
  private bossName = '';
  private bossRatio: number | null = null;
  private bossWarning = false;
  private toastText = '';
  private toastTime = 0;
  private damageFlashTime = 0;
  private soundEnabled: boolean;
  private firstTouchHandled = false;

  private upgradeOffers: readonly UpgradeOffer[] = [];
  private upgradeLevel = 1;
  private upgradeHandler: ((id: UpgradeId) => void) | null = null;
  private upgradePending = false;
  private upgradeCardRects: Rect[] = [];
  private gameOverStats: GameOverStats | null = null;
  private restartRect: Rect | null = null;
  private capabilityRects: Array<{ rect: Rect; action: CapabilityAction }> = [];
  private interstitialTimer: ReturnType<typeof setTimeout> | null = null;
  private soundRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private pauseRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private pauseResumeRect: Rect = { x: 0, y: 0, width: 0, height: 0 };

  private camera: PerspectiveCamera | null = null;
  private readonly projected = new Vector3();
  private damageNumbers: DamageNumber[] = [];

  private noticeActive = false;
  private noticePrivacyOpen = false;
  private noticeStartHandler: (() => void) | null = null;
  private noticeFrame: number | null = null;
  private noticeStartRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private noticePrivacyRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private noticeBackRect: Rect = { x: 0, y: 0, width: 0, height: 0 };

  private inputEnabled = true;
  private activeTouchId: number | null = null;
  private joystickBaseX = 0;
  private joystickBaseY = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, options: MiniGameUiOptions) {
    this.canvas = canvas;
    this.sceneCanvas = options.sceneCanvas;
    this.soundControls = options.soundControls;
    this.pauseControls = options.pauseControls ?? null;
    this.onRestart = options.onRestart;
    this.capabilities = options.capabilities ?? null;
    this.onRewardedAd = options.onRewardedAd ?? null;
    this.onFirstTouch = options.onFirstTouch ?? null;
    this.operatorLine = options.operatorLine ?? null;
    this.runtime = getTtRuntime();
    this.soundEnabled = options.soundControls.enabled;

    const info = this.runtime?.getSystemInfoSync();
    this.width = info?.screenWidth ?? 375;
    this.height = info?.screenHeight ?? 667;
    // The 2D layer is cheap to rasterise and it carries every number the
    // player actually reads, so it follows the real device ratio. Capping at
    // 2x left the whole canvas upscaled on 3x panels, which blurred the 3D
    // composite along with the text.
    this.pixelRatio = Math.min(info?.pixelRatio ?? 2, 3);

    const safeArea = info?.safeArea;
    this.safeTop = safeArea?.top ?? 0;
    this.safeBottom = safeArea
      ? Math.max(0, this.height - safeArea.bottom)
      : 0;

    this.defaultJoystickX = this.safeLeft + 28 + this.joystickRadius;
    this.defaultJoystickY =
      this.height - this.safeBottom - 40 - this.joystickRadius;

    this.canvas.width = Math.round(this.width * this.pixelRatio);
    this.canvas.height = Math.round(this.height * this.pixelRatio);

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('抖音小游戏 2D 画布创建失败');
    }
    this.context = context;
    this.context.setTransform(
      this.pixelRatio,
      0,
      0,
      this.pixelRatio,
      0,
      0,
    );

    this.runtime?.onTouchStart(this.handleTouchStart);
    this.runtime?.onTouchMove(this.handleTouchMove);
    this.runtime?.onTouchEnd(this.handleTouchEnd);
    this.runtime?.onTouchCancel(this.handleTouchCancel);
  }

  private get safeLeft(): number {
    return 0;
  }

  /** The floating damage text needs the live camera to project world space. */
  attachCamera(camera: PerspectiveCamera): void {
    this.camera = camera;
  }

  getMoveVector(out: Vector2): Vector2 {
    if (!this.inputEnabled || this.isPaused()) {
      return out.set(0, 0);
    }

    const magnitude = this.joystickValue.length();
    const deadzone = GAME_CONFIG.input.joystickDeadzone;

    if (magnitude <= deadzone) {
      return out.set(0, 0);
    }

    const scaled =
      Math.min((magnitude - deadzone) / (1 - deadzone), 1) / magnitude;
    return out.copy(this.joystickValue).multiplyScalar(scaled);
  }

  setEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;

    if (!enabled) {
      this.reset();
    }
  }

  reset(): void {
    this.activeTouchId = null;
    this.joystickValue.set(0, 0);
  }

  update(status: PlayerStatus): void {
    this.health = status.health;
    this.maxHealth = Math.max(1, status.maxHealth);
    this.level = status.level;
  }

  setExperience(current: number, required: number): void {
    this.experience = Math.max(0, current);
    this.experienceRequired = Math.max(1, required);
  }

  setDangerTier(tier: number): void {
    this.dangerTier = Math.max(1, Math.floor(tier));
  }

  setBossHealth(name: string, ratio: number): void {
    this.bossName = name;
    this.bossRatio = Math.min(Math.max(ratio, 0), 1);
  }

  hideBossHealth(): void {
    this.bossRatio = null;
    this.bossWarning = false;
  }

  setBossWarning(active: boolean): void {
    this.bossWarning = active;
  }

  showDamageFeedback(): void {
    this.damageFlashTime = 0.35;
  }

  showKillFeedback(message = '敌舰击沉'): void {
    this.toastText = message;
    this.toastTime = 1.25;
  }

  showDamageNumber(amount: number, x: number, y: number, z: number): void {
    const camera = this.camera;
    if (!camera || this.disposed) {
      return;
    }

    camera.updateMatrixWorld();
    this.projected.set(x, y, z).project(camera);

    // Behind the camera or past the far plane: nothing sensible to draw.
    if (this.projected.z > 1) {
      return;
    }

    const screenX = (this.projected.x * 0.5 + 0.5) * this.width;
    const screenY = (-this.projected.y * 0.5 + 0.5) * this.height;

    if (screenX < -40 || screenX > this.width + 40) {
      return;
    }

    if (this.damageNumbers.length >= MAX_DAMAGE_NUMBERS) {
      this.damageNumbers.shift();
    }

    this.damageNumbers.push({
      x: screenX + (Math.random() - 0.5) * 16,
      y: screenY,
      driftY: -40 - Math.random() * 16,
      life: 0.85,
      ttl: 0.85,
      amount: Math.max(1, Math.round(amount)),
      critical: amount >= 40,
    });
  }

  showUpgradeChoices(
    offers: readonly UpgradeOffer[],
    level: number,
    onSelect: (id: UpgradeId) => void,
  ): void {
    if (this.disposed) {
      return;
    }

    this.upgradeOffers = offers;
    this.upgradeLevel = level;
    this.upgradeHandler = onSelect;
    this.upgradePending = false;
    this.upgradeCardRects = [];
  }

  hideUpgradeChoices(): void {
    this.upgradeOffers = [];
    this.upgradeHandler = null;
    this.upgradePending = false;
    this.upgradeCardRects = [];
  }

  showGameOver(stats: GameOverStats): void {
    if (this.disposed) {
      return;
    }

    this.gameOverStats = stats;
    this.restartRect = null;
    this.capabilityRects = [];

    // Let the result panel land before an interstitial covers the screen.
    this.clearInterstitialTimer();
    this.interstitialTimer = setTimeout(() => {
      this.interstitialTimer = null;
      if (!this.disposed) {
        this.capabilities?.showInterstitialAd();
      }
    }, 1800);
  }

  /**
   * Draws the launch notice required before the game itself may start.
   * The caller starts the real game from the callback, which keeps the
   * compliance gate out of the game logic.
   */
  showComplianceNotice(onStart: () => void): void {
    if (this.disposed) {
      this.safeStart();
      return;
    }

    this.noticeActive = true;
    this.noticePrivacyOpen = false;
    this.noticeStartHandler = onStart;

    if (this.noticeFrame !== null) {
      return;
    }

    this.noticeLoop();
  }

  private safeStart(): void {
    const start = this.noticeStartHandler;
    this.noticeStartHandler = null;
    start?.();
  }

  private readonly noticeLoop = (): void => {
    if (this.disposed || !this.noticeActive) {
      this.noticeFrame = null;
      return;
    }

    this.drawComplianceNotice();

    const scheduler = globalThis as unknown as {
      requestAnimationFrame?: (callback: (time: number) => void) => number;
    };

    if (typeof scheduler.requestAnimationFrame !== 'function') {
      this.noticeFrame = null;
      return;
    }

    this.noticeFrame = scheduler.requestAnimationFrame(this.noticeLoop);
  };

  private dismissNotice(): void {
    this.noticeActive = false;
    this.noticePrivacyOpen = false;

    if (this.noticeFrame !== null) {
      const scheduler = globalThis as unknown as {
        cancelAnimationFrame?: (handle: number) => void;
      };
      scheduler.cancelAnimationFrame?.(this.noticeFrame);
      this.noticeFrame = null;
    }
  }

  private isPaused(): boolean {
    return this.pauseControls?.isPaused() ?? false;
  }

  render(deltaTime: number): void {
    if (this.disposed) {
      return;
    }

    if (this.noticeActive) {
      this.drawComplianceNotice();
      return;
    }

    const ctx = this.context;
    this.toastTime = Math.max(0, this.toastTime - deltaTime);
    this.damageFlashTime = Math.max(0, this.damageFlashTime - deltaTime);
    this.updateDamageNumbers(deltaTime);

    ctx.clearRect(0, 0, this.width, this.height);

    if (this.sceneCanvas.width > 0 && this.sceneCanvas.height > 0) {
      try {
        ctx.drawImage(this.sceneCanvas, 0, 0, this.width, this.height);
      } catch {
        ctx.fillStyle = '#0a2633';
        ctx.fillRect(0, 0, this.width, this.height);
      }
    }

    this.drawStatus();
    this.drawBoss();
    this.drawToast();
    this.drawCriticalVignette();
    this.drawDamageNumbers();

    if (this.damageFlashTime > 0) {
      ctx.fillStyle = `rgba(210, 42, 24, ${this.damageFlashTime * 0.5})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (this.inputEnabled && !this.upgradeHandler && !this.gameOverStats) {
      this.drawJoystick();
    }

    if (this.upgradeHandler) {
      this.drawUpgradeOverlay();
    }

    if (this.gameOverStats) {
      this.drawGameOverOverlay(this.gameOverStats);
    }

    if (this.isPaused()) {
      this.drawPauseOverlay();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.clearInterstitialTimer();
    this.dismissNotice();
    this.reset();
    this.damageNumbers = [];
    this.runtime?.offTouchStart?.(this.handleTouchStart);
    this.runtime?.offTouchMove?.(this.handleTouchMove);
    this.runtime?.offTouchEnd?.(this.handleTouchEnd);
    this.runtime?.offTouchCancel?.(this.handleTouchCancel);
  }

  private updateDamageNumbers(deltaTime: number): void {
    if (this.damageNumbers.length === 0) {
      return;
    }

    const remaining: DamageNumber[] = [];
    for (const entry of this.damageNumbers) {
      entry.life -= deltaTime;
      if (entry.life <= 0) {
        continue;
      }
      entry.y += entry.driftY * deltaTime;
      remaining.push(entry);
    }
    this.damageNumbers = remaining;
  }

  private drawDamageNumbers(): void {
    if (this.damageNumbers.length === 0) {
      return;
    }

    const ctx = this.context;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    for (const entry of this.damageNumbers) {
      const progress = Math.max(0, entry.life / entry.ttl);
      const pop = 1 + (1 - progress) * 0.25;
      const size = (entry.critical ? 21 : 16) * pop;

      ctx.globalAlpha = Math.min(1, progress * 1.6);
      ctx.shadowColor = 'rgba(0, 14, 20, 0.85)';
      ctx.shadowBlur = 8;
      this.text(
        String(entry.amount),
        entry.x,
        entry.y,
        size,
        entry.critical ? '#ffd166' : GOLD_BRIGHT,
        'bold',
      );
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  private drawCriticalVignette(): void {
    const ratio = this.health / this.maxHealth;
    if (ratio > 0.3 || this.gameOverStats || this.upgradeHandler) {
      return;
    }

    const ctx = this.context;
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const inner = Math.min(this.width, this.height) * 0.34;
    const outer = Math.max(this.width, this.height) * 0.78;
    const pulse = 0.3 + Math.sin(Date.now() / 260) * 0.14;

    const gradient = ctx.createRadialGradient(
      centerX,
      centerY,
      inner,
      centerX,
      centerY,
      outer,
    );
    gradient.addColorStop(0, 'rgba(160, 22, 12, 0)');
    gradient.addColorStop(1, `rgba(178, 26, 14, ${pulse.toFixed(3)})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.textAlign = 'center';
    this.text('船体严重受损', centerX, this.safeTop + 150, 12, DANGER, 'bold');
  }

  private drawStatus(): void {
    const ctx = this.context;
    const left = this.safeLeft + 16;
    const top = this.safeTop + 14;
    const panelWidth = Math.min(
      218,
      Math.max(150, this.width - 132),
    );
    const panelHeight = 82;

    this.fillRoundRect(left, top, panelWidth, panelHeight, 12, PANEL);
    this.strokeRoundRect(
      left,
      top,
      panelWidth,
      panelHeight,
      12,
      'rgba(226, 191, 120, 0.24)',
    );

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    this.text(`Lv.${this.level}`, left + 14, top + 22, 15, GOLD, 'bold');
    this.text('船体', left + 70, top + 22, 11, MUTED);

    ctx.textAlign = 'right';
    this.text(
      `${Math.ceil(this.health)} / ${Math.ceil(this.maxHealth)}`,
      left + panelWidth - 14,
      top + 22,
      11,
      TEXT,
    );

    const barWidth = panelWidth - 28;
    this.drawBar(
      left + 14,
      top + 31,
      barWidth,
      8,
      this.health / this.maxHealth,
      this.health / this.maxHealth <= 0.3 ? '#ff5b45' : '#e9a15f',
    );

    this.text('EXP', left + 14, top + 59, 10, MUTED);
    this.drawBar(
      left + 44,
      top + 52,
      barWidth - 30,
      6,
      this.experience / this.experienceRequired,
      '#67d9e8',
    );
    ctx.textAlign = 'right';
    this.text(
      `${Math.floor(this.experience)} / ${Math.floor(this.experienceRequired)}`,
      left + panelWidth - 14,
      top + 76,
      10,
      MUTED,
    );

    ctx.textAlign = 'right';
    this.text(
      `危险度 ${this.dangerTier}`,
      this.width - 16,
      top + 20,
      12,
      GOLD,
      'bold',
    );

    const buttonWidth = 74;
    const buttonHeight = 28;
    this.soundRect = {
      x: this.width - 16 - buttonWidth,
      y: top + 32,
      width: buttonWidth,
      height: buttonHeight,
    };
    this.fillRoundRect(
      this.soundRect.x,
      this.soundRect.y,
      buttonWidth,
      buttonHeight,
      14,
      'rgba(4, 22, 31, 0.66)',
    );
    this.strokeRoundRect(
      this.soundRect.x,
      this.soundRect.y,
      buttonWidth,
      buttonHeight,
      14,
      'rgba(226, 191, 120, 0.32)',
    );
    ctx.textAlign = 'center';
    this.text(
      this.soundEnabled ? '音效 开' : '音效 关',
      this.soundRect.x + buttonWidth / 2,
      this.soundRect.y + 18,
      11,
      this.soundEnabled ? TEXT : MUTED,
    );

    if (this.pauseControls) {
      const pauseWidth = 38;
      this.pauseRect = {
        x: this.soundRect.x - 8 - pauseWidth,
        y: this.soundRect.y,
        width: pauseWidth,
        height: buttonHeight,
      };
      this.fillRoundRect(
        this.pauseRect.x,
        this.pauseRect.y,
        pauseWidth,
        buttonHeight,
        14,
        'rgba(4, 22, 31, 0.66)',
      );
      this.strokeRoundRect(
        this.pauseRect.x,
        this.pauseRect.y,
        pauseWidth,
        buttonHeight,
        14,
        'rgba(226, 191, 120, 0.32)',
      );
      const iconY = this.pauseRect.y + buttonHeight / 2;
      const iconX = this.pauseRect.x + pauseWidth / 2;
      ctx.fillStyle = TEXT;
      ctx.fillRect(iconX - 5, iconY - 6, 3.5, 12);
      ctx.fillRect(iconX + 1.5, iconY - 6, 3.5, 12);
    } else {
      this.pauseRect = { x: 0, y: 0, width: 0, height: 0 };
    }
  }

  private drawPauseOverlay(): void {
    const ctx = this.context;
    ctx.fillStyle = 'rgba(2, 14, 21, 0.72)';
    ctx.fillRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const panelWidth = Math.min(300, this.width - 56);
    const panelHeight = 186;
    const panelX = (this.width - panelWidth) / 2;
    const panelY = Math.max(
      this.safeTop + 80,
      (this.height - panelHeight) / 2,
    );

    this.fillRoundRect(
      panelX,
      panelY,
      panelWidth,
      panelHeight,
      18,
      'rgba(6, 27, 37, 0.96)',
    );
    this.strokeRoundRect(
      panelX,
      panelY,
      panelWidth,
      panelHeight,
      18,
      'rgba(226, 191, 120, 0.45)',
    );

    ctx.textAlign = 'center';
    this.text('PAUSED', centerX, panelY + 36, 11, 'rgba(226, 191, 120, 0.62)');
    this.text('战斗暂停', centerX, panelY + 70, 22, GOLD_BRIGHT, 'bold');
    this.text('海域暂时平静', centerX, panelY + 94, 11, MUTED);

    const buttonWidth = panelWidth - 48;
    const buttonHeight = 44;
    this.pauseResumeRect = {
      x: panelX + 24,
      y: panelY + panelHeight - 66,
      width: buttonWidth,
      height: buttonHeight,
    };
    this.fillRoundRect(
      this.pauseResumeRect.x,
      this.pauseResumeRect.y,
      buttonWidth,
      buttonHeight,
      22,
      '#d8b978',
    );
    this.text(
      '继续战斗',
      centerX,
      this.pauseResumeRect.y + 28,
      15,
      '#122b33',
      'bold',
    );
  }

  private drawComplianceNotice(): void {
    const ctx = this.context;

    // The 3D scene does not exist yet, so this screen paints its own backdrop.
    const backdrop = ctx.createLinearGradient(0, 0, 0, this.height);
    backdrop.addColorStop(0, '#08222e');
    backdrop.addColorStop(0.55, '#0b3141');
    backdrop.addColorStop(1, '#04151d');
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const top = this.safeTop + 52;

    ctx.textAlign = 'center';
    this.text('SEA OVERLORD', centerX, top, 11, 'rgba(226, 191, 120, 0.66)');
    this.text('海战霸主', centerX, top + 40, 32, GOLD_BRIGHT, 'bold');
    this.text('海域 01 · 生存射击', centerX, top + 64, 12, MUTED);

    if (this.noticePrivacyOpen) {
      this.drawPrivacyPanel(top);
      return;
    }

    const noticeTop = top + 104;
    const noticeWidth = Math.min(320, this.width - 48);
    const noticeHeight = 172;
    const noticeX = (this.width - noticeWidth) / 2;

    this.fillRoundRect(
      noticeX,
      noticeTop,
      noticeWidth,
      noticeHeight,
      16,
      'rgba(4, 22, 31, 0.72)',
    );
    this.strokeRoundRect(
      noticeX,
      noticeTop,
      noticeWidth,
      noticeHeight,
      16,
      'rgba(226, 191, 120, 0.28)',
    );

    ctx.textAlign = 'left';
    this.text('健康游戏忠告', noticeX + 20, noticeTop + 30, 13, GOLD, 'bold');
    HEALTH_ADVISORY.forEach((line, index) => {
      this.text(line, noticeX + 20, noticeTop + 58 + index * 24, 12, TEXT);
    });

    ctx.textAlign = 'center';
    this.text(AGE_NOTICE, centerX, noticeTop + noticeHeight + 26, 11, MUTED);

    if (this.operatorLine) {
      this.text(this.operatorLine, centerX, noticeTop + noticeHeight + 46, 10, MUTED);
    }

    const buttonWidth = Math.min(300, this.width - 64);
    const buttonHeight = 48;
    const buttonX = (this.width - buttonWidth) / 2;
    const buttonY = Math.min(
      this.height - this.safeBottom - 132,
      noticeTop + noticeHeight + 78,
    );

    this.noticeStartRect = {
      x: buttonX,
      y: buttonY,
      width: buttonWidth,
      height: buttonHeight,
    };
    this.fillRoundRect(buttonX, buttonY, buttonWidth, buttonHeight, 24, '#d8b978');
    this.text('开始游戏', centerX, buttonY + 31, 17, '#122b33', 'bold');

    const privacyWidth = 150;
    const privacyHeight = 34;
    this.noticePrivacyRect = {
      x: (this.width - privacyWidth) / 2,
      y: buttonY + buttonHeight + 14,
      width: privacyWidth,
      height: privacyHeight,
    };
    this.strokeRoundRect(
      this.noticePrivacyRect.x,
      this.noticePrivacyRect.y,
      privacyWidth,
      privacyHeight,
      17,
      'rgba(226, 191, 120, 0.4)',
    );
    this.text(
      '隐私政策',
      centerX,
      this.noticePrivacyRect.y + 22,
      12,
      GOLD,
    );
  }

  private drawPrivacyPanel(top: number): void {
    const ctx = this.context;
    const centerX = this.width / 2;

    ctx.textAlign = 'center';
    this.text('隐私政策', centerX, top + 76, 20, GOLD_BRIGHT, 'bold');

    let cursorY = top + 112;
    const left = 28;
    const maxWidth = this.width - 56;

    ctx.textAlign = 'left';
    for (const [title, body] of PRIVACY_SECTIONS) {
      this.text(title, left, cursorY, 12, GOLD, 'bold');
      cursorY += 20;
      const lines = this.wrapText(body, maxWidth, 11);
      for (const line of lines) {
        this.text(line, left, cursorY, 11, MUTED);
        cursorY += 17;
      }
      cursorY += 10;

      if (cursorY > this.height - this.safeBottom - 120) {
        break;
      }
    }

    const buttonWidth = Math.min(260, this.width - 80);
    const buttonHeight = 44;
    const buttonY = this.height - this.safeBottom - 84;
    this.noticeBackRect = {
      x: (this.width - buttonWidth) / 2,
      y: buttonY,
      width: buttonWidth,
      height: buttonHeight,
    };
    this.fillRoundRect(
      this.noticeBackRect.x,
      buttonY,
      buttonWidth,
      buttonHeight,
      22,
      'rgba(226, 191, 120, 0.16)',
    );
    this.strokeRoundRect(
      this.noticeBackRect.x,
      buttonY,
      buttonWidth,
      buttonHeight,
      22,
      'rgba(226, 191, 120, 0.5)',
    );
    ctx.textAlign = 'center';
    this.text('返回', centerX, buttonY + 28, 14, TEXT, 'bold');
  }

  private drawBoss(): void {
    if (this.bossRatio === null) {
      return;
    }

    const ctx = this.context;
    const width = this.width * 0.76;
    const height = 10;
    const x = (this.width - width) / 2;
    const y = this.safeTop + 112;

    ctx.textAlign = 'center';
    this.text(this.bossName, this.width / 2, y - 8, 13, DANGER, 'bold');

    this.fillRoundRect(x, y, width, height, 5, 'rgba(40, 8, 8, 0.72)');
    const fillWidth = Math.max(0, width * this.bossRatio);
    if (fillWidth > 0) {
      this.fillRoundRect(x, y, fillWidth, height, 5, '#d8442e');
    }
    this.strokeRoundRect(x, y, width, height, 5, 'rgba(255, 120, 90, 0.42)');

    if (this.bossWarning) {
      const pulse = 0.55 + Math.sin(Date.now() / 110) * 0.25;
      ctx.textAlign = 'center';
      this.text(
        '⚠ 重炮锁定 · 立即规避',
        this.width / 2,
        y + 32,
        13,
        `rgba(255, 96, 70, ${pulse.toFixed(2)})`,
        'bold',
      );
    }
  }

  private drawToast(): void {
    if (this.toastTime <= 0) {
      return;
    }

    const alpha = Math.min(1, this.toastTime / 0.2);
    const ctx = this.context;

    ctx.textAlign = 'center';
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0, 12, 18, 0.8)';
    ctx.shadowBlur = 12;
    this.text(
      this.toastText,
      this.width / 2,
      this.height * 0.3,
      18,
      GOLD_BRIGHT,
      'bold',
    );
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  private drawJoystick(): void {
    const ctx = this.context;
    const active = this.activeTouchId !== null;
    const baseX = active ? this.joystickBaseX : this.defaultJoystickX;
    const baseY = active ? this.joystickBaseY : this.defaultJoystickY;
    const radius = this.joystickRadius;
    const knobX = baseX + this.joystickValue.x * radius * 0.78;
    const knobY = baseY - this.joystickValue.y * radius * 0.78;

    ctx.beginPath();
    ctx.arc(baseX, baseY, radius, 0, Math.PI * 2);
    ctx.fillStyle = active
      ? 'rgba(23, 73, 84, 0.5)'
      : 'rgba(10, 43, 53, 0.34)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = active
      ? 'rgba(226, 191, 120, 0.58)'
      : 'rgba(155, 215, 223, 0.28)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(baseX, baseY, radius - 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(158, 213, 222, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(knobX, knobY, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#d8b978';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 236, 190, 0.7)';
    ctx.stroke();

    if (!active) {
      ctx.textAlign = 'center';
      this.text(
        '按住屏幕任意位置拖动',
        Math.min(
          Math.max(baseX, 58),
          Math.max(58, this.width - 58),
        ),
        Math.min(baseY + radius + 16, this.height - 8),
        10,
        MUTED,
      );
    }
  }

  private drawUpgradeOverlay(): void {
    const ctx = this.context;
    ctx.fillStyle = 'rgba(2, 14, 21, 0.84)';
    ctx.fillRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    ctx.textAlign = 'center';
    this.text('LEVEL UP', centerX, this.safeTop + 48, 24, GOLD, 'bold');
    this.text(
      `选择强化 · 等级 ${this.upgradeLevel}`,
      centerX,
      this.safeTop + 72,
      12,
      MUTED,
    );

    const margin = 16;
    const cardWidth = this.width - margin * 2;
    const cardHeight = Math.min(
      114,
      Math.max(
        82,
        (this.height - this.safeTop - 170) / 3 - 10,
      ),
    );
    const gap = 10;
    const startY = this.safeTop + 90;

    this.upgradeCardRects = [];

    this.upgradeOffers.forEach((offer, index) => {
      const card: Rect = {
        x: margin,
        y: startY + index * (cardHeight + gap),
        width: cardWidth,
        height: cardHeight,
      };
      this.upgradeCardRects.push(card);

      this.fillRoundRect(
        card.x,
        card.y,
        card.width,
        card.height,
        14,
        'rgba(7, 32, 42, 0.92)',
      );
      this.strokeRoundRect(
        card.x,
        card.y,
        card.width,
        card.height,
        14,
        'rgba(226, 191, 120, 0.4)',
      );

      const left = card.x + 16;
      const top = card.y + 22;
      ctx.textAlign = 'left';
      this.text(
        String(index + 1).padStart(2, '0'),
        left,
        top,
        11,
        'rgba(226, 191, 120, 0.56)',
        'bold',
      );
      this.text(offer.tag, left + 28, top, 11, GOLD);
      this.text(offer.title, left, top + 26, 17, TEXT, 'bold');
      ctx.textAlign = 'right';
      this.text(
        `强化 ${offer.nextLevel} / ${offer.maxLevel}`,
        card.x + card.width - 16,
        top,
        10,
        MUTED,
      );

      ctx.textAlign = 'left';
      this.drawWrappedText(
        offer.description,
        left,
        top + 48,
        card.width - 32,
        16,
        2,
        11,
        MUTED,
      );

      ctx.textAlign = 'right';
      this.text(
        '点击选择',
        card.x + card.width - 16,
        card.y + card.height - 12,
        10,
        GOLD,
      );
    });
  }

  private drawGameOverOverlay(stats: GameOverStats): void {
    const ctx = this.context;
    ctx.fillStyle = 'rgba(2, 14, 21, 0.88)';
    ctx.fillRect(0, 0, this.width, this.height);

    const panelWidth = this.width - 48;
    const panelHeight = 512;
    const panelX = 24;
    const panelY = Math.max(
      this.safeTop + 24,
      (this.height - panelHeight) / 2,
    );

    this.fillRoundRect(
      panelX,
      panelY,
      panelWidth,
      panelHeight,
      18,
      'rgba(6, 27, 37, 0.96)',
    );
    this.strokeRoundRect(
      panelX,
      panelY,
      panelWidth,
      panelHeight,
      18,
      'rgba(226, 191, 120, 0.45)',
    );

    const centerX = this.width / 2;
    ctx.textAlign = 'center';
    this.text(
      'FLAGSHIP LOST',
      centerX,
      panelY + 34,
      11,
      'rgba(226, 191, 120, 0.62)',
    );
    this.text('旗舰战沉', centerX, panelY + 66, 25, GOLD_BRIGHT, 'bold');
    this.text('海域 01 · 战斗结束', centerX, panelY + 88, 11, MUTED);

    if (stats.isNewRecord) {
      const badgeWidth = 96;
      const badgeHeight = 24;
      const badgeX = centerX - badgeWidth / 2;
      const badgeY = panelY + 100;
      this.fillRoundRect(badgeX, badgeY, badgeWidth, badgeHeight, 12, 'rgba(216, 185, 120, 0.22)');
      this.strokeRoundRect(badgeX, badgeY, badgeWidth, badgeHeight, 12, 'rgba(255, 226, 161, 0.7)');
      this.text('★ 新纪录', centerX, badgeY + 17, 12, GOLD_BRIGHT, 'bold');
    }

    const accuracyText =
      stats.accuracy === undefined || stats.accuracy <= 0
        ? '—'
        : `${Math.round(stats.accuracy * 100)}%`;

    const rows: Array<[string, string]> = [
      ['存活时间', this.formatDuration(stats.survivalSeconds)],
      ['击沉敌舰', String(stats.kills)],
      ['最高等级', String(stats.level)],
      ['Boss 击杀', String(stats.bossKills)],
      ['总伤害', stats.damageDealt === undefined ? '—' : String(stats.damageDealt)],
      ['命中率', accuracyText],
      ['最高连击', stats.bestStreak === undefined ? '—' : String(stats.bestStreak)],
      [
        '历史最佳',
        stats.bestKills === undefined ? '—' : `${stats.bestKills} 舰`,
      ],
    ];

    const rowsTop = stats.isNewRecord ? panelY + 148 : panelY + 128;
    rows.forEach(([label, value], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = panelX + 24 + column * (panelWidth - 48) / 2;
      const y = rowsTop + row * 48;

      ctx.textAlign = 'left';
      this.text(label, x, y, 10, MUTED);
      this.text(value, x, y + 20, 16, TEXT, 'bold');
    });

    const buttonWidth = panelWidth - 48;
    const buttonHeight = 46;
    this.restartRect = {
      x: panelX + 24,
      y: panelY + panelHeight - 68,
      width: buttonWidth,
      height: buttonHeight,
    };
    this.fillRoundRect(
      this.restartRect.x,
      this.restartRect.y,
      buttonWidth,
      buttonHeight,
      23,
      '#d8b978',
    );
    ctx.textAlign = 'center';
    this.text(
      '重新起航',
      centerX,
      this.restartRect.y + 30,
      16,
      '#122b33',
      'bold',
    );

    this.drawCapabilityButtons(panelX, panelWidth, this.restartRect.y - 108);
  }

  /**
   * Entry points for the platform capabilities. Buttons are laid out two per
   * row above the restart button and simply omitted when the host or the
   * console config cannot back them.
   */
  private drawCapabilityButtons(
    panelX: number,
    panelWidth: number,
    top: number,
  ): void {
    const buttons = this.collectCapabilityButtons();
    this.capabilityRects = [];

    if (buttons.length === 0) {
      return;
    }

    const ctx = this.context;
    const gap = 8;
    const columns = buttons.length === 1 ? 1 : 2;
    const totalWidth = panelWidth - 48;
    const buttonWidth = (totalWidth - gap * (columns - 1)) / columns;
    const buttonHeight = 40;

    buttons.forEach((button, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = panelX + 24 + column * (buttonWidth + gap);
      const y = top + row * (buttonHeight + gap);
      const rect = { x, y, width: buttonWidth, height: buttonHeight };

      this.fillRoundRect(
        x,
        y,
        buttonWidth,
        buttonHeight,
        12,
        'rgba(216, 185, 120, 0.16)',
      );
      this.strokeRoundRect(
        x,
        y,
        buttonWidth,
        buttonHeight,
        12,
        'rgba(226, 191, 120, 0.5)',
      );
      ctx.textAlign = 'center';
      this.text(button.label, x + buttonWidth / 2, y + 26, 13, GOLD_BRIGHT, 'bold');

      this.capabilityRects.push({ rect, action: button.action });
    });
  }

  private collectCapabilityButtons(): CapabilityButton[] {
    const caps = this.capabilities;
    if (!caps) {
      return [];
    }

    const buttons: CapabilityButton[] = [];
    if (caps.canOfferSidebar) {
      buttons.push({ action: 'sidebar', label: '侧边栏礼包' });
    }
    if (caps.canOfferRewardedAd) {
      buttons.push({ action: 'rewarded', label: '看视频强化' });
    }
    if (caps.canOfferShortcut) {
      buttons.push({ action: 'shortcut', label: '添加到桌面' });
    }
    if (caps.canOfferSubscribe) {
      buttons.push({ action: 'subscribe', label: '开启提醒' });
    }

    return buttons.slice(0, 4);
  }

  /**
   * Runs directly inside the touch-end handler. `tt.addShortcut` and
   * `tt.requestSubscribeMessage` are rejected unless they are called
   * synchronously from a gesture, so nothing here may await first.
   */
  private clearInterstitialTimer(): void {
    if (this.interstitialTimer !== null) {
      clearTimeout(this.interstitialTimer);
      this.interstitialTimer = null;
    }
  }

  private triggerCapability(action: CapabilityAction): void {
    const caps = this.capabilities;
    if (!caps) {
      return;
    }

    switch (action) {
      case 'sidebar':
        if (!caps.openSidebar()) {
          this.showKillFeedback('当前环境不支持侧边栏');
        }
        break;
      case 'shortcut':
        if (!caps.requestShortcut()) {
          this.showKillFeedback('当前环境不支持添加到桌面');
        }
        break;
      case 'subscribe':
        if (!caps.requestSubscribe()) {
          this.showKillFeedback('提醒功能暂不可用');
        }
        break;
      case 'rewarded':
        this.onRewardedAd?.();
        break;
      default:
        break;
    }
  }

  private drawBar(
    x: number,
    y: number,
    width: number,
    height: number,
    ratio: number,
    color: string,
  ): void {
    const safeRatio = Math.min(Math.max(ratio, 0), 1);
    this.fillRoundRect(
      x,
      y,
      width,
      height,
      height / 2,
      'rgba(255, 255, 255, 0.12)',
    );

    if (safeRatio > 0) {
      this.fillRoundRect(
        x,
        y,
        Math.max(height, width * safeRatio),
        height,
        height / 2,
        color,
      );
    }
  }

  private fillRoundRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    color: string,
  ): void {
    this.roundRectPath(x, y, width, height, radius);
    this.context.fillStyle = color;
    this.context.fill();
  }

  private strokeRoundRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    color: string,
  ): void {
    this.roundRectPath(x, y, width, height, radius);
    this.context.strokeStyle = color;
    this.context.lineWidth = 1;
    this.context.stroke();
  }

  private roundRectPath(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const ctx = this.context;
    const r = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(
      x + width,
      y + height,
      x + width - r,
      y + height,
    );
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private text(
    value: string,
    x: number,
    y: number,
    size: number,
    color: string,
    weight: 'normal' | 'bold' = 'normal',
  ): void {
    const ctx = this.context;
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }

  private wrapText(value: string, maxWidth: number, size: number): string[] {
    const ctx = this.context;
    ctx.font = `normal ${size}px ${FONT_FAMILY}`;

    const chars = Array.from(value);
    const lines: string[] = [];
    let line = '';

    for (const char of chars) {
      const candidate = line + char;
      if (ctx.measureText(candidate).width > maxWidth && line.length > 0) {
        lines.push(line);
        line = char;
      } else {
        line = candidate;
      }
    }

    if (line.length > 0) {
      lines.push(line);
    }

    return lines;
  }

  private drawWrappedText(
    value: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number,
    size: number,
    color: string,
  ): void {
    const ctx = this.context;
    ctx.font = `normal ${size}px ${FONT_FAMILY}`;
    ctx.fillStyle = color;

    const chars = Array.from(value);
    let line = '';
    let lineIndex = 0;

    for (let index = 0; index < chars.length; index += 1) {
      const char = chars[index] ?? '';
      const candidate = line + char;

      if (ctx.measureText(candidate).width > maxWidth && line.length > 0) {
        if (lineIndex === maxLines - 1) {
          ctx.fillText(`${line.slice(0, -1)}…`, x, y + lineIndex * lineHeight);
          return;
        }

        ctx.fillText(line, x, y + lineIndex * lineHeight);
        line = char;
        lineIndex += 1;
      } else {
        line = candidate;
      }
    }

    if (line.length > 0) {
      ctx.fillText(line, x, y + lineIndex * lineHeight);
    }
  }

  private formatDuration(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  private isPointInside(rect: Rect, x: number, y: number): boolean {
    return (
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height
    );
  }

  private findTouch(
    event: TtTouchEvent,
    identifier: number,
  ): TtTouch | null {
    for (const touch of event.touches) {
      if (touch.identifier === identifier) {
        return touch;
      }
    }
    for (const touch of event.changedTouches) {
      if (touch.identifier === identifier) {
        return touch;
      }
    }
    return null;
  }

  private updateJoystick(x: number, y: number): void {
    const deltaX = x - this.joystickBaseX;
    const deltaY = y - this.joystickBaseY;
    const distance = Math.hypot(deltaX, deltaY);
    const clamped = Math.min(distance, this.joystickRadius);
    const scale = distance > 0 ? clamped / distance : 0;

    this.joystickValue.set(
      (deltaX * scale) / this.joystickRadius,
      (-deltaY * scale) / this.joystickRadius,
    );
  }

  private handleNoticeTap(x: number, y: number): void {
    if (this.noticePrivacyOpen) {
      if (this.isPointInside(this.noticeBackRect, x, y)) {
        this.noticePrivacyOpen = false;
      }
      return;
    }

    if (this.isPointInside(this.noticePrivacyRect, x, y)) {
      this.noticePrivacyOpen = true;
      return;
    }

    if (this.isPointInside(this.noticeStartRect, x, y)) {
      const start = this.noticeStartHandler;
      if (!start) {
        return;
      }
      this.dismissNotice();
      this.noticeStartHandler = null;
      start();
    }
  }

  private readonly handleTouchStart = (event: TtTouchEvent): void => {
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    if (!this.firstTouchHandled) {
      this.firstTouchHandled = true;
      this.onFirstTouch?.();
    }

    const x = touch.clientX;
    const y = touch.clientY;

    if (this.noticeActive) {
      this.handleNoticeTap(x, y);
      return;
    }

    if (this.gameOverStats) {
      const capability = this.capabilityRects.find((entry) =>
        this.isPointInside(entry.rect, x, y),
      );
      if (capability) {
        this.triggerCapability(capability.action);
        return;
      }

      if (
        this.restartRect &&
        this.isPointInside(this.restartRect, x, y)
      ) {
        this.onRestart();
      }
      return;
    }

    if (this.isPaused()) {
      if (this.isPointInside(this.pauseResumeRect, x, y)) {
        this.pauseControls?.toggle();
      }
      return;
    }

    if (this.upgradeHandler) {
      if (this.upgradePending) {
        return;
      }

      const index = this.upgradeCardRects.findIndex((rect) =>
        this.isPointInside(rect, x, y),
      );
      const offer = this.upgradeOffers[index];

      if (offer) {
        this.upgradePending = true;
        const handler = this.upgradeHandler;
        this.upgradeHandler = null;
        handler(offer.id);
      }
      return;
    }

    if (this.isPointInside(this.soundRect, x, y)) {
      this.soundEnabled = this.soundControls.toggle();
      return;
    }

    if (
      this.pauseControls &&
      this.isPointInside(this.pauseRect, x, y)
    ) {
      this.reset();
      this.pauseControls.toggle();
      return;
    }

    if (!this.inputEnabled || this.activeTouchId !== null) {
      return;
    }

    // The stick spawns under the finger wherever it lands, so the player can
    // steer from any part of the screen instead of hunting for a fixed pad.
    this.activeTouchId = touch.identifier;
    this.joystickBaseX = x;
    this.joystickBaseY = y;
    this.updateJoystick(x, y);
  };

  private readonly handleTouchMove = (event: TtTouchEvent): void => {
    if (this.activeTouchId === null) {
      return;
    }

    const touch = this.findTouch(event, this.activeTouchId);
    if (!touch) {
      return;
    }

    this.updateJoystick(touch.clientX, touch.clientY);
  };

  private readonly handleTouchEnd = (event: TtTouchEvent): void => {
    if (this.activeTouchId === null) {
      return;
    }

    const ended = event.changedTouches.some(
      (touch) => touch.identifier === this.activeTouchId,
    );
    if (ended) {
      this.reset();
    }
  };

  private readonly handleTouchCancel = (): void => {
    this.reset();
  };
}
