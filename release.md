# Release Notes

规则：新版本内容放在最后

## v1.1.0

发布时间：2026-02-26
版本定位：Terminal 语音输入全链路 + 网关语音代理 + Web 稳定性增强

### 变更亮点

- 终端语音输入能力落地：
  - 新增 `TerminalVoiceInput` 组件，支持“按住说话、松开停止、点击发送才提交”；
  - 增加 `voice/cancel/clear-input/sent` 图标与操作流；
  - 支持按钮拖动、防丢手势收尾、连续多轮语音输入聚合到同一输入框。
- 网关新增语音 WebSocket 入口 `/ws/asr`：
  - 统一 `start/audio/stop/cancel/ping` 协议；
  - 对接豆包 ASR（火山引擎）并补齐 `ready/result/error/round_end` 回传语义；
  - 上游异常与非标准返回增加兼容解析（文本 JSON、NDJSON、粘包 JSON）。
- 生产稳态优化：
  - 网关与语音上游默认关闭 `permessage-deflate`；
  - `result` 默认不回传完整 raw payload，降低下行负载（可通过开关临时启用）；
  - 空文本结果告警按连接限次，避免日志风暴。
- 前端容错增强：
  - 路由懒加载失败自动恢复（识别动态导入失败文案后单次自动刷新）；
  - 15 秒窗口内仅允许一次自动恢复，避免刷新死循环；
  - 全局缩放防护补齐双击路径（与 pinch/ctrl+wheel 共同生效）。

### 新增配置

- `apps/gateway/.env.example` 新增：
  - `ASR_PROVIDER`
  - `ASR_APP_ID`
  - `ASR_ACCESS_TOKEN`
  - `ASR_SECRET_KEY`
  - `ASR_RESOURCE_ID`
  - `ASR_CLUSTER`
  - `ASR_WS_URL`
  - `ASR_INCLUDE_RAW_RESULT`
  - `ASR_EMPTY_TEXT_WARN_LIMIT`

### 新增模块与测试

- Gateway 新增：
  - `apps/gateway/src/voice/clientProtocol.ts`
  - `apps/gateway/src/voice/volcAsrProtocol.ts`
  - `apps/gateway/src/voice/asrText.ts`
  - `apps/gateway/src/voice/upstreamPayload.ts`
  - 及对应测试文件 `*.test.ts`
- Web 新增：
  - `apps/web/src/components/TerminalVoiceInput.vue`
  - `apps/web/src/utils/dynamicImportGuard.ts`
  - `apps/web/src/utils/dynamicImportGuard.test.ts`

### 涉及文件（核心）

- `apps/web/src/components/TerminalPanel.vue`
- `apps/web/src/components/TerminalVoiceInput.vue`
- `apps/web/src/styles/main.css`
- `apps/web/src/main.ts`
- `apps/gateway/src/server.ts`
- `apps/gateway/src/config.ts`
- `docs/terminal-voice-input-plan-2026-02-26.md`
- `question-solved.md`

## v1.0.1

发布时间：2026-02-23
版本定位：生产架构版稳定性更新（Web 终端 + Gateway + 插件运行时）

### 里程碑与亮点

- 完成 `apps/web`、`apps/gateway`、`packages/shared`、`packages/plugin-runtime` 的多包工程闭环，主链路可用。
- 完成终端中文输入修复：覆盖 IME 组合态、网关输入归一化和 zsh 兼容初始化。
- 新增移动端触摸焦点状态机策略，改善“滚动/选区/弹键盘”互相抢占的问题。
- 新增统一运维脚本 `scripts/gatewayctl.sh`，支持 `ensure-env/build/install/restart/health/deploy` 全流程。
- 增加 Gateway 与 TTYD 双链路性能基线压测脚本，便于回归与容量评估。

### 核心特性

- 服务器管理与凭据管理（Web 端 IndexedDB + AES-GCM 受限存储）。
- 终端会话状态机（`connecting/auth_pending/connected/reconnecting/disconnected/error`）。
- 网关双向转发（`init/stdin/stdout/stderr/resize/control`）。
- Codex 模式编排（`cd` -> `command -v codex` -> `codex --sandbox`）。
- 会话日志记录与脱敏导出。
- 插件运行时（manifest 校验、权限白名单、生命周期管理、单插件熔断）。

### 基础功能

- 终端连接页、终端页、日志页、设置页、插件管理页。
- 终端顶部支持连接状态反馈与“断开/重连”切换。
- 输入链路支持键盘与辅助输入协同，降低移动端输入法异常提交影响。
- 主题系统支持预设切换与对比度优化。
- iOS Capacitor SSH 插件工程骨架已接入（`ios/plugin/RemoteConnSSHPlugin`）。

### 技术实现

- 前端：Vue3 + TypeScript + xterm.js（含 `fit/webgl/search/unicode11`）。
- 网关：Node.js + WebSocket + SSH2，支持 `keyboard-interactive -> password` 显式回退策略。
- 共享层：统一模型、状态机、主题与日志脱敏能力。
- 可观测性：新增 IO HEX 调试链路与统一日志格式，便于定位输入输出编码问题。
- 运维：`systemd`/`launchd` 双通道托管，脚本化安装、重启与健康检查。

### 项目结构

- `apps/web`：Web 客户端与终端 UI。
- `apps/gateway`：WSS -> SSH 网关服务。
- `packages/shared`：共享模型、Codex 编排、主题与安全工具。
- `packages/plugin-runtime`：插件系统运行时。
- `ios/plugin/RemoteConnSSHPlugin`：iOS 原生 SSH 插件骨架。
- `scripts/gatewayctl.sh`：网关服务部署与运维脚本。

### 设计理念

- 稳定优先：先保证 SSH 主链路与输入链路可靠，再迭代交互细节。
- 安全优先：凭据最小暴露、日志默认脱敏、插件权限显式声明。
- 小步迭代：以可验证的小改动推进，避免一次性大范围重构。
- 可扩展优先：通过共享包与插件运行时降低后续多端扩展成本。

## v1.0.3

发布时间：2026-02-23
版本定位：iOS 触摸焦点状态机稳定性修复

### 变更亮点

- 修复 iPhone 上点击激活带后软键盘弹出立刻收起的问题。
- 修复 iOS 长按选中后继续移动手指选区消失的问题（第二层根因）。
- `visualViewport` 键盘收起检测升级为两阶段状态机，彻底规避 iPhone 地址栏折叠误判。
- 新增 `touchmove` capture 保护层，在系统 `pointercancel` 接管后仍能阻断 xterm 清除原生选区。

### Bug 修复

#### iPhone 软键盘弹出后立刻收起

**根因 1（标志时序）**：`focusKeyboardInProgress = true` 原先在 `ae.blur()` 之后设置，而 iOS blur 事件**同步**触发——`ae.blur()` 返回前 `onTextareaBlur` 已执行，flag 仍为 `false`，`readOnly=true` 立即打断键盘激活。

**根因 2（visualViewport 误判）**：iPhone Safari 键盘弹出前地址栏会短暂折叠，`visualViewport.height` 先短暂**增大**，原来"高度一增大就判定键盘收起"的逻辑将此误判为键盘收起，触发 `readOnly=true + blur()`；iPad 无地址栏折叠行为，不受影响。

**修复**：

1. 将 `focusKeyboardInProgress = true` 移到 `ae.blur()` 调用**之前**。
2. cleanup 定时器从 60ms 延长至 **400ms**（覆盖 iPhone 键盘动画全程约 300ms），同时承担 focus 重试，ID 保存在 `focusKeyboardTimerId` 供 `touchstart` 取消。
3. `visualViewport.resize` 检测改为**两阶段状态机**（`keyboardViewportShrinkDetected`）：先检测到"明显缩小"（>120px）才接受"明显增大"（>120px）为键盘收起；小幅抖动一律忽略。

#### 长按选区移动时选区消失

