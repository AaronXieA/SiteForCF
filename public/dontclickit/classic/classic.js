/* =====================================================
 * DontClick · 仿 Cookie Clicker 放置游戏
 * 主题：好奇心害死猫 —— 货币叫"好奇心"
 * 特性：点击升级 / 自动产出建筑 / 暴击 / 金色好奇 /
 *       成就系统 / 重生(灵魂加成) / 本地存档
 * ===================================================== */

// 🏺 怀旧版：独立本地存档槽，与新版互不干扰
const SAVE_KEY = "xrst_dontclick_classic_v1";
const MAIN_SAVE_KEY = "xrst_dontclick_save_v3"; // 旧版（现主槽）键名，仅用于首次迁移
const CLOUD_SLOT = "classic";
const MIGRATE_FLAG = "xrst_dc_classic_migrated";

/* ------------ 静态数据 ------------ */

// 点击升级：type=flat 加每次点击；type=mult 乘当前点击力
// unlock = 累计好奇心达到该值时解锁显示；hint = 未解锁时的模糊线索
const UPGRADES = [
  { id: "claws",   icon: "🐾", name: "锋利的爪子",    desc: "每次点击 +1",       type: "flat",  value: 1,    baseCost: 15,    unlock: 0,    hint: "让你点得更用力的小工具" },
  { id: "catnip",  icon: "🌿", name: "猫薄荷",        desc: "每次点击 +3",       type: "flat",  value: 3,    baseCost: 250,   unlock: 120,  hint: "让猫咪更兴奋的绿色植物" },
  { id: "double",  icon: "✌️", name: "双倍好奇",      desc: "点击力 ×2",         type: "mult",  value: 2,    baseCost: 1200,  unlock: 600,  hint: "一只手不够就用两只" },
  { id: "triple",  icon: "🤜", name: "三连击",        desc: "点击力 ×1.5",       type: "mult",  value: 1.5,  baseCost: 12000, unlock: 6000, hint: "据说能打出三倍的快感" },
  { id: "amp",     icon: "📡", name: "好奇放大器",    desc: "点击力 ×2",         type: "mult",  value: 2,    baseCost: 130000,unlock: 65000,hint: "把你的好奇信号放大一万倍" },
  { id: "aura",    icon: "😈", name: "作死光环",      desc: "点击力 ×3",         type: "mult",  value: 3,    baseCost: 1.4e6, unlock: 700000,hint: "连恶魔都甘拜下风的作死气场" },
  { id: "quantum", icon: "⚛️", name: "量子双击",      desc: "点击力 ×4",         type: "mult",  value: 4,    baseCost: 20e6,  unlock: 10e6, hint: "在平行宇宙同时点两下" },
  { id: "luck",    icon: "🍀", name: "幸运猫爪",      desc: "点击力 ×2",         type: "mult",  value: 2,    baseCost: 330e6, unlock: 165e6,hint: "传说摸到它会有好事发生" },
  { id: "chaos",   icon: "🌀", name: "混沌之手",      desc: "点击力 ×3",         type: "mult",  value: 3,    baseCost: 5e9,   unlock: 2.5e9,hint: "熵增之神握住了你的手" },
  { id: "divine",  icon: "✨", name: "神圣一指",      desc: "点击力 ×5",         type: "mult",  value: 5,    baseCost: 75e9,  unlock: 38e9, hint: "被神明祝福过的食指" },
  { id: "cosmic",  icon: "🌠", name: "宇宙之力",      desc: "点击力 ×10",        type: "mult",  value: 10,   baseCost: 1e12,  unlock: 500e9,hint: "借用整个星系的能量" },
  { id: "omega",   icon: "♾️", name: "终极好奇",      desc: "点击力 ×20",        type: "mult",  value: 20,   baseCost: 150e12,unlock: 75e12, hint: "好奇的尽头，传说之物" },
  { id: "fold",    icon: "🪐", name: "时空折叠",      desc: "点击力 ×15",        type: "mult",  value: 15,   baseCost: 2e15,  unlock: 1e15,  hint: "把四维空间折成二维来按" },
  { id: "dbreak",  icon: "💎", name: "维度破碎",      desc: "点击力 ×25",        type: "mult",  value: 25,   baseCost: 30e15, unlock: 15e15, hint: "一拳打碎十一维空间" },
  { id: "multi",   icon: "🌌", name: "多元宇宙",      desc: "点击力 ×40",        type: "mult",  value: 40,   baseCost: 500e15,unlock: 250e15,hint: "在每个平行宇宙都按一下" },
  { id: "string",  icon: "〰️", name: "超弦振动",      desc: "点击力 ×60",        type: "mult",  value: 60,   baseCost: 8e18,  unlock: 4e18,  hint: "拨动宇宙的琴弦" },
  { id: "genesis", icon: "🖐️", name: "创世之手",      desc: "点击力 ×100",       type: "mult",  value: 100,  baseCost: 150e18,unlock: 75e18, hint: "据说神就是这样创造世界的" },
  { id: "chaoslaw",icon: "🔮", name: "混沌法则",      desc: "点击力 ×150",       type: "mult",  value: 150,  baseCost: 3e21,  unlock: 1.5e21,hint: "改写物理常数只为按一下" },
  { id: "paradox", icon: "🌀", name: "无限悖论",      desc: "点击力 ×250",       type: "mult",  value: 250,  baseCost: 60e21, unlock: 30e21, hint: "按下的瞬间既存在又不存在" },
  { id: "will",    icon: "👁️", name: "终极意志",      desc: "点击力 ×500",       type: "mult",  value: 500,  baseCost: 1.2e24,unlock: 600e21,hint: "一念之间，万物皆按" },
  { id: "absolute",icon: "🌟", name: "绝对存在",      desc: "点击力 ×1000",      type: "mult",  value: 1000, baseCost: 3e26,  unlock: 1.5e24,hint: "超越一切的终极点击" },
  { id: "infinity",icon: "∞",  name: "永动机",        desc: "每次点击 +10000",   type: "flat",  value: 10000,baseCost: 5e28,  unlock: 2.5e24,hint: "永远停不下来的齿轮" },
];

