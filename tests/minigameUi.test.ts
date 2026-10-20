import { Vector2 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpgradeOffer } from '../src/game/progression/types';
import { MiniGameUi } from '../src/minigame/MiniGameUi';
import type { GameOverStats } from '../src/ui/GameHud';
import {
  createFakeRuntime,
  emitTouch,
  emitTouchEnd,
  installRuntime,
  uninstallRuntime,
  type FakeCanvas,
  type FakeRuntime,
} from './helpers/minigameRuntime';

const OFFERS: UpgradeOffer[] = [
  {
    id: 'damage',
    title: '强化弹头',
    tag: '火力',
    description: '主炮单发伤害 +4',
    nextLevel: 2,
    maxLevel: 5,
  },
  {
    id: 'fireRate',
    title: '快速装填',
    tag: '火力',
    description: '主炮射击间隔 ×0.88',
    nextLevel: 2,
    maxLevel: 5,
  },
  {
    id: 'speed',
    title: '轮机增压',
    tag: '机动',
    description: '航速 +1.2',
    nextLevel: 2,
    maxLevel: 4,
  },
];

interface Harness {
  fake: FakeRuntime;
  ui: MiniGameUi;
  screenCanvas: FakeCanvas;
  sceneCanvas: FakeCanvas;
  toggleSound: ReturnType<typeof vi.fn>;
  restart: ReturnType<typeof vi.fn>;
}

let harness: Harness | null = null;

function createHarness(): Harness {
  const fake = createFakeRuntime();
  installRuntime(fake);

  const screenCanvas = fake.runtime.createCanvas() as unknown as FakeCanvas;
  const sceneCanvas = fake.runtime.createCanvas() as unknown as FakeCanvas;
  sceneCanvas.width = 750;
  sceneCanvas.height = 1624;

  const toggleSound = vi.fn(() => false);
  const restart = vi.fn();

  const ui = new MiniGameUi(screenCanvas as unknown as HTMLCanvasElement, {
    sceneCanvas: sceneCanvas as unknown as HTMLCanvasElement,
    soundControls: { enabled: true, toggle: toggleSound as () => boolean },
    onRestart: restart,
  });

  harness = { fake, ui, screenCanvas, sceneCanvas, toggleSound, restart };
  return harness;
}

function moveVector(ui: MiniGameUi): Vector2 {
  return ui.getMoveVector(new Vector2());
}

beforeEach(() => {
  harness = null;
});

afterEach(() => {
  harness?.ui.dispose();
  uninstallRuntime();
});

describe('MiniGameUi screen setup', () => {
  it('caps the device pixel ratio and sizes the canvas in device pixels', () => {
    const { ui, screenCanvas } = createHarness();

    expect(ui.width).toBe(375);
    expect(ui.height).toBe(812);
    expect(ui.pixelRatio).toBe(2);
    expect(screenCanvas.width).toBe(750);
    expect(screenCanvas.height).toBe(1624);
  });

  it('draws the scene canvas into the HUD canvas every frame', () => {
    const { ui, screenCanvas } = createHarness();

    ui.render(1 / 60);

    expect(screenCanvas.calls.draws).toBe(1);
    expect(screenCanvas.contextTypes).toEqual(['2d']);
  });

  it('paints the level, hull and danger readouts', () => {
    const { ui, screenCanvas } = createHarness();

    ui.update({ health: 40, maxHealth: 100, level: 5 });
    ui.setExperience(12, 30);
    ui.setDangerTier(3);
    ui.render(1 / 60);

    const texts = screenCanvas.calls.texts.join(' | ');
    expect(texts).toContain('Lv.5');
    expect(texts).toContain('40 / 100');
    expect(texts).toContain('危险度 3');
  });
});

