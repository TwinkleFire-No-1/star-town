import Phaser from 'phaser'

/**
 * 方向枚举（4方向行走动画）
 */
export enum Direction {
  Down = 'down',
  Left = 'left',
  Right = 'right',
  Up = 'up',
}

/**
 * 角色动画键
 */
export const AnimKey = {
  IdleDown: 'idle_down',
  IdleLeft: 'idle_left',
  IdleRight: 'idle_right',
  IdleUp: 'idle_up',
  WalkDown: 'walk_down',
  WalkLeft: 'walk_left',
  WalkRight: 'walk_right',
  WalkUp: 'walk_up',
} as const

/**
 * 精灵配置
 */
export const SPRITE_CONFIG = {
  /** 外部资源帧宽（旧 16px PNG 精灵表兼容） */
  frameWidth: 16,
  /** 外部资源帧高 */
  frameHeight: 16,
  /** 程序化生成的高清帧宽（原生 64px，1920×1080 下精细不放大） */
  nativeFrameWidth: 64,
  /** 程序化生成的高清帧高 */
  nativeFrameHeight: 64,
  /** 每个方向的帧数 */
  framesPerDir: 4,
  /** 行走动画帧率 */
  walkFrameRate: 8,
  /** 待机呼吸动画帧率 */
  idleFrameRate: 2,
} as const

/**
 * SpriteGenerator — 程序化生成高清角色精灵
 *
 * 职责：
 * - 生成原生 64×64 高清角色精灵（4方向 × 4帧），细节丰富：头发层次/面部/服装渐变/描边
 * - 兼容旧 16px PNG 精灵表（外部资源存在时加载，按 displayScale 放大）
 * - 创建行走/待机动画
 * - 提供 getDisplayScale 查询每个纹理的显示倍率
 *
 * 精灵表布局（4方向 × 4帧，每帧 64×64）：
 * Row 0: Down  - 帧0(左脚) 帧1(站) 帧2(右脚) 帧3(站)
 * Row 1: Left  - 同上
 * Row 2: Right - 同上
 * Row 3: Up    - 同上
 */
export class SpriteGenerator {
  private scene: Phaser.Scene

  /** 纹理 → 显示倍率（程序化64px=1，外部16px PNG=4） */
  private textureScales = new Map<string, number>()

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * 获取指定纹理的显示倍率
   * 程序化生成的 64px 高清帧返回 1；外部 16px 资源返回 4（放大补偿）
   */
  getDisplayScale(textureKey: string): number {
    return this.textureScales.get(textureKey) ?? 1
  }

  /**
   * 生成/接入玩家精灵
   * 优先接入高清外部资源（64px帧）；低清16px资源跳过，使用程序化64px高清
   * T6.17 随机形象：传入 avatar ID（如 avatar_03）时按 PLAYER_AVATAR_SCHEMES 生成对应配色；
   * 不传或无法识别时使用默认主角配色
   */
  generatePlayerSprite(avatarId?: string): void {
    if (this.tryLoadExternalSprite('player', 'player-sprite')) {
      return
    }
    const scheme = (avatarId && PLAYER_AVATAR_SCHEMES[avatarId]) || {
      hairColor: 0x553311,
      skinColor: 0xffcc88,
      shirtColor: 0x3366cc,
      pantsColor: 0x554433,
      outlineColor: 0x221100,
    }
    this.generateCharacterSprite('player', scheme)
  }

  /**
   * T6.17 生成远程玩家形象精灵（纹理 key = player_avatar_{avatarId}）
   * 每个形象 ID 对应一套配色；同一形象可复用纹理，避免为每个在线玩家单独建纹理
   */
  generatePlayerAvatarSprite(avatarId: string): void {
    const key = this.getAvatarTextureKey(avatarId)
    if (this.scene.textures.exists(key)) {
      // 纹理已存在（另一远程玩家已生成），仅确保动画存在
      if (!this.scene.anims.exists(`${key}_walk_down`)) {
        this.createAnimations(key)
      }
      this.textureScales.set(key, 1)
      return
    }
    const scheme = PLAYER_AVATAR_SCHEMES[avatarId] ?? PLAYER_AVATAR_SCHEMES.avatar_01
    this.generateCharacterSprite(key, scheme)
  }

  /** 远程玩家形象纹理 key */
  getAvatarTextureKey(avatarId: string): string {
    const normalized = PLAYER_AVATAR_SCHEMES[avatarId] ? avatarId : 'avatar_01'
    return `player_avatar_${normalized}`
  }

