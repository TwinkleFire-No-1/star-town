// 星火小镇 — 第三章脚本
// T4.2.4 「精灵的遗言」完整事件链

import type { QuestDefinition } from './questTypes.js'
import type { DialogueScene } from './storyPrologue.js'

// =============================================
// 第三章剧情设定
// =============================================

/**
 * 第三章：精灵的遗言
 *
 * 故事梗概：
 * 玩家前往精灵圣林，寻找生命之树。
 * 在圣林入口，玩家遇到了精灵守卫——格罗姆，
 * 他是最后一批精灵的后裔，守护着这片圣地。
 * 格罗姆起初对人类充满警惕，但在玩家的诚意和
 * 暗影组织的威胁面前，他同意引导玩家前往生命之树。
 * 在生命之树下，玩家发现了阿拉密斯留下的最后封印。
 * 封印中残留着精灵一族的记忆——他们用生命换来的封印。
 * 同时，暗影组织也追到了圣林，发动了总攻。
 * 在激烈的战斗中，格罗姆为了保护生命之树而重伤。
 * 在生命之树的力量下，玩家成功击退了暗影组织，
 * 但封印仍在持续衰减。格罗姆告诉玩家一个秘密——
 * 要彻底解决危机，必须找到阿拉密斯的法杖，
 * 它是封印的核心，也是解封的关键。
 *
 * 第三章任务链：
 * 1. 「圣林之路」 — 前往精灵圣林
 * 2. 「最后的精灵」 — 与格罗姆建立信任
 * 3. 「生命之树」 — 在生命之树下发现最后封印
 * 4. 「圣林之战」 — 击退暗影组织的总攻
 * 5. 「法杖之钥」 — 得知阿拉密斯法杖的秘密
 */

// =============================================
// 第三章对话场景
// =============================================

