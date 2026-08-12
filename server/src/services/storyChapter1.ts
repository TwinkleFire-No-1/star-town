// 星火小镇 — 第一章脚本
// T4.2.2 「森林低语」完整事件链

import type { QuestDefinition } from './questTypes.js'
import type { DialogueScene } from './storyPrologue.js'

// =============================================
// 第一章剧情设定
// =============================================

/**
 * 第一章：森林低语
 *
 * 故事梗概：
 * 玩家深入低语森林，发现腐化正从森林核心向外蔓延。
 * 沿途中遇到被腐化的动物、变异的植物和神秘的遗迹。
 * 在探索过程中，玩家逐渐揭开三年前大火的真相——
 * 一个古老的封印正在破裂，释放出腐化之力。
 * 最终在森林深处面对「森林守卫」（被腐化的守护精灵），
 * 击败它后暂时遏制了腐化的扩散，但更大的危机正在酝酿。
 *
 * 第一章任务链：
 * 1. 「低语之路」 — 进入森林，抵达第一个据点
 * 2. 「腐化之源」 — 调查3处腐化节点
 * 3. 「沉睡的遗迹」 — 发现古代封印遗迹
 * 4. 「守卫之战」 — 面对被腐化的森林守卫（BOSS战）
 * 5. 「封印修复」 — 协助托比亚斯修复封印
 */

// =============================================
// 第一章对话场景
// =============================================

