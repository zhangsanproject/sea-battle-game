// Crops and scales a game icon through the browser canvas: the platform
// rejects watermarks, and the image generator stamps one on the bottom-right.
//
// Usage: serve the folder holding resize.html and the source image on
// ICON_URL, start Edge with --remote-debugging-port, then:
//   SRC=art.png OUT=icon-600.png node scripts/resize-icon.mjs
const PORT = process.env.CDP_PORT ?? '9333';
const HOST = process.env.CDP_HOST ?? '127.0.0.1';
const ICON_URL = process.env.ICON_URL ?? 'http://127.0.0.1:4174/resize.html';
const SRC = process.env.SRC ?? 'icon.png';
const OUT = process.env.OUT ?? 'icon-600.png';
const SIZE = Number(process.env.SIZE ?? 600);
const KEEP_RATIO = Number(process.env.KEEP_RATIO ?? 0.92);

const { writeFileSync } = await import('node:fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const list = await (
        await fetch(`http://${HOST}:${PORT}/json/list`)
      ).json();
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

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: ICON_URL });
await sleep(1500);

const result = await send('Runtime.evaluate', {
  expression: `window.resizeIcon(${JSON.stringify(SRC)}, ${SIZE}, ${KEEP_RATIO})`,
  awaitPromise: true,
  returnByValue: true,
});

const dataUrl = result?.result?.value;
if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png')) {
  throw new Error(`unexpected result: ${JSON.stringify(result).slice(0, 200)}`);
}

const base64 = dataUrl.slice('data:image/png;base64,'.length);
writeFileSync(OUT, Buffer.from(base64, 'base64'));
console.log(`wrote ${OUT} (${SIZE}x${SIZE})`);
ws.close();
