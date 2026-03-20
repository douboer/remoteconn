---
name: self-improvement
description: "记录 learnings、errors 和 corrections，以支持持续改进。适用于：(1) 命令或操作意外失败，(2) 用户纠正 Claude（'No, that's wrong...', 'Actually...'），(3) 用户请求当前不存在的能力，(4) 外部 API 或工具失败，(5) Claude 意识到自己的知识已过时或不正确，(6) 为重复任务发现了更好的处理方式。在开始重大任务前，也应先回顾 learnings。"
metadata:
---

# Self-Improvement Skill

将 learnings 和 errors 记录到 markdown 文件中，以支持持续改进。后续 coding agents 可以基于这些记录推进修复，而重要的学习项则可以提升为项目级 memory。

## 快速参考

| Situation | Action |
|-----------|--------|
| Command/operation fails | 记录到 `.learnings/ERRORS.md` |
| User corrects you | 以 `correction` category 记录到 `.learnings/LEARNINGS.md` |
| User wants missing feature | 记录到 `.learnings/FEATURE_REQUESTS.md` |
| API/external tool fails | 将集成细节记录到 `.learnings/ERRORS.md` |
| Knowledge was outdated | 以 `knowledge_gap` category 记录到 `.learnings/LEARNINGS.md` |
| Found better approach | 以 `best_practice` category 记录到 `.learnings/LEARNINGS.md` |
| Simplify/Harden recurring patterns | 使用 `Source: simplify-and-harden` 和稳定的 `Pattern-Key` 记录或更新 `.learnings/LEARNINGS.md` |
| Similar to existing entry | 通过 `**See Also**` 建立关联，并考虑提升优先级 |
| Broadly applicable learning | 提升到 `CLAUDE.md`、`AGENTS.md` 和/或 `.github/copilot-instructions.md` |
| Workflow improvements | 提升到 `AGENTS.md`（OpenClaw workspace） |
| Tool gotchas | 提升到 `TOOLS.md`（OpenClaw workspace） |
| Behavioral patterns | 提升到 `SOUL.md`（OpenClaw workspace） |

## OpenClaw Setup（推荐）

OpenClaw 是这个 skill 的主要运行平台。它通过基于 workspace 的 prompt injection 和自动 skill loading 工作。

### Installation

**Via ClawdHub（推荐）：**
```bash
clawdhub install self-improving-agent
```

**Manual：**
```bash
git clone https://github.com/peterskoett/self-improving-agent.git ~/.openclaw/skills/self-improving-agent
```

为 openclaw 改造自原始仓库：https://github.com/pskoett/pskoett-ai-skills - https://github.com/pskoett/pskoett-ai-skills/tree/main/skills/self-improvement

### Workspace Structure

OpenClaw 会将这些文件注入到每个 session 中：

```
~/.openclaw/workspace/
├── AGENTS.md          # 多代理工作流与委派模式
├── SOUL.md            # 行为指导、个性与原则
├── TOOLS.md           # 工具能力、集成 gotchas
├── MEMORY.md          # 长期 memory（仅主 session）
├── memory/            # 每日 memory 文件
│   └── YYYY-MM-DD.md
└── .learnings/        # 本 skill 的日志文件
    ├── LEARNINGS.md
    ├── ERRORS.md
    └── FEATURE_REQUESTS.md
```

### Create Learning Files

```bash
mkdir -p ~/.openclaw/workspace/.learnings
```

然后创建这些日志文件（或从 `assets/` 复制）：
- `LEARNINGS.md` — corrections、knowledge gaps、best practices
- `ERRORS.md` — command failures、exceptions
- `FEATURE_REQUESTS.md` — 用户请求的 capabilities

### Promotion Targets

当 learnings 被证明具有广泛适用性时，将它们提升到 workspace 文件：

| Learning Type | Promote To | Example |
|---------------|------------|---------|
| Behavioral patterns | `SOUL.md` | "Be concise, avoid disclaimers" |
| Workflow improvements | `AGENTS.md` | "Spawn sub-agents for long tasks" |
| Tool gotchas | `TOOLS.md` | "Git push needs auth configured first" |

### Inter-Session Communication

OpenClaw 提供了这些工具，用于跨 session 共享 learnings：