export const CHAPTER1_DIALOGUES: DialogueScene[] = [
  // ---- 进入森林 ----
  {
    id: 'ch1_enter_forest',
    trigger: 'area_enter_forest_entrance',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '……这就是低语森林。空气中弥漫着一种奇怪的甜味，让人有些头晕。',
        emotion: 'worried',
      },
      {
        speaker: '???',
        content: '（远处的树丛中传来低沉的呢喃声……）',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '有人在说话？还是……风声？',
        emotion: 'neutral',
      },
      {
        speaker: '莉拉',
        content: '你到了吗？注意脚下——这片森林的地面有些不对劲，像是在……蠕动。',
        emotion: 'worried',
      },
    ],
  },

  // ---- 发现第一个腐化节点 ----
  {
    id: 'ch1_first_corruption',
    trigger: 'discover_corruption_1',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '这棵树……它的树皮下面在发光。是那种诡异的绿色。',
        emotion: 'surprised',
      },
      {
        speaker: '托比亚斯',
        content: '（通过远程通讯）你发现了腐化节点！那些绿光就是我在样本中检测到的异常能量。',
        emotion: 'neutral',
      },
      {
        speaker: '托比亚斯',
        content: '小心，不要直接触碰。那种能量……会侵蚀生命体。三年前的大火就是从这种能量失控开始的。',
        emotion: 'worried',
      },
      {
        speaker: '旅行者',
        content: '所以……这些腐化就是大火的源头？',
        emotion: 'neutral',
      },
      {
        speaker: '托比亚斯',
        content: '不完全是。大火只是结果——真正的问题是某个深层封印正在逐渐失效。我需要更多数据来确认。',
        emotion: 'worried',
      },
    ],
  },

  // ---- 发现被腐化的动物 ----
  {
    id: 'ch1_corrupted_wolf',
    trigger: 'encounter_corrupted_wolf',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '一头狼……但它的眼睛在发绿光，而且体型比普通的狼大了一圈。',
        emotion: 'surprised',
      },
      {
        speaker: '莉拉',
        content: '这就是被腐化的野兽！它们的攻击性极强，而且比正常野兽更耐打。准备好战斗！',
        emotion: 'worried',
      },
    ],
  },

  // ---- 发现古代遗迹 ----
  {
    id: 'ch1_discover_ruins',
    trigger: 'discover_ruins',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '这些石柱……上面刻着我看不懂的符文。看起来像是某种封印装置。',
        emotion: 'surprised',
      },
      {
        speaker: '托比亚斯',
        content: '（远程通讯）封印遗迹！我一直在寻找这种东西！你能帮我记录下那些符文吗？',
        emotion: 'happy',
      },
      {
        speaker: '旅行者',
        content: '我试试……（仔细观察）中间的石柱上有一个巨大的裂纹，绿光正从裂缝中涌出。',
        emotion: 'neutral',
      },
      {
        speaker: '托比亚斯',
        content: '那个裂纹……这就是封印被破坏的证据！如果不在这种扩散被控制住，后果将不堪设想。',
        emotion: 'worried',
      },
      {
        speaker: '???',
        content: '（石柱深处传来低沉的咆哮……）',
        emotion: 'angry',
      },
      {
        speaker: '旅行者',
        content: '有什么东西……在遗迹深处。而且它已经注意到我了。',
        emotion: 'worried',
      },
    ],
  },

  // ---- BOSS战前 ----
  {
    id: 'ch1_pre_boss',
    trigger: 'approach_forest_guardian',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '这个巨大的身影……它是森林的守护精灵吗？但全身都被腐化了。',
        emotion: 'worried',
      },
      {
        speaker: '森林守卫',
        content: '……离……开……这里……不……要……再……靠近……封……印……',
        emotion: 'angry',
      },
      {
        speaker: '旅行者',
        content: '它还在挣扎！它在试图控制自己——但腐化太强了。',
        emotion: 'sad',
      },
      {
        speaker: '莉拉',
        content: '没有别的办法了。我们必须打败它才能接近封印！准备好——这将是一场硬仗！',
        emotion: 'worried',
      },
    ],
  },

  // ---- BOSS战后 ----
  {
    id: 'ch1_post_boss',
    trigger: 'boss_defeated_forest_guardian',
    once: true,
    lines: [
      {
        speaker: '森林守卫',
        content: '……谢……谢……你……',
        emotion: 'sad',
      },
      {
        speaker: '旅行者',
        content: '它……在感谢我？看来打败它反而是解放了它。',
        emotion: 'sad',
      },
      {
        speaker: '托比亚斯',
        content: '（远程通讯）森林守卫是被封印的能量腐化的守护者。打败它，腐化的源头就被暂时切断了。',
        emotion: 'neutral',
      },
      {
        speaker: '托比亚斯',
        content: '但是，这只是治标——封印本身还在继续恶化。我需要你帮忙收集修复封印的材料。',
        emotion: 'worried',
      },
    ],
  },

  // ---- 修复封印 ----
  {
    id: 'ch1_seal_repair',
    trigger: 'repair_seal_start',
    once: true,
    lines: [
      {
        speaker: '托比亚斯',
        content: '根据我从符文中破译的信息，修复封印需要三种材料：月光花、纯净水晶和树心精华。',
        emotion: 'neutral',
      },
      {
        speaker: '梅莉尔',
        content: '（远程通讯）月光花！我在古老的植物图鉴中见过——据说只在满月之夜的森林深处绽放。',
        emotion: 'surprised',
      },
      {
        speaker: '莉拉',
        content: '（远程通讯）纯净水晶在遗迹东侧的矿脉里可能有。至于树心精华……你得找一棵还没被腐化的古树。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '好，我知道了。我去收集这些材料。',
        emotion: 'neutral',
      },
    ],
  },

  // ---- 封印修复完成 ----
  {
    id: 'ch1_seal_repaired',
    trigger: 'seal_repair_complete',
    once: true,
    lines: [
      {
        speaker: '托比亚斯',
        content: '封印……修复了！虽然不是完全恢复，但至少腐化扩散的速度被大幅减缓了。',
        emotion: 'happy',
      },
      {
        speaker: '旅行者',
        content: '接下来呢？只是减缓，不是根治吧？',
        emotion: 'worried',
      },
      {
        speaker: '托比亚斯',
        content: '你说得对。这些封印是上古时期由一位大法师设下的，以现在的技术只能做应急修复。',
        emotion: 'sad',
      },
      {
        speaker: '托比亚斯',
        content: '真正的解决方案……可能需要找到那位法师留下的其他封印。据古籍记载，一共有五处。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '五处封印……看来这只是开始。',
        emotion: 'neutral',
      },
    ],
  },
]

