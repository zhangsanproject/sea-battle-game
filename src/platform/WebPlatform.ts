import { InputManager } from '../input/InputManager';
import type {
  InputSource,
  KeyValueStorage,
  PlatformAdapter,
  Unsubscribe,
} from './PlatformAdapter';

class ResilientStorage implements KeyValueStorage {
  private readonly memory = new Map<string, string>();

  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return this.memory.get(key) ?? null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      this.memory.set(key, value);
    }
  }

  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      this.memory.delete(key);
    }
  }
}

export class WebPlatform implements PlatformAdapter {
  readonly storage: KeyValueStorage = new ResilientStorage();

  private readonly pauseListeners = new Set<() => void>();
  private readonly resumeListeners = new Set<() => void>();
  private disposed = false;

  constructor() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  createInput(uiRoot: HTMLElement): InputSource {
    return new InputManager(uiRoot);
  }

  isPaused(): boolean {
    return document.visibilityState === 'hidden';
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
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange,
    );
    this.pauseListeners.clear();
    this.resumeListeners.clear();
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.disposed) {
      return;
    }

    const listeners =
      document.visibilityState === 'hidden'
        ? this.pauseListeners
        : this.resumeListeners;

    for (const listener of listeners) {
      listener();
    }
  };
}
