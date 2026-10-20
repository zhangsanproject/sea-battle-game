import { SoundManager } from '../audio/SoundManager';
import { Game } from '../game/Game';
import { SceneManager } from '../game/SceneManager';
import { MiniGamePlatform } from '../platform/MiniGamePlatform';
import { MiniGameUi } from './MiniGameUi';
import { getTtRuntime } from './runtime';

interface GlobalScope {
  requestAnimationFrame?: (callback: (time: number) => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
  performance?: { now: () => number };
}

function installFrameScheduler(): void {
  const scope = globalThis as unknown as GlobalScope;

  if (typeof scope.requestAnimationFrame !== 'function') {
    scope.requestAnimationFrame = (callback) =>
      setTimeout(() => {
        callback(Date.now());
      }, 16) as unknown as number;
  }

  if (typeof scope.cancelAnimationFrame !== 'function') {
    scope.cancelAnimationFrame = (handle) => {
      clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
    };
  }

  if (!scope.performance) {
    scope.performance = { now: () => Date.now() };
  }
}

/**
 * Three.js attaches context-loss listeners even when a canvas is supplied.
 * Mini-game canvases may not expose DOM event methods.
 */
function prepareSceneCanvas(canvas: HTMLCanvasElement): void {
  const target = canvas as unknown as {
    addEventListener?: (...args: unknown[]) => void;
    removeEventListener?: (...args: unknown[]) => void;
    style?: Record<string, string>;
  };

  if (typeof target.addEventListener !== 'function') {
    target.addEventListener = () => {};
  }
  if (typeof target.removeEventListener !== 'function') {
    target.removeEventListener = () => {};
  }
  if (!target.style) {
    target.style = {};
  }
}

function drawFatalError(canvas: HTMLCanvasElement, message: string): void {
  const runtime = getTtRuntime();
  if (!runtime) {
    return;
  }

  try {
    const info = runtime.getSystemInfoSync();
    canvas.width = info.screenWidth;
    canvas.height = info.screenHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.fillStyle = '#071c26';
    context.fillRect(0, 0, info.screenWidth, info.screenHeight);
    context.fillStyle = '#ffd98a';
    context.font = 'bold 22px sans-serif';
    context.textAlign = 'center';
    context.fillText('海战霸主启动失败', info.screenWidth / 2, 120);
    context.fillStyle = '#cfe9ee';
    context.font = '14px sans-serif';
    context.fillText(message, info.screenWidth / 2, 160);
    context.fillText(
      '请确认设备支持 WebGL2 后重新进入',
      info.screenWidth / 2,
      186,
    );
  } catch {
    // Nothing else can be shown without a working canvas.
  }
}

function bootstrap(): void {
  const runtime = getTtRuntime();
  if (!runtime) {
    return;
  }

  installFrameScheduler();

  const screenCanvas = runtime.createCanvas();
  const platform = new MiniGamePlatform();
  const sound = new SoundManager(platform.storage, () => {
    if (typeof runtime.createWebAudioContext !== 'function') {
      return null;
    }

    try {
      return runtime.createWebAudioContext();
    } catch {
      return null;
    }
  });

  let activeGame: Game | null = null;
  let starting = false;

  const startGame = (): void => {
    if (starting) {
      return;
    }
    starting = true;

    try {
      const previousGame = activeGame;
      activeGame = null;
      previousGame?.dispose();

      const sceneCanvas = runtime.createCanvas();
      prepareSceneCanvas(sceneCanvas);

      const ui = new MiniGameUi(screenCanvas, {
        sceneCanvas,
        soundControls: {
          enabled: sound.isEnabled,
          toggle: () => sound.toggle(),
        },
        onRestart: startGame,
      });
      platform.setInputSource(ui);

      const sceneManager = new SceneManager({
        canvas: sceneCanvas,
        width: ui.width,
        height: ui.height,
        pixelRatio: ui.pixelRatio,
      });

      const game = new Game({
        sceneManager,
        hud: ui,
        sound,
        platform,
      });
      activeGame = game;
      game.start();
    } catch (error) {
      activeGame?.dispose();
      activeGame = null;
      console.error('[海战霸主] 抖音小游戏启动失败', error);
      drawFatalError(
        screenCanvas,
        error instanceof Error ? error.message : '未知错误',
      );
    } finally {
      starting = false;
    }
  };

  startGame();
}

bootstrap();
