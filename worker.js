// =====================================================
// XRST.Uk · Cloudflare Worker
// 静态资源（public/）由 Assets 运行时直接响应；
// /api/* 由本脚本处理。账号/资料等低频数据存 KV；
// 在线心跳用 KV 单键+节流（不进 DO）；聊天、像素/文字画板走 Durable Objects。
// =====================================================

import {
  CollabDO as CollabDOBase,
  GameLobbyDO as GameLobbyDOBase,
  GameMatchDO as GameMatchDOBase,
} from "./do.js";

// 在入口模块内重新声明子类：让运行时在主模块类上直接识别 hibernation 事件处理器
// （跨模块 re-export 时 webSocketMessage 等处理器可能不被注册）
export class CollabDO extends CollabDOBase {}
export class GameLobbyDO extends GameLobbyDOBase {}
export class GameMatchDO extends GameMatchDOBase {}

const SESSION_COOKIE = "xrst_session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 天（秒）
const PBKDF2_ITERATIONS = 20_000;

/* 商店目录（服务端权威定价）：头像框 / 聊天气泡
   f1-f8 / b1-b8 为金币直购；fv1 / bv1 为 VIP 专属（不在价格表里，不能用金币买）*/
const FRAME_SHOP = { f1: 30, f2: 20, f3: 60, f4: 100, f5: 150, f6: 80, f7: 120, f8: 200 };
const BUBBLE_SHOP = { b1: 30, b2: 30, b3: 50, b4: 80, b5: 150, b6: 60, b7: 120, b8: 200 };
const VIP_FRAME = "fv1";
const VIP_BUBBLE = "bv1";
const VIP_PRICE = 250;   // 250 金币
const VIP_DAYS = 30;     // 30 天
const VIP_MS = VIP_DAYS * 24 * 3600 * 1000;

/* ============ 金币抽奖：100 金币/次 ============
   权重总和 2000：普通奖占 99.5%，两个隐藏大奖各 0.25%（合计 0.5%）。
   type：coins=网站金币自动到账；vip=VIP 自动叠加天数并换上专属套装；
   item=游戏内物品，记入 user.lotteryPrizes，玩家凭兑换码到 QQ 群找腐竹领取。
   开奖在服务端用 crypto 安全随机数完成，前端只负责展示。*/
const LOTTERY_COST = 100;
const LOTTERY_WEIGHT_TOTAL = 2000;
const LOTTERY_PRIZES = [
  { id: "apple1",   type: "item",  icon: "🍎", label: "附魔金苹果 ×1",       w: 250 },
  { id: "apple3",   type: "item",  icon: "🍎", label: "附魔金苹果 ×3",       w: 130 },
  { id: "diasuit",  type: "item",  icon: "🛡️", label: "钻石套 ×1（无附魔）", w: 90 },
  { id: "carrot5",  type: "item",  icon: "🥕", label: "金胡萝卜 ×5",         w: 280 },
  { id: "dblock1",  type: "item",  icon: "💠", label: "钻石块 ×1",           w: 220 },
  { id: "coins150", type: "coins", icon: "🪙", label: "网站金币 ×150", amount: 150, w: 150 },
  { id: "coins80",  type: "coins", icon: "🪙", label: "网站金币 ×80",  amount: 80,  w: 320 },
  { id: "eblock3",  type: "item",  icon: "🟩", label: "绿宝石块 ×3",         w: 180 },
  { id: "vip30",    type: "vip",   icon: "👑", label: "1 个月网站 VIP", days: 30,  w: 70 },
  { id: "iron10",   type: "item",  icon: "🧱", label: "铁块 ×10",            w: 300 },
  // —— 以下为隐藏大奖，合计 0.5% ——
  { id: "vip365",   type: "vip",   icon: "👑", label: "12 个月网站 VIP！！", days: 365, w: 5, hidden: true },
  { id: "dblock25", type: "item",  icon: "💠", label: "钻石块 ×25！！！",    w: 5, hidden: true },
];

/* ============ 站队投票 ============
   题目 id 一经发布不可改动（KV 键 vote:<id> 依赖它）；文案在前后端各自镜像。
   去重身份：登录账号 u:<name> 与客户端 IP i:<ip>，任一命中都算"已投"。
   KV 结构：{ a: 人数, b: 人数, v: { "u:name": "a", "i:1.2.3.4": "b" } }
   单次读-改-写，与商店同一套并发取舍（本站流量小，覆盖冲突可接受）。*/
const VOTE_QUESTIONS = [
  { id: "q1", q: "爱玩？", a: "点击按钮", b: "偷还是分？" },
  { id: "q2", q: "粽子蘸什么？", a: "甜党（白糖蜜枣）", b: "咸党（鲜肉蛋黄）" },
  { id: "q3", q: "豆腐脑吃甜的还是咸的？", a: "甜的，糖水派", b: "咸的，卤汁派" },
  { id: "q4", q: "菠萝能不能上披萨？", a: "天作之合，真香", b: "异端，拖出去" },
  { id: "q5", q: "你的作息是？", a: "夜猫子，凌晨再战", b: "早起鸟，晨光真好" },
  { id: "q6", q: "奶茶里加不加小料？", a: "加满小料，半杯都是料", b: "纯奶茶，小料是邪道" },
  { id: "q7", q: "代码的左大括号换不换行？", a: "不换行，K&R 正统", b: "必须换行，Allman" },
  { id: "q8", q: "夏天空调开几度？", a: "26℃，环保省电", b: "20℃，裹棉被睡" },
];
const VOTE_IDS = new Set(VOTE_QUESTIONS.map(q => q.id));

function voteKey(id) { return `vote:${id}`; }
function clientIp(request) {
  return request.headers.get("CF-Connecting-IP")
    || (request.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || "0.0.0.0"; // 本地调试无 IP 头时所有游客共享一个身份
}
function emptyVote() { return { a: 0, b: 0, v: {} }; }
function parseVote(raw) {
  if (!raw) return emptyVote();
  try {
    const r = JSON.parse(raw);
    return {
      a: Number.isFinite(r.a) ? Math.max(0, r.a | 0) : 0,
      b: Number.isFinite(r.b) ? Math.max(0, r.b | 0) : 0,
      v: (r.v && typeof r.v === "object") ? r.v : {},
    };
  } catch { return emptyVote(); }
}
/* 当前请求的身份在这题投了哪边（账号优先于 IP）*/
function voteMine(rec, uKey, iKey) {
  if (uKey && rec.v[uKey]) return rec.v[uKey];
  if (rec.v[iKey]) return rec.v[iKey];
  return null;
}

/* ============ 二手交易（站内道具集市）============
   交易标的 = 站内装扮：头像框 f1-f8 / 聊天气泡 b1-b8（VIP 专属 fv1/bv1 不可交易）。
   三种帖：sell 卖道具换金币 / buy 出金币收道具 / barter 以物易物（item 换 want）。
   所有帖子存单键索引 mkt:index（数组，读-改-写，与商店同一取舍）：
   { id, type, owner(小写), item, want|null, price, desc,
     status:"open"|"taken", taker(小写)|null,
     buyer/seller(小写, 金币流向; barter 为 null), held(担保金币),
     createdAt, takenAt, expireAt(拍下+7天) }
   物品规则：发帖/供货时校验拥有权与"同一物品同时只进一个活跃帖"；
   完成时才真正转移物品（卸下装备、换 owner），下架/过期不动物品。
   担保：拍下即把买家金币扣进帖子 held（卖家拿不到）；
   完成 → held 打给卖家 + 物品交割、帖子与聊天永久删除；
   7 天未完成 → 懒结算退款给买家、帖子重新上架、聊天删除（KV 自带绝对过期兜底）。
   聊天键 mkt:chat:<id> = { msgs:[{f,t,x}] }，只留最近 200 条。*/
const MARKET_KEY = "mkt:index";
const MARKET_SLOTS_FREE = 8;     // 非 VIP 同时在架栏位
const MARKET_SLOTS_VIP = 20;     // VIP 栏位
const MARKET_MAX_PRICE = 999999;
const MARKET_ITEM_MAX = 40;      // 物品名最长字符数（MC 物品名，玩家自填）
const MARKET_DESC_MAX = 300;
const MARKET_MSG_MAX = 500;
const MARKET_CHAT_MS = 7 * 24 * 3600 * 1000;
const MARKET_MSG_CAP = 200;
const MARKET_TYPES = new Set(["sell", "buy", "barter"]);
// 交易标的是 MC 服务器内物品，玩家自填物品名，网站不校验物品所有权

function marketChatKey(id) { return `mkt:chat:${id}`; }

async function loadMarket(env) {
  const raw = await env.AUTH_KV.get(MARKET_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(x => x && MARKET_TYPES.has(x.type)) : [];
  } catch { return []; }
}

function marketView(l) {
  return {
    id: l.id, type: l.type, owner: l.owner, item: l.item, want: l.want || null,
    desc: l.desc || "",
    price: l.price | 0, status: l.status, taker: l.taker || null,
    buyer: l.buyer || null, seller: l.seller || null, held: l.held | 0,
    createdAt: l.createdAt, takenAt: l.takenAt || null, expireAt: l.expireAt || null,
  };
}

/* 懒结算过期交易：退款给买家、帖子重新开放、删聊天。返回是否改过索引（写盘失败静默跳过）*/
async function settleExpiredMarket(env, list, now = Date.now()) {
  let changed = false;
  for (const l of list) {
    if (l.status !== "taken" || !l.expireAt || l.expireAt > now) continue;
    try {
      if (l.held > 0 && l.buyer) await adjustUserCoins(env, l.buyer, l.held, false, { type: "market_refund", memo: "交易超时未完成，担保金币退回" });
      try { await env.AUTH_KV.delete(marketChatKey(l.id)); } catch { /* 聊天键可能已被 KV 过期清掉 */ }
      l.status = "open"; l.taker = null; l.buyer = null; l.seller = null;
      l.held = 0; l.takenAt = null; l.expireAt = null;
      changed = true;
    } catch { /* 写失败：本次仍按旧状态展示，下次请求再试 */ }
  }
  return changed;
}

/* 拍下共用逻辑（网页 /api/market 与 MC /api/mc/market/take 一致）：
   买家金币进担保、帖子转 taken、建 7 天绝对过期的临时聊天。
   成功返回 { ok:true, listing:视图 }；失败返回 { ok:false, error, status }。*/
async function marketTake(env, list, listing, meLower) {
  if (listing.status !== "open") return { ok: false, error: "已经被拍下了", status: 400 };
  if (listing.owner === meLower) return { ok: false, error: "不能拍自己的帖子", status: 400 };

  // sell：我是买家，楼主是卖家；buy（收购）：楼主是买家，我是卖家；barter：无金币
  const buyer = listing.type === "buy" ? listing.owner : (listing.type === "sell" ? meLower : null);
  const seller = listing.type === "buy" ? meLower : (listing.type === "sell" ? listing.owner : null);

  // MC 物品在游戏内交割，网站只做金币担保（barter 无金币）
  if (buyer) {
    const buyerRaw = await env.AUTH_KV.get(userKey(buyer));
    if (!buyerRaw) return { ok: false, error: "买家账号异常", status: 400 };
    const buyerUser = JSON.parse(buyerRaw);
    if ((buyerUser.coins || 0) < listing.price) {
      return {
        ok: false, status: 400,
        error: buyer === meLower
          ? `金币不够，需要 ${listing.price} 个（当前 ${buyerUser.coins || 0}）`
          : "对方金币不足，这笔收购暂时无法成交",
      };
    }
    buyerUser.coins = (buyerUser.coins || 0) - listing.price;
    await env.AUTH_KV.put(userKey(buyer), JSON.stringify(buyerUser));
    await addCoinLedger(env, buyer, {
      delta: -listing.price, balance: buyerUser.coins, type: "market_take",
      memo: listing.type === "buy" ? "收购帖成交，金币进入担保" : "拍下商品，金币进入担保",
    });
  }

  const now = Date.now();
  listing.status = "taken";
  listing.taker = meLower;
  listing.buyer = buyer;
  listing.seller = seller;
  listing.held = listing.price;
  listing.takenAt = now;
  listing.expireAt = now + MARKET_CHAT_MS;
  await env.AUTH_KV.put(MARKET_KEY, JSON.stringify(list));
  // 建空聊天键并挂上 7 天绝对过期（之后每次发言都沿用同一 deadline，不续命）
  await env.AUTH_KV.put(
    marketChatKey(listing.id),
    JSON.stringify({ msgs: [] }),
    { expiration: Math.ceil(listing.expireAt / 1000) }
  );
  return { ok: true, listing: marketView(listing) };
}

/* 临时聊天访问校验（网页与 MC 共用）：懒结算 + 找帖子 + 必须是交易双方。
   通过返回 { listing }；不通过返回 { err: Response }。*/
async function marketChatAccess(env, lid, meLower) {
  const list = await loadMarket(env);
  if (await settleExpiredMarket(env, list)) {
    try { await env.AUTH_KV.put(MARKET_KEY, JSON.stringify(list)); } catch { /* 写失败照旧展示 */ }
  }
  const listing = list.find(l => l.id === lid);
  if (!listing || listing.status !== "taken") {
    return { err: json({ ok: false, error: "交易不存在或已结束" }, 404) };
  }
  if (meLower !== listing.owner && meLower !== listing.taker) {
    return { err: json({ ok: false, error: "只有交易双方能查看" }, 403) };
  }
  return { listing };
}

/* MC 服务端 mod 身份校验：X-MC-Secret 证明是服务器 + mcname 经绑定映射到网站账号。
   绑定关系存 KV：mc:bind:<mcname小写> = 网站用户名（小写）。*/
async function mcBoundUser(env, request, mcname) {
  const secret = request.headers.get("X-MC-Secret") || "";
  if (!env.MC_INGEST_SECRET || secret !== env.MC_INGEST_SECRET) {
    return { err: json({ ok: false, error: "密钥无效" }, 401) };
  }
  if (!/^[A-Za-z0-9_]{3,16}$/.test(mcname || "")) {
    return { err: json({ ok: false, error: "MC 用户名不合法" }, 400) };
  }
  const bound = await env.AUTH_KV.get(`mc:bind:${mcname.toLowerCase()}`);
  if (!bound) {
    return { err: json({ ok: false, error: "未绑定网站账号，请先在游戏内输入 /buybind <绑定码>" }, 403) };
  }
  return { user: bound };
}

/* VIP 是否在有效期内 */
function isVipActive(u, now = Date.now()) {
  return typeof u?.vipUntil === "number" && u.vipUntil > now;
}

/* 装扮可用性：普通款看拥有列表，VIP 款看会员是否有效 */
function canUseFrame(u, id) {
  if (id === VIP_FRAME) return isVipActive(u);
  return Array.isArray(u.frames) && u.frames.includes(id);
}
function canUseBubble(u, id) {
  if (id === VIP_BUBBLE) return isVipActive(u);
  return Array.isArray(u.bubbles) && u.bubbles.includes(id);
}

/* VIP 过期回收：过期后自动卸下 VIP 专属装扮。返回是否有改动（调用方决定是否写盘）*/
function normalizeVip(u, now = Date.now()) {
  if (typeof u.vipUntil === "number" && u.vipUntil <= now) {
    let changed = false;
    if (u.frame === VIP_FRAME) { u.frame = null; changed = true; }
    if (u.bubble === VIP_BUBBLE) { u.bubble = null; changed = true; }
    return changed;
  }
  return false;
}

export default {
  async fetch(request, env) {
    // KV 容错：读/列举失败（含每日额度耗尽、KV 短时故障）一律降级为"无数据"，
    // 绝不让 KV 异常冒泡成 500；写失败仍由各业务路径自行决定提示方式。
    env.AUTH_KV = faultTolerantKV(env.AUTH_KV);
    const url = new URL(request.url);

    // 强制 HTTPS：会话 Cookie 带 Secure，走 http 时会被浏览器丢弃，
    // 导致手机端（微信内浏览器 / 手打域名 / 扫码常走 http）登录即失效。
    // Cloudflare 会把客户端原始协议放在 x-forwarded-proto。
    if (request.headers.get("x-forwarded-proto") === "http") {
      return Response.redirect(
        `https://${url.host}${url.pathname}${url.search}`,
        308 // 永久跳转，且保留 POST 方法与请求体
      );
    }

    const { pathname } = url;

    // 聊天室 WebSocket：必须原样透传升级请求，且不能走下面的 Response 重建（会破坏 101）
    if (pathname === "/api/chat/ws") {
      const stub = env.COLLAB_DO.get(env.COLLAB_DO.idFromName("chat"));
      return stub.fetch(request);
    }

    // 回声洞投稿页（PCL.Mac XE）
    if (pathname === "/hsd" || pathname === "/hsd/") {
      return handleHsdPage(request, env);
    }

    if (pathname.startsWith("/api/")) {
      try {
        const resp = await handleApi(request, env, pathname);
        // DO 透传回来的 Response headers 只读，需重建后再加 HSTS
        const headers = new Headers(resp.headers);
        headers.set("Strict-Transport-Security", HSTS_VALUE);
        return new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
          headers,
        });
      } catch (err) {
        const msg = String((err && err.message) || err);
        // KV 每日写额度耗尽（错误码 10048）/限流：降级提示，不再报"内部错误"
        if (/10048|quota|rate ?limit|too many requests|daily limit/i.test(msg)) {
          return json({
            ok: false,
            error: "今日数据存储额度已用尽，北京时间早 8 点重置；聊天室、像素画板等功能不受影响。",
          }, 503);
        }
        return json({ ok: false, error: "服务器内部错误" }, 500);
      }
    }
    // 垃圾文件下载：Worker 流式生成 100MB 零字节（不占仓库/存储，内存只复用一块 64KB）
    if (pathname === "/Trash.zip") {
      return handleTrashDownload(request);
    }

    // 其余路径交给静态资源（/、/dontclickit/、css/js 等）
    const assetResponse = await env.ASSETS.fetch(request);
    // 给 HTML / JS / CSS 加 no-store 头，防止浏览器或 CDN 缓存旧版本
    if (url.pathname.match(/\.(js|css|html)$/) || url.pathname === "/" || url.pathname.endsWith("/")) {
      const newHeaders = new Headers(assetResponse.headers);
      newHeaders.delete("Cache-Control");
      // text() 已自动解压，移除压缩相关头避免浏览器二次解压
      newHeaders.delete("Content-Encoding");
      newHeaders.delete("Content-Length");
      newHeaders.set("Cache-Control", "no-store");
      newHeaders.set("Strict-Transport-Security", HSTS_VALUE);
      const body = await assetResponse.text();
      return new Response(body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers: newHeaders,
      });
    }
    // 其余资源（图片等二进制）：Assets 响应头不可变，需重建后才能加 HSTS
    const otherHeaders = new Headers(assetResponse.headers);
    otherHeaders.set("Strict-Transport-Security", HSTS_VALUE);
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers: otherHeaders,
    });
  },
};

