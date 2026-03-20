# Hook Setup Guide

为 AI coding agents 配置自动 self-improvement triggers。

## Overview

hooks 会在关键时机注入提醒，以便主动记录 learnings：
- **UserPromptSubmit**：每次 prompt 后提醒是否需要记录 learnings
- **PostToolUse (Bash)**：当 command 失败时进行 error detection

## Claude Code Setup

### Option 1: Project-Level Configuration

在项目根目录创建 `.claude/settings.json`：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "./skills/self-improvement/scripts/activator.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./skills/self-improvement/scripts/error-detector.sh"
          }
        ]
      }
    ]
  }
}
```

### Option 2: User-Level Configuration

将以下内容加入 `~/.claude/settings.json`，实现全局启用：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/skills/self-improvement/scripts/activator.sh"
          }
        ]
      }
    ]
  }
}
```

### Minimal Setup（仅 Activator）

如果希望降低开销，只使用 UserPromptSubmit hook：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "./skills/self-improvement/scripts/activator.sh"
          }
        ]
      }
    ]
  }
}
```

## Codex CLI Setup

Codex 使用与 Claude Code 相同的 hook system。在 `.codex/settings.json` 中写入：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "./skills/self-improvement/scripts/activator.sh"
          }
        ]
      }
    ]
  }
}
```

## GitHub Copilot Setup

Copilot 不直接支持 hooks。可以改为在 `.github/copilot-instructions.md` 中加入提示：

```markdown
## Self-Improvement

在完成包含以下情况的任务后：
- Debugging non-obvious issues
- 发现 workarounds
- 学到项目特定 patterns
- 解决 unexpected errors

考虑使用 self-improvement skill 的格式，将这条 learning 记录到 `.learnings/`。

对于对其他 sessions 也有价值的高价值 learnings，考虑做 skill extraction。
```

## Verification

### Test Activator Hook

1. 启用 hook 配置
2. 启动新的 Claude Code session
3. 发送任意 prompt
4. 确认上下文中出现 `<self-improvement-reminder>`

### Test Error Detector Hook

1. 为 Bash 启用 PostToolUse hook
2. 运行一个会失败的 command：`ls /nonexistent/path`
3. 确认出现 `<error-detected>` reminder

### Dry Run Extract Script

```bash
./skills/self-improvement/scripts/extract-skill.sh test-skill --dry-run
```

预期输出会展示将要创建的 skill scaffold。

## Troubleshooting

### Hook Not Triggering

1. **Check script permissions**：`chmod +x scripts/*.sh`
2. **Verify path**：使用绝对路径，或使用相对项目根目录的路径
3. **Check settings location**：确认是 project 级还是 user 级配置
4. **Restart session**：hooks 会在 session 启动时加载

### Permission Denied

```bash
chmod +x ./skills/self-improvement/scripts/activator.sh
chmod +x ./skills/self-improvement/scripts/error-detector.sh
chmod +x ./skills/self-improvement/scripts/extract-skill.sh
```

### Script Not Found

如果使用相对路径，请确认当前目录正确；否则使用绝对路径：

```json
{
  "command": "/absolute/path/to/skills/self-improvement/scripts/activator.sh"
}
```

### Too Much Overhead

如果 activator 让你觉得太打断：

1. **Use minimal setup**：仅启用 UserPromptSubmit，不启用 PostToolUse
2. **Add matcher filter**：只在特定 prompts 下触发：

```json
{
  "matcher": "fix|debug|error|issue",
  "hooks": [...]
}
```

## Hook Output Budget

activator 被设计为轻量输出：
- **Target**：约 50-100 tokens 每次触发
- **Content**：结构化 reminder，而不是冗长说明
- **Format**：XML tags，便于解析

如果还需要进一步降低开销，可以直接修改 `activator.sh`，让输出更短。

## Security Considerations

- hook scripts 以与 Claude Code 相同的权限运行
- scripts 只输出文本；不会修改文件，也不会执行额外 commands
- error detector 会读取 `CLAUDE_TOOL_OUTPUT` environment variable
- 所有 scripts 都是 opt-in 的（必须手动配置才会启用）

## Disabling Hooks

如果想临时停用，又不想删除配置：

1. **Comment out in settings**：
```json
{
  "hooks": {
    // "UserPromptSubmit": [...]
  }
}
```

2. **或直接删除 settings file**：没有配置时 hooks 就不会运行
