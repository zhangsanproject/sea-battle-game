import { Vector2 } from 'three';
import { GAME_CONFIG } from '../game/config';
import type { PlayerStatus } from '../game/entities/PlayerShip';
import type { UpgradeId, UpgradeOffer } from '../game/progression/types';
import type { InputSource } from '../platform/PlatformAdapter';
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

export interface MiniGameUiOptions {
  sceneCanvas: HTMLCanvasElement;
  soundControls: SoundControls;
  onRestart: () => void;
}

const FONT_FAMILY =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const GOLD = '#e6c47a';
const GOLD_BRIGHT = '#ffe2a1';
const TEXT = '#d9edf1';
const MUTED = 'rgba(203, 231, 236, 0.62)';
const PANEL = 'rgba(4, 22, 31, 0.72)';
const DANGER = '#ff7052';

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
  private readonly onRestart: () => void;
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

  private upgradeOffers: readonly UpgradeOffer[] = [];
  private upgradeLevel = 1;
  private upgradeHandler: ((id: UpgradeId) => void) | null = null;
  private upgradePending = false;
  private upgradeCardRects: Rect[] = [];
  private gameOverStats: GameOverStats | null = null;
  private restartRect: Rect | null = null;
  private soundRect: Rect = { x: 0, y: 0, width: 0, height: 0 };

  private inputEnabled = true;
  private activeTouchId: number | null = null;
  private joystickBaseX = 0;
  private joystickBaseY = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, options: MiniGameUiOptions) {
    this.canvas = canvas;
    this.sceneCanvas = options.sceneCanvas;
    this.soundControls = options.soundControls;
    this.onRestart = options.onRestart;
    this.runtime = getTtRuntime();
    this.soundEnabled = options.soundControls.enabled;

    const info = this.runtime?.getSystemInfoSync();
    this.width = info?.screenWidth ?? 375;
    this.height = info?.screenHeight ?? 667;
    this.pixelRatio = Math.min(info?.pixelRatio ?? 2, 2);

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

  getMoveVector(out: Vector2): Vector2 {
    if (!this.inputEnabled) {
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
  }

  render(deltaTime: number): void {
    if (this.disposed) {
      return;
    }

    const ctx = this.context;
    this.toastTime = Math.max(0, this.toastTime - deltaTime);
    this.damageFlashTime = Math.max(0, this.damageFlashTime - deltaTime);

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
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.reset();
    this.runtime?.offTouchStart?.(this.handleTouchStart);
    this.runtime?.offTouchMove?.(this.handleTouchMove);
    this.runtime?.offTouchEnd?.(this.handleTouchEnd);
    this.runtime?.offTouchCancel?.(this.handleTouchCancel);
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
    const baseX =
      this.activeTouchId !== null
        ? this.joystickBaseX
        : this.defaultJoystickX;
    const baseY =
      this.activeTouchId !== null
        ? this.joystickBaseY
        : this.defaultJoystickY;
    const radius = this.joystickRadius;
    const knobX = baseX + this.joystickValue.x * radius * 0.78;
    const knobY = baseY - this.joystickValue.y * radius * 0.78;

    ctx.beginPath();
    ctx.arc(baseX, baseY, radius, 0, Math.PI * 2);
    ctx.fillStyle =
      this.activeTouchId !== null
        ? 'rgba(23, 73, 84, 0.5)'
        : 'rgba(10, 43, 53, 0.34)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle =
      this.activeTouchId !== null
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

    ctx.textAlign = 'center';
    this.text('移动', baseX, baseY + radius + 16, 10, MUTED);
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
    const panelHeight = 318;
    const panelX = 24;
    const panelY = Math.max(
      this.safeTop + 40,
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
      panelY + 40,
      11,
      'rgba(226, 191, 120, 0.62)',
    );
    this.text('旗舰战沉', centerX, panelY + 74, 25, GOLD_BRIGHT, 'bold');
    this.text('海域 01 · 战斗结束', centerX, panelY + 98, 11, MUTED);

    const rows: Array<[string, string]> = [
      ['存活时间', this.formatDuration(stats.survivalSeconds)],
      ['击沉敌舰', String(stats.kills)],
      ['最高等级', String(stats.level)],
      ['Boss 击杀', String(stats.bossKills)],
    ];

    rows.forEach(([label, value], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = panelX + 24 + column * (panelWidth - 48) / 2;
      const y = panelY + 142 + row * 52;

      ctx.textAlign = 'left';
      this.text(label, x, y, 11, MUTED);
      this.text(value, x, y + 22, 18, TEXT, 'bold');
    });

    const buttonWidth = panelWidth - 48;
    const buttonHeight = 46;
    this.restartRect = {
      x: panelX + 24,
      y: panelY + panelHeight - 70,
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

  private readonly handleTouchStart = (event: TtTouchEvent): void => {
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    const x = touch.clientX;
    const y = touch.clientY;

    if (this.gameOverStats) {
      if (
        this.restartRect &&
        this.isPointInside(this.restartRect, x, y)
      ) {
        this.onRestart();
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
      !this.inputEnabled ||
      this.activeTouchId !== null ||
      x > this.width * 0.62 ||
      y < this.height * 0.32
    ) {
      return;
    }

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
