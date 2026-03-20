<p align="center">
  <img src="assets/icons/logo.svg" alt="RemoteConn Logo" width="96" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <strong>中文</strong>
</p>

# RemoteConn（生产架构版）

这个项目不是玩具，是生产级别的应用。同时要特别关注处理和传送的高效。

为什么做这个工具：

1. 有了AI，未来的确保留一个shell入口就可以了，原来无比重要的IDE可以扔进垃圾桶。原来觉得chatGPT这个名字很Low，现在看来很有前瞻性，chat很准确。
1. 有了AI，屏幕大小没有那么重要，因为很多时候并不需要手动与PC交互coding，尤其是做手机端应用，很多任务可以在手机侧完成。这样，手机侧入口与AI的交互性就变得很重要。也就是解决把任务送给AI的问题。这样AI接到任务 - 完成任务 - 手机上验证就闭环了。

=> 所以这个工具的入口就是shell+chat。

2. 语音大模型已经很准确了，借助语音识别解决手机键入效率低问题。任务可以喊话完成。
3. 一个任务往往是反复迭代的过程，因为上下文的关系，这人任务最好持续，否则要写交接文档。但是，真实的情况是，在解决一个问题的过程中，或者调试过程中，会有新的想法、思路、需求，我称之为闪念，怎么办？语音记录闪念目的是解决这个问题。因为闪念是与当前任务的平行事件，这个闪念可以暂时不必理会。闪念可以随时送回AI处理。这个效率非常高。
4. 因为需要管理很多服务器，所以有个服务器管理入口，项目是服务器的一个工作目录，AI都在这个目录下工作，闪念也与当前服务器的工作目录关联，这样在任务回送的时候会找到算力和迭代项目。
5. 如何登陆服务器？不同类型的终端和入口，比如web/APP/小程序，没有统一的原生shell与服务器交互，所以需要一个gateway。目前gateway接txt和voice，分别路由。不同的应用类型，APP/小程序/WEB只要写前端，统一一套gateway规范即可。
6. 必须好用便捷，shell和用户界面使用两套主题。shell等所有元素使用主题配色。
7. 可扩展插件，这个目前占位，没有实现。思路来自重度使用obsidian，良好的plugin体验，可以方便的扩展前端能力。但这波openclaw热，觉得不能做前端插件，应该做个skills插件，做热插拔skills插件。
8. shell比较难搞，web端直接使用xterm。小程序端没有现成的，在textarea基础上做了一个shell，很难搞，一堆效率难用问题，不过目前效果很好，与codex交互还是比较丝滑，与PC端使用codex CLI体验基本拉齐。

---

基于 `PLAN.md` 技术栈的多包工程：

- `apps/web`：Vue3 + TypeScript + xterm.js（含 fit/webgl/search/unicode11）
- `apps/gateway`：Node.js 网关（WSS -> SSH）
- `packages/shared`：共享模型、状态机、Codex 编排、主题与安全工具
- `packages/plugin-runtime`：插件系统运行时（校验/权限/生命周期/熔断）
- `ios/plugin/RemoteConnSSHPlugin`：iOS Capacitor 原生插件骨架

## 已实现能力（对齐 PLAN 核心链路）

1. 服务器管理与凭据管理（Web IndexedDB + AES-GCM 受限存储）
2. 终端会话状态机（connecting/auth_pending/connected/reconnecting/disconnected/error）
3. 网关双向转发（init/stdin/stdout/stderr/resize/control）
4. Codex 模式编排（`cd` -> `command -v codex` -> `codex --sandbox`）
5. 会话日志记录与脱敏导出
6. 主题系统与对比度优化
7. 插件系统（manifest 校验、权限白名单、onload/onunload、命令注册、隔离与熔断）

## 近期更新（v3.0.1，2026-03-20）

- 2026-03-20 `v3.0.1` 使用手册与主题口径同步：
  - 小程序“使用手册”补成图文版，正文前置“为什么需要这个APP？”，并接入 `guide-mobile-*` 配图；
  - 小程序主题预设补齐到与 Web 一致的 `21` 套，主题名称支持随语言切换，并尽量收口为单词短名；
  - Root README、Changelog、Release、小程序 README、项目介绍、相关方案文档与品牌模板统一升级到 `v3.0.1`；
  - 当前版本不引入新的同步协议、终端协议或配置字段，继续沿用 `v3.0.0` 已明确的能力边界。

