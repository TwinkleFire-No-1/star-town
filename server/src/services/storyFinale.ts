// 星火小镇 — 终章脚本
// T4.2.5 「星火重燃」完整事件链 + 多结局分支

import type { QuestDefinition } from './questTypes.js'
import type { DialogueScene } from './storyPrologue.js'

// =============================================
// 终章剧情设定
// =============================================

/**
 * 终章：星火重燃
 *
 * 故事梗概：
 * 玩家集齐了阿拉密斯法杖的三段碎片，在星火小镇
 * 地下密室中重新组装法杖。生命之树指引玩家前往
 * 暗影组织的总部——暗影之塔。在那里，暗祭司塞拉斯
 * 正在举行释放阿拉密斯的仪式。
 *
 * 玩家面对最终抉择：
 * 1. 【封印路线】使用法杖加固封印，阿拉密斯永眠
 * 2. 【救赎路线】用法杖与阿拉密斯对话，说服其放下仇恨
 * 3. 【毁灭路线】摧毁法杖，彻底终结封印与暗影之力
 *
 * 三种结局各有不同的世界观影响和NPC反应。
 *
 * 终章任务链：
 * 1. 「密室之匙」 — 在小镇地下找到法杖第一段
 * 2. 「巢穴之心」 — 在腐化巢穴深处找到法杖第二段
 * 3. 「暗影之塔」 — 前往暗影组织总部
 * 4. 「宿命之战」 — 击败暗祭司塞拉斯，夺回法杖第三段
 * 5. 「星火抉择」 — 在生命之树前做出最终选择
 */

// =============================================
// 终章对话场景
// =============================================