- **sessions_list** — 查看活跃/最近 session
- **sessions_history** — 读取另一个 session 的 transcript
- **sessions_send** — 向另一个 session 发送 learning
- **sessions_spawn** — 为后台工作启动 sub-agent

### Optional: Enable Hook

如需在 session 启动时自动提醒：

```bash
# Copy hook to OpenClaw hooks directory
cp -r hooks/openclaw ~/.openclaw/hooks/self-improvement

# Enable it
openclaw hooks enable self-improvement
```

完整细节见 `references/openclaw-integration.md`。

---

## Generic Setup（其他 agents）

对于 Claude Code、Codex、Copilot 或其他 agents，在你的项目中创建 `.learnings/`：

```bash
mkdir -p .learnings
```

从 `assets/` 复制模板，或自行创建带标题的文件。

### 在 agent 文件 AGENTS.md、CLAUDE.md 或 .github/copilot-instructions.md 中加入提示，提醒自己记录 learnings。（这是 hook-based reminders 的替代方案）

#### Self-Improvement Workflow

当出现 errors 或 corrections 时：
1. 记录到 `.learnings/ERRORS.md`、`LEARNINGS.md` 或 `FEATURE_REQUESTS.md`
2. 回顾并将具有广泛适用性的 learnings 提升到：
   - `CLAUDE.md` - 项目事实和约定
   - `AGENTS.md` - workflow 和 automation
   - `.github/copilot-instructions.md` - Copilot 上下文

## Logging Format

### Learning Entry

追加到 `.learnings/LEARNINGS.md`：

```markdown
## [LRN-YYYYMMDD-XXX] category

**Logged**: ISO-8601 timestamp
**Priority**: low | medium | high | critical
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### Summary
用一行描述本次学到了什么

### Details
完整上下文：发生了什么、哪里错了、正确做法是什么

### Suggested Action
建议采取的具体修复或改进措施

### Metadata
- Source: conversation | error | user_feedback
- Related Files: path/to/file.ext
- Tags: tag1, tag2
- See Also: LRN-20250110-001 (if related to existing entry)
- Pattern-Key: simplify.dead_code | harden.input_validation (optional, for recurring-pattern tracking)
- Recurrence-Count: 1 (optional)
- First-Seen: 2025-01-15 (optional)
- Last-Seen: 2025-01-15 (optional)

---
```

### Error Entry

追加到 `.learnings/ERRORS.md`：

```markdown
## [ERR-YYYYMMDD-XXX] skill_or_command_name

**Logged**: ISO-8601 timestamp
**Priority**: high
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### Summary
简要说明失败了什么

### Error
```
Actual error message or output
```

### Context
- 尝试执行的 command/operation
- 使用的输入或参数
- 如有必要，补充环境细节

### Suggested Fix
如果能够识别，写明可能的解决方式

### Metadata
- Reproducible: yes | no | unknown
- Related Files: path/to/file.ext
- See Also: ERR-20250110-001 (if recurring)

---
```

### Feature Request Entry

追加到 `.learnings/FEATURE_REQUESTS.md`：

```markdown
## [FEAT-YYYYMMDD-XXX] capability_name

**Logged**: ISO-8601 timestamp
**Priority**: medium
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### Requested Capability
用户想要完成的能力

### User Context
他们为什么需要它，要解决什么问题

### Complexity Estimate
simple | medium | complex

### Suggested Implementation
可以如何实现，它可能扩展哪部分能力

### Metadata
- Frequency: first_time | recurring
- Related Features: existing_feature_name

---
```

## ID Generation

格式：`TYPE-YYYYMMDD-XXX`
- TYPE: `LRN`（learning）、`ERR`（error）、`FEAT`（feature）
- YYYYMMDD: 当前日期
- XXX: 顺序号或随机 3 个字符（例如 `001`、`A7B`）

示例：`LRN-20250115-001`、`ERR-20250115-A3F`、`FEAT-20250115-002`

## Resolving Entries

当问题被修复后，更新该 entry：

1. 将 `**Status**: pending` 改为 `**Status**: resolved`
2. 在 Metadata 后追加 resolution block：

```markdown
### Resolution
- **Resolved**: 2025-01-16T09:00:00Z
- **Commit/PR**: abc123 or #42
- **Notes**: 简要描述做了什么
```

其他 status 值：
- `in_progress` - 正在处理
- `wont_fix` - 决定不处理（在 Resolution notes 中补充原因）
- `promoted` - 已提升到 CLAUDE.md、AGENTS.md 或 .github/copilot-instructions.md