const HSTS_VALUE = "max-age=31536000; includeSubDomains";

// ============ 垃圾文件下载（Trash.zip，100MB 纯零字节） ============
const TRASH_SIZE = 100 * 1024 * 1024; // 100 MiB
const TRASH_CHUNK = 64 * 1024;        // 每次拉取 64KB，全程复用同一块零 buffer

function trashHeaders(extra = {}) {
  return new Headers({
    "Content-Type": "application/zip",
    "Content-Disposition": 'attachment; filename="Trash.zip"',
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Strict-Transport-Security": HSTS_VALUE,
    ...extra,
  });
}

// 把从 start 开始的零字节流以 64KB 分块吐出，CPU 开销可忽略（下载耗时不计 CPU）
function zeroStream(start, end) {
  let pos = start;
  const zero = new Uint8Array(TRASH_CHUNK);
  return new ReadableStream({
    pull(controller) {
      const remaining = end - pos + 1;
      if (remaining <= 0) { controller.close(); return; }
      const n = Math.min(TRASH_CHUNK, remaining);
      controller.enqueue(zero.subarray(0, n));
      pos += n;
    },
  });
}

function handleTrashDownload(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: trashHeaders({ Allow: "GET, HEAD" }),
    });
  }

  // 解析 Range（下载工具/浏览器断点续传）：bytes=start-end | bytes=start- | bytes=-suffix
  const range = request.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start, end;
      if (m[1] === "") {
        // 后缀形式：最后 N 字节
        const suffix = Math.min(parseInt(m[2] || "0", 10), TRASH_SIZE);
        start = TRASH_SIZE - suffix;
        end = TRASH_SIZE - 1;
      } else {
        start = parseInt(m[1], 10);
        end = m[2] === "" ? TRASH_SIZE - 1 : Math.min(parseInt(m[2], 10), TRASH_SIZE - 1);
      }
      if (Number.isNaN(start) || start > end || start >= TRASH_SIZE) {
        return new Response("Range Not Satisfiable", {
          status: 416,
          headers: trashHeaders({ "Content-Range": `bytes */${TRASH_SIZE}` }),
        });
      }
      return new Response(
        request.method === "HEAD" ? null : zeroStream(start, end),
        {
          status: 206,
          headers: trashHeaders({
            "Content-Length": String(end - start + 1),
            "Content-Range": `bytes ${start}-${end}/${TRASH_SIZE}`,
          }),
        }
      );
    }
    // 无法识别的 Range 头：直接按完整文件处理
  }

  return new Response(
    request.method === "HEAD" ? null : zeroStream(0, TRASH_SIZE - 1),
    {
      status: 200,
      headers: trashHeaders({ "Content-Length": String(TRASH_SIZE) }),
    }
  );
}