describe('MiniGameUi joystick input', () => {
  it('produces a normalised vector while dragging inside the allowed area', () => {
    const { ui, fake } = createHarness();

    emitTouch(fake.touchHandlers.start, 1, 80, 600);
    emitTouch(fake.touchHandlers.move, 1, 110, 600);

    const vector = moveVector(ui);
    expect(vector.x).toBeGreaterThan(0.3);
    expect(Math.abs(vector.y)).toBeLessThan(1e-6);
    expect(vector.length()).toBeLessThanOrEqual(1);
  });

  it('treats small drags as the dead zone', () => {
    const { ui, fake } = createHarness();

    emitTouch(fake.touchHandlers.start, 1, 80, 600);
    emitTouch(fake.touchHandlers.move, 1, 86, 600);

    expect(moveVector(ui).length()).toBe(0);
  });

  it('starts the stick from the right-hand side of the screen', () => {
    const { ui, fake } = createHarness();

    emitTouch(fake.touchHandlers.start, 1, 320, 600);
    emitTouch(fake.touchHandlers.move, 1, 290, 600);

    expect(moveVector(ui).x).toBeLessThan(-0.3);
  });

  it('starts the stick from the upper part of the screen', () => {
    const { ui, fake } = createHarness();

    emitTouch(fake.touchHandlers.start, 1, 180, 140);
    emitTouch(fake.touchHandlers.move, 1, 180, 110);

    expect(moveVector(ui).y).toBeGreaterThan(0.3);
  });

  it('responds identically wherever the drag begins', () => {
    const { ui, fake } = createHarness();

    emitTouch(fake.touchHandlers.start, 1, 60, 700);
    emitTouch(fake.touchHandlers.move, 1, 90, 700);
    const fromBottomLeft = moveVector(ui).x;
    emitTouchEnd(fake.touchHandlers.end, 1, 90, 700);

    emitTouch(fake.touchHandlers.start, 2, 300, 160);
    emitTouch(fake.touchHandlers.move, 2, 330, 160);

    expect(fromBottomLeft).toBeGreaterThan(0.3);
    expect(moveVector(ui).x).toBeCloseTo(fromBottomLeft, 6);
  });

  it('keeps the sound button from hijacking a drag', () => {
    const { ui, fake, toggleSound } = createHarness();

    ui.render(1 / 60);
    emitTouch(fake.touchHandlers.start, 1, 300, 104);
    emitTouch(fake.touchHandlers.move, 1, 350, 104);

    expect(toggleSound).toHaveBeenCalledTimes(1);
    expect(moveVector(ui).length()).toBe(0);
  });

  it('shows the anywhere-on-screen hint before the first touch', () => {
    const { ui, screenCanvas } = createHarness();

    ui.render(1 / 60);

    expect(screenCanvas.calls.texts.join(' | ')).toContain(
      '按住屏幕任意位置拖动',
    );
  });

  it('clamps the joystick when the finger moves past the radius', () => {
    const { ui, fake } = createHarness();

    emitTouch(fake.touchHandlers.start, 1, 80, 600);
    emitTouch(fake.touchHandlers.move, 1, 400, 600);

    expect(moveVector(ui).length()).toBeCloseTo(1, 5);
  });

  it('releases the joystick when the finger lifts', () => {
    const { ui, fake } = createHarness();

    emitTouch(fake.touchHandlers.start, 1, 80, 600);
    emitTouch(fake.touchHandlers.move, 1, 110, 600);
    emitTouchEnd(fake.touchHandlers.end, 1, 110, 600);

    expect(moveVector(ui).length()).toBe(0);
  });

  it('drops movement while disabled and resets the stick', () => {
    const { ui, fake } = createHarness();

    emitTouch(fake.touchHandlers.start, 1, 80, 600);
    emitTouch(fake.touchHandlers.move, 1, 110, 600);
    ui.setEnabled(false);

    expect(moveVector(ui).length()).toBe(0);

    ui.setEnabled(true);
    expect(moveVector(ui).length()).toBe(0);
  });

  it('tracks only the finger that started the drag', () => {
    const { ui, fake } = createHarness();

    emitTouch(fake.touchHandlers.start, 1, 80, 600);
    emitTouch(fake.touchHandlers.move, 1, 110, 600);
    const dragging = moveVector(ui).x;

    emitTouch(fake.touchHandlers.start, 2, 200, 620);
    emitTouch(fake.touchHandlers.move, 2, 150, 620);

    expect(moveVector(ui).x).toBeCloseTo(dragging, 6);
  });
});

