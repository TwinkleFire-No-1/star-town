// 星火小镇 — 种子数据
// 12个NPC的初始数据 + 初始物品 + 初始任务

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('[Seed] Seeding database...')

  // ============================================
  // 1. 创建12个NPC
  // ============================================

  const npcs = [
    // --- 核心NPC (6个) ---
    {
      name: '玛格丽特',
      title: '酒馆老板娘',
      role: 'merchant',
      personality: '热情好客、精明干练，对镇上每个人的秘密都了如指掌。表面和善，但绝不欠任何人情。',
      backstory: '继承亡夫的酒馆，独自经营二十年。是小镇信息的交汇点，也是暗流的知情人。',
      x: 100,
      y: 80,
      direction: 'down',
      schedule: [
        { hour: 6, location: '酒馆厨房', action: '准备早餐' },
        { hour: 8, location: '酒馆大厅', action: '营业' },
        { hour: 12, location: '酒馆大厅', action: '午餐高峰' },
        { hour: 18, location: '酒馆大厅', action: '晚间营业' },
        { hour: 22, location: '酒馆后院', action: '打烊休息' },
      ],
      hp: 60,
      maxHp: 60,
      attack: 4,
      defense: 2,
      speed: 5,
    },
    {
      name: '老巴克',
      title: '铁匠',
      role: 'merchant',
      personality: '沉默寡言但技艺精湛，脾气暴躁但对学徒极有耐心。手臂上有古老的符文疤痕。',
      backstory: '曾是远征军团的武器师，退役后隐居小镇。知道精灵遗迹的秘密入口。',
      x: 200,
      y: 60,
      direction: 'down',
      schedule: [
        { hour: 7, location: '铁匠铺', action: '生火开炉' },
        { hour: 9, location: '铁匠铺', action: '锻造' },
        { hour: 13, location: '铁匠铺', action: '午后锻打' },
        { hour: 17, location: '酒馆', action: '喝一杯' },
        { hour: 20, location: '家', action: '休息' },
      ],
      hp: 120,
      maxHp: 120,
      attack: 15,
      defense: 12,
      speed: 6,
    },
    {
      name: '艾拉',
      title: '草药师',
      role: 'quest_giver',
      personality: '温柔但神秘，说话常带隐晦的比喻。与森林中的精灵有某种联系。',
      backstory: '森林边缘长大的孤儿，被前任草药师收养。能听到植物的"低语"。',
      x: 260,
      y: 100,
      direction: 'down',
      schedule: [
        { hour: 5, location: '森林', action: '采集晨露草药' },
        { hour: 9, location: '药草铺', action: '整理药材' },
        { hour: 14, location: '药草铺', action: '配药' },
        { hour: 18, location: '森林边缘', action: '与精灵交流' },
        { hour: 21, location: '家', action: '休息' },
      ],
      hp: 70,
      maxHp: 70,
      attack: 6,
      defense: 3,
      speed: 8,
    },
    {
      name: '铁砧',
      title: '矿工头目',
      role: 'villager',
      personality: '粗犷豪爽，爱讲笑话。但提到矿洞深处就变得严肃。',
      backstory: '发现矿洞中异常矿石的矿工，矿石似乎与精灵魔法有关。',
      x: 180,
      y: 120,
      direction: 'down',
      schedule: [
        { hour: 6, location: '矿洞入口', action: '集合矿工' },
        { hour: 8, location: '矿洞', action: '采矿' },
        { hour: 12, location: '矿洞休息区', action: '午餐' },
        { hour: 14, location: '矿洞', action: '继续采矿' },
        { hour: 18, location: '酒馆', action: '与矿工喝酒' },
      ],
      hp: 100,
      maxHp: 100,
      attack: 12,
      defense: 10,
      speed: 5,
    },
    {
      name: '托比',
      title: '游商',
      role: 'merchant',
      personality: '油嘴滑舌但讲义气，信息灵通。总是在寻找稀有物品。',
      backstory: '走遍大陆的游商，声称见过"星火"的碎片。与外界联系密切。',
      x: 140,
      y: 140,
      direction: 'down',
      schedule: [
        { hour: 7, location: '集市', action: '摆摊' },
        { hour: 10, location: '小镇各处', action: '走动叫卖' },
        { hour: 13, location: '酒馆', action: '午餐兼收集情报' },
        { hour: 15, location: '集市', action: '继续摆摊' },
        { hour: 19, location: '酒馆', action: '交易与闲聊' },
      ],
      hp: 50,
      maxHp: 50,
      attack: 5,
      defense: 3,
      speed: 9,
    },
    {
      name: '莉莉',
      title: '面包师',
      role: 'villager',
      personality: '天真活泼，总是笑嘻嘻的。但偶尔会说出让人意外的话。',
      backstory: '小镇面包师，烘焙手艺一流。暗地里是小镇"八卦网络"的核心节点。',
      x: 80,
      y: 100,
      direction: 'down',
      schedule: [
        { hour: 4, location: '面包房', action: '烘焙' },
        { hour: 8, location: '面包房', action: '售卖' },
        { hour: 12, location: '小镇广场', action: '送面包兼聊天' },
        { hour: 15, location: '面包房', action: '下午烘焙' },
        { hour: 18, location: '小镇广场', action: '散步' },
      ],
      hp: 45,
      maxHp: 45,
      attack: 2,
      defense: 2,
      speed: 7,
    },
    // --- 次要NPC (4个) ---
    {
      name: '西尔维娅',
      title: '图书管理员',
      role: 'villager',
      personality: '安静优雅，博学多识。守护着图书馆中禁止借阅的秘密典籍。',
      backstory: '来自首都的学者，因为某个禁忌研究被流放到小镇。',
      x: 220,
      y: 140,
      direction: 'down',
      schedule: [
        { hour: 9, location: '图书馆', action: '整理书籍' },
        { hour: 12, location: '图书馆', action: '研究' },
        { hour: 17, location: '小镇广场', action: '散步' },
      ],
      hp: 40,
      maxHp: 40,
      attack: 3,
      defense: 2,
      speed: 6,
    },
    {
      name: '马库斯',
      title: '卫兵队长',
      role: 'villager',
      personality: '正直但固执，严格执行规则。暗中调查小镇异常事件。',
      backstory: '被派驻小镇维持治安，逐渐发现了"暗影祭司"的踪迹。',
      x: 160,
      y: 40,
      direction: 'down',
      schedule: [
        { hour: 6, location: '卫兵所', action: '晨会' },
        { hour: 8, location: '小镇巡逻', action: '巡逻' },
        { hour: 14, location: '卫兵所', action: '训练' },
        { hour: 20, location: '小镇巡逻', action: '夜间巡逻' },
      ],
      hp: 110,
      maxHp: 110,
      attack: 14,
      defense: 11,
      speed: 7,
    },
    {
      name: '罗西',
      title: '花匠',
      role: 'villager',
      personality: '开朗勤劳，对花草有特殊感情。培育出能在夜间发光的花。',
      backstory: '精灵后裔，自己并不知情。她培育的夜光花与星火有微妙共鸣。',
      x: 300,
      y: 160,
      direction: 'down',
      schedule: [
        { hour: 6, location: '花园', action: '浇花' },
        { hour: 9, location: '花店', action: '营业' },
        { hour: 15, location: '花园', action: '修剪' },
        { hour: 19, location: '小镇广场', action: '散步' },
      ],
      hp: 35,
      maxHp: 35,
      attack: 2,
      defense: 1,
      speed: 6,
    },
    {
      name: '小皮普',
      title: '信使',
      role: 'villager',
      personality: '机灵活泼，跑得飞快。好奇心旺盛，什么秘密都藏不住。',
      backstory: '孤儿，被小镇居民共同抚养。充当信使和跑腿，消息最灵通。',
      x: 120,
      y: 160,
      direction: 'down',
      schedule: [
        { hour: 7, location: '小镇各处', action: '送信' },
        { hour: 11, location: '酒馆', action: '收集消息' },
        { hour: 14, location: '小镇各处', action: '送信' },
        { hour: 17, location: '广场', action: '玩耍' },
      ],
      hp: 30,
      maxHp: 30,
      attack: 2,
      defense: 1,
      speed: 12,
    },
    // --- 剧情NPC (2个) ---
    {
      name: '格罗姆',
      title: '隐居术士',
      role: 'quest_giver',
      personality: '古怪孤僻，说话艰涩。拥有关于星火的关键知识，但不愿轻易透露。',
      backstory: '数百年前参与封印暗影之神的术士后裔，守护着最后的封印。',
      x: 290,
      y: 50,
      direction: 'down',
      schedule: [
        { hour: 0, location: '隐居小屋', action: '研究古卷' },
        { hour: 6, location: '隐居小屋', action: '冥想' },
        { hour: 12, location: '森林深处', action: '采集魔法材料' },
        { hour: 18, location: '隐居小屋', action: '施法维护封印' },
      ],
      hp: 80,
      maxHp: 80,
      attack: 20,
      defense: 8,
      speed: 6,
    },
    {
      name: '暗祭司塞拉斯',
      title: '暗影信徒',
      role: 'boss',
      personality: '表面温和虔诚，实际冷酷狂热。用伪善面具隐藏真实目的。',
      backstory: '渗透进小镇的暗影祭司，企图解除暗影之神的封印。以牧师身份作为掩护。',
      x: 60,
      y: 40,
      direction: 'down',
      schedule: [
        { hour: 6, location: '教堂', action: '晨祷' },
        { hour: 9, location: '小镇各处', action: '走访信徒' },
        { hour: 15, location: '教堂', action: '布道' },
        { hour: 22, location: '森林暗处', action: '暗影仪式' },
      ],
      hp: 200,
      maxHp: 200,
      attack: 25,
      defense: 15,
      speed: 8,
    },
  ]

  console.log('[Seed] Creating NPCs...')
  for (const npcData of npcs) {
    const npc = await prisma.nPC.create({
      data: {
        name: npcData.name,
        title: npcData.title,
        role: npcData.role,
        personality: npcData.personality,
        backstory: npcData.backstory,
        x: npcData.x,
        y: npcData.y,
        direction: npcData.direction,
        schedule: npcData.schedule,
        hp: npcData.hp,
        maxHp: npcData.maxHp,
        attack: npcData.attack,
        defense: npcData.defense,
        speed: npcData.speed,
      },
    })
    console.log(`[Seed] Created NPC: ${npc.name}`)
  }

  // ============================================
  // 2. 创建初始物品
  // ============================================

  const items = [
    { name: '木剑', description: '普通的训练木剑', category: 'weapon', attack: 3, buyPrice: 50, sellPrice: 20 },
    { name: '铁剑', description: '铁匠打造的利剑', category: 'weapon', attack: 8, buyPrice: 200, sellPrice: 80 },
    { name: '精灵之刃', description: '蕴含精灵力量的古剑', category: 'weapon', attack: 15, buyPrice: 0, sellPrice: 500 },
    { name: '皮甲', description: '轻便的皮甲', category: 'armor', defense: 3, buyPrice: 80, sellPrice: 30 },
    { name: '铁甲', description: '厚重的铁甲', category: 'armor', defense: 8, buyPrice: 300, sellPrice: 120 },
    { name: '草药', description: '简单的治疗草药', category: 'consumable', healHp: 30, buyPrice: 20, sellPrice: 8 },
    { name: '高级药水', description: '强效治疗药水', category: 'consumable', healHp: 80, buyPrice: 80, sellPrice: 30 },
    { name: '魔法精华', description: '恢复精神力的精华', category: 'consumable', healSp: 40, buyPrice: 60, sellPrice: 25 },
    { name: '铁矿', description: '矿洞中开采的铁矿石', category: 'material', buyPrice: 15, sellPrice: 10 },
    { name: '精灵石', description: '散发微光的神秘石头', category: 'material', buyPrice: 100, sellPrice: 60 },
    { name: '星火碎片', description: '传说中的星火碎片，蕴含强大力量', category: 'quest', buyPrice: 0, sellPrice: 0, stackable: false, maxStack: 1 },
    { name: '面包', description: '莉莉烤制的香喷喷的面包', category: 'consumable', healHp: 15, buyPrice: 10, sellPrice: 4 },
  ]

  console.log('[Seed] Creating items...')
  for (const itemData of items) {
    const item = await prisma.item.create({ data: itemData })
    console.log(`[Seed] Created Item: ${item.name}`)
  }

  // ============================================
  // 3. 创建初始任务
  // ============================================

  const quests = [
    {
      title: '初到小镇',
      description: '你来到了星火小镇，先去酒馆找玛格丽特了解情况吧。',
      type: 'main',
      chapter: 0,
      triggerCond: { type: 'auto' },
      completeCond: { type: 'talk_to_npc', npcId: '玛格丽特' },
      rewardExp: 10,
      rewardCoins: 20,
    },
    {
      title: '森林低语',
      description: '艾拉说森林中传来奇怪的声响，需要你去调查。',
      type: 'main',
      chapter: 1,
      triggerCond: { type: 'quest_complete', questTitle: '初到小镇' },
      completeCond: { type: 'explore', location: '森林深处' },
      rewardExp: 50,
      rewardCoins: 100,
    },
    {
      title: '铁匠的委托',
      description: '老巴克需要一些特殊的矿石来打造武器。',
      type: 'side',
      chapter: 1,
      triggerCond: { type: 'talk_to_npc', npcId: '老巴克' },
      completeCond: { type: 'collect', item: '铁矿', quantity: 5 },
      rewardExp: 30,
      rewardCoins: 80,
      rewardItems: [{ item: '铁剑', quantity: 1 }],
    },
    {
      title: '草药师的秘密',
      description: '艾拉需要你帮忙采集一种罕见的夜光花。',
      type: 'side',
      chapter: 1,
      triggerCond: { type: 'talk_to_npc', npcId: '艾拉' },
      completeCond: { type: 'collect', item: '夜光花', quantity: 3 },
      rewardExp: 40,
      rewardCoins: 60,
    },
    {
      title: '面包师的烦恼',
      description: '莉莉的面粉用完了，帮她找一些来。',
      type: 'side',
      chapter: 0,
      triggerCond: { type: 'talk_to_npc', npcId: '莉莉' },
      completeCond: { type: 'collect', item: '面粉', quantity: 3 },
      rewardExp: 15,
      rewardCoins: 30,
      rewardItems: [{ item: '面包', quantity: 5 }],
    },
  ]

  console.log('[Seed] Creating quests...')
  for (const questData of quests) {
    const quest = await prisma.quest.create({ data: questData })
    console.log(`[Seed] Created Quest: ${quest.title}`)
  }

  // ============================================
  // 4. 创建NPC间关系
  // ============================================

  // 先获取NPC ID映射
  const npcMap = new Map<string, string>()
  const allNpcs = await prisma.nPC.findMany()
  for (const npc of allNpcs) {
    npcMap.set(npc.name, npc.id)
  }

  const relations = [
    // === 玛格丽特的关系 ===
    { source: '玛格丽特', target: '老巴克', type: 'friend', affection: 70, trust: 60, description: '老主顾关系，互相信任' },
    { source: '玛格丽特', target: '莉莉', type: 'friend', affection: 80, trust: 70, description: '面包和酒的好搭档，信息网络盟友' },
    { source: '玛格丽特', target: '托比', type: 'neutral', affection: 55, trust: 40, description: '商业往来，各取所需' },
    { source: '玛格丽特', target: '铁砧', type: 'friend', affection: 60, trust: 55, description: '矿工们常来酒馆，关系不错' },
    { source: '玛格丽特', target: '小皮普', type: 'family', affection: 75, trust: 65, description: '像阿姨一样关心皮普' },
    { source: '玛格丽特', target: '马库斯', type: 'neutral', affection: 50, trust: 50, description: '酒馆和守夜人，维持基本合作' },
    { source: '玛格丽特', target: '暗祭司塞拉斯', type: 'neutral', affection: 55, trust: 45, description: '表面友好但隐约觉得不对劲' },
    { source: '玛格丽特', target: '西尔维娅', type: 'neutral', affection: 45, trust: 35, description: '偶尔来酒馆，不太熟' },
    { source: '玛格丽特', target: '罗西', type: 'friend', affection: 60, trust: 50, description: '市场邻居，关系融洽' },
    { source: '玛格丽特', target: '艾拉', type: 'neutral', affection: 50, trust: 40, description: '偶尔买药，交往不深' },
    { source: '玛格丽特', target: '格罗姆', type: 'neutral', affection: 30, trust: 20, description: '几乎不打交道，觉得他古怪' },

    // === 老巴克的关系 ===
    { source: '老巴克', target: '铁砧', type: 'friend', affection: 65, trust: 70, description: '工匠间的相互尊重，矿石供需关系' },
    { source: '老巴克', target: '托比', type: 'neutral', affection: 45, trust: 35, description: '偶尔从他那里买稀有矿石' },
    { source: '老巴克', target: '马库斯', type: 'neutral', affection: 40, trust: 45, description: '帮他修理武器装备' },
    { source: '老巴克', target: '小皮普', type: 'friend', affection: 55, trust: 50, description: '偶尔给皮普讲远征军的故事' },
    { source: '老巴克', target: '格罗姆', type: 'neutral', affection: 35, trust: 25, description: '知道格罗姆的存在但刻意回避' },
    { source: '老巴克', target: '暗祭司塞拉斯', type: 'neutral', affection: 40, trust: 30, description: '帮他修理教堂铁件，不冷不热' },
    { source: '老巴克', target: '莉莉', type: 'neutral', affection: 50, trust: 45, description: '偶尔买面包' },
    { source: '老巴克', target: '罗西', type: 'neutral', affection: 40, trust: 35, description: '偶尔帮她修修花匠工具' },
    { source: '老巴克', target: '艾拉', type: 'neutral', affection: 45, trust: 40, description: '偶尔买草药治旧伤' },
    { source: '老巴克', target: '西尔维娅', type: 'neutral', affection: 35, trust: 30, description: '几乎无交集' },

    // === 艾拉的关系 ===
    { source: '艾拉', target: '罗西', type: 'friend', affection: 75, trust: 80, description: '草药师和花匠，知音，都热爱植物' },
    { source: '艾拉', target: '格罗姆', type: 'neutral', affection: 45, trust: 30, description: '都了解精灵之事但彼此防备' },
    { source: '艾拉', target: '莉莉', type: 'friend', affection: 55, trust: 50, description: '偶尔用草药交换面包' },
    { source: '艾拉', target: '小皮普', type: 'friend', affection: 60, trust: 55, description: '偶尔给皮普讲森林的故事' },
    { source: '艾拉', target: '玛格丽特', type: 'neutral', affection: 50, trust: 40, description: '偶尔在酒馆碰面' },
    { source: '艾拉', target: '托比', type: 'neutral', affection: 40, trust: 35, description: '偶尔从他那里买稀有草药种子' },
    { source: '艾拉', target: '暗祭司塞拉斯', type: 'enemy', affection: 20, trust: 10, description: '直觉告诉他这个牧师不对劲' },
    { source: '艾拉', target: '马库斯', type: 'neutral', affection: 45, trust: 50, description: '马库斯偶尔巡逻经过药草铺' },
    { source: '艾拉', target: '老巴克', type: 'neutral', affection: 45, trust: 40, description: '偶尔买草药治旧伤' },
    { source: '艾拉', target: '西尔维娅', type: 'friend', affection: 55, trust: 60, description: '都对神秘事物有了解，偶尔交流' },

    // === 铁砧的关系 ===
    { source: '铁砧', target: '托比', type: 'neutral', affection: 50, trust: 40, description: '在酒馆认识，偶尔聊天' },
    { source: '铁砧', target: '小皮普', type: 'friend', affection: 60, trust: 55, description: '觉得皮普像自己年轻时候' },
    { source: '铁砧', target: '莉莉', type: 'friend', affection: 55, trust: 50, description: '面包是矿工午餐标配' },
    { source: '铁砧', target: '马库斯', type: 'neutral', affection: 45, trust: 50, description: '偶尔帮马库斯探索矿洞安全' },
    { source: '铁砧', target: '罗西', type: 'neutral', affection: 40, trust: 35, description: '偶尔送她矿石标本' },
    { source: '铁砧', target: '暗祭司塞拉斯', type: 'neutral', affection: 45, trust: 35, description: '牧师偶尔来矿洞"走访"，铁砧不太喜欢' },
    { source: '铁砧', target: '格罗姆', type: 'neutral', affection: 30, trust: 20, description: '几乎无交集' },
    { source: '铁砧', target: '西尔维娅', type: 'neutral', affection: 35, trust: 30, description: '几乎无交集' },
    { source: '铁砧', target: '艾拉', type: 'neutral', affection: 45, trust: 40, description: '偶尔从她那里买药治矿伤' },

    // === 托比的关系 ===
    { source: '托比', target: '小皮普', type: 'friend', affection: 55, trust: 50, description: '经常给皮普带外地零食' },
    { source: '托比', target: '罗西', type: 'neutral', affection: 50, trust: 40, description: '市场邻居，偶尔交换商品' },
    { source: '托比', target: '西尔维娅', type: 'neutral', affection: 45, trust: 35, description: '偶尔卖给她异域书籍' },
    { source: '托比', target: '马库斯', type: 'neutral', affection: 40, trust: 35, description: '偶尔被他盘问商品来源' },
    { source: '托比', target: '暗祭司塞拉斯', type: 'neutral', affection: 50, trust: 40, description: '牧师偶尔向他打听外界消息' },
    { source: '托比', target: '格罗姆', type: 'neutral', affection: 35, trust: 25, description: '知道格罗姆的存在但不敢靠近' },
    { source: '托比', target: '莉莉', type: 'friend', affection: 50, trust: 45, description: '偶尔给她带异域面粉' },
    { source: '托比', target: '艾拉', type: 'neutral', affection: 40, trust: 35, description: '偶尔从外地给她带稀有草药种子' },

    // === 莉莉的关系 ===
    { source: '莉莉', target: '小皮普', type: 'family', affection: 90, trust: 85, description: '莉莉像姐姐一样照顾皮普' },
    { source: '莉莉', target: '罗西', type: 'friend', affection: 65, trust: 60, description: '市场邻居，经常聊天' },
    { source: '莉莉', target: '西尔维娅', type: 'neutral', affection: 45, trust: 40, description: '偶尔送面包到图书馆' },
    { source: '莉莉', target: '马库斯', type: 'neutral', affection: 50, trust: 50, description: '偶尔送面包给守夜人' },
    { source: '莉莉', target: '暗祭司塞拉斯', type: 'neutral', affection: 60, trust: 50, description: '觉得牧师人很好，常送面包到教堂' },
    { source: '莉莉', target: '格罗姆', type: 'neutral', affection: 30, trust: 20, description: '几乎无交集' },

    // === 西尔维娅的关系 ===
    { source: '西尔维娅', target: '格罗姆', type: 'neutral', affection: 40, trust: 25, description: '学者与术士的微妙关系' },
    { source: '西尔维娅', target: '马库斯', type: 'neutral', affection: 40, trust: 35, description: '偶尔借阅军事历史资料' },
    { source: '西尔维娅', target: '暗祭司塞拉斯', type: 'neutral', affection: 45, trust: 30, description: '在教堂借阅过古籍，隐约觉得他在隐藏什么' },
    { source: '西尔维娅', target: '艾拉', type: 'friend', affection: 55, trust: 60, description: '都对神秘事物有了解，偶尔交流' },
    { source: '西尔维娅', target: '罗西', type: 'neutral', affection: 40, trust: 35, description: '偶尔买花装饰图书馆' },
    { source: '西尔维娅', target: '小皮普', type: 'neutral', affection: 50, trust: 45, description: '偶尔让皮普送信到首都' },
    { source: '西尔维娅', target: '托比', type: 'neutral', affection: 45, trust: 35, description: '偶尔从他那里买异域书籍' },

    // === 马库斯的关系 ===
    { source: '马库斯', target: '暗祭司塞拉斯', type: 'neutral', affection: 50, trust: 35, description: '队长隐约觉得牧师不简单，暗中调查' },
    { source: '马库斯', target: '罗西', type: 'neutral', affection: 45, trust: 40, description: '巡逻时常路过花摊' },
    { source: '马库斯', target: '小皮普', type: 'neutral', affection: 50, trust: 45, description: '偶尔让皮普送紧急消息' },
    { source: '马库斯', target: '格罗姆', type: 'neutral', affection: 35, trust: 25, description: '知道他隐居但不确定是否危险' },
    { source: '马库斯', target: '铁砧', type: 'neutral', affection: 45, trust: 50, description: '偶尔让他帮忙检查矿洞安全' },
    { source: '马库斯', target: '托比', type: 'neutral', affection: 40, trust: 35, description: '偶尔盘问他的商品来源' },
    { source: '马库斯', target: '莉莉', type: 'neutral', affection: 50, trust: 50, description: '偶尔在面包房碰面' },
    { source: '马库斯', target: '艾拉', type: 'neutral', affection: 45, trust: 50, description: '偶尔巡逻经过药草铺' },
    { source: '马库斯', target: '老巴克', type: 'neutral', affection: 40, trust: 45, description: '偶尔让他修理装备' },
    { source: '马库斯', target: '西尔维娅', type: 'neutral', affection: 40, trust: 35, description: '偶尔借阅军事历史资料' },
    { source: '马库斯', target: '玛格丽特', type: 'neutral', affection: 50, trust: 50, description: '酒馆和守夜人，维持基本合作' },

    // === 罗西的关系 ===
    { source: '罗西', target: '小皮普', type: 'friend', affection: 60, trust: 55, description: '偶尔给皮普花作为奖励' },
    { source: '罗西', target: '暗祭司塞拉斯', type: 'neutral', affection: 55, trust: 40, description: '偶尔送花到教堂，觉得牧师人不错' },
    { source: '罗西', target: '格罗姆', type: 'neutral', affection: 30, trust: 20, description: '几乎无交集' },
    { source: '罗西', target: '艾拉', type: 'friend', affection: 75, trust: 80, description: '草药师和花匠，知音' },
    { source: '罗西', target: '铁砧', type: 'neutral', affection: 40, trust: 35, description: '偶尔收到矿石标本礼物' },
    { source: '罗西', target: '托比', type: 'neutral', affection: 50, trust: 40, description: '市场邻居，偶尔交换商品' },
    { source: '罗西', target: '西尔维娅', type: 'neutral', affection: 40, trust: 35, description: '偶尔买花装饰图书馆' },
    { source: '罗西', target: '玛格丽特', type: 'friend', affection: 60, trust: 50, description: '市场邻居，关系融洽' },
    { source: '罗西', target: '老巴克', type: 'neutral', affection: 40, trust: 35, description: '偶尔让他修花匠工具' },
    { source: '罗西', target: '莉莉', type: 'friend', affection: 65, trust: 60, description: '市场邻居，经常聊天' },
    { source: '罗西', target: '马库斯', type: 'neutral', affection: 45, trust: 40, description: '巡逻时常路过花摊' },

    // === 小皮普的关系 ===
    { source: '小皮普', target: '暗祭司塞拉斯', type: 'neutral', affection: 55, trust: 50, description: '牧师常给他零食，觉得他人好' },
    { source: '小皮普', target: '格罗姆', type: 'neutral', affection: 40, trust: 30, description: '送过几次信到隐居小屋，觉得他古怪但无害' },
    { source: '小皮普', target: '西尔维娅', type: 'neutral', affection: 50, trust: 45, description: '偶尔帮她送信' },
    { source: '小皮普', target: '马库斯', type: 'neutral', affection: 50, trust: 45, description: '偶尔帮马库斯送紧急消息' },
    { source: '小皮普', target: '罗西', type: 'friend', affection: 60, trust: 55, description: '罗西偶尔给他花作为奖励' },
    { source: '小皮普', target: '托比', type: 'friend', affection: 55, trust: 50, description: '托比常给他带外地零食' },
    { source: '小皮普', target: '铁砧', type: 'friend', affection: 60, trust: 55, description: '铁砧偶尔给他讲矿洞故事' },
    { source: '小皮普', target: '艾拉', type: 'friend', affection: 60, trust: 55, description: '艾拉偶尔给他讲森林故事' },
    { source: '小皮普', target: '老巴克', type: 'friend', affection: 55, trust: 50, description: '老巴克偶尔给他讲远征军故事' },
    { source: '小皮普', target: '玛格丽特', type: 'friend', affection: 75, trust: 65, description: '玛格丽特像阿姨一样关心他' },

    // === 格罗姆的关系 ===
    { source: '格罗姆', target: '暗祭司塞拉斯', type: 'enemy', affection: 10, trust: 0, description: '暗影与封印守护者的对立，不死不休' },
    { source: '格罗姆', target: '艾拉', type: 'neutral', affection: 45, trust: 30, description: '知道她有精灵血脉，有所期待但保持距离' },
    { source: '格罗姆', target: '西尔维娅', type: 'neutral', affection: 40, trust: 25, description: '知道她的预言能力，但不愿过多接触' },
    { source: '格罗姆', target: '小皮普', type: 'neutral', affection: 40, trust: 30, description: '偶尔通过皮普传递信息' },
    { source: '格罗姆', target: '老巴克', type: 'neutral', affection: 35, trust: 25, description: '知道老巴克了解遗迹之事，互不干涉' },
    { source: '格罗姆', target: '玛格丽特', type: 'neutral', affection: 30, trust: 20, description: '几乎不打交道' },
    { source: '格罗姆', target: '托比', type: 'neutral', affection: 35, trust: 25, description: '知道托比见过星火碎片，暗中观察' },
    { source: '格罗姆', target: '铁砧', type: 'neutral', affection: 30, trust: 20, description: '几乎无交集' },
    { source: '格罗姆', target: '莉莉', type: 'neutral', affection: 30, trust: 20, description: '几乎无交集' },
    { source: '格罗姆', target: '罗西', type: 'neutral', affection: 30, trust: 20, description: '几乎无交集' },
    { source: '格罗姆', target: '马库斯', type: 'neutral', affection: 35, trust: 25, description: '知道马库斯在调查异常，保持警惕' },

    // === 暗祭司塞拉斯的关系 ===
    { source: '暗祭司塞拉斯', target: '格罗姆', type: 'enemy', affection: 10, trust: 0, description: '暗影与封印守护者的对立，不死不休' },
    { source: '暗祭司塞拉斯', target: '马库斯', type: 'neutral', affection: 50, trust: 35, description: '表面友好，暗中提防他的调查' },
    { source: '暗祭司塞拉斯', target: '玛格丽特', type: 'neutral', affection: 55, trust: 45, description: '表面友好的酒馆主顾' },
    { source: '暗祭司塞拉斯', target: '莉莉', type: 'neutral', affection: 60, trust: 50, description: '利用她的信任，常接受面包馈赠' },
    { source: '暗祭司塞拉斯', target: '小皮普', type: 'neutral', affection: 55, trust: 50, description: '利用皮普收集小镇情报' },
    { source: '暗祭司塞拉斯', target: '托比', type: 'neutral', affection: 50, trust: 40, description: '向他打听外界星火碎片消息' },
    { source: '暗祭司塞拉斯', target: '铁砧', type: 'neutral', affection: 45, trust: 35, description: '偶尔"走访"矿洞收集星火碎石情报' },
    { source: '暗祭司塞拉斯', target: '艾拉', type: 'enemy', affection: 20, trust: 10, description: '知道她有精灵血脉，视她为威胁' },
    { source: '暗祭司塞拉斯', target: '西尔维娅', type: 'neutral', affection: 45, trust: 30, description: '表面借阅古籍，暗中监视她的预言' },
    { source: '暗祭司塞拉斯', target: '罗西', type: 'neutral', affection: 55, trust: 40, description: '利用她的好感收集小镇八卦' },
    { source: '暗祭司塞拉斯', target: '老巴克', type: 'neutral', affection: 40, trust: 30, description: '表面请他修理教堂铁件' },
  ]

  console.log('[Seed] Creating NPC relations...')
  for (const rel of relations) {
    const sourceId = npcMap.get(rel.source)
    const targetId = npcMap.get(rel.target)
    if (!sourceId || !targetId) continue

    await prisma.nPCRelation.create({
      data: {
        sourceNpcId: sourceId,
        targetNpcId: targetId,
        type: rel.type,
        affection: rel.affection,
        trust: rel.trust,
        description: rel.description,
      },
    })
    console.log(`[Seed] Created Relation: ${rel.source} → ${rel.target}`)
  }

  console.log('[Seed] ✅ Seed completed successfully!')
}

main()
  .then(() => {
    console.log('[Seed] Done')
  })
  .catch((e) => {
    // 数据已存在时不要退出1，只打印警告
    if (e.code === 'P2002') {
      console.log('[Seed] Data already exists, skipping seed')
    } else {
      console.error('[Seed] Error:', e)
      process.exit(1)
    }
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
