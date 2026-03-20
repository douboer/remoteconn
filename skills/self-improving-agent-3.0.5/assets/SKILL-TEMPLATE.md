# Skill Template

用于从 learnings 中提炼 skill 的模板。复制后按需定制。

---

## SKILL.md Template

```markdown
---
name: skill-name-here
description: "简洁说明这个 skill 在什么场景下使用、为什么要使用。包含 trigger conditions。"
---

# Skill Name

简要介绍这个 skill 解决的问题，以及它的来源。

## Quick Reference

| Situation | Action |
|-----------|--------|
| [Trigger 1] | [Action 1] |
| [Trigger 2] | [Action 2] |

## Background

说明这类知识为什么重要、能避免什么问题，以及原始 learning 提供的上下文。

## Solution

### Step-by-Step

1. 第一步，附上 code 或 command
2. 第二步
3. 验证步骤

### Code Example

\`\`\`language
// 展示解决方案的示例代码
\`\`\`

## Common Variations

- **Variation A**: 说明这种变体以及如何处理
- **Variation B**: 说明这种变体以及如何处理

## Gotchas

- 常见警告或错误 #1
- 常见警告或错误 #2

## Related

- 指向相关文档
- 指向相关 skill

## Source

Extracted from learning entry.
- **Learning ID**: LRN-YYYYMMDD-XXX
- **Original Category**: correction | insight | knowledge_gap | best_practice
- **Extraction Date**: YYYY-MM-DD
```

---

## Minimal Template

适用于不需要太多 section 的简单 skill：

```markdown
---
name: skill-name-here
description: "这个 skill 做什么，以及在什么场景下使用。"
---

# Skill Name

[用一句话说明问题]

## Solution

[直接给出解决方案与 code/commands]

## Source

- Learning ID: LRN-YYYYMMDD-XXX
```

---

## Template with Scripts

适用于包含可执行 helper 的 skill：

```markdown
---
name: skill-name-here
description: "这个 skill 做什么，以及在什么场景下使用。"
---

# Skill Name

[简介]

## Quick Reference

| Command | Purpose |
|---------|---------|
| `./scripts/helper.sh` | [它的作用] |
| `./scripts/validate.sh` | [它的作用] |

## Usage

### Automated (Recommended)

\`\`\`bash
./skills/skill-name/scripts/helper.sh [args]
\`\`\`

### Manual Steps

1. 第一步
2. 第二步

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/helper.sh` | 主工具 |
| `scripts/validate.sh` | 校验工具 |

## Source

- Learning ID: LRN-YYYYMMDD-XXX
```

---

## Naming Conventions

- **Skill name**: 使用 lowercase，空格用 hyphens
  - Good: `docker-m1-fixes`, `api-timeout-patterns`
  - Bad: `Docker_M1_Fixes`, `APITimeoutPatterns`

- **Description**: 以动作开头，并说明 trigger
  - Good: "Handles Docker build failures on Apple Silicon. Use when builds fail with platform mismatch."
  - Bad: "Docker stuff"

- **Files**:
  - `SKILL.md` - 必需，主文档
  - `scripts/` - 可选，可执行代码
  - `references/` - 可选，详细文档
  - `assets/` - 可选，模板

---

## Extraction Checklist

在从 learning 创建 skill 之前：

- [ ] Learning 已验证（status: resolved）
- [ ] 解决方案具有广泛适用性（不是一次性问题）
- [ ] 内容完整（包含必要上下文）
- [ ] 名称符合 conventions
- [ ] Description 简洁但信息充分
- [ ] Quick Reference table 可直接执行
- [ ] Code examples 已测试
- [ ] 已记录 source learning ID

创建之后：

- [ ] 将原 learning 更新为 `promoted_to_skill`
- [ ] 在 learning metadata 中添加 `Skill-Path: skills/skill-name`
- [ ] 在新的 session 中读取该 skill，确认可用
