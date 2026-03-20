# OpenClaw Integration

将 self-improvement skill 集成到 OpenClaw 的完整 setup 与使用指南。

## Overview

OpenClaw 使用基于 workspace 的 prompt injection，并结合 event-driven hooks。上下文会在 session 启动时从 workspace files 注入，hooks 则会在生命周期事件上触发。

## Workspace Structure

```
~/.openclaw/
├── workspace/                   # 工作目录
│   ├── AGENTS.md               # 多代理协作模式
│   ├── SOUL.md                 # 行为指导与个性
│   ├── TOOLS.md                # 工具能力与 gotchas
│   ├── MEMORY.md               # 长期 memory（仅主 session）
│   └── memory/                 # 每日 memory 文件
│       └── YYYY-MM-DD.md
├── skills/                      # 已安装 skills
│   └── <skill-name>/
│       └── SKILL.md
└── hooks/                       # 自定义 hooks
    └── <hook-name>/
        ├── HOOK.md
        └── handler.ts
```

## Quick Setup

### 1. Install the Skill

```bash
clawdhub install self-improving-agent
```

或手动复制：

```bash
cp -r self-improving-agent ~/.openclaw/skills/
```

### 2. Install the Hook（可选）

将 hook 复制到 OpenClaw 的 hooks 目录：

```bash
cp -r hooks/openclaw ~/.openclaw/hooks/self-improvement
```

启用 hook：

```bash
openclaw hooks enable self-improvement
```

### 3. Create Learning Files

在 workspace 中创建 `.learnings/` 目录：

```bash
mkdir -p ~/.openclaw/workspace/.learnings
```

或者在 skill 目录中创建：

```bash
mkdir -p ~/.openclaw/skills/self-improving-agent/.learnings
```

## Injected Prompt Files

### AGENTS.md

用途：多代理 workflows 与 delegation patterns。

```markdown
# Agent Coordination

## Delegation Rules
- 对开放式 codebase 问题使用 explore agent
- 对长时间任务启动 sub-agents
- 使用 sessions_send 做跨 session 通信

## Session Handoff
在委派给另一个 session 时：
1. 在 handoff message 中提供完整上下文
2. 包含相关文件路径
3. 指定期望的输出格式
```

### SOUL.md

用途：行为指导与沟通风格。

```markdown
# Behavioral Guidelines

## Communication Style
- 保持直接和简洁
- 避免不必要的 caveats 和 disclaimers
- 使用符合上下文的技术语言

## Error Handling
- 及时承认错误
- 立即给出更正后的信息
- 将重要 errors 记录到 learnings
```

### TOOLS.md

用途：工具能力、integration gotchas、本地配置。

```markdown
# Tool Knowledge

## Self-Improvement Skill
将 learnings 记录到 `.learnings/`，以支持持续改进。

## Local Tools
- 在这里记录 tool-specific gotchas
- 记录 authentication requirements
- 跟踪 integration quirks
```

## Learning Workflow

### Capturing Learnings

1. **In-session**：像平时一样记录到 `.learnings/`
2. **Cross-session**：提升到 workspace files

### Promotion Decision Tree

```
Is the learning project-specific?
├── Yes → Keep in .learnings/
└── No → Is it behavioral/style-related?
    ├── Yes → Promote to SOUL.md
    └── No → Is it tool-related?
        ├── Yes → Promote to TOOLS.md
        └── No → Promote to AGENTS.md (workflow)
```

### Promotion Format Examples

**From learning：**
> 在未配置 auth 的情况下执行 Git push 到 GitHub 会失败，并触发 desktop prompt

**To TOOLS.md：**
```markdown
## Git
- 在确认 auth 已配置前不要执行 push
- 使用 `gh auth status` 检查 GitHub CLI auth
```

## Inter-Agent Communication

OpenClaw 提供这些工具用于跨 session 通信：

### sessions_list

查看活跃和最近的 sessions：
```
sessions_list(activeMinutes=30, messageLimit=3)
```

### sessions_history

读取另一个 session 的 transcript：
```
sessions_history(sessionKey="session-id", limit=50)
```

### sessions_send

向另一个 session 发送消息：
```
sessions_send(sessionKey="session-id", message="Learning: API requires X-Custom-Header")
```

### sessions_spawn

启动一个后台 sub-agent：
```
sessions_spawn(task="Research X and report back", label="research")
```

## Available Hook Events

| Event | When It Fires |
|-------|---------------|
| `agent:bootstrap` | 在 workspace files 注入前触发 |
| `command:new` | 执行 `/new` command 时触发 |
| `command:reset` | 执行 `/reset` command 时触发 |
| `command:stop` | 执行 `/stop` command 时触发 |
| `gateway:startup` | gateway 启动时触发 |

## Detection Triggers

### Standard Triggers
- 用户纠正（"No, that's wrong..."）
- command failures（non-zero exit codes）
- API errors
- knowledge gaps

### OpenClaw-Specific Triggers

| Trigger | Action |
|---------|--------|
| Tool call error | 记录到 TOOLS.md，并标明 tool name |
| Session handoff confusion | 记录到 AGENTS.md，并补充 delegation pattern |
| Model behavior surprise | 记录到 SOUL.md，并说明 expected vs actual |
| Skill issue | 记录到 .learnings/ 或向上游反馈 |

## Verification

检查 hook 是否已注册：

```bash
openclaw hooks list
```

检查 skill 是否已加载：

```bash
openclaw status
```

## Troubleshooting

### Hook not firing

1. 确保 hooks 已在配置中启用
2. 修改配置后重启 gateway
3. 检查 gateway logs 中是否有 errors

### Learnings not persisting

1. 确认 `.learnings/` 目录存在
2. 检查文件权限
3. 确认 workspace path 配置正确

### Skill not loading

1. 检查 skill 是否位于 skills 目录中
2. 确认 SKILL.md 的 frontmatter 正确
3. 运行 `openclaw status` 查看已加载 skills
