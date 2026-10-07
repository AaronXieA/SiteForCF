/* =====================================================
 * DontClick · 仿 Cookie Clicker 放置游戏
 * 主题：好奇心害死猫 —— 货币叫"好奇心"
 * 特性：点击升级 / 自动产出建筑 / 暴击 / 金色好奇 /
 *       成就系统 / 重生(灵魂加成) / 本地存档
 * ===================================================== */

const SAVE_KEY = "xrst_dontclick_save_v3";

/* ------------ 静态数据 ------------ */

// 点击升级：type=flat 加每次点击；type=mult 乘当前点击力
// unlock = 累计好奇心达到该值时解锁显示；hint = 未解锁时的模糊线索
const UPGRADES = [
  // —— 加数值（每次点击 +固定值）为主，贯穿全程 ——
  { id: "claws",   icon: "🐾", name: "锋利的爪子",    nameEn: "Sharp Claws",       desc: "每次点击 +1",       descEn: "+1 per click",       type: "flat",  value: 1,      baseCost: 15,    unlock: 0,      hint: "让你点得更用力的小工具", hintEn: "A little tool to help you click harder" },
  { id: "catnip",  icon: "🌿", name: "猫薄荷",        nameEn: "Catnip",           desc: "每次点击 +3",       descEn: "+3 per click",       type: "flat",  value: 3,      baseCost: 250,   unlock: 120,    hint: "让猫咪更兴奋的绿色植物", hintEn: "A green plant that excites cats" },
  { id: "double",  icon: "✌️", name: "双倍好奇",      nameEn: "Double Curiosity", desc: "点击力 ×2",         descEn: "Click power ×2",     type: "mult",  value: 2,      baseCost: 1200,  unlock: 600,    hint: "一只手不够就用两只", hintEn: "One hand isn't enough? Use two" },
  { id: "pad10",   icon: "💪", name: "用力一点",      nameEn: "Push Harder",      desc: "每次点击 +10",      descEn: "+10 per click",      type: "flat",  value: 10,     baseCost: 3e3,   unlock: 1.5e3,  hint: "别客气，使点劲", hintEn: "Don't be shy, put some muscle into it" },
  { id: "pad50",   icon: "🔨", name: "小锤子",        nameEn: "Little Hammer",    desc: "每次点击 +50",      descEn: "+50 per click",      type: "flat",  value: 50,     baseCost: 2.5e4, unlock: 1.2e4,  hint: "八十！八十！", hintEn: "Eighty! Eighty!" },
  { id: "pad300",  icon: "⛏️", name: "搞事镐",        nameEn: "Trouble Pick",     desc: "每次点击 +300",     descEn: "+300 per click",     type: "flat",  value: 300,    baseCost: 2e5,   unlock: 1e5,    hint: "一镐子下去按钮都在发抖", hintEn: "One swing and the button shakes" },
  { id: "aura",    icon: "😈", name: "作死光环",      nameEn: "Daredevil Aura",   desc: "点击力 ×3",         descEn: "Click power ×3",     type: "mult",  value: 3,      baseCost: 1.4e6, unlock: 7e5,    hint: "连恶魔都甘拜下风的作死气场", hintEn: "A daredevil aura that puts demons to shame" },
  { id: "pad2k",   icon: "🗡️", name: "叛逆匕首",      nameEn: "Rebel Dagger",     desc: "每次点击 +2,000",   descEn: "+2,000 per click",   type: "flat",  value: 2e3,    baseCost: 1.5e6, unlock: 8e5,    hint: "专戳不该戳的东西", hintEn: "Specializes in poking things you shouldn't" },
  { id: "pad15k",  icon: "⚔️", name: "反骨之剑",      nameEn: "Defiant Sword",    desc: "每次点击 +1.5 万",  descEn: "+15,000 per click",  type: "flat",  value: 1.5e4,  baseCost: 1.2e7, unlock: 6e6,    hint: "剑身上刻着「就点」", hintEn: "The blade is engraved with 'Just Click'" },
  { id: "quantum", icon: "⚛️", name: "量子双击",      nameEn: "Quantum Double",   desc: "点击力 ×4",         descEn: "Click power ×4",     type: "mult",  value: 4,      baseCost: 20e6,  unlock: 1e7,    hint: "在平行宇宙同时点两下", hintEn: "Click twice simultaneously in a parallel universe" },
  { id: "pad100k", icon: "🏹", name: "连珠弩",        nameEn: "Repeating Crossbow", desc: "每次点击 +10 万", descEn: "+100,000 per click", type: "flat",  value: 1e5,    baseCost: 1e8,   unlock: 5e7,    hint: "一箭接一箭，根本停不住", hintEn: "Arrow after arrow, can't stop" },
  { id: "pad800k", icon: "🪓", name: "裂地斧",        nameEn: "Earthsplitter Axe", desc: "每次点击 +80 万",  descEn: "+800,000 per click", type: "flat",  value: 8e5,    baseCost: 8e8,   unlock: 4e8,    hint: "一斧头连地板都裂开", hintEn: "One swing cracks even the floor" },
  { id: "pad6m",   icon: "💣", name: "一触即炸",      nameEn: "Touch & Explode",  desc: "每次点击 +600 万",  descEn: "+6M per click",      type: "flat",  value: 6e6,    baseCost: 6e9,   unlock: 3e9,    hint: "建议轻一点……算了随便点", hintEn: "Maybe go easy… nah, click away" },
  { id: "pad50m",  icon: "🧨", name: "作死鞭炮",      nameEn: "Daredevil Firecracker", desc: "每次点击 +5000 万", descEn: "+50M per click", type: "flat",  value: 5e7,    baseCost: 5e10,  unlock: 2.5e10, hint: "噼里啪啦，越点越上头", hintEn: "Crackling — the more you click, the more addictive" },
  { id: "divine",  icon: "✨", name: "神圣一指",      nameEn: "Divine Finger",    desc: "点击力 ×5",         descEn: "Click power ×5",     type: "mult",  value: 5,      baseCost: 75e9,  unlock: 38e9,   hint: "被神明祝福过的食指", hintEn: "An index finger blessed by the gods" },
  { id: "cosmic",  icon: "🌠", name: "宇宙之力",      nameEn: "Cosmic Power",     desc: "点击力 ×10",        descEn: "Click power ×10",    type: "mult",  value: 10,     baseCost: 1e12,  unlock: 500e9,  hint: "借用整个星系的能量", hintEn: "Borrow the energy of an entire galaxy" },
  { id: "pad400m", icon: "🚀", name: "指尖火箭",      nameEn: "Fingertip Rocket", desc: "每次点击 +4 亿",    descEn: "+400M per click",    type: "flat",  value: 4e8,    baseCost: 4e12,  unlock: 2e12,   hint: "点火，起飞，戳按钮", hintEn: "Ignite, take off, poke the button" },
  { id: "pad3b",   icon: "☄️", name: "流星锤",        nameEn: "Meteor Hammer",    desc: "每次点击 +30 亿",   descEn: "+3B per click",      type: "flat",  value: 3e9,    baseCost: 3e14,  unlock: 1.5e14, hint: "从天而降的一下重击", hintEn: "A heavy blow crashing from the sky" },
  { id: "pad25b",  icon: "🌋", name: "熔岩指套",      nameEn: "Lava Gauntlet",    desc: "每次点击 +250 亿",  descEn: "+25B per click",     type: "flat",  value: 2.5e10, baseCost: 2e16,  unlock: 1e16,   hint: "戴上它，按钮烫手也照点", hintEn: "Wear it, click even when the button burns" },
  { id: "dbreak",  icon: "💎", name: "维度破碎",      nameEn: "Dimension Break",  desc: "点击力 ×25",        descEn: "Click power ×25",    type: "mult",  value: 25,     baseCost: 30e15, unlock: 1.5e16, hint: "一拳打碎十一维空间", hintEn: "One punch shatters 11-dimensional space" },
  { id: "pad200b", icon: "⚡", name: "雷霆一指",      nameEn: "Thunder Finger",   desc: "每次点击 +2000 亿", descEn: "+200B per click",    type: "flat",  value: 2e11,   baseCost: 1.6e18,unlock: 8e17,   hint: "指尖带着闪电划过", hintEn: "Lightning trails from your fingertips" },
  { id: "genesis", icon: "🖐️", name: "创世之手",      nameEn: "Hand of Genesis",  desc: "点击力 ×100",       descEn: "Click power ×100",   type: "mult",  value: 100,    baseCost: 150e18,unlock: 7.5e18, hint: "据说神就是这样创造世界的", hintEn: "They say this is how gods created the world" },
  { id: "pad2t",   icon: "🔱", name: "混沌三叉戟",    nameEn: "Chaos Trident",    desc: "每次点击 +2 兆",    descEn: "+2T per click",      type: "flat",  value: 2e12,   baseCost: 1e20,  unlock: 5e19,   hint: "三叉齐下，一下顶三下", hintEn: "Three prongs at once, one hit equals three" },
  { id: "paradox", icon: "🌀", name: "无限悖论",      nameEn: "Infinite Paradox", desc: "点击力 ×250",       descEn: "Click power ×250",   type: "mult",  value: 250,    baseCost: 60e21, unlock: 3e21,   hint: "按下的瞬间既存在又不存在", hintEn: "The instant you press, it both exists and doesn't" },
  { id: "pad20t",  icon: "🌊", name: "海啸连打",      nameEn: "Tsunami Barrage",  desc: "每次点击 +20 兆",   descEn: "+20T per click",     type: "flat",  value: 2e13,   baseCost: 6e21,  unlock: 3e21,   hint: "一浪接一浪的点击", hintEn: "Wave after wave of clicks" },
  { id: "pad500t", icon: "🔥", name: "业火点穴手",    nameEn: "Karma Fire Touch", desc: "每次点击 +500 兆",  descEn: "+500T per click",    type: "flat",  value: 5e14,   baseCost: 4e23,  unlock: 2e23,   hint: "所点之处，寸草不生", hintEn: "Wherever you click, nothing grows back" },
  { id: "absolute",icon: "🌟", name: "绝对存在",      nameEn: "The Absolute",     desc: "点击力 ×1000",      descEn: "Click power ×1000",  type: "mult",  value: 1000,   baseCost: 3e26,  unlock: 1.5e24, hint: "超越一切的终极点击", hintEn: "The ultimate click beyond everything" },
  { id: "infinity",icon: "∞",  name: "永动机",        nameEn: "Perpetual Motion", desc: "每次点击 +10000",   descEn: "+10,000 per click",  type: "flat",  value: 10000,  baseCost: 5e28,  unlock: 2.5e24, hint: "永远停不下来的齿轮", hintEn: "Gears that never stop turning" },
  { id: "overclk", icon: "⏩", name: "超频永动机",    nameEn: "Overclocked PMM",  desc: "每次点击 +100000",  descEn: "+100,000 per click", type: "flat",  value: 1e5,    baseCost: 8e29,  unlock: 4e29,   hint: "给永动机再焊一颗涡轮", hintEn: "Weld another turbine to the PMM" },
  { id: "endall",  icon: "🏁", name: "好奇终焉",      nameEn: "End of Curiosity", desc: "点击力 ×100000",    descEn: "Click power ×100000",type: "mult",  value: 1e5,    baseCost: 2e40,  unlock: 1e40,   hint: "一切好奇的最终形态", hintEn: "The final form of all curiosity" },
  { id: "godhand", icon: "🖱️", name: "终极手速",      nameEn: "Godhand Speed",    desc: "每次点击 +10 亿",   descEn: "+10B per click",     type: "flat",  value: 1e9,    baseCost: 4e41,  unlock: 2e41,   hint: "鼠标：我到底做错了什么", hintEn: "Mouse: What did I ever do wrong?" },
];

