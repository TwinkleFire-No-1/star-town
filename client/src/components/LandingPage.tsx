import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import './LandingPage.css'

/**
 * LandingPage — 游戏登录页（星露谷像素风）
 *
 * 多租户入口：
 * - 注册：输入用户名创建新档案
 * - 登录：输入已注册用户名恢复进度
 * - 成功后将 token/玩家信息写入 authStore → 进入游戏
 */
export function LandingPage() {
  const [username, setUsername] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const restore = useAuthStore((s) => s.restore)

  // 进入页面时静默恢复（token 有效则直接进入游戏）
  useEffect(() => {
    void restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = username.trim()
    if (!name) {
      setError('请输入用户名')
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (mode === 'register') {
        await register(name)
      } else {
        await login(name)
      }
      // 登录成功后 App 检测到认证状态自动渲染游戏
    } catch (err) {
      setError((err as Error).message || '操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="landing-page">
      {/* 背景装饰：星空 + 草地 */}
      <div className="landing-bg">
        <div className="stars" />
        <div className="moon" />
        <div className="hills" />
        <div className="ground" />
        <div className="trees" />
      </div>

      {/* 中央面板 */}
      <div className="landing-content">
        {/* 游戏 Logo */}
        <header className="game-logo">
          <h1 className="logo-title">
            星火<span className="logo-accent">小镇</span>
          </h1>
          <p className="logo-subtitle">SparkTown · 像素冒险RPG</p>
          <div className="logo-divider">
            <span>✦</span>
            <span className="divider-line" />
            <span>✦</span>
          </div>
        </header>

        {/* 注册/登录表单 */}
        <section className="auth-panel">
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login')
                setError(null)
              }}
            >
              登录
            </button>
            <button
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setMode('register')
                setError(null)
              }}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="auth-label" htmlFor="username">
              {mode === 'register' ? '创建冒险者' : '欢迎回来，冒险者'}
            </label>
            <input
              id="username"
              className="auth-input"
              type="text"
              placeholder="输入用户名（2-16位）"
              value={username}
              maxLength={16}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
            {error && <p className="auth-error">{error}</p>}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? '正在进入小镇…' : mode === 'register' ? '进入星火小镇' : '重返星火小镇'}
            </button>
            <p className="auth-hint">
              {mode === 'register'
                ? '注册后你的进度将保存，下次登录可继续冒险'
                : '将根据用户名恢复你的冒险进度'}
            </p>
          </form>
        </section>

        <footer className="landing-footer">
          <p>每个用户名都是一段独立旅程 · 进度自动保存</p>
        </footer>
      </div>
    </div>
  )
}