async function handleApi(request, env, pathname) {
  if (!env.AUTH_KV) return json({ ok: false, error: "后端未配置 KV 绑定（AUTH_KV）" }, 500);

  const method = request.method;

  // 处理 CORS 预检请求
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Cookie",
        "Access-Control-Max-Age": "86400",
        "Cache-Control": "no-store",
      },
    });
  }

  if (pathname === "/api/me" && method === "GET") {
    const username = await getSessionUser(request, env);
    if (!username) return json({ username: null }, 401);
    const key = userKey(username);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ username: null }, 401);
    // 懒补 uid / searchable（兼容老用户）；其余新字段缺失按默认值返回，不写回
    const user = await ensureUserFields(env, key, JSON.parse(raw));
    // VIP 刚过期：本次读取时把专属装扮卸下并落盘（"过期后换回"）
    if (normalizeVip(user)) await env.AUTH_KV.put(key, JSON.stringify(user));
    return json(meView(user), 200);
  }

  /* 我的金币账单（仅本人）*/
  if (pathname === "/api/me/coinlog" && method === "GET") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    let log = [];
    try { log = JSON.parse((await env.AUTH_KV.get(`coinlog:${me.toLowerCase()}`)) || "[]"); } catch { log = []; }
    if (!Array.isArray(log)) log = [];
    return json({ ok: true, log: log.slice(0, 100) });
  }

  /* ---------- 每日签到 ---------- */
  if (pathname === "/api/checkin" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const key = userKey(me);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 401);
    const user = JSON.parse(raw);
    const today = beijingDate();
    if (user.lastCheckin === today) {
      return json({ ok: false, error: "今天已经签到过啦，明天再来～", coins: user.coins || 0, streak: user.streak || 0, checked: true }, 200);
    }
    const yesterday = beijingDate(-1);
    const streak = user.lastCheckin === yesterday ? (user.streak || 0) + 1 : 1;
    // 第 1 天 10 金币，连续每天 +5，第 7 天起封顶 40
    const reward = 10 + Math.min(streak - 1, 6) * 5;
    user.coins = (user.coins || 0) + reward;
    user.streak = streak;
    user.lastCheckin = today;
    await env.AUTH_KV.put(key, JSON.stringify(user));
    await addCoinLedger(env, me, { delta: reward, balance: user.coins, type: "checkin", memo: `每日签到（连签 ${streak} 天）` });
    return json({ ok: true, reward, coins: user.coins, streak, checked: true }, 200);
  }

  /* ---------- wkw 小游戏游玩时长奖励 ----------
     前端每 30s 上报一个"活跃周期"（挂机/切标签页不上报或报 0）。
     服务端三重防刷：单次最多 30s、按墙钟间隔钳制、每日封顶 100 分钟=1000 金币。*/
  if (pathname === "/api/playtime/beat" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const body = await request.json().catch(() => ({}));
    const PLAY_GAMES = { match3: "消消乐", cards: "斗地主掼蛋升级", watermelon: "合成大西瓜", fourchess: "四棋会", sort: "水排序解谜" };
    const game = PLAY_GAMES[body.game] ? body.game : null;
    if (!game) return json({ ok: false, error: "未知游戏" }, 400);
    /* KV 省额度：客户端每 180s 批量上报一次活跃秒数（旧版 SDK 每 30s 一拍也兼容）。
       服务端每次写 KV = 用户 JSON ×1 + 当日账本 ×1（原来是每拍 2~3 次写，现降 ~9 倍） */
    const BEAT_SEC = 180;         // 单次上报秒数上限（3 分钟一批）
    const UNIT_SEC = 30;          // 计费单位：每 30s 活跃算 1 个单位
    const COINS_PER_UNIT = 5;     // 每单位 5 金币（每分钟 10）
    const DAILY_CAP_SEC = 6000;   // 100 分钟 → 1000 金币/天
    const now = Date.now();

    const key = userKey(me);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 401);
    const user = JSON.parse(raw);
    const today = beijingDate();
    if (!user.playtime || user.playtime.day !== today) {
      user.playtime = { day: today, sec: 0, coins: 0, lastBeat: 0 };
    }
    const pt = user.playtime;

    // ① 请求值钳到 [0,180] 整数
    let credited = Math.max(0, Math.min(BEAT_SEC, Math.floor(Number(body.sec) || 0)));
    // ② 墙钟钳制：距上次落库的真实间隔不够，多报部分不给（容差 15s 覆盖上报抖动）
    if (pt.lastBeat > 0) {
      const elapsed = (now - pt.lastBeat) / 1000;
      credited = Math.max(0, Math.min(credited, Math.floor(elapsed + 15)));
    }
    pt.lastBeat = now;
    // ③ 日封顶
    const beforeUnits = Math.floor(pt.sec / UNIT_SEC);
    pt.sec = Math.min(DAILY_CAP_SEC, pt.sec + credited);
    const afterUnits = Math.floor(pt.sec / UNIT_SEC);
    const gained = Math.max(0, afterUnits - beforeUnits) * COINS_PER_UNIT;

    if (gained > 0) {
      user.coins = (user.coins || 0) + gained;
      pt.coins = (pt.coins || 0) + gained;
    }
    if (credited > 0) {
      /* 单次合并写：金币/时长/lastBeat 一份 JSON 落库（原来金币到账时写两次） */
      await env.AUTH_KV.put(key, JSON.stringify(user));
      if (gained > 0) {
        const minutes = Math.floor(pt.sec / 60);
        await updateDailyLedger(env, me, "playtime", () => ({
          deltaAdd: gained,
          balance: user.coins,
          memo: `玩小游戏 ${minutes} 分钟（今日封顶 ${DAILY_CAP_SEC / 60} 分钟）`,
        }));
      }
    }

    return json({
      ok: true,
      gained,                       // 本次实际到账金币
      coins: user.coins || 0,
      dailySec: pt.sec,
      dailyCapSec: DAILY_CAP_SEC,
      dailyCoins: pt.coins || 0,
      capped: pt.sec >= DAILY_CAP_SEC,
      game,
    });
  }

  /* ---------- 小游戏成就金币奖励 ----------
     A. 合成大西瓜：合出隐藏球 stage 9/10，随机 20~100，日限 10 次、间隔 60s
     B. 四棋会：人机对局玩家获胜，按 AI 难度 8/15/25/40/60，日限共 8 次、同棋种间隔 60s */
  if (pathname === "/api/game/bonus" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const body = await request.json().catch(() => ({}));
    const now = Date.now(), today = beijingDate();
    const rand = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;

    const key = userKey(me);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 401);
    const user = JSON.parse(raw);

    let coins = 0, memo = "", dailyMax = 0, bucket = null, gateKind = "";

    if (body.game === "watermelon" && (body.stage === 9 || body.stage === 10 || body.stage === 11)) {
      dailyMax = 10;
      if (!user.wmBonus || user.wmBonus.day !== today) user.wmBonus = { day: today, count: 0, lastAt: 0 };
      bucket = user.wmBonus;
      const ballName = body.stage === 11 ? "金色隐藏球" : body.stage === 10 ? "彩虹隐藏球" : "白色隐藏球";
      // 白球/彩虹球 20~100；金球（12 阶顶端，极稀有）100~260
      coins = body.stage === 11 ? 100 + rand(161) : 20 + rand(81);
      memo = `合成大西瓜 · 合出${ballName}`;
    } else if (body.game === "chess") {
      const CHESS = {
        chess:   ["国际象棋", [8, 15, 25, 40, 60]],
        xq:      ["中国象棋", [8, 15, 25, 40, 60]],
        gomoku:  ["五子棋",   [8, 15, 25, 40, 60]],
        go:      ["围棋",     [8, 15, 25, 40, 60]],
      };
      const cfg = CHESS[body.kind];
      const level = Math.floor(Number(body.level));
      if (!cfg || !(level >= 0 && level <= 4)) return json({ ok: false, error: "未知事件" }, 400);
      dailyMax = 8; // 四种棋每天合计 8 次胜利奖励
      if (!user.chessBonus || user.chessBonus.day !== today) {
        user.chessBonus = { day: today, count: 0, last: {} };
      }
      bucket = user.chessBonus;
      gateKind = body.kind;
      const gap = now - (bucket.last[gateKind] || 0);
      if (gap < 60000) return json({ ok: false, error: "操作太快了", tooFast: true });
      coins = cfg[1][level];
      memo = `四棋会 · ${cfg[0]}击败 ${["新手", "简单", "中等", "困难", "大师"][level]} AI`;
    } else {
      return json({ ok: false, error: "未知事件" }, 400);
    }

    if (bucket.count >= dailyMax) return json({ ok: false, error: "今日奖励已领满", dailyLimit: true });
    if (body.game === "watermelon" && bucket.lastAt && now - bucket.lastAt < 60000) {
      return json({ ok: false, error: "操作太快了", tooFast: true });
    }

    bucket.count += 1;
    if (body.game === "watermelon") bucket.lastAt = now;
    else bucket.last[gateKind] = now;
    user.coins = (user.coins || 0) + coins;
    await env.AUTH_KV.put(key, JSON.stringify(user));
    await addCoinLedger(env, me, { delta: coins, balance: user.coins, type: "game_bonus", memo });
    const resp = { ok: true, coins, balance: user.coins, memo, left: dailyMax - bucket.count };
    if (body.game === "watermelon") {
      resp.ballName = body.stage === 11 ? "金色隐藏球" : body.stage === 10 ? "彩虹隐藏球" : "白色隐藏球";
    }
    return json(resp);
  }

  /* ---------- 水排序解谜：游戏积分 ↔ 网站金币 双向兑换（1:1，日限防刷） ---------- */
  if (pathname === "/api/game/exchange" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const body = await request.json().catch(() => ({}));
    const dir = body.dir; // "toCoins" 游戏积分→金币 / "toPoints" 金币→游戏积分
    const amount = Math.floor(Number(body.amount));
    if (!dir || !amount || amount <= 0) return json({ ok: false, error: "参数错误" }, 400);

    const now = Date.now(), today = beijingDate();
    const key = userKey(me);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 401);
    const user = JSON.parse(raw);

    if (!user.wsortEx || user.wsortEx.day !== today) user.wsortEx = { day: today, toCoins: 0, toPoints: 0 };
    const ex = user.wsortEx;
    const EX_DAILY = 200; // 每日双向各限 200 积分/金币

    if (dir === "toCoins") {
      // 游戏积分 → 金币：用户传入 amount（前端已扣本地积分），服务端只负责加金币
      if (ex.toCoins + amount > EX_DAILY) return json({ ok: false, error: "今日积分兑换金币已达上限" });
      ex.toCoins += amount;
      user.coins = (user.coins || 0) + amount;
      await env.AUTH_KV.put(key, JSON.stringify(user));
      await addCoinLedger(env, me, { delta: amount, balance: user.coins, type: "game_exchange", memo: `水排序解谜 · 积分兑换金币 +${amount}` });
      return json({ ok: true, dir, amount, balance: user.coins, leftToday: EX_DAILY - ex.toCoins });
    } else if (dir === "toPoints") {
      // 金币 → 游戏积分：扣用户金币，返回积分给前端存 localStorage
      if (ex.toPoints + amount > EX_DAILY) return json({ ok: false, error: "今日金币兑换积分已达上限" });
      if ((user.coins || 0) < amount) return json({ ok: false, error: "金币不足" });
      ex.toPoints += amount;
      user.coins -= amount;
      await env.AUTH_KV.put(key, JSON.stringify(user));
      await addCoinLedger(env, me, { delta: -amount, balance: user.coins, type: "game_exchange", memo: `水排序解谜 · 金币兑换积分 -${amount}` });
      return json({ ok: true, dir, amount, balance: user.coins, leftToday: EX_DAILY - ex.toPoints });
    }
    return json({ ok: false, error: "未知方向" }, 400);
  }

  /* ---------- VIP 会员：250 金币 / 30 天，可叠加续费 ---------- */
  if (pathname === "/api/vip" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const body = await request.json().catch(() => ({}));
    if (body.action !== "buy") return json({ ok: false, error: "操作错误" }, 400);

    const key = userKey(me);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 401);
    const user = JSON.parse(raw);
    normalizeVip(user); // 若上次已过期先回收
    if ((user.coins || 0) < VIP_PRICE) {
      return json({ ok: false, error: `金币不够，VIP 需要 ${VIP_PRICE} 金币（每天签到最多能领 40）`, coins: user.coins || 0 }, 400);
    }
    user.coins -= VIP_PRICE;
    // 已在有效期内续费则往后叠加，否则从现在起算
    const base = isVipActive(user) ? user.vipUntil : Date.now();
    user.vipUntil = base + VIP_MS;
    // 开通后自动换上 VIP 专属套装，用户随时可以再换回别的
    user.frame = VIP_FRAME;
    user.bubble = VIP_BUBBLE;
    await env.AUTH_KV.put(key, JSON.stringify(user));
    await addCoinLedger(env, me, { delta: -VIP_PRICE, balance: user.coins, type: "vip", memo: isVipActive(user) && base > Date.now() ? "续费 VIP 30 天" : "开通 VIP 30 天" });
    return json({ ok: true, ...meView(user) }, 200);
  }

  /* ---------- 兑换商店：购买 / 装备 / 卸下 ---------- */
  if (pathname === "/api/shop" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const body = await request.json().catch(() => ({}));
    const { action, type, id } = body;
    if (!["frame", "bubble"].includes(type)) return json({ ok: false, error: "商品类型错误" }, 400);
    const catalog = type === "frame" ? FRAME_SHOP : BUBBLE_SHOP;
    const vipId = type === "frame" ? VIP_FRAME : VIP_BUBBLE;
    const canUse = type === "frame" ? canUseFrame : canUseBubble;
    if (!["buy", "equip", "unequip"].includes(action)) return json({ ok: false, error: "操作错误" }, 400);

    const key = userKey(me);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 401);
    const user = JSON.parse(raw);
    const vipChanged = normalizeVip(user);
    const ownedKey = type === "frame" ? "frames" : "bubbles";
    const equipKey = type;
    user[ownedKey] = Array.isArray(user[ownedKey]) ? user[ownedKey] : [];

    if (action === "unequip") {
      user[equipKey] = null;
      await env.AUTH_KV.put(key, JSON.stringify(user));
      return json({ ok: true, ...meView(user) }, 200);
    }

    // VIP 专属款只认会员，不参与金币购买
    if (id === vipId) {
      if (action === "buy") return json({ ok: false, error: "这是 VIP 专属装扮，开通会员即可使用" }, 400);
      if (!isVipActive(user)) return json({ ok: false, error: "VIP 已过期，续费后才能装备" }, 403);
      user[equipKey] = id;
      await env.AUTH_KV.put(key, JSON.stringify(user));
      return json({ ok: true, ...meView(user) }, 200);
    }

    const price = catalog[id];
    if (price === undefined) return json({ ok: false, error: "商品不存在" }, 400);

    if (action === "buy") {
      if (user[ownedKey].includes(id)) return json({ ok: false, error: "已经拥有了" }, 400);
      if ((user.coins || 0) < price) return json({ ok: false, error: "金币不够，明天记得签到～" }, 400);
      user.coins -= price;
      user[ownedKey].push(id);
      user[equipKey] = id; // 买完自动装备
      await env.AUTH_KV.put(key, JSON.stringify(user));
      await addCoinLedger(env, me, { delta: -price, balance: user.coins, type: "shop", memo: `兑换商店：${type === "frame" ? "头像框 " : "聊天气泡 "}${id}` });
      return json({ ok: true, ...meView(user) }, 200);
    }

    // equip
    if (!canUse(user, id)) return json({ ok: false, error: "还没拥有这件商品" }, 400);
    user[equipKey] = id;
    await env.AUTH_KV.put(key, JSON.stringify(user));
    return json({ ok: true, ...meView(user) }, 200);
  }

  /* ---------- 站队投票：游客按 IP、登录按账号+IP ---------- */
  if (pathname === "/api/vote") {
    if (method === "GET") {
      const me = await getSessionUser(request, env);
      const uKey = me ? `u:${me.toLowerCase()}` : null;
      const iKey = `i:${clientIp(request)}`;
      const raws = await Promise.all(VOTE_QUESTIONS.map(q => env.AUTH_KV.get(voteKey(q.id))));
      const results = VOTE_QUESTIONS.map((q, i) => {
        const rec = parseVote(raws[i]);
        return { id: q.id, a: rec.a, b: rec.b, mine: voteMine(rec, uKey, iKey) };
      });
      return json({ ok: true, results }, 200);
    }

    if (method === "POST") {
      const me = await getSessionUser(request, env);
      const body = await request.json().catch(() => ({}));
      const { id, action, side } = body;
      if (!VOTE_IDS.has(id)) return json({ ok: false, error: "投票不存在" }, 400);
      if (!["vote", "cancel"].includes(action)) return json({ ok: false, error: "操作错误" }, 400);
      if (action === "vote" && !["a", "b"].includes(side)) {
        return json({ ok: false, error: "请选择一边" }, 400);
      }

      const uKey = me ? `u:${me.toLowerCase()}` : null;
      const iKey = `i:${clientIp(request)}`;
      const key = voteKey(id);
      const rec = parseVote(await env.AUTH_KV.get(key));
      const mine = voteMine(rec, uKey, iKey);

      if (action === "vote") {
        // 换边必须先取消；同一账号/IP 只有一次有效票
        if (mine === side) return json({ ok: false, error: "你已经站这边了，想改主意请先取消" }, 400);
        if (mine) return json({ ok: false, error: "换边要先取消当前投票，再选另一边" }, 400);
        rec[side] += 1;
        rec.v[iKey] = side;
        if (uKey) rec.v[uKey] = side; // 账号票独立记录，换 IP 也不能再投
      } else {
        if (!mine) return json({ ok: false, error: "你还没有投票" }, 400);
        rec[mine] = Math.max(0, rec[mine] - 1);
        // 只清与当前票同向的身份键，避免误删同 IP 其他人的记录
        if (rec.v[iKey] === mine) delete rec.v[iKey];
        if (uKey && rec.v[uKey] === mine) delete rec.v[uKey];
      }

      await env.AUTH_KV.put(key, JSON.stringify({ a: rec.a, b: rec.b, v: rec.v }));
      return json({ ok: true, id, a: rec.a, b: rec.b, mine: action === "vote" ? side : null }, 200);
    }
  }

  /* ---------- 二手交易：发布 / 拍下（担保）/ 完成 / 下架 ---------- */
  if (pathname === "/api/market") {
    const me = await getSessionUser(request, env);

    if (method === "GET") {
      const list = await loadMarket(env);
      if (await settleExpiredMarket(env, list)) {
        try { await env.AUTH_KV.put(MARKET_KEY, JSON.stringify(list)); } catch { /* 写失败本次照旧数据展示 */ }
      }
      const meLower = me ? me.toLowerCase() : null;
      const open = list.filter(l => l.status === "open")
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(marketView);
      const mine = meLower
        ? list.filter(l => l.owner === meLower || l.taker === meLower).map(marketView)
        : [];
      let vip = false;
      if (meLower) {
        const raw = await env.AUTH_KV.get(userKey(meLower));
        if (raw) {
          try { vip = isVipActive(JSON.parse(raw)); } catch { /* 损坏按非会员 */ }
        }
      }
      const used = meLower ? list.filter(l => l.owner === meLower).length : 0;
      return json({
        ok: true, open, mine, me: meLower,
        slots: { used, max: vip ? MARKET_SLOTS_VIP : MARKET_SLOTS_FREE, vip },
      }, 200);
    }

    if (method === "POST") {
      if (!me) return json({ ok: false, error: "请先登录" }, 401);
      const meLower = me.toLowerCase();
      const body = await request.json().catch(() => ({}));
      const action = body.action;
      const list = await loadMarket(env);
      await settleExpiredMarket(env, list);

      /* 发布帖子 */
      if (action === "post") {
        const type = body.type;
        if (!MARKET_TYPES.has(type)) return json({ ok: false, error: "交易类型错误" }, 400);
        const item = String(body.item || "").trim();
        if (!item) return json({ ok: false, error: "请填写物品名称" }, 400);
        if (item.length > MARKET_ITEM_MAX) return json({ ok: false, error: `物品名不能超过 ${MARKET_ITEM_MAX} 个字` }, 400);
        // barter 不再要求填"想换的物品"，双方聊天里自由谈
        const want = null;
        const desc = String(body.desc || "").trim().slice(0, MARKET_DESC_MAX);

        let price = 0;
        if (type !== "barter") {
          price = Number(body.price);
          if (!Number.isInteger(price) || price < 0 || price > MARKET_MAX_PRICE) {
            return json({ ok: false, error: `定价只能是 0～${MARKET_MAX_PRICE} 的整数金币` }, 400);
          }
        }

        // 栏位：统计本人所有在架帖子（进行中的也算，完成/下架即移除）
        const used = list.filter(l => l.owner === meLower).length;
        const userRaw = await env.AUTH_KV.get(userKey(meLower));
        let user = null;
        if (userRaw) { try { user = JSON.parse(userRaw); } catch { /* 损坏 */ } }
        if (!user) return json({ ok: false, error: "账号异常" }, 400);
        const vip = isVipActive(user);
        const maxSlots = vip ? MARKET_SLOTS_VIP : MARKET_SLOTS_FREE;
        if (used >= maxSlots) {
          return json({ ok: false, error: `栏位已满（${maxSlots} 个），等交易完成或下架旧帖后再发` }, 400);
        }
        // MC 物品由玩家自填，网站不校验拥有权/占用（游戏内物品转移靠双方在服务器内完成）

        let id;
        do { id = randomHex(6); } while (list.some(l => l.id === id));
        const listing = {
          id, type, owner: meLower, item, want, desc, price,
          status: "open", taker: null, buyer: null, seller: null, held: 0,
          createdAt: Date.now(), takenAt: null, expireAt: null,
        };
        list.push(listing);
        await env.AUTH_KV.put(MARKET_KEY, JSON.stringify(list));
        return json({ ok: true, listing: marketView(listing) }, 200);
      }

      const id = String(body.id || "");
      const listing = list.find(l => l.id === id);
      if (!listing) return json({ ok: false, error: "帖子不存在" }, 400);

      /* 下架：仅楼主、仅未拍下 */
      if (action === "cancel") {
        if (listing.owner !== meLower) return json({ ok: false, error: "只能下架自己的帖子" }, 403);
        if (listing.status !== "open") return json({ ok: false, error: "交易进行中，不能下架" }, 400);
        const idx = list.indexOf(listing);
        list.splice(idx, 1);
        await env.AUTH_KV.put(MARKET_KEY, JSON.stringify(list));
        return json({ ok: true, id }, 200);
      }

      /* 拍下：买家金币进担保，开 7 天临时聊天 */
      if (action === "take") {
        const r = await marketTake(env, list, listing, meLower);
        if (!r.ok) return json({ ok: false, error: r.error }, r.status);
        return json({ ok: true, listing: r.listing }, 200);
      }

      /* 完成：金币结算给卖家，帖子与聊天永久删除（MC 物品在游戏内交割，网站不管）*/
      if (action === "complete") {
        if (listing.status !== "taken") return json({ ok: false, error: "交易不在进行中" }, 400);
        if (meLower !== listing.owner && meLower !== listing.taker) {
          return json({ ok: false, error: "只有交易双方能操作" }, 403);
        }
        if (listing.held > 0 && listing.seller) await adjustUserCoins(env, listing.seller, listing.held, false, { type: "market_sold", memo: "二手交易完成，担保金币到账" });
        list.splice(list.indexOf(listing), 1);
        await env.AUTH_KV.put(MARKET_KEY, JSON.stringify(list));
        try { await env.AUTH_KV.delete(marketChatKey(id)); } catch { /* 已被 KV 清掉也无妨 */ }
        return json({ ok: true, id }, 200);
      }

      return json({ ok: false, error: "操作错误" }, 400);
    }
  }

  /* ---------- 二手交易临时聊天：仅交易双方，200 条上限，随交易完成/7 天过期删除 ---------- */
  if (pathname === "/api/market/chat") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const meLower = me.toLowerCase();
    const lid = String(new URL(request.url).searchParams.get("lid") || "");
    const access = await marketChatAccess(env, lid, meLower);
    if (access.err) return access.err;
    const listing = access.listing;
    const cKey = marketChatKey(lid);

    if (method === "GET") {
      let chat = { msgs: [] };
      const raw = await env.AUTH_KV.get(cKey);
      if (raw) { try { const c = JSON.parse(raw); if (Array.isArray(c.msgs)) chat = c; } catch { /* 损坏按空 */ } }
      const counterparty = meLower === listing.owner ? listing.taker : listing.owner;
      return json({
        ok: true,
        msgs: chat.msgs.slice(-MARKET_MSG_CAP),
        listing: marketView(listing),
        me: meLower, counterparty,
      }, 200);
    }

    if (method === "POST") {
      const body = await request.json().catch(() => ({}));
      const text = String(body.text || "").trim().slice(0, MARKET_MSG_MAX);
      if (!text) return json({ ok: false, error: "消息不能为空" }, 400);

      let chat = { msgs: [] };
      const raw = await env.AUTH_KV.get(cKey);
      if (raw) { try { const c = JSON.parse(raw); if (Array.isArray(c.msgs)) chat = c; } catch { /* 覆盖损坏记录 */ } }
      chat.msgs.push({ f: meLower, t: Date.now(), x: text });
      if (chat.msgs.length > MARKET_MSG_CAP) chat.msgs = chat.msgs.slice(-MARKET_MSG_CAP);
      // 绝对过期时间钉死在拍下时刻 +7 天，聊天再活跃也不续命
      await env.AUTH_KV.put(cKey, JSON.stringify(chat), {
        expiration: Math.ceil(listing.expireAt / 1000),
      });
      return json({ ok: true, msgs: chat.msgs }, 200);
    }
  }

  /* ---------- 在线心跳：DO 内存态，零 KV 读写 ---------- */
  if (pathname === "/api/presence") {
    const presence = collabStub(env, "presence");

    if (method === "GET") {
      return presence.fetch("https://do/presence/list");
    }

    if (method === "POST") {
      const body = await request.json().catch(() => ({}));
      const sid = String(body.sid || "").slice(0, 64);
      if (!sid) return json({ ok: false }, 400);
      const me = await getSessionUser(request, env);
      let entry = { u: null, a: 0, f: null };
      if (me) {
        let u = {};
        const uRaw = await env.AUTH_KV.get(userKey(me));
        if (uRaw) { try { u = JSON.parse(uRaw); } catch { /* 损坏用默认头像 */ } }
        entry = { u: me, a: u.avatar ?? 0, f: canUseFrame(u, u.frame) ? u.frame : null };
      }
      return doPost(presence, "/presence/beat", { sid, ...entry });
    }
  }

  if (pathname === "/api/logout" && method === "POST") {
    await destroySession(request, env);
    return json({ ok: true }, 200, authHeaders(clearCookie()));
  }

  if (pathname === "/api/register" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const username = (body.username || "").trim();
    const password = body.password || "";

    const invalid = validateCredentials(username, password);
    if (invalid) return json({ ok: false, error: invalid }, 400);

    const key = userKey(username);
    const existedRaw = await env.AUTH_KV.get(key);
    if (existedRaw) {
      try {
        const ex = JSON.parse(existedRaw);
        if (ex && ex.disabled === true) {
          return json({ ok: false, error: "用户名不合法，已注销" }, 403);
        }
      } catch { /* 解析失败按已注册处理 */ }
      return json({ ok: false, error: "该用户名已被注册" }, 409);
    }

    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    const uid = await genUid(env);
    await env.AUTH_KV.put(key, JSON.stringify({
      name: username, salt, hash, createdAt: Date.now(), uid, searchable: true, avatar: 0,
      coins: 0, streak: 0, lastCheckin: null, frames: [], bubbles: [], frame: null, bubble: null,
      vipUntil: null,
    }));
    await env.AUTH_KV.put(`uid:${uid}`, key); // UID → 用户 key 反查索引

    const cookie = await createSession(env, username);
    return json({ ok: true, username, uid }, 200, authHeaders(cookie));
  }

  if (pathname === "/api/profile") {
    const me = await getSessionUser(request, env);

    // PUT /api/profile —— 保存自己的简介（需登录，最多 1000 字）
    if (method === "PUT") {
      if (!me) return json({ ok: false, error: "请先登录" }, 401);
      const body = await request.json().catch(() => ({}));
      const text = typeof body.text === "string" ? body.text : "";
      if ([...text].length > 1000) return json({ ok: false, error: "简介不能超过 1000 字" }, 400);

      const data = { text, updatedAt: Date.now() };
      await env.AUTH_KV.put(bioKey(me), JSON.stringify(data));
      return json({ ok: true, username: me, ...data }, 200);
    }

    // GET /api/profile?u=xxx 查看指定用户；不带参数则看自己的
    if (method === "GET") {
      const url = new URL(request.url);
      const target = (url.searchParams.get("u") || me || "").trim();
      if (!target) return json({ username: null, text: "", updatedAt: null }, 200);
      if (!isValidUsername(target)) return json({ ok: false, error: "用户名无效" }, 400);

      // 用户基本信息（拿 UID）
      const uRaw = await env.AUTH_KV.get(userKey(target));
      if (!uRaw) return json({ ok: false, error: "用户不存在" }, 404);
      const u = await ensureUserFields(env, userKey(target), JSON.parse(uRaw));

      const raw = await env.AUTH_KV.get(bioKey(target));
      const vip = isVipActive(u);
      const frame = canUseFrame(u, u.frame) ? u.frame : null;
      if (!raw) {
        // 用户存在但没写简介也返回空，方便分享主页链接
        return json({ username: u.name, uid: u.uid, avatar: u.avatar ?? 0, frame, vip, searchable: u.searchable, text: "", updatedAt: null }, 200);
      }
      const data = JSON.parse(raw);
      return json({ username: u.name, uid: u.uid, avatar: u.avatar ?? 0, frame, vip, searchable: u.searchable, text: data.text || "", updatedAt: data.updatedAt || null }, 200);
    }
  }

  const ADMIN_USER = "AaronXie";

  if (pathname === "/api/announce") {
    // GET：公开读取
    if (method === "GET") {
      const raw = await env.AUTH_KV.get("announce:main");
      if (!raw) return json({ text: "", updatedAt: null }, 200);
      const data = JSON.parse(raw);
      return json({ text: data.text || "", updatedAt: data.updatedAt || null }, 200);
    }
    // POST 或 PUT：仅 AaronXie 可编辑
    if (method === "POST" || method === "PUT") {
      const me = await getSessionUser(request, env);
      if (!me) return json({ ok: false, error: "请先登录" }, 401);
      if (me.toLowerCase() !== ADMIN_USER.toLowerCase()) {
        return json({ ok: false, error: "只有管理员才能编辑公告" }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const text = typeof body.text === "string" ? body.text : "";
      if ([...text].length > 2000) return json({ ok: false, error: "公告不能超过 2000 字" }, 400);

      const data = { text, updatedAt: Date.now() };
      await env.AUTH_KV.put("announce:main", JSON.stringify(data));
      return json({ ok: true, ...data }, 200);
    }
  }

  /* ---------- 管理员：用户金币管理（仅 AaronXie） ---------- */

  // 解析用户名或 12 位 UID → 用户记录；不存在返回 null
  async function resolveAdminUser(query) {
    const q = (query || "").trim();
    if (!q) return null;
    let key = null;
    if (/^\d{12}$/.test(q)) key = (await env.AUTH_KV.get(`uid:${q}`)) || null;
    if (!key && isValidUsername(q)) key = userKey(q);
    if (!key) return null;
    const raw = await env.AUTH_KV.get(key);
    return raw ? JSON.parse(raw) : null;
  }

  const ADMIN_COIN_LOG_KEY = "admin:coinlog";
  async function appendCoinLog(entry) {
    let log = [];
    try { log = JSON.parse((await env.AUTH_KV.get(ADMIN_COIN_LOG_KEY)) || "[]"); } catch { log = []; }
    if (!Array.isArray(log)) log = [];
    log.unshift(entry);
    await env.AUTH_KV.put(ADMIN_COIN_LOG_KEY, JSON.stringify(log.slice(0, 200)));
  }

  // 查询用户：?u=用户名 或 12 位 UID
  if (pathname === "/api/admin/user" && method === "GET") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    if (me.toLowerCase() !== ADMIN_USER.toLowerCase()) return json({ ok: false, error: "没有管理员权限" }, 403);
    const u = await resolveAdminUser(new URL(request.url).searchParams.get("u"));
    if (!u) return json({ ok: false, error: "用户不存在（可用用户名或 12 位 UID）" }, 404);
    return json({
      ok: true,
      username: u.name,
      uid: u.uid || null,
      coins: u.coins || 0,
      vipUntil: u.vipUntil || null,
      vip: isVipActive(u),
      createdAt: u.createdAt || null,
      lastCheckin: u.lastCheckin || null,
      streak: u.streak || 0,
    });
  }

  // 调整金币：{u, action:"add"|"sub"|"set", amount:1~1e9整数, reason?}
  if (pathname === "/api/admin/coins" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    if (me.toLowerCase() !== ADMIN_USER.toLowerCase()) return json({ ok: false, error: "没有管理员权限" }, 403);

    const body = await request.json().catch(() => ({}));
    const action = body.action;
    if (!["add", "sub", "set"].includes(action)) return json({ ok: false, error: "操作类型无效" }, 400);
    const amount = Math.floor(Number(body.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > 1e9) {
      return json({ ok: false, error: "金额必须是 1～10 亿之间的整数" }, 400);
    }
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 100) : "";

    const q = (body.u || "").trim();
    let key = null;
    if (/^\d{12}$/.test(q)) key = (await env.AUTH_KV.get(`uid:${q}`)) || null;
    if (!key && isValidUsername(q)) key = userKey(q);
    if (!key) return json({ ok: false, error: "用户名或 UID 无效" }, 400);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 404);
    const user = JSON.parse(raw);

    const before = user.coins || 0;
    let after;
    if (action === "add") after = before + amount;
    else if (action === "set") after = amount;
    else after = Math.max(0, before - amount);
    if (after > 1e12) return json({ ok: false, error: "调整后余额超出上限" }, 400);
    user.coins = after;
    await env.AUTH_KV.put(key, JSON.stringify(user));

    const entry = {
      ts: Date.now(), admin: me, target: user.name, uid: user.uid || null,
      action, amount, before, after, reason,
      clamped: action === "sub" && before < amount, // 扣除时余额不足、已钳到 0
    };
    await appendCoinLog(entry);
    // 给被调整的用户本人账单也记一条（管理员操作对用户可见）
    await addCoinLedger(env, user.name, {
      delta: after - before, balance: after, type: "admin",
      memo: (reason ? reason + " · " : "") + `管理员 ${me}${action === "add" ? "发放" : action === "sub" ? "扣除" : "设置"}`,
    });
    return json({ ok: true, ...entry });
  }

  // 操作日志
  if (pathname === "/api/admin/coinlog" && method === "GET") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    if (me.toLowerCase() !== ADMIN_USER.toLowerCase()) return json({ ok: false, error: "没有管理员权限" }, 403);
    let log = [];
    try { log = JSON.parse((await env.AUTH_KV.get(ADMIN_COIN_LOG_KEY)) || "[]"); } catch { log = []; }
    return json({ ok: true, log: Array.isArray(log) ? log.slice(0, 100) : [] });
  }

  /* ---------- 金币抽奖：100 金币一次，服务端开奖防伪造 ---------- */
  if (pathname === "/api/lottery/draw" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const key = userKey(me);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 401);
    const user = JSON.parse(raw);
    normalizeVip(user);
    if ((user.coins || 0) < LOTTERY_COST) {
      return json({
        ok: false,
        error: `金币不够，抽一次需要 ${LOTTERY_COST} 金币，去签到或玩小游戏赚一点吧～`,
        coins: user.coins || 0,
      }, 400);
    }
    user.coins = (user.coins || 0) - LOTTERY_COST;
    await addCoinLedger(env, me, { delta: -LOTTERY_COST, balance: user.coins, type: "lottery", memo: "抽奖 1 次" });

    // 拒绝采样消除取模偏差，roll ∈ [0, 2000)
    const buf = new Uint32Array(1);
    const cap = 0x100000000 - (0x100000000 % LOTTERY_WEIGHT_TOTAL);
    do { crypto.getRandomValues(buf); } while (buf[0] >= cap);
    const roll = buf[0] % LOTTERY_WEIGHT_TOTAL;
    let acc = 0;
    let prize = LOTTERY_PRIZES[LOTTERY_PRIZES.length - 1];
    for (const p of LOTTERY_PRIZES) {
      acc += p.w;
      if (roll < acc) { prize = p; break; }
    }

    if (prize.type === "coins") {
      user.coins += prize.amount;
      await addCoinLedger(env, me, { delta: prize.amount, balance: user.coins, type: "lottery_prize", memo: `抽奖中奖：${prize.label}` });
    } else if (prize.type === "vip") {
      // 与商店开通一致：有效期叠加并自动换上 VIP 专属套装
      const base = isVipActive(user) ? user.vipUntil : Date.now();
      user.vipUntil = base + prize.days * 24 * 3600 * 1000;
      user.frame = VIP_FRAME;
      user.bubble = VIP_BUBBLE;
    } else {
      // 游戏内物品：记待兑换列表（最新在前，最多保留 100 条），凭兑换码找腐竹领取
      const list = Array.isArray(user.lotteryPrizes) ? user.lotteryPrizes : [];
      list.unshift({ code: randomHex(3), label: prize.label, ts: Date.now() });
      user.lotteryPrizes = list.slice(0, 100);
    }

    await env.AUTH_KV.put(key, JSON.stringify(user));
    return json({ ok: true, cost: LOTTERY_COST, prize: prizeView(prize), ...meView(user) }, 200);
  }

  /* 我的待兑换游戏物品；腐竹（AaronXie）可带 ?u=用户名 核验别人的兑换码 */
  if (pathname === "/api/lottery/prizes" && method === "GET") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const target = (new URL(request.url).searchParams.get("u") || me).trim();
    if (target.toLowerCase() !== me.toLowerCase()
        && me.toLowerCase() !== ADMIN_USER.toLowerCase()) {
      return json({ ok: false, error: "只能查看自己的奖品" }, 403);
    }
    if (!isValidUsername(target)) return json({ ok: false, error: "用户名无效" }, 400);
    const raw = await env.AUTH_KV.get(userKey(target));
    if (!raw) return json({ ok: false, error: "用户不存在" }, 404);
    const u = JSON.parse(raw);
    return json({
      ok: true,
      username: u.name,
      prizes: Array.isArray(u.lotteryPrizes) ? u.lotteryPrizes : [],
    }, 200);
  }

  /* ---------- 像素画板（256×256，20 色）：状态在 PixelDO（SQLite 持久化）---------- */
  if (pathname === "/api/pixel") {
    const stub = collabStub(env, "pixel");

    if (method === "GET") {
      return stub.fetch("https://do/pixel/state");
    }

    if (method === "POST") {
      const me = await getSessionUser(request, env);
      if (!me) return json({ ok: false, error: "请先登录" }, 401);
      const body = await request.json().catch(() => ({}));
      const pixels = Array.isArray(body.pixels) ? body.pixels : null;
      if (!pixels || !pixels.length) return json({ ok: false, error: "没有要画的像素" }, 400);
      if (pixels.length > 8000) return json({ ok: false, error: "一次画得太多了，慢一点～" }, 400);
      return doPost(stub, "/pixel/pixels", { pixels });
    }
  }

  if (pathname === "/api/board") {
    const stub = collabStub(env, "board");
    // GET：公开读取文字画板
    if (method === "GET") {
      return stub.fetch("https://do/board/state");
    }
    // POST/PUT：任何登录用户都可编辑（≤3500 字，后写入者覆盖）
    if (method === "POST" || method === "PUT") {
      const me = await getSessionUser(request, env);
      if (!me) return json({ ok: false, error: "请先登录" }, 401);
      const body = await request.json().catch(() => ({}));
      const text = typeof body.text === "string" ? body.text : "";
      if ([...text].length > 3500) return json({ ok: false, error: "画板内容不能超过 3500 字" }, 400);
      return doPost(stub, "/board/save", { text, editor: me, updatedAt: Date.now() });
    }
  }

  if (pathname === "/api/search" && method === "GET") {
    const q = (new URL(request.url).searchParams.get("q") || "").trim();
    if (!q) return json({ results: [] }, 200);
    const results = [];
    const seen = new Set();
    // UID 精确搜索（12 位数字）
    const digits = q.replace(/\D/g, "");
    if (digits.length === 12) {
      const lower = await env.AUTH_KV.get(`uid:${digits}`);
      if (lower) {
        const uRaw = await env.AUTH_KV.get(lower);
        if (uRaw) {
          const u = JSON.parse(uRaw);
          if (u.searchable) {
            results.push({ username: u.name, uid: u.uid || digits, avatar: u.avatar ?? 0, frame: canUseFrame(u, u.frame) ? u.frame : null, vip: isVipActive(u) });
            seen.add(lower);
          }
        }
      }
    }
    // 用户名模糊搜索
    if (results.length < 50) {
      const ql = q.toLowerCase();
      const list = await env.AUTH_KV.list({ prefix: "user:", limit: 1000 });
      for (const k of list.keys) {
        if (results.length >= 50) break;
        if (seen.has(k.name)) continue;
        const uRaw = await env.AUTH_KV.get(k.name);
        if (!uRaw) continue;
        let u;
        try { u = JSON.parse(uRaw); } catch { continue; }
        if (!u.searchable) continue;
        if ((u.name || "").toLowerCase().includes(ql)) {
          results.push({ username: u.name, uid: u.uid || null, avatar: u.avatar ?? 0, frame: canUseFrame(u, u.frame) ? u.frame : null, vip: isVipActive(u) });
        }
      }
    }
    return json({ results }, 200);
  }

  if (pathname === "/api/avatar" && method === "POST") {
    // 选择内置头像：仅保存编号（0-19）
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const body = await request.json().catch(() => ({}));
    const avatar = Number(body.avatar);
    if (!Number.isInteger(avatar) || avatar < 0 || avatar > 19) {
      return json({ ok: false, error: "头像编号无效" }, 400);
    }
    const key = userKey(me);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 401);
    const user = JSON.parse(raw);
    user.avatar = avatar;
    await env.AUTH_KV.put(key, JSON.stringify(user));
    return json({ ok: true, avatar }, 200);
  }

  if (pathname === "/api/password" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const body = await request.json().catch(() => ({}));
    const oldP = body.oldPassword || "";
    const newP = body.newPassword || "";
    if (newP.length < 6) return json({ ok: false, error: "新密码至少 6 位" }, 400);
    const key = userKey(me);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 401);
    const user = JSON.parse(raw);
    const oldHash = await hashPassword(oldP, user.salt);
    if (oldHash !== user.hash) return json({ ok: false, error: "旧密码不正确" }, 401);
    const salt = randomHex(16);
    user.salt = salt;
    user.hash = await hashPassword(newP, salt);
    await env.AUTH_KV.put(key, JSON.stringify(user));
    return json({ ok: true }, 200);
  }

  if (pathname === "/api/searchable" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const body = await request.json().catch(() => ({}));
    const key = userKey(me);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 401);
    const user = JSON.parse(raw);
    user.searchable = !!body.enabled;
    await env.AUTH_KV.put(key, JSON.stringify(user));
    return json({ ok: true, searchable: user.searchable }, 200);
  }

  if (pathname === "/api/rename" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const body = await request.json().catch(() => ({}));
    const newName = (body.newUsername || "").trim();
    if (!isValidUsername(newName)) {
      return json({ ok: false, error: "用户名需为 2-20 位字母、数字、下划线或中文" }, 400);
    }
    const oldLower = me.toLowerCase();
    const newLower = newName.toLowerCase();
    if (newLower === oldLower) return json({ ok: false, error: "新用户名和当前一样" }, 400);
    const oldKey = userKey(me);
    const newKey = userKey(newName);
    if (await env.AUTH_KV.get(newKey)) return json({ ok: false, error: "该用户名已被注册" }, 409);

    const raw = await env.AUTH_KV.get(oldKey);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 401);
    const user = JSON.parse(raw);
    user.name = newName;
    await env.AUTH_KV.put(newKey, JSON.stringify(user));
    await env.AUTH_KV.delete(oldKey);
    if (user.uid) await env.AUTH_KV.put(`uid:${user.uid}`, newKey);

    // 迁移简介 / 书签（头像编号存在用户记录里，随 user 记录自然跟随）
    for (const [src, dst] of [
      [`bio:${oldLower}`, `bio:${newLower}`],
      [`bookmarks:${oldLower}`, `bookmarks:${newLower}`],
    ]) {
      const v = await env.AUTH_KV.get(src);
      if (v !== null) {
        await env.AUTH_KV.put(dst, v);
        await env.AUTH_KV.delete(src);
      }
    }

    // 更新当前设备的会话（其他设备的旧会话会自然失效，需重新登录）
    const token = readCookie(request, SESSION_COOKIE);
    if (token) await env.AUTH_KV.put(`session:${token}`, newName, { expirationTtl: SESSION_TTL });

    return json({ ok: true, username: newName }, 200);
  }

  // ============ 聊天室（网页 + MC 互通，最近 100 条由 ChatDO 存 SQLite）============
  const MSG_MAX = 500;

  if (pathname === "/api/chat") {
    const chat = collabStub(env, "chat");

    if (method === "GET") {
      return chat.fetch("https://do/chat/state");
    }

    if (method === "POST") {
      const me = await getSessionUser(request, env);
      if (!me) return json({ ok: false, error: "请先登录" }, 401);
      const body = await request.json().catch(() => ({}));
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) return json({ ok: false, error: "消息不能为空" }, 400);
      if ([...text].length > MSG_MAX) return json({ ok: false, error: `每条消息最多 ${MSG_MAX} 字` }, 400);

      const uRaw = await env.AUTH_KV.get(userKey(me));
      const u = uRaw ? JSON.parse(uRaw) : {};
      const msg = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        username: me,
        avatar: u.avatar ?? 0,
        frame: canUseFrame(u, u.frame) ? u.frame : null,
        bubble: canUseBubble(u, u.bubble) ? u.bubble : null,
        vip: isVipActive(u),
        text,
        ts: Date.now(),
        source: "web",
      };
      const appendResp = await doPost(chat, "/chat/append", { message: msg });
      if (!appendResp.ok) return appendResp;
      // 网页 -> 游戏方向由 mod 轮询 /api/mc/poll 完成（面板服无公网 RCON 端口）
      return json({ ok: true, message: msg }, 200);
    }
  }

  // MC 服务端 mod 轮询网页新消息（X-MC-Secret 鉴权，?after=上次收到的 ts）
  if (pathname === "/api/mc/poll" && method === "GET") {
    const secret = request.headers.get("X-MC-Secret") || "";
    if (!env.MC_INGEST_SECRET || secret !== env.MC_INGEST_SECRET) {
      return json({ ok: false, error: "密钥无效" }, 401);
    }
    const after = Number(new URL(request.url).searchParams.get("after")) || 0;
    const stateResp = await collabStub(env, "chat").fetch("https://do/chat/state");
    const state = await stateResp.json().catch(() => ({ messages: [] }));
    // 游戏内消息不回灌游戏，只推网页来源的
    const messages = (state.messages || [])
      .filter(m => m && m.source !== "mc" && Number(m.ts) > after);
    const latest = messages.length ? messages[messages.length - 1].ts : after;
    return json({ ok: true, messages, latest }, 200);
  }

  // MC 服务端 mod 上报游戏内聊天 / 死亡 / 加入 / 退出（X-MC-Secret 鉴权）
  // body.kind: "chat"(默认) | "death" | "join" | "quit"
  if (pathname === "/api/mc/ingest" && method === "POST") {
    const secret = request.headers.get("X-MC-Secret") || "";
    if (!env.MC_INGEST_SECRET || secret !== env.MC_INGEST_SECRET) {
      return json({ ok: false, error: "密钥无效" }, 401);
    }
    const body = await request.json().catch(() => ({}));
    const username = typeof body.username === "string" ? body.username.trim() : "";
    // MC 正版用户名规则
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
      return json({ ok: false, error: "用户名不合法" }, 400);
    }
    const kind = ["death", "join", "quit"].includes(body.kind) ? body.kind : "chat";
    let text;
    if (kind === "join" || kind === "quit") {
      // 加入/退出无正文，服务端统一补齐，前端按 kind 渲染
      text = kind === "join" ? "加入了游戏" : "退出了游戏";
    } else {
      // chat / death 必须带文本（聊天内容按 MC 上限 256，死亡提示同样不会超长）
      text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text || [...text].length > 256) {
        return json({ ok: false, error: "消息内容不合法" }, 400);
      }
    }
    const msg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      username,
      text,
      ts: Date.now(),
      source: "mc",
      kind,
    };
    return doPost(collabStub(env, "chat"), "/chat/append", { message: msg });
  }

  // MC 死亡榜（公开只读）：返回累计死亡次数 Top N
  if (pathname === "/api/mc/deaths" && method === "GET") {
    return collabStub(env, "chat").fetch(new Request("https://do/chat/deaths"));
  }

  /* ---------- MC 游戏内二手交易 ----------
     绑定：网页登录后 POST /api/mc/bind-code 生成 6 位一次性码（10 分钟有效），
     游戏内 /buybind <码> → mod 调 /api/mc/market/bind，建立 mc:bind:<mcname>=网站用户名。
     之后 MC 侧所有请求：X-MC-Secret 证明是服务器，mcname 经绑定映射身份。*/

  // 生成绑定码（网页登录用户，一次性 6 位数字，10 分钟有效）
  if (pathname === "/api/mc/bind-code" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await env.AUTH_KV.put(`mc:bindcode:${code}`, me.toLowerCase(), { expirationTtl: 600 });
    return json({ ok: true, code, expiresIn: 600 }, 200);
  }

  // mod 上报绑定码 + MC 用户名，建立绑定
  if (pathname === "/api/mc/market/bind" && method === "POST") {
    const secret = request.headers.get("X-MC-Secret") || "";
    if (!env.MC_INGEST_SECRET || secret !== env.MC_INGEST_SECRET) {
      return json({ ok: false, error: "密钥无效" }, 401);
    }
    const body = await request.json().catch(() => ({}));
    const mcname = String(body.mcname || "").trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(mcname)) {
      return json({ ok: false, error: "MC 用户名不合法" }, 400);
    }
    const code = String(body.code || "").trim();
    const codeKey = `mc:bindcode:${code}`;
    const owner = await env.AUTH_KV.get(codeKey);
    if (!owner) return json({ ok: false, error: "绑定码无效或已过期" }, 400);
    await env.AUTH_KV.delete(codeKey); // 一次性，用过即废
    await env.AUTH_KV.put(`mc:bind:${mcname.toLowerCase()}`, owner);
    return json({ ok: true, user: owner, mcname }, 200);
  }

  // 游戏内看在架物品（无需绑定，密钥对就行）。带 mcname 时顺带返回绑定身份，
  // mod 用它把「我自己的帖子」在箱子里标出来（自己的帖不能拍）。
  if (pathname === "/api/mc/market" && method === "GET") {
    const secret = request.headers.get("X-MC-Secret") || "";
    if (!env.MC_INGEST_SECRET || secret !== env.MC_INGEST_SECRET) {
      return json({ ok: false, error: "密钥无效" }, 401);
    }
    const list = await loadMarket(env);
    if (await settleExpiredMarket(env, list)) {
      try { await env.AUTH_KV.put(MARKET_KEY, JSON.stringify(list)); } catch { /* 照旧展示 */ }
    }
    const open = list.filter(l => l.status === "open")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(marketView);
    let me = null;
    const mcname = String(new URL(request.url).searchParams.get("mcname") || "").trim();
    if (/^[A-Za-z0-9_]{3,16}$/.test(mcname)) {
      me = await env.AUTH_KV.get(`mc:bind:${mcname.toLowerCase()}`);
    }
    return json({ ok: true, open, me }, 200);
  }

  // 游戏内挂单：POST { mcname, type, item, desc, price }（校验与网页发帖一致）
  if (pathname === "/api/mc/market/post" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const auth = await mcBoundUser(env, request, String(body.mcname || ""));
    if (auth.err) return auth.err;
    const meLower = auth.user;
    const type = body.type;
    if (!MARKET_TYPES.has(type)) return json({ ok: false, error: "交易类型错误" }, 400);
    const item = String(body.item || "").trim();
    if (!item) return json({ ok: false, error: "请填写物品名称" }, 400);
    if (item.length > MARKET_ITEM_MAX) return json({ ok: false, error: `物品名不能超过 ${MARKET_ITEM_MAX} 个字` }, 400);
    const desc = String(body.desc || "").trim().slice(0, MARKET_DESC_MAX);
    let price = 0;
    if (type !== "barter") {
      price = Number(body.price);
      if (!Number.isInteger(price) || price < 0 || price > MARKET_MAX_PRICE) {
        return json({ ok: false, error: `定价只能是 0～${MARKET_MAX_PRICE} 的整数金币` }, 400);
      }
    }
    const list = await loadMarket(env);
    await settleExpiredMarket(env, list);
    const used = list.filter(l => l.owner === meLower).length;
    const userRaw = await env.AUTH_KV.get(userKey(meLower));
    let user = null;
    if (userRaw) { try { user = JSON.parse(userRaw); } catch { /* 损坏 */ } }
    if (!user) return json({ ok: false, error: "账号异常" }, 400);
    const maxSlots = isVipActive(user) ? MARKET_SLOTS_VIP : MARKET_SLOTS_FREE;
    if (used >= maxSlots) {
      return json({ ok: false, error: `栏位已满（${maxSlots} 个），等交易完成或下架旧帖后再发` }, 400);
    }
    let id;
    do { id = randomHex(6); } while (list.some(l => l.id === id));
    const listing = {
      id, type, owner: meLower, item, want: null, desc, price,
      status: "open", taker: null, buyer: null, seller: null, held: 0,
      createdAt: Date.now(), takenAt: null, expireAt: null,
    };
    list.push(listing);
    await env.AUTH_KV.put(MARKET_KEY, JSON.stringify(list));
    return json({ ok: true, listing: marketView(listing) }, 200);
  }

  // 游戏内拍下：POST { id, mcname }
  if (pathname === "/api/mc/market/take" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const auth = await mcBoundUser(env, request, String(body.mcname || ""));
    if (auth.err) return auth.err;
    const list = await loadMarket(env);
    await settleExpiredMarket(env, list);
    const listing = list.find(l => l.id === String(body.id || ""));
    if (!listing) return json({ ok: false, error: "帖子不存在" }, 400);
    const r = await marketTake(env, list, listing, auth.user);
    if (!r.ok) return json({ ok: false, error: r.error }, r.status);
    return json({ ok: true, listing: r.listing }, 200);
  }

  // 游戏内查看自己进行中的交易列表：GET ?mcname=xxx（/buytell 的序号对照）
  if (pathname === "/api/mc/market/chats" && method === "GET") {
    const auth = await mcBoundUser(env, request, String(new URL(request.url).searchParams.get("mcname") || ""));
    if (auth.err) return auth.err;
    const list = await loadMarket(env);
    if (await settleExpiredMarket(env, list)) {
      try { await env.AUTH_KV.put(MARKET_KEY, JSON.stringify(list)); } catch { /* 照旧展示 */ }
    }
    const chats = list.filter(l => l.status === "taken" && (l.owner === auth.user || l.taker === auth.user))
      .sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0))
      .map(marketView);
    return json({ ok: true, chats, me: auth.user }, 200);
  }

  // 游戏内临时聊天读写：GET ?lid&mcname / POST { lid, mcname, text }
  if (pathname === "/api/mc/market/chat") {
    let lid = "";
    let mcname = "";
    let text = "";
    if (method === "GET") {
      const q = new URL(request.url).searchParams;
      lid = String(q.get("lid") || "");
      mcname = String(q.get("mcname") || "");
    } else if (method === "POST") {
      const body = await request.json().catch(() => ({}));
      lid = String(body.lid || "");
      mcname = String(body.mcname || "");
      text = String(body.text || "").trim().slice(0, MARKET_MSG_MAX);
      if (!text) return json({ ok: false, error: "消息不能为空" }, 400);
    } else {
      return json({ ok: false, error: "方法不允许" }, 405);
    }
    const auth = await mcBoundUser(env, request, mcname);
    if (auth.err) return auth.err;
    const meLower = auth.user;
    const access = await marketChatAccess(env, lid, meLower);
    if (access.err) return access.err;
    const listing = access.listing;
    const cKey = marketChatKey(lid);

    if (method === "GET") {
      let chat = { msgs: [] };
      const raw = await env.AUTH_KV.get(cKey);
      if (raw) { try { const c = JSON.parse(raw); if (Array.isArray(c.msgs)) chat = c; } catch { /* 损坏按空 */ } }
      const counterparty = meLower === listing.owner ? listing.taker : listing.owner;
      return json({
        ok: true,
        msgs: chat.msgs.slice(-MARKET_MSG_CAP),
        listing: marketView(listing),
        me: meLower, counterparty,
      }, 200);
    }

    // POST 发消息：沿用 7 天绝对过期，不续命
    let chat = { msgs: [] };
    const raw = await env.AUTH_KV.get(cKey);
    if (raw) { try { const c = JSON.parse(raw); if (Array.isArray(c.msgs)) chat = c; } catch { /* 覆盖损坏记录 */ } }
    chat.msgs.push({ f: meLower, t: Date.now(), x: text });
    if (chat.msgs.length > MARKET_MSG_CAP) chat.msgs = chat.msgs.slice(-MARKET_MSG_CAP);
    await env.AUTH_KV.put(cKey, JSON.stringify(chat), {
      expiration: Math.ceil(listing.expireAt / 1000),
    });
    return json({ ok: true, msgs: chat.msgs }, 200);
  }

  /* ---------- DontClick 存档：云端保存玩家进度（DO SQLite，登录用户）---------- */
  if (pathname === "/api/dc/save") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    // slot=classic 为怀旧版独立存档槽，其余为主槽
    const slot = new URL(request.url).searchParams.get("slot") === "classic" ? "classic" : "main";

    // GET：读取云端存档
    if (method === "GET") {
      return doPost(collabStub(env, "dc"), "/dc/get", { username: me, slot });
    }
    // POST：写入云端存档（body.data 为 JSON 字符串）
    if (method === "POST") {
      const body = await request.json().catch(() => ({}));
      const data = typeof body.data === "string" ? body.data.slice(0, 200000) : "";
      if (!data) return json({ ok: false, error: "存档内容为空" }, 400);
      const bodySlot = body.slot === "classic" ? "classic" : slot;
      return doPost(collabStub(env, "dc"), "/dc/set", { username: me, slot: bodySlot, data });
    }
    return json({ ok: false, error: "method" }, 405);
  }

  /* ---------- DontClick Infinity 飞升：服务端校验后发全站金币（DO 原子处理） ---------- */
  if (pathname === "/api/dc/ascend" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const body = await request.json().catch(() => ({}));
    const data = typeof body.data === "string" ? body.data.slice(0, 200000) : "";
    if (!data) return json({ ok: false, error: "飞升存档为空" }, 400);
    return doPost(collabStub(env, "dc"), "/dc/ascend", { username: me, data });
  }

  /* ---------- DontClick 排行榜（金币 / 反骨之魂 / 点击数，公开） ---------- */
  if (pathname === "/api/dc/leaderboard" && method === "GET") {
    const me = await getSessionUser(request, env);
    return doPost(collabStub(env, "dc"), "/dc/leaderboard", { me: me || null });
  }

  if (pathname === "/api/bookmarks") {
    // 全部需要登录
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const key = bookmarksKey(me);

    // GET：列出我的书签
    if (method === "GET") {
      const list = await readBookmarks(env, key);
      return json({ ok: true, bookmarks: list }, 200);
    }

    // POST：添加书签（每人最多 15 个，网址去重）
    if (method === "POST") {
      const body = await request.json().catch(() => ({}));
      let url = (body.url || "").trim();
      let title = (body.title || "").trim().slice(0, 100);
      if (!/^https?:\/\/.+/i.test(url) || url.length > 500) {
        return json({ ok: false, error: "网址格式不正确" }, 400);
      }
      // 规范化网址（补全末尾斜杠等），避免同一页面因写法不同重复收藏
      try { url = new URL(url).href; } catch { return json({ ok: false, error: "网址格式不正确" }, 400); }
      if (!title) title = hostnameOf(url);

      const list = await readBookmarks(env, key);
      if (list.some(b => b.url === url)) return json({ ok: false, error: "这个网址已经收藏过了" }, 409);
      if (list.length >= 15) return json({ ok: false, error: "书签最多 15 个，先删一个再收藏吧" }, 400);

      list.unshift({ id: randomHex(6), title, url, ts: Date.now() });
      await env.AUTH_KV.put(key, JSON.stringify(list));
      return json({ ok: true, bookmarks: list }, 200);
    }

    // DELETE ?id=xxx：删除书签
    if (method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id");
      const list = await readBookmarks(env, key);
      const next = list.filter(b => b.id !== id);
      if (next.length === list.length) return json({ ok: false, error: "书签不存在" }, 404);
      await env.AUTH_KV.put(key, JSON.stringify(next));
      return json({ ok: true, bookmarks: next }, 200);
    }
  }

  if (pathname === "/api/login" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const loginId = (body.username || "").trim();
    const password = body.password || "";

    // 支持 XRSTUID 登录：输入为 12 位纯数字时，先查 UID 反查索引
    let key = userKey(loginId);
    if (/^\d{12}$/.test(loginId)) {
      const mapped = await env.AUTH_KV.get(`uid:${loginId}`);
      if (mapped) key = mapped;
    }

    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在，请先注册" }, 401);

    const user = JSON.parse(raw);
    if (user.disabled === true) {
      return json({ ok: false, error: "用户名不合法，已注销" }, 403);
    }
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.hash) return json({ ok: false, error: "密码错误" }, 401);

    const cookie = await createSession(env, user.name);
    return json({ ok: true, username: user.name }, 200, authHeaders(cookie));
  }

  // ============「偷还是分？」双人金币博弈（匹配大厅 + 单局 DO）============
  const SPLIT_GAME_RE = /^\/api\/split\/game\/([a-f0-9]{64})(?:\/(choice|quit))?$/;

  /* 开始匹配：押金 1～10 金币先入池（KV 扣除），DO 不碰押金；5 秒无真人由人机补位 */
  if (pathname === "/api/split/match" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const body = await request.json().catch(() => ({}));
    const ante = Number(body.ante);
    if (!Number.isInteger(ante) || ante < 1 || ante > 10) {
      return json({ ok: false, error: "押金只能是 1～10 个金币" }, 400);
    }

    // 已有队列/对局：恢复，不重复扣费
    const activeResp = await doPost(lobbyStub(env), "/lobby/active", { u: me });
    const active = await activeResp.json().catch(() => ({ active: false }));
    if (active && active.active) {
      return json({ ok: true, resumed: true, queued: !!active.queued, gameId: active.gameId || null });
    }

    // 扣押金
    const key = userKey(me);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 401);
    const user = JSON.parse(raw);
    if ((user.coins || 0) < ante) {
      return json({ ok: false, error: "金币不够，先去首页签到攒一点吧～" }, 400);
    }
    user.coins = (user.coins || 0) - ante;
    await env.AUTH_KV.put(key, JSON.stringify(user));
    await addCoinLedger(env, me, { delta: -ante, balance: user.coins, type: "split_ante", memo: "「偷还是分？」入场押金" });

    const joinResp = await doPost(lobbyStub(env), "/lobby/join", {
      u: me, ante, avatar: user.avatar ?? 0,
    });
    const join = await joinResp.json().catch(() => ({ ok: false, error: "匹配服务异常" }));
    if (!joinResp.ok || !join.ok) {
      await adjustUserCoins(env, me, ante, false, { type: "split_refund", memo: "匹配失败，入场押金退回" }); // DO 拒绝：立即退款
      return json(join, joinResp.status || 502);
    }
    if (join.resumed) await adjustUserCoins(env, me, ante, false, { type: "split_refund", memo: "重复排队扣款退回" }); // 并发竞态：退重复扣款
    return json(join);
  }

  /* 取消排队：退回押金 */
  if (pathname === "/api/split/cancel" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const resp = await doPost(lobbyStub(env), "/lobby/cancel", { u: me });
    const data = await resp.json().catch(() => ({ ok: false }));
    if (data.ok && data.refund > 0) await adjustUserCoins(env, me, Number(data.refund), false, { type: "split_refund", memo: "取消排队，入场押金退回" });
    return json(data, resp.ok ? 200 : 502);
  }

  /* 恢复：我当前是否在排队/对局中 */
  if (pathname === "/api/split/active" && method === "GET") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ active: false }, 200);
    return doPost(lobbyStub(env), "/lobby/active", { u: me });
  }

  /* 对局长轮询 / 提交选择 / 逃跑（仅参与者，DO 内二次鉴权）*/
  const gm = pathname.match(SPLIT_GAME_RE);
  if (gm && (method === "GET" || method === "POST")) {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const stub = env.GAME_DO.get(env.GAME_DO.idFromString(gm[1]));
    if (method === "GET") {
      const ver = parseInt(new URL(request.url).searchParams.get("ver") || "0", 10) || 0;
      return stub.fetch(`https://do/match/state?u=${encodeURIComponent(me)}&ver=${ver}`);
    }
    const action = gm[2];
    if (action !== "choice" && action !== "quit") {
      return json({ ok: false, error: "Not found" }, 404);
    }
    const reqBody = await request.json().catch(() => ({}));
    return doPost(stub, `/match/${action}`, { ...reqBody, u: me });
  }

  // === 回声洞 (PCL.Mac XE) ===
  if (pathname === "/api/cave" && method === "GET") {
    const msgs = await getCaveMessages(env);
    return json({ code: 0, msg: "success", data: msgs });
  }
  if (pathname === "/api/cave/submit" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ code: 401, msg: "请先登录", data: null }, 401);
    const body = await request.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return json({ code: 400, msg: "消息不能为空", data: null }, 400);
    if (text.length > 500) return json({ code: 400, msg: "消息不能超过 500 字", data: null }, 400);
    await submitCaveMessage(env, text, me);
    return json({ code: 0, msg: "success", data: null });
  }
  if (pathname === "/api/cave/pending" && method === "GET") {
    const me = await getSessionUser(request, env);
    if (!me || me.toLowerCase() !== ADMIN_USER.toLowerCase()) {
      return json({ code: 403, msg: "没有管理员权限", data: null }, 403);
    }
    const pending = await getCavePending(env);
    return json({ code: 0, msg: "success", data: pending });
  }
  if (pathname === "/api/cave/adopt" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me || me.toLowerCase() !== ADMIN_USER.toLowerCase()) {
      return json({ code: 403, msg: "没有管理员权限", data: null }, 403);
    }
    const body = await request.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return json({ code: 400, msg: "消息不能为空", data: null }, 400);
    await adoptCaveMessage(env, text);
    return json({ code: 0, msg: "success", data: null });
  }
  if (pathname === "/api/cave/reject" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me || me.toLowerCase() !== ADMIN_USER.toLowerCase()) {
      return json({ code: 403, msg: "没有管理员权限", data: null }, 403);
    }
    const body = await request.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return json({ code: 400, msg: "消息不能为空", data: null }, 400);
    await rejectCaveMessage(env, text);
    return json({ code: 0, msg: "success", data: null });
  }

  return json({ ok: false, error: "Not found" }, 404);
}