  /**
   * 生成/接入NPC精灵
   * @param npcId NPC唯一ID（纹理key为 npc_{id}）
   * @param colorScheme 程序化配色（仅当无外部资源时使用）
   * @param externalAssetId 外部美术资源别名（复用已有NPC精灵图，如普通NPC复用 margaret.png）
   */
  generateNPCSprite(npcId: string, colorScheme?: Partial<CharacterColors>, externalAssetId?: string): void {
    // 规范化NPC ID → 美术资源ID（剥离 npc-/sc_ 前缀，中文名映射回英文资源基名）
    const normalizedId = normalizeNpcAssetId(npcId)
    // 显式传入外部资源别名优先；否则走规范化ID（含 NPC_ASSET_ALIAS 别名表）
    const assetId = externalAssetId ?? normalizedId
    if (this.tryLoadExternalSprite(`npc_${npcId}`, `npc-${assetId}`)) {
      return
    }
    const defaults: CharacterColors = {
      hairColor: 0x444444,
      skinColor: 0xffcc88,
      shirtColor: 0x884422,
      pantsColor: 0x554433,
      outlineColor: 0x221100,
    }
    const scheme = colorScheme ?? NPC_COLOR_SCHEMES[normalizedId]
    this.generateCharacterSprite(`npc_${npcId}`, { ...defaults, ...scheme })
  }

  /**
   * 接入外部精灵表（仅接受高清资源）
   * - 高清资源（单帧≥48px，如 256×192）：按 64px 切割，scale=1
   * - 低清资源（单帧16px，如 64×48）：跳过，返回 false（交由程序化64px高清生成）
   */
  private tryLoadExternalSprite(key: string, externalKey: string): boolean {
    if (!this.scene.textures.exists(externalKey)) {
      return false
    }

    const external = this.scene.textures.get(externalKey)
    const sourceImage = external.getSourceImage() as HTMLImageElement
    // 精灵表 4列(方向) × 3行(帧)：单帧宽 = 宽/4，单帧高 = 高/3
    const imgW = sourceImage.width
    const imgH = sourceImage.height
    const frameW = imgW / 4
    const frameH = imgH / 3

    // 仅接受高清外部资源（单帧≥48px）；低清16px资源放大后粗糙，改用程序化高清
    const isHighRes = frameW >= 48 && frameH >= 48
    if (!isHighRes) {
      console.log(
        `[SpriteGenerator] Skip low-res external sprite: ${externalKey} ` +
        `(${imgW}x${imgH}, frame=${Math.round(frameW)}px) → using procedural HD 64px`,
      )
      return false
    }
    const frameSize = 64

    // 若已注册过则直接建动画
    const alreadyRegistered = this.scene.textures.exists(key)

    if (!alreadyRegistered) {
      this.scene.textures.addSpriteSheet(key, sourceImage, {
        frameWidth: frameSize,
        frameHeight: frameSize,
      })
    }

    // 方向按列（0=down,1=left,2=right,3=up），帧按行（3行）
    this.createAnimationsFromSheet(key, frameSize)
    this.textureScales.set(key, 1)
    console.log(
      `[SpriteGenerator] Loaded HD external sprite: ${key} ← ${externalKey} ` +
      `(${imgW}x${imgH}, frame=${frameSize}px)`,
    )
    return true
  }

  /**
   * 为外部精灵表创建动画（4列方向 × 3行帧）
   * 场景切换重建同ID NPC时动画可能已注册，先检查避免重复注册警告
   */
  private createAnimationsFromSheet(key: string, _frameSize: number): void {
    if (this.scene.anims.exists(`${key}_walk_down`)) return
    const { walkFrameRate, idleFrameRate } = SPRITE_CONFIG
    const directions: Direction[] = [Direction.Down, Direction.Left, Direction.Right, Direction.Up]
    const cols = 4
    const rows = 3

    directions.forEach((dir, col) => {
      // 行走动画：该列3帧循环
      const walkFrames = Array.from({ length: rows }, (_, r) => col + r * cols)
      this.scene.anims.create({
        key: `${key}_walk_${dir}`,
        frames: walkFrames.map((f) => ({ key, frame: f })),
        frameRate: walkFrameRate,
        repeat: -1,
      })

      // 待机动画：该列首帧（站立姿态）
      this.scene.anims.create({
        key: `${key}_idle_${dir}`,
        frames: [{ key, frame: col }],
        frameRate: idleFrameRate,
        repeat: -1,
      })
    })
  }