export const CHAPTER3_DIALOGUES: DialogueScene[] = [
  // ---- 圣林之路：抵达圣林入口 ----
  {
    id: 'ch3_enter_sacred_grove',
    trigger: 'area_enter_sacred_grove',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '这里就是精灵圣林……空气中有一种说不出的安宁。和之前那些被腐化的森林完全不同。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '树木比外面的高大得多，叶子泛着淡淡的银光。这就是精灵一族的圣地。',
        emotion: 'surprised',
      },
      {
        speaker: '格罗姆',
        content: '站住。人类不该出现在这里。',
        emotion: 'angry',
      },
      {
        speaker: '旅行者',
        content: '我是来找生命之树的。暗影组织——「暗影之眼」正在试图释放阿拉密斯。我需要阻止他们。',
        emotion: 'neutral',
      },
      {
        speaker: '格罗姆',
        content: '……暗影之眼？那个组织早就该消亡了。你一个人类，凭什么相信你？',
        emotion: 'angry',
      },
      {
        speaker: '莉拉',
        content: '（通讯）等一下……我能感应到他的灵力。他是精灵后裔！真正的精灵后裔！',
        emotion: 'happy',
      },
      {
        speaker: '旅行者',
        content: '你不是普通的人类守卫。你是精灵一族的后人？',
        emotion: 'surprised',
      },
      {
        speaker: '格罗姆',
        content: '……是的。我叫格罗姆，是最后的精灵守卫之一。我守护这片圣林已经很久了。',
        emotion: 'sad',
      },
      {
        speaker: '旅行者',
        content: '那我们更应该合作。暗影组织已经找到了古代遗迹，他们手里有阿拉密斯的日记。他们知道生命之树的存在。',
        emotion: 'worried',
      },
      {
        speaker: '格罗姆',
        content: '……什么？日记？那他们迟早会找到这里。跟我来，我带你去见生命之树。',
        emotion: 'worried',
        effect: {
          type: 'start_quest',
          targetId: 'ch3_life_tree',
        },
      },
    ],
  },

  // ---- 生命之树 ----
  {
    id: 'ch3_life_tree',
    trigger: 'reach_life_tree',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '这就是生命之树……它比我想象的要大得多。树干上的纹路像是活着的。',
        emotion: 'surprised',
      },
      {
        speaker: '格罗姆',
        content: '这棵树已经有上千年了。它是精灵一族生命力的源泉。三百年前，我的祖先们用自己的生命作为代价，通过这棵树将阿拉密斯封印。',
        emotion: 'sad',
      },
      {
        speaker: '旅行者',
        content: '树根处……那些黑色的纹路是什么？',
        emotion: 'worried',
      },
      {
        speaker: '格罗姆',
        content: '（脸色骤变）那是……腐化。封印正在被侵蚀。比我预想的要快。',
        emotion: 'angry',
      },
      {
        speaker: '旅行者',
        content: '我能做什么？',
        emotion: 'neutral',
      },
      {
        speaker: '格罗姆',
        content: '触碰生命之树。它可能会向你展示封印中的记忆——精灵一族最后的记忆。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '（伸手触碰树干）……！',
        emotion: 'surprised',
      },
    ],
  },

  // ---- 封印记忆（幻象） ----
  {
    id: 'ch3_seal_memory',
    trigger: 'touch_life_tree',
    once: true,
    lines: [
      {
        speaker: '精灵长老（记忆）',
        content: '阿拉密斯……你曾是我们的骄傲。为什么……为什么要走上这条路？',
        emotion: 'sad',
      },
      {
        speaker: '阿拉密斯（记忆）',
        content: '腐化不是毁灭，是进化！你们太短视了！这股力量将重塑整个世界！',
        emotion: 'angry',
      },
      {
        speaker: '精灵长老（记忆）',
        content: '封印他！用我们的生命！只要生命之树还在，封印就不会被打破！',
        emotion: 'angry',
      },
      {
        speaker: '阿拉密斯（记忆）',
        content: '你们以为这就结束了？我会回来的……只要有足够的力量，我就能挣脱！',
        emotion: 'angry',
      },
      {
        speaker: '旅行者',
        content: '（幻象消散）……原来如此。阿拉密斯被封印时留下了后手。',
        emotion: 'worried',
      },
      {
        speaker: '格罗姆',
        content: '你看到了什么？',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '阿拉密斯说过，只要有足够的力量他就能挣脱。暗影组织一直在给封印注入腐化之力。',
        emotion: 'worried',
      },
      {
        speaker: '格罗姆',
        content: '要彻底解决这个问题……只有找到阿拉密斯的法杖。法杖是封印的核心——它既是封印的钥匙，也是解封的钥匙。',
        emotion: 'neutral',
        effect: {
          type: 'complete_objective',
          targetId: 'ch3_life_tree',
        },
      },
    ],
  },

  // ---- 暗影组织入侵 ----
  {
    id: 'ch3_shadow_invasion',
    trigger: 'shadow_invasion_starts',
    once: true,
    lines: [
      {
        speaker: '格罗姆',
        content: '等等……有敌人来了！很多！',
        emotion: 'angry',
      },
      {
        speaker: '暗影祭司',
        content: '（远处传来声音）找到生命之树了！为了阿拉密斯大人！摧毁它！',
        emotion: 'angry',
      },
      {
        speaker: '格罗姆',
        content: '他们来了！保护好生命之树，我会用我的精灵之力帮助你！',
        emotion: 'angry',
        effect: {
          type: 'start_quest',
          targetId: 'ch3_sacred_grove_battle',
        },
      },
      {
        speaker: '旅行者',
        content: '来吧！我不会让你们得逞的！',
        emotion: 'angry',
      },
    ],
  },

  // ---- 圣林之战后 ----
  {
    id: 'ch3_after_battle',
    trigger: 'complete_sacred_grove_battle',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '呼……终于击退了。但他们的攻势越来越猛。',
        emotion: 'worried',
      },
      {
        speaker: '格罗姆',
        content: '咳咳……',
        emotion: 'sad',
      },
      {
        speaker: '旅行者',
        content: '格罗姆！你受伤了！',
        emotion: 'worried',
      },
      {
        speaker: '格罗姆',
        content: '不碍事……但我必须告诉你一个秘密。',
        emotion: 'sad',
      },
      {
        speaker: '格罗姆',
        content: '阿拉密斯的法杖……它不在这里。三百年前，精灵一族将法杖分成了三段，分别藏在三个地方。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '三个地方？分别是哪里？',
        emotion: 'neutral',
      },
      {
        speaker: '格罗姆',
        content: '第一段在星火小镇地下的密室……就在你的脚下。第二段在森林最深处的腐化巢穴。第三段……被暗影组织的首领——暗祭司塞拉斯持有。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '所以我们必须分别找到这三段法杖，然后重新组装它？',
        emotion: 'worried',
      },
      {
        speaker: '格罗姆',
        content: '是的。有了完整的法杖，你可以选择……彻底加固封印，或者……',
        emotion: 'sad',
      },
      {
        speaker: '旅行者',
        content: '或者什么？',
        emotion: 'neutral',
      },
      {
        speaker: '格罗姆',
        content: '或者……直接面对阿拉密斯，终结这一切。但这需要极大的力量和勇气。生命之树会指引你的。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '我明白了。谢谢你，格罗姆。我会找到法杖的。',
        emotion: 'happy',
        effect: {
          type: 'complete_objective',
          targetId: 'ch3_staff_secret',
          value: 'staff_3_fragments',
        },
      },
    ],
  },

  // ---- 返回小镇 ----
  {
    id: 'ch3_return_town',
    trigger: 'return_town_after_grove',
    once: true,
    lines: [
      {
        speaker: '托比亚斯',
        content: '你回来了！圣林的情况怎么样？',
        emotion: 'worried',
      },
      {
        speaker: '旅行者',
        content: '暗影组织发动了总攻，但我们守住了。不过……封印还在衰减。',
        emotion: 'neutral',
      },
      {
        speaker: '托比亚斯',
        content: '有办法彻底解决吗？',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '阿拉密斯的法杖被分成了三段。第一段就在小镇地下。第二段在腐化巢穴。第三段在暗影组织首领手中。',
        emotion: 'neutral',
      },
      {
        speaker: '托比亚斯',
        content: '小镇地下？！让我查查文献……啊，这里有个记载——星火小镇的基石下面有一个古老的密室！',
        emotion: 'happy',
      },
      {
        speaker: '旅行者',
        content: '看来我们从这里开始。准备好了，托比亚斯。',
        emotion: 'happy',
        effect: {
          type: 'change_affection',
          targetId: 'tobias',
          value: 5,
        },
      },
    ],
  },
]

