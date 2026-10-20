import type {
  TtRuntime,
  TtSystemInfo,
  TtTouchEvent,
  TtTouchHandler,
} from '../../src/minigame/runtime';

export interface FakeContextCalls {
  texts: string[];
  fills: number;
  draws: number;
  transforms: number[][];
}

export interface FakeCanvas {
  width: number;
  height: number;
  style: Record<string, string>;
  addEventListener: () => void;
  removeEventListener: () => void;
  getContext: (type: string) => unknown;
  calls: FakeContextCalls;
  contextTypes: string[];
  __context?: unknown;
}

export interface FakeRuntime {
  runtime: TtRuntime;
  canvases: FakeCanvas[];
  storage: Map<string, string>;
  touchHandlers: {
    start: TtTouchHandler[];
    move: TtTouchHandler[];
    end: TtTouchHandler[];
    cancel: TtTouchHandler[];
  };
  lifecycle: { show: Array<() => void>; hide: Array<() => void> };
  removeTouchHandlerCalls: number;
  systemInfo: TtSystemInfo;
  setStorageThrows: boolean;
}

function createContext2D(canvas: FakeCanvas): Record<string, unknown> {
  return {
    canvas,
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    setTransform(...values: number[]) {
      canvas.calls.transforms.push(values);
    },
    clearRect() {},
    fillRect() {
      canvas.calls.fills += 1;
    },
    fillText(text: string) {
      canvas.calls.texts.push(String(text));
    },
    strokeText() {},
    measureText(text: string) {
      return { width: String(text).length * 8 };
    },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arc() {},
    rect() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    drawImage() {
      canvas.calls.draws += 1;
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
  };
}

export function createFakeRuntime(
  systemInfo: Partial<TtSystemInfo> = {},
): FakeRuntime {
  const fake: FakeRuntime = {
    runtime: null as unknown as TtRuntime,
    canvases: [],
    storage: new Map<string, string>(),
    touchHandlers: { start: [], move: [], end: [], cancel: [] },
    lifecycle: { show: [], hide: [] },
    removeTouchHandlerCalls: 0,
    systemInfo: {
      screenWidth: 375,
      screenHeight: 812,
      pixelRatio: 3,
      safeArea: {
        top: 44,
        bottom: 778,
        left: 0,
        right: 375,
        width: 375,
        height: 734,
      },
      ...systemInfo,
    },
    setStorageThrows: false,
  };

  const runtime = {
    getSystemInfoSync: () => fake.systemInfo,
    createCanvas: () => {
      const canvas: FakeCanvas = {
        width: 0,
        height: 0,
        style: {},
        addEventListener() {},
        removeEventListener() {},
        calls: { texts: [], fills: 0, draws: 0, transforms: [] },
        contextTypes: [],
        getContext(type: string) {
          canvas.contextTypes.push(type);
          if (type !== '2d') {
            return null;
          }
          if (!canvas.__context) {
            canvas.__context = createContext2D(canvas);
          }
          return canvas.__context;
        },
      } as FakeCanvas;

      fake.canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
    onShow: (listener: () => void) => {
      fake.lifecycle.show.push(listener);
    },
    offShow: (listener: () => void) => {
      fake.lifecycle.show = fake.lifecycle.show.filter(
        (entry) => entry !== listener,
      );
    },
    onHide: (listener: () => void) => {
      fake.lifecycle.hide.push(listener);
    },
    offHide: (listener: () => void) => {
      fake.lifecycle.hide = fake.lifecycle.hide.filter(
        (entry) => entry !== listener,
      );
    },
    onTouchStart: (handler: TtTouchHandler) => {
      fake.touchHandlers.start.push(handler);
    },
    offTouchStart: (handler: TtTouchHandler) => {
      fake.removeTouchHandlerCalls += 1;
      fake.touchHandlers.start = fake.touchHandlers.start.filter(
        (entry) => entry !== handler,
      );
    },
    onTouchMove: (handler: TtTouchHandler) => {
      fake.touchHandlers.move.push(handler);
    },
    offTouchMove: (handler: TtTouchHandler) => {
      fake.removeTouchHandlerCalls += 1;
      fake.touchHandlers.move = fake.touchHandlers.move.filter(
        (entry) => entry !== handler,
      );
    },
    onTouchEnd: (handler: TtTouchHandler) => {
      fake.touchHandlers.end.push(handler);
    },
    offTouchEnd: (handler: TtTouchHandler) => {
      fake.removeTouchHandlerCalls += 1;
      fake.touchHandlers.end = fake.touchHandlers.end.filter(
        (entry) => entry !== handler,
      );
    },
    onTouchCancel: (handler: TtTouchHandler) => {
      fake.touchHandlers.cancel.push(handler);
    },
    offTouchCancel: (handler: TtTouchHandler) => {
      fake.removeTouchHandlerCalls += 1;
      fake.touchHandlers.cancel = fake.touchHandlers.cancel.filter(
        (entry) => entry !== handler,
      );
    },
    getStorageSync: (key: string) => fake.storage.get(key) ?? '',
    setStorageSync: (key: string, value: string) => {
      if (fake.setStorageThrows) {
        throw new Error('storage unavailable');
      }
      fake.storage.set(key, value);
    },
    removeStorageSync: (key: string) => {
      if (fake.setStorageThrows) {
        throw new Error('storage unavailable');
      }
      fake.storage.delete(key);
    },
  };

  fake.runtime = runtime as unknown as TtRuntime;
  return fake;
}

export function installRuntime(fake: FakeRuntime): void {
  (globalThis as unknown as { tt?: TtRuntime }).tt = fake.runtime;
}

export function uninstallRuntime(): void {
  delete (globalThis as unknown as { tt?: TtRuntime }).tt;
}

export function emitTouch(
  handlers: TtTouchHandler[],
  identifier: number,
  x: number,
  y: number,
): void {
  const event: TtTouchEvent = {
    touches: [{ identifier, clientX: x, clientY: y }],
    changedTouches: [{ identifier, clientX: x, clientY: y }],
  };

  for (const handler of handlers) {
    handler(event);
  }
}

export function emitTouchEnd(
  handlers: TtTouchHandler[],
  identifier: number,
  x: number,
  y: number,
): void {
  const event: TtTouchEvent = {
    touches: [],
    changedTouches: [{ identifier, clientX: x, clientY: y }],
  };

  for (const handler of handlers) {
    handler(event);
  }
}