**根因**：iOS 长按进入系统选区后先触发 `pointercancel`（系统接管），后续以 `touchmove` 驱动放大镜/手柄。`pointercancel` 后 pointer 门控已重置，`touchmove` 直达 xterm，xterm 调用 `removeAllRanges()` 清空选区。

**修复**：

1. 新增 `touchmove` capture 拦截器：终端区域内存在原生选区时执行 `stopImmediatePropagation()`，不调用 `preventDefault()`（不影响滚动）。
2. `pointercancel` 中：若已有原生选区，将 `lastTouchAction` 置为 `PASS_NATIVE`，确保后续合成 `mousedown/click` 也受保护。

### 涉及文件

- `apps/web/src/components/TerminalPanel.vue`

## v1.0.5

发布时间：2026-02-23
版本定位：iPhone 触摸滚动动量阶段性优化

### 变更亮点

- 修复 iPhone 上“快速滑动只滚动一两行”的主要问题：触摸速度估算改为按时间归一化，不再依赖低频事件间隔下的位移直算。
- 新增 `touchend/touchcancel` 动量续滚链路（RAF 指数衰减），手指抬起后可继续平滑滚动。
- 保留原生选区优先级：存在系统选区时禁用动量续滚，避免影响长按选区与手柄拖拽。

### 参数调整（本次）

- `TOUCH_SCROLL_DAMPING`: `0.93 -> 0.95`
- `TOUCH_SCROLL_STOP_THRESHOLD`: `0.4 -> 0.2`
- `TOUCH_SCROLL_MAX_SPEED`: `80 -> 120`
- 新增 `TOUCH_SCROLL_BOOST = 1.35`

### 当前状态

- 快速滑动体验已明显改善。
- 仍存在“未达到原生 iOS 完全一致手感”的差距，后续通过参数微调（`BOOST / DAMPING / MAX_SPEED`）继续迭代。

### 涉及文件

- `apps/web/src/components/TerminalPanel.vue`

## v1.0.6

发布时间：2026-02-24
版本定位：Console 触摸工具区可点击性与误触防护优化

### 变更亮点

- 对齐 Figma `frame 2248/2251` annotation：将工具区交互保护范围扩展为更大命中区（`2251` 语义层），同时保持 `2248` 视觉布局。
- 工具菜单展开时：保护区内点击不再透传到 shell，降低误触输入与误聚焦。
- 工具菜单展开时：点击保护区外自动折叠菜单；折叠状态不启用保护区，不影响终端正常点击。
- 全应用按钮点击区域统一向四周扩展 `8px`，提升手机/Pad 点击容错（例如 `22x22 -> 38x38`）。

### 交互细节

- 保护区仅在 `touchToolsExpanded=true` 生效；折叠态仅保留键盘按钮自身命中。
- 外部点击折叠通过 `pointerdown capture` 实现，不改变既有按钮视觉样式与布局。
- 按钮命中扩展采用样式层实现，视觉尺寸不变，仅增加可点击面积。

### 涉及文件

- `apps/web/src/components/TerminalPanel.vue`
- `apps/web/src/styles/main.css`

## v1.0.8

发布时间：2026-02-24
版本定位：配置中心稳定性与运维配置落地

### 变更亮点

- 修复全局设置刷新丢失：定位并修复 IndexedDB `DataCloneError`（写入对象改为纯快照），主题与其它配置可稳定持久化。
- 配置页交互改进：恢复“保存设置”显式提交入口，同时保留自动保存与离页强制保存兜底。
- 新增 UI 模式切换：用户界面支持 `深色/浅色` 模式，并与主题预设联动重算颜色。
- 统一主题可读性规则：按钮色采用“背景与文本之间、偏向文本侧”的自动推导逻辑。
- 落地网关运维配置文件：支持读取 `apps/gateway/config/runtime.json`，并按 `Env > runtime.json > 默认值` 合并（`GATEWAY_TOKEN` 仅 Env）。

### 涉及文件

- `apps/web/src/views/SettingsView.vue`
- `apps/web/src/stores/settingsStore.ts`
- `apps/web/src/services/storage/db.ts`
- `apps/web/src/styles/main.css`
- `apps/gateway/src/config.ts`
- `apps/gateway/config/runtime.json`

## v1.0.9

发布时间：2026-02-25
版本定位：连接体验治理 + 服务器列表交互与移动端触控优化

### 变更亮点

- Codex 启动链路提示治理
  - 点击“连接”后立即关闭“启动 Codex”窗口；
  - 预检阶段吞掉内部命令回显，不向终端泄漏探测细节；
  - 仅在真实失败时提示 `codex工作目录不存在 / 服务器未装codex`，正常启动不提示失败 toast。
- 会话续接体验增强
  - 页面刷新触发 WS 短断后，网关保留 SSH 会话等待续接；
  - 前端“可续接窗口”状态高亮（强调色）并支持会话恢复显示。
- 认证信息安全显示优化
  - 私钥内容不明文回显；
  - 已保存私钥改为 16 位圆点掩码回显（仅覆盖占位，不泄露密钥）。
- 我的服务器列表新增拖拽排序能力（手柄拖动重排 + 持久化顺序恢复）。
- 拖拽交互增强：按住 `move.svg` 后卡片凸起，拖动时卡片跟随手指移动，落点高亮更明显。
- 服务器管理页新增 AI 按钮，图标资源统一迁移到 `apps/web/public/assets/icons/`。
- 图标配色与主题规范对齐：
  - `ai.svg` 使用按钮色（`--btn`）
  - `move.svg` 使用强调色（`--accent`）
- 交互防误触增强：
  - 服务器管理页文本禁止选择；
  - 全页面禁用双指缩放（iOS gesture + 多点 touchmove + Ctrl+wheel 兜底）。

### 关键修复

#### 1) 拖拽排序“看起来无效/偶发不生效”

根因：

1. 原 HTML5 `dragstart/drop` 链路在部分 WebView/触屏环境稳定性较差。
2. 向下拖到相邻项时，插入索引计算回到原位，表现为“松手后没变化”。
3. `elementFromPoint` 在某些场景命中浮层/伪元素，导致目标项识别失败。

修复：

1. 改为 Pointer 事件链路（`pointerdown/move/up/cancel`）。
2. 加入 `window + document(capture)` 双监听兜底，避免丢 move/up 事件。
3. 目标命中增加 y 坐标回退逻辑。
4. 调整重排算法：向下拖拽插到目标后，向上拖拽插到目标前。

#### 2) 服务器页误选文字

根因：拖拽/长按过程中，浏览器可能触发原生文字选择高亮。

修复：服务器管理页作用域内统一 `user-select: none`。

#### 3) 双指缩放未完全禁用

根因：仅 `meta viewport` 在部分设备/容器下不足以完全拦截缩放手势。

修复：在启动入口增加多层手势防缩放守卫：

1. 拦截 `gesturestart/gesturechange/gestureend`（iOS）
2. 拦截多触点 `touchmove`
3. 拦截 `Ctrl + wheel`

#### 4) Codex 启动成功却提示“未安装/目录不存在”

根因：

1. 启动预检输出与真实失败信号混在同一输出流，存在“命令回显文本误判为失败”的风险。
2. 连接切换/旧连接残留输出会干扰当前连接提示，导致误报 toast。
3. 交互上“点击连接后弹窗仍停留”与用户预期不一致。

修复：

1. 引入独立 token 行判定（目录不存在 / codex 缺失 / ready），不再按普通文本 contains 误判。
2. 预检阶段拦截并净化输出，仅在当前活跃连接且真实失败时发 warn toast。
3. 点击“连接”后立即关闭启动窗口，后续仅通过 toast 表达结果。

#### 5) 刷新后会话断开感知强、续接状态不清晰

根因：

1. WS 关闭码处理过窄会导致可续接场景未进入驻留窗口。
2. 前端缺少显式“可续接”状态表达，用户难判断当前是否可恢复。

修复：

