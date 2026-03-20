# 迭代日志

## 2026-02-27（v2.0.0 文档与交互定稿）

### 目标
- 将版本文档统一到 `v2.0.0`，补齐发布说明与 README 最新能力摘要。
- 完成语音输入区 `Frame 2256` 的 Figma 定稿对齐，消除多轮迭代残留。
- 收敛闪念与日志页的分页、图标、底栏入口等跨页面一致性问题。

### 完成项
1. 文档统一
- `README.md` 最新版本入口更新为 `v2.0.0`，同步能力清单。
- `release.md` 新增 `v2.0.0` 正式发布节，保留历史版本记录。
- `question-solved.md` 持续同步问题与修复记录（缓存策略、语音层交互等）。

2. 语音区交互定稿
- `Frame 2256` 按整块容器实现背景层（非局部小块背景）。
- 背景规则：圆角 `16px`，常态 `40%`，按住 voice 录音态 `100%`。
- `voice + record + send` 与 `clear/cancel` 关系按 Figma 几何约束收敛，重叠层级在输入框之下。

3. 页面体验收敛
- `Records` 页面配色统一走主题变量，入口图标统一 `recordmanager.svg`。
- `Logs` 页面改为 `15` 条/页分页并显示总数。
- 底部工具条 `config.svg` 统一排在最后。

### 同步文档
- `README.md`
- `release.md`
- `log.md`
- `docs/terminal-voice-records-plan-2026-02-27.md`
- `question-solved.md`

### 验证结果
- 已执行并通过：`npm run test` / `npm run typecheck` / `npm run lint` / `npm run build`。

## 2026-02-26（语音输入全链路）

### 目标
- 在 Terminal 页落地“按住说话”的语音输入能力，并通过 Gateway 安全代理接入 ASR。
- 收敛移动端输入与缩放稳定性问题，减少 iPhone 端误触与焦点竞争。
- 为线上发布补齐语音配置项、测试与可观测性。

### 完成项
1. Web 侧语音输入
- 新增 `TerminalVoiceInput.vue`：按住录音、松手停止、面板保留、`sent` 才提交。
- 支持 `clear-input`、`cancel`、`sent` 三按钮操作流。
- 语音按钮支持拖拽与边界约束，页面 `blur/visibilitychange` 下自动收尾，避免“松手后仍录音”。
- 发送统一走 `assist` 通道并自动追加回车。

2. Gateway 侧语音代理
- 新增 `/ws/asr` 升级路由与连接处理。
- 新增客户端协议解析：`start/audio/stop/cancel/ping`。
- 新增火山协议封装与解析（full request / audio-only / server response / error）。
- 新增上游文本提取与 JSON 回退解析（标准 JSON、NDJSON、粘包 JSON）。

3. 生产与稳定性
- 网关终端链路和语音上游链路默认禁用 `permessage-deflate`。
- 新增 `ASR_INCLUDE_RAW_RESULT` 与 `ASR_EMPTY_TEXT_WARN_LIMIT`，降低下行与日志噪音。
- 新增动态导入失败自动恢复（15 秒窗内最多一次自动刷新）。
- 全局缩放防护补齐双击路径（double-tap/dblclick）。

4. 测试覆盖
- 新增语音模块测试：`asrText`、`clientProtocol`、`upstreamPayload`、`volcAsrProtocol`。
- 新增 `dynamicImportGuard` 单测。

### 同步文档
- `README.md`
- `release.md`
- `todo.md`
- `docs/terminal-voice-input-plan-2026-02-26.md`
- `question-solved.md`

### 验证结果
- 待执行：`npm run test` / `npm run typecheck` / `npm run lint` / `npm run build` / deploy。

## 2026-03-18（Codex 近期输入内容提炼：Skills / OpenClaw / RemoteConn）

### 目标
- 把最近一轮围绕 `skills`、`OpenClaw`、小程序插件能力与 Gateway 侧运行时的输入内容沉淀到日志中。
- 将讨论重点从“前端插件”与“后端 skills 插件”分层，便于后续继续收口方案与实现边界。
- 为后续文档与设计演进保留一份面向产品和架构判断的输入摘要。