- 2026-03-18 `v3.0.0` 终端交互稳定性与文档口径同步：
  - 小程序终端在codex交互过程中的性能优化，继续优化卡顿不响应问题。
  - 小程序终端新增 caret 稳定窗口，收敛高频 `stdout` 期间底部光标在后几行行尾来回跳的问题；
  - shell 激活区在软键盘仍可见时会保护被动 `blur`，避免豆包输入法长按语音输入过程中被页面侧提前打断；
  - 当前仍保留一部分性能遗留问题，终端 perf 日志默认改为通过开关关闭，调试时再临时打开；
  - Root README、Changelog、Release、小程序 README、关于页、多语言文案、小程序工程描述与当前基线文档统一升级到 `v3.0.0`。

- 2026-03-13 `v2.9.6` 文档与对外版本口径同步：
  - Root README、Changelog、Release、小程序 README、关于页、多语言文案、项目描述、小程序工程描述与当前基线文档统一升级到 `v2.9.6`；
  - 当前版本不引入新的功能、协议行为或交互变更，继续沿用 `v2.9.5` 已完成的现有终端、同步、时延诊断与语音播报边界口径。

- 2026-03-13 `v2.9.5` 文档与遗留问题口径同步：
  - Root README、Changelog、Release、小程序 README、关于页、多语言文案、项目描述、小程序工程描述与当前基线文档统一升级到 `v2.9.5`；
  - 新登记小程序终端语音播报遗留问题：当前播报文本提取与轮次稳定判定仍不够准确，长时间 `Codex` 交互时还会放大小程序客户端响应压力，现阶段暂不建议默认使用。

- 2026-03-12 `v2.9.4` 文档与版本口径同步：
  - Root README、Changelog、Release、小程序 README、关于页、多语言文案、项目描述、问题闭环记录与当前基线文档统一升级到 `v2.9.4`；
  - 当前版本不引入额外功能变更，继续沿用 `v2.9.3` 已完成的时延诊断面板与主题对比度收口结果。

- 2026-03-11 `v2.9.3` 小程序时延诊断面板与主题对比度收口：
  - 网关响应与网络时延两张折线图合并为一张双轴平滑曲线图，左轴保留网关响应量纲，右轴保留网络时延量纲；
  - 原“诊断信息”文字卡已移除，顶部改为两张两行摘要卡；同一服务器断开重连后会优先延续已有采样，尽量补足最近 30 个点；
  - 时延面板配色改为跟随终端主题的反相面板，深色终端额外切换一套更深的蓝橙曲线与指标色，保证浅底上的文字和曲线可读性；
  - Root README、Changelog、Release、小程序 README、关于页、问题闭环记录与当前基线文档统一升级到 `v2.9.3`。

- 2026-03-11 `v2.9.1` 小程序续接恢复、同步刷新与隐私说明同步：
  - 小程序终端会话续接首次恢复改为以 `lines + bufferCols / bufferRows` 为准，避免返回服务器列表再进入时出现历史区顶部空白与裸露 `5;2H`；
  - 启动阶段 `bootstrap` 合并配置完成后，首页服务器列表与底栏会自动刷新，不再需要重新进入页面才能看到同步后的配置；
  - 小程序用户隐私政策与 about 隐私页已按最新审核口径同步，补齐录音用途、处理范围与用户权利说明；
  - Root README、Changelog、Release、小程序 README、关于页、问题闭环记录与当前基线文档统一升级到 `v2.9.1`。

- 2026-03-11 `v2.9.0` 小程序 Codex 交互区缺行与闪动修复：
  - 小程序终端已修复 `Codex` 持续输出期间底部提示块缺行、状态行被裁掉与区域反复闪动的问题；
  - normal buffer viewport 现在会保留光标行之后仍真实存在的 footer，`CSI ? 2026 h/l` 同步刷新窗口也已做兼容收口；
  - 统一高亮背景行改为优先在 line 层绘制，`> Use /skills to list available skills` 与代码块这类高亮区域不再透出行间底色细线；
  - 新增真实 PTY 抓包回放与对应回归测试，锁住这类交互问题；
  - Root README、Changelog、Release、小程序 README、关于页、问题闭环记录与当前基线文档统一升级到 `v2.9.0`。