// 建筑：每秒产出 base * owned。unlock = 累计好奇阈值；hint = 未解锁线索
const BUILDINGS = [
  { id: "cat",    icon: "🐱", name: "好奇小猫",      nameEn: "Curious Cat",       desc: "每秒 +0.1 好奇",    descEn: "+0.1/sec",    base: 0.1,    baseCost: 15,     unlock: 0,      hint: "总爱伸爪戳东西的小家伙", hintEn: "A little creature that loves poking things" },
  { id: "crowd",  icon: "👥", name: "围观群众",      nameEn: "Onlookers",         desc: "每秒 +1 好奇",      descEn: "+1/sec",      base: 1,      baseCost: 100,    unlock: 50,     hint: "一群爱凑热闹的人", hintEn: "A crowd that loves gathering around" },
  { id: "robot",  icon: "🤖", name: "搞事机器人",    nameEn: "Mischief Robot",    desc: "每秒 +8 好奇",      descEn: "+8/sec",      base: 8,      baseCost: 1100,   unlock: 550,    hint: "被设定成不停按按钮的 AI", hintEn: "An AI programmed to never stop pressing buttons" },
  { id: "factory",icon: "🏭", name: "叛逆工厂",      nameEn: "Rebel Factory",     desc: "每秒 +47 好奇",     descEn: "+47/sec",     base: 47,     baseCost: 12000,  unlock: 6000,   hint: "流水线全是不服管的工人" },
  { id: "lab",    icon: "🧪", name: "禁忌实验室",    nameEn: "Forbidden Lab",     desc: "每秒 +260 好奇",    descEn: "+260/sec",    base: 260,    baseCost: 130000, unlock: 65000,  hint: "烧瓶里冒着紫色的不明气体" },
  { id: "black",  icon: "🕳️", name: "好奇心黑洞",    nameEn: "Curiosity Black Hole", desc: "每秒 +1400 好奇", descEn: "+1.4K/sec",   base: 1400,   baseCost: 1.4e6,  unlock: 700000, hint: "连光都逃不出它的吸引" },
  { id: "quant",  icon: "⚛️", name: "量子作死器",    nameEn: "Quantum Troublemaker", desc: "每秒 +7800 好奇", descEn: "+7.8K/sec",  base: 7800,   baseCost: 20e6,   unlock: 10e6,   hint: "同时在所有维度搞破坏" },
  { id: "ultra",  icon: "👑", name: "终极反骨",      nameEn: "Ultimate Rebel",    desc: "每秒 +44000 好奇",  descEn: "+44K/sec",    base: 44000,  baseCost: 330e6,  unlock: 165e6,  hint: "天生反骨，专治各种不服" },
  { id: "galaxy", icon: "🌌", name: "好奇星系",      nameEn: "Curiosity Galaxy",  desc: "每秒 +26 万好奇",   descEn: "+260K/sec",   base: 260000, baseCost: 5.1e9,  unlock: 2.5e9,  hint: "一整个星系的居民都在按" },
  { id: "void",   icon: "🌀", name: "虚空吞噬者",    nameEn: "Void Devourer",     desc: "每秒 +160 万好奇",  descEn: "+1.6M/sec",   base: 1.6e6,  baseCost: 75e9,   unlock: 38e9,   hint: "来自虚空的不可名状之物" },
  { id: "time",   icon: "⏳", name: "时间窃贼",      nameEn: "Time Thief",        desc: "每秒 +1000 万好奇", descEn: "+10M/sec",    base: 10e6,   baseCost: 1e12,   unlock: 500e9,  hint: "它偷走别人的时间来按按钮" },
  { id: "dream",  icon: "💭", name: "梦境编织者",    nameEn: "Dream Weaver",      desc: "每秒 +6500 万好奇", descEn: "+65M/sec",    base: 65e6,   baseCost: 14e12,  unlock: 7e12,   hint: "在睡梦中替你按下无数次" },
  { id: "god",    icon: "🌟", name: "逆天神明",      nameEn: "Defiant Deity",     desc: "每秒 +4.3 亿好奇",  descEn: "+430M/sec",   base: 430e6,  baseCost: 170e12, unlock: 85e12,  hint: "祂因叛逆而诞生，因好奇而存在" },
  { id: "singul", icon: "💫", name: "奇点",          nameEn: "Singularity",       desc: "每秒 +29 亿好奇",   descEn: "+2.9B/sec",   base: 2.9e9,  baseCost: 2.1e15, unlock: 1e15,   hint: "万物归一，好奇的终点" },
  { id: "engine", icon: "⚙️", name: "创世引擎",      nameEn: "Genesis Engine",    desc: "每秒 +180 亿好奇",  descEn: "+18B/sec",    base: 18e9,   baseCost: 1.2e16, unlock: 6e15,   hint: "驱动宇宙运转的核心" },
  { id: "forge",  icon: "🔥", name: "维度熔炉",      nameEn: "Dimension Forge",   desc: "每秒 +1100 亿好奇", descEn: "+110B/sec",   base: 110e9,  baseCost: 8e16,   unlock: 4e16,   hint: "熔化维度，浇铸好奇" },
  { id: "loom",   icon: "🧵", name: "时空织布机",    nameEn: "Spacetime Loom",    desc: "每秒 +7000 亿好奇", descEn: "+700B/sec",   base: 700e9,  baseCost: 5e17,   unlock: 2.5e17, hint: "在时空的经纬上编织好奇" },
  { id: "weaver", icon: "🕸️", name: "因果编织者",    nameEn: "Causality Weaver",  desc: "每秒 +4.5 兆好奇",  descEn: "+4.5T/sec",   base: 4.5e12, baseCost: 3.5e18, unlock: 1.75e18,hint: "每根因果线都连着一次点击" },
  { id: "dice",   icon: "🎲", name: "命运骰子",      nameEn: "Dice of Fate",      desc: "每秒 +30 兆好奇",   descEn: "+30T/sec",    base: 30e12,  baseCost: 2.5e19, unlock: 1.25e19,hint: "掷出的每一面都是好奇" },
  { id: "source", icon: "🌊", name: "存在之源",      nameEn: "Source of Being",   desc: "每秒 +200 兆好奇",  descEn: "+200T/sec",   base: 200e12, baseCost: 2e20,   unlock: 1e20,   hint: "万物存在的根本动力" },
  { id: "heart",  icon: "💜", name: "虚无之心",      nameEn: "Heart of Void",     desc: "每秒 +1400 兆好奇", descEn: "+1.4Q/sec",   base: 1.4e15, baseCost: 1.6e21, unlock: 8e20,   hint: "在绝对虚无中跳动的心脏" },
  { id: "one",    icon: "☯️", name: "万物归一",      nameEn: "All as One",        desc: "每秒 +1 京好奇",    descEn: "+10Q/sec",    base: 1e16,   baseCost: 1.5e22, unlock: 7.5e21, hint: "一切归于一点，一点生一切" },
  { id: "beyond", icon: "🌠", name: "超脱者",        nameEn: "The Transcendent",  desc: "每秒 +6 京好奇",    descEn: "+60Q/sec",    base: 6e16,   baseCost: 1.2e23, unlock: 6e22,   hint: "跳出三界外，不在五行中" },
  { id: "eternal",icon: "⏳", name: "永恒回响",      nameEn: "Eternal Echo",      desc: "每秒 +40 京好奇",   descEn: "+400Q/sec",   base: 4e17,   baseCost: 1e24,   unlock: 5e23,   hint: "来自时间尽头的余音" },
  { id: "renew",  icon: "🌄", name: "万象新生",      nameEn: "All Things Renew",  desc: "每秒 +250 京好奇",  descEn: "+2.5Qi/sec",  base: 2.5e18, baseCost: 8e24,   unlock: 4e24,   hint: "旧宇宙死去，新好奇萌发" },
  { id: "mind",   icon: "🧠", name: "集体潜意识",    nameEn: "Collective Unconscious", desc: "每秒 +16 垓好奇", descEn: "+16Qi/sec", base: 1.6e19, baseCost: 6.4e25, unlock: 3.2e25, hint: "所有生物潜意识里都在按" },
  { id: "rune",   icon: "🔯", name: "禁忌符文",      nameEn: "Forbidden Runes",   desc: "每秒 +100 垓好奇",  descEn: "+100Qi/sec",  base: 1e20,   baseCost: 5e26,   unlock: 2.5e26, hint: "刻满远古禁咒的石板" },
  { id: "nebula", icon: "🌫️", name: "好奇星云",     nameEn: "Curiosity Nebula",  desc: "每秒 +650 垓好奇",  descEn: "+650Qi/sec",  base: 6.5e20, baseCost: 4e27,   unlock: 2e27,   hint: "星尘的成分全是好奇心" },
  { id: "beacon", icon: "🗼", name: "时空灯塔",      nameEn: "Spacetime Beacon",  desc: "每秒 +4200 垓好奇", descEn: "+4.2Sx/sec",  base: 4.2e21, baseCost: 3.2e28, unlock: 1.6e28, hint: "为所有时空的点击者领航" },
  { id: "scroll", icon: "📜", name: "预言之书",      nameEn: "Book of Prophecy",  desc: "每秒 +2.7 秭好奇",  descEn: "+27Sx/sec",   base: 2.7e22, baseCost: 2.5e29, unlock: 1.3e29, hint: "书上写满了你会按按钮" },
  { id: "tree",   icon: "🌳", name: "世界之树",      nameEn: "World Tree",        desc: "每秒 +17 秭好奇",   descEn: "+170Sx/sec",  base: 1.7e23, baseCost: 2e30,   unlock: 1e30,   hint: "每片叶子都在替你点击" },
  { id: "ouro",   icon: "🐍", name: "衔尾之蛇",      nameEn: "Ouroboros",         desc: "每秒 +110 秭好奇",  descEn: "+1.1Sp/sec",  base: 1.1e24, baseCost: 1.6e31, unlock: 8e30,   hint: "首尾相衔，好奇循环不息" },
  { id: "altar",  icon: "🛐", name: "逆反神坛",      nameEn: "Rebellious Altar",  desc: "每秒 +700 秭好奇",  descEn: "+7Sp/sec",    base: 7e24,   baseCost: 1.3e32, unlock: 6e31,   hint: "向神坛许愿：就要按按钮" },
  { id: "finale", icon: "🎼", name: "终末乐章",      nameEn: "Final Movement",    desc: "每秒 +4500 秭好奇", descEn: "+45Sp/sec",   base: 4.5e25, baseCost: 1e33,   unlock: 5e32,   hint: "宇宙谢幕前的安可曲" },
];