  /**
   * 生成高清角色精灵表和动画（原生 64px 帧）
   */
  private generateCharacterSprite(
    key: string,
    colors: CharacterColors,
  ): void {
    const { nativeFrameWidth, nativeFrameHeight, framesPerDir } = SPRITE_CONFIG

    // 场景切换可能重建同ID NPC：纹理已存在时跳过生成，仅补动画
    if (this.scene.textures.exists(key)) {
      // 动画可能未建（如旧占位→新ID场景），安全重建
      if (!this.scene.anims.exists(`${key}_walk_down`)) {
        this.createAnimations(key)
      }
      this.textureScales.set(key, 1)
      return
    }

    // 创建精灵表 canvas（64×4 = 256 宽，64×4 = 256 高）
    const canvas = this.scene.textures.createCanvas(
      `${key}_spritesheet`,
      nativeFrameWidth * framesPerDir,
      nativeFrameHeight * 4, // 4行(4方向)
    )

    if (!canvas) {
      console.warn(`[SpriteGenerator] Failed to create canvas for ${key}`)
      return
    }

    const ctx = canvas.getContext()

    // 逐方向逐帧绘制（64px 高清）
    const directions: Direction[] = [Direction.Down, Direction.Left, Direction.Right, Direction.Up]
    directions.forEach((dir, row) => {
      for (let frame = 0; frame < framesPerDir; frame++) {
        const ox = frame * nativeFrameWidth
        const oy = row * nativeFrameHeight
        this.drawCharacterFrame64(ctx, ox, oy, dir, frame, colors)
      }
    })

    canvas.refresh()

    // 添加精灵表
    this.scene.textures.addSpriteSheet(
      key,
      canvas.getCanvas() as unknown as HTMLImageElement,
      { frameWidth: nativeFrameWidth, frameHeight: nativeFrameHeight },
    )

    // 记录显示倍率：原生高清 = 1
    this.textureScales.set(key, 1)

    // 创建动画
    this.createAnimations(key)

    console.log(`[SpriteGenerator] Generated HD sprite: ${key} (64px native)`)
  }

