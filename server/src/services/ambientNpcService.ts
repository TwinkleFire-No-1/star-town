// 星火小镇 — 普通NPC（路人）服务
// 需求：增加更多普通NPC，只会回复固定回答，营造小镇闹哄哄的氛围。
// 设计：
// - 普通NPC不是数据库实体，不接入Agent/LLM链路（低成本、固定台词）
// - id 统一使用 amb_ 前缀，便于前后端识别与短路
// - 每个普通NPC复用已有美术资源（assetId 指向 12 张NPC精灵图之一）
// - 台词库：greetings（靠近打招呼）/ replies（回应玩家消息，关键词匹配）/ bubbles（头顶随机气泡）

export interface AmbientNpcDef {
  id: string
  name: string
  title: string
  /** 所在场景ID：town=城镇；blacksmith/alchemist/tavern/market/residential/elder_hall/forest/mine=对应室内/野外场景（缺省 town） */
  scene?: string
  /** 城镇地图 tile 坐标（30×26，64px/tile）；室内场景为室内地图坐标 */
  x: number
  y: number
  direction: 'up' | 'down' | 'left' | 'right'
  /** 复用哪个美术资源（public/assets/sprites/npc/{assetId}.png）；若指定 colorScheme 则忽略该资源、走程序化生成 */
  assetId: string
  /** 漫游半径（tile） */
  roamRadius: number
  /** 移动速度（tile/秒） */
  speed: number
  /** 打招呼台词 */
  greetings: string[]
  /** 回应玩家消息（关键词匹配） */
  replies: Array<{ keywords: string[]; lines: string[] }>
  /** 默认回应（无关键词命中） */
  defaultReplies: string[]
  /** 头顶随机气泡台词 */
  bubbles: string[]
  /** 行为模式：roam=随机漫游（默认）；river=河边随机跳河；dance=原地跳舞；sing=原地唱歌；sleep=原地睡觉（周期醒来偷拍）；pingpong=原地打乒乓球（对打挥拍） */
  behavior?: 'roam' | 'river' | 'dance' | 'sing' | 'sleep' | 'pingpong'
  /** 结伴跟随目标NPC id（跟随者不自行漫游，始终保持在同伴附近，形影不离） */
  companionId?: string
}

/** 普通NPC前缀（前后端约定） */
export const AMBIENT_NPC_PREFIX = 'amb_'

