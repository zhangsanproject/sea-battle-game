import { afterEach, describe, expect, it } from 'vitest';
import { detectMaxPixelRatio } from '../src/game/SceneManager';

type WindowLike = { matchMedia?: (query: string) => { matches: boolean } };
const scope = globalThis as unknown as { window?: WindowLike };
const originalWindow = scope.window;

function setWindow(value: WindowLike | undefined): void {
  Object.defineProperty(globalThis, 'window', {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  setWindow(originalWindow);
});

describe('detectMaxPixelRatio', () => {
  it('falls back to the touch cap when there is no window at all', () => {
    setWindow(undefined);
    expect(detectMaxPixelRatio()).toBe(1.5);
  });

  it('uses 1.5 for a coarse pointer', () => {
    setWindow({ matchMedia: () => ({ matches: true }) });
    expect(detectMaxPixelRatio()).toBe(1.5);
  });

  it('uses 2 for a fine pointer', () => {
    setWindow({ matchMedia: () => ({ matches: false }) });
    expect(detectMaxPixelRatio()).toBe(2);
  });

  it('survives a host matchMedia that throws Illegal invocation', () => {
    setWindow({
      matchMedia: () => {
        throw new TypeError('Illegal invocation');
      },
    });

    expect(() => detectMaxPixelRatio()).not.toThrow();
    expect(detectMaxPixelRatio()).toBe(1.5);
  });

  it('survives a window shim without matchMedia', () => {
    setWindow({});
    expect(detectMaxPixelRatio()).toBe(1.5);
  });
});
