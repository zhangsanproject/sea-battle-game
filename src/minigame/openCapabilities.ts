import type { KeyValueStorage } from '../platform/PlatformAdapter';
import type { TtAd, TtRuntime, TtShowOptions } from './runtime';

/**
 * Scene values that mean "launched from the host's home-screen sidebar".
 * Douyin, Douyin Lite, Fanqie Novel and Hongguo each use their own code, and
 * the platform explicitly asks developers not to gate rewards on a single host.
 */
export const SIDEBAR_SCENES: readonly string[] = [
  '021036',
  '101036',
  '181036',
  '261036',
];

const SIDEBAR_REWARD_DAY_KEY = 'sea-battle:sidebar-reward-day';

/** Rewarded-video rewards stack here until the next run collects them. */
export const BONUS_UPGRADE_KEY = 'sea-battle:bonus-upgrade';

export interface OpenCapabilityConfig {
  /**
   * Marketing activity id used by `tt.navigateToScene`. Optional: an empty
   * string makes the host fall back to its default sidebar popup.
   */
  sidebarActivityId?: string;
  interstitialAdUnitId?: string;
  rewardedAdUnitId?: string;
  /** Template ids from the Douyin console. Empty disables the entry point. */
  subscribeTemplateIds?: readonly string[];
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/**
 * Wraps the open-platform capabilities the Douyin build has to expose:
 * sidebar re-visit, home-screen shortcut, subscription messages and ads.
 *
 * Each call degrades quietly when the host or the config is missing, so the
 * web build and older runtimes keep working without branching at call sites.
 */
export class OpenCapabilities {
  private sidebarRewardPending = false;
  private interstitial: TtAd | null = null;
  private rewardedAd: TtAd | null = null;
  private rewardedResolve: ((earned: boolean) => void) | null = null;
  /** Interstitials are throttled: one every few runs, never mid-fight. */
  private runsUntilInterstitial = 2;

  constructor(
    private readonly runtime: TtRuntime | null,
    private readonly storage: KeyValueStorage,
    private readonly config: OpenCapabilityConfig = {},
  ) {}

  /**
   * Must be wired to `tt.onShow` as early as possible — the platform warns that
   * a late listener misses the callback when the game is resumed from the
   * sidebar, and the reward then silently never arrives.
   *
   * Always trust this payload over `getLaunchOptionsSync`: on a warm resume the
   * launch options still describe the original launch.
   */
  handleShow(options?: TtShowOptions): void {
    const scene = options?.scene;
    if (!scene || !SIDEBAR_SCENES.includes(scene)) {
      return;
    }

    if (this.storage.getItem(SIDEBAR_REWARD_DAY_KEY) === todayKey()) {
      // Already claimed today; the entry stays visible but will not pay twice.
      return;
    }

    this.sidebarRewardPending = true;
  }

  get sidebarRewardReady(): boolean {
    return this.sidebarRewardPending;
  }

  get canOfferShortcut(): boolean {
    return typeof this.runtime?.addShortcut === 'function';
  }

  get canOfferSubscribe(): boolean {
    return (
      typeof this.runtime?.requestSubscribeMessage === 'function' &&
      (this.config.subscribeTemplateIds?.length ?? 0) > 0
    );
  }

  get canOfferRewardedAd(): boolean {
    return (
      typeof this.runtime?.createRewardedVideoAd === 'function' &&
      Boolean(this.config.rewardedAdUnitId)
    );
  }

  get canOfferSidebar(): boolean {
    return typeof this.runtime?.navigateToScene === 'function';
  }

  /** Pays out once per day. Returns false when there is nothing to claim. */
  consumeSidebarReward(): boolean {
    if (!this.sidebarRewardPending) {
      return false;
    }

    this.sidebarRewardPending = false;
    this.storage.setItem(SIDEBAR_REWARD_DAY_KEY, todayKey());
    return true;
  }