const village: AmbientNpcDef[] = [
  {
    id: 'amb_villager_01',
    name: '阿福',
    title: '赶集农夫',
    x: 10,
    y: 18,
    direction: 'down',
    assetId: 'afu',
    roamRadius: 3,
    speed: 0.8,
    greetings: [
      '嘿，旅行者！',
      '哦？生面孔啊！',
      '快来看看，今儿个集市热闹得很！',
      '你也是来赶集的？',
    ],
    replies: [
      { keywords: ['你好', '嗨', 'hello', '您好'], lines: ['你好你好！', '幸会幸会！'] },
      { keywords: ['天气', '下雨', '太阳', '热'], lines: ['这天儿可真晒人。', '听说傍晚要下雨，得赶紧收摊。'] },
      { keywords: ['集市', '卖', '价格', '多少钱', '菜'], lines: ['便宜卖啦，三铜板一把！', '这可是今早刚摘的，新鲜！'] },
      { keywords: ['传闻', '听说', '消息', '秘密'], lines: ['嘘——小声点，听说矿洞那边夜里在发光。', '你要打听事，去酒馆问问老板娘。'] },
      { keywords: ['名字', '你是谁', '叫啥'], lines: ['我？我就是个赶集的，不值一提。', '阿福，种了二十年地的阿福。'] },
    ],
    defaultReplies: [
      '哈哈哈，我这儿没什么新鲜事。',
      '你要是想打听事，去酒馆问问老板娘。',
      '别挡着我做生意！',
      '今天的菜可新鲜了，来一把？',
    ],
    bubbles: [
      '新鲜的菜！新鲜的菜！',
      '今儿个可真热闹！',
      '喂，别挡道！',
      '这太阳晒得人发昏……',
      '让让，让让！',
    ],
  },
  {
    id: 'amb_villager_02',
    name: '翠花',
    title: '洗衣妇',
    x: 10,
    y: 17,
    direction: 'left',
    assetId: 'cuihua',
    roamRadius: 2,
    speed: 0.6,
    greetings: [
      '哎哟，吓我一跳！',
      '是生面孔，少见少见。',
      '你打哪儿来呀？',
    ],
    replies: [
      { keywords: ['你好', '嗨', '您好'], lines: ['你好呀，年轻人。'] },
      { keywords: ['井', '水', '衣服'], lines: ['这口井的水可甜了，全城都靠它。'] },
      { keywords: ['传闻', '听说', '消息'], lines: ['听说广场那边天天有人打架，我可不敢去。'] },
      { keywords: ['帮忙', '帮', '求'], lines: ['我一个洗衣妇，能帮上什么忙哟。'] },
    ],
    defaultReplies: [
      '我得赶着把衣服晾完呢。',
      '哎，日子就是这么过的。',
      '你去广场转转吧，那儿热闹。',
    ],
    bubbles: [
      '今天的水可真凉……',
      '这衣裳晾干了没有呀？',
      '啧啧，现在的年轻人。',
      '瞧那冒险者，风尘仆仆的。',
    ],
  },
  {
    id: 'amb_villager_03',
    name: '狗蛋',
    title: '顽皮孩童',
    x: 12,
    y: 12,
    direction: 'right',
    assetId: 'goudan',
    roamRadius: 4,
    speed: 1.4,
    greetings: [
      '哈哈哈！你来追我呀！',
      '大哥哥/大姐姐！你是冒险者吗？',
      '哇！好酷的装备！',
    ],
    replies: [
      { keywords: ['你好', '嗨'], lines: ['嘿嘿，你好呀！', '你是谁呀？来和我玩吧！'] },
      { keywords: ['玩', '游戏', '捉迷藏'], lines: ['好呀好呀！我藏起来你来找！', '你抓不到我的，我可快了！'] },
      { keywords: ['传闻', '听说', '怪'], lines: ['我听二丫说森林里有怪兽！可大啦！'] },
      { keywords: ['回家', '娘', '作业'], lines: ['唔……我、我一会儿就回去！真的！'] },
    ],
    defaultReplies: [
      '我才不信你呢！',
      '我要去广场找小伙伴们玩！',
      '嘿嘿，你追不上我！',
    ],
    bubbles: [
      '哈哈哈！',
      '看我飞毛腿！',
      '来玩捉迷藏呀！',
      '爸爸说不能乱跑……那我跑啦！',
    ],
  },
  {
    id: 'amb_villager_04',
    name: '大牛',
    title: '搬运工',
    x: 21,
    y: 15,
    direction: 'down',
    assetId: 'aniu',
    roamRadius: 2,
    speed: 0.7,
    greetings: [
      '让让！让让！别挡道！',
      '呼——这一趟可够沉的。',
      '你挡着我路了，伙计。',
    ],
    replies: [
      { keywords: ['你好', '嗨'], lines: ['嗯，你好。', '忙呢，长话短说。'] },
      { keywords: ['搬', '帮', '重'], lines: ['这活儿可不好干，腰都快断了。'] },
      { keywords: ['传闻', '听说'], lines: ['听说码头那边又到了一批好货。'] },
      { keywords: ['休息', '累', '歇'], lines: ['等这趟送完，我也得去酒馆坐坐。'] },
    ],
    defaultReplies: [
      '我这正忙着呢，回头聊。',
      '诶，别添乱！',
      '呼——',
    ],
    bubbles: [
      '让让！让让！',
      '嘿咻嘿咻……',
      '这趟送完就收工！',
      '今天的活儿真多。',
    ],
  },
  {
    id: 'amb_villager_05',
    name: '桂花',
    title: '卖菜婆',
    x: 6,
    y: 21,
    direction: 'right',
    assetId: 'guihua',
    roamRadius: 2,
    speed: 0.5,
    greetings: [
      '来来来！看看我的菜！',
      '新鲜的白菜萝卜，物美价廉！',
      '大妹子/小伙子，来一把菜？',
    ],
    replies: [
      { keywords: ['菜', '买', '多少钱', '价格'], lines: ['白菜两铜板一把，萝卜一铜板！', '诚心要？给你便宜一个铜板！'] },
      { keywords: ['你好', '嗨'], lines: ['哎，你好你好，买菜吗？'] },
      { keywords: ['传闻', '听说', '消息'], lines: ['我听说呀，铁匠铺那老头藏了好东西。'] },
      { keywords: ['便宜', '还价'], lines: ['哎哟，这已经是最低价啦！', '你多买几把，我就送你根葱！'] },
    ],
    defaultReplies: [
      '买菜吗？买菜吗？',
      '不买也别挡着我吆喝呀。',
      '今天菜价可公道了！',
    ],
    bubbles: [
      '新鲜的白菜萝卜！',
      '走过路过别错过！',
      '便宜卖啦！',
      '这菜可是今早现摘的！',
    ],
  },
  {
    id: 'amb_villager_06',
    name: '二丫',
    title: '面包学徒',
    x: 18,
    y: 23,
    direction: 'up',
    assetId: 'erya',
    roamRadius: 2,
    speed: 0.9,
    greetings: [
      '嘘——我在偷看烤炉呢！',
      '你闻到香味了吗？刚出炉的面包！',
      '你好呀，要尝尝我烤的饼干吗？',
    ],
    replies: [
      { keywords: ['面包', '饼干', '烤', '吃'], lines: ['刚出炉的小圆面包，还烫手呢！', '我的饼干可是全镇第一！'] },
      { keywords: ['你好', '嗨'], lines: ['你好呀！我叫二丫。'] },
      { keywords: ['传闻', '听说'], lines: ['我听说酒馆今晚有吟游诗人来唱歌！'] },
      { keywords: ['帮忙', '帮'], lines: ['你想学烤面包吗？我教你呀！'] },
    ],
    defaultReplies: [
      '唔……我得去翻面了！',
      '待会儿见，我要去送面包了！',
      '甜甜的，要不要？',
    ],
    bubbles: [
      '好香呀！',
      '出炉啦出炉啦！',
      '师傅说要专心……但是好想玩。',
      '今天烤了十二炉！',
    ],
  },
  {
    id: 'amb_villager_07',
    name: '石头',
    title: '木匠',
    x: 7,
    y: 9,
    direction: 'left',
    assetId: 'shitou',
    roamRadius: 2,
    speed: 0.6,
    greetings: [
      '哟，来活儿了？',
      '小心木屑，迷了眼。',
      '找我有事？',
    ],
    replies: [
      { keywords: ['木头', '家具', '做', '桌子'], lines: ['手头的活排到下个月啦，你要是等得起。'] },
      { keywords: ['你好', '嗨'], lines: ['你好，找我有事？'] },
      { keywords: ['传闻', '听说'], lines: ['听说铁匠铺那老家伙又打坏了一把锤子。'] },
      { keywords: ['工具', '斧头'], lines: ['我用的家伙什可都是自己打的。'] },
    ],
    defaultReplies: [
      '我得赶工，回头再说。',
      '这门板上的榫卯，可是我的绝活。',
      '工钱先谈好，别到时候赖账。',
    ],
    bubbles: [
      '叮叮当当……',
      '这块木料纹路真好看。',
      '谁家的门坏了？',
      '量好尺寸才好下料。',
    ],
  },
  {
    id: 'amb_villager_08',
    name: '胖婶',
    title: '茶馆主妇',
    x: 28,
    y: 21,
    direction: 'left',
    assetId: 'pangshen',
    roamRadius: 2,
    speed: 0.5,
    greetings: [
      '进来喝口茶？歇歇脚！',
      '哎哟，累了吧，来碗大碗茶！',
      '今天的茶是茉莉花茶，香得很！',
    ],
    replies: [
      { keywords: ['茶', '喝', '休息'], lines: ['一碗茉莉花茶，两个铜板，坐！', '这茶可是我自己晒的花。'] },
      { keywords: ['你好', '嗨'], lines: ['你好呀，快坐！'] },
      { keywords: ['传闻', '听说', '八卦'], lines: ['你要听八卦？我这儿的茶客可会讲故事了。', '听酒馆老板娘说，最近镇上要来大人物。'] },
      { keywords: ['钱', '贵'], lines: ['两铜板一碗，童叟无欺！'] },
    ],
    defaultReplies: [
      '茶要趁热喝。',
      '哎，坐会儿再走嘛。',
      '我这儿的茶，喝完精神一整天！',
    ],
    bubbles: [
      '大碗茶！大碗茶！',
      '刚泡好的，热乎！',
      '今天的花茶真香。',
      '客官，坐这儿！',
    ],
  },
  {
    id: 'amb_villager_09',
    name: '老杨',
    title: '鱼贩',
    x: 4,
    y: 22,
    direction: 'right',
    assetId: 'laoyang',
    roamRadius: 2,
    speed: 0.5,
    greetings: [
      '今早的鱼，活蹦乱跳！',
      '来条鱼？刚从河里捞的！',
      '嘿，冒险者，要不要来条大鱼补补身子？',
    ],
    replies: [
      { keywords: ['鱼', '买', '多少'], lines: ['银鱼三铜板一条，鲤鱼五铜板！', '这鱼可新鲜了，你看这鳞片！'] },
      { keywords: ['你好', '嗨'], lines: ['你好，要买鱼吗？'] },
      { keywords: ['传闻', '听说'], lines: ['听说河上游的鱼越来越少了，哎。'] },
      { keywords: ['钓', '河'], lines: ['清晨的河雾最浓，鱼也最肥。'] },
    ],
    defaultReplies: [
      '不买也来看看嘛！',
      '今天渔获不错！',
      '鱼可养精神了！',
    ],
    bubbles: [
      '活鱼！活鱼！',
      '今早刚捞的！',
      '这河鱼可肥了！',
      '收摊前便宜卖了！',
    ],
  },
  {
    id: 'amb_villager_10',
    name: '铁牛',
    title: '猎户',
    x: 10,
    y: 4,
    direction: 'right',
    assetId: 'tieniu',
    roamRadius: 3,
    speed: 0.9,
    greetings: [
      '你要进森林？小心点。',
      '今天林子里风大，猎物都躲起来了。',
      '我这弓，可是祖传的。',
    ],
    replies: [
      { keywords: ['森林', '猎物', '野兽'], lines: ['清晨的森林最危险，傍晚也一样，别贪。'] },
      { keywords: ['你好', '嗨'], lines: ['嗯，你好，猎户铁牛。'] },
      { keywords: ['传闻', '听说', '怪'], lines: ['我这两天在林子里见到奇怪的脚印……不像狼。'] },
      { keywords: ['弓', '箭', '武器'], lines: ['好弓要慢慢养，像养孩子一样。'] },
    ],
    defaultReplies: [
      '我得去巡林子了。',
      '这风里有股不对劲的味道。',
      '小心为上。',
    ],
    bubbles: [
      '林子里有动静……',
      '今天的风向不好。',
      '这脚印不像野兽的。',
      '收工，回家喝碗热汤。',
    ],
  },
  // ========== 特色氛围NPC（不参与主线剧情，不加模型）==========
  // 李鹭：河边怪人，随机跳进河里（又游上来），主打一个凉快
  {
    id: 'amb_river_li',
    name: '李鹭',
    title: '河边的怪人',
    x: 6,
    y: 12,
    direction: 'down',
    assetId: 'lilu',
    behavior: 'river',
    roamRadius: 0,
    speed: 0,
    greetings: [
      '嘘——别出声，河在听。',
      '想不想看我跳下去？',
      '水底下可凉快了。',
      '又来一条河，我就跳！',
    ],
    replies: [
      { keywords: ['跳', '河', '水', '游泳'], lines: ['你看好了，我这就跳给你看！', '放心，这条河我闭着眼都能游上来。'] },
      { keywords: ['你好', '嗨'], lines: ['你好呀，要不要一起凉快凉快？'] },
      { keywords: ['为什么', '为啥', '想不开'], lines: ['为什么？哪有那么多为什么，凉快就是道理！'] },
      { keywords: ['危险', '小心', '别'], lines: ['别担心，我打小就在河边长大。'] },
    ],
    defaultReplies: [
      '噗通——（水花四溅）',
      '凉快！真凉快！',
      '你也想试试？水可温柔了。',
      '这条河认得我。',
    ],
    bubbles: [
      '噗通！',
      '这水可真凉……',
      '呼——舒服！',
      '下一条河，再见！',
    ],
  },
  // 包鹏宇 & 谭成：最好的朋友，形影不离（谭成跟随包鹏宇）
  {
    id: 'amb_friend_bao',
    name: '包鹏宇',
    title: '谭成的好朋友',
    x: 16,
    y: 11,
    direction: 'right',
    assetId: 'baopengyu',
    roamRadius: 3,
    speed: 0.9,
    greetings: [
      '嘿，我是包鹏宇！',
      '看见那边那位了吗？那是我兄弟谭成！',
      '我们俩打小一起长大，形影不离！',
    ],
    replies: [
      { keywords: ['谭成', '朋友', '兄弟'], lines: ['谭成？我最好的朋友，没有之一！', '他走哪儿我就在哪儿，我俩是铁打的交情！'] },
      { keywords: ['你好', '嗨'], lines: ['你好你好！包鹏宇，谭成的兄弟！'] },
      { keywords: ['传闻', '听说'], lines: ['听说河那边来了个怪人天天跳水，改天拉谭成去看看！'] },
      { keywords: ['广场', '跳舞'], lines: ['广场上那个跳舞的可真带劲，可惜我不擅长。'] },
    ],
    defaultReplies: [
      '谭成，走啦！',
      '嘿，要不要认识认识谭成？',
      '我们哥俩去哪都一起。',
    ],
    bubbles: [
      '谭成，你看那个！',
      '兄弟，等等我！',
      '有谭成在，这镇子就有意思。',
      '嘿，咱俩打赌谁先到桥头！',
    ],
  },
  {
    id: 'amb_friend_tan',
    name: '谭成',
    title: '包鹏宇的好朋友',
    x: 17,
    y: 11,
    direction: 'left',
    assetId: 'tancheng',
    companionId: 'amb_friend_bao',
    roamRadius: 0,
    speed: 0.9,
    greetings: [
      '我是谭成，包鹏宇是我最好的朋友。',
      '他走哪儿，我跟哪儿。',
      '你要是欺负包鹏宇，我可不让！',
    ],
    replies: [
      { keywords: ['包鹏宇', '朋友', '兄弟'], lines: ['包鹏宇？我们从小一起长大，比亲兄弟还亲。', '他说往东，我绝不往西，就这么简单。'] },
      { keywords: ['你好', '嗨'], lines: ['你好，我是谭成。'] },
      { keywords: ['传闻', '听说'], lines: ['包鹏宇说河那边有人天天跳水，走，咱们也去看看热闹。'] },
      { keywords: ['为什么', '跟着'], lines: ['为什么跟着他？因为他是我最好的朋友啊！'] },
    ],
    defaultReplies: [
      '包鹏宇去哪儿了？哦，在那。',
      '我走哪儿都跟包鹏宇一起。',
      '嗯，他说的都对。',
    ],
    bubbles: [
      '包鹏宇，等等我！',
      '嘿嘿，还是咱俩一起最踏实。',
      '你在哪，我就在哪。',
      '兄弟，桥头见！',
    ],
  },
  // 鲁晓：广场舞者，原地跳舞
  {
    id: 'amb_dancer_lu',
    name: '鲁晓',
    title: '广场舞者',
    x: 13,
    y: 12,
    direction: 'down',
    assetId: 'luxiao',
    behavior: 'dance',
    roamRadius: 0,
    speed: 0,
    greetings: [
      '跟着我一起跳！',
      '一二三，转圈！',
      '广场就是我的舞台！',
      '音乐响起来，快乐跳起来！',
    ],
    replies: [
      { keywords: ['跳舞', '舞', '广场'], lines: ['跳舞？那是我的命！来，我教你两步。', '别害羞，跟着节拍扭起来！'] },
      { keywords: ['你好', '嗨'], lines: ['你好呀！要不要一起跳一支？'] },
      { keywords: ['累', '休息'], lines: ['累了？跳舞就是我的休息！'] },
      { keywords: ['传闻', '听说'], lines: ['听说河边的李鹭天天跳水，那动作，跟我跳舞有一拼！'] },
    ],
    defaultReplies: [
      '一二三四，二二三四……',
      '节奏感！节奏感！',
      '快乐就是舞起来！',
      '来，跟我转个圈！',
    ],
    bubbles: [
      '♪ ♪ ♪',
      '一二三，转！',
      '广场舞动起来！',
      '跳起来，什么烦恼都忘掉！',
    ],
  },
  // 杨炎峰：星火汪苏泷，原地唱歌（小情歌/告白曲）
  {
    id: 'amb_singer_yang',
    name: '杨炎峰',
    title: '星火汪苏泷',
    x: 20,
    y: 10,
    direction: 'down',
    assetId: 'yangyanfeng',
    behavior: 'sing',
    roamRadius: 0,
    speed: 0,
    greetings: [
      '要不要听我唱一首小情歌？',
      '嘿，我是杨炎峰，小镇的汪苏泷！',
      '我的歌，唱给懂的人听。',
      '想点歌吗？告白、思念、追梦，我都会！',
    ],
    replies: [
      { keywords: ['唱', '歌', '听', '音乐'], lines: ['那我就来一首《告白》——♪ 你是我青春里的小确幸 ♪', '想听哪首？《有点甜》《万有引力》都行！'] },
      { keywords: ['汪苏泷', '泷'], lines: ['汪苏泷？那可是一位大神，我向你看齐！', '星火汪苏泷，说的就是我！'] },
      { keywords: ['你好', '嗨'], lines: ['你好呀，要不要点首歌？'] },
      { keywords: ['传闻', '听说'], lines: ['听说广场上跳舞的那位，配我的歌绝了！'] },
      { keywords: ['情歌', '喜欢', '告白'], lines: ['情歌嘛，唱的就是心里那点小九九。', '要不要来一首告白专用的？包教包会！'] },
    ],
    defaultReplies: [
      '♪ 小星星，亮晶晶……',
      '唱到哪了？哦，副歌。',
      '我这歌声，能治愈一切烦恼。',
      '来，跟我一起哼！',
    ],
    bubbles: [
      '♪ 你是我心内的一首歌 ♪',
      '♪ ♪ ♪',
      '唱给小镇听～',
      '要不要点首歌？',
    ],
  },
  // 田琳：大姐姐，08年参加高考，爱回忆往昔
  {
    id: 'amb_big_sister_tian',
    name: '田琳',
    title: '爱回忆的大姐姐',
    x: 8,
    y: 21,
    direction: 'right',
    assetId: 'tianlin',
    roamRadius: 2,
    speed: 0.5,
    greetings: [
      '哟，又见面了！',
      '现在的年轻人啊……姐当年也这么拼。',
      '要不要听姐讲讲08年高考的事？',
      '今天这天气，让我想起那年夏天。',
    ],
    replies: [
      { keywords: ['高考', '考试', '大学', '学习'], lines: ['08年那场高考，我记得可清楚了，语文作文我写得手都酸了。', '那时候为了高考，我一年没看电视，值！'] },
      { keywords: ['你好', '嗨'], lines: ['你好呀，要加油哦！'] },
      { keywords: ['传闻', '听说'], lines: ['听说镇上新来了个唱歌的小伙子，叫杨炎峰，歌喉不错。'] },
      { keywords: ['回忆', '以前', '当年'], lines: ['现在想起来，当年那些事啊，都是好日子。'] },
      { keywords: ['累', '辛苦', '加油'], lines: ['累了就歇会儿，当年姐高考前也天天给自己打气。'] },
    ],
    defaultReplies: [
      '姐当年也是这么过来的。',
      '要相信，努力会有回报的。',
      '那时候的日子，真让人怀念。',
      '好好干，姐看好你！',
    ],
    bubbles: [
      '想当年我高考那会儿……',
      '年轻人，加油呀！',
      '岁月不饶人啊。',
      '08年那个夏天，可难忘咯。',
    ],
  },
  // 党斯琦：东北人，时刻提醒大家别踩井盖
  {
    id: 'amb_northeast_dang',
    name: '党斯琦',
    title: '东北热心肠',
    x: 10,
    y: 9,
    direction: 'down',
    assetId: 'dangsiqi',
    roamRadius: 2,
    speed: 0.6,
    greetings: [
      '诶呀，可算见着个人！',
      '注意脚下啊，别踩井盖！',
      '俺跟你说，井盖那玩意儿可不能踩！',
      '咋地，没见过东北人？',
    ],
    replies: [
      { keywords: ['井盖', '井', '踩'], lines: ['踩井盖？那可不行！俺们那嘎达从小就念叨，井盖不能踩！', '你瞅啥？瞅井盖也不行，绕道走！'] },
      { keywords: ['东北', '哈尔滨', '辽宁'], lines: ['俺是东北那旮旯的，豪爽！', '东北人，热心肠，就是嗓门大了点。'] },
      { keywords: ['你好', '嗨'], lines: ['你好你好！注意脚下！'] },
      { keywords: ['传闻', '听说'], lines: ['听说河边有个天天跳水的？俺们那都叫冬泳！'] },
      { keywords: ['帮忙', '帮'], lines: ['有啥事尽管说，俺东北人最讲义气！'] },
    ],
    defaultReplies: [
      '小心脚下，别踩井盖！',
      '俺说话直，你别介意。',
      '这嘎达，人怪好的。',
      '俺就是热心，没办法。',
    ],
    bubbles: [
      '别踩井盖！',
      '注意脚下！',
      '俺跟你说啊……',
      '热心肠，没毛病！',
    ],
  },
  // 陈烨：大姐姐，总关心大家吃没吃饱
  {
    id: 'amb_big_sister_chen',
    name: '陈烨',
    title: '关心大家的大姐姐',
    x: 21,
    y: 21,
    direction: 'left',
    assetId: 'chenye',
    roamRadius: 2,
    speed: 0.5,
    greetings: [
      '诶，吃饱了吗？',
      '饿不饿？姐这儿有干粮！',
      '最近胃口怎么样？',
      '多吃点，吃饱了才有力气！',
    ],
    replies: [
      { keywords: ['吃', '饿', '饭', '饱'], lines: ['没吃饱可不行，姐这儿有干粮，拿着！', '吃饱喝足，干啥都有劲！'] },
      { keywords: ['你好', '嗨'], lines: ['你好呀，吃过饭了吗？'] },
      { keywords: ['传闻', '听说'], lines: ['听说酒馆新来了个厨子，做的菜特别香。'] },
      { keywords: ['谢谢', '感谢'], lines: ['客气啥，姐就爱看大家吃得饱饱的。'] },
      { keywords: ['累', '辛苦'], lines: ['累了就歇会儿，别饿着肚子干活。'] },
    ],
    defaultReplies: [
      '吃了吗？没吃姐给你拿。',
      '看你瘦的，得多吃点。',
      '吃饱了才不想家。',
      '来，再吃点！',
    ],
    bubbles: [
      '都吃饱了吗？',
      '这干粮可香了！',
      '多吃点！',
      '别饿着肚子。',
    ],
  },
  // 高爽：绿色泡面卷发的小女孩（类似一拳超人龙卷），爱睡觉，爱偷拍包鹏宇（酒馆角落常客，睡醒就咔嚓）
  {
    id: 'amb_ta_gaoshuang',
    name: '高爽',
    title: '爱睡觉的偷拍客',
    scene: 'tavern',
    x: 9,
    y: 12,
    direction: 'down',
    // 专属AI生成精灵表（绿色卷发小女孩，public/assets/sprites/npc/gaoshuang.png）
    assetId: 'gaoshuang',
    behavior: 'sleep',
    roamRadius: 0,
    speed: 0,
    greetings: [
      '哈——欠！谁……谁叫我？',
      '别吵，我正梦到包鹏宇掉进河里呢。',
      '嘘……小声点，我眯一会儿。',
      '绿头发怎么了？睡饱觉就是这么精神！',
    ],
    replies: [
      { keywords: ['你好', '嗨', '您好'], lines: ['啊……你好……（哈欠）', '幸会幸会……等我睡醒再聊。'] },
      { keywords: ['睡', '觉', '困', '累', '困了'], lines: ['睡觉？那可是我的主业！', '一天睡十二个小时，剩下时间偷拍！', '站着都能睡着，你信不信？'] },
      { keywords: ['包鹏宇', '偷拍', '拍', '相机'], lines: ['嘘——你看那边，包鹏宇走过来了！咔嚓！', '我相机里全是包鹏宇的黑历史，可值钱了！', '别告诉他，就说我在睡觉。'] },
      { keywords: ['谭成', '朋友'], lines: ['包鹏宇和谭成？那可太有拍头了，俩人的素材我存了一整本！'] },
      { keywords: ['绿', '头发'], lines: ['这绿头发，天生的，睡出来的！', '绿色显眼，偷拍的时候不容易被发现。'] },
      { keywords: ['传闻', '听说', '消息'], lines: ['我听说包鹏宇一会儿要去广场，我得去蹲个点。'] },
    ],
    defaultReplies: [
      '哈——欠……',
      '呼……呼……（睡着了）',
      '等我睡醒再说。',
      '你吵到我做梦了……',
    ],
    bubbles: [
      'Zzz……',
      '咔嚓！',
      '嘘——包鹏宇来了！',
      '哈——欠……',
      '这素材太顶了！',
    ],
  },
  // ========== 郭彬 & 祝轲轲：乒乓球搭档，在镇子南边空地打乒乓球（AI专属形象，原地对打挥拍）==========
  {
    id: 'amb_pingpong_guobin',
    name: '郭彬',
    title: '乒乓球搭档',
    x: 15,
    y: 23,
    direction: 'right',
    // 专属AI生成精灵表（红衣挥拍少年，public/assets/sprites/npc/guobin.png）
    assetId: 'guobin',
    behavior: 'pingpong',
    roamRadius: 0,
    speed: 0,
    greetings: [
      '嘿，要不要来打两局？',
      '乒乓球，我的主场！',
      '跟轲轲打球，我从来不让着她！',
      '看我这记扣杀！',
    ],
    replies: [
      { keywords: ['乒乓球', '打球', '球', '比赛'], lines: ['来来来，先热身两局！', '我正跟轲轲练反手，你要不要下场试试？', '三局两胜，输了请喝水！'] },
      { keywords: ['祝轲轲', '轲轲', '搭档', '队友'], lines: ['轲轲？我最好的球友，配合默契！', '她反手可厉害了，我正手也不差！'] },
      { keywords: ['你好', '嗨'], lines: ['你好你好！看球！'] },
      { keywords: ['谁赢', '比分', '几比几'], lines: ['我俩五五开，谁也压不住谁！', '刚打完一局，我险胜！'] },
      { keywords: ['传闻', '听说'], lines: ['听说河边有人天天跳水，他要是来打球，估计接不住我的发球！'] },
    ],
    defaultReplies: [
      '接球！',
      '这球漂亮吧？',
      '再来一局！',
      '看好了，这是旋球！',
    ],
    bubbles: [
      '接球！',
      '好球！',
      '看我的扣杀！',
      '轲轲，接稳了！',
      '再来！',
    ],
  },
  {
    id: 'amb_pingpong_zhukeke',
    name: '祝轲轲',
    title: '乒乓球搭档',
    x: 17,
    y: 23,
    direction: 'left',
    // 专属AI生成精灵表（蓝衣挥拍少女，public/assets/sprites/npc/zhukeke.png）
    assetId: 'zhukeke',
    behavior: 'pingpong',
    roamRadius: 0,
    speed: 0,
    greetings: [
      '要来打一局吗？',
      '我反手可不会让你！',
      '跟郭彬打球，每天都有新花样。',
      '喂，球来了，小心点！',
    ],
    replies: [
      { keywords: ['乒乓球', '打球', '球', '比赛'], lines: ['好呀，三局两胜！', '我正跟郭彬练正手呢，你也来？', '输了可不许赖账！'] },
      { keywords: ['郭彬', '搭档', '队友'], lines: ['郭彬？他正手有劲儿，我反手稳！', '我俩从早打到晚都不腻！'] },
      { keywords: ['你好', '嗨'], lines: ['你好呀，看球！'] },
      { keywords: ['谁赢', '比分', '几比几'], lines: ['我们五五开，全凭当天手感！', '上一局是我赢的，嘘——别告诉他。'] },
      { keywords: ['传闻', '听说'], lines: ['听说广场上有跳舞的，还有唱情歌的，咱这儿就专心打球！'] },
    ],
    defaultReplies: [
      '接球！',
      '漂亮！',
      '再来！',
      '这板接得妙！',
    ],
    bubbles: [
      '接球！',
      '漂亮！',
      '看我的反手！',
      '郭彬，这球可不好接！',
      '再来一板！',
    ],
  },
]