/*「偷还是分？」匹配大厅（具名单实例）*/
function lobbyStub(env) {
  return env.GAME_LOBBY_DO.get(env.GAME_LOBBY_DO.idFromName("lobby"));
}

/* 金币账单流水：每用户一个 KV 键，最新在前，最多保留 100 条。
   写流水失败只吞错，绝不能阻断金币交易主流程。*/
async function addCoinLedger(env, username, entry) {
  try {
    const lkey = `coinlog:${String(username).toLowerCase()}`;
    let log = [];
    try { log = JSON.parse((await env.AUTH_KV.get(lkey)) || "[]"); } catch { log = []; }
    if (!Array.isArray(log)) log = [];
    log.unshift({ ts: Date.now(), delta: 0, balance: 0, type: "", memo: "", ...entry });
    await env.AUTH_KV.put(lkey, JSON.stringify(log.slice(0, 100)));
  } catch { /* 忽略账单错误 */ }
}

/* KV 用户金币增减（退款等 worker 侧记账；罚金扣减不允许变成负数）
   ledger = { type, memo } 时同步写一条账单流水 */
async function adjustUserCoins(env, username, delta, clampZero = false, ledger = null) {
  const key = userKey(username);
  const raw = await env.AUTH_KV.get(key);
  if (!raw) return false;
  const user = JSON.parse(raw);
  let coins = (user.coins || 0) + delta;
  if (clampZero && coins < 0) coins = 0;
  user.coins = coins;
  await env.AUTH_KV.put(key, JSON.stringify(user));
  if (ledger) await addCoinLedger(env, username, { delta, balance: coins, type: ledger.type, memo: ledger.memo || "" });
  return true;
}