describe('MiniGameUi upgrade selection', () => {
  it('selects the tapped card exactly once', () => {
    const { ui, fake } = createHarness();
    const onSelect = vi.fn();

    ui.showUpgradeChoices(OFFERS, 2, onSelect);
    ui.render(1 / 60);

    emitTouch(fake.touchHandlers.start, 1, 100, 191);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('damage');

    emitTouch(fake.touchHandlers.start, 2, 100, 191);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('maps each card to its own offer', () => {
    const { ui, fake } = createHarness();
    const onSelect = vi.fn();

    ui.showUpgradeChoices(OFFERS, 2, onSelect);
    ui.render(1 / 60);

    emitTouch(fake.touchHandlers.start, 1, 100, 191 + 124);

    expect(onSelect).toHaveBeenCalledWith('fireRate');
  });

  it('stops accepting taps after the choices are hidden', () => {
    const { ui, fake } = createHarness();
    const onSelect = vi.fn();

    ui.showUpgradeChoices(OFFERS, 2, onSelect);
    ui.render(1 / 60);
    ui.hideUpgradeChoices();
    ui.render(1 / 60);

    emitTouch(fake.touchHandlers.start, 1, 100, 191);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('freezes movement while the upgrade panel is open', () => {
    const { ui, fake } = createHarness();
    const onSelect = vi.fn();

    emitTouch(fake.touchHandlers.start, 1, 80, 600);
    emitTouch(fake.touchHandlers.move, 1, 110, 600);
    expect(moveVector(ui).x).toBeGreaterThan(0.3);

    // Game disables the input source when it switches to the upgrade phase.
    ui.showUpgradeChoices(OFFERS, 2, onSelect);
    ui.setEnabled(false);
    ui.render(1 / 60);

    expect(moveVector(ui).length()).toBe(0);

    emitTouch(fake.touchHandlers.start, 2, 100, 191);
    emitTouch(fake.touchHandlers.move, 2, 140, 600);

    expect(onSelect).toHaveBeenCalledWith('damage');
    expect(moveVector(ui).length()).toBe(0);
  });
});

describe('MiniGameUi overlays and buttons', () => {
  it('restarts when the game over button is tapped', () => {
    const { ui, fake, restart } = createHarness();
    const stats: GameOverStats = {
      survivalSeconds: 83,
      kills: 12,
      level: 6,
      bossKills: 0,
    };

    ui.showGameOver(stats);
    ui.render(1 / 60);
    emitTouch(fake.touchHandlers.start, 1, 100, 510);

    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('ignores taps outside the restart button', () => {
    const { ui, fake, restart } = createHarness();

    ui.showGameOver({
      survivalSeconds: 10,
      kills: 1,
      level: 1,
      bossKills: 0,
    });
    ui.render(1 / 60);
    emitTouch(fake.touchHandlers.start, 1, 100, 200);

    expect(restart).not.toHaveBeenCalled();
  });

  it('toggles sound from the status button', () => {
    const { ui, fake, toggleSound } = createHarness();

    ui.render(1 / 60);
    emitTouch(fake.touchHandlers.start, 1, 300, 100);

    expect(toggleSound).toHaveBeenCalledTimes(1);
  });

  it('reports the boss bar only while a boss is alive', () => {
    const { ui, screenCanvas } = createHarness();

    ui.setBossHealth('深海霸主', 0.5);
    ui.render(1 / 60);
    expect(screenCanvas.calls.texts).toContain('深海霸主');

    ui.hideBossHealth();
    screenCanvas.calls.texts.length = 0;
    ui.render(1 / 60);
    expect(screenCanvas.calls.texts).not.toContain('深海霸主');
  });

  it('formats the survival time in the game over panel', () => {
    const { ui, screenCanvas } = createHarness();

    ui.showGameOver({
      survivalSeconds: 83.4,
      kills: 7,
      level: 4,
      bossKills: 1,
    });
    ui.render(1 / 60);

    expect(screenCanvas.calls.texts).toContain('01:23');
  });
});

describe('MiniGameUi teardown', () => {
  it('unregisters every touch handler on dispose', () => {
    const { ui, fake } = createHarness();

    expect(fake.touchHandlers.start).toHaveLength(1);
    expect(fake.touchHandlers.move).toHaveLength(1);
    expect(fake.touchHandlers.end).toHaveLength(1);
    expect(fake.touchHandlers.cancel).toHaveLength(1);

    ui.dispose();

    expect(fake.touchHandlers.start).toHaveLength(0);
    expect(fake.touchHandlers.move).toHaveLength(0);
    expect(fake.touchHandlers.end).toHaveLength(0);
    expect(fake.touchHandlers.cancel).toHaveLength(0);
    expect(fake.removeTouchHandlerCalls).toBe(4);
  });

  it('stops rendering after dispose', () => {
    const { ui, screenCanvas } = createHarness();

    ui.render(1 / 60);
    const drawsBefore = screenCanvas.calls.draws;
    ui.dispose();
    ui.render(1 / 60);

    expect(screenCanvas.calls.draws).toBe(drawsBefore);
  });
});