- 2026-03-10 `v2.8.2` 连接态强调与 about 页面主题统一：
  - 小程序服务器列表里的 `connect` 按钮，以及底栏里的 `shell` 按钮，在存在活动连接时统一改为高饱和实底高亮，不再依赖描边反馈；
  - 连接态 SVG 前景色改为运行时跟随界面前景色，避免落在高亮底色上后继续发灰；
  - about 首页、详情页与 about-app 改为统一跟随界面配置出色，不再单独维护一套固定浅色主题；Web about 页同步采用同一套主题变量策略；
  - Root README、Changelog、Release、小程序 README、关于页、项目描述与当前基线文档统一升级到 `v2.8.2`。

- 2026-03-10 `v2.8.1` 终端语音区与发布口径收口：
  - 小程序终端语音区展开按钮默认改为全透明，仅保留 SVG 本体颜色；
  - 分类胶囊改为贴文字高度，选中态背景切到更明显的实色；
  - 录音中的输入框上方新增更显眼的双环脉冲提示，文案更新为“正在收音，松开后发送或记录闪念”；
  - `OSC 10 / 11 / 12` 颜色查询已返回真实 shell 主题色，擦除空白位与备用屏空白屏统一继承当前擦除背景；
  - 此前点击 Codex 连接选项后的首回显迟滞与等待期间按钮阻塞问题已收敛，不再列为当前遗留问题；
  - 新登记一个低频连接时序遗留问题：偶发新连接后首屏只显示光标、提示符稍后才出现；
  - Root README、Changelog、Release、小程序 README、关于页与当前基线文档统一升级到 `v2.8.1`。

- 2026-03-10 `v2.7.1` 文档与版本口径收口：
  - 明确当前跨设备同步仍只覆盖 `settings / servers / records`，其中服务器敏感字段以加密后的 `secret_blob` 保存；
  - `logs`、插件运行时日志与终端会话缓冲继续保留在本地，不纳入第一阶段同步；
  - 补充 `remoteconn-sync.db-wal` 属于 SQLite WAL 写前日志说明，其文件体积不直接等于当前有效同步数据量；
  - 当前小程序终端仍存在明显交互卡顿：点击 Codex 连接选项后约 10 秒才出现回显，等待期间除上下滑动外其余按钮基本阻塞，先作为当前遗留问题登记；
  - 根 README、小程序 README、Changelog、Release、同步方案文档与关于页版本展示统一更新到 `v2.7.1`。

- 2026-03-13 小程序终端语音播报遗留问题登记：
  - 当前播报文本提取与轮次稳定判定仍不够准确，播报内容存在偏差；
  - 长时间 `Codex` 交互时，语音播报链路会额外放大小程序客户端响应压力；
  - 现阶段暂不建议默认使用，先列为待优化遗留问题，后续继续收口文本提取、触发时机与性能隔离。

- 2026-03-19 小程序终端 AI 交互期输入跳跃问题登记：
  - 在 `Codex` 等 AI 持续输出期间，点击 shell 激活区弹出软键盘后，输入态仍可能出现输入框/激活区跳跃，导致无法稳定连续输入；
  - 当前仅确认问题与 AI 持续输出期间的终端刷新链路有关，尚未完成稳定修复；
  - 先按已知遗留问题登记，后续继续抓取输入聚焦、键盘高度变化、viewport 滚动与 stdout 刷新之间的时序关系。

- 2026-03-09 小程序配置跨设备同步第一阶段落地：
  - `settings / servers / records` 改为“本地 storage + Gateway + SQLite”双层持久化；
  - 启动时通过 `bootstrap` 拉取并合并远端数据，日常修改按对象异步推送；
  - 服务器和闪念删除支持 `tombstone` 合并，新设备可恢复同账号下的设置、服务器配置与闪念记录；
  - SSH 密码、私钥、口令与证书等受保护字段不以明文保存，服务端改为加密后的 `secret_blob` 存储。

- 2026-03-09 同步边界与验证口径同步明确：
  - 终端会话缓冲仍保留本地，不纳入第一阶段同步；
  - 通过 `npm run mini` 生成的 preview 预览二维码，不作为正式版跨设备同步与本地缓存连续性的验证依据。

