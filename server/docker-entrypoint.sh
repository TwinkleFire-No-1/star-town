#!/bin/sh
set -e

echo "[Entrypoint] Waiting for database to be ready..."
# 给 PostgreSQL 额外一点启动时间（healthcheck 可能已通过但数据库尚未完全就绪）
sleep 2

echo "[Entrypoint] Running database migrations..."
npx prisma migrate deploy
echo "[Entrypoint] Migrations applied successfully"

echo "[Entrypoint] Seeding database (idempotent)..."
# 使用 tsx 执行 seed 脚本
# 如果数据已存在（unique约束冲突），seed 会失败，这是正常的
npx tsx prisma/seed.ts 2>/dev/null && echo "[Entrypoint] Seed completed" || echo "[Entrypoint] Seed skipped (data may already exist)"

echo "[Entrypoint] Starting server..."
exec node dist/index.js
