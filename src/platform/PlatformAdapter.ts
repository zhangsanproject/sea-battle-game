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
 * Open-platform capabilities the UI can offer. Every method must tolerate a
 * missing host implementation: the web build exposes the same surface with
 * everything disabled so call sites never branch on platform.
 */
export interface GameCapabilities {
  readonly sidebarRewardReady: boolean;
  readonly canOfferSidebar: boolean;
  readonly canOfferShortcut: boolean;
  readonly canOfferSubscribe: boolean;
  readonly canOfferRewardedAd: boolean;
  consumeSidebarReward(): boolean;
  openSidebar(): boolean;
  requestShortcut(): boolean;
  requestSubscribe(): boolean;
  showRewardedAd(): Promise<boolean>;
  showInterstitialAd(): void;
}

/**
 * Boundary between game logic and a host environment.
 * A Douyin adapter can provide its own canvas input, storage, and lifecycle.
 */
export interface PlatformAdapter {
  readonly storage: KeyValueStorage;
  /** Absent in environments that have no open-platform surface at all. */
  readonly capabilities?: GameCapabilities;
  createInput(host?: HTMLElement | null): InputSource;
  isPaused(): boolean;
  onPause(listener: () => void): Unsubscribe;
  onResume(listener: () => void): Unsubscribe;
  dispose(): void;
}
