#!/bin/bash
# ==========================================================
# 星火小镇 (SparkTown) — 部署统一入口
#
# 支持两种模式：
#   restart  重启/更新部署（默认）：保留数据库与 Redis 数据，
#            重新构建镜像并重启服务。适合日常更新代码后使用。
#   fresh    从头部署：清空全部容器与数据卷（数据库/Redis 数据会丢失），
#            构建后全新部署。适合换服务器 / 想彻底重置环境时使用。
#
# 用法：
#   ./deploy/deploy.sh restart
#   ./deploy/deploy.sh fresh
#   NPM_REGISTRY=xxx ./deploy/deploy.sh restart   # 指定 npm 镜像
#   SKIP_BUILD=1 ./deploy/deploy.sh restart        # 跳过构建（已有镜像）
#   SKIP_VERIFY=1 ./deploy/deploy.sh restart       # 跳过最终 HTTP 验证
#
# 说明：本脚本是对 deploy/deploy-first-time.sh 的轻量封装，
#       复用其环境检查/构建/启动/健康等待/HTTP 验证等完整流程。
# ==========================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_SCRIPT="$ROOT/deploy/deploy-first-time.sh"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
星火小镇 (SparkTown) 部署脚本

用法:
  ./deploy/deploy.sh <mode>

模式:
  restart   重启/更新部署（默认）：保留数据库数据，重新构建镜像并重启服务
  fresh     从头部署：清空容器与数据卷（数据库/Redis 数据将丢失）后全新部署

可选环境变量（透传到底层部署脚本）:
  NPM_REGISTRY=xxx   指定 npm 镜像（默认使用 .env / compose 配置）
  SKIP_BUILD=1       跳过镜像构建（已有最新镜像时）
  SKIP_VERIFY=1      跳过最终 HTTP 验证

示例:
  ./deploy/deploy.sh restart          # 日常更新：重新构建并重启
  ./deploy/deploy.sh fresh            # 全新部署：清空数据后重建
  SKIP_BUILD=1 ./deploy/deploy.sh restart   # 仅重启容器（不重新构建）
EOF
  exit 0
}

# ---------- 解析模式 ----------
MODE="${1:-restart}"
case "$MODE" in
  restart)
    export RESET=0
    info "模式：restart — 重启/更新部署（保留数据，重新构建镜像）"
    ;;
  fresh)
    export RESET=1
    warn "模式：fresh — 从头部署（将清空全部容器与数据卷，数据库/Redis 数据会丢失！）"
    ;;
  --help|-h|-help)
    usage
    ;;
  *)
    error "未知模式: $MODE（支持 restart / fresh）"
    ;;
esac

# ---------- 前置检查 ----------
if [ ! -f "$BASE_SCRIPT" ]; then
  error "未找到底层部署脚本: $BASE_SCRIPT"
fi

# ---------- 执行底层部署流程 ----------
# 透传环境变量（NPM_REGISTRY / SKIP_BUILD / SKIP_VERIFY 等由调用方提供）
exec "$BASE_SCRIPT"
