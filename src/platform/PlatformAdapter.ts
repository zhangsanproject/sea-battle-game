import type { Vector2 } from 'three';

export interface InputSource {
  getMoveVector(out: Vector2): Vector2;
  setEnabled(enabled: boolean): void;
  reset(): void;
  dispose(): void;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type Unsubscribe = () => void;

/**
 * Boundary between game logic and a host environment.
 * A Douyin adapter can provide its own canvas input, storage, and lifecycle.
 */
export interface PlatformAdapter {
  readonly storage: KeyValueStorage;
  createInput(host?: HTMLElement | null): InputSource;
  isPaused(): boolean;
  onPause(listener: () => void): Unsubscribe;
  onResume(listener: () => void): Unsubscribe;
  dispose(): void;
}
