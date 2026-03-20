#!/usr/bin/env bash
set -euo pipefail

# 统一常量：systemd 与 launchd 各自的服务标识与路径。
SYSTEMD_SERVICE_NAME="remoteconn-gateway.service"
LAUNCHD_LABEL="com.remoteconn.gateway"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
GATEWAY_ENV_FILE="${REPO_ROOT}/apps/gateway/.env"
DEFAULT_HEALTH_PORT="$(awk -F= '/^PORT=/{gsub(/[[:space:]\r\"]/, "", $2); print $2; exit}' "${GATEWAY_ENV_FILE}" 2>/dev/null || true)"
if [[ -z "${DEFAULT_HEALTH_PORT}" ]]; then
  DEFAULT_HEALTH_PORT="8787"
fi
DEFAULT_HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${DEFAULT_HEALTH_PORT}/health}"
LAUNCHD_PLIST="${HOME}/Library/LaunchAgents/${LAUNCHD_LABEL}.plist"
LAUNCHD_STDOUT_LOG="${HOME}/Library/Logs/${LAUNCHD_LABEL}.out.log"
LAUNCHD_STDERR_LOG="${HOME}/Library/Logs/${LAUNCHD_LABEL}.err.log"
TSX_BIN="${REPO_ROOT}/node_modules/.bin/tsx"

usage() {
  cat <<'USAGE'
用法:
  scripts/gatewayctl.sh <命令> [参数]

命令:
  ensure-env                  若缺失 apps/gateway/.env，则按 .env.example 生成
  build                       构建 gateway 产物（dist）
  install-service [user]      安装/更新服务（Linux=systemd，macOS=launchd）
  uninstall-service           卸载服务
  start                       启动服务
  stop                        停止服务
  restart                     重启服务
  status                      查看服务状态
  logs [lines]                查看日志（默认 200 行）
  logs-clear                  清空当前服务日志文件（仅清理文件，不影响进程）
  health [url]                健康检查（默认 http://127.0.0.1:8787/health）
  deploy [url]                一键发布（ensure-env + build + restart + health）
  run-local                   本地前台运行（不依赖守护服务）

示例:
  scripts/gatewayctl.sh deploy
  scripts/gatewayctl.sh install-service gavin
  scripts/gatewayctl.sh health http://127.0.0.1:8787/health
USAGE
}

need_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "[错误] 缺少命令: ${cmd}" >&2
    exit 1
  fi
}

run_with_sudo() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
    return
  fi
  sudo "$@"
}

# 判定当前机器的服务管理器：Linux 优先 systemd，macOS 使用 launchd。
detect_service_manager() {
  if command -v systemctl >/dev/null 2>&1; then
    echo "systemd"
    return
  fi

  if [[ "$(uname -s)" == "Darwin" ]] && command -v launchctl >/dev/null 2>&1; then
    echo "launchd"
    return
  fi

  echo "none"
}

ensure_service_manager() {
  local manager
  manager="$(detect_service_manager)"
  if [[ "${manager}" == "none" ]]; then
    echo "[错误] 当前环境不支持 systemd/launchd，无法托管服务" >&2
    exit 1
  fi
}

escape_single_quote() {
  printf "%s" "$1" | sed "s/'/'\"'\"'/g"
}

xml_escape() {
  printf "%s" "$1" \
    | sed -e 's/&/\&amp;/g' \
          -e 's/</\&lt;/g' \
          -e 's/>/\&gt;/g' \
          -e 's/"/\&quot;/g' \
          -e "s/'/\&apos;/g"
}

ensure_tsx_bin() {
  if [[ ! -x "${TSX_BIN}" ]]; then
    echo "[错误] 未找到 tsx 可执行文件: ${TSX_BIN}" >&2
    echo "[提示] 请先在仓库根目录执行 npm install" >&2
    exit 1
  fi
}

bootstrap_launchd_with_retry() {
  local domain plist retries i
  domain="gui/$(id -u)"
  plist="${LAUNCHD_PLIST}"
  retries=5
  i=1

  while (( i <= retries )); do
    if launchctl bootstrap "${domain}" "${plist}" >/dev/null 2>&1; then
      return
    fi
    sleep 0.3
    i=$((i + 1))
  done

  echo "[错误] launchd 加载失败: ${plist}" >&2
  launchctl bootstrap "${domain}" "${plist}"
}

ensure_env() {
  local env_file="${REPO_ROOT}/apps/gateway/.env"
  if [[ -f "${env_file}" ]]; then
    echo "[信息] 已存在: ${env_file}"
    return
  fi
  cp "${REPO_ROOT}/apps/gateway/.env.example" "${env_file}"
  echo "[信息] 已创建: ${env_file}"
}

build_gateway() {
  need_cmd npm
  echo "[信息] 开始构建 gateway..."
  (
    cd "${REPO_ROOT}"
    npm --workspace @remoteconn/gateway run build
  )
  echo "[信息] 构建完成"
}