// 成就：check 函数返回 true 时解锁
const ACHIEVEMENTS = [
  { id: "first",      icon: "👆", name: "初犯",       nameEn: "First Offense",     desc: "按下第 1 次",         descEn: "Click for the 1st time",      hint: "第一次总是最难的",   check: s => s.totalClicks >= 1 },
  { id: "itchy",      icon: "✋", name: "手痒",       nameEn: "Itchy Fingers",     desc: "按下 10 次",          descEn: "Click 10 times",               hint: "你的手开始不听话了", check: s => s.totalClicks >= 10 },
  { id: "cantstop",   icon: "🔁", name: "停不下来",   nameEn: "Can't Stop",        desc: "按下 100 次",         descEn: "Click 100 times",              hint: "已经停不下来了",     check: s => s.totalClicks >= 100 },
  { id: "grind",      icon: "🏋️", name: "肝帝",      nameEn: "Grind Master",      desc: "按下 1,000 次",       descEn: "Click 1,000 times",            hint: "你的肝还好吗",       check: s => s.totalClicks >= 1000 },
  { id: "machine",    icon: "🤖", name: "不是人",     nameEn: "Not Human",         desc: "按下 10,000 次",      descEn: "Click 10,000 times",           hint: "你不是人，是机器",   check: s => s.totalClicks >= 10000 },
  { id: "firstb",     icon: "🐱", name: "第一只猫",   nameEn: "First Cat",         desc: "买下第一只好奇小猫",  descEn: "Buy the first Curious Cat",    hint: "养猫的第一步",       check: s => (s.buildings.cat || 0) >= 1 },
  { id: "smallshop",  icon: "🏠", name: "小作坊",     nameEn: "Little Workshop",   desc: "拥有 10 个建筑",      descEn: "Own 10 buildings",             hint: "小有规模",           check: s => totalBuildings(s) >= 10 },
  { id: "industry",   icon: "🏭", name: "工业革命",   nameEn: "Industrial Rev.",   desc: "拥有 50 个建筑",      descEn: "Own 50 buildings",             hint: "工业化大生产",       check: s => totalBuildings(s) >= 50 },
  { id: "kcur",       icon: "💰", name: "小康",       nameEn: "Well-off",          desc: "累计获得 1,000 好奇", descEn: "Earn 1,000 curiosity total",   hint: "攒点小钱",           check: s => s.totalEarned >= 1000 },
  { id: "mcur",       icon: "💎", name: "富甲一方",   nameEn: "Filthy Rich",       desc: "累计 1,000,000 好奇", descEn: "Earn 1M curiosity total",      hint: "成为好奇富翁",       check: s => s.totalEarned >= 1e6 },
  { id: "gcur",       icon: "🏆", name: "好奇之神",   nameEn: "God of Curiosity",  desc: "累计 10 亿好奇",      descEn: "Earn 1B curiosity total",      hint: "登顶好奇之巅",       check: s => s.totalEarned >= 1e9 },
  { id: "cps10",      icon: "⚡", name: "小水管",     nameEn: "Little Pipe",       desc: "每秒好奇达到 10",     descEn: "Reach 10 curiosity/sec",       hint: "开始自动产出了",     check: s => computeCPS(s) >= 10 },
  { id: "cps1k",      icon: "🌊", name: "好奇心瀑布", nameEn: "Curiosity Falls",   desc: "每秒好奇达到 1,000",  descEn: "Reach 1K curiosity/sec",       hint: "好奇如瀑布倾泻",     check: s => computeCPS(s) >= 1000 },
  { id: "click100",   icon: "💥", name: "重拳",       nameEn: "Heavy Punch",       desc: "单次点击 ≥ 100",      descEn: "Single click ≥ 100",           hint: "一击破百",           check: s => computeClickPower(s) >= 100 },
  { id: "click10k",   icon: "☄️", name: "毁灭一击",   nameEn: "Devastating Blow",  desc: "单次点击 ≥ 10,000",   descEn: "Single click ≥ 10K",           hint: "一击上万",           check: s => computeClickPower(s) >= 10000 },
  { id: "click1m",    icon: "🌋", name: "灭世一击",   nameEn: "World-ending Blow", desc: "单次点击 ≥ 1,000,000",descEn: "Single click ≥ 1M",            hint: "一击百万",           check: s => computeClickPower(s) >= 1e6 },
  { id: "click100m",  icon: "🌑", name: "黑洞之触",   nameEn: "Touch of Black Hole",desc: "单次点击 ≥ 1 亿",    descEn: "Single click ≥ 100M",          hint: "一击上亿",           check: s => computeClickPower(s) >= 1e8 },
  { id: "obsess",     icon: "🖱️", name: "走火入魔",   nameEn: "Obsessed",          desc: "按下 100,000 次",     descEn: "Click 100K times",             hint: "你的手指还好吗",     check: s => s.totalClicks >= 100000 },
  { id: "transcend",  icon: "👼", name: "超凡入圣",   nameEn: "Transcendent",      desc: "按下 1,000,000 次",   descEn: "Click 1M times",               hint: "你已超越凡人",       check: s => s.totalClicks >= 1e6 },
  { id: "empire",     icon: "🏛️", name: "好奇帝国",   nameEn: "Curiosity Empire",  desc: "拥有 100 个建筑",     descEn: "Own 100 buildings",            hint: "帝国初具规模",       check: s => totalBuildings(s) >= 100 },
  { id: "galactic",   icon: "🌐", name: "银河霸权",   nameEn: "Galactic Hegemony", desc: "拥有 200 个建筑",     descEn: "Own 200 buildings",            hint: "统治整个银河系",     check: s => totalBuildings(s) >= 200 },
  { id: "trillion",   icon: "💠", name: "好奇如山",   nameEn: "Curiosity Mountain",desc: "累计 1 万亿好奇",     descEn: "Earn 1T curiosity total",      hint: "好奇堆积成山",       check: s => s.totalEarned >= 1e12 },
  { id: "quadrillion",icon: "🔱", name: "好奇如海",   nameEn: "Curiosity Ocean",   desc: "累计 1 千万亿好奇",   descEn: "Earn 1Qa curiosity total",     hint: "好奇如汪洋大海",     check: s => s.totalEarned >= 1e15 },
  { id: "cps10k",     icon: "🌪️", name: "好奇洪流",   nameEn: "Curiosity Torrent", desc: "每秒好奇达到 10,000", descEn: "Reach 10K curiosity/sec",      hint: "好奇如洪流奔涌", hintEn: "Curiosity surges like a flood",     check: s => computeCPS(s) >= 10000 },
  { id: "cps1m",      icon: "🌊", name: "好奇海啸",   nameEn: "Curiosity Tsunami", desc: "每秒好奇达到 1,000,000",descEn: "Reach 1M curiosity/sec",     hint: "好奇掀起惊涛骇浪", hintEn: "Curiosity raises towering waves",   check: s => computeCPS(s) >= 1e6 },
  { id: "soul100",    icon: "💀", name: "百魂夜行",   nameEn: "Hundred Souls",     desc: "拥有 100 个反骨之魂", descEn: "Own 100 Rebel Souls",          hint: "百魂缠身", hintEn: "A hundred souls cling to you",           check: s => s.souls >= 100 },
  { id: "soul1k",     icon: "☠️", name: "千魂锁命",   nameEn: "Thousand Souls",    desc: "拥有 1,000 个灵魂",   descEn: "Own 1,000 souls",              hint: "千魂归位", hintEn: "A thousand souls take their place",           check: s => s.souls >= 1000 },
  { id: "prestige10", icon: "🔄", name: "轮回不止",   nameEn: "Endless Cycle",     desc: "完成 10 次重生",      descEn: "Rebirth 10 times",             hint: "轮回千遍仍不倦", hintEn: "A thousand reincarnations, never tired",     check: s => s.prestigeCount >= 10 },
  { id: "collector",  icon: "📚", name: "集大成者",   nameEn: "Master Collector",  desc: "拥有所有类型建筑",    descEn: "Own all building types",       hint: "集齐全部建筑种类", hintEn: "Collect every building type",   check: s => BUILDINGS.every(b => (s.buildings[b.id] || 0) >= 1) },
  { id: "golden1",    icon: "🍪", name: "幸运儿",     nameEn: "Lucky One",         desc: "点击 1 次金色好奇",   descEn: "Click 1 golden curiosity",     hint: "金色的光芒眷顾了你", hintEn: "Golden light smiles upon you", check: s => (s.goldenClicks || 0) >= 1 },
  { id: "golden10",   icon: "🌟", name: "金色收藏家", nameEn: "Golden Collector",  desc: "点击 10 次金色好奇",  descEn: "Click 10 golden curiosity",    hint: "金光闪闪的人生", hintEn: "A life gleaming with gold",     check: s => (s.goldenClicks || 0) >= 10 },
  { id: "event1",     icon: "🎯", name: "随机应变",   nameEn: "Adaptable",         desc: "完成 1 个随机事件",   descEn: "Complete 1 random event",      hint: "抓住了转瞬即逝的机会", hintEn: "Seized a fleeting opportunity",check: s => (s.eventsCompleted || 0) >= 1 },
  { id: "event10",    icon: "🏆", name: "事件达人",   nameEn: "Event Master",      desc: "完成 10 个随机事件",  descEn: "Complete 10 random events",    hint: "运气与实力并存", hintEn: "Luck and skill combined",     check: s => (s.eventsCompleted || 0) >= 10 },
  { id: "prestige",   icon: "✨", name: "涅槃",       nameEn: "Nirvana",           desc: "完成第一次重生",       descEn: "Rebirth for the first time",   hint: "浴火重生", hintEn: "Reborn from the flames",           check: s => s.prestigeCount >= 1 },
  /* ---- 第二批：更深的坑 ---- */
  { id: "click10m",   icon: "🦾", name: "千万次的问", nameEn: "Ten Million Clicks",desc: "按下 10,000,000 次",  descEn: "Click 10M times",              hint: "千万里我追寻着你", hintEn: "I've chased you across thousands of miles",   check: s => s.totalClicks >= 1e7 },
  { id: "clicks100m", icon: "🌍", name: "亿指神技",   nameEn: "Hundred-Million Touch",desc: "按下 1 亿次",       descEn: "Click 100M times",             hint: "全世界每人替你按一下", hintEn: "Everyone on earth presses once for you",check: s => s.totalClicks >= 1e8 },
  { id: "e18",        icon: "🌌", name: "恒河沙数",   nameEn: "Ganges Sand",       desc: "累计 100 京好奇",      descEn: "Earn 100Qi curiosity total",   hint: "像恒河里的沙子一样多", hintEn: "As many as the sands of the Ganges",check: s => s.totalEarned >= 1e18 },
  { id: "e24",        icon: "♾️", name: "无量大数",   nameEn: "Infinite Number",   desc: "累计 1 秭好奇",        descEn: "Earn 1Sx curiosity total",     hint: "数字已经没有实感了", hintEn: "Numbers have lost all meaning", check: s => s.totalEarned >= 1e24 },
  { id: "reachinf",   icon: "🏵️", name: "触及无限",  nameEn: "Touch Infinity",    desc: "好奇心到达 ∞",         descEn: "Curiosity reaches ∞",          hint: "好奇的尽头是什么", hintEn: "What lies at the end of curiosity?",   check: s => s.curiosity === Infinity },
  { id: "cps1b",      icon: "🚀", name: "好奇火箭",   nameEn: "Curiosity Rocket",  desc: "每秒好奇达到 10 亿",   descEn: "Reach 1B curiosity/sec",       hint: "产能点火升空", hintEn: "Production ignites and lifts off",       check: s => computeCPS(s) >= 1e9 },
  { id: "cps1q",      icon: "🌠", name: "超光速产出", nameEn: "Faster-than-light", desc: "每秒好奇达到 100 京",  descEn: "Reach 100Qi curiosity/sec",    hint: "产出比光还快", hintEn: "Output faster than light",       check: s => computeCPS(s) >= 1e17 },
  { id: "cps1n",      icon: "🌀", name: "永动纪元",   nameEn: "Perpetual Era",     desc: "每秒好奇达到 1 秭",    descEn: "Reach 1Sx curiosity/sec",      hint: "躺着也能花一万辈子", hintEn: "Even lying down, you'd spend 10,000 lifetimes", check: s => computeCPS(s) >= 1e24 },
  { id: "cp1t",       icon: "🔨", name: "万亿重拳",   nameEn: "Trillion Punch",    desc: "单次点击 ≥ 1 万亿",    descEn: "Single click ≥ 1T",            hint: "一拳一个小目标", hintEn: "One punch, one small goal",     check: s => computeClickPower(s) >= 1e12 },
  { id: "cp1e20",     icon: "☄️", name: "指数之手",  nameEn: "Exponential Hand",  desc: "单次点击 ≥ 1 垓",      descEn: "Single click ≥ 100Qi",         hint: "指数曲线的信徒", hintEn: "A believer in the exponential curve",     check: s => computeClickPower(s) >= 1e20 },
  { id: "b400",       icon: "🌆", name: "星际都市",   nameEn: "Interstellar City", desc: "拥有 400 个建筑",      descEn: "Own 400 buildings",            hint: "城市化覆盖全星系", hintEn: "Urbanization spans the entire galaxy",   check: s => totalBuildings(s) >= 400 },
  { id: "b1000",      icon: "👑", name: "好奇财团",   nameEn: "Curiosity Conglom.",desc: "拥有 1000 个建筑",     descEn: "Own 1,000 buildings",          hint: "你的产业多到数不清", hintEn: "Your industries are beyond counting", check: s => totalBuildings(s) >= 1000 },
  { id: "chain",      icon: "🏗️", name: "连锁经营",  nameEn: "Chain Business",    desc: "同一种建筑拥有 25 个", descEn: "Own 25 of one building type",  hint: "加盟店开遍宇宙", hintEn: "Franchises across the universe",     check: s => Object.values(s.buildings).some(n => n >= 25) },
  { id: "soul10",     icon: "💜", name: "十魂附体",   nameEn: "Ten Souls",         desc: "拥有 10 个反骨之魂",   descEn: "Own 10 Rebel Souls",           hint: "十魂护体，百无禁忌", hintEn: "Ten souls guard you, nothing is taboo", check: s => s.souls >= 10 },
  { id: "soul50",     icon: "👻", name: "半百幽魂",   nameEn: "Fifty Souls",       desc: "拥有 50 个反骨之魂",   descEn: "Own 50 Rebel Souls",           hint: "走到哪都凉飕飕的", hintEn: "A chill follows you everywhere",   check: s => s.souls >= 50 },
  { id: "prestige3",  icon: "🌙", name: "三界轮回",   nameEn: "Three Realms",      desc: "完成 3 次重生",        descEn: "Rebirth 3 times",              hint: "天界人界冥界都转过", hintEn: "You've toured heaven, earth and the underworld", check: s => s.prestigeCount >= 3 },
  { id: "prestige25", icon: "🌀", name: "轮回老手",   nameEn: "Cycle Veteran",     desc: "完成 25 次重生",       descEn: "Rebirth 25 times",             hint: "孟婆汤都喝出免疫了", hintEn: "You've built immunity to Meng Po's soup", check: s => s.prestigeCount >= 25 },
  { id: "golden50",   icon: "🌕", name: "金色传说",   nameEn: "Golden Legend",     desc: "点击 50 次金色好奇",   descEn: "Click 50 golden curiosity",    hint: "金光护体，欧皇本皇", hintEn: "Golden aura — the luckiest of the lucky", check: s => (s.goldenClicks || 0) >= 50 },
  { id: "event50",    icon: "🎰", name: "事件常客",   nameEn: "Event Regular",     desc: "完成 50 个随机事件",   descEn: "Complete 50 random events",    hint: "哪里有热闹哪里有你", hintEn: "Wherever there's a crowd, you're there", check: s => (s.eventsCompleted || 0) >= 50 },
  { id: "ascend1",    icon: "🪐", name: "初次飞升",  nameEn: "First Ascend",      desc: "完成 1 次 Infinity 飞升",descEn: "Ascend 1 time",              hint: "跳出三界外，再入五行中", hintEn: "Beyond the three realms, back into the five elements",check: s => (s.ascensions || 0) >= 1 },
  { id: "so10",       icon: "🚚", name: "等补货的人", nameEn: "Restocker's Friend",desc: "累计触发 10 次断货",   descEn: "Trigger 10 stockouts",         hint: "和快递员成了老朋友", hintEn: "You're old friends with the delivery guy", check: s => (s.stockoutCount || 0) >= 10 },
  { id: "shopaholic", icon: "🛒", name: "购物狂",    nameEn: "Shopaholic",        desc: "累计购买 100 件商品",  descEn: "Buy 100 items total",          hint: "商店 VIP 中 VIP", hintEn: "The VIP among shop VIPs",    check: s => Object.values(s.upgrades).reduce((a, b) => a + b, 0)
                                                                                                       + totalBuildings(s) >= 100 },
  { id: "allup",      icon: "🎁", name: "全都要",     nameEn: "I Want Them All",   desc: "买过每种点击升级",     descEn: "Buy every click upgrade",      hint: "小孩子才做选择", hintEn: "Kids are the ones who choose",     check: s => UPGRADES.every(u => (s.upgrades[u.id] || 0) >= 1) },
  { id: "finale1",    icon: "🎼", name: "终末收藏家", nameEn: "Final Collector",   desc: "买下一座终末乐章",     descEn: "Own a Final Movement",         hint: "听到了宇宙的安可曲", hintEn: "You heard the universe's encore", check: s => (s.buildings.finale || 0) >= 1 },
];

