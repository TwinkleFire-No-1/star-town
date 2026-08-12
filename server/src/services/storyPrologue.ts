// 星火小镇 — 序章脚本
// T4.2.1 序章：触发条件、关键对话、任务链

import type { QuestDefinition } from './questTypes.js'

// =============================================
// 序章剧情设定
// =============================================

/**
 * 序章：星火初燃
 *
 * 故事梗概：
 * 旅行者（玩家）在星火小镇边缘醒来，失去了大部分记忆。
 * 铁匠埃尔德里克发现了玩家，将其带到小镇。
 * 在小镇中，玩家需要了解基本情况，与几位NPC建立初步联系，
 * 并在简单的战斗训练后，得知森林深处出现了异变。
 *
 * 序章任务链：
 * 1. 「苏醒」 — 在埃尔德里克的小屋醒来，了解自身状况
 * 2. 「小镇初识」 — 认识3位关键NPC
 * 3. 「初试锋芒」 — 完成战斗训练
 * 4. 「森林异变」 — 发现森林中的腐化迹象，开启第一章
 */

// =============================================
// 序章对话脚本
// =============================================

export interface DialogueLine {
  speaker: string
  content: string
  /** 情感标注（影响AI理解上下文） */
  emotion?: 'neutral' | 'happy' | 'sad' | 'worried' | 'angry' | 'surprised'
  /** 触发效果 */
  effect?: {
    type: 'give_item' | 'unlock_area' | 'start_quest' | 'complete_objective' | 'change_affection'
    targetId?: string
    value?: number | string
  }
}

export interface DialogueScene {
  id: string
  trigger: string // 触发条件ID
  lines: DialogueLine[]
  /** 是否只触发一次 */
  once: boolean
}

