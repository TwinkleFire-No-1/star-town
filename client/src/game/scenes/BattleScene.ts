// 星火小镇 — 回合制战斗场景（赛尔号式对战）
// T7.x 战斗场景重构：
// - AI生成战斗背景（左右分屏对战舞台）
// - AI重新生成敌人精灵（每怪2帧动作：待机/攻击）
// - 回合制：玩家先手攻击 → 小怪反击
// - 胜利弹出「战胜xxx」提示框 + 确定按钮

import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'
import { FONT_TITLE, FONT_BODY, FONT_SIZE } from '../typography'
import { applyPixelPerfectConfig } from '../rendering/PixelPerfectRenderer'
import { SceneTransitions, SceneKey } from '../SceneManager'
import { getSceneManager } from '../../components/PhaserGame'
import { wsService } from '../../services/websocket'
import { musicSystem } from '../systems/MusicSystem'

// =============================================
// 战斗场景数据类型
// =============================================

export interface BattleInitData {
  /** 战斗ID（由服务端生成） */
  battleId: string
  /** 玩家信息 */
  player: {
    id: string
    name: string
    hp: number
    maxHp: number
  }
  /** 敌人列表 */
  enemies: BattleEnemyData[]
  /** 战斗来源（哪个区域触发） */
  sourceArea?: string
}

export interface BattleEnemyData {
  id: string
  name: string
  hp: number
  maxHp: number
  attack: number
  defense: number
  speed: number
  defeated?: boolean
}

// =============================================
// 战斗场景事件
// =============================================

export interface BattleSceneEvent {
  type: 'battle:victory' | 'battle:defeat' | 'battle:fled' | 'battle:action'
  battleId: string
  data?: Record<string, unknown>
}

// =============================================
// 回合制布局常量（1920×1080，左右分屏）
// =============================================

/** 玩家站位（左侧） */
const PLAYER_X = 430
const PLAYER_Y = 620
/** 敌人站位（右侧） */
const ENEMY_BASE_X = 1470
const ENEMY_Y = 590
/** 多敌人时横向间距（避免名字/血条重叠） */
const ENEMY_SPACING = 250
/** 精灵显示尺寸 */
const PLAYER_DISPLAY = 190
const ENEMY_DISPLAY = 190
const BOSS_DISPLAY = 230
/** 回合时间节奏（ms） */
const STEP_MS = 950
const TURN_BANNER_MS = 700

/** 敌人ID → 纹理 key */
const ENEMY_TEXTURE = (id: string): string => `enemy-${id.replace(/^enemy_/, '')}`

/** BOSS 判定 */
function isBossEnemy(enemyId: string): boolean {
  return enemyId.startsWith('boss_')
}

/**
 * BattleScene — 回合制战斗场景（赛尔号式）
 *
 * 流程：
 * 战斗开始 → 玩家回合（攻击按钮可用）→ 点击攻击 → 玩家攻击动画 → 敌人受击
 * → 敌人回合（自动）→ 敌人攻击动画 → 玩家受击 → 回到玩家回合
 * → 胜利/战败弹出提示框（确定按钮退出）
 */
export class BattleScene extends Phaser.Scene {
  // --- 场景数据 ---
  private battleId: string = ''
  private playerInfo: { id: string; name: string; hp: number; maxHp: number } = { id: '', name: '旅行者', hp: 100, maxHp: 100 }
  private enemies: BattleEnemyData[] = []

  // --- 游戏对象 ---
  private playerSprite: Phaser.GameObjects.Sprite | null = null
  private playerShadow: Phaser.GameObjects.Ellipse | null = null
  private enemySprites: Phaser.GameObjects.Sprite[] = []
  private enemyShadows: Phaser.GameObjects.Ellipse[] = []
  private hpBarPlayer: Phaser.GameObjects.Graphics | null = null
  private hpBarsEnemy: Phaser.GameObjects.Graphics[] = []
  private hpTextPlayer: Phaser.GameObjects.Text | null = null
  private hpTextsEnemy: Phaser.GameObjects.Text[] = []
  private statusText: Phaser.GameObjects.Text | null = null
  private turnText: Phaser.GameObjects.Text | null = null
  private attackButton: Phaser.GameObjects.Container | null = null
  private fleeButton: Phaser.GameObjects.Container | null = null
  private damageTexts: Phaser.GameObjects.Text[] = []
  private enemyNames: Phaser.GameObjects.Text[] = []

  // --- 战斗状态 ---
  private battleEnded: boolean = false
  private playerTurn: boolean = true
  private processing: boolean = false
  private roundCount: number = 1
  private battleOutcome: 'victory' | 'defeat' | 'fled' | null = null
  private battleSettled: boolean = false