1. 网关将 `1001/1006` 等短断码纳入驻留续接窗口（默认 20s）。
2. 前端新增 `isServerResumable` 判定并在连接按钮上使用强调态显示。

### 涉及文件

- `apps/web/src/views/ConnectView.vue`
- `apps/web/src/styles/main.css`
- `apps/web/src/main.ts`
- `apps/web/src/views/TerminalView.vue`
- `apps/web/src/stores/sessionStore.ts`
- `apps/web/src/views/ServerSettingsView.vue`
- `apps/gateway/src/server.ts`
- `apps/web/public/assets/icons/ai.svg`
- `apps/web/public/assets/icons/move.svg`

---

## 下载和安装

```bash
git clone <repo-url>
cd remoteconn
npm install
```

### 系统要求

- Node.js LTS（仓库未在 `package.json` 强制 `engines`，建议使用当前 LTS 版本）。
- npm workspace 可用（根脚本依赖 `npm run --workspaces`）。
- 若需网关守护进程部署：Linux 需 `systemd`，macOS 需 `launchd`。

### 快速开始

```bash
npm run dev:gateway
npm run dev:web
```

默认地址：

- Web：`http://localhost:5173`
- Gateway：`http://localhost:8787`
- Gateway WS：`ws://localhost:8787/ws/terminal`

### 生产构建

```bash
npm run build
```

网关运维（非 Docker）：

```bash
scripts/gatewayctl.sh ensure-env
scripts/gatewayctl.sh install-service $USER
scripts/gatewayctl.sh deploy
```

### 支持和反馈

- 终端中文输入修复细节：`docs/terminal-chinese-input-fix-2026-02-22.md`
- 触摸焦点状态机方案：`docs/touch-focus-state-machine-plan-2026-02-23.md`
- 问题反馈建议附带：终端日志、网关日志、复现步骤与设备信息（系统/浏览器/输入法）。

## v2.0.0

发布时间：2026-02-27
版本定位：语音输入交互定稿（Figma 对齐）+ 闪念记录闭环 + 文档与发布规范统一

### 变更亮点

- 语音输入区 UI 对齐 Figma（`Frame 2253 / Frame 2256`）：
  - `voice + record + send` 形成单手操作组，展开态联动；
  - 几何约束统一，`send` 最右边到 `clear` 左边固定 `16px`；
  - 新增整块 `Frame 2256` 背景层，圆角 `16px`；
  - 背景透明度规则：常态 `40%`，按住 voice 录音态 `100%`；
  - 与输入框重叠区域放在输入框层级之下，避免遮挡与误触。
- 语音闪念能力上线：
  - `record` 记录写入本地 `IndexedDB`；
  - 新增 `RecordsView`，支持分页（15 条/页）、导出、删除；
  - 底栏新增闪念入口（`recordmanager.svg`），除 records 页面外统一展示。
- 日志页可读性增强：
  - `LogsView` 改为分页（15 条/页）；
  - 增加总数与空态提示，移动端列表浏览更稳定。
- 资产与缓存治理：
  - 关键 SVG 引用统一增加版本 query，避免同名资源替换后缓存命中旧图；
  - Web 静态资源缓存策略补齐文档与问题清单记录。
- 交互一致性修正：
  - 底部工具条 `config.svg` 统一排到最后，跨页面顺序一致。

### 涉及文件（核心）

- `apps/web/src/components/TerminalVoiceInput.vue`
- `apps/web/src/views/RecordsView.vue`
- `apps/web/src/views/LogsView.vue`
- `apps/web/src/App.vue`
- `apps/web/src/styles/main.css`
- `apps/web/src/stores/voiceRecordStore.ts`
- `apps/web/public/assets/icons/record.svg`
- `apps/web/public/assets/icons/recordmanager.svg`
- `docs/terminal-voice-records-plan-2026-02-27.md`
- `question-solved.md`
- `README.md`
- `release.md`

## v2.2.0

发布时间：2026-03-06
版本定位：闪念增强定稿版（分类/编辑/查询/快速整理）+ 配置页精修

### 变更亮点

- 闪念清单升级为可整理工作流：
  - 支持分类、编辑、关键字搜索、分类过滤、快速改分类；
  - 新增 `updatedAt / category / contextLabel` 数据字段；
  - 导出内容补齐分类、上下文快照与更新时间。
- 语音输入与闪念联动增强：
  - 未连接时可继续语音输入并记录闪念；
  - `record` 动作支持当前分类与上下文快照；
  - 上下文格式固定为 `服务器名称-项目名`。
- 全局配置增加闪念分类治理：
  - `全局配置 -> 记录 -> 闪念分类` 支持新增、设默认、删除、排序；
  - 分类管理使用统一操作按钮与拖拽排序。
- 文档基线统一到 `v2.2.0`：
  - 闪念实现基线改写为面向小程序的最终对齐依据；
  - 小程序版本审计改为相对 `Web v2.2.0` 的真实差异说明。

## v2.3.0

发布时间：2026-03-06
版本定位：小程序大范围能力对齐版 + Web 交互与稳定性小修复

### 变更亮点

- 小程序完成本轮较大能力对齐：
  - 补齐 `connect / server settings / terminal / logs / records / settings / plugins` 主页面链路；
  - 闪念支持分类、搜索、分类过滤、编辑、快速改分类与导出；
  - 语音输入支持分类写入、未连接可记录闪念、写入 `服务器名称-项目名` 上下文快照；
  - `记录 -> 闪念分类` 管理支持新增、设默认、删除、按住拖动排序；
  - 服务器配置支持标签维护，服务器卡片底部展示项目标签与自定义标签；
  - 目录选择“长时间加载后超时”问题修复，目录命令改为更稳的 `sh -lc '...'` 外层调用方式。
- Web 端继续精修现有能力：
  - 配置页控件密度、卡片层级和记录页交互细节继续收敛；
  - 闪念卡片滑动操作、快速改分类弹层、编辑弹框与分类视觉语义完成多轮细调；
  - 终端输入与语音记录联动补齐边界行为。

### 文档更新

- 文档口径统一升级到 `v2.3.0`：
  - 根 README、发布说明、小程序 README 同步更新；
  - 小程序对齐审计调整为 `done`；
  - 配置实现方案、闪念实现基线、机读 parity 清单统一切到 `v2.3.0`。

### 涉及文件（文档与清单）

- `README.md`
- `release.md`
- `apps/miniprogram/README.md`
- `apps/miniprogram/parity.v2.3.0.json`
- `docs/miniprogram-v2.0.0-alignment-audit-2026-02-27.md`
- `docs/miniprogram-config-implementation-plan-2026-02-28.md`
- `docs/records-enhancement-plan-2026-03-06.md`

## v2.6.0

发布时间：2026-03-07
版本定位：小程序跳板机链路 + AI 快速启动 + v2.4.0 基线并档

### 变更亮点

- 小程序终端补齐后台续接链路：
  - 终端页返回其他页面后，会话默认继续保活 `15` 分钟，可在设置页配置为 `1~60` 分钟；
  - 再次进入同一服务器时优先复用原会话，并恢复终端尾部缓冲，修复“只有光标没有 prompt”问题；
  - 网关补齐 `resumeGraceMs` 驻留时长透传，并增加服务端上限保护。
- 小程序服务器列表继续收敛连接反馈：
  - 连接态按钮保持亮色高亮；
  - 新增外圈描边，视觉语义与 `copy` 按钮风格保持一致。
- 小程序终端渲染稳定性继续收敛：
  - 保持真实 `cols/rows` 计算、xterm 风格 cell 模型、自绘 caret 与宽字符 continuation 渲染；
  - 中文/英文混排输入与多页面切换场景下的终端显示一致性继续提升。
  - 修复 Linux 服务器连接/重连后 caret 纵向逐次偏移、`clear` 后才恢复的问题；
  - 空白 buffer 行高度、滚动状态读取与 overlay 同步时序重新对齐，减少首屏 banner 较长时的光标错位。
