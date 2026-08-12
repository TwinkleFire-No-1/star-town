// 星火小镇 — 第二章脚本
// T4.2.3 「深处的秘密」完整事件链

import type { QuestDefinition } from './questTypes.js'
import type { DialogueScene } from './storyPrologue.js'

// =============================================
// 第二章剧情设定
// =============================================

/**
 * 第二章：深处的秘密
 *
 * 故事梗概：
 * 修复封印后，玩家从托比亚斯处得知——封印只是暂时的。
 * 封印背后封印着一个古老的存在：堕落精灵法师阿拉密斯。
 * 玩家需要深入古代遗迹，寻找阿拉密斯留下的线索。
 * 在遗迹中，玩家发现了三年前大火的真相——
 * 那场火并非意外，而是有人故意引燃，为了破坏封印。
 * 玩家在遗迹深处遇到了一个神秘的暗影组织，
 * 他们正试图完全释放阿拉密斯的力量。
 * 在击败暗影组织的首领后，玩家获得了阿拉密斯的日记残页，
 * 上面提到了一个关键地点——精灵圣林。
 *
 * 第二章任务链：
 * 1. 「封印之密」 — 向托比亚斯了解封印的真相
 * 2. 「古代遗迹」 — 探索遗迹，寻找阿拉密斯的线索
 * 3. 「真相之火」 — 揭开三年前大火的真相
 * 4. 「暗影来袭」 — 与暗影组织交战
 * 5. 「日记残页」 — 获取阿拉密斯的日记并解读
 */

// =============================================
// 第二章对话场景
// =============================================

