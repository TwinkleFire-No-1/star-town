// 星火小镇 — 氛围NPC（amb_ 前缀）大模型对话服务
// 需求：氛围NPC也接入大模型（不参与主线剧情），平时头顶仍按设定好的预设气泡台词显示。
// 设计：
// - amb_ NPC 仍是内存实体（不走完整 Agent 循环/记忆/好感度，控制成本）
// - 交互时走 LLM 流式对话：基于 NPC 的 name/title/台词库构造轻量人设 prompt
// - 对话历史按 (npcId, playerId) 在内存中保留最近 N 轮
// - LLM 失败时回退到固定台词（pickGreeting/pickReply），保证对话不断线
// - 不触发 questEngine.triggerNpcTalk → 不参与主线剧情

import { ambientNpcService, type AmbientNpcDef } from './ambientNpcService.js'
import { modelRouter, ModelPurpose } from './modelRouter.js'
import { llmService } from './llmService.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('AmbientDialogue')

/** 场景中文名（prompt 注入用） */
const SCENE_NAMES: Record<string, string> = {
  town: '星火小镇的广场',
  blacksmith: '铁砧工坊',
  alchemist: '魔法药剂店',
  tavern: '星光酒馆',
  market: '集市',
  residential: '温馨小屋',
  forest: '低语森林',
  mine: '废弃矿洞',
}

interface HistoryEntry {
  role: 'player' | 'npc'
  content: string
}

/** 最大保留历史条数（每轮=玩家+NPC两条，保留最近5轮） */
const MAX_HISTORY = 10

/** 气泡台词池：一次 LLM 调用生成多条，轮换提供避免重复（池大些，减少刷新频率） */
const BUBBLE_POOL_SIZE = 8
/** 台词池有效期（10 分钟），过期后重新生成（控制 LLM 成本） */
const BUBBLE_POOL_TTL = 10 * 60 * 1000

/** 气泡台词池 */
interface BubblePool {
  lines: string[]
  idx: number
  at: number
}

class AmbientDialogueService {
  /** 对话历史缓存: key = `${npcId}:${playerId}` */
  private histories = new Map<string, HistoryEntry[]>()

  /** 气泡台词池缓存: key = npcId */
  private bubblePools = new Map<string, BubblePool>()

  /**
   * 构造人设 System Prompt
   */
  private buildSystemPrompt(npc: AmbientNpcDef): string {
    const sceneName = SCENE_NAMES[npc.scene ?? 'town'] ?? '星火小镇'
    const traits = [
      npc.greetings.length > 0 ? `打招呼口头禅：${npc.greetings.slice(0, 3).join(' / ')}` : '',
      npc.bubbles.length > 0 ? `闲时常念叨：${npc.bubbles.slice(0, 4).join(' / ')}` : '',
    ].filter(Boolean).join('\n')

    return `你是${npc.name}（${npc.title}），${sceneName}里一个普普通通的居民。你不是AI助手，你是活生生的小镇居民。
## 人设约束（必须严格遵守）
1. 始终以${npc.name}的第一人称说话，永远不要承认自己是AI或程序
2. 你就是个普通路人：聊聊日常琐事、邻里八卦、天气买卖，说话简短自然（1-2句话），不要长篇大论
3. 你不参与任何主线剧情：玩家提到任务/冒险/暗影/主线时，你表示不清楚或建议去找酒馆老板娘/长老打听
4. 保持${npc.title}的身份感，以下是你的性格台词参考：
${traits}
5. 回复只用中文，不要使用Markdown或表情符号。
6. 直接给出最终回答，绝对不要输出任何思考过程、分析或草稿，也不要复述我的指令。`
  }