## Promoting to Project Memory

当某条 learning 具有广泛适用性（不是一次性修复）时，将它提升为永久性的项目 memory。

### When to Promote

- 该 learning 适用于多个文件/功能
- 是任何 contributor（human 或 AI）都应该知道的知识
- 能防止重复犯错
- 记录了项目特定的约定

### Promotion Targets

| Target | What Belongs There |
|--------|-------------------|
| `CLAUDE.md` | 所有 Claude 交互都应知道的项目事实、约定、gotchas |
| `AGENTS.md` | agent 专用 workflow、tool usage patterns、automation rules |
| `.github/copilot-instructions.md` | GitHub Copilot 的项目上下文与约定 |
| `SOUL.md` | 行为指导、沟通风格、原则（OpenClaw workspace） |
| `TOOLS.md` | 工具能力、usage patterns、integration gotchas（OpenClaw workspace） |

### How to Promote

1. **Distill**：将 learning 提炼成简洁的规则或事实
2. **Add**：加入目标文件的适当 section（如无则创建）
3. **Update** 原始 entry：
   - 将 `**Status**: pending` 改为 `**Status**: promoted`
   - 添加 `**Promoted**: CLAUDE.md`、`AGENTS.md` 或 `.github/copilot-instructions.md`

### Promotion Examples

**Learning**（详细版）：
> Project uses pnpm workspaces. Attempted `npm install` but failed.
> Lock file is `pnpm-lock.yaml`. Must use `pnpm install`.

**在 CLAUDE.md 中**（简洁版）：
```markdown
## Build & Dependencies
- Package manager: pnpm (not npm) - use `pnpm install`
```

**Learning**（详细版）：
> When modifying API endpoints, must regenerate TypeScript client.
> Forgetting this causes type mismatches at runtime.

**在 AGENTS.md 中**（可执行版）：
```markdown
## After API Changes
1. Regenerate client: `pnpm run generate:api`
2. Check for type errors: `pnpm tsc --noEmit`
```

## Recurring Pattern Detection

如果你记录的内容与已有 entry 类似：

1. **Search first**：`grep -r "keyword" .learnings/`
2. **Link entries**：在 Metadata 中添加 `**See Also**: ERR-20250110-001`
3. 如果问题持续复发，**Bump priority**
4. **Consider systemic fix**：重复问题往往意味着：
   - 缺少 documentation（→ 提升到 CLAUDE.md 或 .github/copilot-instructions.md）
   - 缺少 automation（→ 加到 AGENTS.md）
   - 存在 architectural problem（→ 创建 tech debt ticket）

## Simplify & Harden Feed

使用这套 workflow 吸收 `simplify-and-harden`
skill 中反复出现的模式，并将其转化为更持久的 prompt guidance。

### Ingestion Workflow

1. 从任务总结中读取 `simplify_and_harden.learning_loop.candidates`。
2. 对每个 candidate，使用 `pattern_key` 作为稳定的 dedupe key。
3. 在 `.learnings/LEARNINGS.md` 中搜索是否已存在该 key 对应的 entry：
   - `grep -n "Pattern-Key: <pattern_key>" .learnings/LEARNINGS.md`
4. 如果已存在：
   - 增加 `Recurrence-Count`
   - 更新 `Last-Seen`
   - 为相关 entries/tasks 添加 `See Also` links
5. 如果不存在：
   - 创建新的 `LRN-...` entry
   - 设置 `Source: simplify-and-harden`
   - 设置 `Pattern-Key`、`Recurrence-Count: 1` 以及 `First-Seen`/`Last-Seen`

### Promotion Rule（System Prompt Feedback）

当以下条件同时满足时，将 recurring patterns 提升到 agent context/system prompt files：

- `Recurrence-Count >= 3`
- 出现在至少 2 个不同任务中
- 发生在 30 天窗口内

Promotion targets：
- `CLAUDE.md`
- `AGENTS.md`
- `.github/copilot-instructions.md`
- 在适用时，提升到 `SOUL.md` / `TOOLS.md` 作为 OpenClaw workspace-level guidance

写入被提升的规则时，要写成简短的 prevention rules（编码前/编码中该做什么），而不是冗长的 incident write-ups。

## Periodic Review