  /**
   * 颜色明暗计算
   */
  private shade(color: number, factor: number): number {
    const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)))
    const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)))
    const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)))
    return (r << 16) | (g << 8) | b
  }

  /**
   * 绘制单帧高清角色像素（原生 64×64）
   *
   * 角色结构（64×64）：
   * - 头部 y=2..26（头发层次 + 脸 + 五官）
   * - 身体 y=26..48（衬衫 + 领口 + 腰带 + 手臂）
   * - 腿 y=48..62（裤子 + 靴子）
   * - 全周深色描边
   */
  private drawCharacterFrame64(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    direction: Direction,
    frame: number,
    colors: CharacterColors,
  ): void {
    // 行走偏移（帧0左脚前/帧2右脚前，帧1/3站立）
    const walkOffset = frame === 0 ? -1 : frame === 2 ? 1 : 0
    const isWalking = frame === 0 || frame === 2

    const hair = colors.hairColor
    const hairDark = this.shade(hair, 0.7)
    const hairLight = this.shade(hair, 1.25)
    const skin = colors.skinColor
    const skinShadow = this.shade(skin, 0.85)
    const shirt = colors.shirtColor
    const shirtDark = this.shade(shirt, 0.7)
    const shirtLight = this.shade(shirt, 1.2)
    const pants = colors.pantsColor
    const pantsDark = this.shade(pants, 0.7)
    const pantsLight = this.shade(pants, 1.15)
    const outline = colors.outlineColor

    const F = (x: number, y: number, w: number, h: number, c: number) => {
      ctx.fillStyle = this.hexToRgba(c)
      ctx.fillRect(ox + x, oy + y, w, h)
    }

    // ============================================
    // 描边轮廓（先画底层轮廓）
    // ============================================
    F(18, 2, 28, 60, outline) // 整体轮廓底

    // ============================================
    // 头部
    // ============================================
    // 头发主块（顶部 + 两侧）
    F(20, 3, 24, 7, hairDark)    // 头顶暗部
    F(21, 4, 22, 6, hair)        // 头顶主色
    F(22, 5, 20, 6, hairLight)   // 头顶高光
    F(20, 8, 24, 12, hair)       // 侧发（头部两侧）
    F(20, 9, 3, 10, hairDark)    // 左侧发暗
    F(41, 9, 3, 10, hairDark)    // 右侧发暗

    // 刘海（覆盖额头）
    F(22, 9, 20, 3, hair)
    F(24, 9, 4, 2, hairLight)

    if (direction === Direction.Up) {
      // 背面：头发占满头部（无脸）
      F(22, 11, 20, 10, hair)
      F(24, 13, 16, 3, hairLight)
    } else {
      // 脸（正面/侧面）
      F(23, 12, 18, 10, skin)
      // 下巴阴影
      F(23, 20, 18, 2, skinShadow)

      if (direction === Direction.Down) {
        // 正面：双眼 + 嘴
        F(27, 15, 2, 2, 0x1a1008)   // 左眼
        F(35, 15, 2, 2, 0x1a1008)   // 右眼
        F(28, 15, 1, 1, 0xffffff)   // 左眼高光
        F(36, 15, 1, 1, 0xffffff)   // 右眼高光
        F(30, 18, 4, 1, 0x8a5a3a)   // 嘴
      } else if (direction === Direction.Left) {
        // 左侧面：单眼（面部右侧）
        F(35, 15, 2, 2, 0x1a1008)
        F(36, 15, 1, 1, 0xffffff)
        F(31, 18, 4, 1, 0x8a5a3a)
      } else {
        // 右侧面：单眼（面部左侧）
        F(27, 15, 2, 2, 0x1a1008)
        F(27, 15, 1, 1, 0xffffff)
        F(29, 18, 4, 1, 0x8a5a3a)
      }
      // 腮红
      F(24, 17, 3, 1, this.shade(0xcc6666, 0.6))
      F(37, 17, 3, 1, this.shade(0xcc6666, 0.6))
    }

    // ============================================
    // 身体（衬衫）
    // ============================================
    // 肩膀
    F(19, 24, 26, 4, shirtDark)
    F(21, 25, 22, 3, shirt)
    // 躯干
    F(20, 28, 24, 18, shirt)
    F(21, 28, 22, 16, shirtLight)  // 躯干亮部
    // 躯干阴影（两侧）
    F(20, 28, 2, 18, shirtDark)
    F(42, 28, 2, 18, shirtDark)
    // 领口
    F(28, 26, 8, 3, shirtDark)
    F(30, 27, 4, 2, this.shade(shirt, 0.5))
    // 腰带
    F(20, 42, 24, 3, shirtDark)
    F(30, 42, 4, 3, 0x9a7b2c) // 腰带扣

    // 手臂（两侧，行走摆动）
    const armSwing = isWalking ? walkOffset * 3 : 0
    if (direction === Direction.Down || direction === Direction.Up) {
      F(16, 27 + armSwing, 4, 12, shirt)       // 左臂
      F(16, 27 + armSwing, 1, 13, shirtDark)   // 左臂暗
      F(44, 27 - armSwing, 4, 12, shirt)       // 右臂
      F(47, 27 - armSwing, 1, 13, shirtDark)   // 右臂暗
    } else if (direction === Direction.Left) {
      F(16, 27 + armSwing, 4, 12, shirt)
      F(16, 27 + armSwing, 1, 13, shirtDark)
    } else {
      F(44, 27 - armSwing, 4, 12, shirt)
      F(47, 27 - armSwing, 1, 13, shirtDark)
    }

    // ============================================
    // 腿（裤子 + 靴子）
    // ============================================
    if (isWalking) {
      // 行走：一条腿前一条腿后（腿长度差 + 位置微偏）
      F(22, 45 + walkOffset * 2, 9, 12 - walkOffset * 2, pants)       // 左腿
      F(22, 45, 9, 3, pantsLight)
      F(33, 45 - walkOffset * 2, 9, 12 + walkOffset * 2, pants)       // 右腿
      F(33, 45, 9, 3, pantsLight)
      F(33, 45 + 8, 9, 2, pantsDark) // 右腿阴影
    } else {
      // 站立：双腿并拢
      F(22, 45, 20, 12, pants)
      F(24, 45, 16, 3, pantsLight)
      F(22, 53, 20, 2, pantsDark)
    }
    // 靴子
    F(21, 56, 11, 5, this.shade(colors.pantsColor, 0.45))
    F(32, 56, 11, 5, this.shade(colors.pantsColor, 0.45))
    F(21, 56, 1, 5, outline)
    F(42, 56, 1, 5, outline)

    // ============================================
    // 最后重绘描边（顶部与底部）
    // ============================================
    F(19, 2, 26, 1, outline) // 头顶描边
    F(18, 61, 28, 1, outline) // 脚底描边
  }

  /**
   * 创建4方向行走/待机动画
   */
  private createAnimations(key: string): void {
    const { framesPerDir, walkFrameRate, idleFrameRate } = SPRITE_CONFIG
    const directions: Direction[] = [Direction.Down, Direction.Left, Direction.Right, Direction.Up]

    directions.forEach((dir, row) => {
      const startIndex = row * framesPerDir

      // 行走动画：帧序列 0→1→2→3（循环）
      this.scene.anims.create({
        key: `${key}_walk_${dir}`,
        frames: this.scene.anims.generateFrameNumbers(key, {
          start: startIndex,
          end: startIndex + framesPerDir - 1,
        }),
        frameRate: walkFrameRate,
        repeat: -1,
      })

      // 待机动画：帧1（站姿）+ 微小帧偏移模拟呼吸
      this.scene.anims.create({
        key: `${key}_idle_${dir}`,
        frames: [
          { key, frame: startIndex + 1 },
          { key, frame: startIndex + 3 },
        ],
        frameRate: idleFrameRate,
        repeat: -1,
        yoyo: true,
      })
    })
  }

  /**
   * 数字颜色转 rgba 字符串
   */
  private hexToRgba(color: number, alpha = 1): string {
    const r = (color >> 16) & 0xff
    const g = (color >> 8) & 0xff
    const b = color & 0xff
    return `rgba(${r},${g},${b},${alpha})`
  }
}

