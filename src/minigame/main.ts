import { SoundManager } from '../audio/SoundManager';
import { Game } from '../game/Game';
import { SceneManager } from '../game/SceneManager';
import { MiniGamePlatform } from '../platform/MiniGamePlatform';
import { CAPABILITY_CONFIG } from './capabilityConfig';
import { BONUS_UPGRADE_KEY } from './openCapabilities';
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

function drawFatalError(canvas: HTMLCanvasElement, error: unknown): void {
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

    const message = error instanceof Error ? error.message : '未知错误';
    // The devtools console is easy to lose in a screenshot, so the first few
    // stack frames are painted on screen as well.
    const frames =
      error instanceof Error && error.stack
        ? error.stack
            .split('\n')
            .slice(1, 4)
            .map((line) => line.trim().slice(0, 46))
        : [];

    context.fillStyle = '#071c26';
    context.fillRect(0, 0, info.screenWidth, info.screenHeight);
    context.fillStyle = '#ffd98a';
    context.font = 'bold 22px sans-serif';
    context.textAlign = 'center';
    context.fillText('海战霸主启动失败', info.screenWidth / 2, 100);
    context.fillStyle = '#cfe9ee';
    context.font = '14px sans-serif';
    context.fillText(message, info.screenWidth / 2, 140);
    context.textAlign = 'left';
    context.font = '11px monospace';
    frames.forEach((frame, index) => {
      context.fillText(frame, 16, 176 + index * 16);
    });
    context.textAlign = 'center';
    context.font = '14px sans-serif';
    context.fillText(
      '请确认设备支持 WebGL2 后重新进入',
      info.screenWidth / 2,
      176 + frames.length * 16 + 28,
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
  const platform = new MiniGamePlatform(CAPABILITY_CONFIG);
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
  let activeScene: SceneManager | null = null;
  let starting = false;
  let noticeShown = false;

  // Memory pressure is a signal from the host, not a guess: drop the render
  // resolution immediately instead of waiting for the frame-time sampler.
  platform.onMemoryWarning(() => {
    activeScene?.applyLowQuality();
  });

  const startGame = (): void => {
    if (starting) {
      return;
    }
    starting = true;

    try {
      const previousGame = activeGame;
      const previousScene = activeScene;
      activeGame = null;
      activeScene = null;
      previousGame?.dispose();
      previousScene?.dispose();

      const sceneCanvas = runtime.createCanvas();
      prepareSceneCanvas(sceneCanvas);

      const ui = new MiniGameUi(screenCanvas, {
        sceneCanvas,
        soundControls: {
          enabled: sound.isEnabled,
          toggle: () => sound.toggle(),
        },
        // One pause path for both the button and the host lifecycle.
        pauseControls: {
          isPaused: () => platform.isPaused(),
          toggle: () => platform.togglePause(),
        },
        onRestart: startGame,
        capabilities: platform.capabilities,
        // The video must be finished before the reward is banked; the next run
        // collects it from storage and hands out a free upgrade.
        onRewardedAd: () => {
          void platform.capabilities.showRewardedAd().then((earned) => {
            if (!earned) {
              ui.showKillFeedback('视频未看完，未发放奖励');
              return;
            }

            const stored = Number.parseInt(
              platform.storage.getItem(BONUS_UPGRADE_KEY) ?? '',
              10,
            );
            const next = (Number.isFinite(stored) ? stored : 0) + 1;
            platform.storage.setItem(BONUS_UPGRADE_KEY, String(next));
            ui.showKillFeedback('下一局开局 +1 次强化');
          });
        },
        // The helium runtime cannot listen for pointerdown, so the audio
        // context is unlocked from our own first touch instead.
        onFirstTouch: () => sound.unlock(),
        operatorLine: '适龄提示与隐私说明见启动页',
      });
      platform.setInputSource(ui);

      const sceneManager = new SceneManager({
        canvas: sceneCanvas,
        width: ui.width,
        height: ui.height,
        pixelRatio: ui.pixelRatio,
        // Match the 2D layer one-to-one. Anything lower means the 3D frame is
        // drawn into a smaller buffer and then stretched by drawImage, which
        // is the main reason the phone build looked soft.
        maxPixelRatio: ui.pixelRatio,
        // At 2x-3x device ratio the extra MSAA pass buys very little, so the
        // resolution budget goes into more pixels instead of smoother edges.
        antialias: false,
        shadowMapSize: 1024,
      });
      activeScene = sceneManager;
      ui.attachCamera(sceneManager.camera);

      const game = new Game({
        sceneManager,
        hud: ui,
        sound,
        platform,
      });
      activeGame = game;

      if (noticeShown) {
        game.start();
      } else {
        noticeShown = true;
        ui.showComplianceNotice(() => {
          game.start();
        });
      }
    } catch (error) {
      activeGame?.dispose();
      activeGame = null;
      activeScene = null;
      console.error('[海战霸主] 抖音小游戏启动失败', error);
      drawFatalError(screenCanvas, error);
    } finally {
      starting = false;
    }
  };

  startGame();
}

bootstrap();