- Web 与小程序补齐 SSH 跳转主机链路：
  - 服务器配置页新增“跳转主机”卡片，支持第一跳/第二跳独立认证配置；
  - 网关支持通过第一跳 SSH 的 `direct-tcpip` 转发建立第二跳 SSH；
  - 主机指纹按基础信息服务器与跳转主机分别上报，便于可信校验与落库。
- 小程序补齐 AI 快速启动链路：
  - 服务器列表 `AI` 按钮可直接进入终端页并自动打开 AI 面板；
  - 终端页在未连接、连接中、已连接三种状态下统一支持 AI 启动意图消费；
  - Codex 启动前增加目录存在性与二进制存在性预检，失败时用明确提示代替隐式卡住。
- 小程序终端交互继续收敛：
  - 断开态提示改为显式展示，便于识别“已挂起可恢复”与“真实断开”；
  - 语音悬浮按钮在展开、拖动、键盘开合与收起后的定位规则继续收敛。
- 小程序闪念页补齐一组数据丢失与操作闭环问题：
  - 编辑弹窗改为自动保存，关闭弹窗、切后台、离开页面时都会立即 flush，避免修改内容后忘记点保存而丢失；
  - 编辑弹窗收口为右下角关闭按钮，减少原底部双按钮布局对内容区的挤压；
  - 快速改分类弹层与分类展示样式继续收敛，减少记录整理时的跳转负担。

### 文档更新

- 文档口径统一升级到 `v2.6.0`：
  - 根 README、发布说明、小程序 README、对齐审计、配置实现方案、闪念实现基线同步更新；
  - 新增 `apps/miniprogram/parity.v2.6.0.json` 作为当前机读对齐清单；
  - 新增 `docs/ssh-jump-encryption-diagram-2026-03-07.md` 说明跳板机加密链路；
  - 原 `v2.4.0` 的已发布内容并入当前 `v2.6.0`，不再单列维护当前版本口径。

### 涉及文件（文档与清单）

- `README.md`
- `release.md`
- `apps/miniprogram/README.md`
- `apps/miniprogram/parity.v2.6.0.json`
- `docs/miniprogram-v2.0.0-alignment-audit-2026-02-27.md`
- `docs/miniprogram-config-implementation-plan-2026-02-28.md`
- `docs/records-enhancement-plan-2026-03-06.md`
- `docs/terminal-voice-records-plan-2026-02-27.md`
- `docs/ssh-jump-encryption-diagram-2026-03-07.md`

## v2.6.1

发布时间：2026-03-08
版本定位：小程序终端字号问题临时收口版

### 变更亮点

- 小程序设置页增加终端字号使用提示：
  - 在“字号”配置项下新增小字提示“修改字号后建议断开重连”；
  - 作为当前版本对“修改字号后偶发吃字/显示不完整”的临时规避方案。
- 小程序设置页与服务器配置页补了一组输入稳定性修复：
  - 设置页数字输入改为“编辑阶段保留草稿，保存时再归一化”，不再边输入边被即时纠正；
  - 服务器配置页和跳板机端口同样改为保留原始输入，避免输入中被自动裁剪、补默认值；
  - 终端字体收敛到已验证稳定的等宽字体集合，历史不安全字体自动回退，减少因为比例字体导致的横向错位。
- 设置页增加字体配置兜底：
  - 若字体配置模块异常或安全字体列表取值失败，设置页仍能正常打开；
  - 会自动回退到最小可用的等宽字体集合，避免整页因为字体选项异常而崩掉。
- 小程序终端保留当前较稳定实现，不再继续扩大修复范围：
  - 将字号导致的偶发吃字问题明确记录为遗留问题；
  - 当前版本以“略有改善、可继续使用”为准，后续单独排期处理彻底修复。
- 清理排查阶段调试输出：
  - 移除终端排查期间新增的 `terminal.wrap` 调试日志；
  - 保留正式错误告警与必要运行日志，不再持续打印定位信息。
- 小程序版本口径统一更新为 `v2.6.1`：
  - 应用入口、插件运行时默认版本、项目说明与相关文档同步更新。

### 已知遗留问题

- 小程序终端在修改字号后，仍可能出现偶发“吃字/显示不完整”。
- 当前建议：修改字号后手动断开并重连终端会话。

### 文档更新

- 根 README、小程序 README 与发布说明同步记录 `v2.6.1`：
  - 标注该问题为当前遗留项；
  - 说明临时使用建议；
  - 保持当前版本为稳定基线。

### 涉及文件（核心）

- `apps/miniprogram/pages/settings/index.wxml`
- `apps/miniprogram/pages/settings/index.wxss`
- `apps/miniprogram/pages/terminal/index.js`
- `apps/miniprogram/app.js`
- `apps/miniprogram/utils/pluginRuntime.js`
- `apps/miniprogram/project.config.json`
- `apps/miniprogram/pages/plugins/index.wxml`
- `README.md`
- `apps/miniprogram/README.md`
- `release.md`

## v2.6.5

发布时间：2026-03-08
版本定位：小程序终端 VT P0 基线收口版

### 变更亮点

- 小程序终端 VT 最小可用能力继续推进并收口到当前基线：
  - 双缓冲与备用屏幕切换已进入当前实现，`47 / 1047 / 1048 / 1049`、`DSR / CPR / DA1 / DA2 / DECSTR`、基础局部重绘与原始按键编码已接入；
  - normal buffer 与 alternate screen 的渲染语义已分离，后续补更完整 VT 能力时可以继续在现有基线上迭代；
  - 当前 P0 主链路已基本打通，后续重点转向 parser 完整度、P1 边界精修与高级交互能力。
- 小程序终端视口与滚动边界补齐了一轮稳定性修复：
  - normal buffer 的 live tail 与最大滚动值改为同源；
  - 历史内容回到底部后，不再继续把当前命令行往上推；
  - 相关纯函数测试已补齐，避免后续 VT 扩展把该问题带回。
- 文档与版本口径统一更新为 `v2.6.5`：
  - 根 README、小程序 README、发布说明、小程序项目描述与运行时默认版本已同步；
  - 当前进展、核心缺口与后续迭代顺序已写入终端 VT 实施方案文档，便于后续继续接续。

### 当前仍需补充完善的核心能力

- 终端 parser 仍是轻量实现，距离更完整的 VT500 状态机还有差距。
- `reverseWraparound`、`applicationKeypad`、`sendFocus`、`insertMode` 等模式位尚未补齐。
- `scroll region / insert-delete / origin mode` 仍需继续做 P1 级语义精修。
- `DECSCUSR` 光标样式、focus reporting、mouse reporting 与 alt screen 挂起恢复策略仍待后续迭代。

### 已知遗留问题

- 小程序终端在修改字号后，仍可能出现偶发“吃字/显示不完整”。
- 当前建议：修改字号后手动断开并重连终端会话。

### 文档更新

- 当前版本说明与终端 VT 实施进展已同步更新到：
  - `README.md`
  - `apps/miniprogram/README.md`
  - `docs/miniprogram-terminal-vt-implementation-plan-2026-03-08.md`
  - `docs/miniprogram-terminal-vt-guardrails-2026-03-08.md`

### 涉及文件（核心）

- `README.md`
- `release.md`
- `apps/miniprogram/README.md`
- `apps/miniprogram/app.js`
- `apps/miniprogram/app.wxss`
- `apps/miniprogram/project.config.json`
- `apps/miniprogram/pages/plugins/index.wxml`
- `apps/miniprogram/utils/pluginRuntime.js`

## v2.6.6

发布时间：2026-03-09
版本定位：小程序本地存储口径澄清与遗留问题登记版

### 变更亮点

- 文档口径统一升级到 `v2.6.6`：
  - 根 README、小程序 README、Changelog 与发布说明同步更新；
  - 当前小程序稳定基线口径统一收敛到 `v2.6.6`。
