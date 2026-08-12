type LogLevel = 'info' | 'warn' | 'error' | 'debug'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

export function createLogger(prefix: string) {
  return {
    info: (msg: string, ...args: unknown[]) => {
      if (shouldLog('info')) console.log(`[${prefix}] ${msg}`, ...args)
    },
    warn: (msg: string, ...args: unknown[]) => {
      if (shouldLog('warn')) console.warn(`[${prefix}] ${msg}`, ...args)
    },
    error: (msg: string, ...args: unknown[]) => {
      if (shouldLog('error')) console.error(`[${prefix}] ${msg}`, ...args)
    },
    debug: (msg: string, ...args: unknown[]) => {
      if (shouldLog('debug')) console.debug(`[${prefix}] ${msg}`, ...args)
    },
  }
}
