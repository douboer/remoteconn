#!/bin/bash

set -euo pipefail

LOG_PREFIX="[${LOG_CONTEXT:-RUNIT}]"

if [ -t 1 ]; then
  COLOR_RESET=$'\033[0m'
  case "${LOG_CONTEXT:-RUNIT}" in
    LOCAL)
      COLOR_PREFIX=$'\033[1;32m'
      ;;
    REMOTE)
      COLOR_PREFIX=$'\033[1;94m'
      ;;
    *)
      COLOR_PREFIX=$'\033[1;33m'
      ;;
  esac
else
  COLOR_RESET=""
  COLOR_PREFIX=""
fi

log() {
  echo "${COLOR_PREFIX}${LOG_PREFIX}${COLOR_RESET} $*"
}

log "开始同步远端 main（先 pull 再 push）..."
git pull --rebase --autostash origin main

log "开始收集本地变更..."
git add -A

msg="update at $(date '+%Y-%m-%d %H:%M:%S')"
if [ $# -gt 0 ]; then
  msg="$*"
fi

if git diff --cached --quiet; then
  log "没有可提交变更，跳过 commit。"
else
  log "开始提交：${msg}"
  git commit -m "$msg"
fi

log "开始推送到 origin/main..."
git push origin main
log "runit.sh 执行完成。"