export const CHAPTER2_DIALOGUES: DialogueScene[] = [
  // ---- 封印之密：与托比亚斯对话 ----
  {
    id: 'ch2_seal_truth',
    trigger: 'talk_tobias_after_seal',
    once: true,
    lines: [
      {
        speaker: '托比亚斯',
        content: '你做得很好……但我必须告诉你真相。那个封印，只是暂时的。',
        emotion: 'worried',
      },
      {
        speaker: '旅行者',
        content: '暂时的？你的意思是……',
        emotion: 'surprised',
      },
      {
        speaker: '托比亚斯',
        content: '那道封印封印着一个古老的存在——堕落精灵法师阿拉密斯。三百年前，他试图用腐化之力吞噬整片森林，被精灵一族联合封印在此。',
        emotion: 'neutral',
      },
      {
        speaker: '托比亚斯',
        content: '但封印在衰减。三年前的大火……我怀疑那不是意外。有人想破坏封印。',
        emotion: 'worried',
      },
      {
        speaker: '旅行者',
        content: '三年前的大火……我好像隐约有印象。那场火……',
        emotion: 'sad',
      },
      {
        speaker: '托比亚斯',
        content: '古代遗迹在森林深处。那里应该有阿拉密斯留下的线索。你必须去一趟。',
        emotion: 'neutral',
        effect: {
          type: 'start_quest',
          targetId: 'ch2_ancient_ruins',
        },
      },
    ],
  },

  // ---- 进入古代遗迹 ----
  {
    id: 'ch2_enter_ruins',
    trigger: 'area_enter_ancient_ruins',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '这些石柱……上面刻着精灵文字。虽然看不太懂，但能感受到一种强大的力量。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '空气很冷。和外面的森林完全不同。这里……像是被时间冻结了。',
        emotion: 'worried',
      },
      {
        speaker: '莉拉',
        content: '（通讯）我感应到了……这里有很多灵魂的残响。他们死得很痛苦。',
        emotion: 'sad',
      },
    ],
  },

  // ---- 发现第一处遗迹壁画 ----
  {
    id: 'ch2_mural_1',
    trigger: 'discover_ruins_mural_1',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '这幅壁画……画的是一个精灵，手持法杖，周围环绕着黑色的雾气。',
        emotion: 'surprised',
      },
      {
        speaker: '托比亚斯',
        content: '（通讯）那就是阿拉密斯！根据传说，他曾是最伟大的精灵法师之一，但被腐化之力诱惑而堕落。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '旁边还有一幅画……很多人围成一个圈，似乎在举行某种仪式。',
        emotion: 'neutral',
      },
      {
        speaker: '托比亚斯',
        content: '那是封印仪式。精灵一族用他们自己的生命力作为代价，将阿拉密斯封印。代价是……整个精灵一族几乎灭绝。',
        emotion: 'sad',
      },
    ],
  },

  // ---- 发现真相之火 ----
  {
    id: 'ch2_fire_truth',
    trigger: 'discover_ruins_burned_evidence',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '这里……这些烧焦的痕迹。不是自然的火烧的。',
        emotion: 'surprised',
      },
      {
        speaker: '旅行者',
        content: '看这些炭化的木炭——排列得太整齐了。有人在这里故意纵火！',
        emotion: 'angry',
      },
      {
        speaker: '托比亚斯',
        content: '（通讯）什么？！让我看看……是的，这些痕迹确实是人为纵火。三年前的大火，不是森林自燃。',
        emotion: 'worried',
      },
      {
        speaker: '旅行者',
        content: '谁会做这种事？为什么？',
        emotion: 'angry',
      },
      {
        speaker: '托比亚斯',
        content: '纵火的位置恰好在封印的最薄弱点……有人知道封印的位置，并试图破坏它。这不是普通人能做到的。',
        emotion: 'worried',
      },
      {
        speaker: '莉拉',
        content: '（通讯）我感觉到了……有什么东西在遗迹深处。不是亡灵……是活人。',
        emotion: 'worried',
      },
    ],
  },

  // ---- 遭遇暗影组织 ----
  {
    id: 'ch2_shadow_encounter',
    trigger: 'area_enter_ruins_inner',
    once: true,
    lines: [
      {
        speaker: '???',
        content: '……你比我想象的来得更早。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '你是谁？你知道这里的事？',
        emotion: 'angry',
      },
      {
        speaker: '暗影教徒',
        content: '我是暗影之眼的仆从。我们等待阿拉密斯大人的回归已经很久了。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '阿拉密斯？你是说……三年前的大火是你们放的？！',
        emotion: 'angry',
      },
      {
        speaker: '暗影教徒',
        content: '那场火只是开始。封印正在瓦解。当阿拉密斯大人苏醒时，这片土地将被腐化之力重塑。',
        emotion: 'happy',
      },
      {
        speaker: '暗影教徒',
        content: '但你不会活着离开这里。为了大人的回归，你必须消失！',
        emotion: 'angry',
      },
      {
        speaker: '旅行者',
        content: '做梦！来吧！',
        emotion: 'angry',
        effect: {
          type: 'start_quest',
          targetId: 'ch2_shadow_battle',
        },
      },
    ],
  },

  // ---- 暗影之战后 ----
  {
    id: 'ch2_after_shadow_battle',
    trigger: 'complete_shadow_battle',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '呼……这些暗影教徒比森林里的怪物强多了。',
        emotion: 'worried',
      },
      {
        speaker: '旅行者',
        content: '他身上掉了一本书……是日记？让我看看。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '「……阿拉密斯日记，第七十三页。封印的力量源自精灵圣林的生命之树。要彻底瓦解封印，必须找到并切断生命之树的根系……」',
        emotion: 'surprised',
      },
      {
        speaker: '托比亚斯',
        content: '（通讯）你找到了阿拉密斯的日记？！那太重要了！上面还写了什么？',
        emotion: 'happy',
      },
      {
        speaker: '旅行者',
        content: '后面的页面被撕掉了。但提到了「精灵圣林」和「生命之树」。',
        emotion: 'neutral',
      },
      {
        speaker: '托比亚斯',
        content: '精灵圣林……那是精灵一族最后的圣地。如果暗影组织的目标是生命之树，我们必须抢先到达那里！',
        emotion: 'worried',
      },
      {
        speaker: '旅行者',
        content: '精灵圣林在哪里？',
        emotion: 'neutral',
      },
      {
        speaker: '莉拉',
        content: '（通讯）我知道。圣林在森林的最深处。但那里需要很高的声望才能进入……我会尽力为你争取。',
        emotion: 'neutral',
        effect: {
          type: 'unlock_area',
          targetId: 'sacred_grove',
        },
      },
      {
        speaker: '旅行者',
        content: '谢谢你，莉拉。我们出发。',
        emotion: 'happy',
        effect: {
          type: 'complete_objective',
          targetId: 'ch2_diary_pages',
        },
      },
    ],
  },

  // ---- 返回小镇休整 ----
  {
    id: 'ch2_return_town',
    trigger: 'return_town_after_ruins',
    once: true,
    lines: [
      {
        speaker: '梅莉尔',
        content: '你回来了！听说你去探索古代遗迹了？有没有什么发现？',
        emotion: 'happy',
      },
      {
        speaker: '旅行者',
        content: '发现了不少。三年前的大火不是意外——有人故意纵火破坏封印。一个叫「暗影之眼」的组织在幕后操纵。',
        emotion: 'neutral',
      },
      {
        speaker: '梅莉尔',
        content: '暗影之眼……我好像听老巴克提过这个名字。他说很多年前这个组织就被剿灭了。',
        emotion: 'surprised',
      },
      {
        speaker: '旅行者',
        content: '看来他们只是转入了地下。现在他们想释放一个叫阿拉密斯的堕落精灵法师。',
        emotion: 'worried',
      },
      {
        speaker: '梅莉尔',
        content: '这太危险了……你需要更多帮助。让我看看能为你做些什么。',
        emotion: 'worried',
        effect: {
          type: 'change_affection',
          targetId: 'meriel',
          value: 5,
        },
      },
    ],
  },
]

// =============================================
// 第二章任务定义
// =============================================