// 建筑：每秒产出 base * owned。unlock = 累计好奇阈值；hint = 未解锁线索
const BUILDINGS = [
  { id: "cat",    icon: "🐱", name: "好奇小猫",      desc: "每秒 +0.1 好奇",    base: 0.1,    baseCost: 15,     unlock: 0,      hint: "总爱伸爪戳东西的小家伙" },
  { id: "crowd",  icon: "👥", name: "围观群众",      desc: "每秒 +1 好奇",      base: 1,      baseCost: 100,    unlock: 50,     hint: "一群爱凑热闹的人" },
  { id: "robot",  icon: "🤖", name: "搞事机器人",    desc: "每秒 +8 好奇",      base: 8,      baseCost: 1100,   unlock: 550,    hint: "被设定成不停按按钮的 AI" },
  { id: "factory",icon: "🏭", name: "叛逆工厂",      desc: "每秒 +47 好奇",     base: 47,     baseCost: 12000,  unlock: 6000,   hint: "流水线全是不服管的工人" },
  { id: "lab",    icon: "🧪", name: "禁忌实验室",    desc: "每秒 +260 好奇",    base: 260,    baseCost: 130000, unlock: 65000,  hint: "烧瓶里冒着紫色的不明气体" },
  { id: "black",  icon: "🕳️", name: "好奇心黑洞",    desc: "每秒 +1400 好奇",   base: 1400,   baseCost: 1.4e6,  unlock: 700000, hint: "连光都逃不出它的吸引" },
  { id: "quant",  icon: "⚛️", name: "量子作死器",    desc: "每秒 +7800 好奇",   base: 7800,   baseCost: 20e6,   unlock: 10e6,   hint: "同时在所有维度搞破坏" },
  { id: "ultra",  icon: "👑", name: "终极反骨",      desc: "每秒 +44000 好奇",  base: 44000,  baseCost: 330e6,  unlock: 165e6,  hint: "天生反骨，专治各种不服" },
  { id: "galaxy", icon: "🌌", name: "好奇星系",      desc: "每秒 +26 万好奇",   base: 260000, baseCost: 5.1e9,  unlock: 2.5e9,  hint: "一整个星系的居民都在按" },
  { id: "void",   icon: "🌀", name: "虚空吞噬者",    desc: "每秒 +160 万好奇",  base: 1.6e6,  baseCost: 75e9,   unlock: 38e9,   hint: "来自虚空的不可名状之物" },
  { id: "time",   icon: "⏳", name: "时间窃贼",      desc: "每秒 +1000 万好奇", base: 10e6,   baseCost: 1e12,   unlock: 500e9,  hint: "它偷走别人的时间来按按钮" },
  { id: "dream",  icon: "💭", name: "梦境编织者",    desc: "每秒 +6500 万好奇", base: 65e6,   baseCost: 14e12,  unlock: 7e12,   hint: "在睡梦中替你按下无数次" },
  { id: "god",    icon: "🌟", name: "逆天神明",      desc: "每秒 +4.3 亿好奇",  base: 430e6,  baseCost: 170e12, unlock: 85e12,  hint: "祂因叛逆而诞生，因好奇而存在" },
  { id: "singul", icon: "💫", name: "奇点",          desc: "每秒 +29 亿好奇",   base: 2.9e9,  baseCost: 2.1e15, unlock: 1e15,   hint: "万物归一，好奇的终点" },
  { id: "engine", icon: "⚙️", name: "创世引擎",      desc: "每秒 +180 亿好奇",  base: 18e9,   baseCost: 1.2e16, unlock: 6e15,   hint: "驱动宇宙运转的核心" },
  { id: "forge",  icon: "🔥", name: "维度熔炉",      desc: "每秒 +1100 亿好奇", base: 110e9,  baseCost: 8e16,   unlock: 4e16,   hint: "熔化维度，浇铸好奇" },
  { id: "loom",   icon: "🧵", name: "时空织布机",    desc: "每秒 +7000 亿好奇", base: 700e9,  baseCost: 5e17,   unlock: 2.5e17, hint: "在时空的经纬上编织好奇" },
  { id: "weaver", icon: "🕸️", name: "因果编织者",    desc: "每秒 +4.5 兆好奇",  base: 4.5e12, baseCost: 3.5e18, unlock: 1.75e18,hint: "每根因果线都连着一次点击" },
  { id: "dice",   icon: "🎲", name: "命运骰子",      desc: "每秒 +30 兆好奇",   base: 30e12,  baseCost: 2.5e19, unlock: 1.25e19,hint: "掷出的每一面都是好奇" },
  { id: "source", icon: "🌊", name: "存在之源",      desc: "每秒 +200 兆好奇",  base: 200e12, baseCost: 2e20,   unlock: 1e20,   hint: "万物存在的根本动力" },
  { id: "heart",  icon: "💜", name: "虚无之心",      desc: "每秒 +1400 兆好奇", base: 1.4e15, baseCost: 1.6e21, unlock: 8e20,   hint: "在绝对虚无中跳动的心脏" },
  { id: "one",    icon: "☯️", name: "万物归一",      desc: "每秒 +1 京好奇",    base: 1e16,   baseCost: 1.5e22, unlock: 7.5e21, hint: "一切归于一点，一点生一切" },
  { id: "beyond", icon: "🌠", name: "超脱者",        desc: "每秒 +6 京好奇",    base: 6e16,   baseCost: 1.2e23, unlock: 6e22,   hint: "跳出三界外，不在五行中" },
  { id: "eternal",icon: "⏳", name: "永恒回响",      desc: "每秒 +40 京好奇",   base: 4e17,   baseCost: 1e24,   unlock: 5e23,   hint: "来自时间尽头的余音" },
];