/**
 * 角色颜色方案
 */
interface CharacterColors {
  hairColor: number
  skinColor: number
  shirtColor: number
  pantsColor: number
  outlineColor: number
}

/**
 * T6.17 在线玩家系统：玩家外观形象预设（与后端 PLAYER_AVATARS 对应）
 * 注册时随机分配 avatar ID，前端按此表生成不同配色的玩家精灵
 * 12 套形象：不同发色/肤色/服装组合，让每个玩家形象可区分
 */
export const PLAYER_AVATAR_SCHEMES: Record<string, CharacterColors> = {
  avatar_01: { hairColor: 0x553311, skinColor: 0xffcc88, shirtColor: 0x3366cc, pantsColor: 0x554433, outlineColor: 0x221100 }, // 棕发蓝衣
  avatar_02: { hairColor: 0xcc3333, skinColor: 0xffcc88, shirtColor: 0xee8844, pantsColor: 0x663322, outlineColor: 0x221100 }, // 红发橙衣
  avatar_03: { hairColor: 0xffdd44, skinColor: 0xffd9b3, shirtColor: 0x44aa44, pantsColor: 0x336633, outlineColor: 0x221100 }, // 金发绿衣
  avatar_04: { hairColor: 0x222222, skinColor: 0xcc9966, shirtColor: 0x884488, pantsColor: 0x442244, outlineColor: 0x110011 }, // 黑发紫衣
  avatar_05: { hairColor: 0x884422, skinColor: 0xffcc88, shirtColor: 0xcc7700, pantsColor: 0x664422, outlineColor: 0x221100 }, // 褐发橙衣
  avatar_06: { hairColor: 0x7788ee, skinColor: 0xffe0c0, shirtColor: 0xcc5555, pantsColor: 0x553333, outlineColor: 0x221100 }, // 蓝发红衣
  avatar_07: { hairColor: 0xff66aa, skinColor: 0xffcc88, shirtColor: 0x66cccc, pantsColor: 0x335566, outlineColor: 0x221100 }, // 粉发青衣
  avatar_08: { hairColor: 0x667733, skinColor: 0xccaa77, shirtColor: 0x887744, pantsColor: 0x443322, outlineColor: 0x221100 }, // 绿发棕衣
  avatar_09: { hairColor: 0x9933cc, skinColor: 0xffcc88, shirtColor: 0x4477aa, pantsColor: 0x223344, outlineColor: 0x110022 }, // 紫发蓝衣
  avatar_10: { hairColor: 0xdddddd, skinColor: 0xffd0a8, shirtColor: 0x555566, pantsColor: 0x333344, outlineColor: 0x111122 }, // 白发灰衣
  avatar_11: { hairColor: 0x336633, skinColor: 0xffcc88, shirtColor: 0xcc3344, pantsColor: 0x443333, outlineColor: 0x221100 }, // 深绿发红衣
  avatar_12: { hairColor: 0xcc8844, skinColor: 0xf0b878, shirtColor: 0x5566cc, pantsColor: 0x334466, outlineColor: 0x221100 }, // 浅棕发蓝衣
}