install_systemd_service() {
  ensure_tsx_bin

  local run_user="${1:-${SUDO_USER:-${USER}}}"
  local unit_path="/etc/systemd/system/${SYSTEMD_SERVICE_NAME}"
  local tmp_file
  tmp_file="$(mktemp)"

  # 统一通过 tsx 直接运行源码入口，规避 dist ESM 扩展名解析差异与 npm 包装噪声。
  cat >"${tmp_file}" <<UNIT
[Unit]
Description=RemoteConn Gateway Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${run_user}
WorkingDirectory=${REPO_ROOT}
EnvironmentFile=${REPO_ROOT}/apps/gateway/.env
ExecStart=${TSX_BIN} ${REPO_ROOT}/apps/gateway/src/index.ts
Restart=always
RestartSec=2
TimeoutStopSec=15
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65535
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

  run_with_sudo cp "${tmp_file}" "${unit_path}"
  rm -f "${tmp_file}"
  run_with_sudo systemctl daemon-reload
  run_with_sudo systemctl enable "${SYSTEMD_SERVICE_NAME}"
  echo "[信息] systemd 服务已安装: ${unit_path}"
}

install_launchd_service() {
  ensure_tsx_bin

  local run_user="${1:-${USER}}"
  if [[ "${run_user}" != "${USER}" ]]; then
    echo "[告警] launchd 仅管理当前用户会话，忽略 user=${run_user}"
  fi

  mkdir -p "${HOME}/Library/LaunchAgents" "${HOME}/Library/Logs"

  local env_file shell_cmd shell_cmd_xml
  env_file="${REPO_ROOT}/apps/gateway/.env"
  shell_cmd="cd '$(escape_single_quote "${REPO_ROOT}")' && set -a && source '$(escape_single_quote "${env_file}")' && exec '$(escape_single_quote "${TSX_BIN}")' '$(escape_single_quote "${REPO_ROOT}/apps/gateway/src/index.ts")'"
  shell_cmd_xml="$(xml_escape "${shell_cmd}")"

  cat >"${LAUNCHD_PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${shell_cmd_xml}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${REPO_ROOT}</string>
  <key>StandardOutPath</key>
  <string>${LAUNCHD_STDOUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LAUNCHD_STDERR_LOG}</string>
</dict>
</plist>
PLIST

  launchctl bootout "gui/$(id -u)/${LAUNCHD_LABEL}" >/dev/null 2>&1 || true
  bootstrap_launchd_with_retry
  echo "[信息] launchd 服务已安装: ${LAUNCHD_PLIST}"
}

install_service() {
  ensure_service_manager
  local manager
  manager="$(detect_service_manager)"
  case "${manager}" in
    systemd)
      install_systemd_service "${1:-}"
      ;;
    launchd)
      install_launchd_service "${1:-}"
      ;;
  esac
}

uninstall_service() {
  ensure_service_manager
  local manager
  manager="$(detect_service_manager)"
  case "${manager}" in
    systemd)
      run_with_sudo systemctl disable --now "${SYSTEMD_SERVICE_NAME}" || true
      run_with_sudo rm -f "/etc/systemd/system/${SYSTEMD_SERVICE_NAME}"
      run_with_sudo systemctl daemon-reload
      echo "[信息] systemd 服务已卸载: ${SYSTEMD_SERVICE_NAME}"
      ;;
    launchd)
      launchctl bootout "gui/$(id -u)/${LAUNCHD_LABEL}" >/dev/null 2>&1 || true
      rm -f "${LAUNCHD_PLIST}"
      echo "[信息] launchd 服务已卸载: ${LAUNCHD_LABEL}"
      ;;
  esac
}

start_service() {
  ensure_service_manager
  local manager
  manager="$(detect_service_manager)"
  case "${manager}" in
    systemd)
      run_with_sudo systemctl start "${SYSTEMD_SERVICE_NAME}"
      echo "[信息] 已启动: ${SYSTEMD_SERVICE_NAME}"
      ;;
    launchd)
      if [[ ! -f "${LAUNCHD_PLIST}" ]]; then
        echo "[错误] 未找到 ${LAUNCHD_PLIST}，请先执行 install-service" >&2
        exit 1
      fi
      if launchctl print "gui/$(id -u)/${LAUNCHD_LABEL}" >/dev/null 2>&1; then
        launchctl kickstart -k "gui/$(id -u)/${LAUNCHD_LABEL}"
      else
        bootstrap_launchd_with_retry
      fi
      echo "[信息] 已启动: ${LAUNCHD_LABEL}"
      ;;
  esac
}

stop_service() {
  ensure_service_manager
  local manager
  manager="$(detect_service_manager)"
  case "${manager}" in
    systemd)
      run_with_sudo systemctl stop "${SYSTEMD_SERVICE_NAME}"
      echo "[信息] 已停止: ${SYSTEMD_SERVICE_NAME}"
      ;;
    launchd)
      launchctl bootout "gui/$(id -u)/${LAUNCHD_LABEL}" >/dev/null 2>&1 || true
      echo "[信息] 已停止: ${LAUNCHD_LABEL}"
      ;;
  esac
}

