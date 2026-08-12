# === 构建阶段 ===
FROM node:20-slim AS builder

WORKDIR /app

# 替换为国内镜像源并安装 openssl
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null; \
    apt-get update -qq && \
    apt-get install -qq --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*

# npm 镜像参数（默认使用淘宝镜像加速国内构建；海外 CI 可传 --build-arg NPM_REGISTRY=https://registry.npmjs.org）
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm config set registry "$NPM_REGISTRY"
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

# 复制依赖文件
COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN for i in 1 2 3; do npx prisma generate && break || (echo "prisma generate retry $i" && sleep 5); done

# 编译主代码
RUN npm run build

# === 运行阶段 ===
FROM node:20-slim AS runner

WORKDIR /app

# 运行阶段：替换为国内镜像源并安装 openssl + curl（healthcheck 需要）
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null; \
    apt-get update -qq && \
    apt-get install -qq --no-install-recommends openssl curl && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# ★ 运行阶段：配置 npm 镜像（与构建阶段一致）
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm config set registry "$NPM_REGISTRY"
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

# 复制依赖文件并安装生产依赖
COPY package.json package-lock.json ./
# --no-save 避免安装 tsx 时污染 package.json / package-lock.json
RUN npm ci --omit=dev && npm install --no-save tsx

# 复制 Prisma 相关文件（schema + migrations + 生成的客户端）
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

COPY --from=builder /app/dist ./dist

# 复制 NPC 档案 JSON（profileLoader 运行时从 server/data 目录读取）
COPY --from=builder /app/data ./server/data

# 复制 entrypoint 脚本
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 4000

# 健康检查（使用 127.0.0.1 避免 localhost 解析到 IPv6 导致连接被拒）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:4000/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
