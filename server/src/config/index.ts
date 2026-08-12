export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  game: {
    timeScale: parseInt(process.env.GAME_TIME_SCALE || '48', 10),
    maxOnlinePlayers: parseInt(process.env.MAX_ONLINE_PLAYERS || '100', 10),
  },
  llm: {
    apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'deepseek-ai/DeepSeek-V4-Flash',
    embedModel: process.env.LLM_EMBED_MODEL || 'BAAI/bge-m3',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  cors: {
    // CORS 允许的来源（逗号分隔）。开发环境 Vite(3000/5173)；生产环境走 Nginx 同源代理，无需额外来源
    origins: (process.env.CORS_ORIGINS ||
      'http://localhost:3000,http://localhost:5173,http://localhost,http://127.0.0.1')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
}
