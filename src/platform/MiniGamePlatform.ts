import {
  OpenCapabilities,
  type OpenCapabilityConfig,
} from '../minigame/openCapabilities';
import {
  getTtRuntime,
  type TtRuntime,
  type TtShowOptions,
} from '../minigame/runtime';
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
  readonly capabilities: OpenCapabilities;

  private readonly runtime: TtRuntime | null;
  private readonly pauseListeners = new Set<() => void>();
  private readonly resumeListeners = new Set<() => void>();
  private readonly memoryWarningListeners = new Set<() => void>();
  private inputSource: InputSource | null = null;
  private paused = false;
  /** A pause requested by the player (pause button), not by the host. */
  private manuallyPaused = false;
  private disposed = false;

  constructor(capabilityConfig: OpenCapabilityConfig = {}) {
    this.runtime = getTtRuntime();
    this.storage = new MiniGameStorage(this.runtime);
    this.capabilities = new OpenCapabilities(
      this.runtime,
      this.storage,
      capabilityConfig,
    );
    // The sidebar check has to read the raw onShow payload, and it has to be
    // registered before anything else runs: a late listener misses the resume
    // from the sidebar and the reward never arrives.
    this.runtime?.onShow?.(this.handleShowWithCapabilities);
    this.runtime?.onHide?.(this.handleHide);
    this.runtime?.onMemoryWarning?.(this.handleMemoryWarning);
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

  /**
   * Drives the same pause path the host uses, so the in-game pause button and
   * a phone call produce identical behaviour.
   */
  togglePause(): boolean {
    if (this.paused) {
      this.manuallyPaused = false;
      this.setPaused(false);
      return false;
    }

    this.manuallyPaused = true;
    this.setPaused(true);
    return true;
  }

  requestPause(): void {
    this.manuallyPaused = true;
    this.setPaused(true);
  }

  requestResume(): void {
    this.manuallyPaused = false;
    this.setPaused(false);
  }

  /** Memory pressure is not something the renderer can argue with. */
  onMemoryWarning(listener: () => void): Unsubscribe {
    this.memoryWarningListeners.add(listener);
    return () => {
      this.memoryWarningListeners.delete(listener);
    };
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

    this.runtime?.offShow?.(this.handleShowWithCapabilities);
    this.runtime?.offHide?.(this.handleHide);
    this.runtime?.offMemoryWarning?.(this.handleMemoryWarning);
    this.pauseListeners.clear();
    this.resumeListeners.clear();
    this.memoryWarningListeners.clear();
    this.inputSource = null;
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused || this.disposed) {
      return;
    }

    this.paused = paused;
    const listeners = paused ? this.pauseListeners : this.resumeListeners;
    for (const listener of listeners) {
      listener();
    }
  }

  private readonly handleShowWithCapabilities = (
    options?: TtShowOptions,
  ): void => {
    this.capabilities.handleShow(options);
    this.handleShow();
  };

  private readonly handleShow = (): void => {
    if (this.disposed) {
      return;
    }

    // A player who paused before backgrounding the game stays paused.
    if (this.manuallyPaused) {
      return;
    }

    this.setPaused(false);
  };

  private readonly handleHide = (): void => {
    if (this.disposed) {
      return;
    }

    this.setPaused(true);
  };

  private readonly handleMemoryWarning = (): void => {
    if (this.disposed) {
      return;
    }

    for (const listener of this.memoryWarningListeners) {
      listener();
    }
  };
}
