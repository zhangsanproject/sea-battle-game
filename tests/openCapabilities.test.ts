import { describe, expect, it, vi } from 'vitest';
import {
  BONUS_UPGRADE_KEY,
  OpenCapabilities,
  SIDEBAR_SCENES,
} from '../src/minigame/openCapabilities';
import type { TtRuntime } from '../src/minigame/runtime';
import type { KeyValueStorage } from '../src/platform/PlatformAdapter';

function createStorage(): KeyValueStorage & { snapshot(): Map<string, string> } {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    snapshot: () => new Map(data),
  };
}

/** Builds a runtime exposing only the APIs a test cares about. */
function createRuntime(partial: Partial<TtRuntime>): TtRuntime {
  return partial as unknown as TtRuntime;
}

describe('sidebar re-visit', () => {
  it('recognises every sidebar scene value the platform documents', () => {
    expect(SIDEBAR_SCENES).toEqual([
      '021036',
      '101036',
      '181036',
      '261036',
    ]);
  });

  it('flags the reward when the launch comes from a sidebar host', () => {
    const caps = new OpenCapabilities(
      createRuntime({}),
      createStorage(),
    );

    for (const scene of SIDEBAR_SCENES) {
      const fresh = new OpenCapabilities(createRuntime({}), createStorage());
      fresh.handleShow({ scene });
      expect(fresh.sidebarRewardReady).toBe(true);
    }

    caps.handleShow({ scene: '021036' });
    expect(caps.sidebarRewardReady).toBe(true);
  });

  it('ignores launches that did not come from a sidebar', () => {
    const caps = new OpenCapabilities(createRuntime({}), createStorage());

    caps.handleShow({ scene: '000000' });
    caps.handleShow({});
    caps.handleShow(undefined);

    expect(caps.sidebarRewardReady).toBe(false);
  });

  it('pays out at most once per day', () => {
    const storage = createStorage();
    const caps = new OpenCapabilities(createRuntime({}), storage);

    caps.handleShow({ scene: '021036' });
    expect(caps.consumeSidebarReward()).toBe(true);
    expect(caps.consumeSidebarReward()).toBe(false);

    // Re-entering from the sidebar on the same day must not pay again.
    caps.handleShow({ scene: '021036' });
    expect(caps.sidebarRewardReady).toBe(false);
    expect(caps.consumeSidebarReward()).toBe(false);
  });

  it('opens the sidebar through tt.navigateToScene', () => {
    const navigateToScene = vi.fn();
    const caps = new OpenCapabilities(
      createRuntime({ navigateToScene }),
      createStorage(),
      { sidebarActivityId: 'act-1' },
    );

    expect(caps.canOfferSidebar).toBe(true);
    expect(caps.openSidebar()).toBe(true);
    expect(navigateToScene).toHaveBeenCalledTimes(1);
    expect(navigateToScene.mock.calls[0]?.[0]).toMatchObject({
      scene: 'sidebar',
      activity: 'act-1',
    });
  });

  it('reports failure instead of throwing when the host has no sidebar', () => {
    const caps = new OpenCapabilities(createRuntime({}), createStorage());

    expect(caps.canOfferSidebar).toBe(false);
    expect(caps.openSidebar()).toBe(false);
  });
});

describe('home-screen shortcut', () => {
  it('skips the host prompt when the shortcut already exists', () => {
    const addShortcut = vi.fn();
    const checkShortcut = vi.fn((options: {
      success?: (result: { status?: string }) => void;
    }) => {
      options.success?.({ status: 'exist' });
    });
    const caps = new OpenCapabilities(
      createRuntime({ addShortcut, checkShortcut }),
      createStorage(),
    );

    expect(caps.canOfferShortcut).toBe(true);
    expect(caps.requestShortcut()).toBe(true);
    expect(checkShortcut).toHaveBeenCalledTimes(1);
    expect(addShortcut).not.toHaveBeenCalled();
  });

  it('adds the shortcut when none exists yet', () => {
    const addShortcut = vi.fn();
    const checkShortcut = vi.fn((options: {
      success?: (result: { status?: string }) => void;
    }) => {
      options.success?.({ status: 'not exist' });
    });
    const caps = new OpenCapabilities(
      createRuntime({ addShortcut, checkShortcut }),
      createStorage(),
    );

    caps.requestShortcut();
    expect(addShortcut).toHaveBeenCalledTimes(1);
  });

  it('still tries when the check itself fails', () => {
    const addShortcut = vi.fn();
    const checkShortcut = vi.fn((options: { fail?: () => void }) => {
      options.fail?.();
    });
    const caps = new OpenCapabilities(
      createRuntime({ addShortcut, checkShortcut }),
      createStorage(),
    );

    caps.requestShortcut();
    expect(addShortcut).toHaveBeenCalledTimes(1);
  });
});