export const FINALE_DIALOGUES: DialogueScene[] = [
  // ---- 小镇地下密室 ----
  {
    id: 'finale_underground_chamber',
    trigger: 'enter_underground_chamber',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '这就是托比亚斯说的地下密室……墙壁上的符文和精灵圣林的一模一样。',
        emotion: 'neutral',
      },
      {
        speaker: '托比亚斯',
        content: '小心！这些符文是古代精灵的防护法阵。碰错了可能会触发陷阱。',
        emotion: 'worried',
      },
      {
        speaker: '旅行者',
        content: '石台上……有一个发光的物体。那就是法杖的第一段碎片？',
        emotion: 'surprised',
      },
      {
        speaker: '莉拉',
        content: '（通讯）我能感应到强大的灵力波动！小心，法杖碎片有自己的意志。',
        emotion: 'worried',
      },
      {
        speaker: '旅行者',
        content: '（伸手拿取）好温暖……不像暗影之力那样冰冷。它在回应我。',
        emotion: 'happy',
      },
      {
        speaker: '托比亚斯',
        content: '太好了！第一段到手。接下来是腐化巢穴中的第二段。',
        emotion: 'happy',
        effect: {
          type: 'complete_objective',
          targetId: 'finale_staff_fragment_1',
        },
      },
    ],
  },

  // ---- 腐化巢穴深处 ----
  {
    id: 'finale_corruption_nest',
    trigger: 'enter_corruption_nest_depths',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '这里的腐化比上次更深了……空气中弥漫着令人不安的气息。',
        emotion: 'worried',
      },
      {
        speaker: '铁砧',
        content: '（通讯）这种腐化……不是自然的。有人在蓄意散播这些力量。',
        emotion: 'angry',
      },
      {
        speaker: '旅行者',
        content: '前方有一个被腐化侵蚀的精灵守护者。它似乎在守护着什么。',
        emotion: 'neutral',
      },
      {
        speaker: '腐化守护者',
        content: '……不许……靠近……封印……不可……破坏……',
        emotion: 'angry',
      },
      {
        speaker: '旅行者',
        content: '它被腐化了，但还在试图执行使命。我必须战斗。',
        emotion: 'neutral',
        effect: {
          type: 'start_quest',
          targetId: 'finale_nest_heart',
        },
      },
    ],
  },

  // ---- 击败腐化守护者后 ----
  {
    id: 'finale_after_guardian',
    trigger: 'defeat_corrupted_guardian',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '守护者倒下了……它最后的动作是指向了那边的石壁。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '（石壁后方）又一段法杖碎片！它散发出的光芒在驱散周围的腐化。',
        emotion: 'happy',
      },
      {
        speaker: '莉拉',
        content: '（通讯）法杖碎片的力量正在自动净化周围的腐化！太不可思议了。',
        emotion: 'surprised',
      },
      {
        speaker: '旅行者',
        content: '两段碎片了。最后一段在暗祭司塞拉斯手中。是时候直面暗影之塔了。',
        emotion: 'neutral',
        effect: {
          type: 'complete_objective',
          targetId: 'finale_staff_fragment_2',
        },
      },
    ],
  },

  // ---- 暗影之塔入口 ----
  {
    id: 'finale_shadow_tower_entrance',
    trigger: 'enter_shadow_tower',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '暗影之塔……它比我想象的还要阴暗。整个建筑都在散发腐化的气息。',
        emotion: 'worried',
      },
      {
        speaker: '马库斯',
        content: '（通讯）我已经集结了小镇的卫兵。我们会在外面策应你。一切小心！',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '我能感应到塞拉斯在塔顶。仪式还没有完成……我还有时间。',
        emotion: 'neutral',
      },
      {
        speaker: '暗影祭司塞拉斯',
        content: '（远方传来声音）你来得太晚了，旅行者。阿拉密斯大人的觉醒已经不可阻挡！',
        emotion: 'angry',
      },
      {
        speaker: '旅行者',
        content: '还没结束！我不会让你得逞的！',
        emotion: 'angry',
        effect: {
          type: 'start_quest',
          targetId: 'finale_shadow_tower',
        },
      },
    ],
  },

  // ---- 塔内战斗 ----
  {
    id: 'finale_tower_battle',
    trigger: 'shadow_tower_combat',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '塔内的暗影生物越来越强……每上一层，腐化的力量就更浓厚。',
        emotion: 'worried',
      },
      {
        speaker: '暗影祭司塞拉斯',
        content: '你以为你能阻止命运？阿拉密斯是这个世界真正的主人！他即将回归！',
        emotion: 'angry',
      },
      {
        speaker: '格罗姆',
        content: '（通讯）旅行者，生命之树在支援你！我感受到了它的力量正在注入你的法杖碎片。',
        emotion: 'happy',
      },
      {
        speaker: '旅行者',
        content: '我能感觉到……法杖碎片在共鸣！它们在回应生命之树的力量！',
        emotion: 'surprised',
      },
    ],
  },

  // ---- 宿命之战：对阵塞拉斯 ----
  {
    id: 'finale_final_battle',
    trigger: 'confront_silas',
    once: true,
    lines: [
      {
        speaker: '暗影祭司塞拉斯',
        content: '终于面对面了，旅行者。你一路走来，杀了我那么多部下。但这一切都无济于事。',
        emotion: 'angry',
      },
      {
        speaker: '旅行者',
        content: '塞拉斯，放下法杖碎片。这不是你该拥有的力量。',
        emotion: 'neutral',
      },
      {
        speaker: '暗影祭司塞拉斯',
        content: '放下？你太天真了。这第三段法杖碎片是打开封印的钥匙——阿拉密斯大人即将重获自由！',
        emotion: 'angry',
      },
      {
        speaker: '旅行者',
        content: '你已经失去了太多追随者。你一个人撑不了多久。',
        emotion: 'neutral',
      },
      {
        speaker: '暗影祭司塞拉斯',
        content: '我不需要追随者！有了阿拉密斯的力量，我一个人就能重塑这个世界！来吧——！',
        emotion: 'angry',
        effect: {
          type: 'start_quest',
          targetId: 'finale_fated_battle',
        },
      },
    ],
  },

  // ---- 击败塞拉斯后 ----
  {
    id: 'finale_after_silas',
    trigger: 'defeat_silas',
    once: true,
    lines: [
      {
        speaker: '暗影祭司塞拉斯',
        content: '不……不可能……阿拉密斯大人的力量……为什么会失败？',
        emotion: 'sad',
      },
      {
        speaker: '旅行者',
        content: '因为那不是真正的力量，塞拉斯。那只是痛苦和愤怒。',
        emotion: 'neutral',
      },
      {
        speaker: '暗影祭司塞拉斯',
        content: '法杖碎片……拿走吧。但你要知道……无论你做什么选择，这个世界都不会再一样了。',
        emotion: 'sad',
      },
      {
        speaker: '旅行者',
        content: '（拾起第三段法杖碎片）三段碎片终于集齐了。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '现在，我需要做出选择。回到生命之树前……完成这一切。',
        emotion: 'neutral',
        effect: {
          type: 'complete_objective',
          targetId: 'finale_staff_fragment_3',
        },
      },
    ],
  },

  // ---- 星火抉择：生命之树前 ----
  {
    id: 'finale_choice',
    trigger: 'stand_before_life_tree',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '三段法杖碎片在我手中，生命之树在面前。一切都到了这一刻。',
        emotion: 'neutral',
      },
      {
        speaker: '格罗姆',
        content: '旅行者，法杖已经完整了。你现在有三个选择。',
        emotion: 'neutral',
      },
      {
        speaker: '格罗姆',
        content: '第一，使用法杖加固封印。阿拉密斯将永远沉睡，世界将恢复和平，但精灵的力量也会随之消逝。',
        emotion: 'neutral',
      },
      {
        speaker: '格罗姆',
        content: '第二，使用法杖与阿拉密斯对话。也许……也许他能被说服放下仇恨。这是最不确定的路。',
        emotion: 'sad',
      },
      {
        speaker: '格罗姆',
        content: '第三，摧毁法杖。封印会崩溃，但暗影之力也会彻底消散。包括我体内的精灵之力。',
        emotion: 'sad',
      },
      {
        speaker: '玛格丽特',
        content: '无论你选择什么，我们都会支持你。你已经走得太远了，旅行者。',
        emotion: 'happy',
      },
      {
        speaker: '旅行者',
        content: '我做出了选择。',
        emotion: 'neutral',
        effect: {
          type: 'start_quest',
          targetId: 'finale_spark_choice',
        },
      },
    ],
  },

  // ---- 结局A：封印路线 ----
  {
    id: 'finale_ending_seal',
    trigger: 'choose_seal_ending',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '（举起法杖）我选择加固封印。为了所有人的安宁。',
        emotion: 'neutral',
      },
      {
        speaker: '阿拉密斯',
        content: '（远方的声音）又一个……自以为是的英雄。你以为封印能永远困住我？',
        emotion: 'angry',
      },
      {
        speaker: '旅行者',
        content: '不是永远。但足够让这个世界找到它自己的道路。',
        emotion: 'neutral',
      },
      {
        speaker: '格罗姆',
        content: '法杖的力量……正在融入生命之树！封印正在被重新加固！',
        emotion: 'surprised',
      },
      {
        speaker: '旅行者',
        content: '（光芒消散）结束了。阿拉密斯的封印比以往更坚固了。',
        emotion: 'happy',
      },
      {
        speaker: '格罗姆',
        content: '精灵的力量也在消散……但这是值得的。谢谢你，旅行者。',
        emotion: 'sad',
      },
      {
        speaker: '玛格丽特',
        content: '星火小镇会记住你的。来吧，大家都在等你——英雄！',
        emotion: 'happy',
        effect: {
          type: 'complete_objective',
          targetId: 'finale_spark_choice',
          value: 'ending_seal',
        },
      },
    ],
  },

  // ---- 结局B：救赎路线 ----
  {
    id: 'finale_ending_redemption',
    trigger: 'choose_redemption_ending',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '（举起法杖）我要和他对话。阿拉密斯曾经也是精灵的骄傲——我要让他记起。',
        emotion: 'neutral',
      },
      {
        speaker: '格罗姆',
        content: '你在冒险……但也许你是对的。',
        emotion: 'worried',
      },
      {
        speaker: '旅行者',
        content: '阿拉密斯！你能听到我吗？三百年前，你为了对抗腐化而坠入黑暗。但你最初的愿望不是毁灭！',
        emotion: 'angry',
      },
      {
        speaker: '阿拉密斯',
        content: '（声音颤抖）最初的……愿望？我……我想要保护大家……',
        emotion: 'sad',
      },
      {
        speaker: '旅行者',
        content: '还记得吗？那些你想要保护的人。精灵们用生命封印了你，不是因为他们恨你——是因为他们爱你，不希望你彻底迷失。',
        emotion: 'neutral',
      },
      {
        speaker: '阿拉密斯',
        content: '（声音渐渐平静）……我……我想起来了。三百年了……我终于……想起来了。',
        emotion: 'sad',
      },
      {
        speaker: '阿拉密斯',
        content: '谢谢你，旅行者。你能听到一个老人的遗言吗？——请守护这个世界。',
        emotion: 'sad',
      },
      {
        speaker: '旅行者',
        content: '（阿拉密斯的力量化为光芒，融入生命之树）他放下了。',
        emotion: 'sad',
      },
      {
        speaker: '格罗姆',
        content: '（落泪）封印不再需要了。阿拉密斯……他终于自由了。',
        emotion: 'sad',
        effect: {
          type: 'complete_objective',
          targetId: 'finale_spark_choice',
          value: 'ending_redemption',
        },
      },
    ],
  },

  // ---- 结局C：毁灭路线 ----
  {
    id: 'finale_ending_destruction',
    trigger: 'choose_destruction_ending',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '（举起法杖）我选择摧毁法杖。终结这一切——封印和暗影之力。',
        emotion: 'neutral',
      },
      {
        speaker: '格罗姆',
        content: '旅行者！你确定吗？这意味着精灵之力也会消散——包括我！',
        emotion: 'worried',
      },
      {
        speaker: '旅行者',
        content: '我确定。这个世界不需要封印，也不需要暗影。它需要自己的未来。',
        emotion: 'neutral',
      },
      {
        speaker: '阿拉密斯',
        content: '（狂怒）不——！你敢！封印崩溃我也不会消失——我会——！',
        emotion: 'angry',
      },
      {
        speaker: '旅行者',
        content: '（折断法杖）永别了，阿拉密斯。',
        emotion: 'neutral',
      },
      {
        speaker: '旅行者',
        content: '（巨大的能量爆发，法杖碎裂，封印崩解，暗影之力与精灵之力一同消散）',
        emotion: 'surprised',
      },
      {
        speaker: '格罗姆',
        content: '（灵力消散中）旅行者……谢谢你。这个世界……终于……自由了……',
        emotion: 'sad',
      },
      {
        speaker: '旅行者',
        content: '格罗姆……',
        emotion: 'sad',
      },
      {
        speaker: '玛格丽特',
        content: '（远处）光芒……消散了。旅行者，你做到了。虽然代价沉重……但世界自由了。',
        emotion: 'sad',
        effect: {
          type: 'complete_objective',
          targetId: 'finale_spark_choice',
          value: 'ending_destruction',
        },
      },
    ],
  },

  // ---- 终章尾声 ----
  {
    id: 'finale_epilogue',
    trigger: 'finale_complete',
    once: true,
    lines: [
      {
        speaker: '旅行者',
        content: '一切都结束了。星火小镇恢复了平静。',
        emotion: 'happy',
      },
      {
        speaker: '玛格丽特',
        content: '酒馆为你准备了庆功宴！所有人都等着你呢。',
        emotion: 'happy',
      },
      {
        speaker: '托比亚斯',
        content: '我已经把这段冒险编成了歌——「星火重燃之歌」。今晚就唱给你听！',
        emotion: 'happy',
      },
      {
        speaker: '旅行者',
        content: '星火不灭，希望永在。这片土地的故事，才刚刚开始。',
        emotion: 'happy',
        effect: {
          type: 'change_affection',
          targetId: 'all',
          value: 10,
        },
      },
    ],
  },
]

