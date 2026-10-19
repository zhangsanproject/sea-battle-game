import { describe, expect, it } from 'vitest';
import { SoundManager } from '../src/audio/SoundManager';
import type { KeyValueStorage } from '../src/platform/PlatformAdapter';

function createStorage(): KeyValueStorage {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe('SoundManager preference storage', () => {
  it('persists a muted preference through the storage interface', () => {
    const storage = createStorage();
    const sound = new SoundManager(storage);

    expect(sound.isEnabled).toBe(true);
    expect(sound.toggle()).toBe(false);
    expect(storage.getItem('sea-battle:sound-enabled')).toBe('off');

    const restored = new SoundManager(storage);
    expect(restored.isEnabled).toBe(false);

    sound.dispose();
    restored.dispose();
  });
});