describe('subscription messages', () => {
  it('stays hidden without template ids', () => {
    const requestSubscribeMessage = vi.fn();
    const caps = new OpenCapabilities(
      createRuntime({ requestSubscribeMessage }),
      createStorage(),
      { subscribeTemplateIds: [] },
    );

    expect(caps.canOfferSubscribe).toBe(false);
    expect(caps.requestSubscribe()).toBe(false);
    expect(requestSubscribeMessage).not.toHaveBeenCalled();
  });

  it('forwards the configured template ids', () => {
    const requestSubscribeMessage = vi.fn();
    const caps = new OpenCapabilities(
      createRuntime({ requestSubscribeMessage }),
      createStorage(),
      { subscribeTemplateIds: ['tmpl-a', 'tmpl-b'] },
    );

    expect(caps.canOfferSubscribe).toBe(true);
    expect(caps.requestSubscribe()).toBe(true);
    expect(requestSubscribeMessage).toHaveBeenCalledTimes(1);
    expect(requestSubscribeMessage.mock.calls[0]?.[0]).toMatchObject({
      tmplIds: ['tmpl-a', 'tmpl-b'],
    });
  });
});

describe('rewarded video', () => {
  function createAd(isEnded: boolean) {
    let closeHandler: ((result?: { isEnded?: boolean }) => void) | null = null;
    const ad = {
      show: vi.fn(() => {
        // The host reports completion through onClose after the video ends.
        closeHandler?.({ isEnded });
        return Promise.resolve();
      }),
      onClose: vi.fn((handler: (result?: { isEnded?: boolean }) => void) => {
        closeHandler = handler;
      }),
      onError: vi.fn(),
    };
    return ad;
  }

  it('pays out only when the video was watched to the end', async () => {
    const watched = createAd(true);
    const caps = new OpenCapabilities(
      createRuntime({ createRewardedVideoAd: () => watched }),
      createStorage(),
      { rewardedAdUnitId: 'rew-1' },
    );

    await expect(caps.showRewardedAd()).resolves.toBe(true);
  });

  it('refuses a skipped video', async () => {
    const skipped = createAd(false);
    const caps = new OpenCapabilities(
      createRuntime({ createRewardedVideoAd: () => skipped }),
      createStorage(),
      { rewardedAdUnitId: 'rew-1' },
    );

    await expect(caps.showRewardedAd()).resolves.toBe(false);
  });

  it('stays hidden without an ad unit id', async () => {
    const createRewardedVideoAd = vi.fn();
    const caps = new OpenCapabilities(
      createRuntime({ createRewardedVideoAd }),
      createStorage(),
    );

    expect(caps.canOfferRewardedAd).toBe(false);
    await expect(caps.showRewardedAd()).resolves.toBe(false);
    expect(createRewardedVideoAd).not.toHaveBeenCalled();
  });
});

describe('capability degradation', () => {
  it('never throws on a host with no open-platform surface', async () => {
    const caps = new OpenCapabilities(null, createStorage());

    expect(caps.canOfferSidebar).toBe(false);
    expect(caps.canOfferShortcut).toBe(false);
    expect(caps.canOfferSubscribe).toBe(false);
    expect(caps.canOfferRewardedAd).toBe(false);
    expect(caps.consumeSidebarReward()).toBe(false);
    expect(caps.openSidebar()).toBe(false);
    expect(caps.requestShortcut()).toBe(false);
    expect(caps.requestSubscribe()).toBe(false);
    await expect(caps.showRewardedAd()).resolves.toBe(false);
    expect(() => caps.showInterstitialAd()).not.toThrow();
  });

  it('uses a storage key that the run reward collector reads', () => {
    expect(BONUS_UPGRADE_KEY).toBe('sea-battle:bonus-upgrade');
  });
});