### 近期 30 条输入内容提炼
1. 检查插件实现文档，重点核对与 `OpenClaw skills` 对接的思路。
2. 澄清当前前端插件路线继续保留，但主方向转向后端 skills 对接。
3. 明确“兼容 OpenClaw skills”的含义是：OpenClaw 中现成的 skills 包可以直接拿来用。
4. 要求这种 skills 包可以作为插件插入 RemoteConn，尽量直接使用，不走重写格式。
5. 明确希望 skills 支持热加载。
6. 追问微信小程序是否支持 UI 的插件式运行时热加载。
7. 进一步判断小程序版本做 Obsidian 类型前端插件是否有意义。
8. 明确小程序侧更适合承担 skills 的呈现、使用与配置管理，而不是插件执行平台。
9. 让助手查看本地 `~/terminal-lab/openclaw/` 代码，确认 OpenClaw 是否确实走这条逻辑。
10. 认可 OpenClaw 的思路：skill 热加载，但脚本在使用时再加载，以保持 Gateway 轻量。
11. 追问“skill 送给 Codex 执行”时，Codex 具体如何落实。
12. 关心 OpenClaw 是否提供了明确的使用指引，还是主要依赖 AI 自由发挥。
13. 比较“直接把 skill 文件扔给 Codex”和“通过 OpenClaw 提供给 Codex”的差异。
14. 追问 OpenClaw 是否是通过大模型来选择 skills。
15. 担心 OpenClaw 的这种模式在候选 skill 较多时是否会变得模糊。
16. 进一步确认 OpenClaw 在完成一个任务需要多个 skill 时是如何覆盖的。
17. 设想 RemoteConn 若由客户端先明确派发任务，也就是先定向选定某个 skill。
18. 追问在这种定向派发模式下，多 skill 场景如何覆盖。
19. 举例说明：如果任务要组合 `a b c d` 四个 skills，`a` 是派发给 AI 的 primary skill。
20. 追问在上述场景中，后面的 `b c d` 应该如何被调用或扩展。
21. 提出是否应该在 `a` 的 `SKILL.md` 中写清楚会调用哪些 skills。
22. 进一步追问这种多 skill 协作是否需要一套明确约定和规范。
23. 对比自己的方案和 OpenClaw 默认模式，询问差异、优点和代价。
24. 继续比较 skill 的制作复杂度，关心哪种模式更重、哪种更易规模化维护。
25. 评估当前设计下，RemoteConn skills 的通用性和开放性如何。
26. 关注 `role / companionPolicy / stages / 受控 skill 池` 这些概念是否可以简化。
27. 追问“受控 skill 池”的语义到底是什么。
28. 进一步区分“受控 skill 池”和 `allowedSkills` 的差异。
29. 最终收敛出“是否只保留 `allowedSkills` 即可”的方向判断。
30. 明确 `allowedSkills` 负责边界，具体编排应放在 `SKILL.md` 正文中完成，并要求同步到文档与日志。

### 当前结论倾向
1. Web 前端插件可继续保留，但小程序不应作为 Obsidian 类型插件执行平台的重点。
2. 主方向应是 Gateway 侧的 skills 插件运行时，小程序与 Web 主要承担控制台与消费端职责。
3. 兼容 OpenClaw 时应尽量保留 `SKILL.md + metadata.openclaw` 的基础结构。
4. RemoteConn 增强语义应尽量收敛，当前最小宿主扩展字段倾向只保留 `metadata.remoteconn.allowedSkills`。
5. `allowedSkills` 负责“允许用谁”，`SKILL.md` 正文负责“何时怎么用”。
6. 对高频固定组合任务，更适合沉淀成新的上层编排 skill，而不是持续依赖运行时动态拼接。

### 同步文档
- `docs/backend-openclaw-skills-plugin-plan-2026-03-18.md`
- `docs/project-local-skills-routing-plan-2026-03-14.md`
- `docs/plugin-openclaw-skills-comparison-reference-2026-03-10.md`
- `log.md`

### 验证结果
- 本次为日志补充，未执行 `npm run test` / `npm run typecheck` / `npm run lint` / `npm run build`。

## 2026-03-18（Codex 近期输入原样记录：当前会话可见范围）

### 说明
- 本节按当前会话上下文可见内容原样记录用户输入。
- 当前可准确提取的用户输入共 `49` 条，不足 `100` 条；未见部分不做推断、不补写。

### 原样记录
1.
```text
检查插件实现的文档
```

2.
```text
检查插件实现的文档，关于openclaw skills对接的思路
```

3.
```text
补充：现在的插件主要是针对前端的，参考的obisian，这个路线不动，不是以后的方向。我想做的是后端对接skills，含脚本的那种
```

4.
```text
先整理方案
```

5.
```text
兼容 OpenClaw skills -- 意思是openclaw中的skills包，我可以拿过来作为插件直接使用
```