在自然断点回顾 `.learnings/`：

### When to Review
- 开始新的重大任务前
- 完成一个 feature 后
- 进入某个已有历史 learning 的 area 时
- 活跃开发期间每周一次

### Quick Status Check
```bash
# Count pending items
grep -h "Status\*\*: pending" .learnings/*.md | wc -l

# List pending high-priority items
grep -B5 "Priority\*\*: high" .learnings/*.md | grep "^## \["

# Find learnings for a specific area
grep -l "Area\*\*: backend" .learnings/*.md
```

### Review Actions
- 解决已修复的 items
- 提升适合沉淀的 learnings
- 关联相关 entries
- 升级 recurring issues

## Detection Triggers

当你注意到这些情况时，自动记录：

**Corrections**（→ 使用 `correction` category 的 learning）：
- "No, that's not right..."
- "Actually, it should be..."
- "You're wrong about..."
- "That's outdated..."

**Feature Requests**（→ feature request）：
- "Can you also..."
- "I wish you could..."
- "Is there a way to..."
- "Why can't you..."

**Knowledge Gaps**（→ 使用 `knowledge_gap` category 的 learning）：
- 用户提供了你此前不知道的信息
- 你引用的 documentation 已过时
- API behavior 与你的理解不一致

**Errors**（→ error entry）：
- command 返回 non-zero exit code
- exception 或 stack trace
- 非预期输出或行为
- timeout 或 connection failure

## Priority Guidelines

| Priority | When to Use |
|----------|-------------|
| `critical` | 阻塞核心功能、存在数据丢失风险、安全问题 |
| `high` | 影响显著、影响常见 workflow、重复出现的问题 |
| `medium` | 影响中等，存在 workaround |
| `low` | 轻微不便、边缘 case、nice-to-have |

## Area Tags

用于按 codebase 区域筛选 learnings：

| Area | Scope |
|------|-------|
| `frontend` | UI、components、client-side code |
| `backend` | API、services、server-side code |
| `infra` | CI/CD、deployment、Docker、cloud |
| `tests` | test files、testing utilities、coverage |
| `docs` | documentation、comments、READMEs |
| `config` | configuration files、environment、settings |

## Best Practices

1. **Log immediately** - 问题刚出现时上下文最完整
2. **Be specific** - 未来的 agents 需要快速理解
3. **Include reproduction steps** - 对 errors 尤其重要
4. **Link related files** - 让修复更容易
5. **Suggest concrete fixes** - 不要只写 "investigate"
6. **Use consistent categories** - 便于过滤
7. **Promote aggressively** - 如果拿不准，就加到 CLAUDE.md 或 .github/copilot-instructions.md
8. **Review regularly** - 过期的 learnings 会迅速失去价值

## Gitignore Options

**Keep learnings local**（按开发者本地保留）：
```gitignore
.learnings/
```

**Track learnings in repo**（团队共享）：
不要添加到 `.gitignore` 中，这样 learnings 会成为共享知识。

**Hybrid**（跟踪模板，忽略具体 entries）：
```gitignore
.learnings/*.md
!.learnings/.gitkeep
```

## Hook Integration

通过 agent hooks 启用自动提醒。该能力是 **opt-in** 的，你必须显式配置 hooks。

### Quick Setup（Claude Code / Codex）

在项目中创建 `.claude/settings.json`：

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "./skills/self-improvement/scripts/activator.sh"
      }]
    }]
  }
}
```

这会在每次 prompt 后注入一个 learning evaluation reminder（约增加 50-100 tokens 开销）。

### Full Setup（带 Error Detection）

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "./skills/self-improvement/scripts/activator.sh"
      }]
    }],
    "PostToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "./skills/self-improvement/scripts/error-detector.sh"
      }]
    }]
  }
}
```

### Available Hook Scripts

| Script | Hook Type | Purpose |
|--------|-----------|---------|
| `scripts/activator.sh` | UserPromptSubmit | 提醒在任务结束后回顾 learnings |
| `scripts/error-detector.sh` | PostToolUse (Bash) | 在 command errors 出现时触发 |

详见 `references/hooks-setup.md` 中的详细配置与故障排查。

## Automatic Skill Extraction

当某条 learning 足够有价值，可以演化为可复用的 skill 时，使用提供的 helper 进行提取。

### Skill Extraction Criteria