  /**
   * Opens the host sidebar. Must run synchronously inside a touch handler;
   * deferring it past an await makes the host reject the call.
   */
  openSidebar(): boolean {
    const navigate = this.runtime?.navigateToScene;
    if (typeof navigate !== 'function') {
      return false;
    }

    try {
      navigate({
        scene: 'sidebar',
        activity: this.config.sidebarActivityId ?? '',
        fail: () => {
          /* User cancelled or the host refused; nothing to clean up. */
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Offers the home-screen shortcut. Skips silently when it already exists,
   * because the host would just show a redundant system prompt.
   */
  requestShortcut(): boolean {
    const addShortcut = this.runtime?.addShortcut;
    if (typeof addShortcut !== 'function') {
      return false;
    }

    const checkShortcut = this.runtime?.checkShortcut;
    if (typeof checkShortcut === 'function') {
      let handled = false;
      try {
        checkShortcut({
          success: (result) => {
            handled = true;
            const exists =
              result?.status === 'exist' || result?.exist === true;
            if (!exists) {
              this.performAddShortcut();
            }
          },
          fail: () => {
            if (!handled) {
              this.performAddShortcut();
            }
          },
        });
        return true;
      } catch {
        // Fall through to an unconditional attempt.
      }
    }

    this.performAddShortcut();
    return true;
  }

  private performAddShortcut(): void {
    try {
      this.runtime?.addShortcut?.({
        fail: () => {
          /* Already added, user cancelled, or host does not support it. */
        },
      });
    } catch {
      /* Ignore hosts without shortcut support. */
    }
  }

  /** Requests subscription messages. Must run inside a touch handler. */
  requestSubscribe(): boolean {
    const request = this.runtime?.requestSubscribeMessage;
    const tmplIds = this.config.subscribeTemplateIds ?? [];
    if (typeof request !== 'function' || tmplIds.length === 0) {
      return false;
    }

    try {
      request({
        tmplIds: [...tmplIds],
        fail: () => {
          /* User declined or the template is invalid. */
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Resolves true only when the player watched the rewarded video to the end. */
  showRewardedAd(): Promise<boolean> {
    const create = this.runtime?.createRewardedVideoAd;
    const adUnitId = this.config.rewardedAdUnitId;
    if (typeof create !== 'function' || !adUnitId) {
      return Promise.resolve(false);
    }

    if (!this.rewardedAd) {
      try {
        const ad = create({ adUnitId });
        ad.onClose?.((result) => {
          const resolve = this.rewardedResolve;
          this.rewardedResolve = null;
          resolve?.(result?.isEnded === true);
        });
        ad.onError?.(() => {
          const resolve = this.rewardedResolve;
          this.rewardedResolve = null;
          resolve?.(false);
        });
        this.rewardedAd = ad;
      } catch {
        return Promise.resolve(false);
      }
    }

    return new Promise((resolve) => {
      this.rewardedResolve = resolve;
      try {
        const shown = this.rewardedAd?.show();
        if (shown && typeof shown.catch === 'function') {
          shown.catch(() => {
            const resolver = this.rewardedResolve;
            this.rewardedResolve = null;
            resolver?.(false);
          });
        }
      } catch {
        this.rewardedResolve = null;
        resolve(false);
      }
    });
  }

  /**
   * Fire-and-forget interstitial, shown between runs rather than mid-fight.
   * Rate-limited to roughly one every three runs so it never becomes noise.
   */
  showInterstitialAd(): void {
    const create = this.runtime?.createInterstitialAd;
    const adUnitId = this.config.interstitialAdUnitId;
    if (typeof create !== 'function' || !adUnitId) {
      return;
    }

    if (this.runsUntilInterstitial > 0) {
      this.runsUntilInterstitial -= 1;
      return;
    }
    this.runsUntilInterstitial = 2;

    try {
      if (!this.interstitial) {
        const ad = create({ adUnitId });
        ad.onError?.(() => {
          /* No fill or unsupported host; keep the run going. */
        });
        this.interstitial = ad;
      }

      const shown = this.interstitial.show();
      if (shown && typeof shown.catch === 'function') {
        shown.catch(() => {
          /* Swallow: an ad failure must never interrupt gameplay. */
        });
      }
    } catch {
      /* Ignore. */
    }
  }
}