// =============================================
// 第一章任务链定义
// =============================================

export const CHAPTER1_QUESTS: QuestDefinition[] = [
  // 任务1：低语之路
  {
    id: 'ch1_whispering_path',
    title: '低语之路',
    description: '深入低语森林，寻找第一个安全据点',
    type: 'main',
    chapter: 1,
    giverNpcId: 'lila',
    trigger: {
      type: 'quest_complete',
      targetId: 'prologue_forest_anomaly',
    },
    prerequisites: ['prologue_forest_anomaly'],
    objectives: [
      {
        id: 'obj_enter_forest',
        description: '进入低语森林',
        type: 'visit_area',
        targetId: 'whispering_forest',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_reach_camp',
        description: '抵达森林中的安全据点',
        type: 'visit_area',
        targetId: 'forest_camp',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_defeat_wolves',
        description: '击退沿途的腐化狼群',
        type: 'kill_enemy',
        targetId: 'enemy_wolf',
        requiredCount: 3,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 50,
      coins: 80,
      items: [
        { itemId: 'item_healing_herb', itemName: '治疗草药', quantity: 5 },
      ],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 3,
    autoAccept: true,
    canRetry: true,
  },

  // 任务2：腐化之源
  {
    id: 'ch1_corruption_source',
    title: '腐化之源',
    description: '调查森林中的腐化节点，了解腐化蔓延的原因',
    type: 'main',
    chapter: 1,
    giverNpcId: 'tobias',
    trigger: {
      type: 'quest_complete',
      targetId: 'ch1_whispering_path',
    },
    prerequisites: ['ch1_whispering_path'],
    objectives: [
      {
        id: 'obj_corruption_1',
        description: '调查第一处腐化节点',
        type: 'visit_area',
        targetId: 'corruption_node_1',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_corruption_2',
        description: '调查第二处腐化节点',
        type: 'visit_area',
        targetId: 'corruption_node_2',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_corruption_3',
        description: '调查第三处腐化节点',
        type: 'visit_area',
        targetId: 'corruption_node_3',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_defeat_mushrooms',
        description: '击败守护腐化节点的毒雾蘑菇',
        type: 'kill_enemy',
        targetId: 'enemy_mushroom',
        requiredCount: 3,
        currentCount: 0,
        optional: true,
      },
    ],
    reward: {
      exp: 60,
      coins: 100,
      items: [
        { itemId: 'item_antidote', itemName: '解毒药', quantity: 5 },
        { itemId: 'item_corruption_sample', itemName: '腐化样本', quantity: 1 },
      ],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 4,
    autoAccept: false,
    canRetry: true,
  },

  // 任务3：沉睡的遗迹
  {
    id: 'ch1_sleeping_ruins',
    title: '沉睡的遗迹',
    description: '找到上古封印遗迹，破译封印符文',
    type: 'main',
    chapter: 1,
    giverNpcId: 'tobias',
    trigger: {
      type: 'quest_complete',
      targetId: 'ch1_corruption_source',
    },
    prerequisites: ['ch1_corruption_source'],
    objectives: [
      {
        id: 'obj_find_ruins',
        description: '找到上古封印遗迹',
        type: 'visit_area',
        targetId: 'ancient_seal_ruins',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_record_runes',
        description: '记录封印符文',
        type: 'custom',
        targetId: 'seal_runes',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_defeat_ghosts',
        description: '击败遗迹中的迷途幽灵',
        type: 'kill_enemy',
        targetId: 'enemy_ghost',
        requiredCount: 2,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_defeat_treant',
        description: '击败腐化树精',
        type: 'kill_enemy',
        targetId: 'enemy_treant',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 80,
      coins: 120,
      items: [
        { itemId: 'item_seal_fragment', itemName: '封印碎片', quantity: 1 },
      ],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 5,
    autoAccept: false,
    canRetry: true,
  },

  // 任务4：守卫之战（BOSS战）
  {
    id: 'ch1_guardian_battle',
    title: '守卫之战',
    description: '面对被腐化的森林守卫，阻止腐化进一步扩散',
    type: 'main',
    chapter: 1,
    giverNpcId: 'tobias',
    trigger: {
      type: 'quest_complete',
      targetId: 'ch1_sleeping_ruins',
    },
    prerequisites: ['ch1_sleeping_ruins'],
    objectives: [
      {
        id: 'obj_approach_guardian',
        description: '接近森林守卫',
        type: 'visit_area',
        targetId: 'guardian_lair',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_defeat_guardian',
        description: '击败森林守卫',
        type: 'kill_enemy',
        targetId: 'boss_forest_guardian',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 150,
      coins: 200,
      items: [
        { itemId: 'item_guardian_essence', itemName: '守卫精华', quantity: 1 },
        { itemId: 'item_ancient_blade', itemName: '远古之刃', quantity: 1 },
      ],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 6,
    autoAccept: false,
    canRetry: true,
  },

  // 任务5：封印修复
  {
    id: 'ch1_seal_repair',
    title: '封印修复',
    description: '收集材料修复上古封印，遏制腐化蔓延',
    type: 'main',
    chapter: 1,
    giverNpcId: 'tobias',
    trigger: {
      type: 'quest_complete',
      targetId: 'ch1_guardian_battle',
    },
    prerequisites: ['ch1_guardian_battle'],
    objectives: [
      {
        id: 'obj_moonflower',
        description: '收集月光花',
        type: 'collect_item',
        targetId: 'item_moonflower',
        requiredCount: 3,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_pure_crystal',
        description: '收集纯净水晶',
        type: 'collect_item',
        targetId: 'item_pure_crystal',
        requiredCount: 2,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_tree_heart',
        description: '获取树心精华',
        type: 'collect_item',
        targetId: 'item_tree_heart_essence',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_repair_seal',
        description: '在遗迹中修复封印',
        type: 'custom',
        targetId: 'repair_seal',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 100,
      coins: 150,
      items: [
        { itemId: 'item_seal_amulet', itemName: '封印护符', quantity: 1 },
      ],
      affectionChanges: [
        { npcId: 'tobias', npcName: '托比亚斯', change: 15 },
        { npcId: 'lila', npcName: '莉拉', change: 10 },
        { npcId: 'meriel', npcName: '梅莉尔', change: 5 },
      ],
      unlocks: [
        { type: 'quest', id: 'chapter2_placeholder', name: '第二章（未开放）' },
      ],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 6,
    autoAccept: false,
    canRetry: false,
  },
]

// =============================================
// 第一章触发条件映射
// =============================================

export const CHAPTER1_TRIGGER_MAP: Record<string, string> = {
  'area_enter_forest_entrance': 'ch1_enter_forest',
  'discover_corruption_1': 'ch1_first_corruption',
  'encounter_corrupted_wolf': 'ch1_corrupted_wolf',
  'discover_ruins': 'ch1_discover_ruins',
  'approach_forest_guardian': 'ch1_pre_boss',
  'boss_defeated_forest_guardian': 'ch1_post_boss',
  'repair_seal_start': 'ch1_seal_repair',
  'seal_repair_complete': 'ch1_seal_repaired',
}

/**
 * 获取第一章对话场景
 */
export function getChapter1Dialogue(triggerId: string): DialogueScene | undefined {
  const sceneId = CHAPTER1_TRIGGER_MAP[triggerId]
  if (!sceneId) return undefined
  return CHAPTER1_DIALOGUES.find((d) => d.id === sceneId)
}

/**
 * 获取第一章所有任务定义
 */
export function getChapter1Quests(): QuestDefinition[] {
  return CHAPTER1_QUESTS
}
