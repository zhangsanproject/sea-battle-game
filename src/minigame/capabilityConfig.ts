import type { OpenCapabilityConfig } from './openCapabilities';

/**
 * Fill these in from the Douyin developer console. Every field is optional:
 * leaving one empty simply hides that entry point instead of failing at
 * runtime, so the game always stays playable.
 *
 * - `sidebarActivityId`  : 运营 → 营销 → 复访营销里创建的活动中获取；留空时
 *                          宿主会用它自己的默认侧边栏弹窗。
 * - `interstitialAdUnitId`: 变现 → 广告位管理 → 新建「插屏广告」后得到的 id。
 * - `rewardedAdUnitId`    : 同上，类型选「激励视频」。
 * - `subscribeTemplateIds`: 运营 → 订阅消息 → 选用模板后得到的模板 id 列表。
 */
export const CAPABILITY_CONFIG: OpenCapabilityConfig = {
  sidebarActivityId: '',
  interstitialAdUnitId: '',
  rewardedAdUnitId: '',
  subscribeTemplateIds: [],
};