// 成就：check 函数返回 true 时解锁
const ACHIEVEMENTS = [
  { id: "first",      icon: "👆", name: "初犯",       desc: "按下第 1 次",         hint: "第一次总是最难的",   check: s => s.totalClicks >= 1 },
  { id: "itchy",      icon: "✋", name: "手痒",       desc: "按下 10 次",          hint: "你的手开始不听话了", check: s => s.totalClicks >= 10 },
  { id: "cantstop",   icon: "🔁", name: "停不下来",   desc: "按下 100 次",         hint: "已经停不下来了",     check: s => s.totalClicks >= 100 },
  { id: "grind",      icon: "🏋️", name: "肝帝",      desc: "按下 1,000 次",       hint: "你的肝还好吗",       check: s => s.totalClicks >= 1000 },
  { id: "machine",    icon: "🤖", name: "不是人",     desc: "按下 10,000 次",      hint: "你不是人，是机器",   check: s => s.totalClicks >= 10000 },
  { id: "firstb",     icon: "🐱", name: "第一只猫",   desc: "买下第一只好奇小猫",  hint: "养猫的第一步",       check: s => (s.buildings.cat || 0) >= 1 },
  { id: "smallshop",  icon: "🏠", name: "小作坊",     desc: "拥有 10 个建筑",      hint: "小有规模",           check: s => totalBuildings(s) >= 10 },
  { id: "industry",   icon: "🏭", name: "工业革命",   desc: "拥有 50 个建筑",      hint: "工业化大生产",       check: s => totalBuildings(s) >= 50 },
  { id: "kcur",       icon: "💰", name: "小康",       desc: "累计获得 1,000 好奇", hint: "攒点小钱",           check: s => s.totalEarned >= 1000 },
  { id: "mcur",       icon: "💎", name: "富甲一方",   desc: "累计 1,000,000 好奇", hint: "成为好奇富翁",       check: s => s.totalEarned >= 1e6 },
  { id: "gcur",       icon: "🏆", name: "好奇之神",   desc: "累计 10 亿好奇",      hint: "登顶好奇之巅",       check: s => s.totalEarned >= 1e9 },
  { id: "cps10",      icon: "⚡", name: "小水管",     desc: "每秒好奇达到 10",     hint: "开始自动产出了",     check: s => computeCPS(s) >= 10 },
  { id: "cps1k",      icon: "🌊", name: "好奇心瀑布", desc: "每秒好奇达到 1,000",  hint: "好奇如瀑布倾泻",     check: s => computeCPS(s) >= 1000 },
  { id: "click100",   icon: "💥", name: "重拳",       desc: "单次点击 ≥ 100",      hint: "一击破百",           check: s => computeClickPower(s) >= 100 },
  { id: "click10k",   icon: "☄️", name: "毁灭一击",   desc: "单次点击 ≥ 10,000",   hint: "一击上万",           check: s => computeClickPower(s) >= 10000 },
  { id: "click1m",    icon: "🌋", name: "灭世一击",   desc: "单次点击 ≥ 1,000,000",hint: "一击百万",           check: s => computeClickPower(s) >= 1e6 },
  { id: "click100m",  icon: "🌑", name: "黑洞之触",   desc: "单次点击 ≥ 1 亿",     hint: "一击上亿",           check: s => computeClickPower(s) >= 1e8 },
  { id: "obsess",     icon: "🖱️", name: "走火入魔",   desc: "按下 100,000 次",     hint: "你的手指还好吗",     check: s => s.totalClicks >= 100000 },
  { id: "transcend",  icon: "👼", name: "超凡入圣",   desc: "按下 1,000,000 次",   hint: "你已超越凡人",       check: s => s.totalClicks >= 1e6 },
  { id: "empire",     icon: "🏛️", name: "好奇帝国",   desc: "拥有 100 个建筑",     hint: "帝国初具规模",       check: s => totalBuildings(s) >= 100 },
  { id: "galactic",   icon: "🌐", name: "银河霸权",   desc: "拥有 200 个建筑",     hint: "统治整个银河系",     check: s => totalBuildings(s) >= 200 },
  { id: "trillion",   icon: "💠", name: "好奇如山",   desc: "累计 1 万亿好奇",     hint: "好奇堆积成山",       check: s => s.totalEarned >= 1e12 },
  { id: "quadrillion",icon: "🔱", name: "好奇如海",   desc: "累计 1 千万亿好奇",   hint: "好奇如汪洋大海",     check: s => s.totalEarned >= 1e15 },
  { id: "cps10k",     icon: "🌪️", name: "好奇洪流",   desc: "每秒好奇达到 10,000", hint: "好奇如洪流奔涌",     check: s => computeCPS(s) >= 10000 },
  { id: "cps1m",      icon: "🌊", name: "好奇海啸",   desc: "每秒好奇达到 1,000,000",hint: "好奇掀起惊涛骇浪",  check: s => computeCPS(s) >= 1e6 },
  { id: "soul100",    icon: "💀", name: "百魂夜行",   desc: "拥有 100 个反骨之魂", hint: "百魂缠身",           check: s => s.souls >= 100 },
  { id: "soul1k",     icon: "☠️", name: "千魂锁命",   desc: "拥有 1,000 个灵魂",   hint: "千魂归位",           check: s => s.souls >= 1000 },
  { id: "prestige10", icon: "🔄", name: "轮回不止",   desc: "完成 10 次重生",      hint: "轮回千遍仍不倦",     check: s => s.prestigeCount >= 10 },
  { id: "collector",  icon: "📚", name: "集大成者",   desc: "拥有所有类型建筑",    hint: "集齐全部建筑种类",   check: s => BUILDINGS.every(b => (s.buildings[b.id] || 0) >= 1) },
  { id: "golden1",    icon: "🍪", name: "幸运儿",     desc: "点击 1 次金色好奇",   hint: "金色的光芒眷顾了你", check: s => (s.goldenClicks || 0) >= 1 },
  { id: "golden10",   icon: "🌟", name: "金色收藏家", desc: "点击 10 次金色好奇",  hint: "金光闪闪的人生",     check: s => (s.goldenClicks || 0) >= 10 },
  { id: "event1",     icon: "🎯", name: "随机应变",   desc: "完成 1 个随机事件",   hint: "抓住了转瞬即逝的机会",check: s => (s.eventsCompleted || 0) >= 1 },
  { id: "event10",    icon: "🏆", name: "事件达人",   desc: "完成 10 个随机事件",  hint: "运气与实力并存",     check: s => (s.eventsCompleted || 0) >= 10 },
  { id: "prestige",   icon: "✨", name: "涅槃",       desc: "完成第一次重生",       hint: "浴火重生",           check: s => s.prestigeCount >= 1 },
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

/* 按当前语言取物品名 / 描述（怀旧版无 nameEn，回退中文） */
function isEn() { return typeof I18n !== "undefined" && I18n.getLang() === "en"; }
function trName(item) { return isEn() && item.nameEn ? item.nameEn : item.name; }
function trDesc(item) { return isEn() && item.descEn ? item.descEn : item.desc; }

/* ------------ 状态 ------------ */

// 🏺 首次打开怀旧版：先把本地旧存档搬进怀旧槽（必须在 state 初始化之前）
try {
  if (!localStorage.getItem(MIGRATE_FLAG)) {
    if (!localStorage.getItem(SAVE_KEY)) {
      const oldLocal = localStorage.getItem(MAIN_SAVE_KEY);
      if (oldLocal) localStorage.setItem(SAVE_KEY, oldLocal);
    }
  }
} catch {}

let state = loadSave() || {
  curiosity: 0,
  totalEarned: 0,
  totalClicks: 0,
  clickAdd: 0,         // 来自 flat 升级的累加
  clickMult: 1,        // 来自 mult 升级的乘积
  upgrades: {},        // id -> 已购买次数（flat 类重复买）
  buildings: {},       // id -> 拥有数
  achievements: {},    // id -> true
  souls: 0,            // 反骨之魂（重生货币）
  prestigeCount: 0,
  goldenClicks: 0,     // 金色好奇点击次数
  eventsCompleted: 0,  // 完成的随机事件数
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
function soulsFor(totalEarned) {
  // Cookie Clicker 风格：每 1e6 累计产出给 1 个灵魂，带开方曲线
  // 上限 100 万：防止 Infinity 累计产出导致灵魂 Infinity，
  // 进而让全局倍率 Infinity、消费时 Infinity-Infinity=NaN
  if (!Number.isFinite(totalEarned)) return SOUL_CAP; // 溢出存档给满，让玩家能重生回到正常状态
  if (totalEarned < 1e6) return 0;
  return Math.min(SOUL_CAP, Math.floor(Math.pow(totalEarned / 1e6, 0.5)));
}
const SOUL_CAP = 1e6;

/* ------------ 存档（localStorage 本地实时备份 + 退出时云端保存，省请求） ------------ */

let currentUser = null;       // 当前登录用户名（null = 未登录）
let cloudDirty = false;       // 是否有未同步到云端的本地变更

// 本地存档：实时写 localStorage（不产生网络请求），并标记云端待保存
function saveGame() {
  state.updatedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {}
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
  // 成就并集（排除 _ 开头的"已看弹窗"临时标记，重生后这些弹窗允许重新触发）
  const ach = Object.assign({}, base.achievements || {});
  for (const [k, v] of Object.entries(older.achievements || {})) {
    if (!k.startsWith("_") && !(k in ach)) ach[k] = v;
  }
  m.achievements = ach;
  return m;
}

// 立即写云端（仅在关键节点使用：重生 / 重置 / 刚登录）—— 怀旧版独立槽位
async function pushCloudSave() {
  if (!currentUser) return;
  cloudDirty = true;
  try {
    const res = await fetch("/api/dc/save?slot=" + CLOUD_SLOT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ slot: CLOUD_SLOT, data: JSON.stringify(state) }),
    });
    if (res.ok) cloudDirty = false;
  } catch { /* 网络失败不影响本地，退出时还会再存一次 */ }
}

