---
name: self-improvement
description: "在 agent bootstrap 期间注入 self-improvement reminder"
metadata: {"openclaw":{"emoji":"🧠","events":["agent:bootstrap"]}}
---

# Self-Improvement Hook

在 agent bootstrap 阶段注入一段提醒，提示检查是否需要记录 learnings。

## What It Does

- 在 `agent:bootstrap` 时触发（早于 workspace files 注入）
- 添加一段 reminder block，提示检查 `.learnings/` 中是否有相关 entries
- 提醒 agent 记录 corrections、errors 和 discoveries

## Configuration

无需额外配置。启用方式：

```bash
openclaw hooks enable self-improvement
```
