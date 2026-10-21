import { Vector2 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MiniGamePlatform } from '../src/platform/MiniGamePlatform';
import type { InputSource } from '../src/platform/PlatformAdapter';
import {
  createFakeRuntime,
  installRuntime,
  uninstallRuntime,
  type FakeRuntime,
} from './helpers/minigameRuntime';

let fake: FakeRuntime | null = null;
let platform: MiniGamePlatform | null = null;

function createInputStub(): InputSource {
  return {
    getMoveVector: (out) => out.set(0, 0),
    setEnabled: vi.fn(),
    reset: vi.fn(),
    dispose: vi.fn(),
  };
}

beforeEach(() => {
  fake = createFakeRuntime();
  installRuntime(fake);
  platform = new MiniGamePlatform();
});

afterEach(() => {
  platform?.dispose();
  platform = null;
  fake = null;
  uninstallRuntime();
});

describe('MiniGamePlatform storage', () => {
  it('writes preferences through to the tt storage API', () => {
    const storage = platform!.storage;

    storage.setItem('sea-battle:sound-enabled', 'off');

    expect(fake!.storage.get('sea-battle:sound-enabled')).toBe('off');
    expect(storage.getItem('sea-battle:sound-enabled')).toBe('off');

    storage.removeItem('sea-battle:sound-enabled');

    expect(fake!.storage.has('sea-battle:sound-enabled')).toBe(false);
    expect(storage.getItem('sea-battle:sound-enabled')).toBeNull();
  });

  it('keeps the session value when the platform storage throws', () => {
    const storage = platform!.storage;
    fake!.setStorageThrows = true;

    expect(() => {
      storage.setItem('sea-battle:sound-enabled', 'on');
    }).not.toThrow();

    expect(storage.getItem('sea-battle:sound-enabled')).toBe('on');
    expect(fake!.storage.has('sea-battle:sound-enabled')).toBe(false);
  });

  it('reports null for keys that were never written', () => {
    expect(platform!.storage.getItem('missing-key')).toBeNull();
  });
});

describe('MiniGamePlatform lifecycle', () => {
  it('maps onHide/onShow to pause and resume listeners', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();

    platform!.onPause(onPause);
    platform!.onResume(onResume);

    expect(fake!.lifecycle.hide).toHaveLength(1);
    expect(fake!.lifecycle.show).toHaveLength(1);

    for (const listener of fake!.lifecycle.hide) {
      listener();
    }

    expect(onPause).toHaveBeenCalledTimes(1);
    expect(platform!.isPaused()).toBe(true);

    for (const listener of fake!.lifecycle.show) {
      listener();
    }

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(platform!.isPaused()).toBe(false);
  });

  it('stops notifying listeners once they unsubscribe', () => {
    const onPause = vi.fn();
    const unsubscribe = platform!.onPause(onPause);

    unsubscribe();

    for (const listener of fake!.lifecycle.hide) {
      listener();
    }

    expect(onPause).not.toHaveBeenCalled();
  });

  it('removes the tt lifecycle hooks on dispose', () => {
    expect(fake!.lifecycle.hide).toHaveLength(1);

    platform!.dispose();

    expect(fake!.lifecycle.hide).toHaveLength(0);
    expect(fake!.lifecycle.show).toHaveLength(0);
  });

  it('ignores lifecycle events after dispose', () => {
    const onPause = vi.fn();
    platform!.onPause(onPause);

    const [hideListener] = fake!.lifecycle.hide;
    platform!.dispose();
    hideListener?.();

    expect(onPause).not.toHaveBeenCalled();
  });
});

describe('MiniGamePlatform input wiring', () => {
  it('throws before an input source is supplied', () => {
    expect(() => platform!.createInput()).toThrow(
      'Mini-game input source has not been configured',
    );
  });

  it('returns the input source registered by the canvas UI', () => {
    const input = createInputStub();

    platform!.setInputSource(input);
    const resolved = platform!.createInput();
    const vector = resolved.getMoveVector(new Vector2());

    expect(resolved).toBe(input);
    expect(vector.length()).toBe(0);
  });

  it('drops the input source on dispose', () => {
    platform!.setInputSource(createInputStub());
    platform!.dispose();

    expect(() => platform!.createInput()).toThrow();
  });
});

describe('MiniGamePlatform pause control', () => {
  it('routes the pause button through the same listeners as the host', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    platform!.onPause(onPause);
    platform!.onResume(onResume);

    expect(platform!.togglePause()).toBe(true);
    expect(platform!.isPaused()).toBe(true);
    expect(onPause).toHaveBeenCalledTimes(1);

    expect(platform!.togglePause()).toBe(false);
    expect(platform!.isPaused()).toBe(false);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('keeps a manual pause across a hide/show cycle', () => {
    const onResume = vi.fn();
    platform!.onResume(onResume);

    platform!.togglePause();

    for (const listener of fake!.lifecycle.hide) {
      listener();
    }
    for (const listener of fake!.lifecycle.show) {
      listener();
    }

    expect(platform!.isPaused()).toBe(true);
    expect(onResume).not.toHaveBeenCalled();
  });

  it('resumes after a host pause instead of pausing again', () => {
    for (const listener of fake!.lifecycle.hide) {
      listener();
    }

    expect(platform!.isPaused()).toBe(true);
    expect(platform!.togglePause()).toBe(false);
    expect(platform!.isPaused()).toBe(false);
  });

  it('forwards memory warnings to renderer consumers', () => {
    const onMemoryWarning = vi.fn();
    platform!.onMemoryWarning(onMemoryWarning);

    expect(fake!.memoryWarnings).toHaveLength(1);

    for (const listener of fake!.memoryWarnings) {
      listener();
    }

    expect(onMemoryWarning).toHaveBeenCalledTimes(1);
  });

  it('stops forwarding memory warnings on dispose', () => {
    const onMemoryWarning = vi.fn();
    platform!.onMemoryWarning(onMemoryWarning);
    platform!.dispose();

    expect(fake!.memoryWarnings).toHaveLength(0);
  });
});
