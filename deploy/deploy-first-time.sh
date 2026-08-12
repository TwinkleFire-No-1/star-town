#!/bin/bash
# ==========================================================
# 星火小镇 (SparkTown) — 一键部署脚本
# 适用于：全新环境首次部署，也兼容已有环境的更新部署（幂等）
#
# 用法：
#   ./deploy/deploy-first-time.sh                                    # 完整部署（构建+启动+验证）
#   RESET=1 ./deploy/deploy-first-time.sh                            # 从零启动：清空容器+数据卷后全新部署
#   NPM_REGISTRY=https://registry.npmjs.org ./deploy/deploy-first-time.sh  # 指定 npm 镜像
#   SKIP_BUILD=1 ./deploy/deploy-first-time.sh                       # 跳过构建，仅启动/更新
#   SKIP_VERIFY=1 ./deploy/deploy-first-time.sh                      # 跳过最后的 HTTP 验证
#
# 从零启动也可直接使用精简封装: ./scripts/start-from-scratch.sh
#
# 前置要求：
#   - 已安装 Docker（Docker Desktop / OrbStack / 服务器 Docker Engine）
#   - 已配置 .env（缺失时自动从 .env.example 复制；LLM_API_KEY 必须填写）
#   - 可访问外网拉取镜像（国内可预先配置镜像加速）
# ==========================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ---------- 基础输出辅助 ----------
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ---------- 1. 探测 docker CLI ----------
detect_docker() {
  if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    DOCKER=docker
  elif [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then
    # macOS Docker Desktop CLI（PATH 中符号链接损坏时兜底）
    DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker
  elif [ -x /usr/local/bin/docker ]; then
    DOCKER=/usr/local/bin/docker
  elif [ -x /opt/homebrew/bin/docker ]; then
    DOCKER=/opt/homebrew/bin/docker
  else
    error "未找到可用的 docker 命令，请先安装并启动 Docker（Desktop/Engine/OrbStack）"
  fi
  info "使用 Docker CLI: $DOCKER"

  # 确认 docker daemon 可用
  "$DOCKER" info &>/dev/null || error "Docker daemon 未运行，请先启动 Docker 后重试"
  # 确认 compose v2 可用
  "$DOCKER" compose version &>/dev/null || error "docker compose (v2) 不可用，请升级 Docker"
}

# ---------- 2. 环境变量准备 ----------
setup_env() {
  if [ ! -f "$ROOT/.env" ]; then
    warn "未找到 .env，已从 .env.example 自动生成，请填写 LLM_API_KEY 后重新运行"
    cp "$ROOT/.env.example" "$ROOT/.env"
    exit 1
  fi
  # 校验 LLM_API_KEY 已填写且未使用 .env.example 的占位符
  # 占位符 sk-your-api-key-here 也以 sk- 开头，必须显式排除，否则从 .env.example 复制后会被误判为有效
  if ! grep -qE '^LLM_API_KEY="?sk-' "$ROOT/.env" 2>/dev/null \
     || grep -qE '^LLM_API_KEY="?sk-your-api-key' "$ROOT/.env" 2>/dev/null; then
    error "请先在 .env 中填写有效的 LLM_API_KEY（形如 sk-xxxx，硅基流动等平台获取）"
  fi
  info "环境变量检查通过（LLM_API_KEY 已配置）"
}

# ---------- 3. 端口占用检查（best-effort 提示） ----------
check_port() {
  local port="$1" desc="$2"
  if command -v lsof &>/dev/null; then
    # 去掉表头行；排除 Docker 自身的端口转发进程（com.docker / docker-proxy）
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 | grep -Evq 'com\.docke|docker-proxy'; then
      warn "端口 $port（$desc）已被其他进程占用，请调整 .env 中对应端口后重试"
    fi
  fi
}

# ---------- 4. 清理旧版遗留容器 ----------
# 兼容早期"手动 docker run"部署的容器：无 compose 标签，会导致容器名冲突
cleanup_stale_container() {
  local name="$1"
  if "$DOCKER" ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$name"; then
    local proj
    proj="$("$DOCKER" inspect "$name" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)"
    if [ -z "$proj" ]; then
      warn "发现旧版遗留容器 $name（非 compose 管理），自动移除后重建"
      "$DOCKER" rm -f "$name" >/dev/null
    fi
  fi
}

# ---------- 4.5 全量重置（从零启动） ----------
# RESET=1 时清空全部容器、数据卷与孤儿容器，得到干净的数据库与 Redis 状态
reset_all() {
  if [ "${RESET:-0}" = "1" ]; then
    warn "RESET=1：清空全部容器与数据卷（PostgreSQL/Redis 数据将被删除）"
    "$DOCKER" compose --profile production down -v --remove-orphans 2>/dev/null || true
    info "旧容器、数据卷与孤儿容器已清理"
  fi
}

# ---------- 5. 构建 ----------
build_images() {
  if [ "${SKIP_BUILD:-0}" = "1" ]; then
    warn "SKIP_BUILD=1，跳过镜像构建"
    return
  fi
  info "开始构建 server / client 生产镜像（首次构建较慢，请耐心等待）..."
  # 仅当用户显式传入 NPM_REGISTRY 时保留；否则以 .env/compose 默认值为准
  if [ -z "${NPM_REGISTRY+x}" ]; then
    unset NPM_REGISTRY
  fi
  "$DOCKER" compose build server client
  info "镜像构建完成"
}

# ---------- 6. 启动生产模式 ----------
start_services() {
  # 消除 shell 环境变量对 compose 的干扰（如 SERVER_PORT=4397 残留导致端口冲突），以 .env 为准
  if [ -z "${NPM_REGISTRY+x}" ]; then unset NPM_REGISTRY || true; fi
  unset SERVER_PORT CLIENT_PORT || true

  cleanup_stale_container star-town-client
  cleanup_stale_container star-town-server

  info "启动生产服务（PostgreSQL / Redis / Server / Client）..."
  "$DOCKER" compose --profile production up -d
}

# ---------- 7. 等待全部容器健康 ----------
wait_healthy() {
  info "等待服务健康检查通过..."
  local names=("star-town-server" "star-town-client" "star-town-db" "star-town-redis")
  local i
  for i in $(seq 1 40); do
    local all_ok=1
    for n in "${names[@]}"; do
      local st
      st="$("$DOCKER" inspect "$n" --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)"
      if [ "$st" != "healthy" ]; then
        all_ok=0
        break
      fi
    done
    if [ "$all_ok" = "1" ]; then
      info "全部服务健康 ✅"
      return 0
    fi
    if [ "$st" = "unhealthy" ]; then
      error "容器 $n 健康检查失败，请查看日志: $DOCKER logs $n"
    fi
    sleep 3
  done
  error "等待健康检查超时，请查看容器日志: $DOCKER compose logs --tail=100 server"
}

# ---------- 8. HTTP 验证 ----------
# 注意：本机若有 HTTP 代理环境变量，访问本地服务会误报 502，故显式绕过代理
# 从 .env 解析对外端口（无配置时用默认值）
resolve_ports() {
  local raw
  raw="$(grep -E '^SERVER_PORT=' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' || true)"
  SERVER_PORT_FINAL="${raw:-4000}"
  raw="$(grep -E '^CLIENT_PORT=' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' || true)"
  CLIENT_PORT_FINAL="${raw:-80}"
}

verify() {
  if [ "${SKIP_VERIFY:-0}" = "1" ]; then
    warn "SKIP_VERIFY=1，跳过 HTTP 验证"
    return
  fi
  info "验证后端 API: http://127.0.0.1:${SERVER_PORT_FINAL}/api/health"
  curl --noproxy '*' -sf -m 15 "http://127.0.0.1:${SERVER_PORT_FINAL}/api/health" >/dev/null \
    || error "后端 API 验证失败，请检查 server 日志"
  info "验证前端页面: http://127.0.0.1:${CLIENT_PORT_FINAL}/"
  curl --noproxy '*' -sf -m 15 -o /dev/null "http://127.0.0.1:${CLIENT_PORT_FINAL}/" \
    || error "前端页面验证失败，请检查 client 日志"
  info "HTTP 验证通过 ✅"
}

# ---------- 主流程 ----------
main() {
  echo ""
  echo "=============================================="
  echo "  星火小镇 (SparkTown) 一键部署"
  echo "=============================================="
  echo ""

  detect_docker
  setup_env
  reset_all
  resolve_ports
  check_port "$SERVER_PORT_FINAL" "后端 API(可改 SERVER_PORT)"
  check_port "$CLIENT_PORT_FINAL" "前端页面(可改 CLIENT_PORT)"
  build_images
  start_services
  wait_healthy
  verify

  echo ""
  echo "=============================================="
  info "部署完成！"
  echo "  前端页面 : http://<服务器IP>:${CLIENT_PORT_FINAL}"
  echo "  后端API  : http://<服务器IP>:${SERVER_PORT_FINAL}/api/health"
  echo "  容器日志 : $DOCKER compose logs -f"
  echo "=============================================="
  echo ""
  info "日常更新：重新构建并滚动更新 = $DOCKER compose --profile production up -d --build"
}

main "$@"