/* 当天聚合型账单（如小游戏计时奖励，全天只占一条，随玩随累加金额与时长）。
   updater(prevEntry|null) 返回 {deltaAdd, balance, memo} 或 null（不更新）*/
async function updateDailyLedger(env, username, type, updater) {
  try {
    const lkey = `coinlog:${String(username).toLowerCase()}`;
    const today = beijingDate();
    let log = [];
    try { log = JSON.parse((await env.AUTH_KV.get(lkey)) || "[]"); } catch { log = []; }
    if (!Array.isArray(log)) log = [];
    const isToday = ts => new Date(ts + 8 * 3600 * 1000).toISOString().slice(0, 10) === today;
    const idx = log.findIndex(e => e.type === type && isToday(e.ts));
    const cur = idx >= 0 ? log[idx] : null;
    const u = await updater(cur);
    if (!u) return;
    if (idx >= 0) {
      log[idx] = {
        ...log[idx],
        delta: Math.max(0, (log[idx].delta || 0) + (u.deltaAdd || 0)),
        balance: u.balance, ts: Date.now(), memo: u.memo,
      };
    } else {
      log.unshift({ ts: Date.now(), delta: Math.max(0, u.deltaAdd || 0), balance: u.balance, type, memo: u.memo });
    }
    await env.AUTH_KV.put(lkey, JSON.stringify(log.slice(0, 100)));
  } catch { /* 账单失败不影响主流程 */ }
}