/**
 * 室内/野外氛围 NPC（T6.11.4）
 * 进入建筑（除去反派相关建筑）后也有不接大模型的普通NPC，营造热闹的氛围。
 * - 每个室内场景 2-3 个，站位避开家具布局
 * - 不接 Agent/LLM：与城镇路人一样走 amb_ 固定台词短路
 * - 长老大厅（elder_hall）为反派势力活动场所，不放氛围NPC
 */
const indoorNpcs: AmbientNpcDef[] = [
  // ========== 铁砧工坊 ==========
  {
    id: 'amb_bs_apprentice',
    name: '小锤',
    title: '铁匠学徒',
    scene: 'blacksmith',
    x: 22,
    y: 5,
    direction: 'up',
    assetId: 'xiaochui',
    roamRadius: 1,
    speed: 0.5,
    greetings: [
      '师傅在忙呢，你有事跟我说！',
      '嘿，来定做家伙什吗？',
      '别碰那炉子，烫手！',
    ],
    replies: [
      { keywords: ['你好', '嗨', '您好'], lines: ['你好你好！我是小锤。', '师傅的学徒，什么事？'] },
      { keywords: ['铁', '剑', '武器', '锤', '修'], lines: ['师傅打的剑可快了！', '修个锄头？排队到后天了。'] },
      { keywords: ['传闻', '听说', '消息'], lines: ['听说镇上来了个厉害的冒险者，是你吗？'] },
      { keywords: ['炉', '火', '热'], lines: ['这炉子一天到晚不熄火，我胳膊都练粗了。'] },
    ],
    defaultReplies: [
      '我得去拉风箱了。',
      '师傅说打铁要静心。',
      '敲敲打打，一天就过去了。',
    ],
    bubbles: [
      '叮叮当当……',
      '风箱拉起来！',
      '这锤子真沉。',
      '师傅，炉火旺着呢！',
    ],
  },
  {
    id: 'amb_bs_mercenary',
    name: '疤脸',
    title: '佣兵',
    scene: 'blacksmith',
    x: 5,
    y: 4,
    direction: 'left',
    assetId: 'balian',
    roamRadius: 1,
    speed: 0.4,
    greetings: [
      '我的剑在你这儿磨好了没有？',
      '赶时间，快点。',
      '哼，还算识货。',
    ],
    replies: [
      { keywords: ['剑', '武器', '磨', '修'], lines: ['这把剑跟了我十二年，比老婆还亲。', '剑刃得薄，砍人不能拖泥带水。'] },
      { keywords: ['你好', '嗨'], lines: ['嗯。'] },
      { keywords: ['传闻', '听说', '怪'], lines: ['城外的野狼越来越多了，得有人去收拾。'] },
      { keywords: ['佣兵', '战斗', '冒险'], lines: ['刀口舔血的活儿，你最好想清楚。'] },
    ],
    defaultReplies: [
      '我没工夫闲聊。',
      '剑好了叫我。',
      '哼。',
    ],
    bubbles: [
      '剑修好了没？',
      '这把剑可是好钢。',
      '风里带着血腥味。',
    ],
  },
  // ========== 魔法药剂店 ==========
  {
    id: 'amb_al_customer',
    name: '阿栗',
    title: '药剂顾客',
    scene: 'alchemist',
    x: 13,
    y: 8,
    direction: 'up',
    assetId: 'ali',
    roamRadius: 1,
    speed: 0.4,
    greetings: [
      '艾拉呢？我上回订的安神药好了没？',
      '这店里的味道，闻着就踏实。',
      '你也来买药？',
    ],
    replies: [
      { keywords: ['药', '治', '病', '喝'], lines: ['艾拉的药比镇口郎中的灵多了。', '那瓶止咳的，苦得我三天吃不下饭，但管用！'] },
      { keywords: ['你好', '嗨'], lines: ['你好呀，来买药吗？'] },
      { keywords: ['传闻', '听说'], lines: ['听说矿洞里有怪声，矿工们都不敢下井了。'] },
      { keywords: ['贵', '钱'], lines: ['药是好药，就是价钱……唉。'] },
    ],
    defaultReplies: [
      '艾拉配药去了，得等会儿。',
      '这儿的药香，闻着病就好了一半。',
      '我回去还得熬药呢。',
    ],
    bubbles: [
      '安神药可得抓紧了。',
      '这药味儿真冲。',
      '艾拉人好，药也实在。',
    ],
  },
  {
    id: 'amb_al_herbalist',
    name: '小药',
    title: '采药师',
    scene: 'alchemist',
    x: 26,
    y: 7,
    direction: 'down',
    assetId: 'xiaoyao',
    roamRadius: 1,
    speed: 0.5,
    greetings: [
      '刚采的月光草，新鲜着呢！',
      '艾拉姐，草药送到啦！',
      '嘘，这株草可不能见光。',
    ],
    replies: [
      { keywords: ['草药', '采', '植物', '药'], lines: ['月光草要月圆夜采才有效，懂吧？', '这篮子蘑菇可别乱碰，有毒的。'] },
      { keywords: ['你好', '嗨'], lines: ['你好呀，我是给艾拉姐送草药的。'] },
      { keywords: ['森林', '危险', '怪'], lines: ['森林深处雾特别浓，我都不敢走太深。'] },
      { keywords: ['钱', '卖'], lines: ['这一篮月光草能换一袋星币呢！'] },
    ],
    defaultReplies: [
      '我得赶紧把草送过去。',
      '新鲜的草药，趁早入药最好。',
      '药园子比外头安全多了。',
    ],
    bubbles: [
      '月光草，新采的！',
      '这株根须完整，值钱！',
      '艾拉姐，我放柜台上了！',
    ],
  },
  // ========== 星光酒馆 ==========
  {
    id: 'amb_ta_drunkard',
    name: '醉猫',
    title: '酒客',
    scene: 'tavern',
    x: 12,
    y: 9,
    direction: 'down',
    assetId: 'zuimao',
    roamRadius: 1,
    speed: 0.3,
    greetings: [
      '嗝——再来一……一杯！',
      '兄弟，坐，坐！陪我喝一杯！',
      '今天的麦酒真带劲！',
    ],
    replies: [
      { keywords: ['你好', '嗨'], lines: ['嗝，好，好……你好！'] },
      { keywords: ['酒', '喝', '醉'], lines: ['玛格丽特的麦酒，全镇第一！', '喝！人生得意须尽欢！'] },
      { keywords: ['传闻', '听说', '八卦'], lines: ['我告诉你……嗝，听说长老大人最近脸色不好。', '镇上要有大事咯，我鼻子灵着呢。'] },
      { keywords: ['回家', '醒'], lines: ['回家？回什么家！再来一杯！'] },
    ],
    defaultReplies: [
      '嗝——好酒，好酒。',
      '服务员！再满上！',
      '我、我没醉！',
    ],
    bubbles: [
      '好酒！',
      '再来一杯！',
      '嗝——',
      '今朝有酒今朝醉！',
    ],
  },
  {
    id: 'amb_ta_bard',
    name: '琴歌',
    title: '吟游诗人',
    scene: 'tavern',
    x: 17,
    y: 6,
    direction: 'down',
    assetId: 'qinge',
    roamRadius: 1,
    speed: 0.4,
    greetings: [
      '想听一段英雄史诗吗？',
      '我的琴声，能让石头流泪。',
      '远方的旅人，愿为你献上一曲。',
    ],
    replies: [
      { keywords: ['唱', '歌', '曲', '琴'], lines: ['那便为你唱一段《屠龙者之歌》！', '这曲子讲的是三百年前的星火小镇。'] },
      { keywords: ['你好', '嗨'], lines: ['愿音符与你同在，朋友。'] },
      { keywords: ['传闻', '听说', '消息'], lines: ['吟游诗人走四方，消息自然灵通——北边森林闹鬼了。'] },
      { keywords: ['钱', '赏'], lines: ['一枚铜板，一曲好歌，童叟无欺。'] },
    ],
    defaultReplies: [
      '琴弦上自有万千故事。',
      '我这曲子弹到哪儿，哪儿就有故事。',
      '酒馆的夜晚，正适合一首老歌。',
    ],
    bubbles: [
      '叮叮咚咚……',
      '想听故事吗？',
      '这旋律献给远方的旅人。',
      '镇子虽小，故事不少。',
    ],
  },
  {
    id: 'amb_ta_chatterbox',
    name: '话匣子',
    title: '酒客',
    scene: 'tavern',
    x: 20,
    y: 8,
    direction: 'down',
    assetId: 'huaxiazi',
    roamRadius: 1,
    speed: 0.4,
    greetings: [
      '哎哟，新面孔！来来来，跟你说说镇上新鲜事！',
      '你可算来对地方了，这儿的消息最灵！',
      '坐这儿坐这儿，我正缺个聊天的！',
    ],
    replies: [
      { keywords: ['传闻', '听说', '八卦', '消息'], lines: ['我跟你说，集市罗西家的猫又丢啦！', '听说铁匠老巴克年轻时候是个大英雄！'] },
      { keywords: ['你好', '嗨'], lines: ['好好好，坐下聊！'] },
      { keywords: ['酒', '喝'], lines: ['酒要慢喝，话要快说！'] },
      { keywords: ['走了', '再见'], lines: ['哎别走啊，我还没说到重点呢！'] },
    ],
    defaultReplies: [
      '你听我说完嘛！',
      '那都是老黄历了……',
      '还有件新鲜事你肯定不知道！',
    ],
    bubbles: [
      '你听我说……',
      '今天可热闹了！',
      '嘘，我知道一个小道消息。',
      '说到哪儿了？对，那猫……',
    ],
  },
  // ========== 集市 ==========
  {
    id: 'amb_ma_fabric',
    name: '彩云',
    title: '卖布商',
    scene: 'market',
    x: 11,
    y: 5,
    direction: 'down',
    assetId: 'caiyun',
    roamRadius: 1,
    speed: 0.4,
    greetings: [
      '上好的棉布麻布，摸一摸！',
      '客官，来匹布？新到的颜色！',
      '这料子冬天做棉袄最合适！',
    ],
    replies: [
      { keywords: ['布', '料子', '卖', '多少钱'], lines: ['棉布三铜板一尺，麻布便宜些！', '这匹蓝靛布，染了三遍，不掉色！'] },
      { keywords: ['你好', '嗨'], lines: ['你好呀，看看布吗？'] },
      { keywords: ['传闻', '听说'], lines: ['听说北边的商队被狼群截了，布料都涨价了。'] },
      { keywords: ['贵', '便宜'], lines: ['已经是最实诚的价啦，你摸着料子说话！'] },
    ],
    defaultReplies: [
      '货真价实，童叟无欺。',
      '挑一匹喜欢的？',
      '这花色镇上独一份。',
    ],
    bubbles: [
      '新到的布匹！',
      '摸摸这料子！',
      '这颜色多正！',
    ],
  },
  {
    id: 'amb_ma_bargainer',
    name: '挑拣客',
    title: '顾客',
    scene: 'market',
    x: 19,
    y: 7,
    direction: 'down',
    assetId: 'tiaojianke',
    roamRadius: 1,
    speed: 0.4,
    greetings: [
      '这价儿再商量商量？',
      '我看看，我看看……',
      '你这货，可不算上乘。',
    ],
    replies: [
      { keywords: ['买', '卖', '多少钱', '价'], lines: ['再便宜一个铜板，我全包了！', '你这秤，怕是缺斤短两吧？'] },
      { keywords: ['你好', '嗨'], lines: ['嗯，我看看货。'] },
      { keywords: ['传闻', '听说'], lines: ['我听老杨说河里的鱼越来越少了，啧。'] },
      { keywords: ['走', '再见'], lines: ['急什么，我再掂量掂量。'] },
    ],
    defaultReplies: [
      '再便宜点嘛。',
      '这货色一般般。',
      '货比三家，我再转转。',
    ],
    bubbles: [
      '便宜点！',
      '这秤准不准？',
      '我再看看别家。',
    ],
  },
  // ========== 温馨小屋 ==========
  {
    id: 'amb_re_grandma',
    name: '织娘',
    title: '祖母',
    scene: 'residential',
    x: 6,
    y: 8,
    direction: 'left',
    assetId: 'zhiniang',
    roamRadius: 1,
    speed: 0.3,
    greetings: [
      '哎哟，稀客呀！快进来坐！',
      '外面冷吧？炉子上有热水。',
      '来，让奶奶好好看看你。',
    ],
    replies: [
      { keywords: ['你好', '嗨', '奶奶'], lines: ['好好好，乖孩子。', '来，奶奶给你拿块干粮。'] },
      { keywords: ['毛衣', '织', '布'], lines: ['这毛衣给莉莉织的，入冬前得赶出来。', '织了一辈子，手比年轻时还稳。'] },
      { keywords: ['传闻', '听说'], lines: ['镇上这些年轻人啊，总往外跑……哎。'] },
      { keywords: ['家', '住', '吃'], lines: ['就在这儿住下吧，屋子大着呢！'] },
    ],
    defaultReplies: [
      '一针一线，都是日子。',
      '人老了，就爱唠叨几句。',
      '热水在炉子上，自己倒。',
    ],
    bubbles: [
      '一针一线……',
      '莉莉啥时候回来呀。',
      '这毛线够软和。',
      '日子啊，就是这样过。',
    ],
  },
  {
    id: 'amb_re_kid',
    name: '豆豆',
    title: '邻家小孩',
    scene: 'residential',
    x: 13,
    y: 6,
    direction: 'down',
    assetId: 'doudou',
    roamRadius: 1,
    speed: 0.8,
    greetings: [
      '嘘——我藏在这儿看书呢！',
      '你也是来找莉莉姐姐玩的吗？',
      '别告诉我娘我在这儿！',
    ],
    replies: [
      { keywords: ['你好', '嗨'], lines: ['嘿嘿，你好呀！'] },
      { keywords: ['玩', '书', '故事'], lines: ['这本画册可好看了，讲的是屠龙勇士！', '你见过龙吗？真的假的？'] },
      { keywords: ['传闻', '听说', '怪'], lines: ['我听大人说森林里有会发光的东西！'] },
      { keywords: ['回家', '娘'], lines: ['唔……再、再看一页就回去！'] },
    ],
    defaultReplies: [
      '我娘说晚饭前要回家。',
      '嘘，别出声！',
      '这页的龙画得真凶。',
    ],
    bubbles: [
      '呼——好险。',
      '这本画册真好看！',
      '等我长大也要当冒险者！',
    ],
  },
  // ========== 低语森林 ==========
  {
    id: 'amb_fo_lumberjack',
    name: '老柴',
    title: '伐木工',
    scene: 'forest',
    x: 8,
    y: 8,
    direction: 'down',
    assetId: 'laochai',
    roamRadius: 2,
    speed: 0.5,
    greetings: [
      '这片林子我砍了三十年。',
      '小心点，林子里路不好走。',
      '要找好木料？跟我来。',
    ],
    replies: [
      { keywords: ['木头', '砍', '柴', '树'], lines: ['这棵老橡树，够你烧一冬天。', '砍树要看纹路，顺着砍省力气。'] },
      { keywords: ['你好', '嗨'], lines: ['嗯，你好。'] },
      { keywords: ['传闻', '听说', '怪', '动静'], lines: ['林子深处我最近不大敢去了……有怪动静。', '树根底下，有些东西不太对劲。'] },
      { keywords: ['森林', '危险'], lines: ['入夜前最好出林子，天黑了这林子会“说话”。'] },
    ],
    defaultReplies: [
      '我得把这棵树放倒。',
      '林子的脾气，我摸得透。',
      '斧头钝了，回头找铁匠。',
    ],
    bubbles: [
      '嘿咻！嘿咻！',
      '这木头纹理真好。',
      '林子深处……有动静。',
      '收工，回家烧火。',
    ],
  },
  {
    id: 'amb_fo_traveler',
    name: '风尘',
    title: '迷路旅人',
    scene: 'forest',
    x: 20,
    y: 8,
    direction: 'down',
    assetId: 'fengchen',
    roamRadius: 2,
    speed: 0.6,
    greetings: [
      '哎呀，总算见到活人了！',
      '请问……小镇是往哪个方向走？',
      '这林子的雾，转得我头都晕了。',
    ],
    replies: [
      { keywords: ['路', '方向', '镇', '走'], lines: ['你说往南走就能到小镇？谢天谢地！', '我已经在这林子里转了两个时辰了！'] },
      { keywords: ['你好', '嗨'], lines: ['你好你好！遇见你真是太好了！'] },
      { keywords: ['传闻', '听说'], lines: ['我在来路上听商队说，最近的狼群特别凶。'] },
      { keywords: ['吃', '喝', '饿'], lines: ['干粮还剩半块……你要是不嫌弃，分你一半？'] },
    ],
    defaultReplies: [
      '这雾什么时候能散啊……',
      '指南针在这林子里居然会转圈。',
      '谢谢指路，回头请你喝酒！',
    ],
    bubbles: [
      '这边走过了吗？',
      '咦，这颗树怎么看着眼熟……',
      '雾又起来了。',
    ],
  },
  // ========== 废弃矿洞 ==========
  {
    id: 'amb_mi_miner1',
    name: '老挖',
    title: '矿工',
    scene: 'mine',
    x: 6,
    y: 10,
    direction: 'down',
    assetId: 'laowa',
    roamRadius: 1,
    speed: 0.4,
    greetings: [
      '这儿的矿脉，够挖十年！',
      '小心脚下，别踩空。',
      '来活儿了？',
    ],
    replies: [
      { keywords: ['矿', '挖', '铁', '石头'], lines: ['这层的铁矿石成色最好！', '挖矿讲究个耐心，一镐一镐来。'] },
      { keywords: ['你好', '嗨'], lines: ['嗯，你好，矿工老挖。'] },
      { keywords: ['传闻', '听说', '怪', '声'], lines: ['深层的矿道最近老有怪响……铁砧那小子非说是什么虫子。'] },
      { keywords: ['休息', '累', '歇'], lines: ['挖满这一车，我也该歇会儿了。'] },
    ],
    defaultReplies: [
      '叮——叮——',
      '这镐头该磨了。',
      '矿灯油快用完了。',
    ],
    bubbles: [
      '叮——叮——',
      '好矿脉！',
      '这车矿石能换不少钱。',
      '听，深处有动静……',
    ],
  },
  {
    id: 'amb_mi_miner2',
    name: '二镐',
    title: '矿工',
    scene: 'mine',
    x: 23,
    y: 10,
    direction: 'down',
    assetId: 'ergao',
    roamRadius: 1,
    speed: 0.5,
    greetings: [
      '哟，生面孔！来见识见识矿洞？',
      '这儿的矿灯可不便宜，省着用。',
      '老挖在前头挖呢。',
    ],
    replies: [
      { keywords: ['矿', '挖', '灯', '火'], lines: ['没有矿灯，黑灯瞎火的准得迷路。', '这层铜矿多，不值钱但好挖。'] },
      { keywords: ['你好', '嗨'], lines: ['你好你好，矿工二镐！'] },
      { keywords: ['传闻', '听说', '怪', '虫子'], lines: ['我昨天真看见什么东西从岩缝里钻过去了！信不信由你！'] },
      { keywords: ['休息', '吃'], lines: ['饭点到了，我这有烤土豆，来一块？'] },
    ],
    defaultReplies: [
      '叮——叮——',
      '矿道里说话都有回音。',
      '这活计，越干越有瘾。',
    ],
    bubbles: [
      '叮当叮当……',
      '晚餐烤土豆！',
      '小心岩壁！',
      '深处好像有风吹过来……',
    ],
  },
]