- 2026-03-08 小程序终端继续推进 VT 最小可用能力：
  - 双缓冲与备用屏幕切换已进入当前基线，`47 / 1047 / 1048 / 1049`、`DSR / CPR / DA1 / DA2 / DECSTR`、基础局部重绘与输入编码已落地；
  - normal buffer 的 live tail 与最大滚动值改为同源，历史回到底部后不再继续把当前命令行往上推；
  - 当前 P0 主链路已基本打通，保留为 `v2.7.0` 基线继续迭代 parser 完整度、P1 边界精修与高级交互能力。

- 2026-03-08 小程序终端字号问题按“遗留问题”暂存：
  - 当前“修改字号后偶发吃字/显示不完整”仍未彻底解决，暂不继续扩大修改范围；
  - 设置页在“字号”下新增提示“修改字号后建议断开重连”，作为当前版本的临时规避方案；
  - 终端排查期间新增的 `terminal.wrap` 调试输出已移除，保留当前较稳定实现作为 `v2.6.5` 基线。

- 2026-03-07 小程序终端完成一轮底层重构：
  - 连接前先按真实终端几何计算 `cols/rows`，不再固定 `80x24`；
  - 输出缓冲区、光标推进、换行判断统一按 xterm 风格的 cell 模型执行；
  - 中文宽字符 continuation 不再丢失到自然文本流，改为固定列宽渲染；
  - 可见光标改为终端自绘，原生 `input` 仅保留键盘代理职责；
  - 英文右侧 padding、中文输入尾部空白增长、第二行回跳第一行等问题已收敛。
- 2026-03-07 小程序连接链路补齐后台续接：
  - 终端页返回其他页面后，会话默认继续保活 `15` 分钟，支持在设置页改为 `1~60` 分钟；
  - 返回服务器列表后再次进入，会优先复用原会话并恢复终端尾部缓冲，避免只有光标没有 prompt；
  - 服务器列表中的“连接”按钮在连接态保持亮色，并增加外圈描边，减少状态误判。
- 2026-03-07 Web 与小程序补齐 SSH 跳转主机链路：
  - 服务器配置页新增“跳转主机”配置，支持主机、端口、用户名、认证方式与独立凭据；
  - 网关支持“第一跳 SSH + 第二跳 SSH（经 direct-tcpip 转发）”链路；
  - 基础信息服务器与跳转主机的主机指纹改为分别上报与校验。
- 2026-03-07 小程序补齐 AI 快速启动链路：
  - 服务器列表 `AI` 按钮可直接进入终端，并自动打开 AI 启动面板；
  - 终端页支持先确保会话连接，再执行 Codex 预检与启动；
  - 项目目录不存在、服务器未安装 `codex` 等失败场景改为统一前置提示，不再依赖用户手动排查。
- 小程序版本完成较大能力对齐：
  - 补齐 `connect / server settings / terminal / logs / records / settings / plugins` 主页面链路；
  - 闪念支持分类、搜索、过滤、编辑、快速改分类与导出；
  - 语音输入支持分类写入、未连接可记录闪念、写入 `服务器名称-项目名` 上下文快照；
  - `记录 -> 闪念分类` 管理支持新增、设默认、删除、按住拖动排序；
  - 服务器配置支持自定义标签，服务器卡片底部展示项目标签与自定义标签。
- Web 端继续做小幅精修：
  - 配置页控件密度、卡片层级和记录页交互细节继续收敛；
  - 闪念卡片滑动操作、快速改分类弹层、编辑弹框与分类视觉语义完成多轮细调；
  - 终端输入、语音与记录联动补齐边界行为。
- 文档基线统一升级到 `v2.6.0`：
  - 根 README、发布说明、小程序 README、对齐审计、配置实现方案、闪念实现基线和 parity 机读清单统一更新；
  - 新增 SSH 跳转链路加密分层图，作为跳板机能力说明；
  - 原 `v2.4.0` 说明已并入当前 `v2.6.0`，统一作为当前“Web + 小程序”共同对外口径。

## 快速启动

```bash
npm install
npm run dev:gateway
npm run dev:web
```

默认地址：

- Web: `http://localhost:5173`
- Gateway: `http://localhost:8787`
- Gateway WS: `ws://localhost:8787/ws/terminal`

## 环境变量

### Gateway

复制 `apps/gateway/.env.example`：

```bash
cp apps/gateway/.env.example apps/gateway/.env
```

### Web