/**
 * NPC颜色方案预设
 * 12个NPC各有独特配色
 */
export const NPC_COLOR_SCHEMES: Record<string, Partial<CharacterColors>> = {
  // 核心NPC
  margaret: { hairColor: 0xcc3333, shirtColor: 0x663399, pantsColor: 0x333355 },    // 玛格丽特-红发紫袍
  old_buck: { hairColor: 0x888888, shirtColor: 0x886644, pantsColor: 0x443322 },    // 老巴克-灰发棕衣
  ella: { hairColor: 0xffdd44, shirtColor: 0x44aa44, pantsColor: 0x336633 },        // 艾拉-金发绿衣
  anvil: { hairColor: 0x443322, shirtColor: 0x993333, pantsColor: 0x553333 },       // 铁砧-深发红衣
  toby: { hairColor: 0x884422, shirtColor: 0x3366cc, pantsColor: 0x223355 },       // 托比-棕发蓝衣
  lily: { hairColor: 0xff66aa, shirtColor: 0xff99cc, pantsColor: 0x885577 },        // 莉莉-粉发粉衣
  // 次要NPC
  sylvia: { hairColor: 0xeecc88, shirtColor: 0x778844, pantsColor: 0x445533 },     // 西尔维娅-金发绿袍
  marcus: { hairColor: 0x222222, shirtColor: 0x445566, pantsColor: 0x334455 },      // 马库斯-黑发灰甲
  rosy: { hairColor: 0xbb4488, shirtColor: 0xcc7700, pantsColor: 0x664422 },       // 罗西-紫发橙衣
  pip: { hairColor: 0xff8833, shirtColor: 0x44cc44, pantsColor: 0x336633 },        // 小皮普-橙发绿衣
  // 剧情NPC
  grom: { hairColor: 0x556644, shirtColor: 0x445533, pantsColor: 0x334422 },       // 格罗姆-绿发暗袍
  silas: { hairColor: 0x110011, shirtColor: 0x330033, pantsColor: 0x220022 },      // 暗祭司-黑发紫袍
}

/**
 * T6.3.5: 游戏内NPC id → 美术资源文件 id 别名映射
 * （GameScene 占位数据与 PreloadScene 资源命名存在差异）
 */
export const NPC_ASSET_ALIAS: Record<string, string> = {
  old_buck: 'oldbuck',
  anvil: 'ironanvil',
  rosie: 'rossie',
  grom: 'gromm',
}

/**
 * NPC中文名 → 美术资源文件基名（public/assets/sprites/npc/{base}.png）
 * 后端NPC档案 name 为中文，美术资源文件为英文基名，用于跨语言映射
 */
export const NPC_ASSET_BY_NAME: Record<string, string> = {
  玛格丽特: 'margaret',
  老巴克: 'oldbuck',
  艾拉: 'ella',
  铁砧: 'ironanvil',
  托比: 'toby',
  莉莉: 'lily',
  西尔维娅: 'sylvia',
  马库斯: 'marcus',
  罗西: 'rossie',
  小皮普: 'pip',
  格罗姆: 'gromm',
  暗祭司塞拉斯: 'silas',
  塞拉斯: 'silas',
}

/**
 * 规范化NPC ID → 美术资源ID（英文文件基名）
 * - 后端真实ID: npc-margaret / npc-bark → margaret / oldbuck（经中文名映射）
 * - 场景占位ID: sc_玛格丽特 → margaret
 * - 本地占位ID: margaret / old_buck / rosie → 原英文基名或别名
 */
export function normalizeNpcAssetId(npcId: string): string {
  let id = npcId
  if (id.startsWith('npc-')) id = id.slice(4)
  if (id.startsWith('sc_')) id = id.slice(3)
  const byName = NPC_ASSET_BY_NAME[id]
  if (byName) return byName
  return NPC_ASSET_ALIAS[id] ?? id
}