/* ---------------- 工具函数 ---------------- */

// 协作类 DO 具名实例：chat / pixel / board
function collabStub(env, name) {
  return env.COLLAB_DO.get(env.COLLAB_DO.idFromName(name));
}
// 向 DO 发内部 JSON POST，响应直接透传给客户端
function doPost(stub, path, payload) {
  return stub.fetch(new Request("https://do" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      ...extraHeaders,
    },
  });
}

/* ============ 网页 -> 游戏：由 MC mod 轮询 /api/mc/poll 实现（面板服无公网 RCON）============ */

function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr);
}

async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return toHex(bits);
}

function validateCredentials(username, password) {
  if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/.test(username || "")) {
    return "用户名需为 2-20 位字母、数字、下划线或中文";
  }
  if (!password || password.length < 6) return "密码至少 6 位";
  return null;
}

function userKey(username) {
  return `user:${username.toLowerCase()}`;
}

function bioKey(username) {
  return `bio:${username.toLowerCase()}`;
}

function bookmarksKey(username) {
  return `bookmarks:${username.toLowerCase()}`;
}

/* 抽奖接口返回给前端的奖品视图（服务端配置的安全投影） */
function prizeView(p) {
  return {
    id: p.id,
    type: p.type,
    icon: p.icon,
    label: p.label,
    hidden: !!p.hidden,
    amount: p.amount || null,
    days: p.days || null,
  };
}

