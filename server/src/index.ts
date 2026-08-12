import dotenv from 'dotenv'
dotenv.config()

import { createServer } from './server.js'
import { profileLoader } from './services/profileLoader.js'
import { relationNetwork } from './services/relationNetwork.js'
import { gameClock } from './services/gameClock.js'
import { timeEventTrigger } from './services/timeEventTrigger.js'
import { npcScheduler } from './services/npcScheduler.js'
import { questEngine } from './services/questEngine.js'
import { itemService } from './services/itemService.js'
import { battleEngine } from './services/battleEngine.js'
import { storyProgressionManager } from './services/storyProgressionManager.js'
import { edgeCaseHandler } from './services/edgeCaseHandler.js'
import { emergentNarrativeEngine } from './services/emergentNarrativeRules.js'
import { emergentQuestGenerator } from './services/emergentQuestGenerator.js'
import { economyBalance } from './services/economyBalance.js'
import { scheduleExecutor } from './services/scheduleExecutor.js'
import { npcMovementDriver } from './services/npcMovementDriver.js'
import { levelSystem } from './services/levelSystem.js'
import { mainlineQuestService } from './services/mainlineQuestService.js'
import { weatherService } from './services/weatherService.js'

// 确保模块被加载初始化
void emergentNarrativeEngine
void emergentQuestGenerator

const PORT = parseInt(process.env.PORT || '4000', 10)

async function main() {
  const { httpServer, io } = await createServer()

  // 初始化NPC档案加载器
  try {
    await profileLoader.initialize()
    console.log('[Star Town Server] NPC profiles loaded')
  } catch (err) {
    console.warn('[Star Town Server] NPC profile loading failed:', (err as Error).message)
  }

  // 初始化NPC关系网络
  try {
    await relationNetwork.initialize()
    console.log(`[Star Town Server] NPC relation network initialized (${relationNetwork.size} relations)`)
  } catch (err) {
    console.warn('[Star Town Server] Relation network initialization failed:', (err as Error).message)
  }

  // 初始化游戏时钟（30min现实=1游戏日）
  gameClock.setIo(io)
  gameClock.initialize({
    timeScale: 0.8, // 0.8 游戏分钟/秒 → 1800秒=1440分钟(1游戏日)
    startDay: 1,
    startTime: 480, // 8:00 AM
    enableBroadcast: true,
  })
  gameClock.start()
  console.log(`[Star Town Server] GameClock started: Day ${gameClock.getDay()}, ${gameClock.getFormattedTime()}, period=${gameClock.getPeriod()}`)

  // 注入游戏小时到日程执行器（NPC日程驱动的时钟来源）
  scheduleExecutor.setHourProvider(() => gameClock.getGameHour())

  // 启动NPC移动驱动（日程/剧情驱动的 NPC 移动 + npc:move 广播）
  npcMovementDriver.setIo(io)
  npcMovementDriver.start()
  console.log('[Star Town Server] NpcMovementDriver started')

  // 初始化时间事件触发器
  timeEventTrigger.setIo(io)
  timeEventTrigger.initialize()
  console.log('[Star Town Server] TimeEventTrigger initialized')

  // 初始化任务引擎
  questEngine.setIo(io)
  await questEngine.initialize()
  console.log('[Star Town Server] QuestEngine initialized')

  // 初始化物品服务
  await itemService.initialize()
  console.log('[Star Town Server] ItemService initialized')

  // 初始化战斗引擎
  battleEngine.setIo(io)
  battleEngine.start()
  console.log('[Star Town Server] BattleEngine started')

  // 初始化剧情进度管理器（全链路联调）
  storyProgressionManager.setIo(io)
  await storyProgressionManager.initialize()
  console.log('[Star Town Server] StoryProgressionManager initialized')

  // 初始化升级打怪系统（T6.8）
  levelSystem.setIo(io)
  console.log('[Star Town Server] LevelSystem initialized')

  // 初始化时间驱动主线任务服务（T6.8 升级打怪玩法）
  mainlineQuestService.setIo(io)
  // T6.15 注入章节提供器：主线任务发布前校验对应地图是否已解锁（修复"任务发布地点在未解锁地图内"逻辑错误）
  mainlineQuestService.setChapterProvider(async (playerId: string) => {
    const progress = await storyProgressionManager.getPlayerProgress(playerId)
    return { currentChapter: progress.currentChapter }
  })
  await mainlineQuestService.initialize()
  console.log('[Star Town Server] MainlineQuestService initialized')

  // 初始化天气系统（T6.9 天气设定：小镇天气渲染 + NPC感知环境）
  weatherService.setIo(io)
  weatherService.initialize()
  console.log(`[Star Town Server] WeatherService initialized: ${weatherService.getWeather().name}`)

  // 初始化边界情况处理器
  edgeCaseHandler.setIo(io)
  console.log('[Star Town Server] EdgeCaseHandler initialized')

  // 启动NPC调度器
  npcScheduler.start({
    tickInterval: 5000,
    maxExecPerTick: 8,
    enableReflection: true,
    enableTieredUpdate: true,
  })
  console.log('[Star Town Server] NPC Scheduler started')

  // 初始化涌现叙事规则引擎
  console.log('[Star Town Server] EmergentNarrativeEngine initialized')

  // 初始化涌现任务生成器
  console.log('[Star Town Server] EmergentQuestGenerator initialized')

  // 初始化经济平衡引擎
  console.log(`[Star Town Server] EconomyBalance initialized (${economyBalance.getPriceTable().length} pricing rules)`)

  httpServer.listen(PORT, () => {
    console.log(`[Star Town Server] running on http://localhost:${PORT}`)
    console.log(`[Star Town Server] WebSocket ready on ws://localhost:${PORT}`)
  })

  // 优雅关闭
  process.on('SIGTERM', () => {
    console.log('[Star Town Server] SIGTERM received, shutting down...')
    questEngine.destroy()
    battleEngine.stop()
    timeEventTrigger.destroy()
    npcScheduler.stop()
    gameClock.stop()
    io.close()
    httpServer.close()
    process.exit(0)
  })

  process.on('SIGINT', () => {
    console.log('[Star Town Server] SIGINT received, shutting down...')
    questEngine.destroy()
    battleEngine.stop()
    timeEventTrigger.destroy()
    npcScheduler.stop()
    gameClock.stop()
    io.close()
    httpServer.close()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('[Star Town Server] Fatal error:', err)
  process.exit(1)
})
