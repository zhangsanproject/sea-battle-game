// Samples a live run through the DevTools Protocol and prints one line per
// poll, so a balance pass can be judged on the actual difficulty curve instead
// of a single screenshot.
//
// Usage: start a static server on GAME_URL and Edge with
// --remote-debugging-port=9333, then `node scripts/sample-run.mjs`.
const PORT = process.env.CDP_PORT ?? '9333';
const URL_TO_OPEN = process.env.GAME_URL ?? 'http://127.0.0.1:4173/';
const RUN_MS = Number(process.env.RUN_MS ?? 120_000);
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 2000);

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

const STATE_EXPR = `(() => {
  const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? '';
  return {
    danger: text('[data-danger]'),
    level: text('[data-level]'),
    health: text('[data-health]'),
    maxHealth: text('[data-max-health]'),
    boss: document.querySelector('[data-boss]')?.hidden === false,
    upgrade: document.querySelector('[data-levelup]')?.hidden === false,
    gameOver: document.querySelector('[data-gameover]')?.hidden === false,
    kills: text('[data-result-kills]'),
    survival: text('[data-result-time]'),
  };
})()`;

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL_TO_OPEN });
await sleep(3500);

const order = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
let held = null;
let tick = 0;
let picks = 0;
const startedAt = Date.now();

console.log('t_s\tgame\tdanger\tlevel\thp\tboss\tpicks');

while (Date.now() - startedAt < RUN_MS) {
  const pickedUp = await evaluate(`(() => {
    const card = document.querySelector('.hud__upgrade-card[data-upgrade-id]');
    if (!card) return false;
    card.click();
    return true;
  })()`);
  if (pickedUp) picks += 1;

  if (tick % 4 === 0) {
    if (held) await key('keyUp', held);
    held = order[(tick / 4) % order.length];
    await key('keyDown', held);
  }

  const state = await evaluate(STATE_EXPR);
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);

  console.log(
    [
      seconds,
      '',
      state?.danger ?? '',
      state?.level ?? '',
      `${state?.health ?? ''}/${state?.maxHealth ?? ''}`,
      state?.boss ? 'Y' : '',
      picks,
    ].join('\t'),
  );

  if (state?.gameOver) {
    console.log(
      `\nGAME OVER  kills=${state.kills}  survival=${state.survival}  picks=${picks}`,
    );
    break;
  }

  tick += 1;
  await sleep(SAMPLE_MS);
}

ws.close();