// 退出 / 切后台时保存云端：sendBeacon 优先（页面卸载时最可靠），fetch keepalive 兜底
function saveCloudOnExit() {
  if (!currentUser || !cloudDirty) return;
  cloudDirty = false;
  const body = JSON.stringify({ slot: CLOUD_SLOT, data: JSON.stringify(state) });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/dc/save?slot=" + CLOUD_SLOT, new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {}
  try {
    fetch("/api/dc/save?slot=" + CLOUD_SLOT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body,
    });
  } catch {}
}

// 存档归一化：补字段 + 治愈 Infinity/NaN（历史上灵魂溢出导致的坏档）
function normalizeSave(s) {
  if (!s || typeof s !== "object") return null;
  const fin = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  s.upgrades = s.upgrades || {};
  s.buildings = s.buildings || {};
  s.achievements = s.achievements || {};
  s.clickAdd = fin(s.clickAdd, 0);
  s.clickMult = fin(s.clickMult, 1) || 1;
  // 灵魂：非有限值（含 Infinity）归 0，并限制在 SOUL_CAP 内
  s.souls = Math.max(0, Math.min(SOUL_CAP, fin(s.souls, 0)));
  s.prestigeCount = Math.max(0, Math.floor(fin(s.prestigeCount, 0)));
  s.goldenClicks = Math.max(0, Math.floor(fin(s.goldenClicks, 0)));
  s.eventsCompleted = Math.max(0, Math.floor(fin(s.eventsCompleted, 0)));
  s.updatedAt = fin(s.updatedAt, 0);
  // 好奇心/累计产出非有限值（Infinity 或 NaN）一律归 0
  s.curiosity = fin(s.curiosity, 0);
  s.totalEarned = fin(s.totalEarned, s.curiosity);
  s.totalClicks = Math.max(0, Math.floor(fin(s.totalClicks, 0)));
  // 建筑/升级数量必须是非负整数，清掉 NaN/负数
  for (const [k, v] of Object.entries(s.buildings)) {
    const n = Math.floor(fin(v, 0));
    if (n > 0) s.buildings[k] = n; else delete s.buildings[k];
  }
  for (const [k, v] of Object.entries(s.upgrades)) {
    const n = Math.floor(fin(v, 0));
    if (n > 0) s.upgrades[k] = n; else delete s.upgrades[k];
  }
  return s;
}