const TAUNTS = [
  "真的，手拿开。",
  "……你按了。",
  "还要继续吗？",
  "你可能有点上头。",
  "行吧，随你。",
  "这已经是第 %n 次了。",
  "要不要停一下？",
  "按键都替你尴尬了。",
  "你赢了……继续吧。",
  "数不清了吧？其实我数着呢。",
  "猫都看累了。",
  "你已被好奇心绑架。"
];

/* 按当前语言取物品名 / 描述 */
function isEn() { return typeof I18n !== "undefined" && I18n.getLang() === "en"; }
function trName(item) { return isEn() && item.nameEn ? item.nameEn : item.name; }
function trDesc(item) { return isEn() && item.descEn ? item.descEn : item.desc; }

/* ------------ 状态 ------------ */

let state = loadSave() || {
  curiosity: 0,
  totalEarned: 0,
  totalClicks: 0,
  clickAdd: 0,         // 来自 flat 升级的累加
  clickMult: 1,        // 来自 mult 升级的乘积
  upgrades: {},        // id -> 已购买次数（flat 类重复买）
  buildings: {},       // id -> 拥有数
  achievements: {},    // id -> true
  souls: 0,            // 反骨之魂（重生货币，每次重生最多 +5，跨周目保留）
  // 金币不在游戏存档里——金币是全站货币，存在账户 KV，通过 /api/me 读取、飞升时服务端发放
  prestigeCount: 0,
  goldenClicks: 0,     // 金色好奇点击次数
  eventsCompleted: 0,  // 完成的随机事件数
  ascensions: 0,       // Infinity 飞升次数（跨周目保留）
  stockoutCount: 0,    // 累计触发断货次数（跨周目保留）
  gotCert: false,      // 是否已领取过好奇心证书（跨周目保留，每账号仅一次）
  stockout: {},        // 商品 id -> 补货完成时间戳（断货机制，重生/重置清空）
  stockBuys: {},       // 商品 id -> 本轮已连续购买次数（达到阈值触发断货并清零）
  updatedAt: 0,        // 本地存档最后更新时间（用于本地/云端冲突合并）
};

let buffs = { clickFrenzy: 0, frenzyMult: 1 }; // 金色饼干增益（不存档）
let lastTick = performance.now();

/* ------------ 纯函数计算 ------------ */

function totalBuildings(s) {
  return Object.values(s.buildings).reduce((a, b) => a + b, 0);
}
function soulMult(s) {
  return 1 + s.souls * 0.01; // 每个灵魂 +1% 全局产出
}
function computeClickPower(s) {
  const base = (1 + s.clickAdd) * s.clickMult * soulMult(s);
  return Math.floor(base * 100) / 100;
}
function computeCPS(s) {
  let cps = 0;
  for (const b of BUILDINGS) {
    cps += b.base * (s.buildings[b.id] || 0);
  }
  return cps * soulMult(s);
}
function buildingCost(b, owned) {
  return Math.ceil(b.baseCost * Math.pow(1.15, owned));
}
function upgradeCost(u, bought) {
  return Math.ceil(u.baseCost * Math.pow(1.5, bought));
}
// 每次重生最多获得的反骨之魂（灵魂本身跨周目累积，不受此上限影响）
const SOULS_PER_PRESTIGE_CAP = 5;
// 灵魂总量硬上限（治愈旧版溢出坏档 / 防篡改）
const SOULS_HARD_CAP = 1e6;
// Infinity 飞升奖励
const ASCEND_COIN_REWARD = 20;

function soulsFor(totalEarned) {
  // Cookie Clicker 风格：每 1e6 累计产出给 1 个灵魂，带开方曲线
  // 每次重生最多 5 个；Infinity 周目直接给满 5
  if (!Number.isFinite(totalEarned)) return SOULS_PER_PRESTIGE_CAP;
  if (totalEarned < 1e6) return 0;
  return Math.min(SOULS_PER_PRESTIGE_CAP, Math.floor(Math.pow(totalEarned / 1e6, 0.5)));
}

// 是否到达 Infinity（飞升条件）
function reachedInfinity(s) {
  return !Number.isFinite(s.totalEarned) || !Number.isFinite(s.curiosity);
}

/* ---- 断货机制：每件商品有独立补货时长 ----
   普通商品（flat 升级 / 建筑）：30s~120s
   倍数升级（mult）：120s~300s
   时长由 id 哈希决定，每件商品固定且彼此不同 */
function hashId(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296; // 0~1
}
function stockDurationMs(item) {
  const r = hashId(item.id);
  if (item.type === "mult") return Math.round(120 + r * 180) * 1000; // 2~5 分钟
  return Math.round(30 + r * 90) * 1000;                              // 30s~2 分钟
}
/* 断货不是每次都触发：连续购买达到次数才断货，补货完成后计数清零重新累计。
   倍数升级 2~3 次就断；普通升级/建筑可以多买（6~12 次），次数由 id 哈希固定 */
function buysBeforeStockout(item) {
  const r = hashId(item.id);
  if (item.type === "mult") return 2 + Math.floor(r * 2); // 2~3 次
  return 6 + Math.floor(r * 7);                            // 6~12 次
}
function stockUntil(id) { return state.stockout[id] || 0; }
function isSoldOut(id) { return stockUntil(id) > Date.now(); }
// 登记一次购买：达到该商品的连买上限才进入断货（并清零计数），返回是否触发断货
function registerPurchase(item) {
  const n = (state.stockBuys[item.id] || 0) + 1;
  if (n >= buysBeforeStockout(item)) {
    state.stockout[item.id] = Date.now() + stockDurationMs(item);
    delete state.stockBuys[item.id];
    state.stockoutCount = (state.stockoutCount || 0) + 1;
    return true;
  }
  state.stockBuys[item.id] = n;
  return false;
}
// 距离断货还能买几次
function buysLeft(item) {
  return buysBeforeStockout(item) - (state.stockBuys[item.id] || 0);
}
function stockLeftText(id) {
  const s = Math.max(0, Math.ceil((stockUntil(id) - Date.now()) / 1000));
  const m = Math.floor(s / 60), sec = s % 60;
  return (m > 0 ? m + ":" + String(sec).padStart(2, "0") : sec + "s");
}

/* ------------ 存档（localStorage 本地实时备份 + 退出时云端保存，省请求） ------------ */

let currentUser = null;       // 当前登录用户名（null = 未登录）
let cloudDirty = false;       // 是否有未同步到云端的本地变更

// Infinity 序列化：JSON.stringify 会把 Infinity 变 null、NaN 变 null，
// 但 Infinity 是本游戏的飞升目标，必须能存盘
const INF_TOKEN = "__inf__";
function ser(s) {
  return JSON.stringify(s, (_k, v) => {
    if (typeof v === "number") {
      if (v === Infinity) return INF_TOKEN;
      if (Number.isNaN(v)) return 0; // NaN 一律落盘为 0
    }
    return v;
  });
}
function deser(str) {
  return JSON.parse(str, (_k, v) => (v === INF_TOKEN ? Infinity : v));
}

// 本地存档：实时写 localStorage（不产生网络请求），并标记云端待保存
function saveGame() {
  state.updatedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, ser(state)); } catch {}
  cloudDirty = true;
}

// 合并两份存档：updatedAt 较新的为主体（当前周目进度以新档为准），
// 只增不减的字段跨存档取最大值/并集，防止旧云端覆盖本地把反骨之魂刷掉。
// 注意：totalEarned/curiosity/buildings 等周目字段不取 max，
// 因为重生会清零它们，取 max 会导致重生后被旧档拉回、可重复刷魂。
function mergeSaves(a, b) {
  if (!a) return b;
  if (!b) return a;
  const [base, older] = (a.updatedAt || 0) >= (b.updatedAt || 0) ? [a, b] : [b, a];
  const m = Object.assign({}, base);
  m.souls           = Math.max(base.souls || 0, older.souls || 0);
  m.prestigeCount   = Math.max(base.prestigeCount || 0, older.prestigeCount || 0);
  m.totalClicks     = Math.max(base.totalClicks || 0, older.totalClicks || 0);
  m.goldenClicks    = Math.max(base.goldenClicks || 0, older.goldenClicks || 0);
  m.eventsCompleted = Math.max(base.eventsCompleted || 0, older.eventsCompleted || 0);
  m.ascensions      = Math.max(base.ascensions || 0, older.ascensions || 0);
  m.stockoutCount   = Math.max(base.stockoutCount || 0, older.stockoutCount || 0);
  m.gotCert         = base.gotCert || older.gotCert || false;
  // 断货时间戳取较早的（更早补货的那份更宽松，避免合并被拉长）
  m.stockout = Object.assign({}, base.stockout || {});
  for (const [k, t] of Object.entries(older.stockout || {})) {
    if (!(k in m.stockout) || t < m.stockout[k]) m.stockout[k] = t;
  }
  // 连买计数随较新档（base），旧档只补缺
  m.stockBuys = Object.assign({}, older.stockBuys || {}, base.stockBuys || {});
  // 成就并集（排除 _ 开头的"已看弹窗"临时标记，重生后这些弹窗允许重新触发）
  const ach = Object.assign({}, base.achievements || {});
  for (const [k, v] of Object.entries(older.achievements || {})) {
    if (!k.startsWith("_") && !(k in ach)) ach[k] = v;
  }
  m.achievements = ach;
  return m;
}

// 立即写云端（仅在关键节点使用：重生 / 重置 / 刚登录）
async function pushCloudSave() {
  if (!currentUser) return;
  cloudDirty = true;
  try {
    const res = await fetch("/api/dc/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ data: ser(state) }),
    });
    if (res.ok) cloudDirty = false;
  } catch { /* 网络失败不影响本地，退出时还会再存一次 */ }
}

// 退出 / 切后台时保存云端：sendBeacon 优先（页面卸载时最可靠），fetch keepalive 兜底
function saveCloudOnExit() {
  if (!currentUser || !cloudDirty) return;
  cloudDirty = false;
  const body = JSON.stringify({ data: ser(state) });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/dc/save", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {}
  try {
    fetch("/api/dc/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body,
    });
  } catch {}
}

// 存档归一化：补字段 + 治愈 NaN（Infinity 是合法的飞升状态，需保留）
function normalizeSave(s) {
  if (!s || typeof s !== "object") return null;
  // 必须有限：Infinity/NaN → 默认值
  const fin = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  // 允许 Infinity（飞升状态）：仅接受真正的 number +Infinity；
  // "Infinity"/"1e999" 等可转换字符串属于脏数据（合法 Infinity 经 deser 已是 number），按默认值处理
  const allowInf = (v, d = 0) => {
    if (v === Infinity) return Infinity;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  s.upgrades = s.upgrades || {};
  s.buildings = s.buildings || {};
  s.achievements = s.achievements || {};
  s.stockout = s.stockout && typeof s.stockout === "object" ? s.stockout : {};
  s.clickAdd = fin(s.clickAdd, 0);
  s.clickMult = fin(s.clickMult, 1) || 1;
  // 灵魂必须有限且不超过上限：治愈旧版溢出 bug 产生的 1e138 脏数据
  s.souls = Math.max(0, Math.min(SOULS_HARD_CAP, fin(s.souls, 0)));
  s.prestigeCount = Math.max(0, Math.floor(fin(s.prestigeCount, 0)));
  s.goldenClicks = Math.max(0, Math.floor(fin(s.goldenClicks, 0)));
  s.eventsCompleted = Math.max(0, Math.floor(fin(s.eventsCompleted, 0)));
  s.ascensions = Math.max(0, Math.floor(fin(s.ascensions, 0)));
  s.stockoutCount = Math.max(0, Math.floor(fin(s.stockoutCount, 0)));
  s.gotCert = !!s.gotCert;
  s.updatedAt = fin(s.updatedAt, 0);
  // 好奇心/累计产出：保留 Infinity（飞升目标），NaN 归 0
  s.curiosity = allowInf(s.curiosity, 0);
  s.totalEarned = allowInf(s.totalEarned, s.curiosity);
  s.totalClicks = Math.max(0, Math.floor(fin(s.totalClicks, 0)));
  // 治愈旧版误判：从未真正到过 ∞（当前两值均有限、也无飞升记录）却已领证书/解锁成就，撤销之
  if (s.gotCert && s.curiosity !== Infinity && s.totalEarned !== Infinity && s.ascensions === 0) {
    s.gotCert = false;
    if (s.achievements.reachinf) delete s.achievements.reachinf;
  }
  // 建筑/升级数量必须是非负整数，清掉 NaN/负数/Infinity
  for (const [k, v] of Object.entries(s.buildings)) {
    const n = Math.floor(fin(v, -1));
    if (n > 0) s.buildings[k] = n; else delete s.buildings[k];
  }
  for (const [k, v] of Object.entries(s.upgrades)) {
    const n = Math.floor(fin(v, -1));
    if (n > 0) s.upgrades[k] = n; else delete s.upgrades[k];
  }
  // 断货表：只留未来的合法时间戳；已断货的商品不计连买次数
  const now = Date.now();
  s.stockBuys = s.stockBuys && typeof s.stockBuys === "object" ? s.stockBuys : {};
  for (const [k, t] of Object.entries(s.stockout)) {
    if (!Number.isFinite(t) || t <= now) {
      delete s.stockout[k];
    } else {
      delete s.stockBuys[k];
    }
  }
  // 连买计数：1~12 的非负整数
  for (const [k, n] of Object.entries(s.stockBuys)) {
    const v = Math.floor(fin(n, 0));
    if (v > 0 && v <= 12) s.stockBuys[k] = v; else delete s.stockBuys[k];
  }
  return s;
}

async function loadCloudSave() {
  if (!currentUser) return null;
  try {
    const res = await fetch("/api/dc/save", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.data) return normalizeSave(deser(data.data));
  } catch {}
  return null;
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? normalizeSave(deser(raw)) : null;
  } catch { return null; }
}