复制 `apps/web/.env.example`：

```bash
cp apps/web/.env.example apps/web/.env
```

### 生产环境建议配置

> 注意：前端 `VITE_*` 是构建时注入；`apps/web/.env` 需要在构建前准备好。

`apps/gateway/.env`（网关进程运行时读取）：

```dotenv
PORT=8787
HOST=0.0.0.0
GATEWAY_TOKEN=replace-with-strong-random-token
CORS_ORIGIN=https://your-domain.com
DEBUG_IO_HEX=0
ASR_INCLUDE_RAW_RESULT=0
ASR_EMPTY_TEXT_WARN_LIMIT=3
```

`apps/web/.env`（Web 构建时读取）：

```dotenv
VITE_GATEWAY_URL=wss://your-domain.com
VITE_GATEWAY_TOKEN=replace-with-strong-random-token
VITE_ENABLE_PLUGIN_RUNTIME=false
```

说明：

- `VITE_GATEWAY_TOKEN` 必须与 `GATEWAY_TOKEN` 一致。
- `VITE_ENABLE_PLUGIN_RUNTIME=false` 可在生产中先关闭插件能力。
- 若使用反向代理（Nginx/Caddy）对外提供 `443/80`，网关内部仍可监听 `8787`。

## 质量命令

```bash
npm run typecheck
npm run lint
npm run test
```

## 非 Docker 运维（简化网关维护）

统一脚本：`scripts/gatewayctl.sh`

```bash
# 1) 首次部署（Linux + systemd / macOS + launchd）
scripts/gatewayctl.sh ensure-env
scripts/gatewayctl.sh install-service $USER
scripts/gatewayctl.sh deploy

# 2) 日常运维
scripts/gatewayctl.sh status
scripts/gatewayctl.sh logs 200
scripts/gatewayctl.sh logs-clear
scripts/gatewayctl.sh restart
scripts/gatewayctl.sh health

# 3) 本地前台运行（不依赖 systemd）
scripts/gatewayctl.sh run-local
```

说明：

- Linux 上脚本自动使用 `systemd`。
- macOS 上脚本自动使用 `launchd`（`~/Library/LaunchAgents/com.remoteconn.gateway.plist`）。

## 日志

```shell
gavin mini remoteconn %   launchctl print gui/$(id -u)/com.remoteconn.gateway | rg -n "stdout path|stderr path"
stdout path = /Users/gavin/Library/Logs/com.remoteconn.gateway.out.log
stderr path = /Users/gavin/Library/Logs/com.remoteconn.gateway.err.log
gavin mini remoteconn % tail -f /Users/gavin/Library/Logs/com.remoteconn.gateway.out.log
```

## 性能基线压测（Gateway SSH2）

```bash
# 默认使用 localhost:22 + ~/.ssh/id_ed25519，并自动启动临时 gateway
npm --workspace @remoteconn/gateway run bench

# 可选参数（示例）
BENCH_SSH_HOST=127.0.0.1 \
BENCH_SSH_PORT=22 \
BENCH_SSH_USER="$USER" \
BENCH_PRIVATE_KEY=~/.ssh/id_ed25519 \
BENCH_ITERATIONS=30 \
BENCH_PAYLOAD_KB=1024 \
npm --workspace @remoteconn/gateway run bench
```

## 性能基线压测（TTYD）

```bash
# 先确保系统已安装 ttyd
ttyd -v

# 使用 ttyd -> ssh 的链路进行压测
BENCH_SSH_HOST=127.0.0.1 \
BENCH_SSH_PORT=22 \
BENCH_SSH_USER="$USER" \
BENCH_SSH_IDENTITY=~/.ssh/id_ed25519 \
BENCH_ITERATIONS=30 \
BENCH_PAYLOAD_KB=1024 \
npm --workspace @remoteconn/gateway run bench:ttyd
```

## 相关文档

- 当日服务器管理交互迭代：`docs/server-management-ux-iteration-2026-02-25.md`
- 当日语音输入迭代：`docs/terminal-voice-input-plan-2026-02-26.md`
- 存储分层规范：`docs/web-storage-layering-guideline-2026-02-25.md`
- 触摸焦点状态机：`docs/touch-focus-state-machine-plan-2026-02-23.md`
- 变更日志：`CHANGELOG.md`
- 发布说明：`release.md`