当满足以下任意条件时，这条 learning 就适合做 skill extraction：

| Criterion | Description |
|-----------|-------------|
| **Recurring** | 有 2 条以上相似问题的 `See Also` links |
| **Verified** | `Status` 为 `resolved`，并且 fix 已验证可用 |
| **Non-obvious** | 需要真实 debugging/investigation 才能发现 |
| **Broadly applicable** | 不是项目特定问题；对多个 codebase 都有帮助 |
| **User-flagged** | 用户明确说 “save this as a skill” 或类似表达 |

### Extraction Workflow

1. **Identify candidate**：该 learning 满足 extraction criteria
2. **Run helper**（或手动创建）：
   ```bash
   ./skills/self-improvement/scripts/extract-skill.sh skill-name --dry-run
   ./skills/self-improvement/scripts/extract-skill.sh skill-name
   ```
3. **Customize SKILL.md**：将 learning 内容填入模板
4. **Update learning**：将 status 设为 `promoted_to_skill`，并补充 `Skill-Path`
5. **Verify**：在新的 session 中读取该 skill，确保它是 self-contained 的

### Manual Extraction

如果你更偏向手工创建：

1. 创建 `skills/<skill-name>/SKILL.md`
2. 使用 `assets/SKILL-TEMPLATE.md` 中的模板
3. 遵循 [Agent Skills spec](https://agentskills.io/specification)：
   - 使用包含 `name` 和 `description` 的 YAML frontmatter
   - name 必须与 folder name 一致
   - skill folder 内不要放 README.md

### Extraction Detection Triggers

注意这些信号，它们通常意味着某条 learning 应该升级为 skill：

**In conversation：**
- "Save this as a skill"
- "I keep running into this"
- "This would be useful for other projects"
- "Remember this pattern"

**In learning entries：**
- 存在多个 `See Also` links（说明是 recurring issue）
- 高优先级且已 resolved
- category 为 `best_practice` 且具有广泛适用性
- 用户对该 solution 给出明显正向反馈

### Skill Quality Gates

在提取前，确认：

- [ ] Solution 已测试并可用
- [ ] Description 在脱离原始上下文后仍然清晰
- [ ] Code examples 是 self-contained 的
- [ ] 没有项目特定的 hardcoded values
- [ ] 遵循 skill naming conventions（lowercase、hyphens）

## Multi-Agent Support

该 skill 可以在不同 AI coding agents 中工作，但 activation 方式因 agent 而异。

### Claude Code

**Activation**：Hooks（UserPromptSubmit、PostToolUse）
**Setup**：在 `.claude/settings.json` 中配置 hooks
**Detection**：通过 hook scripts 自动检测

### Codex CLI

**Activation**：Hooks（与 Claude Code 相同模式）
**Setup**：在 `.codex/settings.json` 中配置 hooks
**Detection**：通过 hook scripts 自动检测

### GitHub Copilot

**Activation**：手动（不支持 hooks）
**Setup**：加入 `.github/copilot-instructions.md`：

```markdown
## Self-Improvement

在解决 non-obvious issues 后，考虑将其记录到 `.learnings/`：
1. 使用 self-improvement skill 的格式
2. 用 See Also 关联相关 entries
3. 将高价值 learnings 提升为 skills

可以在 chat 中提问："Should I log this as a learning?"
```

**Detection**：在 session 结束时手动回顾

### OpenClaw

**Activation**：Workspace injection + inter-agent messaging
**Setup**：见上文 “OpenClaw Setup” section
**Detection**：通过 session tools 和 workspace files

### Agent-Agnostic Guidance

无论使用什么 agent，当你遇到以下情况时都应应用 self-improvement：

1. **Discover something non-obvious** - solution 不是立刻想到的
2. **Correct yourself** - 最初方案是错的
3. **Learn project conventions** - 发现了未文档化的 patterns
4. **Hit unexpected errors** - 特别是 diagnosis 很费劲时
5. **Find better approaches** - 相比原始方案找到了更优路径

### Copilot Chat Integration

对于 Copilot 用户，在相关场景下可以把这句话加进 prompt：

> After completing this task, evaluate if any learnings should be logged to `.learnings/` using the self-improvement skill format.

也可以使用这些快速 prompts：
- "Log this to learnings"
- "Create a skill from this solution"
- "Check .learnings/ for related issues"
