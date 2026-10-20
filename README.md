# 海战霸主

基于 TypeScript、Vite 和 Three.js 的 3D 海战 Roguelike 原型。玩家驾驶战船自动炮击敌舰、收集经验、升级武器与船体，并面对精英敌舰和 Boss。

## 当前内容

- 玩家武器：
  - 双联主炮：自动锁定、可升级伤害/射速/射程/齐射数量。
  - 两舷副炮：独立自动瞄准、射速较快、伤害较低。
  - 鱼雷发射器：慢速高伤害；升级提升伤害、航速、装填，并在高等级增加齐射数量。
  - 垂直发射制导导弹：从舰载垂发单元升空后转向追踪目标，命中后造成范围爆炸；升级提升伤害、装填与齐射数量。
- 13 类局内强化：主炮伤害、射速、炮弹数量、射程、航速、耐久、副炮、鱼雷、导弹、装甲、击沉维修、经验吸附范围、经验加成。
- 敌舰原型：突袭艇、炮艇、驱逐舰、鱼雷艇，以及精英变体与 Boss“深海霸主”。
- 危险度、Boss 特殊攻击预警、经验升级、结算与完整重开流程。
- 可关闭的程序合成音效与自动画质降级。

## 本地运行

要求：Node.js 22 或更新版本，npm。

```bash
npm install
npm run dev
```

Vite 会输出本地访问地址，通常为 `http://localhost:5173/`。

生产构建与预览：

```bash
npm run build
npm run preview
```

测试：

```bash
npm test
```

## 操作

- 手机：左下角虚拟摇杆移动。
- 桌面：`WASD` 或方向键移动。
- 主炮、副炮、鱼雷与制导导弹自动锁定射程内最近目标并开火。
- 点击升级卡片选择强化。
- 右上角可切换基础音效开关；该偏好会保存在浏览器本地。
- 战船沉没后可点击“重新起航”。

## 构建产物

- 构建命令：`npm run build`
- 输出目录：`dist/`
- 生产资源使用相对路径（`base: './'`），适配 Cloudflare Pages 根目录和子目录部署。
- 所有模型、纹理效果与音效均由代码生成；除站点图标外没有外部素材请求。
- 当前依赖只有运行时 `three`，开发依赖为 `vite`、`typescript`、`@types/three`、`vitest`。

## Cloudflare 部署

### 方式一：Cloudflare Workers 静态资源（本仓库已配置）

仓库包含 `wrangler.jsonc`，将 `dist/` 作为静态资源部署，不需要 `@cloudflare/vite-plugin`。

```bash
npx wrangler login
npm run deploy:dry-run
npm run deploy
```

- `npm run deploy` 会先执行 `npm run build`，再执行 `wrangler deploy`。
- `wrangler.jsonc` 已配置 SPA fallback：`not_found_handling: "single-page-application"`。
- 如果使用 `CLOUDFLARE_API_TOKEN`，可直接在 CI 中执行 `npm run deploy`。
- 已有 `wrangler.jsonc` 时，Cloudflare 的自动配置流程会跳过向 `vite.config.ts` 注入 Vite 插件的步骤。

### 方式二：Cloudflare Pages

1. 将项目推送到 Git 仓库并连接到 Cloudflare Pages。
2. 构建命令：`npm run build`
3. 构建输出目录：`dist`
4. Node 版本：`22.12.0` 或更新（仓库提供 `.node-version`；如平台未读取，设置环境变量 `NODE_VERSION=22.12.0`）。
5. 无需后端、环境变量或 SPA 重写规则；这是一个静态单页应用。

两种方式只需选择一种，不要同时启用。

### 关于自动配置报错

Cloudflare 的自动配置尝试向 Vite 配置注入 `@cloudflare/vite-plugin`。当前 `vite.config.ts` 导出的是函数式配置，旧版自动配置器无法解析其 `plugins` 字段，因此报错：

```text
Cannot modify Vite config: could not find a valid plugins array
```

本项目的构建产物完全是静态资源，不需要该插件。手动提供 `wrangler.jsonc` 后可直接部署，避免自动改写 Vite 配置。

## 平台边界

平台相关能力通过以下接口隔离：

- `src/platform/PlatformAdapter.ts`
  - `PlatformAdapter`：输入创建、存储、暂停/恢复、销毁。
  - `InputSource`：摇杆/键盘等输入源统一接口。
  - `KeyValueStorage`：可替换的键值存储接口。
- `src/platform/WebPlatform.ts`：浏览器实现，使用 Pointer Events、`localStorage` 和 `visibilitychange`。
- `src/input/InputManager.ts`：Web 输入实现，注入到游戏逻辑。
- `src/audio/SoundManager.ts`：独立的 Web Audio 合成音效层，不加载外部音频文件。

游戏逻辑不再直接读写浏览器存储或页面可见性。

## 抖音小游戏兼容性评估

**当前网页版本不能直接视为抖音小游戏版本。** 尚未在抖音开发者工具或真机上运行，不能宣称兼容。

当前网页实现依赖以下浏览器能力：

- HTML/CSS DOM 与 `ResizeObserver` 渲染 HUD。
- Pointer Events、`window`/`document` 生命周期。
- `localStorage`。
- Web Audio API。
- Vite 的 HTML 入口和 ES Module 产物。

迁移到抖音小游戏时至少需要：

1. 将 Vite 产物改造成小游戏入口/适配层，确认是否支持当前 ES2020 产物。
2. 使用平台 Canvas 创建 WebGL 上下文，验证 Three.js 与当前着色器。
3. 用 Canvas 或平台 UI 替换 HTML HUD、升级面板、结算面板和虚拟摇杆。
4. 用平台触摸事件实现 `InputSource`，验证多指触摸和坐标系。
5. 用平台 `onShow/onHide` 实现暂停恢复，处理音频解锁。
6. 用平台存储 API 实现 `KeyValueStorage`。
7. 验证音频 API；若不可用，需要无声降级而非报错。
8. 验证分包/包体限制、首包大小、资源路径和网络域名策略。
9. 在抖音开发者工具和真机测试帧率、触控、屏幕适配、前后台切换和重开稳定性。

目前没有抖音真机或开发者工具测试结果。

## 已知限制

- 未在真实手机上进行最终性能与触控测试。
- 无头浏览器使用软件 WebGL，不能作为真机 FPS 依据；本仓库不提供虚构的 FPS 数字。
- 高级画质会自动降低像素比，但不保证所有低端设备达到固定帧率。
- 没有永久角色成长；音效开关是唯一持久化偏好。