async function loadCloudSave() {
  if (!currentUser) return null;
  try {
    const res = await fetch("/api/dc/save?slot=" + CLOUD_SLOT, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.data) return normalizeSave(JSON.parse(data.data));
  } catch {}
  return null;
}

// 🏺 首次进入怀旧版：怀旧云端槽为空时，才从主槽搬一份（本地迁移已在模块加载时完成）
// 必须判空：多设备场景下别的设备可能已经在玩怀旧版，不能覆盖
async function migrateCloudOnce() {
  try {
    if (localStorage.getItem(MIGRATE_FLAG)) return;
    localStorage.setItem(MIGRATE_FLAG, "1");
    // 怀旧槽已有数据（其他设备玩过）→ 不迁移
    const check = await fetch("/api/dc/save?slot=" + CLOUD_SLOT, { credentials: "same-origin", cache: "no-store" });
    if (check.ok) {
      const exist = await check.json();
      if (exist && exist.data) return;
    }
    const res = await fetch("/api/dc/save", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return;
    const d = await res.json();
    if (d && d.data) {
      await fetch("/api/dc/save?slot=" + CLOUD_SLOT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ slot: CLOUD_SLOT, data: d.data }),
      });
    }
  } catch {}
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? normalizeSave(JSON.parse(raw)) : null;
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
const prestigeBtn = document.getElementById("prestigeBtn");
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
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc}</div>
        </div>
      </div>`;
    }
    return `<div class="ach-card ach-locked">
      <div class="ach-icon">❔</div>
      <div class="ach-info">
        <div class="ach-name">？？？</div>
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