// =============================================
// 第三章任务定义
// =============================================

export const CHAPTER3_QUESTS: QuestDefinition[] = [
  {
    id: 'ch3_enter_grove',
    title: '圣林之路',
    description: '前往精灵圣林，寻找生命之树',
    type: 'main',
    chapter: 3,
    trigger: {
      type: 'quest_complete',
      targetId: 'ch2_diary_pages',
    },
    prerequisites: ['ch2_diary_pages'],
    objectives: [
      {
        id: 'obj_enter_grove',
        description: '进入精灵圣林',
        type: 'visit_area',
        targetId: 'sacred_grove',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 80,
      coins: 50,
      items: [],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 8,
    autoAccept: true,
    canRetry: false,
  },
  {
    id: 'ch3_meet_grom',
    title: '最后的精灵',
    description: '与精灵守卫格罗姆建立信任',
    type: 'main',
    chapter: 3,
    giverNpcId: 'grom',
    trigger: {
      type: 'event',
      targetId: 'ch3_enter_sacred_grove',
    },
    prerequisites: ['ch3_enter_grove'],
    objectives: [
      {
        id: 'obj_talk_grom',
        description: '与格罗姆交谈',
        type: 'talk_to_npc',
        targetId: 'grom',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 100,
      coins: 70,
      items: [{ itemId: 'item_elf_amulet', itemName: '精灵护符', quantity: 1 }],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 8,
    autoAccept: true,
    canRetry: false,
  },
  {
    id: 'ch3_life_tree',
    title: '生命之树',
    description: '在生命之树下发现封印最后的秘密',
    type: 'main',
    chapter: 3,
    trigger: {
      type: 'event',
      targetId: 'ch3_meet_grom',
    },
    prerequisites: ['ch3_meet_grom'],
    objectives: [
      {
        id: 'obj_reach_life_tree',
        description: '到达生命之树',
        type: 'visit_area',
        targetId: 'life_tree',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 120,
      coins: 80,
      items: [],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 9,
    autoAccept: true,
    canRetry: false,
  },
  {
    id: 'ch3_sacred_grove_battle',
    title: '圣林之战',
    description: '击退暗影组织对精灵圣林的总攻',
    type: 'main',
    chapter: 3,
    trigger: {
      type: 'event',
      targetId: 'ch3_shadow_invasion',
    },
    prerequisites: ['ch3_life_tree'],
    objectives: [
      {
        id: 'obj_defeat_shadow_priest',
        description: '击败暗影祭司',
        type: 'kill_enemy',
        targetId: 'shadow_priest',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 200,
      coins: 150,
      items: [
        { itemId: 'item_mana_crystal', itemName: '法力水晶', quantity: 2 },
        { itemId: 'item_health_potion', itemName: '生命药水', quantity: 5 },
      ],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 9,
    autoAccept: true,
    canRetry: true,
  },
  {
    id: 'ch3_staff_secret',
    title: '法杖之钥',
    description: '从格罗姆口中得知阿拉密斯法杖被分为三段的秘密',
    type: 'main',
    chapter: 3,
    giverNpcId: 'grom',
    trigger: {
      type: 'event',
      targetId: 'sacred_grove_battle_won',
    },
    prerequisites: ['ch3_sacred_grove_battle'],
    objectives: [
      {
        id: 'obj_learn_staff_secret',
        description: '从格罗姆口中得知法杖秘密',
        type: 'talk_to_npc',
        targetId: 'grom',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 150,
      coins: 100,
      items: [{ itemId: 'item_staff_fragment_map', itemName: '法杖碎片地图', quantity: 1 }],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 10,
    autoAccept: true,
    canRetry: false,
  },
]

// =============================================
// 触发条件映射
// =============================================

export const CHAPTER3_TRIGGERS = {
  // 进入圣林
  'area_enter_sacred_grove': {
    condition: 'area_enter:sacred_grove',
    action: 'start_dialogue:ch3_enter_sacred_grove',
    requires: 'ch2_diary_pages',
  },
  // 到达生命之树
  'reach_life_tree': {
    condition: 'interact:life_tree',
    action: 'start_dialogue:ch3_life_tree',
  },
  // 触碰生命之树
  'touch_life_tree': {
    condition: 'interact:life_tree_touch',
    action: 'start_dialogue:ch3_seal_memory',
  },
  // 暗影入侵
  'shadow_invasion_starts': {
    condition: 'event:shadow_invasion',
    action: 'start_dialogue:ch3_shadow_invasion',
    requires: 'ch3_life_tree',
  },
  // 战斗结束
  'complete_sacred_grove_battle': {
    condition: 'battle_won:shadow_priest',
    action: 'start_dialogue:ch3_after_battle',
  },
  // 返回小镇
  'return_town_after_grove': {
    condition: 'area_enter:town_center',
    action: 'start_dialogue:ch3_return_town',
    requires: 'ch3_staff_secret',
  },
} as const

/** 第三章完整数据 */
export const CHAPTER3_DATA = {
  chapter: 3,
  title: '精灵的遗言',
  summary: '玩家前往精灵圣林，与最后的精灵守卫格罗姆结盟，在生命之树下发现封印真相。暗影组织发动总攻，击退后得知阿拉密斯法杖被分为三段的秘密。',
  dialogues: CHAPTER3_DIALOGUES,
  quests: CHAPTER3_QUESTS,
  triggers: CHAPTER3_TRIGGERS,
  newAreas: ['sacred_grove'],
  newItems: ['item_elf_amulet', 'item_staff_fragment_map', 'item_mana_crystal'],
  newEnemies: ['shadow_priest', 'shadow_assassin', 'shadow_brute'],
  newNPCs: ['npc_grom'],
  keyReveal: '阿拉密斯法杖分为三段，分别藏在小镇地下密室、腐化巢穴、暗影首领手中',
}