class AmbientNpcService {
  private npcs: AmbientNpcDef[] = [...village, ...indoorNpcs]

  /** 获取全部普通NPC */
  getAll(): AmbientNpcDef[] {
    return this.npcs
  }

  /** 按场景获取普通NPC（town=城镇路人；室内/野外=该场景的氛围NPC） */
  getByScene(sceneId: string): AmbientNpcDef[] {
    return this.npcs.filter((n) => (n.scene ?? 'town') === sceneId)
  }

  /** 按ID获取普通NPC */
  getById(id: string): AmbientNpcDef | undefined {
    return this.npcs.find((n) => n.id === id)
  }

  /** 判断是否为普通NPC（amb_ 前缀） */
  isAmbientNpc(id: string): boolean {
    return id.startsWith(AMBIENT_NPC_PREFIX)
  }

  /** 随机挑选一条打招呼台词 */
  pickGreeting(id: string): string {
    const npc = this.getById(id)
    if (!npc || npc.greetings.length === 0) return '你好！'
    return npc.greetings[Math.floor(Math.random() * npc.greetings.length)]
  }

  /** 根据玩家消息关键词匹配回应台词 */
  pickReply(id: string, message: string): string {
    const npc = this.getById(id)
    if (!npc) return '（这个NPC似乎没有回应）'

    const lower = message.toLowerCase()
    for (const rule of npc.replies) {
      if (rule.keywords.some((k) => lower.includes(k))) {
        return rule.lines[Math.floor(Math.random() * rule.lines.length)]
      }
    }
    return npc.defaultReplies[Math.floor(Math.random() * npc.defaultReplies.length)]
  }

  /** 随机挑选一条头顶气泡台词 */
  pickBubble(id: string): string {
    const npc = this.getById(id)
    if (!npc || npc.bubbles.length === 0) return '……'
    return npc.bubbles[Math.floor(Math.random() * npc.bubbles.length)]
  }
}

/** 全局普通NPC服务实例 */
export const ambientNpcService = new AmbientNpcService()