  /**
   * 构造对话消息列表（系统人设 + 历史 + 当前消息）
   */
  private buildMessages(
    npc: AmbientNpcDef,
    playerName: string,
    message: string,
    history: HistoryEntry[],
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: this.buildSystemPrompt(npc) },
    ]
    for (const entry of history.slice(-MAX_HISTORY)) {
      messages.push({
        role: entry.role === 'player' ? 'user' : 'assistant',
        content: entry.role === 'player' ? `${playerName}：${entry.content}` : entry.content,
      })
    }
    messages.push({ role: 'user', content: `${playerName}：${message}` })
    return messages
  }

  /**
   * 清洗模型输出：剔除思考过程类内容，只保留自然对话
   * 推理模型可能把思考过程混入 content，这里做二次兜底
   */
  private cleanContent(raw: string): string {
    let c = raw.trim()
    // 去掉常见思考标记前缀
    const thinkingMarkers = [
      '思考过程', '思考流程', 'Thinking Process', 'Thinking:',
      'Thought:', 'Reasoning:', '我们需要', '我们需要作为',
      '角色扮演分析', '分析：', '角色:', '**Role:**',
    ]
    for (const marker of thinkingMarkers) {
      const idx = c.indexOf(marker)
      if (idx === 0) {
        // 找该段落的结尾（换行/句号）截取
        const lines = c.split(/\n+/)
        c = lines.slice(1).join('').trim()
        break
      }
    }
    // 去除残留的 Markdown 强调符
    c = c.replace(/\*\*/g, '').replace(/\*/g, '')
    return c
  }

  /**
   * 生成回复
   * 注：氛围NPC采用非流式 chat + 逐字模拟打字机，避免推理模型流式思考超时
   * @returns 完整回复内容（失败时回退固定台词）
   */
  async reply(
    npcId: string,
    playerId: string,
    playerName: string,
    message: string,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    const npc = ambientNpcService.getById(npcId)
    if (!npc) return '（这个居民似乎不在）'

    const key = `${npcId}:${playerId}`
    const history = this.histories.get(key) ?? []

    // API 未配置 → 直接走固定台词回退
    if (!llmService.isConfigured()) {
      const fallback = ambientNpcService.pickReply(npcId, message)
      this.emitTyped(fallback, onChunk)
      this.record(key, history, 'player', message)
      this.record(key, history, 'npc', fallback)
      return fallback
    }

    try {
      const messages = this.buildMessages(npc, playerName, message, history)
      const response = await modelRouter.chat(messages, ModelPurpose.Fast, undefined, {
        skipReasoning: true,
      })
      const content = this.cleanContent(response.content) || ambientNpcService.pickReply(npcId, message)
      this.emitTyped(content, onChunk)
      this.record(key, history, 'player', message)
      this.record(key, history, 'npc', content)
      return content
    } catch (err) {
      logger.warn(`[AmbientDialogue] LLM reply failed for ${npcId}: ${(err as Error).message}`)
      const fallback = ambientNpcService.pickReply(npcId, message)
      this.emitTyped(fallback, onChunk)
      this.record(key, history, 'player', message)
      this.record(key, history, 'npc', fallback)
      return fallback
    }
  }

  /**
   * 生成打招呼，失败回退固定问候语
   */
  async greet(
    npcId: string,
    _playerId: string,
    playerName: string,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    const npc = ambientNpcService.getById(npcId)
    if (!npc) return '你好！'

    if (!llmService.isConfigured()) {
      const fallback = ambientNpcService.pickGreeting(npcId)
      this.emitTyped(fallback, onChunk)
      return fallback
    }

    try {
      const messages = this.buildMessages(npc, playerName, '', [])
      // 打招呼用更轻量的引导语
      messages[messages.length - 1] = {
        role: 'user',
        content: `（${playerName}走近了你）${npc.name}，看到来人了，自然地打个招呼吧。`,
      }
      const response = await modelRouter.chat(messages, ModelPurpose.Fast, undefined, {
        skipReasoning: true,
      })
      const content = this.cleanContent(response.content) || ambientNpcService.pickGreeting(npcId)
      this.emitTyped(content, onChunk)
      return content
    } catch (err) {
      logger.warn(`[AmbientDialogue] LLM greet failed for ${npcId}: ${(err as Error).message}`)
      const fallback = ambientNpcService.pickGreeting(npcId)
      this.emitTyped(fallback, onChunk)
      return fallback
    }
  }

  /**
   * 生成一条头顶气泡台词（LLM驱动）
   * - 每个NPC一次性生成多条台词组成轮换池，逐条返回避免重复；池耗尽或过期时重新生成
   * - LLM 失败/未配置 → 回退预设气泡台词（pickBubble），保证气泡不断
   */
  async generateBubble(npcId: string): Promise<string> {
    const npc = ambientNpcService.getById(npcId)
    if (!npc) return ''

    let pool: BubblePool | null | undefined = this.bubblePools.get(npcId)
    const now = Date.now()
    if (!pool || now - pool.at > BUBBLE_POOL_TTL || pool.idx >= pool.lines.length) {
      pool = await this.refreshBubblePool(npc)
      if (!pool) return ambientNpcService.pickBubble(npcId)
      this.bubblePools.set(npcId, pool)
    }
    return pool.lines[pool.idx++ % pool.lines.length]
  }

  /** 用 LLM 一次性生成多条自言自语台词；失败/未配置返回 null */
  private async refreshBubblePool(npc: AmbientNpcDef): Promise<BubblePool | null> {
    if (!llmService.isConfigured()) return null
    try {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: this.buildSystemPrompt(npc) },
        {
          role: 'user',
          content:
            `你现在独自一人在${SCENE_NAMES[npc.scene ?? 'town'] ?? '星火小镇'}闲逛，会时不时自言自语几句。` +
            `请一次性输出${BUBBLE_POOL_SIZE}条简短的自言自语：每条不超过20个字，口语化，符合你的身份性格，彼此不要重复，` +
            `不要编号、不要引号、不要Markdown、不要任何解释。每行一条，直接输出。`,
        },
      ]
      const response = await modelRouter.chat(messages, ModelPurpose.Fast, undefined, {
        skipReasoning: true,
      })
      const lines = this.cleanContent(response.content)
        .split(/\n+/)
        .map((s) =>
          s
            .replace(/^[-•*\d.、\s]+/, '')
            .replace(/^["'「『“]+/, '')
            .replace(/["'」』”]+$/, '')
            .trim(),
        )
        .filter((s) => {
          if (!s) return false
          // 过滤思考框架/旁白：括号备注、以「：」结尾的引导句、思考类开头
          if (/^[（(【].*[)）】]$/.test(s)) return false
          if (/^.{0,24}[：:]$/.test(s)) return false
          if (/^(嗯|哦|啊|好|先想|思考|分析|让我|我们|Let me|Note|旁白)/i.test(s)) return false
          return true
        })
        .slice(0, BUBBLE_POOL_SIZE)
      if (lines.length === 0) return null
      return { lines, idx: 0, at: Date.now() }
    } catch (err) {
      logger.warn(`[AmbientDialogue] Bubble LLM failed for ${npc.id}: ${(err as Error).message}`)
      return null
    }
  }

  /** 逐字模拟打字机输出 */
  private emitTyped(content: string, onChunk: (chunk: string) => void): void {
    for (let i = 0; i < content.length; i += 2) {
      onChunk(content.slice(i, i + 2))
    }
  }

  /** 记录并裁剪历史 */
  private record(key: string, history: HistoryEntry[], role: 'player' | 'npc', content: string): void {
    history.push({ role, content })
    const trimmed = history.slice(-MAX_HISTORY)
    this.histories.set(key, trimmed)
  }
}

/** 全局氛围NPC对话服务实例 */
export const ambientDialogueService = new AmbientDialogueService()
