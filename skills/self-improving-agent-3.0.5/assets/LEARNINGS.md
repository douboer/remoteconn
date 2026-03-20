# Learnings

用于记录开发过程中的 corrections、insights 和 knowledge gaps。

**Categories**: correction | insight | knowledge_gap | best_practice
**Areas**: frontend | backend | infra | tests | docs | config
**Statuses**: pending | in_progress | resolved | wont_fix | promoted | promoted_to_skill

## Status Definitions

| Status | Meaning |
|--------|---------|
| `pending` | 尚未处理 |
| `in_progress` | 正在处理 |
| `resolved` | 问题已修复或知识已吸收 |
| `wont_fix` | 决定不处理（原因写在 Resolution 中） |
| `promoted` | 已提升到 CLAUDE.md、AGENTS.md 或 copilot-instructions.md |
| `promoted_to_skill` | 已提炼为可复用的 skill |

## Skill Extraction Fields

当一条 learning 被提升为 skill 时，添加以下字段：

```markdown
**Status**: promoted_to_skill
**Skill-Path**: skills/skill-name
```

示例：
```markdown
## [LRN-20250115-001] best_practice

**Logged**: 2025-01-15T10:00:00Z
**Priority**: high
**Status**: promoted_to_skill
**Skill-Path**: skills/docker-m1-fixes
**Area**: infra

### Summary
Docker build fails on Apple Silicon due to platform mismatch
...
```

---