/* /api/me 与商店操作返回的用户视图（缺失字段按默认值，不写盘）
   frame/bubble 按当前 VIP 状态做有效性收口，过期会员不会看到自己还挂着 VIP 装扮 */
function meView(u) {
  return {
    username: u.name,
    uid: u.uid,
    avatar: u.avatar ?? 0,
    coins: u.coins || 0,
    streak: u.streak || 0,
    lastCheckin: u.lastCheckin || null,
    frames: Array.isArray(u.frames) ? u.frames : [],
    bubbles: Array.isArray(u.bubbles) ? u.bubbles : [],
    frame: canUseFrame(u, u.frame) ? u.frame : null,
    bubble: canUseBubble(u, u.bubble) ? u.bubble : null,
    vipUntil: typeof u.vipUntil === "number" ? u.vipUntil : null,
    vip: isVipActive(u),
  };
}

/* 北京时间日期串（UTC+8），offset 天可为 -1 */
function beijingDate(offset = 0) {
  const d = new Date(Date.now() + (8 * 3600 + offset * 86400) * 1000);
  return d.toISOString().slice(0, 10);
}

/* KV 容错包装：读/列举失败（额度耗尽、KV 短时故障）一律视为"无数据"，
 * 不允许异常冒泡成 500；写/删仍直接抛，由业务或全局 catch 转友好提示。 */