/** 序章对话场景 */
export const PROLOGUE_DIALOGUES: DialogueScene[] = [
  // ---- 苏醒 ----
  {
    id: 'prologue_wake_up',
    trigger: 'game_start',
    once: true,
    lines: [
      {
        speaker: '埃尔德里克',
        content: '……你终于醒了。我在镇子外边的路上发现了你，看起来像是遭受了什么攻击。',
        emotion: 'worried',
      },
      {
        speaker: '埃尔德里克',
        content: '先别急着起来。你叫什么名字？……想不起来也没关系，慢慢来。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '……我……记不太清了。只记得一道光，然后就什么都……',
        emotion: 'sad',
      },
      {
        speaker: '埃尔德里克',
        content: '失去记忆了吗？这种情况在星火镇附近倒是第一次见。',
        emotion: 'surprised',
      },
      {
        speaker: '埃尔德里克',
        content: '不管怎样，你现在是安全的。这里是星火小镇，我是铁匠埃尔德里克。有什么需要尽管开口。',
        emotion: 'happy',
        effect: {
          type: 'complete_objective',
          targetId: 'prologue_wake_up',
        },
      },
    ],
  },

  // ---- 小镇初识 — 遇见梅莉尔 ----
  {
    id: 'prologue_meet_meriel',
    trigger: 'npc_talk_meriel_first',
    once: true,
    lines: [
      {
        speaker: '梅莉尔',
        content: '哦？一张新面孔！你是从外面来的吗？',
        emotion: 'happy',
      },
      {
        speaker: '旅行者',
        content: '算是吧……其实我也不太确定自己是从哪来的。',
        emotion: 'neutral',
      },
      {
        speaker: '梅莉尔',
        content: '失忆了？有意思——啊不，我是说，真令人担心。不过别灰心，也许在小镇住一段时间，记忆就会回来了。',
        emotion: 'worried',
      },
      {
        speaker: '梅莉尔',
        content: '我是梅莉尔，经营花店的。如果你需要药材或者想了解小镇的事情，随时来找我！',
        emotion: 'happy',
        effect: {
          type: 'change_affection',
          targetId: 'meriel',
          value: 5,
        },
      },
    ],
  },

  // ---- 小镇初识 — 遇见托比亚斯 ----
  {
    id: 'prologue_meet_tobias',
    trigger: 'npc_talk_tobias_first',
    once: true,
    lines: [
      {
        speaker: '托比亚斯',
        content: '……旅行者？新的旅行者吗。自从那场大火之后，愿意来这个镇子的人越来越少了。',
        emotion: 'sad',
      },
      {
        speaker: '旅行者',
        content: '大火？这里发生过什么？',
        emotion: 'surprised',
      },
      {
        speaker: '托比亚斯',
        content: '那是三年前的事了。一场从森林方向蔓延过来的神秘大火烧毁了镇子北半部分。至今没人知道起因。',
        emotion: 'neutral',
      },
      {
        speaker: '托比亚斯',
        content: '我是托比亚斯，镇上的学者。如果你发现了什么关于那场大火的线索，请一定要告诉我。',
        emotion: 'worried',
        effect: {
          type: 'change_affection',
          targetId: 'tobias',
          value: 3,
        },
      },
    ],
  },

  // ---- 小镇初识 — 遇见莉拉 ----
  {
    id: 'prologue_meet_lila',
    trigger: 'npc_talk_lila_first',
    once: true,
    lines: [
      {
        speaker: '莉拉',
        content: '嘿，你就是那个被老埃捡回来的家伙？看起来还活着，不错嘛。',
        emotion: 'happy',
      },
      {
        speaker: '旅行者',
        content: '……谢谢？',
        emotion: 'neutral',
      },
      {
        speaker: '莉拉',
        content: '别在意，我说话就这样。我是莉拉，猎人。镇子周围最近有些不太平，野兽比以前凶了。',
        emotion: 'worried',
      },
      {
        speaker: '莉拉',
        content: '如果你会打架的话，说不定能帮上忙。不会也没关系——我可以教你几招。',
        emotion: 'happy',
        effect: {
          type: 'change_affection',
          targetId: 'lila',
          value: 5,
        },
      },
    ],
  },

  // ---- 战斗训练 ----
  {
    id: 'prologue_combat_training',
    trigger: 'start_combat_training',
    once: true,
    lines: [
      {
        speaker: '莉拉',
        content: '好，先从基本的开始。对付这些训练用稻草人，注意你的攻击节奏。',
        emotion: 'neutral',
      },
      {
        speaker: '莉拉',
        content: '记住——空格键可以暂停战斗，让你仔细规划下一步行动。这叫"实时暂停"战术。',
        emotion: 'happy',
      },
      {
        speaker: '莉拉',
        content: '准备好了就开始吧！别担心，这些稻草人不会真的伤到你。',
        emotion: 'happy',
        effect: {
          type: 'start_quest',
          targetId: 'prologue_training',
        },
      },
    ],
  },

  // ---- 训练完成后 ----
  {
    id: 'prologue_training_complete',
    trigger: 'training_complete',
    once: true,
    lines: [
      {
        speaker: '莉拉',
        content: '干得不错！看来你还保留着战斗的本能。',
        emotion: 'happy',
      },
      {
        speaker: '莉拉',
        content: '不过……说实话，最近森林里的情况确实让我有些担忧。有些野兽的行为明显不正常。',
        emotion: 'worried',
      },
      {
        speaker: '旅行者',
        content: '不正常？怎么说？',
        emotion: 'neutral',
      },
      {
        speaker: '莉拉',
        content: '它们的眼睛会发出诡异的绿光，而且变得比以前凶残得多。我建议你去跟托比亚斯聊聊，他一直在研究这种现象。',
        emotion: 'worried',
        effect: {
          type: 'complete_objective',
          targetId: 'prologue_training',
        },
      },
    ],
  },

  // ---- 森林异变触发 ----
  {
    id: 'prologue_forest_anomaly',
    trigger: 'talk_tobias_after_training',
    once: true,
    lines: [
      {
        speaker: '托比亚斯',
        content: '你来找我了？是莉拉让你来的吧。她是对的——森林的情况越来越糟。',
        emotion: 'worried',
      },
      {
        speaker: '托比亚斯',
        content: '我最近在研究一些从森林深处采集的样本……那些植物和土壤中都含有一种我从未见过的能量。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '这种能量和三年前的大火有关吗？',
        emotion: 'neutral',
      },
      {
        speaker: '托比亚斯',
        content: '……我不确定，但时间线上确实吻合。如果你愿意深入调查的话，我建议你先去镇子北边的森林入口看看。',
        emotion: 'worried',
      },
      {
        speaker: '托比亚斯',
        content: '不过小心——那片森林现在很危险。带上足够的补给。',
        emotion: 'worried',
        effect: {
          type: 'unlock_area',
          targetId: 'forest_entrance',
        },
      },
    ],
  },
]

// =============================================
// 序章任务链定义
// =============================================