export const CHAPTER2_QUESTS: QuestDefinition[] = [
  {
    id: 'ch2_seal_truth',
    title: '封印之密',
    description: '与托比亚斯交谈，了解森林封印的真相',
    type: 'main',
    chapter: 2,
    giverNpcId: 'tobias',
    trigger: {
      type: 'quest_complete',
      targetId: 'ch1_seal_repair',
    },
    prerequisites: ['ch1_seal_repair'],
    objectives: [
      {
        id: 'obj_talk_tobias',
        description: '与托比亚斯交谈',
        type: 'talk_to_npc',
        targetId: 'tobias',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 50,
      coins: 30,
      items: [],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 5,
    autoAccept: true,
    canRetry: false,
  },
  {
    id: 'ch2_ancient_ruins',
    title: '古代遗迹',
    description: '深入古代遗迹，寻找阿拉密斯留下的线索',
    type: 'main',
    chapter: 2,
    trigger: {
      type: 'quest_complete',
      targetId: 'ch2_seal_truth',
    },
    prerequisites: ['ch2_seal_truth'],
    objectives: [
      {
        id: 'obj_enter_ruins',
        description: '进入古代遗迹',
        type: 'visit_area',
        targetId: 'ancient_ruins',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 80,
      coins: 50,
      items: [{ itemId: 'item_ruins_key', itemName: '遗迹钥匙', quantity: 1 }],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 5,
    autoAccept: true,
    canRetry: false,
  },
  {
    id: 'ch2_fire_truth',
    title: '真相之火',
    description: '调查遗迹中的纵火痕迹，揭开三年前大火的真相',
    type: 'main',
    chapter: 2,
    trigger: {
      type: 'event',
      targetId: 'ch2_mural_1',
    },
    prerequisites: ['ch2_ancient_ruins'],
    objectives: [
      {
        id: 'obj_investigate_fire',
        description: '调查纵火痕迹',
        type: 'custom',
        targetId: 'ch2_fire_truth',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 100,
      coins: 60,
      items: [],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 6,
    autoAccept: true,
    canRetry: false,
  },
  {
    id: 'ch2_shadow_battle',
    title: '暗影来袭',
    description: '击败遗迹深处的暗影教徒',
    type: 'main',
    chapter: 2,
    trigger: {
      type: 'event',
      targetId: 'ch2_shadow_encounter',
    },
    prerequisites: ['ch2_fire_truth'],
    objectives: [
      {
        id: 'obj_defeat_cultist',
        description: '击败暗影教徒',
        type: 'kill_enemy',
        targetId: 'shadow_cultist',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 150,
      coins: 100,
      items: [{ itemId: 'item_health_potion', itemName: '生命药水', quantity: 3 }],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 6,
    autoAccept: true,
    canRetry: true,
  },
  {
    id: 'ch2_diary_pages',
    title: '日记残页',
    description: '获取阿拉密斯的日记残页，解读其中的秘密',
    type: 'main',
    chapter: 2,
    trigger: {
      type: 'event',
      targetId: 'shadow_battle_won',
    },
    prerequisites: ['ch2_shadow_battle'],
    objectives: [
      {
        id: 'obj_obtain_diary',
        description: '获取日记残页',
        type: 'collect_item',
        targetId: 'item_aramis_diary',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 120,
      coins: 80,
      items: [{ itemId: 'item_aramis_diary', itemName: '阿拉密斯的日记', quantity: 1 }],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 7,
    autoAccept: true,
    canRetry: false,
  },
]

// =============================================
// 触发条件映射
// =============================================

export const CHAPTER2_TRIGGERS = {
  // 封印修复后自动触发
  'talk_tobias_after_seal': {
    condition: 'quest_completed:ch1_seal_repair',
    action: 'start_dialogue:ch2_seal_truth',
  },
  // 进入古代遗迹
  'area_enter_ancient_ruins': {
    condition: 'area_enter:ancient_ruins',
    action: 'start_dialogue:ch2_enter_ruins',
  },
  // 发现壁画
  'discover_ruins_mural_1': {
    condition: 'interact:ruins_mural_1',
    action: 'start_dialogue:ch2_mural_1',
  },
  // 发现纵火证据
  'discover_ruins_burned_evidence': {
    condition: 'interact:ruins_burned_evidence',
    action: 'start_dialogue:ch2_fire_truth',
  },
  // 进入遗迹内部
  'area_enter_ruins_inner': {
    condition: 'area_enter:ruins_inner',
    action: 'start_dialogue:ch2_shadow_encounter',
  },
  // 暗影战斗结束
  'complete_shadow_battle': {
    condition: 'battle_won:shadow_cultist',
    action: 'start_dialogue:ch2_after_shadow_battle',
  },
  // 返回小镇
  'return_town_after_ruins': {
    condition: 'area_enter:town_center',
    action: 'start_dialogue:ch2_return_town',
    requires: 'ch2_diary_pages',
  },
} as const

/** 第二章完整数据 */
export const CHAPTER2_DATA = {
  chapter: 2,
  title: '深处的秘密',
  summary: '玩家深入古代遗迹，揭开三年前大火的真相，遭遇暗影组织，获得堕落精灵阿拉密斯的日记残页。',
  dialogues: CHAPTER2_DIALOGUES,
  quests: CHAPTER2_QUESTS,
  triggers: CHAPTER2_TRIGGERS,
  newAreas: ['ancient_ruins', 'ruins_inner'],
  newItems: ['item_ruins_key', 'item_aramis_diary'],
  newEnemies: ['shadow_cultist', 'shadow_assassin'],
}