// =============================================
// 终章任务定义
// =============================================

export const FINALE_QUESTS: QuestDefinition[] = [
  {
    id: 'finale_staff_fragment_1',
    title: '密室之匙',
    description: '在星火小镇地下密室中找到法杖第一段碎片',
    type: 'main',
    chapter: 5,
    trigger: {
      type: 'quest_complete',
      targetId: 'ch3_staff_secret',
    },
    prerequisites: ['ch3_staff_secret'],
    objectives: [
      {
        id: 'obj_find_fragment_1',
        description: '找到法杖第一段碎片',
        type: 'visit_area',
        targetId: 'underground_chamber',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 150,
      coins: 100,
      items: [{ itemId: 'item_staff_fragment_1', itemName: '法杖碎片·根', quantity: 1 }],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 10,
    autoAccept: true,
    canRetry: false,
  },
  {
    id: 'finale_staff_fragment_2',
    title: '巢穴之心',
    description: '深入腐化巢穴，击败腐化守护者，夺取法杖第二段碎片',
    type: 'main',
    chapter: 5,
    trigger: {
      type: 'event',
      targetId: 'finale_underground_chamber',
    },
    prerequisites: ['finale_staff_fragment_1'],
    objectives: [
      {
        id: 'obj_defeat_corrupted_guardian',
        description: '击败腐化守护者',
        type: 'kill_enemy',
        targetId: 'corrupted_guardian',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 200,
      coins: 150,
      items: [
        { itemId: 'item_staff_fragment_2', itemName: '法杖碎片·茎', quantity: 1 },
        { itemId: 'item_purification_crystal', itemName: '净化水晶', quantity: 3 },
      ],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 11,
    autoAccept: true,
    canRetry: true,
  },
  {
    id: 'finale_staff_fragment_3',
    title: '暗影之塔',
    description: '攻入暗影组织总部，从暗祭司塞拉斯手中夺回法杖第三段',
    type: 'main',
    chapter: 5,
    trigger: {
      type: 'event',
      targetId: 'finale_after_guardian',
    },
    prerequisites: ['finale_staff_fragment_2'],
    objectives: [
      {
        id: 'obj_reach_shadow_tower',
        description: '到达暗影之塔顶层',
        type: 'visit_area',
        targetId: 'shadow_tower_top',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_defeat_silas',
        description: '击败暗祭司塞拉斯',
        type: 'kill_enemy',
        targetId: 'silas',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 300,
      coins: 200,
      items: [
        { itemId: 'item_staff_fragment_3', itemName: '法杖碎片·冠', quantity: 1 },
        { itemId: 'item_shadow_robe', itemName: '暗影法袍', quantity: 1 },
      ],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 12,
    autoAccept: true,
    canRetry: true,
  },
  {
    id: 'finale_fated_battle',
    title: '宿命之战',
    description: '与暗祭司塞拉斯进行最终决斗',
    type: 'main',
    chapter: 5,
    trigger: {
      type: 'event',
      targetId: 'finale_final_battle',
    },
    prerequisites: ['finale_staff_fragment_3'],
    objectives: [
      {
        id: 'obj_defeat_silas_final',
        description: '在宿命之战中击败暗祭司塞拉斯',
        type: 'kill_enemy',
        targetId: 'silas_boss',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 500,
      coins: 300,
      items: [
        { itemId: 'item_staff_crown', itemName: '法杖碎片·冠', quantity: 1 },
        { itemId: 'item_silas_ring', itemName: '塞拉斯之戒', quantity: 1 },
      ],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 13,
    autoAccept: true,
    canRetry: true,
  },
  {
    id: 'finale_spark_choice',
    title: '星火抉择',
    description: '在生命之树前做出最终选择：封印、救赎、还是毁灭？',
    type: 'main',
    chapter: 5,
    giverNpcId: 'grom',
    trigger: {
      type: 'quest_complete',
      targetId: 'finale_fated_battle',
    },
    prerequisites: ['finale_fated_battle'],
    objectives: [
      {
        id: 'obj_return_to_life_tree',
        description: '回到生命之树前',
        type: 'visit_area',
        targetId: 'life_tree',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
      {
        id: 'obj_make_final_choice',
        description: '做出最终选择',
        type: 'custom',
        targetId: 'final_choice',
        requiredCount: 1,
        currentCount: 0,
        optional: false,
      },
    ],
    reward: {
      exp: 1000,
      coins: 500,
      items: [{ itemId: 'item_spark_trophy', itemName: '星火勋章', quantity: 1 }],
    },
    repeatable: false,
    timeLimit: 0,
    suggestedLevel: 13,
    autoAccept: true,
    canRetry: false,
  },
]

// =============================================
// 触发条件映射
// =============================================

export const FINALE_TRIGGERS = {
  // 小镇地下密室
  'enter_underground_chamber': {
    condition: 'area_enter:underground_chamber',
    action: 'start_dialogue:finale_underground_chamber',
    requires: 'ch3_staff_secret',
  },
  // 腐化巢穴深处
  'enter_corruption_nest_depths': {
    condition: 'area_enter:corruption_nest_depths',
    action: 'start_dialogue:finale_corruption_nest',
    requires: 'finale_staff_fragment_1',
  },
  // 击败腐化守护者
  'defeat_corrupted_guardian': {
    condition: 'battle_won:corrupted_guardian',
    action: 'start_dialogue:finale_after_guardian',
  },
  // 暗影之塔入口
  'enter_shadow_tower': {
    condition: 'area_enter:shadow_tower',
    action: 'start_dialogue:finale_shadow_tower_entrance',
    requires: 'finale_staff_fragment_2',
  },
  // 塔内战斗
  'shadow_tower_combat': {
    condition: 'event:shadow_tower_floor_3',
    action: 'start_dialogue:finale_tower_battle',
  },
  // 宿命之战
  'confront_silas': {
    condition: 'area_enter:shadow_tower_top',
    action: 'start_dialogue:finale_final_battle',
    requires: 'finale_staff_fragment_3',
  },
  // 击败塞拉斯
  'defeat_silas': {
    condition: 'battle_won:silas_boss',
    action: 'start_dialogue:finale_after_silas',
  },
  // 星火抉择
  'stand_before_life_tree': {
    condition: 'interact:life_tree_final',
    action: 'start_dialogue:finale_choice',
    requires: 'finale_fated_battle',
  },
  // 三种结局
  'choose_seal_ending': {
    condition: 'choice:seal',
    action: 'start_dialogue:finale_ending_seal',
  },
  'choose_redemption_ending': {
    condition: 'choice:redemption',
    action: 'start_dialogue:finale_ending_redemption',
  },
  'choose_destruction_ending': {
    condition: 'choice:destruction',
    action: 'start_dialogue:finale_ending_destruction',
  },
  // 尾声
  'finale_complete': {
    condition: 'quest_complete:finale_spark_choice',
    action: 'start_dialogue:finale_epilogue',
  },
} as const

/** 三种结局的元数据 */
export const FINALE_ENDINGS = {
  seal: {
    id: 'ending_seal',
    title: '永恒封印',
    description: '使用法杖加固封印，阿拉密斯永眠，世界恢复和平，但精灵之力逐渐消逝。',
    tone: '平静' as const,
    worldEffect: '封印加固，暗影消退，精灵之力缓慢消散',
    npcReactions: {
      '格罗姆': '释然但悲伤——精灵之力会随时间消散',
      '玛格丽特': '欣慰——小镇终于安宁了',
      '托比亚斯': '将这段冒险写成史诗传唱',
    },
  },
  redemption: {
    id: 'ending_redemption',
    title: '灵魂救赎',
    description: '说服阿拉密斯放下仇恨，他自愿消散。封印不再需要，暗影与精灵和解。',
    tone: '感动' as const,
    worldEffect: '封印消解，阿拉密斯超脱，精灵获得真正自由',
    npcReactions: {
      '格罗姆': '泪流满面——阿拉密斯终于解脱了',
      '玛格丽特': '感动——最温柔的结局',
      '托比亚斯': '将这个故事写成最动人的歌谣',
    },
  },
  destruction: {
    id: 'ending_destruction',
    title: '薪火终结',
    description: '摧毁法杖，一切力量消散。代价沉重——包括格罗姆在内的精灵之力消失。',
    tone: '壮烈' as const,
    worldEffect: '所有超自然力量消亡，世界回归凡人时代',
    npcReactions: {
      '格罗姆': '微笑着消散——这是他愿意接受的代价',
      '玛格丽特': '沉默——为格罗姆默哀',
      '托比亚斯': '用歌声纪念逝去的英雄',
    },
  },
} as const

/** 终章完整数据 */
export const FINALE_DATA = {
  chapter: 5,
  title: '星火重燃',
  summary: '玩家集齐法杖三段碎片，攻入暗影之塔击败塞拉斯，在生命之树前做出最终抉择——封印、救赎、或毁灭。三种结局各有深远影响。',
  dialogues: FINALE_DIALOGUES,
  quests: FINALE_QUESTS,
  triggers: FINALE_TRIGGERS,
  newAreas: ['underground_chamber', 'corruption_nest_depths', 'shadow_tower'],
  newItems: ['item_staff_fragment_1', 'item_staff_fragment_2', 'item_staff_fragment_3', 'item_spark_trophy'],
  newEnemies: ['corrupted_guardian', 'silas_boss', 'shadow_elite'],
  newNPCs: [],
  endings: FINALE_ENDINGS,
  keyReveal: '三段法杖碎片合为一体后，玩家可以选择封印、救赎或毁灭——三种结局',
}
