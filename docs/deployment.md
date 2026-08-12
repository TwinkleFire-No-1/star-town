---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '505e1c0b-e0c2-4d1b-9965-859aff52b11a'
  PropagateID: '505e1c0b-e0c2-4d1b-9965-859aff52b11a'
  ReservedCode1: '8146b07d-9469-4774-b068-b8834a17f87f'
  ReservedCode2: '8146b07d-9469-4774-b068-b8834a17f87f'
---

# 星火小镇 — 部署运维文档

> 生产环境部署指南、监控方案、备份策略、故障排查手册

---

## 目录

1. [部署架构](#1-部署架构)
2. [部署步骤](#2-部署步骤)
3. [环境变量配置](#3-环境变量配置)
4. [Nginx 配置](#4-nginx-配置)
5. [SSL/TLS 配置](#5-ssltls-配置)
6. [CI/CD 流水线](#6-cicd-流水线)
7. [监控与日志](#7-监控与日志)
8. [备份与恢复](#8-备份与恢复)
9. [扩容方案](#9-扩容方案)
10. [故障排查](#10-故障排查)
11. [安全加固](#11-安全加固)

---

## 1. 部署架构

```
                    ┌─────────────┐
                    │   用户浏览器  │
                    └──────┬──────┘
                           │ HTTPS
                    ┌──────▼──────┐
                    │    Nginx     │ ← 负载均衡 / SSL 终结 / 静态资源
                    └──┬───────┬──┘
                       │       │
              ┌────────▼──┐ ┌──▼────────┐
              │ client 容器 │ │ server 容器 │
              │ (React 静态) │ │ (Express)  │
              └───────────┘ └──┬──────┬───┘
                               │      │
                    ┌──────────▼──┐ ┌─▼──────────┐
                    │ PostgreSQL  │ │   Redis     │
                    │  (pgvector) │ │  (会话缓存) │
                    └─────────────┘ └─────────────┘
```

### 容器清单

| 容器 | 镜像 | 端口 | 健康检查 |
|------|------|------|----------|
| star-town-db | pgvector/pgvector:pg16 | 5432 | `pg_isready -U sparktown` |
| star-town-redis | redis:7-alpine | 6379 | `redis-cli ping` |
| star-town-server | 自建 Dockerfile | 4000 | `GET /api/health` |
| star-town-client | 自建 Dockerfile | 80 | `wget http://localhost:80/` |

---

## 2. 部署步骤

### 2.1 首次部署

```bash
# 1. 克隆仓库
git clone <repo-url> /opt/star-town
cd /opt/star-town

# 2. 配置环境变量
cp .env.example .env
vi .env  # 填入 LLM_API_KEY 等配置

# 3. 启动所有服务
docker compose --profile production up -d

# 4. 等待服务就绪
until curl -s http://localhost:4000/api/health | grep -q ok; do sleep 2; done

# 5. 验证部署
curl http://localhost/api/health
curl http://localhost/api/npcs | python3 -m json.tool | head -20
```

### 2.2 更新部署

```bash
# 拉取最新镜像
docker compose --profile production pull

# 滚动更新（先创建新容器再销毁旧的）
docker compose --profile production up -d --no-deps --build server
docker compose --profile production up -d --no-deps --build client

# 验证
curl http://localhost/api/health
```

### 2.3 回滚

```bash
# 查看镜像历史
docker images | grep star-town

# 回退到指定版本
docker tag ghcr.io/<repo>-server:v1.0.0 ghcr.io/<repo>-server:latest
docker compose --profile production up -d --no-deps server
```

---

## 3. 环境变量配置

### 3.1 必须配置

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://sparktown:PASS@db:5432/sparktown` |
| `LLM_API_BASE` | LLM API 端点 | `https://api.openai.com/v1` |
| `LLM_API_KEY` | LLM API 密钥 | `sk-...` |

### 3.2 生产环境推荐修改

| 变量 | 默认值 | 生产建议 | 说明 |
|------|--------|----------|------|
| `POSTGRES_PASSWORD` | `sparktown_dev` | 使用强密码 | 数据库密码 |
| `GAME_TIME_SCALE` | `48` | 按需调整 | 游戏时间倍速 |
| `MAX_ONLINE_PLAYERS` | `100` | 按服务器配置 | 最大在线数 |

### 3.3 Docker Compose 环境变量

生产环境通过 `docker-compose.yml` 中的 `environment` 字段传入，也可在项目根目录 `.env` 文件中设置：

```bash
# .env（项目根目录，Docker Compose 会自动读取）
LLM_API_KEY=sk-your-production-key
POSTGRES_PASSWORD=your-strong-password
```

---

## 4. Nginx 配置

### 4.1 容器内 Nginx (`client/nginx.conf`)

用于 Docker 容器内部，直接代理到 server 容器：

```nginx
# API → server:4000
location /api/ { proxy_pass http://server:4000; }
# WebSocket → server:4000
location /socket.io/ { proxy_pass http://server:4000; ... upgrade headers }
# SPA 路由
location / { try_files $uri /index.html; }
```

### 4.2 生产 Nginx (`deploy/nginx/sparktown.conf`)

部署到独立 Nginx 服务器或负载均衡器：

- HTTP → HTTPS 301 重定向
- SSL/TLS 配置（TLS 1.2+）
- 安全响应头（X-Frame-Options, CSP 等）
- API 限流（burst=20）
- WebSocket 长连接（86400s）
- Gzip 压缩
- 静态资源长缓存（1年）

部署方式：

```bash
# 将配置复制到 Nginx 配置目录
sudo cp deploy/nginx/sparktown.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 5. SSL/TLS 配置

### 5.1 Let's Encrypt（推荐）

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 自动获取并配置证书
sudo certbot --nginx -d sparktown.example.com

# 自动续期（certbot 默认安装定时任务）
sudo certbot renew --dry-run
```

### 5.2 自签名证书（开发/测试）

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/privkey.pem \
  -out /etc/nginx/ssl/fullchain.pem \
  -subj "/CN=localhost"
```

---

## 6. CI/CD 流水线

### 6.1 流水线结构

```
push to main/develop
  ├── build-client  (Node 20, tsc, vite build)
  ├── build-server  (Node 20, prisma generate, tsc build)
  └── (仅tag) docker-publish
       └── (仅tag) deploy (SSH到生产服务器)
```

### 6.2 配置 GitHub Secrets

在仓库 Settings → Secrets and variables → Actions 中配置：

| Secret | 说明 |
|--------|------|
| `DEPLOY_HOST` | 生产服务器 IP |
| `DEPLOY_USER` | SSH 用户名 |
| `DEPLOY_SSH_KEY` | SSH 私钥 |
| `DEPLOY_PATH` | 部署目录（如 `/opt/star-town`） |

### 6.3 发布流程

```bash
# 1. 打 tag 触发部署
git tag v1.0.0
git push origin v1.0.0

# 2. GitHub Actions 自动：
#    - 构建前端+后端
#    - 构建Docker镜像并推送到GHCR
#    - SSH到生产服务器执行 docker compose pull && up -d
```

---

## 7. 监控与日志

### 7.1 容器日志

```bash
# 查看所有服务日志
docker compose --profile production logs -f

# 查看特定服务
docker compose --profile production logs -f server
docker compose --profile production logs -f client

# 查看最近100行
docker compose --profile production logs --tail 100 server
```

### 7.2 健康检查端点

| 端点 | 说明 | 预期响应 |
|------|------|----------|
| `GET /api/health` | 后端健康 | `{"status":"ok"}` |
| `GET /api/llm/health` | LLM 服务状态 | 模型可用信息 |
| `GET /api/llm/usage` | Token 用量统计 | 用量详情 |

### 7.3 运行统计端点

| 端点 | 说明 |
|------|------|
| `GET /api/items/stats` | 物品服务统计 |
| `GET /api/llm/cache/stats` | LLM 缓存统计 |
| `GET /api/llm/scheduler/stats` | NPC 调度器统计 |
| `GET /api/llm/latency/stats` | 延迟优化统计 |
| `GET /api/llm/fallback/stats` | 降级策略统计 |
| `GET /api/llm/rate-limit/stats` | 速率限制统计 |
| `GET /api/battle/stats` | 战斗引擎统计 |
| `GET /api/quest/stats` | 任务引擎统计 |
| `GET /api/relations/stats` | 关系网络统计 |

### 7.4 生产环境验证脚本

```bash
chmod +x scripts/verify-production.sh
./scripts/verify-production.sh
# 检查项：文件完整性、Docker配置、Dockerfile最佳实践、Nginx配置、CI/CD、TypeScript编译、环境变量、安全性、数据库
```

### 7.5 推荐监控方案

| 层级 | 工具 | 说明 |
|------|------|------|
| 容器 | cAdvisor + Prometheus | 容器资源监控 |
| 应用 | 自定义 /stats 端点 | 业务指标 |
| 日志 | Docker logging driver → ELK/Loki | 集中式日志 |
| 告警 | Grafana Alerting | 基于指标阈值 |

---

## 8. 备份与恢复

### 8.1 数据库备份

```bash
# 手动备份
docker exec star-town-db pg_dump -U sparktown sparktown > backup_$(date +%Y%m%d_%H%M%S).sql

# 定时备份（crontab）
0 2 * * * docker exec star-town-db pg_dump -U sparktown sparktown | gzip > /opt/backups/sparktown_$(date +\%Y\%m\%d).sql.gz
```

### 8.2 数据库恢复

```bash
# 停止应用
docker compose --profile production stop server

# 恢复数据
cat backup_20260730.sql | docker exec -i star-town-db psql -U sparktown sparktown

# 重启应用
docker compose --profile production start server
```

### 8.3 Redis 备份

Redis 使用 RDB 持久化（默认启用），数据文件在 Docker volume `redisdata` 中。

```bash
# 手动触发 RDB 快照
docker exec star-town-redis redis-cli BGSAVE

# 备份 RDB 文件
docker cp star-town-redis:/data/dump.rdb ./redis_backup_$(date +%Y%m%d).rdb
```

### 8.4 完整环境恢复

```bash
# 1. 启动基础设施
docker compose up -d postgres redis

# 2. 等待就绪
until docker exec star-town-db pg_isready -U sparktown; do sleep 1; done

# 3. 恢复数据库
cat backup.sql | docker exec -i star-town-db psql -U sparktown sparktown

# 4. 启动应用
docker compose --profile production up -d
```

---

## 9. 扩容方案

### 9.1 垂直扩容

| 资源 | 当前 | 建议配置 |
|------|------|----------|
| CPU | 2核 | 4-8核（支持12+ NPC并发） |
| 内存 | 4GB | 8-16GB（向量索引占用） |
| 磁盘 | 20GB | 50GB+ SSD（pgvector索引） |

### 9.2 水平扩容

**后端多实例：**

```yaml
# docker-compose.yml 增加 server 副本
server:
  deploy:
    replicas: 2
  # 需配合 Redis 存储 Socket.IO 会话（sticky session）
```

**数据库读副本：**

```yaml
# 添加 PostgreSQL 只读副本
postgres-replica:
  image: pgvector/pgvector:pg16
  environment:
    PGHOST: postgres
  # 配置流复制
```

### 9.3 NPC 调度性能调优

NPC 调度器支持分级更新策略：

- **高频**（10s）：玩家附近 NPC
- **中频**（30s）：当前区域 NPC
- **低频**（60s）：远处 NPC

通过 `/api/llm/scheduler/stats` 查看调度性能。

---

## 10. 故障排查

### 10.1 常见问题速查

| 症状 | 可能原因 | 排查步骤 |
|------|----------|----------|
| 页面白屏 | 前端构建失败 | `docker compose logs client` |
| NPC 不回复 | LLM API 不可用 | `curl /api/llm/health` |
| WebSocket 断连 | Nginx 配置问题 | 检查 `/socket.io/` 代理配置 |
| 数据库连接失败 | PG 未就绪 | `docker exec star-town-db pg_isready` |
| Redis 降级 | Redis 未启动 | `docker exec star-town-redis redis-cli ping` |
| 战斗卡住 | 状态机异常 | `curl /api/battle/stats` |
| 对话延迟高 | LLM 缓存未命中 | `curl /api/llm/cache/stats` |

### 10.2 日志级别调试

```bash
# 后端详细日志
docker compose --profile production logs -f server 2>&1 | grep -i error

# 前端访问日志
docker compose --profile production logs -f client

# 数据库慢查询
docker exec star-town-db psql -U sparktown -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
```

### 10.3 数据库诊断

```bash
# 连接数
docker exec star-town-db psql -U sparktown -c "SELECT count(*) FROM pg_stat_activity;"

# 表大小
docker exec star-town-db psql -U sparktown -c "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC;"

# 索引使用情况
docker exec star-town-db psql -U sparktown -c "SELECT indexrelname, idx_scan FROM pg_stat_user_indexes;"
```

### 10.4 LLM 服务诊断

```bash
# 健康检查
curl -s http://localhost:4000/api/llm/health | python3 -m json.tool

# Token 使用量
curl -s http://localhost:4000/api/llm/usage | python3 -m json.tool

# 缓存命中率
curl -s http://localhost:4000/api/llm/cache/stats | python3 -m json.tool

# 调度器状态
curl -s http://localhost:4000/api/llm/scheduler/stats | python3 -m json.tool
```

---

## 11. 安全加固

### 11.1 网络安全

- 启用 HTTPS（TLS 1.2+）
- API 限流（Nginx `limit_req`）
- 安全响应头（CSP, X-Frame-Options 等）
- WebSocket 仅允许 `/socket.io/` 路径

### 11.2 数据安全

- 数据库密码不使用默认值
- `.env` 文件不提交到版本控制
- API Key 通过环境变量/Docker Secrets 注入
- 定期数据库备份

### 11.3 容器安全

- 多阶段构建，最终镜像不含源码和 dev 依赖
- 建议使用非 root 用户运行（需额外配置 USER 指令）
- 定期更新基础镜像（`node:20-alpine`, `nginx:alpine`）
- Docker Content Trust 验证镜像签名

### 11.4 应用安全

- LLM API 速率限制（防止 Token 滥用）
- 输入校验（Express 中间件）
- SQL 注入防护（Prisma 参数化查询）
- WebSocket 连接认证（生产环境建议添加 JWT 验证）

---

## 运维检查清单

### 每日

- [ ] 检查 `/api/health` 返回正常
- [ ] 检查容器运行状态 `docker ps`
- [ ] 检查错误日志 `docker compose logs --since 24h server | grep -i error`

### 每周

- [ ] 检查磁盘空间 `df -h`
- [ ] 检查数据库大小
- [ ] 查看 LLM Token 用量 `/api/llm/usage`
- [ ] 运行生产验证脚本 `./scripts/verify-production.sh`

### 每月

- [ ] 更新基础镜像版本
- [ ] 检查 SSL 证书过期时间
- [ ] 审查数据库备份可恢复性
- [ ] 审查安全日志

---

> AI生成