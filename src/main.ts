import './style.css';
import { SoundManager } from './audio/SoundManager';
import { Game } from './game/Game';
import { SceneManager } from './game/SceneManager';
import { WebPlatform } from './platform/WebPlatform';
import { HUD } from './ui/HUD';

function showStartupError(root: HTMLElement, error: unknown): void {
  console.error('[海战霸主] 3D 场景启动失败', error);
  root.innerHTML = `
    <section class="fatal-error" role="alert">
      <p class="fatal-error__kicker">SYSTEM OFFLINE</p>
      <h1>无法启动 3D 场景</h1>
      <p>请确认浏览器已启用 WebGL，然后刷新页面重试。</p>
    </section>
  `;
}

function bootstrap(): void {
  const container = document.querySelector<HTMLElement>('#game-container');
  const uiRoot = document.querySelector<HTMLElement>('#ui-root');

  if (!container || !uiRoot) {
    throw new Error('缺少游戏挂载节点 #game-container 或 #ui-root');
  }

  let activeGame: Game | null = null;
  let starting = false;
  const platform = new WebPlatform();
  const sound = new SoundManager(platform.storage);

  const startGame = (): void => {
    if (starting) {
      return;
    }

    starting = true;

    let sceneManager: SceneManager | null = null;
    let hud: HUD | null = null;

    try {
      const previousGame = activeGame;
      activeGame = null;
      previousGame?.dispose();

      sceneManager = new SceneManager({ container });
      hud = new HUD(uiRoot, startGame, {
        enabled: sound.isEnabled,
        toggle: () => sound.toggle(),
      });

      const nextGame = new Game({
        sceneManager,
        hud,
        sound,
        platform,
        inputHost: uiRoot,
      });
      activeGame = nextGame;
      nextGame.start();
    } catch (error) {
      activeGame?.dispose();
      activeGame = null;
      hud?.dispose();
      sceneManager?.dispose();
      uiRoot.replaceChildren();
      showStartupError(uiRoot, error);
    } finally {
      starting = false;
    }
  };

  startGame();

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      activeGame?.dispose();
      activeGame = null;
      sound.dispose();
      platform.dispose();
    });
  }
}

bootstrap();
