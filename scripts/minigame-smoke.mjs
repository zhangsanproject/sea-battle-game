/**
 * Smoke test for the Douyin mini-game bundle.
 *
 * It loads `minigame-dist/game.js` in a runtime that has no DOM and no WebGL,
 * only a fake `tt` object, and checks how far bootstrap gets:
 *
 *   1. the bundle evaluates without touching undefined browser globals,
 *   2. the screen canvas and the scene canvas are requested from `tt`,
 *   3. the 2D context is created and touch handlers are registered,
 *   4. when WebGL is unavailable the fatal-error screen is drawn instead of
 *      leaving a blank canvas,
 *   5. loading the bundle without a `tt` global is a no-op.
 *
 * This is NOT a substitute for the Douyin devtools or a real device.
 * It only proves the bundle is loadable and wired up outside a browser.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = path.join(root, 'minigame-dist', 'game.js');

const observations = {
  canvases: 0,
  contextRequests: [],
  texts: [],
  fills: 0,
  draws: 0,
  transforms: [],
  touchHandlers: { start: 0, move: 0, end: 0, cancel: 0 },
  lifecycle: { show: 0, hide: 0 },
  systemInfoCalls: 0,
  storage: new Map(),
  consoleErrors: [],
};

const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function createContext2D(canvas) {
  return {
    canvas,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    globalAlpha: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    setTransform(a, b, c, d, e, f) {
      observations.transforms.push([a, b, c, d, e, f]);
    },
    clearRect() {},
    fillRect() {
      observations.fills += 1;
    },
    fillText(text, x, y) {
      observations.texts.push({ text: String(text), x, y });
    },
    strokeText() {},
    measureText(text) {
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
      observations.draws += 1;
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
  };
}

function createCanvas() {
  observations.canvases += 1;

  const canvas = {
    width: 0,
    height: 0,
    style: {},
    addEventListener() {},
    removeEventListener() {},
    getContext(type) {
      observations.contextRequests.push(type);

      if (type !== '2d') {
        // No WebGL in this harness: three.js must fail cleanly.
        return null;
      }

      if (!canvas.__context2d) {
        canvas.__context2d = createContext2D(canvas);
      }

      return canvas.__context2d;
    },
  };

  return canvas;
}

function createTt() {
  return {
    getSystemInfoSync() {
      observations.systemInfoCalls += 1;
      return {
        screenWidth: 375,
        screenHeight: 812,
        pixelRatio: 3,
        safeArea: { top: 44, bottom: 778, left: 0, right: 375, width: 375, height: 734 },
      };
    },
    createCanvas,
    onShow() {
      observations.lifecycle.show += 1;
    },
    offShow() {},
    onHide() {
      observations.lifecycle.hide += 1;
    },
    offHide() {},
    onTouchStart() {
      observations.touchHandlers.start += 1;
    },
    offTouchStart() {},
    onTouchMove() {
      observations.touchHandlers.move += 1;
    },
    offTouchMove() {},
    onTouchEnd() {
      observations.touchHandlers.end += 1;
    },
    offTouchEnd() {},
    onTouchCancel() {
      observations.touchHandlers.cancel += 1;
    },
    offTouchCancel() {},
    getStorageSync(key) {
      return observations.storage.get(key) ?? '';
    },
    setStorageSync(key, value) {
      observations.storage.set(key, value);
    },
    removeStorageSync(key) {
      observations.storage.delete(key);
    },
  };
}

const bundle = await readFile(bundlePath, 'utf8');
const originalConsoleError = console.error;

function runBundle() {
  vm.runInThisContext(bundle, { filename: 'minigame-dist/game.js' });
}

// Scenario A: a Douyin-like runtime without DOM and without WebGL.
globalThis.tt = createTt();
console.error = (...args) => {
  observations.consoleErrors.push(args.map((value) => String(value)).join(' '));
};

try {
  runBundle();
  check(true, '');
} catch (error) {
  failures.push(
    `bundle threw during evaluation: ${error instanceof Error ? error.stack : String(error)}`,
  );
}

console.error = originalConsoleError;

check(observations.canvases >= 2, 'expected a screen canvas and a scene canvas from tt.createCanvas');
check(
  observations.contextRequests.includes('2d'),
  'expected a 2D context for the composited HUD canvas',
);
check(
  observations.contextRequests.some((type) => type === 'webgl2' || type === 'webgl'),
  'expected three.js to request a WebGL context',
);
check(
  observations.systemInfoCalls > 0,
  'expected tt.getSystemInfoSync to be called for screen metrics',
);
check(
  observations.touchHandlers.start === 1 &&
    observations.touchHandlers.move === 1 &&
    observations.touchHandlers.end === 1 &&
    observations.touchHandlers.cancel === 1,
  'expected the four touch handlers to be registered exactly once',
);
check(
  observations.lifecycle.show > 0 && observations.lifecycle.hide > 0,
  'expected onShow/onHide lifecycle hooks to be registered',
);
check(
  observations.texts.some((entry) => entry.text.includes('海战霸主启动失败')),
  'expected the fatal-error screen to be drawn when WebGL is unavailable',
);
check(
  observations.consoleErrors.some((line) => line.includes('抖音小游戏启动失败')),
  'expected the startup failure to be logged with context',
);
check(
  observations.transforms.some((matrix) => matrix[0] === 2 && matrix[3] === 2),
  'expected the HUD canvas to be scaled by the capped device pixel ratio',
);

// Scenario B: the bundle is loaded where no `tt` exists (for example a browser).
delete globalThis.tt;
const canvasesBeforeNoTt = observations.canvases;
let noTtError = null;

try {
  runBundle();
} catch (error) {
  noTtError = error;
}

check(
  noTtError === null,
  `bundle must be a no-op without a tt global, got: ${noTtError instanceof Error ? noTtError.message : String(noTtError)}`,
);
check(
  observations.canvases === canvasesBeforeNoTt,
  'bundle must not create canvases when no tt global exists',
);

if (failures.length > 0) {
  console.error('Douyin mini-game smoke test FAILED');
  for (const failure of failures) {
    console.error(` - ${failure}`);
  }
  process.exit(1);
}

console.log('Douyin mini-game smoke test passed');
console.log(`  canvases created: ${observations.canvases}`);
console.log(`  context requests: ${observations.contextRequests.join(', ')}`);
console.log(`  touch handlers: ${JSON.stringify(observations.touchHandlers)}`);
console.log(`  lifecycle hooks: ${JSON.stringify(observations.lifecycle)}`);
console.log(
  `  fatal screen text: ${observations.texts.map((entry) => entry.text).join(' | ')}`,
);
console.log('  note: WebGL is stubbed out, so the render loop itself is not exercised');