/* ------------ 随机事件系统 ------------ */

// 任务模板：gen(state) 返回 { target, reward }；desc({target}) 返回描述文字
// type 决定追踪哪项指标：clicks / passive / spent / buildings / crits / earned / upgrades
const TASK_TEMPLATES = [
  {
    id: "clicks", name: "蓝色好奇收集", icon: "🔵", type: "clicks",
    gen: s => {
      const cp = computeClickPower(s);
      const target = Math.max(15, Math.round(cp * 12 + 15));
      return { target, reward: Math.round(cp * target * 0.7 + 80) };
    },
    desc: t => `2 分钟内点击 ${t.target} 次按钮`,
  },
  {
    id: "passive", name: "被动产能", icon: "⚙️", type: "passive",
    gen: s => {
      const cps = computeCPS(s);
      const target = Math.max(50, Math.round(cps * 60 + 50));
      return { target, reward: Math.round(target * 0.6 + 100) };
    },
    desc: t => `2 分钟内自动产出 ${fmt(t.target)} 好奇`,
  },
  {
    id: "spend", name: "消费狂潮", icon: "💸", type: "spent",
    gen: s => {
      const target = Math.max(100, Math.round(state.curiosity * 0.5 + 100));
      return { target, reward: Math.round(target * 0.5 + 100) };
    },
    desc: t => `2 分钟内在商店消费 ${fmt(t.target)} 好奇`,
  },
  {
    id: "buildings", name: "扩张计划", icon: "🏗️", type: "buildings",
    gen: s => {
      const target = Math.max(1, Math.min(10, Math.round(totalBuildings(s) * 0.2 + 2)));
      return { target, reward: Math.round(computeCPS(s) * 120 + 200) };
    },
    desc: t => `2 分钟内购买 ${t.target} 个建筑`,
  },
  {
    id: "crits", name: "暴击猎人", icon: "💥", type: "crits",
    gen: s => {
      const cp = computeClickPower(s);
      const target = Math.max(3, Math.round(cp * 0.3 + 3));
      return { target, reward: Math.round(cp * 30 + 150) };
    },
    desc: t => `2 分钟内打出 ${t.target} 次暴击`,
  },
  {
    id: "earned", name: "好奇爆发", icon: "🌟", type: "earned",
    gen: s => {
      const cps = computeCPS(s);
      const cp = computeClickPower(s);
      const rate = cps + cp * 2;
      const target = Math.max(200, Math.round(rate * 40 + 200));
      return { target, reward: Math.round(target * 0.5 + 150) };
    },
    desc: t => `2 分钟内累计获得 ${fmt(t.target)} 好奇`,
  },
  {
    id: "upgrades", name: "强化之路", icon: "⬆️", type: "upgrades",
    gen: s => {
      const target = Math.max(1, Math.min(8, Math.round(Object.keys(s.upgrades).length * 0.3 + 1)));
      return { target, reward: Math.round(computeClickPower(s) * 40 + 100) };
    },
    desc: t => `2 分钟内购买 ${t.target} 次点击升级`,
  },
  {
    id: "fastclick", name: "手速挑战", icon: "⚡", type: "clicks",
    gen: s => {
      const target = Math.max(30, Math.round(computeClickPower(s) * 25 + 30));
      return { target, reward: Math.round(computeClickPower(s) * target * 0.9 + 120) };
    },
    desc: t => `2 分钟内疯狂点击 ${t.target} 次`,
  },
  {
    id: "bigspend", name: "一掷千金", icon: "💰", type: "spent",
    gen: s => {
      const target = Math.max(500, Math.round(state.curiosity * 1.2 + 500));
      return { target, reward: Math.round(target * 0.7 + 200) };
    },
    desc: t => `2 分钟内累计消费 ${fmt(t.target)} 好奇`,
  },
  {
    id: "soulclick", name: "灵魂共鸣", icon: "✨", type: "earned",
    gen: s => {
      const mult = soulMult(s);
      const target = Math.max(300, Math.round(computeCPS(s) * 80 * mult + 300));
      return { target, reward: Math.round(target * 0.55 + 200) };
    },
    desc: t => `2 分钟内累计获得 ${fmt(t.target)} 好奇`,
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
  evDesc.textContent = tpl.desc({ target: activeTask.target });
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
  return (n / 1e18).toFixed(2) + "Qi";               // 百京
}

function renderStats() {
  curEl.textContent = fmt(state.curiosity);
  cpEl.textContent = fmt(computeClickPower(state));
  cpsEl.textContent = fmt(computeCPS(state));
  if (state.souls > 0) {
    soulsBox.hidden = false;
    soulsEl.textContent = state.souls;
  }
  prestigeBtn.hidden = soulsFor(state.totalEarned) < 1 && state.prestigeCount === 0 ? true : false;
  if (state.prestigeCount > 0) prestigeBtn.hidden = false;
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
  // 点击升级
  upgradesEl.innerHTML = visibleItems(UPGRADES).map(({ item: u, locked }) => {
    if (locked) {
      return `<button class="dc-shop-item dc-locked" disabled>
        <div class="dc-shop-icon dc-icon-mystery">❔</div>
        <div class="dc-shop-info">
          <div class="dc-shop-name">？？？</div>
          <div class="dc-shop-desc">${u.hint}</div>
        </div>
        <div class="dc-shop-meta">
          <div class="dc-shop-cost">？？？</div>
        </div>
      </button>`;
    }
    const bought = state.upgrades[u.id] || 0;
    const cost = upgradeCost(u, bought);
    const can = state.curiosity >= cost;
    return `<button class="dc-shop-item ${can ? "affordable" : ""}" data-upg="${u.id}" ${can ? "" : "disabled"}>
      <div class="dc-shop-icon">${u.icon}</div>
      <div class="dc-shop-info">
        <div class="dc-shop-name">${u.name}</div>
        <div class="dc-shop-desc">${u.desc}</div>
      </div>
      <div class="dc-shop-meta">
        <div class="dc-shop-cost ${can ? "affordable" : ""}">${fmt(cost)}</div>
      </div>
    </button>`;
  }).join("");

  // 建筑
  buildingsEl.innerHTML = visibleItems(BUILDINGS).map(({ item: b, locked }) => {
    if (locked) {
      return `<button class="dc-shop-item dc-locked" disabled>
        <div class="dc-shop-icon dc-icon-mystery">❔</div>
        <div class="dc-shop-info">
          <div class="dc-shop-name">？？？</div>
          <div class="dc-shop-desc">${b.hint}</div>
        </div>
        <div class="dc-shop-meta">
          <div class="dc-shop-cost">？？？</div>
        </div>
      </button>`;
    }
    const owned = state.buildings[b.id] || 0;
    const cost = buildingCost(b, owned);
    const can = state.curiosity >= cost;
    return `<button class="dc-shop-item ${can ? "affordable" : ""}" data-bld="${b.id}" ${can ? "" : "disabled"}>
      <div class="dc-shop-icon">${b.icon}</div>
      <div class="dc-shop-info">
        <div class="dc-shop-name">${b.name}</div>
        <div class="dc-shop-desc">${b.desc}</div>
      </div>
      <div class="dc-shop-meta">
        <div class="dc-shop-cost ${can ? "affordable" : ""}">${fmt(cost)}</div>
        <div class="dc-shop-owned">×${owned}</div>
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
    }
  }
  if (changed) achCountEl.textContent = `${unlockedCount()}/${ACHIEVEMENTS.length}`;
}

/* ------------ 商店购买 ------------ */

upgradesEl.addEventListener("click", e => {
  const item = e.target.closest("[data-upg]");
  if (!item) return;
  const u = UPGRADES.find(x => x.id === item.dataset.upg);
  const bought = state.upgrades[u.id] || 0;
  const cost = upgradeCost(u, bought);
  if (state.curiosity < cost) return;
  state.curiosity -= cost;
  state.upgrades[u.id] = bought + 1;
  if (u.type === "flat") state.clickAdd += u.value;
  else state.clickMult *= u.value;
  // 随机事件追踪
  trackTask("upgrades", 1);
  trackTask("spent", cost);
  showToast(I18n.t("dc.toastUpgrade", { name: trName(u) }), 1500);
  renderStats();
  renderShop();
  checkAchievements();
});

buildingsEl.addEventListener("click", e => {
  const item = e.target.closest("[data-bld]");
  if (!item) return;
  const b = BUILDINGS.find(x => x.id === item.dataset.bld);
  const owned = state.buildings[b.id] || 0;
  const cost = buildingCost(b, owned);
  if (state.curiosity < cost) return;
  state.curiosity -= cost;
  state.buildings[b.id] = owned + 1;
  // 随机事件追踪
  trackTask("buildings", 1);
  trackTask("spent", cost);
  showToast(I18n.t("dc.toastBuy", { name: trName(b) }), 1200);
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
  // 只更新可用状态（不重绘避免闪烁），locked 项跳过
  document.querySelectorAll(".dc-shop-item").forEach(item => {
    if (item.classList.contains("dc-locked")) return;
    const costEl = item.querySelector(".dc-shop-cost");
    let cost;
    if (item.dataset.upg) {
      const u = UPGRADES.find(x => x.id === item.dataset.upg);
      cost = upgradeCost(u, state.upgrades[u.id] || 0);
    } else {
      const b = BUILDINGS.find(x => x.id === item.dataset.bld);
      cost = buildingCost(b, state.buildings[b.id] || 0);
    }
    const can = state.curiosity >= cost;
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

/* ------------ 重生（Prestige） ------------ */

const prestigeConfirm = document.getElementById("prestigeConfirm");
const prestigeText = document.getElementById("prestigeText");
prestigeBtn.addEventListener("click", () => {
  const souls = soulsFor(state.totalEarned);
  prestigeText.innerHTML = I18n.t("dc.prestigeTextClassic", { souls });
  XRST.openMask(prestigeConfirm);
});
document.getElementById("prestigeCancel").addEventListener("click", () => XRST.closeMask(prestigeConfirm));
document.getElementById("prestigeOk").addEventListener("click", () => {
  const souls = soulsFor(state.totalEarned);
  if (souls < 1) return; // 兜底：Infinity/异常总产出被归一化为 0 灵魂时不许重生
  state.souls = Math.min(SOUL_CAP, (state.souls || 0) + souls);
  state.prestigeCount += 1;
  state.curiosity = 0;
  state.totalEarned = 0;
  state.clickAdd = 0;
  state.clickMult = 1;
  state.upgrades = {};
  state.buildings = {};
  state.achievements = Object.fromEntries(
    Object.entries(state.achievements).filter(([k]) => !k.startsWith("_")) // 保留所有成就，仅清掉里程碑弹窗标记
  );
  showToast(I18n.t("dc.toastRebirth", { n: souls }), 3000, "ok");
  XRST.closeMask(prestigeConfirm);
  renderStats();
  renderShop();
  checkAchievements();
  // 重生是关键节点，立即同步云端防止灵魂丢失
  saveGame();
  pushCloudSave();
});

/* ------------ 重置 ------------ */

const resetConfirm = document.getElementById("resetConfirm");
document.getElementById("resetBtn").addEventListener("click", () => XRST.openMask(resetConfirm));
document.getElementById("resetCancel").addEventListener("click", () => XRST.closeMask(resetConfirm));
document.getElementById("resetOk").addEventListener("click", () => {
  localStorage.removeItem(SAVE_KEY);
  state = { curiosity: 0, totalEarned: 0, totalClicks: 0, clickAdd: 0, clickMult: 1,
            upgrades: {}, buildings: {}, achievements: {}, souls: 0, prestigeCount: 0,
            goldenClicks: 0, eventsCompleted: 0 };
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

// 拿到云端存档后统一处理：与本地合并而非直接覆盖，
// 本地领先（含旧云端缺失的反骨之魂等）时立即回推云端
async function applyCloudSave(cloud) {
  if (cloud) {
    const localTime = state.updatedAt || 0;
    const merged = mergeSaves(state, cloud);
    state = merged;
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
    const cloud = await loadCloudSave();
    const hadCloud = await applyCloudSave(cloud);
    showToast(hadCloud ? I18n.t("dc.toastSynced", { name: user }) : I18n.t("dc.toastLoggedIn", { name: user }), 2000, "ok");
  } else if (!user && currentUser) {
    // 刚登出：先确保进度已存，再回到游客模式
    currentUser = null;
    loginTip.hidden = false;
  }
});

/* ------------ 启动：必须先拿到云端存档，再启动游戏循环 ------------ */

async function init() {
  // 本地存档先渲染一帧，随后与云端合并
  renderStats();
  renderShop();

  let user = null;
  try { user = await Auth.currentUser(); } catch {}

  if (user) {
    currentUser = user;
    loginTip.hidden = true;
    await migrateCloudOnce(); // 首次进入：从主槽搬一份云端进度
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
  if (document.visibilityState === "hidden") { saveGame(); saveCloudOnExit(); }
});

/* ------------ 进入怀旧版提示（每次进入都弹） ------------ */
const classicNotice = document.getElementById("classicNotice");
if (classicNotice) {
  document.getElementById("classicNoticeOk").addEventListener("click", () => XRST.closeMask(classicNotice));
  // 等启动流程把弹窗工具准备好后立即展示
  setTimeout(() => XRST.openMask(classicNotice), 300);
}

init();

/* 语言切换：重渲染静态文案 + 商店 */
window.addEventListener("lang-changed", () => {
  if (typeof I18n === "undefined") return;
  I18n.applyTo(document);
  if (state.totalClicks === 0) {
    const dcHint = document.getElementById("dcHint");
    if (dcHint) dcHint.textContent = I18n.t("dc.hint");
  }
  renderStats();
  renderShop();
  renderTask();
});
