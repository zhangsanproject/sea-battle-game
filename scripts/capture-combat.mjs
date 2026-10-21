// Drives the built web game through the Chrome DevTools Protocol so we can
// look at a real combat frame instead of a pause overlay.
import { writeFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT ?? '9333';
const URL_TO_OPEN = process.env.GAME_URL ?? 'http://127.0.0.1:4173/';
const OUT = process.env.OUT ?? 'C:/Users/Administrator/AppData/Local/Temp/combat.png';
const RUN_MS = Number(process.env.RUN_MS ?? 26_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((entry) => entry.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      /* browser not up yet */
    }
    await sleep(250);
  }
  throw new Error('no debuggable page');
}

const page = await findPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let nextId = 0;
const waiting = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && waiting.has(message.id)) {
    const { resolve, reject } = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
};

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false,
  });
  return result?.result?.value;
}

const KEYS = {
  KeyA: { key: 'a', code: 'KeyA', vk: 65 },
  KeyD: { key: 'd', code: 'KeyD', vk: 68 },
  KeyW: { key: 'w', code: 'KeyW', vk: 87 },
  KeyS: { key: 's', code: 'KeyS', vk: 83 },
};

async function key(type, name) {
  const spec = KEYS[name];
  await send('Input.dispatchKeyEvent', {
    type,
    key: spec.key,
    code: spec.code,
    windowsVirtualKeyCode: spec.vk,
    nativeVirtualKeyCode: spec.vk,
  });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL_TO_OPEN });
await sleep(3500);

// Pick whatever upgrade card is on screen; the pause would otherwise freeze
// the whole run and we would only ever see the overlay.
async function clickCard() {
  return evaluate(`(() => {
    const card = document.querySelector('.hud__upgrade-card[data-upgrade-id]');
    if (!card) return false;
    card.click();
    return true;
  })()`);
}

const startedAt = Date.now();
const order = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
const holdStill = process.env.HOLD_STILL === '1';
const bossWindow = Number(process.env.BOSS_WINDOW_MS ?? 0);
let held = null;
let picks = 0;
let tick = 0;
let bossSeenAt = 0;

while (Date.now() - startedAt < RUN_MS) {
  if (await clickCard()) {
    picks += 1;
  }

  if (!holdStill && tick % 8 === 0) {
    if (held) await key('keyUp', held);
    held = order[(tick / 8) % order.length];
    await key('keyDown', held);
  }

  if (bossWindow > 0) {
    const bossVisible = await evaluate(
      `document.querySelector('[data-boss]')?.hidden === false`,
    );
    if (bossVisible && bossSeenAt === 0) {
      bossSeenAt = Date.now();
    }
    if (bossSeenAt > 0 && Date.now() - bossSeenAt >= bossWindow) {
      break;
    }
  }

  tick += 1;
  await sleep(250);
}

// Hold still for the capture so the frame is not mid-turn.
if (held) await key('keyUp', held);
await sleep(400);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

const state = await evaluate(`(() => {
  const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? '';
  return {
    level: text('[data-level]'),
    hp: text('[data-health]') + '/' + text('[data-max-health]'),
    experience: text('[data-experience-text]'),
    danger: text('[data-danger]'),
    gameOver: document.querySelector('[data-gameover]')?.hidden === false,
    upgradeOpen: document.querySelector('[data-levelup]')?.hidden === false,
  };
})()`);

console.log(JSON.stringify({ picks, state, out: OUT }, null, 2));
ws.close();