restart_service() {
  ensure_service_manager
  local manager
  manager="$(detect_service_manager)"
  case "${manager}" in
    systemd)
      run_with_sudo systemctl restart "${SYSTEMD_SERVICE_NAME}"
      echo "[信息] 已重启: ${SYSTEMD_SERVICE_NAME}"
      ;;
    launchd)
      if [[ ! -f "${LAUNCHD_PLIST}" ]]; then
        echo "[错误] 未找到 ${LAUNCHD_PLIST}，请先执行 install-service" >&2
        exit 1
      fi
      if launchctl print "gui/$(id -u)/${LAUNCHD_LABEL}" >/dev/null 2>&1; then
        launchctl kickstart -k "gui/$(id -u)/${LAUNCHD_LABEL}"
      else
        bootstrap_launchd_with_retry
      fi
      echo "[信息] 已重启: ${LAUNCHD_LABEL}"
      ;;
  esac
}

status_service() {
  ensure_service_manager
  local manager
  manager="$(detect_service_manager)"
  case "${manager}" in
    systemd)
      run_with_sudo systemctl status "${SYSTEMD_SERVICE_NAME}" --no-pager
      ;;
    launchd)
      local status_tmp
      status_tmp="/tmp/remoteconn-launchd-status.log"
      if launchctl print "gui/$(id -u)/${LAUNCHD_LABEL}" >"${status_tmp}" 2>&1; then
        cat "${status_tmp}"
      else
        if grep -q "Could not find service" "${status_tmp}"; then
          echo "[信息] 服务未加载: ${LAUNCHD_LABEL}"
        else
          cat "${status_tmp}"
        fi
      fi
      ;;
  esac
}

logs_service() {
  ensure_service_manager
  local manager lines
  manager="$(detect_service_manager)"
  lines="${1:-200}"
  case "${manager}" in
    systemd)
      run_with_sudo journalctl -u "${SYSTEMD_SERVICE_NAME}" -n "${lines}" --no-pager
      ;;
    launchd)
      echo "[信息] stdout: ${LAUNCHD_STDOUT_LOG}"
      if [[ -f "${LAUNCHD_STDOUT_LOG}" ]]; then
        tail -n "${lines}" "${LAUNCHD_STDOUT_LOG}"
      else
        echo "[信息] 尚无 stdout 日志"
      fi
      echo "[信息] stderr: ${LAUNCHD_STDERR_LOG}"
      if [[ -f "${LAUNCHD_STDERR_LOG}" ]]; then
        tail -n "${lines}" "${LAUNCHD_STDERR_LOG}"
      else
        echo "[信息] 尚无 stderr 日志"
      fi
      ;;
  esac
}

logs_clear() {
  mkdir -p "$(dirname "${LAUNCHD_STDOUT_LOG}")"
  : >"${LAUNCHD_STDOUT_LOG}"
  : >"${LAUNCHD_STDERR_LOG}"
  echo "[信息] 已清空日志:"
  echo "  - ${LAUNCHD_STDOUT_LOG}"
  echo "  - ${LAUNCHD_STDERR_LOG}"
}

health_check() {
  need_cmd curl
  local url retries interval index output last_error
  url="${1:-${DEFAULT_HEALTH_URL}}"
  retries="${HEALTH_RETRIES:-5}"
  interval="${HEALTH_INTERVAL_SEC:-1}"
  index=1
  last_error=""

  while (( index <= retries )); do
    if output="$(curl -fsS --max-time 2 "${url}" 2>/dev/null)"; then
      echo "[信息] 健康检查（${index}/${retries}）通过: ${url}"
      echo "${output}"
      return
    fi
    last_error="$(curl -fsS --max-time 2 "${url}" 2>&1 || true)"
    echo "[告警] 健康检查失败，第 ${index}/${retries} 次重试"
    sleep "${interval}"
    index=$((index + 1))
  done

  echo "[错误] 健康检查失败: ${url}" >&2
  if [[ -n "${last_error}" ]]; then
    echo "${last_error}" >&2
  fi
  exit 1
}

deploy() {
  local health_url
  health_url="${1:-${DEFAULT_HEALTH_URL}}"
  ensure_env
  build_gateway
  restart_service
  health_check "${health_url}"
}

run_local() {
  ensure_env
  ensure_tsx_bin
  echo "[信息] 前台运行 gateway（Ctrl+C 退出）"
  "${TSX_BIN}" "${REPO_ROOT}/apps/gateway/src/index.ts"
}

main() {
  local cmd
  cmd="${1:-}"
  case "${cmd}" in
    ensure-env)
      ensure_env
      ;;
    build)
      build_gateway
      ;;
    install-service)
      install_service "${2:-}"
      ;;
    uninstall-service)
      uninstall_service
      ;;
    start)
      start_service
      ;;
    stop)
      stop_service
      ;;
    restart)
      restart_service
      ;;
    status)
      status_service
      ;;
    logs)
      logs_service "${2:-}"
      ;;
    logs-clear)
      logs_clear
      ;;
    health)
      health_check "${2:-}"
      ;;
    deploy)
      deploy "${2:-}"
      ;;
    run-local)
      run_local
      ;;
    -h|--help|help|"")
      usage
      ;;
    *)
      echo "[错误] 未知命令: ${cmd}" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