6.
```text
兼容 OpenClaw skills -- 意思是openclaw中的skills包，我可以拿过来作为插件插进来直接使用
```

7.
```text
兼容 OpenClaw skills -- 意思是openclaw中的skills包，我可以拿过来作为插件插进来直接使用，skills可以热加载
```

8.
```text
更新到docs中
```

9.
```text
微信小程序支持ui的插件式运行时热加载吗？
```

10.
```text
所以，小程序版本做obsidian类型的插件没有意义
```

11.
```text
skills插件可以，因为可以在网关侧做，ui上只是呈现和配置管理
```

12.
```text
skills插件可以，因为可以在网关侧做，ui上只是呈现、使用和配置管理
```

13.
```text
~/terminal-lab/openclaw/ 查看openclaw代码，是否这个逻辑
```

14.
```text
openclaw的思路很好，skill热加载，但scripts使用时加载，这样网关侧会比较轻量
```

15.
```text
更新文档
```

16.
```text
skill送给codex执行式，codex如何落实？openclaw有提供使用指引吗？还是让ai自由发挥？
```

17.
```text
skill送给codex执行式，codex如何落实？openclaw有提供使用指引吗？还是让ai自由发挥？换句话说，我把skill相关文件直接扔给codex和通过openclaw提供给codex有区别吗？后者会做的更好吗？
```

18.
```text
所以准确的讲，openclaw根据任务先做skills的选型，选型完成后就是ai的事情了
```

19.
```text
openclaw的这种做法，是不是比较模糊，比如用户的任务，候选出多个skills，ai都需要取落实吗？
```

20.
```text
openclaw是通过大模型来选择skills吗？
```

21.
```text
remoteconn如先按客户端明确派发任务的方式工作，也就是说选定路由后，派发特定的skill给ai。如果这样，完成一项任务需要多个skill的场景如何覆盖？
```

22.
```text
完成一项任务需要多个skill的场景如何覆盖，openclaw怎么做？
```

23.
```text
完成一项任务需要多个skill的场景，openclaw怎么做？
```

24.
```text
remoteconn如先按客户端明确派发任务的方式工作，也就是说选定路由后，派发特定的skill给ai。如果这样，完成一项任务需要多个skill的场景如何覆盖？比如一个任务需要用到4个skill组合a b c d，a是派发给ai的primary skill，如何调用后面的skills？
```

25.
```text
所以在a的skill.md中写清楚调用的skills？这个需要约定规范吗？
```

26.
```text
这个主题比较重要，更新文档
```

27.
```text
这个主题比较重要，更新文档，改文档不需要变异
```

28.
```text
这个主题比较重要，更新文档，改文档不需要编译
```

29.
```text
我这个思路和openclaw有什么区别？优点是什么？
```

30.
```text
把我的优点和代价更新到文档
```

31.
```text
制作skill的复杂度哪个更高？
```

32.
```text
补充文档
```

33.
```text
按现在的设计，skill的通用性和开放性如何？
```

34.
```text
- primary / companion / standalone
  - companions
  - companionPolicy
  - stages
  - 宿主定向路由
  - 受控 skill 池 --- 这个可以简化吗？
```

35.
```text
- primary / companion / standalone
  - companions
  - companionPolicy
  - stages
  - 宿主定向路由
  - 受控 skill 池 --- 这个可以简化又达到目的吗？
```

36.
```text
受控 skill 池 语意是什么？
```

37.
```text
受控 skill 池 和allowedSkills有什么区别？
```

38.
```text
也就是实际保留allowedSkills即可？
```

39.
```text
更新文档
```

40.
```text
我再审核一遍，role / companionPolicy / stages / 受控skill池 的语义是什么？
```

41.
```text
allowedSkills 是引入的skills，编排在skill.md中完成？
```

42.
```text
allowedSkills 是引入的skills，编排在skill.md正文完成？
```

43.
```text
ok，现在比较明确了，有必要更新文档
```

44.
```text
remoteconn的skill能供给给openclaw 使用吗？
```

45.
```text
好
```

46.
```text
提炼我输入最近30个问题到log.md中
```

47.
```text
我最近codex交互中输入30内容，log.md中
```

48.
```text
我最近codex交互中输入30条内容，log.md中
```

49.
```text
我最近codex交互中输入100条内容，原样记录，log.md中
```

### 验证结果
- 本次为日志补充，未执行 `npm run test` / `npm run typecheck` / `npm run lint` / `npm run build`。
