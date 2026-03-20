# Entry Examples

这里给出字段完整、格式规范的 entries 示例。

## Learning: Correction

```markdown
## [LRN-20250115-001] correction

**Logged**: 2025-01-15T10:30:00Z
**Priority**: high
**Status**: pending
**Area**: tests

### Summary
错误地认为 pytest fixtures 默认都是 function scope

### Details
编写 test fixtures 时，我假设所有 fixtures 都是 function scope。
用户纠正我：虽然 function scope 是默认值，但这个 codebase 的约定是，
数据库连接这类开销较大的资源应使用 module scope，以提升 test 性能。

### Suggested Action
当创建涉及昂贵初始化（DB、network）的 fixtures 时，
不要默认用 function scope，先检查现有 fixtures 的 scope 模式。

### Metadata
- Source: user_feedback
- Related Files: tests/conftest.py
- Tags: pytest, testing, fixtures

---
```

## Learning: Knowledge Gap (Resolved)

```markdown
## [LRN-20250115-002] knowledge_gap

**Logged**: 2025-01-15T14:22:00Z
**Priority**: medium
**Status**: resolved
**Area**: config

### Summary
项目使用 pnpm，而不是 npm，作为 package manager

### Details
尝试运行 `npm install`，但项目实际上使用 pnpm workspaces。
锁文件是 `pnpm-lock.yaml`，而不是 `package-lock.json`。

### Suggested Action
在默认假设 npm 之前，先检查是否存在 `pnpm-lock.yaml` 或 `pnpm-workspace.yaml`。
对于该项目，应使用 `pnpm install`。

### Metadata
- Source: error
- Related Files: pnpm-lock.yaml, pnpm-workspace.yaml
- Tags: package-manager, pnpm, setup

### Resolution
- **Resolved**: 2025-01-15T14:30:00Z
- **Commit/PR**: N/A - knowledge update
- **Notes**: 已加入 CLAUDE.md 作为后续参考

---
```

## Learning: Promoted to CLAUDE.md

```markdown
## [LRN-20250115-003] best_practice

**Logged**: 2025-01-15T16:00:00Z
**Priority**: high
**Status**: promoted
**Promoted**: CLAUDE.md
**Area**: backend

### Summary
API responses 必须包含来自 request headers 的 correlation ID

### Details
所有 API responses 都应回传请求中的 `X-Correlation-ID` header。
这是 distributed tracing 的要求。缺少该 header 的 response
会破坏 observability pipeline。

### Suggested Action
在 API handlers 中始终加入 correlation ID passthrough。

### Metadata
- Source: user_feedback
- Related Files: src/middleware/correlation.ts
- Tags: api, observability, tracing

---
```

## Learning: Promoted to AGENTS.md

```markdown
## [LRN-20250116-001] best_practice

**Logged**: 2025-01-16T09:00:00Z
**Priority**: high
**Status**: promoted
**Promoted**: AGENTS.md
**Area**: backend

### Summary
修改 OpenAPI spec 后必须重新生成 API client

### Details
修改 API endpoints 时，必须重新生成 TypeScript client。
忘记执行这一步会导致 type mismatches，只在运行时才暴露出来。
generate script 还会顺带执行 validation。

### Suggested Action
把它加入 agent workflow：只要有 API 变更，就运行 `pnpm run generate:api`。

### Metadata
- Source: error
- Related Files: openapi.yaml, src/client/api.ts
- Tags: api, codegen, typescript

---
```

## Error Entry

```markdown
## [ERR-20250115-A3F] docker_build

**Logged**: 2025-01-15T09:15:00Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Docker build 在 M1 Mac 上因 platform mismatch 失败

### Error
```
error: failed to solve: python:3.11-slim: no match for platform linux/arm64
```

### Context
- Command: `docker build -t myapp .`
- Dockerfile 使用 `FROM python:3.11-slim`
- 运行环境为 Apple Silicon（M1/M2）

### Suggested Fix
在 command 中加 platform flag：`docker build --platform linux/amd64 -t myapp .`
或者更新 Dockerfile：`FROM --platform=linux/amd64 python:3.11-slim`

### Metadata
- Reproducible: yes
- Related Files: Dockerfile

---
```

## Error Entry: Recurring Issue

```markdown
## [ERR-20250120-B2C] api_timeout

**Logged**: 2025-01-20T11:30:00Z
**Priority**: critical
**Status**: pending
**Area**: backend

### Summary
第三方 payment API 在 checkout 期间 timeout

### Error
```
TimeoutError: Request to payments.example.com timed out after 30000ms
```

### Context
- Command: POST /api/checkout
- timeout 设为 30s
- 高峰时段更容易发生（午间、晚间）

### Suggested Fix
实现 exponential backoff retry，并考虑 circuit breaker pattern。

### Metadata
- Reproducible: yes (during peak hours)
- Related Files: src/services/payment.ts
- See Also: ERR-20250115-X1Y, ERR-20250118-Z3W

---
```