/* ------------ DOM 引用 ------------ */

const btn = document.getElementById("dontClickBtn");
const hint = document.getElementById("dcHint");
const curEl = document.getElementById("curCount");
const cpEl = document.getElementById("clickPower");
const cpsEl = document.getElementById("cps");
const particles = document.getElementById("dcParticles");
const upgradesEl = document.getElementById("dcUpgrades");
const buildingsEl = document.getElementById("dcBuildings");
const soulsBox = document.getElementById("soulsBox");
const soulsEl = document.getElementById("souls");
const coinsBox = document.getElementById("coinsBox");
const coinsEl = document.getElementById("coins");
const prestigeBtn = document.getElementById("prestigeBtn");
const ascendBtn = document.getElementById("ascendBtn");
const golden = document.getElementById("dcGolden");

// 未登录提示条
const loginTip = document.getElementById("dcLoginTip");
const loginTipBtn = document.getElementById("dcLoginTipBtn");

// 成就弹窗
const achBtn = document.getElementById("achBtn");
const achModal = document.getElementById("achModal");
const achGrid = document.getElementById("achGrid");
const achProgress = document.getElementById("achProgress");
const achCountEl = document.getElementById("achCount");

// 随机事件
const evBox = document.getElementById("dcEvents");
const evTimer = document.getElementById("evTimer");
const evIcon = document.getElementById("evIcon");
const evName = document.getElementById("evName");
const evDesc = document.getElementById("evDesc");
const evBar = document.getElementById("evBar");
const evCount = document.getElementById("evCount");
const evReward = document.getElementById("evReward");

function unlockedCount() {
  return ACHIEVEMENTS.filter(a => state.achievements[a.id]).length;
}
function renderAchievements() {
  const unlocked = unlockedCount();
  achCountEl.textContent = `${unlocked}/${ACHIEVEMENTS.length}`;
  achProgress.textContent = I18n.t("dc.achProgress", { n: unlocked, total: ACHIEVEMENTS.length });
  achGrid.innerHTML = ACHIEVEMENTS.map(a => {
    const got = !!state.achievements[a.id];
    if (got) {
      return `<div class="ach-card ach-got">
        <div class="ach-icon">${a.icon}</div>
        <div class="ach-info">
          <div class="ach-name">${trName(a)}</div>
          <div class="ach-desc">${trDesc(a)}</div>
        </div>
      </div>`;
    }
    return `<div class="ach-card ach-locked">
      <div class="ach-icon">❔</div>
      <div class="ach-info">
        <div class="ach-name">${I18n.t("dc.lockedName")}</div>
        <div class="ach-desc">${a.hint}</div>
      </div>
    </div>`;
  }).join("");
}
achBtn.addEventListener("click", () => {
  renderAchievements();
  XRST.openMask(achModal);
});
document.getElementById("achClose").addEventListener("click", () => XRST.closeMask(achModal));

/* ------------ 排行榜（金币 / 反骨之魂 / 点击数） ------------ */

