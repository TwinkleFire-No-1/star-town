import Phaser from 'phaser'
import { TILE_TEXTURES, tileImageKey } from '../data/TileTextures'
import { FONT_TITLE, FONT_BODY, FONT_SIZE } from '../typography'

/**
 * PreloadScene — 资源预加载场景（星露谷风格重设计）
 *
 * 职责：
 * - 加载所有美术资源（tileset/sprites/portraits/ui/icons）
 * - 显示木质边框 + 草绿色进度条
 * - 加载完成后自动切换到 GameScene
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' })
  }

  preload(): void {
    const { width, height } = this.cameras.main
    const centerX = width / 2
    const centerY = height / 2

    // --- 加载画面背景（AI 生成星空小镇夜景，回退程序化深棕夜空） ---
    let bg: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image | null = null
    let stars: Phaser.GameObjects.Graphics | null = null
    if (this.textures.exists('bg-loading')) {
      bg = this.add.image(width / 2, height / 2, 'bg-loading').setOrigin(0.5)
      bg.setDisplaySize(width, height)
    } else {
      bg = this.add.graphics()
      bg.fillStyle(0x1a1208, 1)
      bg.fillRect(0, 0, width, height)

      // 星空 — 程序化星点
      stars = this.add.graphics()
      for (let i = 0; i < 80; i++) {
        const sx = Math.random() * width
        const sy = Math.random() * (centerY + 60)
        const size = Math.random() < 0.7 ? 2 : 4
        const alpha = 0.3 + Math.random() * 0.7
        stars.fillStyle(0xfff8e7, alpha)
        stars.fillRect(sx, sy, size, size)
      }
    }

    // --- 加载进度 UI（木质风格，1080p） ---
    const barWidth = 1120
    const barHeight = 80
    const barX = centerX - barWidth / 2
    const barY = centerY + 40

    // 外框（木质）
    const progressBox = this.add.graphics()
    progressBox.fillStyle(0x3d2817, 0.9)
    progressBox.fillRoundedRect(barX - 16, barY - 16, barWidth + 32, barHeight + 32, 16)
    progressBox.lineStyle(8, 0x8b6914, 1)
    progressBox.strokeRoundedRect(barX - 16, barY - 16, barWidth + 32, barHeight + 32, 16)

    // 内底（深色）
    const progressBg = this.add.graphics()
    progressBg.fillStyle(0x1a1a0a, 1)
    progressBg.fillRect(barX, barY, barWidth, barHeight)

    // 进度填充
    const progressBar = this.add.graphics()

    // 标题 — 蜂蜜金 + 浮动动画（1080p 大标题）
    const titleText = this.add.text(centerX, centerY - 160, '星火小镇', {
      fontSize: FONT_SIZE.XL,
      color: '#e8a93c',
      fontFamily: FONT_TITLE,
    })
    titleText.setOrigin(0.5)

    // 标题浮动动画
    this.tweens.add({
      targets: titleText,
      y: centerY - 184,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    const subtitleText = this.add.text(centerX, centerY - 72, 'Spark Town Adventures', {
      fontSize: FONT_SIZE.MD,
      color: '#fff8e7',
      fontFamily: FONT_BODY,
    })
    subtitleText.setOrigin(0.5)

    // Loading 文字
    const loadingText = this.add.text(centerX, barY + barHeight + 64, 'Loading...', {
      fontSize: FONT_SIZE.SM,
      color: '#8b7355',
      fontFamily: FONT_BODY,
    })
    loadingText.setOrigin(0.5)

    // 百分比 — 像素字体
    const percentText = this.add.text(centerX, barY + barHeight + 128, '0%', {
      fontSize: FONT_SIZE.SM,
      color: '#e8a93c',
      fontFamily: FONT_TITLE,
    })
    percentText.setOrigin(0.5)

    // 底部标语
    const taglineText = this.add.text(centerX, height - 80, '每一个像素都藏着故事', {
      fontSize: FONT_SIZE.MD,
      color: '#8b7355',
      fontFamily: FONT_BODY,
    })
    taglineText.setOrigin(0.5)

    this.load.on('progress', (value: number) => {
      progressBar.clear()
      progressBar.fillStyle(0x5b8c3e, 1)
      progressBar.fillRect(barX, barY, barWidth * value, barHeight)
      // 蜂蜜金高光
      progressBar.fillStyle(0xe8a93c, 0.3)
      progressBar.fillRect(barX, barY, barWidth * value, 12)
      percentText.setText(`${Math.round(value * 100)}%`)
    })

    this.load.on('complete', () => {
      progressBar.destroy()
      progressBox.destroy()
      progressBg.destroy()
      titleText.destroy()
      subtitleText.destroy()
      loadingText.destroy()
      percentText.destroy()
      taglineText.destroy()
      stars?.destroy()
      bg?.destroy()
    })

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[PreloadScene] Failed to load: ${file.url}`)
    })

    // --- 加载游戏美术资源 ---
    this.loadGameAssets()
  }

  create(): void {
    // 生成程序化占位资源
    this.generateProceduralAssets()

    // 切换到 GameScene
    this.scene.start('GameScene')
  }

  /**
   * 加载外部游戏美术资源
   */
  private loadGameAssets(): void {
    // 背景插画（加载/标题/结算）
    this.load.image('bg-loading', 'assets/backgrounds/loading.png')
    this.load.image('bg-title', 'assets/backgrounds/title.png')
    this.load.image('bg-battle-result', 'assets/backgrounds/battle-result.png')

    // T7.x 回合制战斗场景背景（AI生成：赛尔号式左右分屏对战舞台）
    this.load.image('bg-battle-arena', 'assets/backgrounds/battle-arena.png')

    // 小镇 AI 大模型生成底图（1920×1664 整图：草地/道路/河流/桥/广场）
    // 作为城镇场景整图背景，建筑/NPC 精灵叠加其上；缺失时回退程序化 tile 渲染
    this.load.image('town-bg', 'assets/backgrounds/town-bg.png')

    // 瓦片集 — 2×2 网格(16×16/帧): 草地/泥土/石板/木地板
    this.load.spritesheet('tileset-town-ground', 'assets/tileset/town-ground.png', {
      frameWidth: 16,
      frameHeight: 16,
    })

    // 外部瓦片 PNG（64×64 高清，缺失时 TilesetManager 自动回退程序化绘制）
    // 地面类 PNG 现为 512×512 AI 无缝母图（ground-*.png），由 TilesetManager 平铺渲染
    for (const def of TILE_TEXTURES) {
      this.load.image(tileImageKey(def.file), `assets/tileset/${def.file}`)
    }

    // NPC 立绘 atlas
    this.load.spritesheet('portraits-npc', 'assets/portraits/npc/portraits-atlas.png', {
      frameWidth: 48,
      frameHeight: 48,
    })

    // 物品图标 atlas
    this.load.spritesheet('ui-icons', 'assets/ui/icons.png', {
      frameWidth: 16,
      frameHeight: 16,
    })

    // 玩家精灵图
    this.load.spritesheet('player-sprite', 'assets/sprites/player.png', {
      frameWidth: 16,
      frameHeight: 16,
    })

    // 敌人精灵图（T7.x AI重新生成：每怪2帧动作 spritesheet，frameWidth=frameSize）
    // 普通怪 192×192/帧，BOSS 224×224/帧；BattleScene 按 ID 映射
    const enemyIds = [
      'wolf', 'goblin', 'treant', 'ghost',
      'mushroom', 'boss_forest_guardian', 'shadow_minion', 'cave_worm',
    ]
    for (const enemyId of enemyIds) {
      const frameSize = enemyId === 'boss_forest_guardian' ? 224 : 192
      this.load.spritesheet(`enemy-${enemyId}`, `assets/sprites/enemies/${enemyId}.png`, {
        frameWidth: frameSize,
        frameHeight: frameSize,
      })
    }

    // T7.x 战斗主角精细精灵（AI生成2帧：待机/攻击，192×192/帧，战斗场景专用）
    this.load.spritesheet('battle-player', 'assets/sprites/battle-player.png', {
      frameWidth: 192,
      frameHeight: 192,
    })

    // NPC 精灵图（每个NPC一套）
    const npcIds = [
      'margaret', 'oldbuck', 'ella', 'ironanvil',
      'toby', 'lily', 'sylvia', 'marcus',
      'rossie', 'pip', 'gromm', 'silas',
      'gaoshuang',
      // 氛围NPC专属形象（T7.x 每个氛围NPC外观独立）
      'afu', 'cuihua', 'goudan', 'aniu', 'guihua', 'erya', 'shitou', 'pangshen', 'laoyang', 'tieniu',
      'lilu', 'baopengyu', 'tancheng', 'luxiao', 'yangyanfeng', 'tianlin', 'dangsiqi', 'chenye',
      'xiaochui', 'balian', 'ali', 'xiaoyao', 'zuimao', 'qinge', 'huaxiazi',
      'caiyun', 'tiaojianke', 'zhiniang', 'doudou', 'laochai', 'fengchen', 'laowa', 'ergao',
      // 乒乓球氛围NPC专属形象（郭彬红衣挥拍 / 祝轲轲蓝衣挥拍）
      'guobin', 'zhukeke',
    ]
    for (const npcId of npcIds) {
      this.load.spritesheet(`npc-${npcId}`, `assets/sprites/npc/${npcId}.png`, {
        frameWidth: 16,
        frameHeight: 16,
      })
    }

    // AI 生成建筑素材（星露谷风，透明PNG；缺失时 TownBuildingRenderer 回退程序化）
    const buildingIds = [
      'blacksmith', 'alchemist', 'tavern', 'market',
      'elder_hall', 'residential', 'forest_gate', 'mine_entrance',
      'plaza_fountain', 'deco_tree', 'deco_bush', 'deco_lamp',
      'pingpong_table',
    ]
    for (const bid of buildingIds) {
      this.load.image(`town-building-${bid}`, `assets/buildings/${bid}.png`)
    }

    // AI 生成室内底景图（星露谷风整室空景，1920×1088；家具由 tile 叠加，缺失时回退程序化渲染）
    const interiorIds = [
      'blacksmith', 'alchemist', 'tavern', 'market',
      'elder_hall', 'residential',
    ]
    for (const iid of interiorIds) {
      this.load.image(`interior-bg-${iid}`, `assets/interiors/${iid}.png`)
    }

    // AI 生成野外底景图（低语森林/废弃矿洞，1920×1088 星露谷风空景；
    // 与室内一致走 interior-bg-{id} 机制，缺失时回退程序化渲染）
    const wildIds = ['forest', 'mine']
    for (const wid of wildIds) {
      this.load.image(`interior-bg-${wid}`, `assets/interiors/${wid}.png`)
    }

    // 猫咪精灵表（模型生成的像素猫，256×64 = 4帧行走动画，帧64px）
    this.load.spritesheet('cat-xiaoju', 'assets/sprites/cat/cat-xiaoju.png', {
      frameWidth: 64,
      frameHeight: 64,
    })
    this.load.spritesheet('cat-xiaolihua', 'assets/sprites/cat/cat-xiaolihua.png', {
      frameWidth: 64,
      frameHeight: 64,
    })
  }

  /**
   * 程序化生成占位资源
   * Tileset和精灵现在由各系统在GameScene中生成
   */
  private generateProceduralAssets(): void {
    console.log('[PreloadScene] Procedural assets will be generated in GameScene')
  }
}
