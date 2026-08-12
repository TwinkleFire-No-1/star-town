import { createLogger } from './logger.js'

/**
 * 通用API响应封装
 */
export function apiResponse<T>(data: T, message = 'success') {
  return { ok: true, data, message }
}

export function apiError(message: string, code = 400) {
  return { ok: false, error: { message, code } }
}

export { createLogger }