function faultTolerantKV(kv) {
  if (!kv || kv.__xrstSafe) return kv;
  const safe = async (key, opts) => {
    try { return await kv.get(key, opts); } catch { return null; }
  };
  return new Proxy(kv, {
    get(target, prop) {
      if (prop === "__xrstSafe") return true;
      if (prop === "get") return safe;
      if (prop === "list") {
        return async (opts) => {
          try { return await kv.list(opts); } catch { return { keys: [], list_complete: true, cursor: null }; }
        };
      }
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/* 生成 12 位纯随机数字 UID（查重直到不冲突） */
async function genUid(env) {
  for (let i = 0; i < 30; i++) {
    let uid = "";
    for (let j = 0; j < 12; j++) uid += Math.floor(Math.random() * 10);
    if (!(await env.AUTH_KV.get(`uid:${uid}`))) return uid;
  }
  throw new Error("无法生成唯一 UID");
}

/* 老用户懒补 uid / searchable 字段 */
async function ensureUserFields(env, key, user) {
  let changed = false;
  if (!user.uid) {
    user.uid = await genUid(env);
    await env.AUTH_KV.put(`uid:${user.uid}`, key);
    changed = true;
  }
  if (typeof user.searchable !== "boolean") {
    user.searchable = true;
    changed = true;
  }
  // 注意：avatar 字段缺失时不在此处写默认值——读路径写回会在 KV 跨节点
  // 延迟下覆盖用户刚选的头像（旧节点读到无 avatar 的旧记录→写回 0）。
  // 所有读取处统一用 user.avatar ?? 0。
  if (changed) await env.AUTH_KV.put(key, JSON.stringify(user));
  return user;
}

async function readBookmarks(env, key) {
  const raw = await env.AUTH_KV.get(key);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function isValidUsername(username) {
  return /^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/.test(username || "");
}

/* ---------------- 会话 ---------------- */

async function createSession(env, username) {
  const token = randomHex(32);
  await env.AUTH_KV.put(`session:${token}`, username, { expirationTtl: SESSION_TTL });
  return sessionCookie(token, SESSION_TTL);
}

async function getSessionUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const name = (await env.AUTH_KV.get(`session:${token}`)) || null;
  if (!name) return null;
  // 已注销（封号）用户：会话立即失效并清掉（强制退登）
  try {
    const raw = await env.AUTH_KV.get(userKey(name));
    const u = raw ? JSON.parse(raw) : null;
    if (!u || u.disabled === true) {
      try { await env.AUTH_KV.delete(`session:${token}`); } catch { /* 忽略 */ }
      return null;
    }
  } catch { /* 读取失败不阻断登录态 */ }
  return name;
}

async function destroySession(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  // 删除失败（额度耗尽等）不阻断登出：cookie 清掉会话即失效
  if (token) {
    try { await env.AUTH_KV.delete(`session:${token}`); } catch { /* 忽略 */ }
  }
}

function readCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([a-f0-9]+)`));
  return m ? m[1] : null;
}

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function authHeaders(cookie) {
  return { "Set-Cookie": cookie };
}

// === 回声洞 Helper (PCL.Mac XE) ===
async function getCaveMessages(env) {
  try {
    const raw = await env.AUTH_KV.get("cave:messages");
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}
async function getCavePending(env) {
  try {
    const raw = await env.AUTH_KV.get("cave:pending");
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}
async function submitCaveMessage(env, text, user) {
  const pending = await getCavePending(env);
  pending.push({ text, user, ts: Date.now() });
  await env.AUTH_KV.put("cave:pending", JSON.stringify(pending.slice(0, 200)));
}
async function adoptCaveMessage(env, text) {
  const messages = await getCaveMessages(env);
  if (!messages.includes(text)) {
    messages.push(text);
    await env.AUTH_KV.put("cave:messages", JSON.stringify(messages.slice(-500)));
  }
  const pending = await getCavePending(env);
  await env.AUTH_KV.put("cave:pending", JSON.stringify(pending.filter(p => p.text !== text)));
}
async function rejectCaveMessage(env, text) {
  const pending = await getCavePending(env);
  await env.AUTH_KV.put("cave:pending", JSON.stringify(pending.filter(p => p.text !== text)));
}
function handleHsdPage(request, env) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>回声洞投稿 - XRST.Uk</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; background:#0f172a; color:#e2e8f0; min-height:100vh; padding:40px 20px; }
  .container { max-width:640px; margin:0 auto; }
  h1 { font-size:26px; margin-bottom:6px; }
  .subtitle { color:#94a3b8; margin-bottom:24px; font-size:14px; }
  .card { background:#1e293b; border-radius:14px; padding:22px; margin-bottom:18px; box-shadow:0 8px 30px rgba(0,0,0,.25); }
  .user { font-weight:600; margin-bottom:12px; color:#93c5fd; }
  textarea { width:100%; min-height:110px; border-radius:10px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; padding:12px; font-size:15px; resize:vertical; }
  textarea:focus { outline:none; border-color:#3b82f6; }
  .hint { color:#94a3b8; font-size:12px; margin-top:6px; }
  .btn { padding:10px 18px; border:none; border-radius:9px; font-size:14px; font-weight:600; cursor:pointer; }
  .btn-primary { background:#3b82f6; color:#fff; width:100%; margin-top:14px; padding:12px; font-size:15px; }
  .btn-primary:hover { background:#2563eb; }
  .btn-adopt { background:#22c55e; color:#052e16; margin-right:8px; }
  .btn-reject { background:#ef4444; color:#fff; }
  .btn:disabled { opacity:.5; cursor:not-allowed; }
  .msg { margin-top:10px; font-size:14px; text-align:center; }
  .msg.ok { color:#4ade80; }
  .msg.err { color:#f87171; }
  .login-tip { text-align:center; color:#94a3b8; }
  .login-tip a { color:#3b82f6; }
  .pending-item { padding:12px; border:1px solid #334155; border-radius:10px; margin-bottom:10px; background:#0f172a; }
  .pending-item .text { margin-bottom:8px; white-space:pre-wrap; word-break:break-word; }
  .pending-item .meta { color:#64748b; font-size:12px; margin-bottom:10px; }
  .admin-title { font-size:18px; font-weight:600; margin:6px 0 12px; }
  .empty { color:#64748b; font-size:14px; text-align:center; padding:12px; }
  .home { display:inline-block; margin-top:10px; color:#64748b; font-size:13px; text-decoration:none; }
  .home:hover { color:#94a3b8; }
</style>
</head>
<body>
<div class="container">
  <h1>回声洞投稿</h1>
  <p class="subtitle">写一条有趣的话，被采纳后会出现在 PCL.Mac XE 启动器的回声洞里～</p>
  <div class="card" id="submitCard" style="display:none">
    <div class="user" id="userName"></div>
    <textarea id="msg" placeholder="在这里输入你想投稿的内容……"></textarea>
    <p class="hint">最多 500 字，投稿后需管理员审核才会显示。</p>
    <button class="btn btn-primary" id="submitBtn" onclick="submit()">提交投稿</button>
    <div id="status" class="msg"></div>
  </div>
  <div class="card login-tip" id="loginBox" style="display:none">
    <p>请先 <a href="/">登录网站</a> 后再来投稿。</p>
  </div>
  <div id="adminBox" style="display:none">
    <div class="admin-title">待审核投稿</div>
    <div id="pendingList"></div>
  </div>
  <a class="home" href="/">← 返回首页</a>
</div>
<script>
let isAdmin=false;
async function init(){
  const r=await fetch('/api/me',{credentials:'same-origin'});
  const d=r.ok?await r.json():null;
  const name=d&&d.username?d.username:null;
  if(name){
    document.getElementById('loginBox').style.display='none';
    document.getElementById('submitCard').style.display='block';
    document.getElementById('userName').textContent=name;
    if(name.toLowerCase()==='aaronxie'){isAdmin=true;loadPending();}
  }else{
    document.getElementById('loginBox').style.display='block';
  }
}
async function submit(){
  const btn=document.getElementById('submitBtn'),st=document.getElementById('status');
  const text=document.getElementById('msg').value.trim();
  if(!text){st.className='msg err';st.textContent='内容不能为空';return;}
  btn.disabled=true;st.className='msg';st.textContent='提交中……';
  try{
    const r=await fetch('/api/cave/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),credentials:'same-origin'});
    const d=await r.json();
    if(d.code===0){st.className='msg ok';st.textContent='投稿成功，等待审核～';document.getElementById('msg').value='';if(isAdmin)loadPending();}
    else{st.className='msg err';st.textContent='投稿失败：'+(d.msg||'未知错误');}
  }catch(e){st.className='msg err';st.textContent='网络错误';}
  btn.disabled=false;
}
async function loadPending(){
  if(!isAdmin)return;
  document.getElementById('adminBox').style.display='block';
  const r=await fetch('/api/cave/pending',{credentials:'same-origin'});
  const d=r.ok?await r.json():null;
  const list=d&&d.data?d.data:[];
  const box=document.getElementById('pendingList');
  if(!list.length){box.innerHTML='<div class="empty">暂无待审核的投稿</div>';return;}
  box.innerHTML=list.map(p=>{
    const t=new Date(p.ts).toLocaleString('zh-CN');
    return '<div class="pending-item"><div class="text">'+esc(p.text)+'</div><div class="meta">'+esc(p.user)+' · '+t+'</div><button class="btn btn-adopt" onclick="review(1,this)">采纳</button><button class="btn btn-reject" onclick="review(0,this)">拒绝</button></div>';
  }).join('');
}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
async function review(adopt,btn){
  const text=btn.parentElement.querySelector('.text').textContent;
  btn.disabled=true;
  try{
    await fetch(adopt?'/api/cave/adopt':'/api/cave/reject',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),credentials:'same-origin'});
  }catch(e){}
  loadPending();
}
init();
</script>
</body>
</html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Strict-Transport-Security": HSTS_VALUE } });
}