## Feature Request

```markdown
## [FEAT-20250115-001] export_to_csv

**Logged**: 2025-01-15T16:45:00Z
**Priority**: medium
**Status**: pending
**Area**: backend

### Requested Capability
将分析结果导出为 CSV 格式

### User Context
用户每周都会生成报表，需要把结果分享给非技术 stakeholders 在 Excel 中查看。
目前他们只能手工复制输出。

### Complexity Estimate
simple

### Suggested Implementation
为 analyze command 增加 `--output csv` flag。使用标准 csv module。
也可以沿用现有的 `--output json` 模式扩展。

### Metadata
- Frequency: recurring
- Related Features: analyze command, json output

---
```

## Feature Request: Resolved

```markdown
## [FEAT-20250110-002] dark_mode

**Logged**: 2025-01-10T14:00:00Z
**Priority**: low
**Status**: resolved
**Area**: frontend

### Requested Capability
dashboard 支持 dark mode

### User Context
用户经常在深夜工作，觉得亮色界面太刺眼。
另外还有几位用户也非正式提过这个需求。

### Complexity Estimate
medium

### Suggested Implementation
使用 CSS variables 管理颜色，并在 user settings 中加入 toggle。
同时考虑 system preference detection。

### Metadata
- Frequency: recurring
- Related Features: user settings, theme system

### Resolution
- **Resolved**: 2025-01-18T16:00:00Z
- **Commit/PR**: #142
- **Notes**: 已实现 system preference detection 和手动 toggle

---
```

## Learning: Promoted to Skill

```markdown
## [LRN-20250118-001] best_practice

**Logged**: 2025-01-18T11:00:00Z
**Priority**: high
**Status**: promoted_to_skill
**Skill-Path**: skills/docker-m1-fixes
**Area**: infra

### Summary
Docker build 在 Apple Silicon 上因 platform mismatch 失败

### Details
在 M1/M2 Mac 上构建 Docker images 时，build 会失败，
因为 base image 没有 ARM64 variant。这个问题很常见，
会影响很多开发者。

### Suggested Action
在 docker build command 中添加 `--platform linux/amd64`，
或者在 Dockerfile 中使用 `FROM --platform=linux/amd64`。

### Metadata
- Source: error
- Related Files: Dockerfile
- Tags: docker, arm64, m1, apple-silicon
- See Also: ERR-20250115-A3F, ERR-20250117-B2D

---
```

## Extracted Skill Example

当上面的 learning 被提炼为 skill 时，会变成：

**File**: `skills/docker-m1-fixes/SKILL.md`

```markdown
---
name: docker-m1-fixes
description: "修复 Apple Silicon（M1/M2）上的 Docker build failures。在 docker build 因 platform mismatch errors 失败时使用。"
---

# Docker M1 Fixes

用于解决 Apple Silicon Mac 上的 Docker build 问题。

## Quick Reference

| Error | Fix |
|-------|-----|
| `no match for platform linux/arm64` | 在 build 时添加 `--platform linux/amd64` |
| Image runs but crashes | 使用 emulation，或寻找兼容 ARM 的 base |

## The Problem

许多 Docker base images 没有 ARM64 variants。  
当在 Apple Silicon（M1/M2/M3）上构建时，Docker 默认会尝试拉取 ARM64 images，
从而导致 platform mismatch errors。

## Solutions

### Option 1: Build Flag (Recommended)

在 build command 中添加 platform flag：

\`\`\`bash
docker build --platform linux/amd64 -t myapp .
\`\`\`

### Option 2: Dockerfile Modification

在 FROM instruction 中显式指定 platform：

\`\`\`dockerfile
FROM --platform=linux/amd64 python:3.11-slim
\`\`\`

### Option 3: Docker Compose

为 service 添加 platform：

\`\`\`yaml
services:
  app:
    platform: linux/amd64
    build: .
\`\`\`

## Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| Build flag | 不需要改文件 | 必须记得每次都加 flag |
| Dockerfile | 显式且可版本化 | 会影响所有 builds |
| Compose | 对开发场景方便 | 需要 compose |

## Performance Note

在 ARM64 上运行 AMD64 images 依赖 Rosetta 2 emulation。  
这对开发场景通常可行，但可能更慢。对于生产环境，应尽量寻找 ARM-native
alternatives。

## Source

- Learning ID: LRN-20250118-001
- Category: best_practice
- Extraction Date: 2025-01-18
```
