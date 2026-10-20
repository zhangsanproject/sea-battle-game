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

/**
 * Minimal surface of the Douyin `tt` runtime used by this project.
 * Kept local so the web build does not depend on platform typings.
 */
export interface TtRuntime {
  getSystemInfoSync(): TtSystemInfo;
  createCanvas(): HTMLCanvasElement;
  createWebAudioContext?: () => AudioContext;
  onShow(listener: () => void): void;
  offShow?(listener: () => void): void;
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
}

export function getTtRuntime(): TtRuntime | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  const scope = globalThis as unknown as { tt?: TtRuntime };
  return scope.tt ?? null;
}
