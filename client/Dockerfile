# 星火小镇 — 前端 Dockerfile
# 多阶段构建：构建阶段 + Nginx服务阶段

# === 构建阶段 ===
FROM node:20-alpine AS builder

# npm 镜像参数（国内构建可传 --build-arg NPM_REGISTRY=https://registry.npmmirror.com）
ARG NPM_REGISTRY=
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi

WORKDIR /app

# 复制依赖文件（先复制以利用 Docker 缓存层）
COPY package.json package-lock.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建前端（输出到 dist/）
RUN npm run build

# === Nginx服务阶段 ===
FROM nginx:alpine AS runner

# 移除默认配置
RUN rm /etc/nginx/conf.d/default.conf

# 复制自定义Nginx配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 复制构建产物到Nginx服务目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 健康检查（使用 127.0.0.1 避免 localhost 解析到 IPv6 导致连接被拒）
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

# 启动Nginx
CMD ["nginx", "-g", "daemon off;"]
