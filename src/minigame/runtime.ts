export interface TtTouch {
  identifier: number;
  clientX: number;
  clientY: number;
}

export interface TtTouchEvent {
  touches: TtTouch[];
  changedTouches: TtTouch[];
}

export interface TtSafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface TtSystemInfo {
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  safeArea?: TtSafeArea;
}

export type TtTouchHandler = (event: TtTouchEvent) => void;

/** Payload handed to `tt.onShow`; `scene` tells us where the launch came from. */
export interface TtShowOptions {
  scene?: string;
  query?: Record<string, string>;
  launch_from?: string;
  location?: string;
  showFrom?: number;
}

/** Shared shape of `tt.createInterstitialAd` / `tt.createRewardedVideoAd`. */
export interface TtAd {
  show(): Promise<void> | void;
  load?(): Promise<void> | void;
  hide?(): void;
  destroy?(): void;
  onClose?(listener: (result?: { isEnded?: boolean }) => void): void;
  offClose?(listener: (result?: { isEnded?: boolean }) => void): void;
  onError?(listener: (error: unknown) => void): void;
  offError?(listener: (error: unknown) => void): void;
}

/**
 * Minimal surface of the Douyin `tt` runtime used by this project.
 * Kept local so the web build does not depend on platform typings.
 *
 * Everything below the storage block is optional: the open-platform
 * capabilities only exist in the Douyin host, and calling them elsewhere has
 * to degrade quietly instead of throwing.
 */
export interface TtRuntime {
  getSystemInfoSync(): TtSystemInfo;
  createCanvas(): HTMLCanvasElement;
  createWebAudioContext?: () => AudioContext;
  onShow(listener: (options?: TtShowOptions) => void): void;
  offShow?(listener: (options?: TtShowOptions) => void): void;
  onHide(listener: () => void): void;
  offHide?(listener: () => void): void;
  onTouchStart(handler: TtTouchHandler): void;
  offTouchStart?(handler: TtTouchHandler): void;
  onTouchMove(handler: TtTouchHandler): void;
  offTouchMove?(handler: TtTouchHandler): void;
  onTouchEnd(handler: TtTouchHandler): void;
  offTouchEnd?(handler: TtTouchHandler): void;
  onTouchCancel(handler: TtTouchHandler): void;
  offTouchCancel?(handler: TtTouchHandler): void;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: string): void;
  removeStorageSync(key: string): void;
  onMemoryWarning?(listener: () => void): void;
  offMemoryWarning?(listener: () => void): void;

  /** Sidebar re-visit: the only supported `scene` value is `'sidebar'`. */
  navigateToScene?(options: {
    scene: 'sidebar';
    activity?: string;
    success?: (result: { code?: number; errMsg?: string }) => void;
    fail?: (error: { errMsg?: string; errorCode?: number }) => void;
  }): void;
  /** Home-screen shortcut. Must be called synchronously from a touch handler. */
  checkShortcut?(options: {
    success?: (result: { status?: string; exist?: boolean }) => void;
    fail?: (error: unknown) => void;
  }): void;
  addShortcut?(options: {
    success?: () => void;
    fail?: (error: { errMsg?: string; errNo?: number }) => void;
  }): void;
  /** Subscription messages. Also requires a user gesture. */
  requestSubscribeMessage?(options: {
    tmplIds: string[];
    success?: (result: unknown) => void;
    fail?: (error: unknown) => void;
  }): void;
  createInterstitialAd?(options: { adUnitId: string }): TtAd;
  createRewardedVideoAd?(options: { adUnitId: string }): TtAd;
}

export function getTtRuntime(): TtRuntime | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  const scope = globalThis as unknown as { tt?: TtRuntime };
  return scope.tt ?? null;
}