- 小程序本地存储验证边界补充说明：
  - 当前业务数据仍以微信小程序本地 storage 持久化；
  - 通过 `npm run mini` 生成的 `miniprogram-ci preview` 二维码，默认按“预览链路”看待；
  - 预览链路下是否能看到正式版历史缓存，不作为正式版本地缓存连续性的判断依据。

### 已知遗留问题

- 使用 preview 预览二维码进入小程序时，不能假设其一定继承正式版历史缓存可见性。
- 当前阶段不以 preview/开发链路的缓存表现，作为正式版本地数据是否连续的唯一判断依据。
- 后续考虑补充更直接的 storage 调试与备份能力，降低排查成本。

### 文档更新

- `README.md`
- `apps/miniprogram/README.md`
- `CHANGELOG.md`
- `release.md`

## v2.7.0

发布时间：2026-03-09
版本定位：小程序配置跨设备同步落地版

### 变更亮点

- 小程序配置类数据改为“双层持久化”：
  - `settings / servers / records` 在本地 storage 之外，新增通过 Gateway 写入 SQLite 的服务端保存；
  - 同一微信账号在新设备登录后，可通过同步链路恢复设置、服务器配置和闪念记录。
- 第一阶段同步链路正式接入：
  - Gateway 已提供 `POST /api/miniprogram/auth/login`、`GET /api/miniprogram/sync/bootstrap`、`GET/PUT /api/miniprogram/sync/settings`、`GET/PUT /api/miniprogram/sync/servers`、`GET/PUT /api/miniprogram/sync/records`；
  - 小程序已接入启动 `bootstrap`、日常异步推送，以及服务器和闪念删除的 `tombstone` 合并。
- 服务端存储边界明确：
  - 服务器受保护字段拆分为加密后的 `secret_blob` 保存，SSH 密码、私钥、口令与证书不以明文写入 SQLite；
  - 终端会话缓冲仍不纳入第一阶段同步。

### 文档更新

- `README.md`
- `apps/miniprogram/README.md`
- `CHANGELOG.md`
- `release.md`
- `docs/miniprogram-about-page-review-plan-2026-03-09.md`
- `docs/miniprogram-terminal-vt-guardrails-2026-03-08.md`
- `docs/miniprogram-terminal-vt-implementation-plan-2026-03-08.md`

### 涉及文件（文档与对外版本展示）

- `README.md`
- `apps/miniprogram/README.md`
- `CHANGELOG.md`
- `release.md`
- `apps/miniprogram/app.js`
- `apps/miniprogram/project.config.json`
- `apps/miniprogram/utils/aboutContent.js`
- `apps/web/src/content/about.ts`
- `apps/miniprogram/pages/plugins/index.wxml`
- `apps/miniprogram/utils/pluginRuntime.js`

### 涉及文件（文档）

- `README.md`
- `apps/miniprogram/README.md`
- `CHANGELOG.md`
- `release.md`

## v2.7.1

发布时间：2026-03-10
版本定位：小程序同步 SQLite/WAL 口径澄清版

### 变更亮点

- 文档与对外版本展示统一升级到 `v2.7.1`：
  - 根 README、小程序 README、Changelog、Release、关于页与小程序版本展示统一更新；
  - 当前对外稳定基线口径收敛到 `v2.7.1`。
- 同步边界说明补齐：
  - 当前跨设备同步仍只覆盖 `settings / servers / records`；
  - 服务器受保护字段继续以加密后的 `secret_blob` 保存；
  - `logs`、插件运行时日志与终端会话缓冲仍不纳入第一阶段同步。
- 同步配置开关行为补齐：
  - 小程序全局配置的“连接配置”页已增加“同步配置云端”开关；
  - 关闭后，`settings / servers / records` 仅保留本地保存，不再发起云端 bootstrap 和日常异步推送；
  - 重新打开后，会先强制拉取一次 `bootstrap`，按现有 `updatedAt / tombstone` 规则合并本地与云端，再补推当前合并结果，避免直接用关闭期间的本地快照覆盖远端。
- SQLite WAL 行为说明补齐：
  - `remoteconn-sync.db-wal` 是写前日志，文件体积不直接等于当前有效同步数据量；
  - 执行 checkpoint 后，已提交页会回写到 `remoteconn-sync.db`；
  - 排查同步库大小时，应优先看主库内容、表行数与字段体积，而不是仅看 `-wal` 文件大小。

### 已知遗留问题

- 当前小程序终端仍存在明显交互卡顿：
  - 点击 Codex 连接选项后，约 `10` 秒才出现首个回显；
  - 等待期间除上下滑动外，其余按钮基本阻塞、无即时响应；
  - 当前先按“已登记遗留问题”处理，后续需继续定位主线程阻塞点与终端渲染/连接链路的耗时来源。

### 文档更新

- `README.md`
- `apps/miniprogram/README.md`
- `CHANGELOG.md`
- `release.md`
- `docs/miniprogram-sync-sqlite-plan-2026-03-09.md`
- `apps/miniprogram/utils/aboutContent.js`
- `apps/web/src/content/about.ts`

### 涉及文件（文档与对外版本展示）

- `README.md`
- `apps/miniprogram/README.md`
- `CHANGELOG.md`
- `release.md`
- `docs/miniprogram-sync-sqlite-plan-2026-03-09.md`
- `apps/miniprogram/app.js`
- `apps/miniprogram/app.wxss`
- `apps/miniprogram/project.config.json`
- `apps/miniprogram/pages/plugins/index.wxml`
- `apps/miniprogram/utils/pluginRuntime.js`
- `apps/miniprogram/utils/aboutContent.js`
- `apps/web/src/content/about.ts`

## v2.8.0

发布时间：2026-03-10
版本定位：小程序 Terminal `Codex` 交互卡顿重大优化版

### 变更亮点

- 重点解决小程序终端在 `Codex` 交互期间的三类高感知问题：
  - 点击 `Codex` 连接项后，首个可见回显有时需要数秒到 `10s+`；
  - 等待与输出洪峰期间，除上下滑动外，右上角连接按钮、工具按钮、输入区聚焦等交互容易出现无响应或超长延时；
  - 右上角时延显示会被拉高到 `10s+`，但该值本质上混入了主线程阻塞后的消息处理延迟，不等于真实网络 RTT。
- 小程序 Terminal 写入链路已参考 `xterm` 思路完成第一阶段重构：
  - `stdout` 先合批，再进入单飞渲染调度，避免 `scroll-view` 与 overlay 刷新风暴；
  - `stdout` 处理改为“安全切片 + 时间片推进”，不再一次性同步吃完整个输出洪峰；
  - 用户刚点击按钮、聚焦输入区、发送控制键时，后续 `stdout` slice 会更快让出主线程，降低交互饿死概率。
- 终端 VT/状态写回热路径继续减重：
  - `CSI / OSC / DCS / ESC / CRLF` 不再被从中间切断，避免切片后控制序列语义损坏；
  - `stdout` 运行态改为“任务创建时复制一次，后续 slice 复用”，减少 `normal/alt buffer` 重复深拷贝；
  - 页面层发布活动 buffer 时改为引用发布，显著压低 `cloneCostMs / stateApplyCostMs`。
- 过程日志补齐：
  - 新增 `stdout.slice / stdout.slice.long`；
  - `stdout.append` 增加 `chunkCount / sliceCount / carryBytes / renderReason`；
  - 继续保留 `main_thread_lag / layout.refresh / overlay.sync`，便于后续跟踪极端输出长尾。

### 解决结果

- `Codex` 启动后的首个可见回显等待时间已显著缩短，不再长期停留在“点击后数秒到十秒以上无反馈”的状态。
- 输出洪峰期间，按钮、工具区、输入区聚焦的阻塞感已明显下降，主问题按“已解决”收口。
- 右上角时延显示不再频繁被主线程卡顿拉高；文档口径同步明确，先前的 `10s+` 更多是“消息处理延迟”而非真实网络 RTT。

