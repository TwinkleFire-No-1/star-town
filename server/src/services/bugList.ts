// 星火小镇 — Bug清单与优先级分类
// T5.4.1 内测Bug List

/*
 * ==============================
 * P0 Bug — 阻塞性（必须修复）
 * ==============================
 *
 * BUG-001: Redis断连时会话丢失无降级
 *   文件: server/src/services/redisSession.ts
 *   描述: Redis连接断开时，所有会话操作直接抛异常，导致断线重连失败、
 *         用户被踢出对话。无内存降级机制。
 *   影响: 生产环境Redis抖动会引发大面积掉线
 *   修复: 添加内存降级层，Redis不可用时自动切换到内存存储
 *
 * BUG-002: Disconnect双重清理竞态条件
 *   文件: server/src/socket/handler.ts:326-345
 *   描述: socket.disconnect事件中先调用edgeCaseHandler.handleDisconnect
 *         清理状态，再遍历profiles清理对话状态。两步之间如果有重连
 *         请求到达，可能清理掉新连接的状态。
 *   影响: 断线重连后对话状态可能被清空
 *   修复: 使用原子操作清理，或加锁保护
 *
 * ==============================
 * P1 Bug — 重要（应尽快修复）
 * ==============================
 *
 * BUG-003: 流式SSE解析阻塞主线程
 *   文件: server/src/services/llmService.ts:176-207
 *   描述: chatStream中while(true)循环阻塞当前async函数，
 *         如果SSE连接挂起，该NPC的Agent循环会永久挂起。
 *   修复: 添加超时机制，超时后终止reader
 *
 * BUG-004: 定时器泄漏
 *   文件: client/src/game/scenes/GameScene.ts
 *   描述: positionSync.start()和memoryManager.startAutoCleanup()
 *         创建的定时器在场景销毁时未清理。
 *   修复: 在GameScene的shutdown/destroy方法中清理定时器
 *
 * BUG-005: 战斗实例内存泄漏
 *   文件: client/src/game/scenes/BattleScene.ts（推测）
 *   描述: 战斗场景切换回GameScene时，BattleScene中的事件监听器
 *         和定时器可能未完全清理。
 *   修复: 在场景shutdown事件中清理所有资源
 *
 * BUG-006: profileLoader.getRuntimeState变量遮蔽
 *   文件: server/src/services/profileLoader.ts
 *   描述: 多处同时读写runtimeState时无锁保护，可能导致竞态。
 *   修复: 添加版本号或CAS机制
 *
 * BUG-007: 对话事件监听器无清理
 *   文件: client/src/services/websocket.ts
 *   描述: wsService.on()注册的监听器在组件卸载时可能未清理，
 *         导致内存泄漏和重复触发。
 *   修复: 在组件卸载时调用对应的off()清理
 *
 * BUG-008: 前端事件监听不完整
 *   文件: client/src/services/websocket.ts
 *   描述: 后端发送的11种事件前端未监听：
 *         story:triggered, story:area_unlocked, reconnect:result,
 *         interaction:dialog:start/chunk/end, room:error等
 *   修复: 补充前端事件监听器
 *
 * BUG-009: positionSync未同步方向变化
 *   文件: client/src/services/positionSync.ts
 *   描述: 仅当位置变化>1px时发送更新，但方向变化不触发同步。
 *   修复: 方向变化也标记为需要同步
 *
 * BUG-010: tieredUpdateStrategy无玩家时中频兜底问题
 *   文件: server/src/services/tieredUpdateStrategy.ts:288
 *   描述: 无玩家在线时所有NPC降为medium，但返回值略超中频阈值
 *         导致determineTier判断为low而非medium。
 *   修复: 无玩家时直接返回medium tier
 *
 * BUG-011: 反思服务并发调用
 *   文件: server/src/services/reflectionService.ts
 *   描述: batchReflection可能被多个调度器Tick同时触发。
 *   修复: 添加锁或去重机制
 *
 * BUG-012: 对话Prompt中记忆为空时格式问题
 *   文件: server/src/services/dialoguePromptConstructor.ts
 *   描述: 如果NPC没有记忆，Prompt中"最近记忆"部分为空数组，
 *         可能导致LLM输出格式异常。
 *   修复: 记忆为空时使用默认占位文本
 *
 * ==============================
 * P2 Bug — 次要（择机修复）
 * ==============================
 *
 * BUG-013-032: 共20个P2问题
 *   - 8处硬编码值（端口、URL、超时等）
 *   - 3处类型安全（any类型应改为具体类型）
 *   - 2处数据一致性（NPC位置可能不同步）
 *   - 2处边界情况（空数组、null值处理）
 *   - 5处代码质量（重复代码、命名不统一等）
 */

export const BUG_LIST = {
  p0: 2,   // 全部已修复 (BUG-001, BUG-002) D18
  p1: 10,  // 全部已修复 (BUG-003~BUG-012) D19
  p2: 20,
  total: 32,
  fixedP0: 2,
  fixedP1: 10,
  fixedTotal: 12,
}