const lbBtn = document.getElementById("lbBtn");
const lbModal = document.getElementById("lbModal");
const lbList = document.getElementById("lbList");
const lbMe = document.getElementById("lbMe");
let lbData = null;
let lbTab = "coins";
const LB_TABS = {
  coins:  { icon: "🪙", label: "金币", key: "coins"  },
  souls:  { icon: "💜", label: "反骨之魂", key: "souls" },
  clicks: { icon: "👆", label: "次点击", key: "clicks" },
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function lbAvatar(a) {
  try { return window.XRST_AVATARS ? window.XRST_AVATARS.html(a || 0, "lb-avatar") : `<span class="lb-avatar lb-avatar-fallback">🐱</span>`; }
  catch { return `<span class="lb-avatar lb-avatar-fallback">🐱</span>`; }
}
function lbMedal(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return rank;
}
function fmtInt(n) { return Math.floor(n).toLocaleString("en-US"); }

function renderLbTab() {
  if (!lbData) return;
  const rows = lbData[lbTab] || [];
  const t = LB_TABS[lbTab];
  if (!rows.length) {
    lbList.innerHTML = `<div class="lb-empty">还没有人上榜，去当个第一吧！</div>`;
  } else {
    lbList.innerHTML = rows.map(r => `
      <div class="lb-row${lbData.me && r.username === lbData.me.username ? " lb-row-me" : ""}">
        <span class="lb-rank">${lbMedal(r.rank)}</span>
        ${lbAvatar(r.avatar)}
        <a class="lb-name" href="/profile/?u=${encodeURIComponent(r.username)}">${esc(r.username)}</a>
        <span class="lb-value">${fmtInt(r.value)} <i>${lbTab === "clicks" ? "次" : t.label}</i></span>
      </div>`).join("");
  }
  // 我的名次条（即使没进前 20 也展示）
  const me = lbData.me;
  if (me) {
    const rank = me.ranks[lbTab];
    const value = me[lbTab] || 0;
    lbMe.hidden = false;
    lbMe.innerHTML = rank
      ? `<span class="lb-rank">${lbMedal(rank)}</span><span class="lb-me-name">我</span><span class="lb-value">${fmtInt(value)} <i>${lbTab === "clicks" ? "次" : t.label}</i></span>`
      : `<span class="lb-rank">—</span><span class="lb-me-name">我</span><span class="lb-value">${fmtInt(value)} <i>${lbTab === "clicks" ? "次" : t.label}</i>（未上榜）</span>`;
  } else {
    lbMe.hidden = true;
    lbMe.innerHTML = "";
  }
}

async function openLeaderboard() {
  lbData = null;
  lbList.innerHTML = `<div class="lb-empty">加载中…</div>`;
  lbMe.hidden = true;
  XRST.openMask(lbModal);
  try {
    const res = await fetch("/api/dc/leaderboard", { credentials: "same-origin", cache: "no-store" });
    lbData = await res.json();
  } catch { lbData = { coins: [], souls: [], clicks: [], me: null }; }
  renderLbTab();
}

lbBtn.addEventListener("click", openLeaderboard);
document.getElementById("lbClose").addEventListener("click", () => XRST.closeMask(lbModal));
document.querySelectorAll("[data-lbtab]").forEach(tab => {
  tab.addEventListener("click", () => {
    lbTab = tab.dataset.lbtab;
    document.querySelectorAll("[data-lbtab]").forEach(t => t.classList.toggle("active", t === tab));
    renderLbTab();
  });
});

/* ------------ 好奇心证书（达到 ∞ 时生成，可下载纪念） ------------ */

const certModal = document.getElementById("certModal");

function showCertificate() {
  document.getElementById("certName").textContent = currentUser || "好奇探索者";
  document.getElementById("certClicks").textContent = I18n.t("dc.certClicks", { n: fmtInt(state.totalClicks) });
  document.getElementById("certSouls").textContent = I18n.t("dc.certSouls", { n: state.souls });
  document.getElementById("certReborn").textContent = I18n.t("dc.certReborn", { n: state.prestigeCount });
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  document.getElementById("certDate").textContent =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  XRST.openMask(certModal);
  saveGame(); pushCloudSave(); // gotCert 落盘
}

// 把证书绘制到 canvas 并下载为 PNG（不依赖 html2canvas）
function downloadCertificate() {
  const W = 1280, H = 900;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");

  // 背景渐变
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1a1033");
  bg.addColorStop(0.55, "#241642");
  bg.addColorStop(1, "#1a1033");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 顶部金色光晕
  const glow = ctx.createRadialGradient(W / 2, 60, 30, W / 2, 60, 500);
  glow.addColorStop(0, "rgba(251,191,36,0.18)");
  glow.addColorStop(1, "rgba(251,191,36,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 双层金边
  ctx.strokeStyle = "rgba(251,191,36,0.55)";
  ctx.lineWidth = 5;
  roundRect(ctx, 24, 24, W - 48, H - 48, 20);
  ctx.stroke();
  ctx.strokeStyle = "rgba(251,191,36,0.22)";
  ctx.lineWidth = 2;
  roundRect(ctx, 44, 44, W - 88, H - 88, 14);
  ctx.stroke();
  ctx.strokeStyle = "rgba(251,191,36,0.12)";
  roundRect(ctx, 58, 58, W - 116, H - 116, 10);
  ctx.stroke();

  // 印章
  ctx.font = "64px serif";
  ctx.textAlign = "center";
  ctx.fillText("🏵️", W / 2, 150);

  // 标题
  ctx.fillStyle = "#fbbf24";
  ctx.font = "900 56px system-ui, sans-serif";
  ctx.shadowColor = "rgba(251,191,36,0.5)";
  ctx.shadowBlur = 18;
  ctx.fillText("好奇心证书", W / 2, 245);
  ctx.shadowBlur = 0;

  // 副标题
  ctx.fillStyle = "rgba(242,240,247,0.5)";
  ctx.font = "15px system-ui, sans-serif";
  ctx.fillText("CERTIFICATE  OF  CURIOSITY", W / 2, 285);

  // 正文
  ctx.fillStyle = "rgba(242,240,247,0.72)";
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillText("本证书证明", W / 2, 360);

  // 用户名
  ctx.fillStyle = "#fde68a";
  ctx.font = "800 48px system-ui, sans-serif";
  const name = (currentUser || "好奇探索者").slice(0, 24);
  ctx.fillText(name, W / 2, 430);

  ctx.fillStyle = "rgba(242,240,247,0.78)";
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillText("在「不要点击这个按钮」中，", W / 2, 500);

  ctx.fillStyle = "#f2f0f7";
  ctx.font = "700 34px system-ui, sans-serif";
  ctx.fillText("好奇心达到了", W / 2, 560);

  ctx.fillStyle = "#fbbf24";
  ctx.font = "900 70px system-ui, sans-serif";
  ctx.shadowColor = "rgba(251,191,36,0.6)";
  ctx.shadowBlur = 20;
  ctx.fillText("∞", W / 2, 650);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(242,240,247,0.78)";
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillText("突破了数字的边界，触及好奇的尽头。", W / 2, 700);

  // 统计胶囊
  const chips = [
    `累计点击 ${fmtInt(state.totalClicks)} 次`,
    `反骨之魂 ${state.souls}`,
    `重生 ${state.prestigeCount} 次`,
  ];
  ctx.font = "18px system-ui, sans-serif";
  let cx = W / 2 - ((chips.length - 1) * 150);
  chips.forEach((t, i) => {
    drawChip(ctx, cx + i * 300, 770, t);
  });

  // 日期
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  ctx.fillStyle = "rgba(242,240,247,0.55)";
  ctx.font = "20px system-ui, sans-serif";
  ctx.fillText(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`, W / 2, 835);

  // 落款
  ctx.fillStyle = "rgba(251,191,36,0.6)";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText("✦  XRST.Uk  好奇心研究院  ✦", W / 2, 870);

  // 下载
  const link = document.createElement("a");
  link.download = `好奇心证书-${name}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.png`;
  link.href = cv.toDataURL("image/png");
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => document.body.removeChild(link), 1000);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawChip(ctx, x, y, text) {
  ctx.font = "18px system-ui, sans-serif";
  const w = ctx.measureText(text).width + 32;
  ctx.fillStyle = "rgba(251,191,36,0.06)";
  ctx.strokeStyle = "rgba(251,191,36,0.25)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, x - w / 2, y - 16, w, 32, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(251,191,36,0.88)";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y + 6);
}

document.getElementById("certDownload").addEventListener("click", downloadCertificate);
document.getElementById("certClose").addEventListener("click", () => XRST.closeMask(certModal));
// 已领过证书的玩家可随时从底部按钮回看/重新下载（未领过直接拦截，按钮本应隐藏，此为纵深兜底）
document.getElementById("certBtn")?.addEventListener("click", () => {
  if (!state.gotCert) {
    showToast(I18n.t("dc.toastCertNeed"), 2200);
    return;
  }
  showCertificate();
});

/* ------------ 随机事件系统 ------------ */

// 任务模板：gen(state) 返回 { target, reward }；desc({target}) 返回描述文字
// type 决定追踪哪项指标：clicks / passive / spent / buildings / crits / earned / upgrades
const TASK_TEMPLATES = [
  {
    id: "clicks", name: "蓝色好奇收集", nameEn: "Blue Curiosity Collection", icon: "🔵", type: "clicks",
    gen: s => {
      const cp = computeClickPower(s);
      const target = Math.max(15, Math.round(cp * 12 + 15));
      return { target, reward: Math.round(cp * target * 0.7 + 80) };
    },
    desc: t => `2 分钟内点击 ${t.target} 次按钮`,
    descEn: t => `Click the button ${t.target} times in 2 minutes`,
  },
  {
    id: "passive", name: "被动产能", nameEn: "Passive Production", icon: "⚙️", type: "passive",
    gen: s => {
      const cps = computeCPS(s);
      const target = Math.max(50, Math.round(cps * 60 + 50));
      return { target, reward: Math.round(target * 0.6 + 100) };
    },
    desc: t => `2 分钟内自动产出 ${fmt(t.target)} 好奇`,
    descEn: t => `Auto-produce ${fmt(t.target)} curiosity in 2 minutes`,
  },
  {
    id: "spend", name: "消费狂潮", nameEn: "Spending Spree", icon: "💸", type: "spent",
    gen: s => {
      const target = Math.max(100, Math.round(state.curiosity * 0.5 + 100));
      return { target, reward: Math.round(target * 0.5 + 100) };
    },
    desc: t => `2 分钟内在商店消费 ${fmt(t.target)} 好奇`,
    descEn: t => `Spend ${fmt(t.target)} curiosity in the shop in 2 minutes`,
  },
  {
    id: "buildings", name: "扩张计划", nameEn: "Expansion Plan", icon: "🏗️", type: "buildings",
    gen: s => {
      const target = Math.max(1, Math.min(10, Math.round(totalBuildings(s) * 0.2 + 2)));
      return { target, reward: Math.round(computeCPS(s) * 120 + 200) };
    },
    desc: t => `2 分钟内购买 ${t.target} 个建筑`,
    descEn: t => `Buy ${t.target} buildings in 2 minutes`,
  },
  {
    id: "crits", name: "暴击猎人", nameEn: "Crit Hunter", icon: "💥", type: "crits",
    gen: s => {
      const cp = computeClickPower(s);
      const target = Math.max(3, Math.round(cp * 0.3 + 3));
      return { target, reward: Math.round(cp * 30 + 150) };
    },
    desc: t => `2 分钟内打出 ${t.target} 次暴击`,
    descEn: t => `Land ${t.target} crits in 2 minutes`,
  },
  {
    id: "earned", name: "好奇爆发", nameEn: "Curiosity Surge", icon: "🌟", type: "earned",
    gen: s => {
      const cps = computeCPS(s);
      const cp = computeClickPower(s);
      const rate = cps + cp * 2;
      const target = Math.max(200, Math.round(rate * 40 + 200));
      return { target, reward: Math.round(target * 0.5 + 150) };
    },
    desc: t => `2 分钟内累计获得 ${fmt(t.target)} 好奇`,
    descEn: t => `Earn ${fmt(t.target)} curiosity total in 2 minutes`,
  },
  {
    id: "upgrades", name: "强化之路", nameEn: "Path of Enhancement", icon: "⬆️", type: "upgrades",
    gen: s => {
      const target = Math.max(1, Math.min(8, Math.round(Object.keys(s.upgrades).length * 0.3 + 1)));
      return { target, reward: Math.round(computeClickPower(s) * 40 + 100) };
    },
    desc: t => `2 分钟内购买 ${t.target} 次点击升级`,
    descEn: t => `Buy ${t.target} click upgrades in 2 minutes`,
  },
  {
    id: "fastclick", name: "手速挑战", nameEn: "Speed Challenge", icon: "⚡", type: "clicks",
    gen: s => {
      const target = Math.max(30, Math.round(computeClickPower(s) * 25 + 30));
      return { target, reward: Math.round(computeClickPower(s) * target * 0.9 + 120) };
    },
    desc: t => `2 分钟内疯狂点击 ${t.target} 次`,
    descEn: t => `Frenzy-click ${t.target} times in 2 minutes`,
  },
  {
    id: "bigspend", name: "一掷千金", nameEn: "Big Spender", icon: "💰", type: "spent",
    gen: s => {
      const target = Math.max(500, Math.round(state.curiosity * 1.2 + 500));
      return { target, reward: Math.round(target * 0.7 + 200) };
    },
    desc: t => `2 分钟内累计消费 ${fmt(t.target)} 好奇`,
    descEn: t => `Spend ${fmt(t.target)} curiosity total in 2 minutes`,
  },
  {
    id: "soulclick", name: "灵魂共鸣", nameEn: "Soul Resonance", icon: "✨", type: "earned",
    gen: s => {
      const mult = soulMult(s);
      const target = Math.max(300, Math.round(computeCPS(s) * 80 * mult + 300));
      return { target, reward: Math.round(target * 0.55 + 200) };
    },
    desc: t => `2 分钟内累计获得 ${fmt(t.target)} 好奇`,
    descEn: t => `Earn ${fmt(t.target)} curiosity total in 2 minutes`,
  },
];

let activeTask = null;       // 当前活动任务（运行时，不存档）
let nextTaskTimer = 8;       // 距离下一个任务刷新的秒数

function spawnTask() {
  if (activeTask) return;
  const tpl = TASK_TEMPLATES[Math.floor(Math.random() * TASK_TEMPLATES.length)];
  const { target, reward } = tpl.gen(state);
  activeTask = {
    id: tpl.id,
    tpl,
    name: trName(tpl),
    icon: tpl.icon,
    type: tpl.type,
    target,
    reward,
    progress: 0,
    timeLeft: 120,
  };
  evBox.hidden = false;
  evBox.classList.add("dc-events-pop");
  setTimeout(() => evBox.classList.remove("dc-events-pop"), 600);
  showToast(I18n.t("dc.toastEventStart", { name: activeTask.name }), 2500, "ok");
  renderTask();
}

function renderTask() {
  if (!activeTask) return;
  const tpl = activeTask.tpl;
  activeTask.name = trName(tpl);
  evIcon.textContent = activeTask.icon;
  evName.textContent = activeTask.name;
  evDesc.textContent = (isEn() && tpl.descEn ? tpl.descEn : tpl.desc)({ target: activeTask.target });
  evReward.textContent = I18n.t("dc.evReward", { n: fmt(activeTask.reward) });
  const pct = Math.min(100, (activeTask.progress / activeTask.target) * 100);
  evBar.style.width = pct + "%";
  evCount.textContent = `${fmt(Math.min(activeTask.progress, activeTask.target))}/${fmt(activeTask.target)}`;
  const m = Math.floor(activeTask.timeLeft / 60);
  const sec = Math.floor(activeTask.timeLeft % 60);
  evTimer.textContent = `${m}:${sec.toString().padStart(2, "0")}`;
  // 倒计时不足 15 秒变红
  evTimer.classList.toggle("urgent", activeTask.timeLeft < 15);
}

function trackTask(type, amount) {
  if (!activeTask || activeTask.type !== type) return;
  activeTask.progress += amount;
  if (activeTask.progress >= activeTask.target) {
    completeTask();
  } else {
    renderTask();
  }
}

function completeTask() {
  if (!activeTask) return;
  const reward = activeTask.reward;
  state.curiosity += reward;
  state.totalEarned += reward;
  state.eventsCompleted = (state.eventsCompleted || 0) + 1;
  showToast(I18n.t("dc.toastEventDone", { name: activeTask.name, n: fmt(reward) }), 3000, "ok");
  evBox.classList.add("dc-events-done");
  const finished = activeTask;
  activeTask = null;
  setTimeout(() => {
    evBox.classList.remove("dc-events-done");
    evBox.hidden = true;
    nextTaskTimer = 15 + Math.random() * 25; // 15~40 秒后刷新下一个
  }, 1600);
  // 避免 completed 引用残留影响判断
  void finished;
  renderStats();
  checkAchievements();
}

function expireTask() {
  if (!activeTask) return;
  showToast(I18n.t("dc.toastEventTimeout", { name: activeTask.name }), 2000);
  evBox.hidden = true;
  activeTask = null;
  nextTaskTimer = 10 + Math.random() * 20;
}

/* ------------ 渲染 ------------ */

function fmt(n) {
  // 非有限值兜底：Infinity 显示 ∞，NaN 显示 0
  if (!Number.isFinite(n)) return n > 0 ? "∞" : "0";
  if (n < 10) return (Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
  if (n < 1000) return Math.floor(n).toString();
  if (n < 1e6)  return (n / 1e3).toFixed(2) + "K";
  if (n < 1e9)  return (n / 1e6).toFixed(2) + "M";
  if (n < 1e12) return (n / 1e9).toFixed(2) + "B";
  if (n < 1e15) return (n / 1e12).toFixed(2) + "T";
  if (n < 1e18) return (n / 1e15).toFixed(2) + "Qa"; // 千兆
  if (n < 1e21) return (n / 1e18).toFixed(2) + "Qi"; // 百京
  if (n < 1e24) return (n / 1e21).toFixed(2) + "Sx";
  if (n < 1e27) return (n / 1e24).toFixed(2) + "Sp";
  if (n < 1e30) return (n / 1e27).toFixed(2) + "Oc";
  if (n < 1e33) return (n / 1e30).toFixed(2) + "No";
  if (n < 1e36) return (n / 1e33).toFixed(2) + "Dc";
  // 再大就用科学计数法，避免单位越造越多
  return n.toExponential(2).replace("e+", "e");
}

function renderStats() {
  curEl.textContent = fmt(state.curiosity);
  cpEl.textContent = fmt(computeClickPower(state));
  cpsEl.textContent = fmt(computeCPS(state));
  if (state.souls > 0) {
    soulsBox.hidden = false;
    soulsEl.textContent = state.souls;
  } else {
    soulsBox.hidden = true;
  }
  // 全站金币：登录后始终展示（余额来自 /api/me，不属于游戏存档）
  if (currentUser && meInfo) {
    coinsBox.hidden = false;
    coinsEl.textContent = meInfo.coins || 0;
  } else {
    coinsBox.hidden = true;
  }
  prestigeBtn.hidden = soulsFor(state.totalEarned) < 1 && state.prestigeCount === 0;
  if (state.prestigeCount > 0) prestigeBtn.hidden = false;
  // 到达 Infinity 后出现飞升入口
  if (ascendBtn) ascendBtn.hidden = !reachedInfinity(state);
  const certBtn = document.getElementById("certBtn");
  if (certBtn) certBtn.hidden = !state.gotCert;
}

function isUnlocked(item) {
  return state.totalEarned >= item.unlock;
}

// 已解锁过的商品 id（用于检测新解锁并弹 toast）
const knownUnlocked = new Set(
  [...UPGRADES, ...BUILDINGS].filter(isUnlocked).map(i => i.id)
);

function checkNewUnlocks() {
  for (const item of [...UPGRADES, ...BUILDINGS]) {
    if (!knownUnlocked.has(item.id) && isUnlocked(item)) {
      knownUnlocked.add(item.id);
      showToast(I18n.t("dc.toastUnlock", { name: trName(item) }), 2800, "ok");
    }
  }
}

// 返回列表中要展示的商品：已解锁的 + 紧随其后的最多 2 个未解锁（显示"？？？"）
function visibleItems(list) {
  const result = [];
  let mysteryCount = 0;
  for (const item of list) {
    if (isUnlocked(item)) {
      result.push({ item, locked: false });
      mysteryCount = 0;
    } else {
      if (mysteryCount < 2) {
        result.push({ item, locked: true });
        mysteryCount++;
      } else {
        break; // 更远的直接隐藏
      }
    }
  }
  return result;
}

function renderShop() {
  const lockedName = I18n.t("dc.lockedName");
  const soldOutText = I18n.t("dc.soldOut");
  // 点击升级
  upgradesEl.innerHTML = visibleItems(UPGRADES).map(({ item: u, locked }) => {
    if (locked) {
      return `<button class="dc-shop-item dc-locked" disabled>
        <div class="dc-shop-icon dc-icon-mystery">❔</div>
        <div class="dc-shop-info">
          <div class="dc-shop-name">${lockedName}</div>
          <div class="dc-shop-desc">${isEn() && u.hintEn ? u.hintEn : u.hint}</div>
        </div>
        <div class="dc-shop-meta">
          <div class="dc-shop-cost">${lockedName}</div>
        </div>
      </button>`;
    }
    const bought = state.upgrades[u.id] || 0;
    const cost = upgradeCost(u, bought);
    const soldOut = isSoldOut(u.id);
    const can = !soldOut && Number.isFinite(cost) && state.curiosity >= cost;
    const leftU = buysLeft(u);
    const warnU = leftU <= 2 ? `<div class="dc-shop-soon">${I18n.t("dc.stockoutWarn", { n: leftU })}</div>` : "";
    if (soldOut) {
      return `<button class="dc-shop-item dc-soldout" data-sid="${u.id}" disabled>
        <div class="dc-shop-icon">${u.icon}</div>
        <div class="dc-shop-info">
          <div class="dc-shop-name">${trName(u)}</div>
          <div class="dc-shop-desc">${soldOutText}</div>
        </div>
        <div class="dc-shop-meta">
          <div class="dc-shop-cost dc-restock">⏳ <span class="dc-cd">${stockLeftText(u.id)}</span></div>
        </div>
      </button>`;
    }
    return `<button class="dc-shop-item ${can ? "affordable" : ""}" data-upg="${u.id}" ${can ? "" : "disabled"}>
      <div class="dc-shop-icon">${u.icon}</div>
      <div class="dc-shop-info">
        <div class="dc-shop-name">${trName(u)}</div>
        <div class="dc-shop-desc">${trDesc(u)}</div>
      </div>
      <div class="dc-shop-meta">
        <div class="dc-shop-cost ${can ? "affordable" : ""}">${Number.isFinite(cost) ? fmt(cost) : "∞"}</div>
        ${warnU}
      </div>
    </button>`;
  }).join("");

  // 建筑
  buildingsEl.innerHTML = visibleItems(BUILDINGS).map(({ item: b, locked }) => {
    if (locked) {
      return `<button class="dc-shop-item dc-locked" disabled>
        <div class="dc-shop-icon dc-icon-mystery">❔</div>
        <div class="dc-shop-info">
          <div class="dc-shop-name">${lockedName}</div>
          <div class="dc-shop-desc">${isEn() && b.hintEn ? b.hintEn : b.hint}</div>
        </div>
        <div class="dc-shop-meta">
          <div class="dc-shop-cost">${lockedName}</div>
        </div>
      </button>`;
    }
    const owned = state.buildings[b.id] || 0;
    const cost = buildingCost(b, owned);
    const soldOut = isSoldOut(b.id);
    if (soldOut) {
      return `<button class="dc-shop-item dc-soldout" data-sid="${b.id}" disabled>
        <div class="dc-shop-icon">${b.icon}</div>
        <div class="dc-shop-info">
          <div class="dc-shop-name">${trName(b)}</div>
          <div class="dc-shop-desc">${soldOutText}</div>
        </div>
        <div class="dc-shop-meta">
          <div class="dc-shop-cost dc-restock">⏳ <span class="dc-cd">${stockLeftText(b.id)}</span></div>
        </div>
      </button>`;
    }
    const can = Number.isFinite(cost) && state.curiosity >= cost;
    const leftB = buysLeft(b);
    const warnB = leftB <= 2 ? `<div class="dc-shop-soon">${I18n.t("dc.stockoutWarn", { n: leftB })}</div>` : "";
    return `<button class="dc-shop-item ${can ? "affordable" : ""}" data-bld="${b.id}" ${can ? "" : "disabled"}>
      <div class="dc-shop-icon">${b.icon}</div>
      <div class="dc-shop-info">
        <div class="dc-shop-name">${trName(b)}</div>
        <div class="dc-shop-desc">${trDesc(b)}</div>
      </div>
      <div class="dc-shop-meta">
        <div class="dc-shop-cost ${can ? "affordable" : ""}">${Number.isFinite(cost) ? fmt(cost) : "∞"}</div>
        <div class="dc-shop-owned">×${owned}</div>
        ${warnB}
      </div>
    </button>`;
  }).join("");
}

/* ------------ 交互效果 ------------ */

function spawnFloat(x, y, text, crit) {
  const el = document.createElement("div");
  el.className = "dc-float" + (crit ? " crit" : "");
  el.textContent = text;
  el.style.left = x + "px";
  el.style.top = y + "px";
  particles.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function spawnParticles(x, y, color) {
  for (let i = 0; i < 8; i++) {
    const p = document.createElement("div");
    p.className = "dc-particle";
    p.style.left = x + "px";
    p.style.top = y + "px";
    p.style.background = color;
    const ang = (Math.PI * 2 * i) / 8 + Math.random() * 0.4;
    const dist = 40 + Math.random() * 30;
    p.style.setProperty("--dx", Math.cos(ang) * dist + "px");
    p.style.setProperty("--dy", Math.sin(ang) * dist + "px");
    particles.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
}

/* ------------ 点击逻辑 ------------ */

btn.addEventListener("click", e => {
  const isCrit = Math.random() < 0.07;
  let gain = computeClickPower(state);
  if (isCrit) gain = Math.floor(gain * 7);
  if (buffs.clickFrenzy > 0) gain = Math.floor(gain * buffs.frenzyMult);

  state.curiosity += gain;
  state.totalEarned += gain;
  state.totalClicks += 1;

  // 随机事件追踪
  trackTask("clicks", 1);
  trackTask("earned", gain);
  if (isCrit) trackTask("crits", 1);

  // 提示语
  const idx = Math.min(TAUNTS.length - 1, Math.floor((state.totalClicks - 1) / 5));
  hint.textContent = I18n.t(`dc.taunt${idx}`, { n: state.totalClicks });

  // 特效
  const rect = btn.getBoundingClientRect();
  const wrapRect = particles.getBoundingClientRect();
  const cx = rect.left - wrapRect.left + rect.width / 2;
  const cy = rect.top - wrapRect.top + rect.height / 2;
  spawnFloat(cx - 16, cy - 10, `+${fmt(gain)}`, isCrit);
  spawnParticles(cx, cy, isCrit ? "#fbbf24" : "#f87171");
  if (isCrit) {
    btn.classList.remove("crit");
    void btn.offsetWidth;
    btn.classList.add("crit");
  }

  checkMilestones(state.totalClicks);
  checkAchievements();
  renderStats();
  renderShop();
});

/* ------------ 里程碑弹窗 ------------ */

const modal114 = document.getElementById("milestone114");
const modal1000 = document.getElementById("milestone1000");
document.querySelectorAll("[data-close114]").forEach(b =>
  b.addEventListener("click", () => XRST.closeMask(modal114)));
document.querySelectorAll("[data-close1000]").forEach(b =>
  b.addEventListener("click", () => XRST.closeMask(modal1000)));

function checkMilestones(n) {
  if (n >= 114 && !state.achievements._m114) {
    state.achievements._m114 = true;
    XRST.openMask(modal114);
  }
  if (n >= 1000 && !state.achievements._m1000) {
    state.achievements._m1000 = true;
    XRST.openMask(modal1000);
  }
}

/* ------------ 成就 ------------ */

function checkAchievements() {
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (!state.achievements[a.id] && a.check(state)) {
      state.achievements[a.id] = true;
      changed = true;
      showToast(I18n.t("dc.toastAch", { name: trName(a), desc: trDesc(a) }), 3200, "ok");
      // 首次触及 ∞：弹出好奇心证书（每账号仅一次；严格校验当前好奇心为 +Infinity）
      if (a.id === "reachinf" && !state.gotCert && state.curiosity === Infinity) {
        state.gotCert = true;
        // 延迟期间可能被云档合并等拉回有限值：弹出前再校验一次，不满足就撤销标记
        setTimeout(() => {
          if (state.curiosity === Infinity) showCertificate();
          else state.gotCert = false;
        }, 900);
      }
    }
  }
  if (changed) achCountEl.textContent = `${unlockedCount()}/${ACHIEVEMENTS.length}`;
}

/* ------------ 商店购买 ------------ */

upgradesEl.addEventListener("click", e => {
  const item = e.target.closest("[data-upg]");
  if (!item) return;
  const u = UPGRADES.find(x => x.id === item.dataset.upg);
  if (isSoldOut(u.id)) return;
  const bought = state.upgrades[u.id] || 0;
  const cost = upgradeCost(u, bought);
  if (!Number.isFinite(cost) || state.curiosity < cost) return;
  state.curiosity -= cost;
  state.upgrades[u.id] = bought + 1;
  if (u.type === "flat") state.clickAdd += u.value;
  else state.clickMult *= u.value;
  // 连买达到该商品上限才进入断货（倍数 2~3 次，普通 6~12 次），补货后可再买
  const soldOutNow = registerPurchase(u);
  // 随机事件追踪
  trackTask("upgrades", 1);
  trackTask("spent", cost);
  showToast(I18n.t(soldOutNow ? "dc.toastUpgradeSoldOut" : "dc.toastUpgrade", { name: trName(u) }), 1500);
  renderStats();
  renderShop();
  checkAchievements();
});

buildingsEl.addEventListener("click", e => {
  const item = e.target.closest("[data-bld]");
  if (!item) return;
  const b = BUILDINGS.find(x => x.id === item.dataset.bld);
  if (isSoldOut(b.id)) return;
  const owned = state.buildings[b.id] || 0;
  const cost = buildingCost(b, owned);
  if (!Number.isFinite(cost) || state.curiosity < cost) return;
  state.curiosity -= cost;
  state.buildings[b.id] = owned + 1;
  // 连买达到上限（6~12 次）才进入断货
  const soldOutNow = registerPurchase(b);
  // 随机事件追踪
  trackTask("buildings", 1);
  trackTask("spent", cost);
  showToast(I18n.t(soldOutNow ? "dc.toastBuySoldOut" : "dc.toastBuy", { name: trName(b) }), 1200);
  renderStats();
  renderShop();
  checkAchievements();
});

/* ------------ 主循环（每秒产出） ------------ */

function tick() {
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  if (dt > 0 && dt < 5) { // 切后台太久就不算（防刷）
    const gain = computeCPS(state) * dt;
    state.curiosity += gain;
    state.totalEarned += gain;
    // 随机事件追踪（被动产出 / 累计获得）
    if (activeTask) {
      if (activeTask.type === "passive") trackTask("passive", gain);
      if (activeTask.type === "earned") trackTask("earned", gain);
    }
  }

  // 随机事件倒计时 / 刷新
  if (activeTask) {
    activeTask.timeLeft -= dt;
    if (activeTask.timeLeft <= 0) {
      expireTask();
    } else {
      renderTask();
    }
  } else {
    nextTaskTimer -= dt;
    if (nextTaskTimer <= 0) spawnTask();
  }

  // 增益倒计时
  if (buffs.clickFrenzy > 0) {
    buffs.clickFrenzy -= dt;
    if (buffs.clickFrenzy <= 0) {
      buffs.clickFrenzy = 0;
      buffs.frenzyMult = 1;
      removeBuffBanner();
    }
  }

  // 金色好奇刷新
  if (golden.hidden) {
    golden._timer = (golden._timer || 0) - dt;
    if (golden._timer <= 0) spawnGolden();
  }

  renderStats();
  renderShopAffordable();
  // 有新商品解锁时整列表重渲染（"？？？"变真身）
  const before = knownUnlocked.size;
  checkNewUnlocks();
  if (knownUnlocked.size > before) renderShop();
  checkAchievements();
}

function renderShopAffordable() {
  // 断货倒计时：更新文案；时间到了整列表重渲染一次恢复可购买
  let restocked = false;
  document.querySelectorAll(".dc-soldout[data-sid]").forEach(item => {
    const id = item.dataset.sid;
    const cd = item.querySelector(".dc-cd");
    if (!isSoldOut(id)) { restocked = true; return; }
    if (cd) cd.textContent = stockLeftText(id);
  });
  if (restocked) { renderShop(); return; }

  // 只更新可用状态（不重绘避免闪烁），locked / soldout 项跳过
  document.querySelectorAll(".dc-shop-item").forEach(item => {
    if (item.classList.contains("dc-locked") || item.classList.contains("dc-soldout")) return;
    const costEl = item.querySelector(".dc-shop-cost");
    let cost;
    if (item.dataset.upg) {
      const u = UPGRADES.find(x => x.id === item.dataset.upg);
      cost = upgradeCost(u, state.upgrades[u.id] || 0);
    } else {
      const b = BUILDINGS.find(x => x.id === item.dataset.bld);
      cost = buildingCost(b, state.buildings[b.id] || 0);
    }
    const can = Number.isFinite(cost) && state.curiosity >= cost;
    item.disabled = !can;
    item.classList.toggle("affordable", can);
    if (costEl) costEl.classList.toggle("affordable", can);
  });
}

/* ------------ 金色好奇饼干 ------------ */

function spawnGolden() {
  golden.hidden = false;
  golden.textContent = "❓";
  // 随机位置（避开边缘）
  const x = 60 + Math.random() * (window.innerWidth - 160);
  const y = 120 + Math.random() * (window.innerHeight - 240);
  golden.style.left = x + "px";
  golden.style.top = y + "px";
  golden._expire = setTimeout(() => { golden.hidden = true; scheduleGolden(); }, 13000);
}
function scheduleGolden() {
  golden._timer = 60 + Math.random() * 90; // 60~150 秒
}
golden.addEventListener("click", () => {
  if (golden.hidden) return; // 已隐藏/已领取，直接拦截（防刷）
  clearTimeout(golden._expire);
  golden.hidden = true;
  scheduleGolden();
  state.goldenClicks = (state.goldenClicks || 0) + 1;
  const cps = computeCPS(state);
  const roll = Math.random();
  if (roll < 0.4 || cps < 1) {
    // 直接给一大笔好奇
    const bonus = Math.max(13, Math.floor(cps * 30) + 13);
    state.curiosity += bonus;
    state.totalEarned += bonus;
    showToast(I18n.t("dc.toastGolden", { n: fmt(bonus) }), 2500, "ok");
  } else {
    // 点击狂热 30 秒
    buffs.clickFrenzy = 30;
    buffs.frenzyMult = 7;
    showBuffBanner(I18n.t("dc.toastFrenzyBanner"));
    showToast(I18n.t("dc.toastFrenzy"), 2000, "ok");
  }
  renderStats();
  checkAchievements();
});

let bannerEl = null;
function showBuffBanner(text) {
  removeBuffBanner();
  bannerEl = document.createElement("div");
  bannerEl.className = "dc-buff-banner";
  bannerEl.textContent = text;
  document.body.appendChild(bannerEl);
}
function removeBuffBanner() {
  if (bannerEl) { bannerEl.remove(); bannerEl = null; }
}

/* ------------ 重生（Prestige） / Infinity 飞升 ------------ */

// 周目重置：清空好奇/建筑/升级/断货，保留灵魂、金币、成就
function resetRun() {
  state.curiosity = 0;
  state.totalEarned = 0;
  state.clickAdd = 0;
  state.clickMult = 1;
  state.upgrades = {};
  state.buildings = {};
  state.stockout = {}; // 重生刷新所有断货
  state.stockBuys = {}; // 连买计数一并清零
  state.achievements = Object.fromEntries(
    Object.entries(state.achievements).filter(([k]) => !k.startsWith("_")) // 保留成就，仅清弹窗标记
  );
}

const prestigeConfirm = document.getElementById("prestigeConfirm");
const prestigeText = document.getElementById("prestigeText");
prestigeBtn.addEventListener("click", () => {
  const souls = soulsFor(state.totalEarned);
  prestigeText.innerHTML = I18n.t("dc.prestigeText", { souls, cap: SOULS_PER_PRESTIGE_CAP });
  XRST.openMask(prestigeConfirm);
});
document.getElementById("prestigeCancel").addEventListener("click", () => XRST.closeMask(prestigeConfirm));
document.getElementById("prestigeOk").addEventListener("click", () => {
  const souls = soulsFor(state.totalEarned);
  if (souls < 1) return;
  state.souls = Math.min(SOULS_HARD_CAP, (state.souls || 0) + souls);
  state.prestigeCount += 1;
  resetRun();
  showToast(I18n.t("dc.toastRebirth", { n: souls }), 3000, "ok");
  XRST.closeMask(prestigeConfirm);
  renderStats();
  renderShop();
  checkAchievements();
  // 重生是关键节点，立即同步云端防止灵魂丢失
  saveGame();
  pushCloudSave();
});

/* ---- Infinity 飞升：到 Infinity 后可选，服务端校验并发 20 全站金币 ---- */
const ascendConfirm = document.getElementById("ascendConfirm");
const ascendText = document.getElementById("ascendText");
const ascendOkBtn = document.getElementById("ascendOk");
ascendBtn?.addEventListener("click", () => {
  if (!reachedInfinity(state)) return;
  if (!currentUser) {
    showToast(I18n.t("dc.toastAscendNeedLogin"), 2500);
    openAuthModal();
    return;
  }
  const souls = soulsFor(state.totalEarned);
  const soulsSuffix = souls > 0 ? ` 和 <b style="color:#fbbf24">${souls}</b> 个反骨之魂` : "";
  ascendText.innerHTML = I18n.t("dc.ascendText", { coins: ASCEND_COIN_REWARD, soulsSuffix });
  XRST.openMask(ascendConfirm);
});
document.getElementById("ascendCancel")?.addEventListener("click", () => XRST.closeMask(ascendConfirm));
ascendOkBtn?.addEventListener("click", async () => {
  if (!reachedInfinity(state) || !currentUser) return;
  ascendOkBtn.disabled = true;
  ascendOkBtn.textContent = I18n.t("dc.toastAscending");
  const souls = soulsFor(state.totalEarned);
  // 1) 先把 Infinity 存档推上云端（服务端要据此校验）
  await pushCloudSave();
  // 2) 本地构造飞升后存档
  state.souls = Math.min(SOULS_HARD_CAP, (state.souls || 0) + souls);
  state.prestigeCount += 1;
  state.ascensions = (state.ascensions || 0) + 1;
  resetRun();
  // 3) 服务端原子校验 + 发币 + 落库
  let d = null;
  try {
    const res = await fetch("/api/dc/ascend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ data: ser(state) }),
    });
    d = await res.json().catch(() => null);
  } catch { d = null; }

  if (d && d.ok) {
    cloudDirty = false; // 服务端已写入飞升后存档
    saveGame();        // 本地备份
    if (typeof d.coins === "number" && meInfo) meInfo.coins = d.coins;
    window.dispatchEvent(new Event("coins-changed")); // 通知全站其他组件刷新金币
    const ascendMsg = souls
      ? I18n.t("dc.toastAscendWithSouls", { n: ASCEND_COIN_REWARD, souls })
      : I18n.t("dc.toastAscend", { n: ASCEND_COIN_REWARD });
    showToast(ascendMsg, 3500, "ok");
    XRST.closeMask(ascendConfirm);
    renderStats();
    renderShop();
    checkAchievements();
  } else {
    // 校验失败（云端还没同步/网络异常）：从云端恢复，保留 Infinity 状态让玩家重试
    const cloud = await loadCloudSave();
    if (cloud) { state = cloud; saveGame(); }
    showToast((d && d.error) ? I18n.t("dc.toastAscendFailedWith", { msg: d.error }) : I18n.t("dc.toastAscendFailed"), 3000);
    renderStats();
    renderShop();
  }
  ascendOkBtn.disabled = false;
  ascendOkBtn.textContent = I18n.t("dc.ascendOk");
});

/* ------------ 重置 ------------ */

const resetConfirm = document.getElementById("resetConfirm");
document.getElementById("resetBtn").addEventListener("click", () => XRST.openMask(resetConfirm));
document.getElementById("resetCancel").addEventListener("click", () => XRST.closeMask(resetConfirm));
document.getElementById("resetOk").addEventListener("click", () => {
  localStorage.removeItem(SAVE_KEY);
  state = { curiosity: 0, totalEarned: 0, totalClicks: 0, clickAdd: 0, clickMult: 1,
            upgrades: {}, buildings: {}, achievements: {}, souls: 0, prestigeCount: 0,
            goldenClicks: 0, eventsCompleted: 0, ascensions: 0, stockoutCount: 0, gotCert: false,
            stockout: {}, stockBuys: {}, updatedAt: 0 };
  hint.textContent = I18n.t("dc.hint");
  // 清除当前随机事件
  if (activeTask) { evBox.hidden = true; activeTask = null; }
  nextTaskTimer = 8;
  XRST.closeMask(resetConfirm);
  showToast(I18n.t("dc.toastReset"));
  renderStats();
  renderShop();
  // 关键节点立即覆盖云端，避免云端旧进度在下次登录时被拉回来
  saveGame();
  pushCloudSave();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !resetConfirm.hidden) XRST.closeMask(resetConfirm);
  if (e.key === "Escape" && !prestigeConfirm.hidden) XRST.closeMask(prestigeConfirm);
  if (e.key === "Escape" && ascendConfirm && !ascendConfirm.hidden) XRST.closeMask(ascendConfirm);
  if (e.key === "Escape" && !lbModal.hidden) XRST.closeMask(lbModal);
});

/* ------------ PCL 彩蛋（保留） ------------ */

const pclBtn = document.getElementById("pclBtn");
const pclWarn = document.getElementById("pclWarn");
pclBtn?.addEventListener("click", () => XRST.openMask(pclWarn));
const PCL_REPOS = [
  "https://github.com/CylorineStudio/PCL.Mac.Refactor",
  "https://github.com/Hex-Dragon/PCL2",
  "https://github.com/PCL-Community/PCL-CE",
  "https://github.com/PCL-Community"
];
pclWarn?.addEventListener("click", e => {
  if (e.target.closest("[data-pclgo]")) {
    XRST.closeMask(pclWarn);
    showToast(I18n.t("dc.toastPcl"), 1800);
    setTimeout(() => { window.location.href = PCL_REPOS[Math.floor(Math.random() * PCL_REPOS.length)]; }, 1200);
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && pclWarn && !pclWarn.hidden) XRST.closeMask(pclWarn);
});

/* ------------ 登录提示条 ------------ */

loginTipBtn?.addEventListener("click", () => {
  if (typeof openAuthModal === "function") openAuthModal();
});

let appStarted = false; // 启动初始化完成前，忽略 main.js 初次派发的 auth-user 事件
let meInfo = null;      // /api/me 完整信息（含全站金币 coins）

// 拉取全站账户信息；返回用户名或 null
async function fetchMe() {
  try {
    const res = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) { meInfo = null; return null; }
    const d = await res.json();
    meInfo = d && d.username ? d : null;
    renderStats();
    return meInfo ? meInfo.username : null;
  } catch { meInfo = null; return null; }
}

// 签到/商店等其他页面逻辑改了金币时，同步本页显示
window.addEventListener("coins-changed", () => { fetchMe(); });

// 拿到云端存档后统一处理：与本地合并而非直接覆盖，
// 本地领先（含旧云端缺失的反骨之魂等）时立即回推云端
async function applyCloudSave(cloud) {
  if (cloud) {
    const localTime = state.updatedAt || 0;
    // 合并会取 gotCert 或集、成就并集，可能把云端的旧误标并回来，合并后必须再归一化+自愈一次
    state = normalizeSave(mergeSaves(state, cloud));
    saveGame(); // 合并结果写回本地备份
    renderStats();
    renderShop();
    checkAchievements();
    // 本地比云端新（上次退出时云端没存上），立即补推，云端保持最新
    if (localTime > (cloud.updatedAt || 0)) await pushCloudSave();
    return true;
  }
  // 云端无存档，立即把本地进度上传
  await pushCloudSave();
  return false;
}

// 页面使用过程中登录 / 登出（启动阶段的登录态由 init 统一处理）
window.addEventListener("auth-user", async e => {
  if (!appStarted) return;
  const user = e.detail;
  if (user && !currentUser) {
    currentUser = user;
    loginTip.hidden = true;
    await fetchMe(); // 拿到全站金币余额
    const cloud = await loadCloudSave();
    const hadCloud = await applyCloudSave(cloud);
    showToast(hadCloud ? `已同步 ${user} 的云端进度` : `已登录为 ${user}，进度将保存到云端`, 2000, "ok");
  } else if (!user && currentUser) {
    // 刚登出：先确保进度已存，再回到游客模式
    currentUser = null;
    meInfo = null;
    loginTip.hidden = false;
    renderStats();
  }
});

/* ------------ 启动：必须先拿到云端存档，再启动游戏循环 ------------ */

async function init() {
  // 本地存档先渲染一帧，随后与云端合并
  renderStats();
  renderShop();

  const user = await fetchMe();

  if (user) {
    currentUser = user;
    loginTip.hidden = true;
    const cloud = await loadCloudSave();
    await applyCloudSave(cloud);
  } else {
    loginTip.hidden = false;
  }

  // 云端同步完成后再启动循环，避免本地旧数据先跑起来
  renderStats();
  renderShop();
  scheduleGolden();
  setInterval(tick, 100);
  setInterval(saveGame, 5000); // 仅写 localStorage，无网络请求
  checkAchievements();
  appStarted = true;
}

// 退出 / 切后台时把进度存到云端（一次请求，sendBeacon 保证卸载时送达）
window.addEventListener("pagehide", () => { saveGame(); saveCloudOnExit(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveGame(); saveCloudOnExit();
  } else if (currentUser) {
    fetchMe(); // 回到页面时刷新全站金币余额（可能在别的页面签到/消费过）
  }
});

init();

/* 语言切换：重渲染静态文案 + 提示语 + 商店 */
window.addEventListener("lang-changed", () => {
  if (typeof I18n === "undefined") return;
  I18n.applyTo(document);
  // 提示语重置为默认
  const dcHint = document.getElementById("dcHint");
  if (dcHint && state.totalClicks === 0) dcHint.textContent = I18n.t("dc.hint");
  renderStats();
  renderShop();
  renderTask();
});