### 当前边界

- 极端大输出、长时间连续洪峰下，主线程仍有继续压缩长尾的空间；
- 后续优化重点会继续落在 `applyTerminalOutput` 的增量化、字符串/字节统计成本与更细粒度的 stdout 时间片调度。

### 相关文档

- `release.md`
- `question-solved.md`
- `docs/miniprogram-terminal-xterm-stall-optimization-plan-2026-03-10.md`

### 涉及文件（核心实现）

- `apps/miniprogram/pages/terminal/index.js`
- `apps/miniprogram/pages/terminal/vtParser.js`
- `apps/miniprogram/pages/terminal/terminalBufferState.js`
- `apps/miniprogram/pages/terminal/terminalBufferSet.js`
- `apps/miniprogram/pages/terminal/terminalRenderScheduler.js`
- `apps/miniprogram/utils/gateway.js`

## v2.8.1

发布时间：2026-03-10
版本定位：终端语音区视觉收口与 VT 主题背景修正版

### 变更亮点

- 终端语音区视觉继续收口：
  - 展开语音区按钮默认改为全透明，仅保留 SVG 本体颜色；
  - 分类胶囊改为贴文字高度，选中态背景切到更明显的实色；
  - 录音中的输入框上方新增更显眼的双环脉冲提示，文案更新为“正在收音，松开后发送或记录闪念”。
- 终端主题与按钮配色规则补齐：
  - 小程序按钮继续收口到 `UI / Shell` 双域规则；
  - terminal 顶栏与语音区 SVG 图标按主题运行时着色，不再只看按钮外圈背景。
- 小程序 VT 语义继续修正：
  - `OSC 10 / 11 / 12` 查询已返回真实 shell 主题色；
  - `alt screen`、`CSI J / K / X` 与滚动区插删行产生的空白位统一继承当前擦除背景，不再出现“文字块有底色、周围空白仍是主题底色”的裂屏。
- 此前终端交互卡顿问题已收敛：
  - 点击 Codex 连接选项后首回显明显迟滞、等待期间按钮基本阻塞的问题已解决；
  - 当前版本不再把该问题列为已知遗留问题。
- 文档与版本口径统一升级到 `v2.8.1`：
  - 小程序 README、关于页、项目描述、插件页基线提示、VT 方案文档与语音输入方案说明统一同步到当前版本。

### 已知遗留问题

- 小程序终端当前仍存在一个低频连接时序问题：
  - 偶发新连接后首屏只显示光标，提示符会稍后才出现；
  - 初步定位为前端 `connected` 状态与自绘光标已提前进入可见态，但首个可见 `stdout / prompt` 仍晚到；
  - 当前先按“已登记遗留问题”处理，后续再优化连接就绪判定与 prompt 首屏兜底。

### 文档更新

- `README.md`
- `CHANGELOG.md`
- `release.md`
- `apps/miniprogram/README.md`
- `apps/miniprogram/app.js`
- `apps/miniprogram/app.wxss`
- `apps/miniprogram/project.config.json`
- `apps/miniprogram/pages/plugins/index.wxml`
- `apps/miniprogram/utils/aboutContent.js`
- `apps/web/src/content/about.ts`
- `docs/miniprogram-config-implementation-plan-2026-02-28.md`
- `docs/miniprogram-terminal-vt-guardrails-2026-03-08.md`
- `docs/miniprogram-terminal-vt-implementation-plan-2026-03-08.md`
- `docs/terminal-voice-input-plan-2026-02-26.md`

## v2.8.2

发布时间：2026-03-10
版本定位：连接态高亮强化与 about 页面主题口径统一

### 变更亮点

- 连接态视觉强化：
  - 小程序服务器列表 `connect` 按钮与底栏 `shell` 按钮在存在活动连接时，统一改为高饱和实底高亮；
  - 连接态不再主要依赖描边反馈，降低“亮了但不够明显”的误判。
- 连接态图标着色规则补齐：
  - 连接态 SVG 前景色改为运行时跟随界面前景色；
  - 图标落在高亮底色上时，不再继续沿用偏灰按钮色。
- about 页面配色统一：
  - 小程序 about 首页、5 个详情页与 `about-app` 改为统一跟随界面配置推导出的主题 token；
  - Web about 页同步切到同一套主题变量策略，不再单独维护固定浅色板。
- about 反馈遗留问题登记：
  - 当前“反馈”按钮仍只复制邮箱地址；
  - 暂不支持直接拉起系统发送邮件组件，本轮先按“已登记遗留问题”处理。
- 文档与版本口径统一升级到 `v2.8.2`：
  - 发布说明、Changelog、README、小程序 README、关于页、项目描述与当前基线文档统一同步到当前版本。

### 已知遗留问题

- 小程序终端当前仍保留一个低频连接时序问题：
  - 偶发新连接后首屏只显示光标，提示符稍后才出现；
  - 当前继续按“已登记遗留问题”处理，后续再优化连接就绪判定与 prompt 首屏兜底。
- about 页“问题反馈”当前仍只支持复制邮箱：
  - 暂不直接拉起系统发送邮件组件；
  - 当前继续按“已登记遗留问题”处理，暂不实现。

### 文档更新

- `README.md`
- `CHANGELOG.md`
- `release.md`
- `apps/miniprogram/README.md`
- `apps/miniprogram/app.js`
- `apps/miniprogram/app.wxss`
- `apps/miniprogram/project.config.json`
- `apps/miniprogram/pages/plugins/index.wxml`
- `apps/miniprogram/utils/aboutContent.js`
- `apps/web/src/content/about.ts`
- `docs/miniprogram-config-implementation-plan-2026-02-28.md`
- `docs/miniprogram-terminal-vt-guardrails-2026-03-08.md`
- `docs/miniprogram-terminal-vt-implementation-plan-2026-03-08.md`
- `docs/terminal-voice-input-plan-2026-02-26.md`

## v2.9.0

发布时间：2026-03-11
版本定位：小程序 Codex 交互区缺行与闪动修复版

### 变更亮点

- 重点解决小程序终端在 `Codex` 持续输出期间最影响观感的一组交互问题：
  - 底部提示块原本应稳定存在的空白行、说明行和状态行会被裁掉；
  - 输出过程中该区域会反复上下闪动，偶尔完整出现但大多数时间被截断；
  - `> Use /skills to list available skills` 与代码块这类整行高亮区域，还会在行与行之间透出底色细线；
  - 用户看到的是“交互区不稳定”，但根因并不在单一样式，而在 viewport、同步刷新控制流与背景承载层级。
- terminal viewport 口径继续收口：
  - normal buffer 不再只按 `cursorRow + 1` 生硬裁尾；
  - 当光标行之后仍存在真实 footer 时，会继续保留到 `renderRows`。
- Codex 同步刷新窗口兼容补齐：
  - `CSI ? 2026 h/l` 已按同步刷新边界做收口；
  - 高频局部重绘的中间态不再被逐帧暴露到界面，底部块稳定性明显提升。
- 高亮块渲染口径继续收口：
  - 整行统一背景优先提升到 line 层绘制；
  - 统一背景区域不再在行间透出底色细缝，且没有新增渲染节点。
- 回归验证补齐：
  - 新增 2026-03-11 真实 PTY 抓包回放用例；
  - footer 保留、同步刷新窗口与高亮背景渲染相关回归测试已补齐。
  - 会话续接恢复新增几何快照回归约束：首次恢复以 `lines + bufferCols / bufferRows` 为准，避免截断 `replayText` 在默认 `80x24` 下提前重建出顶部空白和裸露 `5;2H`。

### 解决结果

- `Codex` 交互期间，底部提示块与状态行已能稳定显示完整高度，不再长期缺最后几行。
- 持续输出过程中，底部区域的明显上下闪动已显著收敛。
- 统一高亮背景区域不再在行间透出底色细线。
- 返回服务器列表后再次进入同一会话时，历史区首次恢复不再误用被裁剪的 `replayText`，顶部空白与裸露定位串问题已收口。
- 当前版本最重要的对外变化明确收口为“交互问题修复”，而不是单纯样式调整。

