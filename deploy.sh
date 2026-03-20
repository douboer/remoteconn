#!/bin/bash

set -euo pipefail

REMOTE_HOST="mac.biboer.cn"
REMOTE_USER="gavin"
REMOTE_TARGET="${REMOTE_USER}@${REMOTE_HOST}"
PROJECT_DIR="${HOME}/remoteconn"
REMOTE_HOST_ALIASES="${REMOTE_HOST},gavin-mac-mini.local,gavin-mac-mini"

if [ -t 1 ]; then
  COLOR_RESET=$'\033[0m'
  COLOR_LOCAL=$'\033[1;32m'
  COLOR_REMOTE=$'\033[1;94m'
else
  COLOR_RESET=""
  COLOR_LOCAL=""
  COLOR_REMOTE=""
fi

log_local() {
  echo "${COLOR_LOCAL}[LOCAL]${COLOR_RESET} $*"
}

log_remote() {
  echo "${COLOR_REMOTE}[REMOTE]${COLOR_RESET} $*"
}

run_remote_deploy() {
  log_remote "开始执行远端流程：runit -> build -> gateway deploy"
  cd "${PROJECT_DIR}"

  log_remote "开始执行 ./runit.sh..."
  LOG_CONTEXT=REMOTE ./runit.sh

  log_remote "开始构建项目..."
  npm run build

  log_remote "开始部署网关..."
  ./scripts/gatewayctl.sh deploy

  log_remote "远端部署完成。"
}

CURRENT_HOST_FQDN="$(hostname -f 2>/dev/null || hostname)"
CURRENT_HOST_SHORT="$(hostname -s 2>/dev/null || hostname)"
CURRENT_HOST_LOCAL="$(scutil --get LocalHostName 2>/dev/null || true)"

is_remote_host=false
IFS=',' read -r -a HOST_ALIAS_LIST <<< "${REMOTE_HOST_ALIASES}"
for alias in "${HOST_ALIAS_LIST[@]}"; do
  if [[ "${CURRENT_HOST_FQDN}" == "${alias}" || "${CURRENT_HOST_SHORT}" == "${alias}" || "${CURRENT_HOST_LOCAL}" == "${alias}" ]]; then
    is_remote_host=true
    break
  fi
done

if [[ "${is_remote_host}" == "true" ]]; then
  log_remote "当前主机=${CURRENT_HOST_FQDN}（远端主机），直接执行远端流程。"
  run_remote_deploy
  exit 0
fi

log_local "当前主机=${CURRENT_HOST_FQDN}（本地），先执行本地 runit。"
LOG_CONTEXT=LOCAL ./runit.sh

ssh -T "${REMOTE_TARGET}" << 'EOF'
COLOR_RESET=$'\033[0m'
COLOR_REMOTE=$'\033[1;94m'

log_remote() {
  echo "${COLOR_REMOTE}[REMOTE]${COLOR_RESET} $*"
}

log_remote "进入项目目录..."
cd ~/remoteconn || exit 1

log_remote "开始执行 ./runit.sh..."
LOG_CONTEXT=REMOTE ./runit.sh
if [ $? -ne 0 ]; then
  log_remote "./runit.sh 执行失败，中止部署。"
  exit 1
fi

log_remote "开始构建项目..."
npm run build
if [ $? -ne 0 ]; then
  log_remote "构建失败，中止部署。"
  exit 1
fi

log_remote "开始部署网关..."
./scripts/gatewayctl.sh deploy
if [ $? -ne 0 ]; then
  log_remote "网关部署失败，中止部署。"
  exit 1
fi

log_remote "远端部署完成。"
exit 0
EOF

log_local "部署流程执行完毕。"