export const PROLOGUE_QUESTS: QuestDefinition[] = [
  // 任务1：苏醒
  {
    id: 'prologue_wake_up',
    title: '苏醒',
    description: '在星火小镇醒来，了解自己的处境',
    type: 'main',
    chapter: 0,
    giverNpcId: 'eldric',
    trigger: {
      type: 'auto',
      conditions: undefined,
    },
    prerequisites: [],
    objectives: [
      {
        id: 'obj_wake_up',
        description: '与埃尔德里克对话',
        type: 'talk_to_npc',
        targetId: 'eldric',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 10,
      coins: 20,
      items: [],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 1,
    autoAccept: true,
    canRetry: false,
  },

  // 任务2：小镇初识
  {
    id: 'prologue_meet_npcs',
    title: '小镇初识',
    description: '认识星火小镇的关键居民',
    type: 'main',
    chapter: 0,
    giverNpcId: 'eldric',
    trigger: {
      type: 'quest_complete',
      targetId: 'prologue_wake_up',
    },
    prerequisites: ['prologue_wake_up'],
    objectives: [
      {
        id: 'obj_meet_meriel',
        description: '与花店店主梅莉尔交谈',
        type: 'talk_to_npc',
        targetId: 'meriel',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_meet_tobias',
        description: '与学者托比亚斯交谈',
        type: 'talk_to_npc',
        targetId: 'tobias',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_meet_lila',
        description: '与猎人莉拉交谈',
        type: 'talk_to_npc',
        targetId: 'lila',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 20,
      coins: 50,
      items: [
        { itemId: 'item_healing_herb', itemName: '治疗草药', quantity: 3 },
      ],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 1,
    autoAccept: true,
    canRetry: false,
  },

  // 任务3：初试锋芒
  {
    id: 'prologue_combat_training',
    title: '初试锋芒',
    description: '跟随莉拉完成战斗训练',
    type: 'main',
    chapter: 0,
    giverNpcId: 'lila',
    trigger: {
      type: 'quest_complete',
      targetId: 'prologue_meet_npcs',
    },
    prerequisites: ['prologue_meet_npcs'],
    objectives: [
      {
        id: 'obj_training',
        description: '完成战斗训练',
        type: 'kill_enemy',
        targetId: 'training_dummy',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 30,
      coins: 30,
      items: [
        { itemId: 'item_wooden_sword', itemName: '木剑', quantity: 1 },
      ],
      unlocks: [
        { type: 'feature', id: 'combat', name: '战斗系统' },
      ],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 1,
    autoAccept: false,
    canRetry: true,
  },

  // 任务4：森林异变
  {
    id: 'prologue_forest_anomaly',
    title: '森林异变',
    description: '调查森林中的异常现象',
    type: 'main',
    chapter: 0,
    giverNpcId: 'tobias',
    trigger: {
      type: 'quest_complete',
      targetId: 'prologue_combat_training',
    },
    prerequisites: ['prologue_combat_training'],
    objectives: [
      {
        id: 'obj_talk_tobias',
        description: '向托比亚斯了解森林情况',
        type: 'talk_to_npc',
        targetId: 'tobias',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_visit_forest',
        description: '前往森林入口',
        type: 'visit_area',
        targetId: 'forest_entrance',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 40,
      coins: 50,
      items: [
        { itemId: 'item_antidote', itemName: '解毒药', quantity: 2 },
      ],
      unlocks: [
        { type: 'area', id: 'whispering_forest', name: '低语森林' },
        { type: 'quest', id: 'chapter1_whispering_forest', name: '第一章：森林低语' },
      ],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 2,
    autoAccept: true,
    canRetry: false,
  },
]

// =============================================
// 序章触发条件映射
// =============================================

/** 触发器ID → 对话场景映射 */
export const PROLOGUE_TRIGGER_MAP: Record<string, string> = {
  'game_start': 'prologue_wake_up',
  'npc_talk_meriel_first': 'prologue_meet_meriel',
  'npc_talk_tobias_first': 'prologue_meet_tobias',
  'npc_talk_lila_first': 'prologue_meet_lila',
  'start_combat_training': 'prologue_combat_training',
  'training_complete': 'prologue_training_complete',
  'talk_tobias_after_training': 'prologue_forest_anomaly',
}

/**
 * 获取序章对话场景
 */
export function getPrologueDialogue(triggerId: string): DialogueScene | undefined {
  const sceneId = PROLOGUE_TRIGGER_MAP[triggerId]
  if (!sceneId) return undefined
  return PROLOGUE_DIALOGUES.find((d) => d.id === sceneId)
}

/**
 * 获取序章所有任务定义
 */
export function getPrologueQuests(): QuestDefinition[] {
  return PROLOGUE_QUESTS
}