### 文档更新

- `README.md`
- `CHANGELOG.md`
- `release.md`
- `apps/miniprogram/README.md`
- `apps/miniprogram/app.js`
- `apps/miniprogram/app.wxss`
- `apps/miniprogram/project.config.json`
- `apps/miniprogram/utils/aboutContent.js`
- `apps/web/src/content/about.ts`
- `question-solved.md`
- `docs/miniprogram-codex-footer-flicker-optimization-plan-2026-03-11.md`
- `docs/miniprogram-config-implementation-plan-2026-02-28.md`
- `docs/miniprogram-terminal-vt-guardrails-2026-03-08.md`
- `docs/miniprogram-terminal-vt-implementation-plan-2026-03-08.md`
- `docs/terminal-voice-input-plan-2026-02-26.md`

## v2.9.1

发布时间：2026-03-11
版本定位：小程序续接恢复与同步展示收口版

### 变更亮点

- 会话续接首次恢复口径继续收口：
  - 首次回到终端页时，以挂起前保存的 `lines + bufferCols / bufferRows` 作为当前屏幕权威来源；
  - 被裁剪过的 `replayText` 不再参与首次恢复，避免返回服务器列表后再次进入时出现历史区顶部空白和裸露 `5;2H`。
- 启动同步后的界面刷新链路补齐：
  - `bootstrap` 合并远端配置并落地本地后，会主动广播同步已应用事件；
  - 首页服务器列表与底栏会立即刷新，不再需要重新进入页面才能看到同步后的配置。
- 小程序审核文案继续收口：
  - 用户隐私政策与 about 隐私页同步到最新审核口径；
  - 录音用途、处理范围与用户权利说明已补齐，便于重新提审和发布。

### 解决结果

- 返回服务器列表后再次进入同一会话时，历史区首次恢复不再误用被裁剪的 `replayText`，顶部空白与裸露定位串问题已收口。
- 新终端首次打开小程序并完成同步后，首页服务器列表会自动更新，不再需要重进页面才能看到同步后的服务器配置。
- 小程序 about 页、隐私政策文档与发布口径已经对齐到同一审核文案。

### 文档更新

- `README.md`
- `CHANGELOG.md`
- `release.md`
- `apps/miniprogram/README.md`
- `apps/miniprogram/app.js`
- `apps/miniprogram/app.wxss`
- `apps/miniprogram/project.config.json`
- `apps/miniprogram/utils/aboutContent.js`
- `apps/miniprogram/utils/i18nCatalog.js`
- `apps/web/src/content/about.ts`
- `question-solved.md`
- `docs/miniprogram-codex-footer-flicker-optimization-plan-2026-03-11.md`
- `docs/miniprogram-config-implementation-plan-2026-02-28.md`
- `docs/miniprogram-terminal-vt-guardrails-2026-03-08.md`
- `docs/miniprogram-terminal-vt-implementation-plan-2026-03-08.md`
- `docs/terminal-voice-input-plan-2026-02-26.md`

## v2.9.3

发布时间：2026-03-11
版本定位：小程序时延诊断面板与主题对比度收口版

### 变更亮点

- 小程序时延诊断浮窗完成一轮结构重做：
  - 原先分离的“网关响应 / 网络时延”两张图，已经合并成一张双轴平滑曲线图；
  - 左轴保留网关响应量纲，右轴保留网络时延量纲；
  - 顶部指标卡统一收口为两张两行摘要卡，固定展示 `min / max / avg`。
- 诊断面板内容继续压缩：
  - 原“诊断信息”文字卡已删除，只保留图表卡；
  - 同一服务器断开重连后，会优先延续已有采样，尽量补足最近 `30` 个点。
- 终端主题融合继续收口：
  - 时延面板改为跟随终端主题的反相面板；
  - 深色终端单独切换一套更深的蓝橙曲线与指标色，避免浅底上文字和曲线发灰看不清；
  - 浅色终端继续保留原来的亮色高光，维持暗底上的对比度。

### 解决结果

- 小程序时延诊断图不再拆成两张折线图，读取趋势时不需要在两张卡之间来回比对。
- 终端深浅主题下，时延面板文字、指标和曲线的可读性口径已经统一。
- 当前版本对外口径明确收口为“诊断图表与主题对比度修正”，而不是新增新的同步或终端协议能力。

### 文档更新

- `README.md`
- `CHANGELOG.md`
- `release.md`
- `apps/miniprogram/README.md`
- `apps/miniprogram/app.js`
- `apps/miniprogram/project.config.json`
- `apps/miniprogram/utils/aboutContent.js`
- `apps/miniprogram/utils/aboutContent.test.ts`
- `apps/miniprogram/utils/i18nCatalog.js`
- `apps/miniprogram/pages/about-app/index.test.ts`
- `apps/web/src/content/about.ts`
- `question-solved.md`
- `docs/miniprogram-codex-footer-flicker-optimization-plan-2026-03-11.md`
- `docs/miniprogram-config-implementation-plan-2026-02-28.md`
- `docs/miniprogram-terminal-vt-guardrails-2026-03-08.md`
- `docs/miniprogram-terminal-vt-implementation-plan-2026-03-08.md`
- `docs/terminal-voice-input-plan-2026-02-26.md`

## v2.9.4

发布时间：2026-03-12
版本定位：文档与版本口径同步版

### 变更亮点

- 当前版本不引入额外功能改动：
  - 小程序终端、同步链路、时延诊断与主题逻辑均沿用 `v2.9.3` 当前基线；
  - 本次仅统一仓库内所有“当前版本”与对外说明口径。
- 文档与展示文案已完成一轮同步：
  - Root README、Changelog、Release、问题闭环记录与多份当前基线文档统一升级到 `v2.9.4`；
  - Web / 小程序关于页、i18n 文案、小程序项目描述与分享标题等版本展示同步更新。

### 解决结果

- 仓库内对外展示的当前版本号已统一为 `v2.9.4`，避免 README、关于页、项目描述与问题记录之间出现版本漂移。
- 当前版本明确为“文档同步版”，不会误导为新增了新的终端、同步或语音行为变更。

### 文档更新

- `README.md`
- `CHANGELOG.md`
- `release.md`
- `apps/miniprogram/README.md`
- `apps/miniprogram/app.js`
- `apps/miniprogram/project.config.json`
- `apps/miniprogram/utils/aboutContent.js`
- `apps/miniprogram/utils/aboutContent.test.ts`
- `apps/miniprogram/utils/i18nCatalog.js`
- `apps/miniprogram/pages/about-app/index.test.ts`
- `apps/web/src/content/about.ts`
- `question-solved.md`
- `docs/miniprogram-codex-gateway-tts-plan-2026-03-11.md`
- `docs/miniprogram-codex-footer-flicker-optimization-plan-2026-03-11.md`
- `docs/miniprogram-config-implementation-plan-2026-02-28.md`
- `docs/miniprogram-terminal-vt-guardrails-2026-03-08.md`
- `docs/miniprogram-terminal-vt-implementation-plan-2026-03-08.md`
- `docs/terminal-voice-input-plan-2026-02-26.md`

## v2.9.5

发布时间：2026-03-13
版本定位：文档与遗留问题口径同步版

### 变更亮点

- 当前版本仅同步文档与对外口径：
  - 不引入新的功能、协议行为或交互变更；
  - 继续沿用 `v2.9.4` 已完成的现有终端、同步与时延诊断能力。
- 新登记一条小程序终端语音播报遗留问题：
  - 当前播报文本提取与轮次稳定判定仍不够准确，播报内容存在偏差；
  - 长时间 `Codex` 交互时，语音播报链路还会放大小程序端响应压力；
  - 现阶段先不建议默认使用，后续继续优化文本提取、触发时机与性能隔离。
