import { getTtRuntime, type TtRuntime } from '../minigame/runtime';
import type {
  InputSource,
  KeyValueStorage,
  PlatformAdapter,
  Unsubscribe,
} from './PlatformAdapter';

class MiniGameStorage implements KeyValueStorage {
  private readonly memory = new Map<string, string>();
  private readonly runtime: TtRuntime | null;

  constructor(runtime: TtRuntime | null) {
    this.runtime = runtime;
  }

  getItem(key: string): string | null {
    if (this.runtime) {
      try {
        const value = this.runtime.getStorageSync(key);
        if (typeof value === 'string' && value.length > 0) {
          return value;
        }
      } catch {
        // Fall through to the in-memory copy.
      }
    }

    return this.memory.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.memory.set(key, value);

    try {
      this.runtime?.setStorageSync(key, value);
    } catch {
      // The in-memory copy keeps the preference for this session.
    }
  }

  removeItem(key: string): void {
    this.memory.delete(key);

    try {
      this.runtime?.removeStorageSync(key);
    } catch {
      // Ignore storage failures on restricted runtimes.
    }
  }
}

/**
 * Douyin mini-game platform: `tt` storage, lifecycle hooks, and touch input.
 * The input source is supplied by the canvas UI because it also owns touch
 * handling for upgrade cards and the restart button.
 */
export class MiniGamePlatform implements PlatformAdapter {
  readonly storage: KeyValueStorage;

  private readonly runtime: TtRuntime | null;
  private readonly pauseListeners = new Set<() => void>();
  private readonly resumeListeners = new Set<() => void>();
  private inputSource: InputSource | null = null;
  private paused = false;
  private disposed = false;

  constructor() {
    this.runtime = getTtRuntime();
    this.storage = new MiniGameStorage(this.runtime);
    this.runtime?.onShow?.(this.handleShow);
    this.runtime?.onHide?.(this.handleHide);
  }

  setInputSource(input: InputSource): void {
    this.inputSource = input;
  }

  createInput(): InputSource {
    if (!this.inputSource) {
      throw new Error('Mini-game input source has not been configured');
    }
    return this.inputSource;
  }

  isPaused(): boolean {
    return this.paused;
  }

  onPause(listener: () => void): Unsubscribe {
    this.pauseListeners.add(listener);
    return () => {
      this.pauseListeners.delete(listener);
    };
  }

  onResume(listener: () => void): Unsubscribe {
    this.resumeListeners.add(listener);
    return () => {
      this.resumeListeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.runtime?.offShow?.(this.handleShow);
    this.runtime?.offHide?.(this.handleHide);
    this.pauseListeners.clear();
    this.resumeListeners.clear();
    this.inputSource = null;
  }

  private readonly handleShow = (): void => {
    if (this.disposed) {
      return;
    }

    this.paused = false;
    for (const listener of this.resumeListeners) {
      listener();
    }
  };

  private readonly handleHide = (): void => {
    if (this.disposed) {
      return;
    }

    this.paused = true;
    for (const listener of this.pauseListeners) {
      listener();
    }
  };
}
