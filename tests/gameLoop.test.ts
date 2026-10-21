import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameLoop } from '../src/game/GameLoop';

interface Harness {
  loop: GameLoop;
  fixed: number[];
  renders: number[];
  tick: (timestamp: number) => void;
}

let harness: Harness | null = null;

function createHarness(): Harness {
  const pending: Array<(timestamp: number) => void> = [];

  vi.stubGlobal('requestAnimationFrame', (callback: (t: number) => void) => {
    pending.push(callback);
    return pending.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});

  const fixed: number[] = [];
  const renders: number[] = [];

  const loop = new GameLoop({
    fixedUpdate: (delta) => {
      fixed.push(delta);
    },
    render: (delta) => {
      renders.push(delta);
    },
  });

  const tick = (timestamp: number): void => {
    const callback = pending.shift();
    callback?.(timestamp);
  };

  harness = { loop, fixed, renders, tick };
  return harness;
}

beforeEach(() => {
  harness = null;
});

afterEach(() => {
  harness?.loop.dispose();
  vi.unstubAllGlobals();
});

describe('GameLoop pause', () => {
  it('steps the simulation at 60 Hz', () => {
    const { loop, fixed, tick } = createHarness();

    loop.start();
    tick(0);
    tick(50);

    // 50 ms of accumulated time is three fixed steps.
    expect(fixed).toHaveLength(3);
    expect(fixed[0]).toBeCloseTo(1 / 60, 6);
  });

  it('keeps rendering but stops stepping while paused', () => {
    const { loop, fixed, renders, tick } = createHarness();

    loop.start();
    tick(0);
    tick(50);
    const stepsBefore = fixed.length;

    loop.setPaused(true);
    tick(100);
    tick(150);

    expect(fixed).toHaveLength(stepsBefore);
    // The overlay needs frames; render must keep running.
    expect(renders).toHaveLength(4);
  });

  it('does not replay the paused gap after resuming', () => {
    const { loop, fixed, tick } = createHarness();
    const base = performance.now();

    loop.start();
    tick(base + 50);
    loop.setPaused(true);
    tick(base + 20_000);
    loop.setPaused(false);

    const beforeResume = fixed.length;
    tick(base + 20_010);

    // A 20-second gap is capped at one MAX_FRAME_DELTA frame (6 steps),
    // never replayed as 1200 catch-up steps.
    expect(fixed.length - beforeResume).toBeLessThanOrEqual(6);

    tick(base + 20_027);
    expect(fixed.length - beforeResume).toBeLessThanOrEqual(7);
  });

  it('ignores repeated pause requests', () => {
    const { loop, tick, renders } = createHarness();

    loop.start();
    tick(0);
    loop.setPaused(true);
    loop.setPaused(true);
    tick(20);

    expect(loop.isPaused).toBe(true);
    expect(renders).toHaveLength(2);
  });
});