- 文档与展示文案已完成一轮同步：
  - Root README、Changelog、Release、小程序 README、Web / 小程序关于页、多语言文案、小程序工程描述与当前基线文档统一升级到 `v2.9.5`；
  - TTS 方案文档同步补充“当前暂不建议默认使用”的遗留问题口径。

### 解决结果

- 仓库内对外展示的当前版本号已统一为 `v2.9.5`，避免 README、关于页、小程序项目描述与当前基线文档之间出现版本漂移。
- 语音播报能力的当前边界已明确：暂列为待优化遗留问题，不再在文档里以“已可默认使用”的口径出现。

### 文档更新

- `README.md`
- `CHANGELOG.md`
- `release.md`
- `apps/miniprogram/README.md`
- `apps/miniprogram/app.js`
- `apps/miniprogram/project.config.json`
- `apps/miniprogram/utils/aboutContent.js`
- `apps/miniprogram/utils/aboutContent.test.ts`
- `apps/miniprogram/utils/i18nCatalog.js`
- `apps/miniprogram/pages/about-app/index.test.ts`
- `apps/web/src/content/about.ts`
- `docs/miniprogram-codex-gateway-tts-plan-2026-03-11.md`
- `docs/miniprogram-codex-footer-flicker-optimization-plan-2026-03-11.md`
- `docs/miniprogram-config-implementation-plan-2026-02-28.md`
- `docs/miniprogram-terminal-vt-guardrails-2026-03-08.md`
- `docs/miniprogram-terminal-vt-implementation-plan-2026-03-08.md`
- `docs/terminal-voice-input-plan-2026-02-26.md`

## v2.9.6

发布时间：2026-03-13
版本定位：文档与对外口径同步版

### 变更亮点

- 当前版本仅同步文档与对外口径：
  - 不引入新的功能、协议行为或交互变更；
  - 继续沿用 `v2.9.5` 已完成的现有终端、同步与时延诊断能力，以及当前语音播报边界口径。
- 文档与展示文案已完成一轮同步：
  - Root README、Changelog、Release、小程序 README、Web / 小程序关于页、多语言文案、小程序工程描述与当前基线文档统一升级到 `v2.9.6`；
  - 当前版本对外展示的版本号与当前基线说明已收口到同一口径。

### 解决结果

- 仓库内对外展示的当前版本号已统一为 `v2.9.6`，避免 README、关于页、小程序项目描述与当前基线文档之间出现版本漂移。
- 当前版本继续保留既有能力边界，不新增新的功能承诺或行为变更说明。

### 文档更新

- `README.md`
- `CHANGELOG.md`
- `release.md`
- `apps/miniprogram/README.md`
- `apps/miniprogram/app.js`
- `apps/miniprogram/project.config.json`
- `apps/miniprogram/utils/aboutContent.js`
- `apps/miniprogram/utils/aboutContent.test.ts`
- `apps/miniprogram/utils/i18nCatalog.js`
- `apps/miniprogram/pages/about-app/index.test.ts`
- `apps/web/src/content/about.ts`
- `docs/miniprogram-codex-gateway-tts-plan-2026-03-11.md`
- `docs/miniprogram-codex-footer-flicker-optimization-plan-2026-03-11.md`
- `docs/miniprogram-config-implementation-plan-2026-02-28.md`
- `docs/miniprogram-terminal-vt-guardrails-2026-03-08.md`
- `docs/miniprogram-terminal-vt-implementation-plan-2026-03-08.md`
- `docs/terminal-voice-input-plan-2026-02-26.md`

## v3.0.1

发布时间：2026-03-20
版本定位：使用手册与主题文案同步版。生产可用版本。

### 变更亮点

- 小程序“使用手册”补成图文版：
  - 正文前置“为什么需要这个APP？”，把项目介绍中的核心动机放到真正使用说明前面；
  - 服务器列表、服务器配置、终端、语音、设置、记录、关于等主链路补上 `guide-mobile-*` 配图。
- 小程序主题口径继续收口：
  - 主题预设补齐到与 Web 一致的 `21` 套；
  - 主题名称支持随语言切换，并统一压短为单词短名，减少设置页列表长度。
- 对外版本口径统一升级到 `v3.0.1`：
  - Root README、Changelog、Release、小程序 README、项目介绍、相关方案文档与品牌模板统一更新到 `v3.0.1`。

### 解决结果

- 当前小程序说明内容从“纯文字审核说明”收口到“图文操作手册”，更接近真实使用路径。
- 当前版本不新增新的同步协议、终端协议或配置字段，继续沿用 `v3.0.0` 已明确的能力边界。

### 文档更新

- `README.md`
- `CHANGELOG.md`
- `release.md`
- `apps/miniprogram/README.md`
- `docs/project-introduction-2026-03-19.md`
- `docs/miniprogram-about-page-review-plan-2026-03-09.md`
- `docs/miniprogram-codex-gateway-tts-plan-2026-03-11.md`
- `docs/miniprogram-codex-footer-flicker-optimization-plan-2026-03-11.md`
- `docs/miniprogram-config-implementation-plan-2026-02-28.md`
- `docs/miniprogram-terminal-vt-guardrails-2026-03-08.md`
- `docs/miniprogram-terminal-vt-implementation-plan-2026-03-08.md`
- `docs/promo-package-template/brand-template.yaml`
- `docs/terminal-voice-input-plan-2026-02-26.md`

## v3.0.0

发布时间：2026-03-18
版本定位：终端交互稳定性修复 + shell性能优化+ 文档与版本口径同步。生产可用版本。

### 变更亮点

- shell卡顿性能问题优化。
- 小程序终端新增 caret 稳定窗口：
  - 高压 `stdout` 输出期间，页面会优先保留最近稳定的 caret 位置，减少底部后几行行尾来回跳的问题；
  - 最终帧与用户输入相关帧仍会立即提交最新 caret，避免把真实位置长期冻结。
- 小程序 shell 输入链路补上被动 `blur` 保护：
  - 在软键盘仍保持可见时，页面不会因输入法抛出的临时 `blur` 立刻判定失焦；
  - 豆包输入法长按语音输入过程中，不应再被页面主动打断录音态。
- 对外版本口径统一升级到 `v3.0.0`：
  - Root README、Changelog、Release、小程序 README、Web / 小程序关于页、多语言文案、小程序工程描述与当前基线文档统一更新到 `v3.0.0`。

### 解决结果

- 终端页当前已把“底部 caret 高频跳动”和“键盘仍在时的被动失焦”分别收口到稳定窗口与键盘可见态保护链路。
- 当前版本不新增新的同步协议、终端协议或配置字段，继续沿用既有数据边界与对外说明。

### 文档更新

- `README.md`
- `CHANGELOG.md`
- `release.md`
- `apps/miniprogram/README.md`
- `apps/miniprogram/app.js`
- `apps/miniprogram/project.config.json`
- `apps/miniprogram/utils/aboutContent.js`
- `apps/miniprogram/utils/aboutContentLocaleOverlays.js`
- `apps/miniprogram/utils/aboutContent.test.ts`
- `apps/miniprogram/utils/i18nCatalog.js`
- `apps/miniprogram/utils/i18nCatalogLocaleOverlays.js`
- `apps/miniprogram/pages/about-app/index.test.ts`
- `apps/web/src/content/about.ts`
- `docs/miniprogram-about-page-review-plan-2026-03-09.md`
- `docs/miniprogram-codex-gateway-tts-plan-2026-03-11.md`
- `docs/miniprogram-codex-footer-flicker-optimization-plan-2026-03-11.md`
- `docs/miniprogram-config-implementation-plan-2026-02-28.md`
- `docs/miniprogram-terminal-vt-guardrails-2026-03-08.md`
- `docs/miniprogram-terminal-vt-implementation-plan-2026-03-08.md`
- `docs/promo-package-template/brand-template.yaml`
- `docs/terminal-voice-input-plan-2026-02-26.md`