  constructor() {
    super({ key: 'BattleScene' })
  }

  /**
   * 初始化 — 接收战斗数据
   */
  init(data: BattleInitData): void {
    this.battleId = data.battleId
    this.playerInfo = data.player ?? this.playerInfo
    this.enemies = data.enemies ?? []
    this.battleEnded = false
    this.playerTurn = true
    this.processing = false
    this.roundCount = 1
    this.battleOutcome = null
    this.battleSettled = false
  }

  /**
   * 创建战斗场景
   */
  create(): void {
    applyPixelPerfectConfig(this.game)

    // 白色淡入（承接 GameScene 的红wipe收尾）
    this.cameras.main.fadeFrom(200, 255, 255, 255)

    // 1. AI 战斗背景（赛尔号式左右分屏对战舞台）
    this.createBattleBackdrop()

    // 2. 敌人精灵（右侧）
    this.createEnemySprites()

    // 3. 玩家精灵（左侧）
    this.createPlayerSprite()

    // 4. 血条
    this.createHpBars()

    // 5. 状态区（顶部）
    this.createStatusArea()

    // 6. 操作按钮（底部：攻击/逃跑）
    this.createActionButtons()

    // 7. 战斗开场
    this.battleIntro()

    // 7.1 T7.x.13 背景音乐：进入战斗切换战斗BGM（BOSS战用高强度曲目）
    // 退出战斗回 GameScene 时，GameScene.create 会自动恢复场景音乐
    musicSystem.ensureInit()
    void musicSystem.preload()
    const isBossBattle = this.enemies.some((e) => isBossEnemy(e.id))
    musicSystem.play(isBossBattle ? 'boss' : 'battle', 600)

    // 键盘：ESC 退出（战斗结束后）
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.battleEnded) this.exitBattle()
    })

    console.log('[BattleScene] Turn battle started:', this.battleId)
  }

  // =============================================
  // 布局创建
  // =============================================

  /** AI 生成战斗背景（左右分屏对战舞台），缺失时回退暗色 */
  private createBattleBackdrop(): void {
    if (this.textures.exists('bg-battle-arena')) {
      const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg-battle-arena')
      bg.setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      bg.setDepth(0)
    } else {
      const g = this.add.graphics()
      g.fillGradientStyle(0x1c2a1e, 0x1c2a1e, 0x2a1c16, 0x2a1c16, 1)
      g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    }

    // 左右阵营标签（木牌风格）
    this.makeTag('我方', '#7ec97e', 90)
    this.makeTag('敌方', '#e07b5a', GAME_WIDTH - 200)
  }

  private makeTag(label: string, color: string, x: number): void {
    const tag = this.add.text(x, 60, label, {
      fontSize: FONT_SIZE.MD,
      color,
      fontFamily: FONT_TITLE,
      backgroundColor: 'rgba(30,20,10,0.78)',
      padding: { x: 20, y: 10 },
    })
    tag.setOrigin(0.5)
    tag.setDepth(300)
    tag.setAlpha(0.9)
  }

  /** 创建敌人精灵（右侧，多敌人横排） */
  private createEnemySprites(): void {
    const count = this.enemies.length
    const startX = ENEMY_BASE_X - ((count - 1) * ENEMY_SPACING) / 2

    this.enemies.forEach((enemy, i) => {
      const x = startX + i * ENEMY_SPACING
      const y = ENEMY_Y
      const displaySize = isBossEnemy(enemy.id) ? BOSS_DISPLAY : ENEMY_DISPLAY

      const textureKey = ENEMY_TEXTURE(enemy.id)
      const hasTexture = this.textures.exists(textureKey)
      const sprite = hasTexture
        ? this.add.sprite(x, y, textureKey, 0)
        : this.add.sprite(x, y, '__DEFAULT')

      sprite.setDisplaySize(displaySize, displaySize)
      if (!hasTexture) sprite.setTint(0xe53935)

      // 待机浮动动画
      sprite.setData('baseY', y)
      this.tweens.add({
        targets: sprite,
        y: y - 14,
        duration: 1500 + Math.random() * 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 200,
      })

      // 入场动画
      sprite.setAlpha(0)
      sprite.setScale(0.6)
      this.tweens.add({
        targets: sprite,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 400,
        delay: 150 + i * 180,
        ease: 'Back.easeOut',
      })

      // 脚下阴影
      const shadow = this.add.ellipse(x, y + displaySize / 2 - 8, displaySize * 0.72, 24, 0x000000, 0.3)
      shadow.setDepth(y - 1)
      this.enemyShadows.push(shadow)

      // 名字（精灵下方，避免多敌人时重叠）
      const nameText = this.add.text(x, y + displaySize / 2 + 30, enemy.name, {
        fontSize: FONT_SIZE.SM, color: '#ffb3a0', fontFamily: FONT_BODY, align: 'center',
      }).setOrigin(0.5).setDepth(y + 200)
      this.enemyNames.push(nameText)

      this.enemySprites.push(sprite)
    })
  }

  /** 创建玩家精灵（左侧）— T7.x AI精细战斗主角（2帧：待机/攻击） */
  private createPlayerSprite(): void {
    const x = PLAYER_X
    const y = PLAYER_Y

    // 优先使用AI精细战斗主角精灵（battle-player），回退普通 player
    const hasBattlePlayer = this.textures.exists('battle-player')
    const hasPlayer = this.textures.exists('player')
    if (hasBattlePlayer) {
      this.playerSprite = this.add.sprite(x, y, 'battle-player', 0)
    } else if (hasPlayer) {
      this.playerSprite = this.add.sprite(x, y, 'player', 0)
    } else {
      this.playerSprite = this.add.sprite(x, y, '__DEFAULT')
    }

    this.playerSprite.setDisplaySize(PLAYER_DISPLAY, PLAYER_DISPLAY)
    if (!hasBattlePlayer && !hasPlayer) this.playerSprite.setTint(0x4caf50)

    // 待机浮动
    this.tweens.add({
      targets: this.playerSprite,
      y: y - 12,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // 脚下阴影
    this.playerShadow = this.add.ellipse(x, y + PLAYER_DISPLAY / 2 - 8, PLAYER_DISPLAY * 0.72, 24, 0x000000, 0.3)
    this.playerShadow.setDepth(y - 1)

    // 名字
    this.add.text(x, y + PLAYER_DISPLAY / 2 + 26, this.playerInfo.name, {
      fontSize: FONT_SIZE.SM, color: '#9fe8a8', fontFamily: FONT_BODY, align: 'center',
    }).setOrigin(0.5).setDepth(y + 200)
  }

  /** 创建血条（玩家左侧 / 敌人右侧） */
  private createHpBars(): void {
    // 玩家血条
    const pb = this.add.graphics()
    pb.setDepth(500)
    this.hpBarPlayer = pb
    this.drawHpBar(pb, this.playerInfo.hp, this.playerInfo.maxHp, PLAYER_X, PLAYER_Y - PLAYER_DISPLAY / 2 - 70, 0x5b8c3e, 340)
    this.hpTextPlayer = this.add.text(PLAYER_X, PLAYER_Y - PLAYER_DISPLAY / 2 - 112, `${this.playerInfo.hp}/${this.playerInfo.maxHp}`, {
      fontSize: FONT_SIZE.MD, color: '#ffe9b0', fontFamily: FONT_BODY, align: 'center',
    }).setOrigin(0.5).setDepth(501)

    // 敌人血条（每个敌人一条，多敌人时收窄避免重叠）
    const enemyBarWidth = this.enemies.length > 1 ? 250 : 340
    this.enemies.forEach((enemy, i) => {
      const bar = this.add.graphics()
      bar.setDepth(500)
      this.hpBarsEnemy.push(bar)
      const sx = ENEMY_BASE_X - ((this.enemies.length - 1) * ENEMY_SPACING) / 2 + i * ENEMY_SPACING
      const disp = isBossEnemy(enemy.id) ? BOSS_DISPLAY : ENEMY_DISPLAY
      this.drawHpBar(bar, enemy.hp, enemy.maxHp, sx, ENEMY_Y - disp / 2 - 70, 0xc04545, enemyBarWidth)
      const text = this.add.text(sx, ENEMY_Y - disp / 2 - 112, `${enemy.hp}/${enemy.maxHp}`, {
        fontSize: FONT_SIZE.MD, color: '#ffe9b0', fontFamily: FONT_BODY, align: 'center',
      }).setOrigin(0.5).setDepth(501)
      this.hpTextsEnemy.push(text)
    })
  }

  /** 绘制血条 */
  private drawHpBar(
    bar: Phaser.GameObjects.Graphics,
    currentHp: number,
    maxHp: number,
    centerX: number,
    y: number,
    color: number,
    barWidth: number,
  ): void {
    const barHeight = 30
    const x = centerX - barWidth / 2

    bar.clear()
    bar.fillStyle(0x3d2817)
    bar.fillRoundedRect(x - 8, y - 8, barWidth + 16, barHeight + 16, 8)
    bar.fillStyle(0x1a1208)
    bar.fillRoundedRect(x, y, barWidth, barHeight, 4)

    const ratio = Math.max(0, Math.min(1, currentHp / Math.max(1, maxHp)))
    bar.fillStyle(color)
    bar.fillRoundedRect(x, y, barWidth * ratio, barHeight, 4)

    // 分段格子
    bar.lineStyle(4, 0x3d2817, 0.7)
    for (let gx = x + 48; gx < x + barWidth; gx += 48) {
      bar.moveTo(gx, y)
      bar.lineTo(gx, y + barHeight)
      bar.strokePath()
    }
    bar.fillStyle(0xffffff, 0.15)
    bar.fillRect(x, y, barWidth * ratio, 8)
  }

  /** 创建状态区（顶部提示） */
  private createStatusArea(): void {
    this.statusText = this.add.text(GAME_WIDTH / 2, 40, '', {
      fontSize: FONT_SIZE.MD, color: '#f5e6c8', fontFamily: FONT_TITLE, align: 'center',
    }).setOrigin(0.5).setDepth(600).setStroke('#3d2817', 8)

    this.turnText = this.add.text(GAME_WIDTH / 2, 130, '', {
      fontSize: FONT_SIZE.SM, color: '#e8a93c', fontFamily: FONT_BODY, align: 'center',
    }).setOrigin(0.5).setDepth(600).setStroke('#3d2817', 8)
  }

  /** 创建操作按钮（攻击/逃跑） */
  private createActionButtons(): void {
    const btnY = GAME_HEIGHT - 110

    // 攻击按钮（木牌风格）
    this.attackButton = this.makeButton(GAME_WIDTH / 2 - 140, btnY, '⚔ 攻击', 0x8b5a2b, () => {
      if (!this.processing && !this.battleEnded && this.playerTurn) {
        void this.playerAttack()
      }
    })

    // 逃跑按钮
    this.fleeButton = this.makeButton(GAME_WIDTH / 2 + 140, btnY, '逃跑', 0x6a4a2a, () => {
      if (!this.processing && !this.battleEnded && this.playerTurn) {
        void this.playerFlee()
      }
    })
  }

  /** 创建木牌按钮 */
  private makeButton(
    x: number,
    y: number,
    label: string,
    color: number,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const bg = this.add.graphics()
    bg.fillStyle(color, 1)
    bg.fillRoundedRect(-130, -42, 260, 84, 18)
    bg.lineStyle(6, 0x3d2817, 1)
    bg.strokeRoundedRect(-130, -42, 260, 84, 18)
    bg.fillStyle(0xffffff, 0.12)
    bg.fillRoundedRect(-130, -42, 260, 30, 14)

    const text = this.add.text(0, 0, label, {
      fontSize: FONT_SIZE.MD, color: '#f5e6c8', fontFamily: FONT_TITLE, align: 'center',
    }).setOrigin(0.5).setStroke('#2a1808', 6)

    const container = this.add.container(x, y, [bg, text])
    container.setDepth(900)

    const zone = this.add.zone(x, y, 260, 84).setInteractive({ useHandCursor: true })
    zone.setDepth(901)
    zone.on('pointerdown', onClick)
    zone.on('pointerover', () => container.setScale(1.06))
    zone.on('pointerout', () => container.setScale(1))

    container.setData('zone', zone)
    return container
  }

  // =============================================
  // 回合流程
  // =============================================

  /** 战斗开场 */
  private battleIntro(): void {
    const names = this.enemies.map((e) => e.name).join('、')
    this.statusText?.setText(`${names} 出现了!`)
    this.showTurnBanner('战斗开始!')

    this.time.delayedCall(1200, () => {
      this.beginPlayerTurn()
    })
  }

  /** 玩家回合开始 */
  private beginPlayerTurn(): void {
    if (this.battleEnded) return
    this.playerTurn = true
    this.processing = false
    this.statusText?.setText('轮到你了!')
    this.turnText?.setText(`第 ${this.roundCount} 回合`)
    this.setButtonState(true)
    this.showTurnBanner('你的回合')
  }

  /** 玩家点击攻击 */
  private async playerAttack(): Promise<void> {
    if (this.processing || this.battleEnded) return
    this.processing = true
    this.setButtonState(false)

    // 目标：血量最低的存活敌人（集火先杀威胁，保证任意战斗顺序玩家都能过关）
    let targetIdx = -1
    let minHp = Infinity
    this.enemies.forEach((e, i) => {
      if (!e.defeated && e.hp < minHp) {
        minHp = e.hp
        targetIdx = i
      }
    })
    if (targetIdx < 0) return

    const playerId = wsService.getPlayerId() ?? this.playerInfo.id
    const target = this.enemies[targetIdx]
    this.statusText?.setText(`你攻击了 ${target.name}!`)

    try {
      const res = await fetch(`/api/battle/${this.battleId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'attack',
          actorId: playerId,
          targetId: target.id,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        this.statusText?.setText(json?.error ?? '行动失败')
        this.processing = false
        this.beginPlayerTurn()
        return
      }

      // 按事件顺序播放动画
      const events = json?.data?.events ?? []
      await this.playRoundEvents(events)

      // 同步最新状态
      this.syncState(json?.data)
    } catch (err) {
      console.warn('[BattleScene] action failed:', err)
      this.statusText?.setText('攻击失败，请重试')
      this.processing = false
      this.beginPlayerTurn()
    }
  }

  /** 玩家逃跑 */
  private async playerFlee(): Promise<void> {
    if (this.processing || this.battleEnded) return
    this.processing = true
    this.setButtonState(false)

    const playerId = wsService.getPlayerId() ?? this.playerInfo.id
    try {
      const res = await fetch(`/api/battle/${this.battleId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'flee', actorId: playerId, targetId: '' }),
      })
      const json = await res.json()
      const state = json?.data?.state
      if (state === 'fled') {
        this.battleEnded = true
        this.battleOutcome = 'fled'
        this.showResultDialog('你逃离了战斗...', null, () => this.exitBattle())
      } else {
        this.statusText?.setText('逃跑失败!')
        this.processing = false
        this.beginPlayerTurn()
      }
    } catch {
      this.processing = false
      this.beginPlayerTurn()
    }
  }

  /**
   * 按顺序播放一回合事件（玩家攻击动画 → 敌人反击动画 → 受击特效）
   */
  private async playRoundEvents(events: Array<{ type: string; data: Record<string, any> }>): Promise<void> {
    for (const ev of events) {
      const data = ev.data ?? {}
      if (ev.type === 'damage') {
        const attackerId = data.attackerId ?? ''
        const targetId = data.targetId ?? ''
        const damage = data.damage ?? 0
        const isPlayerAttacker = attackerId === this.playerInfo.id || attackerId === wsService.getPlayerId()

        if (isPlayerAttacker) {
          // 玩家攻击 → 敌人受击
          const idx = this.enemies.findIndex((e) => e.id === targetId)
          await this.playAttackMove(this.playerSprite, this.enemySprites[idx], PLAYER_X, true)
          this.showDamageNumber(this.enemySprites[idx]?.x ?? ENEMY_BASE_X, (this.enemySprites[idx]?.y ?? ENEMY_Y) - 140, damage, true)
          this.updateHpFromEvent(targetId, data)
        } else {
          // 敌人攻击 → 玩家受击
          await this.playAttackMove(this.enemySprites[0], this.playerSprite, ENEMY_BASE_X, false)
          this.showDamageNumber(PLAYER_X, PLAYER_Y - 140, damage, false)
          this.updatePlayerHpFromData(data)
        }
        if (data.message) this.showFloatingLog(data.message)
      } else if (ev.type === 'defeat') {
        const idx = this.enemies.findIndex((e) => e.id === data.defeatedId)
        if (idx >= 0) this.markEnemyDefeated(idx)
        if (data.message) this.showFloatingLog(data.message)
      } else if (ev.type === 'action') {
        if (data.message) this.showFloatingLog(data.message)
      }
      await this.wait(STEP_MS)
    }
  }

  /** 攻击动画：攻击者前冲 → 目标受击抖动 → 回位 */
  private playAttackMove(
    attacker: Phaser.GameObjects.Sprite | null,
    target: Phaser.GameObjects.Sprite | null | undefined,
    attackerHomeX: number,
    isPlayer: boolean,
  ): Promise<void> {
    return new Promise((resolve) => {
      if (!attacker) return resolve()

      const dir = isPlayer ? 1 : -1
      const homeX = attackerHomeX
      const targetX = target?.x ?? homeX

      // 攻击帧（双方都有2帧动作精灵：切换第2帧攻击姿态）
      if (attacker.texture && attacker.texture.frameTotal > 1) {
        attacker.setFrame(1)
      }

      // 前冲
      this.tweens.add({
        targets: attacker,
        x: targetX - dir * 60,
        duration: 260,
        ease: 'Quad.easeOut',
        onComplete: () => {
          // 目标受击抖动
          if (target) {
            this.tweens.add({
              targets: target,
              x: target.x + 14,
              duration: 60,
              yoyo: true,
              repeat: 2,
              onComplete: () => {
                target.x = targetX
              },
            })
            target.setTint(0xffdddd)
            this.time.delayedCall(180, () => target.clearTint())
          }
          // 攻击者回位
          this.tweens.add({
            targets: attacker,
            x: homeX,
            duration: 260,
            ease: 'Quad.easeIn',
            onComplete: () => {
              // 恢复待机帧
              if (attacker.texture && attacker.texture.frameTotal > 1) attacker.setFrame(0)
              resolve()
            },
          })
        },
      })
    })
  }

  /** 显示浮动伤害数字 */
  private showDamageNumber(x: number, y: number, damage: number, toEnemy: boolean): void {
    const text = this.add.text(x + (Math.random() * 40 - 20), y, `-${damage}`, {
      fontSize: FONT_SIZE.LG,
      color: toEnemy ? '#ff6b6b' : '#ffd166',
      fontFamily: FONT_TITLE,
    }).setOrigin(0.5).setDepth(1200).setStroke('#2a0000', 8)

    this.tweens.add({
      targets: text,
      y: y - 90,
      alpha: 0,
      duration: 900,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    })
    this.damageTexts.push(text)
  }

  /** 浮动战斗日志（底部中央） */
  private showFloatingLog(message: string): void {
    this.statusText?.setText(message)
  }

  /** 回合横幅 */
  private showTurnBanner(text: string): void {
    const banner = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.78, text, {
      fontSize: FONT_SIZE.LG,
      color: '#ffe9b0',
      fontFamily: FONT_TITLE,
      backgroundColor: 'rgba(30,20,10,0.75)',
      padding: { x: 40, y: 16 },
    }).setOrigin(0.5).setDepth(1100).setAlpha(0).setStroke('#3d2817', 6)

    this.tweens.add({
      targets: banner,
      alpha: 1,
      y: banner.y - 12,
      duration: TURN_BANNER_MS / 2,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: banner,
          alpha: 0,
          y: banner.y + 12,
          duration: TURN_BANNER_MS / 2,
          delay: TURN_BANNER_MS,
          onComplete: () => banner.destroy(),
        })
      },
    })
  }

  // =============================================
  // 状态同步
  // =============================================

  /** 用 action 返回的最新快照同步状态 */
  private syncState(data: any): void {
    if (!data) {
      this.processing = false
      this.beginPlayerTurn()
      return
    }

    const state = data.state
    if (typeof data.playerHp === 'number' && this.hpBarPlayer) {
      this.playerInfo.hp = data.playerHp
      this.playerInfo.maxHp = data.playerMaxHp ?? this.playerInfo.maxHp
      this.drawHpBar(this.hpBarPlayer, this.playerInfo.hp, this.playerInfo.maxHp, PLAYER_X, PLAYER_Y - PLAYER_DISPLAY / 2 - 70, 0x5b8c3e, 340)
      if (this.hpTextPlayer) this.hpTextPlayer.setText(`${this.playerInfo.hp}/${this.playerInfo.maxHp}`)
    }

    if (Array.isArray(data.enemies)) {
      data.enemies.forEach((e: any, i: number) => {
        if (this.enemies[i]) {
          this.enemies[i].hp = e.hp
          this.enemies[i].maxHp = e.maxHp
          this.enemies[i].defeated = e.defeated
        }
      })
      // 重绘敌人血条
      this.enemies.forEach((enemy, i) => {
        const sx = ENEMY_BASE_X - ((this.enemies.length - 1) * ENEMY_SPACING) / 2 + i * ENEMY_SPACING
        const dispE = isBossEnemy(enemy.id) ? BOSS_DISPLAY : ENEMY_DISPLAY
        if (this.hpBarsEnemy[i]) this.drawHpBar(this.hpBarsEnemy[i], enemy.hp, enemy.maxHp, sx, ENEMY_Y - dispE / 2 - 70, 0xc04545, this.enemies.length > 1 ? 250 : 340)
        if (this.hpTextsEnemy[i]) this.hpTextsEnemy[i].setText(`${Math.max(0, Math.round(enemy.hp))}/${enemy.maxHp}`)
      })
    }

    // 战斗结束处理
    if (state === 'victory') {
      this.battleEnded = true
      this.battleOutcome = 'victory'
      this.endBattleVictory(data)
      return
    }
    if (state === 'defeat') {
      this.battleEnded = true
      this.battleOutcome = 'defeat'
      this.endBattleDefeat()
      return
    }

    // 下一回合
    this.roundCount++
    this.processing = false
    this.time.delayedCall(400, () => this.beginPlayerTurn())
  }

  /** 事件中更新敌人HP */
  private updateHpFromEvent(targetId: string, data: Record<string, any>): void {
    const idx = this.enemies.findIndex((e) => e.id === targetId)
    if (idx >= 0 && typeof data.targetHp === 'number') {
      this.enemies[idx].hp = data.targetHp
      this.enemies[idx].maxHp = data.targetMaxHp ?? this.enemies[idx].maxHp
      const sx = ENEMY_BASE_X - ((this.enemies.length - 1) * ENEMY_SPACING) / 2 + idx * ENEMY_SPACING
      const dispU = isBossEnemy(this.enemies[idx].id) ? BOSS_DISPLAY : ENEMY_DISPLAY
      if (this.hpBarsEnemy[idx]) this.drawHpBar(this.hpBarsEnemy[idx], this.enemies[idx].hp, this.enemies[idx].maxHp, sx, ENEMY_Y - dispU / 2 - 70, 0xc04545, this.enemies.length > 1 ? 250 : 340)
      if (this.hpTextsEnemy[idx]) this.hpTextsEnemy[idx].setText(`${Math.max(0, Math.round(this.enemies[idx].hp))}/${this.enemies[idx].maxHp}`)
    }
  }

  /** 事件中更新玩家HP */
  private updatePlayerHpFromData(data: Record<string, any>): void {
    if (typeof data.targetHp === 'number' && this.hpBarPlayer) {
      this.playerInfo.hp = data.targetHp
      this.playerInfo.maxHp = data.targetMaxHp ?? this.playerInfo.maxHp
      this.drawHpBar(this.hpBarPlayer, this.playerInfo.hp, this.playerInfo.maxHp, PLAYER_X, PLAYER_Y - PLAYER_DISPLAY / 2 - 70, 0x5b8c3e, 340)
      if (this.hpTextPlayer) this.hpTextPlayer.setText(`${Math.max(0, Math.round(this.playerInfo.hp))}/${this.playerInfo.maxHp}`)
    }
  }

  /** 标记敌人被击败 */
  private markEnemyDefeated(index: number): void {
    const sprite = this.enemySprites[index]
    if (!sprite) return
    this.enemies[index].defeated = true
    this.tweens.add({
      targets: sprite,
      alpha: 0.1,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 350,
      ease: 'Sine.easeIn',
    })
    sprite.setTint(0x888888)
    if (this.enemyShadows[index]) this.enemyShadows[index].setAlpha(0.06)
    if (this.enemyNames[index]) this.enemyNames[index].setAlpha(0.35)
  }

  // =============================================
  // 战斗结束
  // =============================================

  /**
   * 战斗胜利：弹出「战胜xxx」提示框 + 确定按钮
   */
  private endBattleVictory(data: any): void {
    this.setButtonState(false)
    const exp = data?.expGained ?? 0
    const coins = data?.coinsGained ?? 0
    const names = this.enemies.map((e) => e.name).join('、')

    this.showResultDialog(`战胜 ${names}!`, `获得经验 +${exp}  星币 +${coins}`, () => {
      this.exitBattle()
    })
  }

  /** 战斗失败 */
  private endBattleDefeat(): void {
    this.setButtonState(false)
    this.playerSprite?.setTint(0x555555)
    this.playerSprite?.setAlpha(0.6)
    this.showResultDialog('战败...', '回到小镇休整后再来挑战', () => {
      this.exitBattle()
    })
  }

  /** 结果提示框（木牌风格）+ 确定按钮 */
  private showResultDialog(title: string, subtitle: string | null, onConfirm: () => void): void {
    const panelW = 900
    const panelH = 420
    const px = GAME_WIDTH / 2
    const py = GAME_HEIGHT / 2

    // 背景遮罩
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
    overlay.setDepth(1300)

    // 木牌面板
    const panel = this.add.graphics()
    panel.fillStyle(0x2a1a0c, 0.96)
    panel.fillRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 24)
    panel.lineStyle(10, 0x8b6914, 0.95)
    panel.strokeRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 24)
    panel.lineStyle(4, 0x3d2817, 1)
    panel.strokeRoundedRect(px - panelW / 2 + 12, py - panelH / 2 + 12, panelW - 24, panelH - 24, 16)
    panel.setDepth(1301)

    const titleText = this.add.text(px, py - 70, title, {
      fontSize: FONT_SIZE.XL,
      color: '#ffd700',
      fontFamily: FONT_TITLE,
      align: 'center',
      wordWrap: { width: panelW - 80 },
    }).setOrigin(0.5).setDepth(1302).setStroke('#3d2817', 8)

    if (subtitle) {
      this.add.text(px, py + 10, subtitle, {
        fontSize: FONT_SIZE.SM, color: '#f5e6c8', fontFamily: FONT_BODY, align: 'center',
      }).setOrigin(0.5).setDepth(1302).setStroke('#3d2817', 6)
    }

    // 确定按钮
    const btnBg = this.add.graphics()
    btnBg.fillStyle(0x8b5a2b, 1)
    btnBg.fillRoundedRect(px - 130, py + 120, 260, 80, 18)
    btnBg.lineStyle(6, 0x3d2817, 1)
    btnBg.strokeRoundedRect(px - 130, py + 120, 260, 80, 18)
    btnBg.setDepth(1302)
    const btnText = this.add.text(px, py + 160, '确 定', {
      fontSize: FONT_SIZE.MD, color: '#f5e6c8', fontFamily: FONT_TITLE, align: 'center',
    }).setOrigin(0.5).setDepth(1303).setStroke('#2a1808', 6)

    const zone = this.add.zone(px, py + 160, 260, 80).setInteractive({ useHandCursor: true })
    zone.setDepth(1304)
    zone.on('pointerdown', () => {
      zone.disableInteractive()
      overlay.destroy()
      panel.destroy()
      titleText.destroy()
      btnBg.destroy()
      btnText.destroy()
      onConfirm()
    })

    // 弹出动画
    panel.setAlpha(0)
    titleText.setAlpha(0)
    this.tweens.add({ targets: [panel, titleText], alpha: 1, duration: 300, ease: 'Quad.easeOut' })
  }

  /**
   * T6.8 战斗结算：调用后端 /api/level/settle-battle
   * 后端发放经验（自动升级）、星币，并按击杀敌人推进 kill_enemy 任务目标
   */
  private settleBattle(): void {
    const playerId = wsService.getPlayerId() ?? this.playerInfo.id
    const enemyIds = this.enemies.map((e) => e.id)

    fetch('/api/level/settle-battle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ battleId: this.battleId, playerId, enemyIds }),
    })
      .then((res) => res.json())
      .then((json) => {
        console.log('[BattleScene] Battle settled:', json?.data ?? json)
      })
      .catch((err) => {
        console.warn('[BattleScene] Battle settle failed:', err)
      })
  }

  /**
   * 退出战斗 — 返回GameScene
   */
  exitBattle(): void {
    // 胜利时提交经验/任务进度（仅一次）
    if (this.battleOutcome === 'victory' && !this.battleSettled) {
      this.battleSettled = true
      this.settleBattle()
    }

    this.game.events.emit('battle:end', { battleId: this.battleId })

    const sm = getSceneManager()
    if (sm) {
      sm.switchScene(SceneKey.Battle, SceneKey.Game, {}, SceneTransitions.exitBattle)
    } else {
      this.input.enabled = false
      this.cameras.main.fadeOut(400, 255, 255, 255)
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('GameScene')
      })
    }
  }

  // =============================================
  // 工具
  // =============================================

  /** 设置按钮可用状态 */
  private setButtonState(enabled: boolean): void {
    this.attackButton?.setAlpha(enabled ? 1 : 0.4)
    this.fleeButton?.setAlpha(enabled ? 1 : 0.4)
  }

  /** 等待 */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve))
  }

  /**
   * 场景shutdown时清理所有资源
   */
  shutdown(): void {
    // 清理键盘事件
    this.input.keyboard?.off('keydown-ESC')

    this.enemySprites.forEach((s) => s.destroy())
    this.enemySprites = []
    this.playerSprite?.destroy()
    this.playerSprite = null
    this.enemyShadows.forEach((s) => s.destroy())
    this.enemyShadows = []
    this.playerShadow?.destroy()
    this.playerShadow = null
    this.hpBarsEnemy.forEach((b) => b.destroy())
    this.hpBarsEnemy = []
    this.hpBarPlayer?.destroy()
    this.hpBarPlayer = null
    this.hpTextsEnemy.forEach((t) => t.destroy())
    this.hpTextsEnemy = []
    this.hpTextPlayer?.destroy()
    this.hpTextPlayer = null
    this.enemyNames.forEach((n) => n.destroy())
    this.enemyNames = []
    this.damageTexts.forEach((t) => t.destroy())
    this.damageTexts = []

    console.log('[BattleScene] Shutdown: all resources cleaned')
  }

  /**
   * 每帧更新
   */
  update(_time: number, _delta: number): void {
    // 回合制逻辑由玩家指令驱动
  }
}
