/* =====================================================
 * XRST.Uk · Durable Objects（免费版只能用 SQLite 后端）
 *
 * CollabDO —— 协作内容（chat / pixel / board 各一个具名实例）：
 *             内存态 + SQLite 持久化；冷启动时从 KV 旧键一次性迁移
 *             chat 实例另带 WebSocket（Hibernation API）实时推送，
 *             连接空闲时 DO 可冬眠，不产生时长费用。
 *
 * 注意：在线心跳故意不做 DO（全站每页面都发，纯消耗 DO 请求额度），
 *       仍由 worker.js 用 KV 单键 + 长间隔节流处理。
 * ===================================================== */
import { DurableObject } from "cloudflare:workers";
import {
  SPLIT, STEAL, ROUNDS, ROUND_MS, REVEAL_MS, QUEUE_FILL_MS,
  scoreRound, settle, botChoice,
} from "./game-core.js";

const CHAT_MAX = 100;
const PX_SIZE = 256 * 256;

/* 金币账单流水（与 worker.js 的 addCoinLedger 保持同一 KV 键和格式，最多 100 条）*/
async function addCoinLedgerDO(env, username, entry) {
  try {
    const key = "coinlog:" + String(username).toLowerCase();
    let log = [];
    try { log = JSON.parse((await env.AUTH_KV.get(key)) || "[]"); } catch { log = []; }
    if (!Array.isArray(log)) log = [];
    log.unshift({ ts: Date.now(), delta: 0, balance: 0, type: "", memo: "", ...entry });
    await env.AUTH_KV.put(key, JSON.stringify(log.slice(0, 100)));
  } catch { /* 账单失败不得影响发币/结算主流程 */ }
}

function J(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}

/* ---------------- 协作内容（聊天 / 像素 / 文字画板）+ 在线心跳 ---------------- */
const FEATURES = {
  chat: { kvKey: "chat:messages" },
  pixel: { kvKey: "pixel:main" },
  board: { kvKey: "board:main" },
  // presence 纯内存态：不持久化、不碰 KV（DO 重启后 15 分钟内自然重建）
  presence: { kvKey: null },
};

const PRES_FRESH_MS = 900_000; // 15 分钟内有心跳算在线

export class CollabDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.feature = null;
    this.inited = false;
    // chat: 消息数组；pixel: {v,data,grid}；board: {text,editor,updatedAt}
    this.state = null;
  }

  async init(feature) {
    if (this.inited) {
      if (this.feature !== feature) throw new Error("CollabDO 实例功能冲突");
      return;
    }
    this.feature = feature;
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)");
    const rows = sql.exec("SELECT v FROM kv WHERE k = 'state'").toArray();

    if (rows.length) {
      this.state = JSON.parse(rows[0].v);
    } else if (this.env.AUTH_KV) {
      // 冷启动迁移：一次性读 KV 旧键（在线聊天/画板当前数据），之后以 SQLite 为准
      let legacy = null;
      try { legacy = await this.env.AUTH_KV.get(FEATURES[feature].kvKey); } catch { legacy = null; }
      if (feature === "chat") {
        let messages = [];
        if (legacy) {
          try { messages = JSON.parse(legacy) || []; } catch { messages = []; }
        }
        this.state = { messages: messages.slice(-CHAT_MAX) };
      } else if (feature === "pixel") {
        let v = 0, data = "";
        if (legacy) {
          try {
            const obj = JSON.parse(legacy);
            v = obj.v || 0;
            data = obj.data || "";
          } catch { /* 损坏则空白起步 */ }
        }
        this.state = { v, data, grid: data ? rleDecode(data, PX_SIZE) : new Uint8Array(PX_SIZE) };
      } else {
        this.state = legacy
          ? JSON.parse(legacy)
          : { text: "", editor: null, updatedAt: null };
      }
      this.persist();
    } else {
      this.defaultState(feature);
      this.persist();
    }

    if (feature === "pixel" && !this.state.grid) {
      this.state.grid = this.state.data ? rleDecode(this.state.data, PX_SIZE) : new Uint8Array(PX_SIZE);
    }
    if (feature === "chat" && typeof this.state.pushedTs !== "number") {
      // 首次启用推送：水位线对齐到最新一条，历史消息不重复广播
      const ms = this.state.messages;
      this.state.pushedTs = ms.length ? ms[ms.length - 1].ts : 0;
      this.persist();
    }
    this.inited = true;
  }

  defaultState(feature) {
    if (feature === "chat") this.state = { messages: [] };
    else if (feature === "pixel") this.state = { v: 0, data: "", grid: new Uint8Array(PX_SIZE) };
    else this.state = { text: "", editor: null, updatedAt: null };
  }

  // SQLite 写入不经 KV，免费版无单独写次数限制，只有 5GB 容量限制
  persist() {
    const { grid, ...stored } = this.state;
    this.ctx.storage.sql
      .exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('state', ?)", JSON.stringify(stored));
  }

  async fetch(request) {
    const url = new URL(request.url);

    /* ---- WebSocket 升级：仅 chat 实例，使用 Hibernation API ---- */
    if (request.headers.get("Upgrade") === "websocket") {
      if (!url.pathname.endsWith("/chat/ws")) return J({ ok: false, error: "not found" }, 404);
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      // tag "chat" 便于按标签枚举连接；自动应答 ping（基础设施层完成，不唤醒 DO）
      this.ctx.acceptWebSocket(server, ["chat"]);
      this.ctx.setWebSocketAutoResponse(
        new WebSocketRequestResponsePair("ping", "pong")
      );
      return new Response(null, { status: 101, webSocket: client });
    }

    const parts = url.pathname.split("/").filter(Boolean); // ["chat","state"] 等
    const feature = parts[0];
    const action = parts[1];

    /* ---- DontClick 存档（per-user + slot，单实例 SQLite，节省 DO 开销）---- */
    if (feature === "dc") {
      const sql = this.ctx.storage.sql;
      sql.exec("CREATE TABLE IF NOT EXISTS dc_saves (username TEXT PRIMARY KEY, data TEXT, updated_at INTEGER)");
      // 主槽沿用裸用户名（兼容历史数据），怀旧版等附加槽用 用户名#槽位
      const slotKey = (u, slot) => (slot === "classic" ? `${u}#classic` : u);
      if (action === "get" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const u = String(body.username || "").slice(0, 32);
        if (!u) return J({ ok: false, error: "no user" }, 400);
        const key = slotKey(u, body.slot);
        const rows = sql.exec("SELECT data, updated_at FROM dc_saves WHERE username = ?", key).toArray();
        if (!rows.length) return J({ ok: true, data: null, updated_at: 0 });
        // toArray() 返回按列名键控的对象，不能用 rows[0][0]
        return J({ ok: true, data: rows[0].data, updated_at: Number(rows[0].updated_at) });
      }
      if (action === "set" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const u = String(body.username || "").slice(0, 32);
        const data = typeof body.data === "string" ? body.data : "";
        if (!u) return J({ ok: false, error: "no user" }, 400);
        const key = slotKey(u, body.slot);
        sql.exec("INSERT OR REPLACE INTO dc_saves (username, data, updated_at) VALUES (?, ?, ?)", key, data, Date.now());
        return J({ ok: true });
      }
      // 飞升：原子校验"当前云端存档已到 Infinity"，校验通过才写入飞升后存档并发金币。
      // DO 单实例串行处理 fetch，读-校验-写 SQLite 全部同步完成后才会处理下一个请求，并发双领只有一次能通过。
      if (action === "ascend" && request.method === "POST") {
        const ASCEND_REWARD = 20;
        const body = await request.json().catch(() => ({}));
        const u = String(body.username || "").slice(0, 32);
        const newData = typeof body.data === "string" ? body.data.slice(0, 200000) : "";
        if (!u || !newData) return J({ ok: false, error: "bad request" }, 400);
        const rows = sql.exec("SELECT data FROM dc_saves WHERE username = ?", u).toArray();
        const oldData = rows.length ? String(rows[0].data) : "";
        // 旧存档必须包含 Infinity 的好奇心/累计产出（前端序列化令牌 __inf__）
        const reachedInf = /"(?:curiosity|totalEarned)":"__inf__"/.test(oldData);
        if (!reachedInf) return J({ ok: false, error: "未达成飞升条件" }, 400);
        // 飞升后存档不允许再带 Infinity，否则可反复领取
        if (/"__inf__"/.test(newData)) return J({ ok: false, error: "飞升存档无效" }, 400);
        // 先替换存档（领取闸门），再发全站金币
        sql.exec("UPDATE dc_saves SET data = ?, updated_at = ? WHERE username = ?", newData, Date.now(), u);
        let coins = null;
        try {
          const key = "user:" + u.toLowerCase();
          const raw = await this.env.AUTH_KV.get(key);
          if (raw) {
            const user = JSON.parse(raw);
            user.coins = (user.coins || 0) + ASCEND_REWARD;
            await this.env.AUTH_KV.put(key, JSON.stringify(user));
            coins = user.coins;
            await addCoinLedgerDO(this.env, u, { delta: ASCEND_REWARD, balance: coins, type: "ascend", memo: "触及 ∞ 飞升奖励" });
          }
        } catch { /* KV 故障时存档已飞升，不重复发币；下次 /api/me 余额不增加而已 */ }
        return J({ ok: true, coins, reward: ASCEND_REWARD });
      }
      // 排行榜：金币（AUTH_KV 用户记录，2 分钟缓存）+ 反骨之魂 / 点击数（dc_saves 主槽）
      if (action === "leaderboard" && request.method === "POST") {
        const sql = this.ctx.storage.sql;
        sql.exec("CREATE TABLE IF NOT EXISTS lb_users (lname TEXT PRIMARY KEY, name TEXT, avatar INTEGER, coins INTEGER, searchable INTEGER, updated_at INTEGER)");
        sql.exec("CREATE TABLE IF NOT EXISTS lb_meta (k TEXT PRIMARY KEY, v INTEGER)");
        const LB_TTL = 120000;

        // 金币缓存过期才扫一次 KV（避免每次榜单请求产生大量 KV 读）
        const metaRows = sql.exec("SELECT v FROM lb_meta WHERE k = 'coins_at'").toArray();
        const last = metaRows.length ? Number(metaRows[0].v) : 0;
        if (Date.now() - last >= LB_TTL) {
          try {
            const list = await this.env.AUTH_KV.list({ prefix: "user:", limit: 1000 });
            const users = (await Promise.all(list.keys.map(async k => {
              const raw = await this.env.AUTH_KV.get(k.name);
              if (!raw) return null;
              try { return JSON.parse(raw); } catch { return null; }
            }))).filter(Boolean);
            sql.exec("DELETE FROM lb_users");
            for (const u of users) {
              const name = String(u.name || "");
              if (!name) continue;
              sql.exec(
                "INSERT OR REPLACE INTO lb_users (lname, name, avatar, coins, searchable, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                name.toLowerCase(), name,
                Number.isInteger(u.avatar) ? u.avatar : 0,
                Number(u.coins) > 0 ? Math.floor(Number(u.coins)) : 0,
                u.searchable === false ? 0 : 1, Date.now()
              );
            }
            sql.exec("INSERT OR REPLACE INTO lb_meta (k, v) VALUES ('coins_at', ?)", Date.now());
          } catch { /* KV 故障时沿用旧缓存 */ }
        }

        const userRows = sql.exec("SELECT lname, name, avatar, coins, searchable FROM lb_users").toArray();
        const byLname = new Map();
        for (const r of userRows) byLname.set(r.lname, r);
        // 只收录允许被搜索的用户（隐私设置）
        const publicOf = lname => {
          const r = byLname.get(String(lname).toLowerCase());
          return r && r.searchable ? r : null;
        };

        // 反骨之魂 / 点击数：主槽存档（排除 #classic 等附加槽）
        // 上限过滤：旧版灵魂溢出 bug 产生过 1e138 量级的脏数据，不允许上榜
        const SOULS_BOARD_CAP = 1e6;   // 每次重生最多 +5，100 万已是天文数字
        const CLICKS_BOARD_CAP = 1e12;
        const saveRows = sql.exec("SELECT username, data FROM dc_saves WHERE username NOT LIKE '%#%'").toArray();
        const soulsArr = [];
        const clicksArr = [];
        const meStats = new Map();
        for (const r of saveRows) {
          let s;
          try { s = JSON.parse(String(r.data)); } catch { continue; }
          const uname = String(r.username);
          const rawSouls = Number(s.souls);
          const rawClicks = Number(s.totalClicks);
          const so = Number.isFinite(rawSouls) && rawSouls > 0 && rawSouls <= SOULS_BOARD_CAP
            ? Math.floor(rawSouls) : 0;
          const cl = Number.isFinite(rawClicks) && rawClicks > 0 && rawClicks <= CLICKS_BOARD_CAP
            ? Math.floor(rawClicks) : 0;
          meStats.set(uname.toLowerCase(), { souls: so, clicks: cl });
          const u = publicOf(uname);
          if (!u) continue;
          if (so > 0) soulsArr.push({ username: u.name, avatar: u.avatar, value: so });
          if (cl > 0) clicksArr.push({ username: u.name, avatar: u.avatar, value: cl });
        }
        const byVal = (a, b) => (b.value - a.value) || a.username.localeCompare(b.username);
        soulsArr.sort(byVal);
        clicksArr.sort(byVal);
        const coinsArr = userRows
          .filter(r => r.searchable && r.coins > 0)
          .map(r => ({ username: r.name, avatar: r.avatar, value: r.coins }))
          .sort(byVal);

        const top = arr => arr.slice(0, 20).map((x, i) => ({ rank: i + 1, username: x.username, avatar: x.avatar, value: x.value }));
        const rankOf = (arr, name) => {
          const i = arr.findIndex(x => x.username === name);
          return i < 0 ? null : i + 1;
        };

        // 当前登录用户的名次与数值
        let me = null;
        try {
          const body = await request.json().catch(() => ({}));
          if (body && body.me) {
            const uname = String(body.me);
            const u = byLname.get(uname.toLowerCase());
            const st = meStats.get(uname.toLowerCase()) || { souls: 0, clicks: 0 };
            me = {
              username: u ? u.name : uname,
              coins: u ? (u.coins || 0) : 0,
              souls: st.souls,
              clicks: st.clicks,
              ranks: {
                coins: u && u.searchable ? rankOf(coinsArr, u.name) : null,
                souls: rankOf(soulsArr, u ? u.name : uname),
                clicks: rankOf(clicksArr, u ? u.name : uname),
              },
            };
          }
        } catch { /* me 信息可选 */ }

        return J({ ok: true, coins: top(coinsArr), souls: top(soulsArr), clicks: top(clicksArr), me });
      }
      return J({ ok: false, error: "not found" }, 404);
    }

    if (!FEATURES[feature]) return J({ ok: false, error: "unknown feature" }, 404);

    /* ---- MC 死亡榜：chat 实例内独立 SQLite 表，不依赖聊天 state ---- */
    if (feature === "chat" && action === "deaths") {
      if (request.method !== "GET") return J({ ok: false, error: "method" }, 405);
      const sql = this.ctx.storage.sql;
      sql.exec("CREATE TABLE IF NOT EXISTS mc_deaths (name TEXT PRIMARY KEY, deaths INTEGER NOT NULL, last_ts INTEGER)");
      const rows = sql.exec(
        "SELECT name, deaths FROM mc_deaths ORDER BY deaths DESC, last_ts ASC LIMIT 20"
      ).toArray();
      return J({
        ok: true,
        board: rows.map(r => ({ name: r.name, deaths: Number(r.deaths) })),
      });
    }

    /* ---- 在线心跳：纯内存聚合，零 KV 写 ---- */
    if (feature === "presence") {
      if (!this.beats) this.beats = new Map();
      const now = Date.now();
      // 惰性清理过期会话
      for (const [sid, p] of this.beats) {
        if (now - p.ts > PRES_FRESH_MS) this.beats.delete(sid);
      }
      if (action === "list" && request.method === "GET") {
        const usersMap = new Map();
        let guests = 0;
        for (const p of this.beats.values()) {
          if (p.u) {
            const lower = p.u.toLowerCase();
            const old = usersMap.get(lower);
            if (!old || p.ts > old.ts) usersMap.set(lower, { u: p.u, a: p.a ?? 0, f: p.f || null, ts: p.ts });
          } else {
            guests++;
          }
        }
        const users = [...usersMap.values()].map(x => ({ username: x.u, avatar: x.a, frame: x.f }));
        return J({ users, guests, total: users.length + guests });
      }
      if (action === "beat" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const sid = String(body.sid || "").slice(0, 64);
        if (!sid) return J({ ok: false }, 400);
        this.beats.set(sid, {
          ts: now,
          u: body.u || null,
          a: Number.isInteger(body.a) ? body.a : 0,
          f: body.f || null,
        });
        return J({ ok: true });
      }
      return J({ ok: false, error: "not found" }, 404);
    }

    await this.init(feature);

    /* ---- 读 ---- */
    if (request.method === "GET" && action === "state") {
      if (feature === "chat") return J({ messages: this.state.messages.slice(-CHAT_MAX) });
      if (feature === "pixel") return J({ v: this.state.v, data: this.state.data });
      return J({
        text: this.state.text || "",
        editor: this.state.editor || null,
        updatedAt: this.state.updatedAt || null,
      });
    }

    if (request.method !== "POST") return J({ ok: false, error: "method" }, 405);
    const body = await request.json().catch(() => ({}));

    /* ---- 聊天追加（网页消息 / MC ingest 都走这里，worker 已完成鉴权与校验）---- */
    if (feature === "chat" && action === "append") {
      const msg = body.message;
      if (!msg || typeof msg.text !== "string") return J({ ok: false }, 400);
      this.state.messages.push(msg);
      if (this.state.messages.length > CHAT_MAX) {
        this.state.messages = this.state.messages.slice(-CHAT_MAX);
      }
      this.persist();
      // MC 玩家死亡：同实例原子计数（UPSERT），供死亡榜
      if (msg.source === "mc" && msg.kind === "death" && typeof msg.username === "string") {
        const sql = this.ctx.storage.sql;
        sql.exec("CREATE TABLE IF NOT EXISTS mc_deaths (name TEXT PRIMARY KEY, deaths INTEGER NOT NULL, last_ts INTEGER)");
        sql.exec(
          "INSERT INTO mc_deaths (name, deaths, last_ts) VALUES (?, 1, ?) "
          + "ON CONFLICT(name) DO UPDATE SET deaths = deaths + 1, last_ts = excluded.last_ts",
          msg.username, msg.ts
        );
      }
      // fetch 路径无法直接枚举 hibernatable 连接，统一交给 alarm 事件广播
      // （alarm 会合并：多条消息在触发前到达只唤醒一次）
      this.ctx.storage.setAlarm(Date.now());
      return J({ ok: true });
    }

    /* ---- 像素画合并 ---- */
    if (feature === "pixel" && action === "pixels") {
      const pixels = Array.isArray(body.pixels) ? body.pixels : null;
      if (!pixels || !pixels.length) return J({ ok: false, error: "没有要画的像素" }, 400);
      if (pixels.length > 8000) return J({ ok: false, error: "一次画得太多了，慢一点～" }, 400);
      const grid = this.state.grid;
      let changed = 0;
      for (const p of pixels) {
        const x = Number(p && p.x), y = Number(p && p.y), c = Number(p && p.c);
        if (!Number.isInteger(x) || x < 0 || x > 255) continue;
        if (!Number.isInteger(y) || y < 0 || y > 255) continue;
        if (!Number.isInteger(c) || c < 0 || c > 20) continue;
        const idx = y * 256 + x;
        if (grid[idx] !== c) { grid[idx] = c; changed++; }
      }
      if (!changed) return J({ ok: true, v: this.state.v });
      this.state.v++;
      this.state.data = rleEncode(grid);
      this.persist();
      return J({ ok: true, v: this.state.v });
    }

    /* ---- 文字画板整存 ---- */
    if (feature === "board" && action === "save") {
      const text = typeof body.text === "string" ? body.text : "";
      this.state = { text, editor: body.editor || null, updatedAt: Number(body.updatedAt) || Date.now() };
      this.persist();
      return J({ ok: true, ...this.state });
    }

    return J({ ok: false, error: "not found" }, 404);
  }

  /* ---- Alarm：唯一能向 hibernatable 连接发消息的非 WS 事件上下文 ----
   * 必须在第一个 await 之前同步枚举连接；随后读 SQLite、批量推送。 */
  // 临时诊断：alarm 执行轨迹写入 SQLite（冬眠唤醒后也能读到）
  logAlarm(rec) {
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)");
    const rows = sql.exec("SELECT v FROM kv WHERE k = 'alarmlog'").toArray();
    const log = rows.length ? JSON.parse(rows[0].v) : [];
    log.push({ t: Date.now(), ...rec });
    sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('alarmlog', ?)", JSON.stringify(log.slice(-10)));
  }

  async alarm() {
    let peers = null;
    try {
      peers = this.ctx.getWebsockets("chat");
      this.logAlarm({ phase: "peers", n: peers.length });
    } catch (e) {
      this.logAlarm({ phase: "peers", err: e.message });
      peers = [];
    }
    try {
      await this.init("chat");
      const since = this.state.pushedTs || 0;
      const fresh = this.state.messages.filter(m => m.ts > since);
      if (!peers.length) {
        const ms = this.state.messages;
        if (ms.length && ms[ms.length - 1].ts > (this.state.pushedTs || 0)) {
          this.state.pushedTs = ms[ms.length - 1].ts;
          this.persist();
        }
        this.logAlarm({ phase: "done", fresh: fresh.length, pushed: 0 });
        return;
      }
      if (!fresh.length) { this.logAlarm({ phase: "done", fresh: 0, pushed: 0 }); return; }
      let sent = 0;
      for (const msg of fresh) {
        const payload = JSON.stringify({ type: "message", message: msg });
        for (const ws of peers) { try { ws.send(payload); sent++; } catch {} }
      }
      this.state.pushedTs = fresh[fresh.length - 1].ts;
      this.persist();
      this.logAlarm({ phase: "done", fresh: fresh.length, peers: peers.length, sent });
    } catch (e) {
      this.logAlarm({ phase: "error", err: e.message, stack: String(e.stack).slice(0, 300) });
    }
  }

  /* ---- Hibernation 事件：应用层 ping 由基础设施自动应答，这里无需处理 ---- */
  webSocketMessage() {}
  webSocketClose() {}
  webSocketError() {}
}

/* ============ 像素画板：RLE(varint) + base64 ============ */
function writeVarint(arr, n) {
  while (n >= 0x80) { arr.push((n & 0x7f) | 0x80); n >>>= 7; }
  arr.push(n);
}
function rleEncode(grid) {
  const out = [];
  let run = 1;
  for (let i = 1; i <= grid.length; i++) {
    if (i < grid.length && grid[i] === grid[i - 1]) { run++; continue; }
    writeVarint(out, run);
    out.push(grid[i - 1]);
    run = 1;
  }
  return bytesToB64(new Uint8Array(out));
}
function rleDecode(b64, size) {
  const bytes = b64ToBytes(b64);
  const grid = new Uint8Array(size);
  let p = 0, idx = 0;
  while (p < bytes.length && idx < size) {
    let len = 0, shift = 0, b;
    do { b = bytes[p++]; len |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    const c = bytes[p++];
    const end = Math.min(idx + (len >>> 0), size);
    grid.fill(c, idx, end);
    idx = end;
  }
  return grid;
}
function bytesToB64(bytes) {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* =====================================================
 *「偷还是分？」—— GameLobbyDO（单具名实例 lobby）
 *   匹配队列按押金分档；两人同档即配对，5 秒没人则随机人机补位（人机身份不对外透露）。
 *   队列/对局归属存 SQLite，alarm 保证 DO 冬眠后仍能补人机。
 * ===================================================== */

const LOBBY_FILL = QUEUE_FILL_MS;

export class GameLobbyDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.inited = false;
  }

  init() {
    if (this.inited) return;
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)"
    );
    this.inited = true;
  }

  get(k, fallback = null) {
    const rows = this.ctx.storage.sql
      .exec("SELECT v FROM kv WHERE k = ?", k).toArray();
    return rows.length ? JSON.parse(rows[0].v) : fallback;
  }
  set(k, v) {
    this.ctx.storage.sql
      .exec("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", k, JSON.stringify(v));
  }
  del(k) {
    this.ctx.storage.sql.exec("DELETE FROM kv WHERE k = ?", k);
  }

  async fetch(request) {
    this.init();
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // ["lobby", action]
    const action = parts[1];
    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};

    /* 查询当前归属：排队中 / 对局中（对局会向游戏 DO 验活）*/
    if (action === "active" && request.method === "POST") {
      const u = String(body.u || "");
      if (!u) return J({ ok: false }, 400);
      const entry = this.get("act:" + u.toLowerCase());
      if (!entry) return J({ ok: true, active: false });
      if (entry.kind === "queue") return J({ ok: true, active: true, queued: true, ante: entry.ante || 0 });
      // game：让游戏 DO 判定这局是否还存在/未结束
      try {
        const resp = await this.gameStub(entry.gameId).fetch(
          new Request("https://do/match/exists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ u }),
          })
        );
        const data = await resp.json().catch(() => ({ ok: false }));
        if (resp.ok && data.ok && !data.finished) {
          return J({ ok: true, active: true, gameId: entry.gameId });
        }
      } catch { /* 游戏 DO 不可用按失效处理 */ }
      this.del("act:" + u.toLowerCase());
      return J({ ok: true, active: false });
    }

    /* 入队 / 立即开局（押金已在 worker 扣除，DO 不碰押金）*/
    if (action === "join" && request.method === "POST") {
      const u = String(body.u || "");
      const ante = Number(body.ante);
      const avatar = Number.isInteger(body.avatar) ? body.avatar : 0;
      if (!u || !Number.isInteger(ante) || ante < 1 || ante > 10) {
        return J({ ok: false, error: "参数错误" }, 400);
      }
      const lower = u.toLowerCase();

      // 已在队列/对局：直接恢复，worker 不得再次扣押金
      const existing = this.get("act:" + lower);
      if (existing) {
        // 队列归属与队列槽必须一致；槽丢了（历史脏数据）则清掉重新排队
        if (existing.kind === "queue") {
          const q = this.get("q");
          if (q && q.userLower === lower) {
            return J({ ok: true, resumed: true, queued: true });
          }
          this.del("act:" + lower);
        } else {
          return J({ ok: true, resumed: true, queued: false, gameId: existing.gameId || null });
        }
      }

      // 有人在等（不限押金）：立即配对，各自押金入池
      const waiting = this.get("q");
      if (waiting && waiting.userLower !== lower) {
        const gameId = await this.createGame(
          { u: waiting.user, avatar: waiting.avatar, ante: waiting.ante },
          { u, avatar, ante, bot: null }
        );
        this.del("q");
        this.set("act:" + waiting.userLower, { kind: "game", gameId });
        this.set("act:" + lower, { kind: "game", gameId });
        return J({ ok: true, gameId, matched: "human" });
      }

      // 空队列：挂起等待，超时无人则人机补位
      this.set("q", { user: u, userLower: lower, avatar, ante, ts: Date.now() });
      this.set("act:" + lower, { kind: "queue", ante });
      this.ctx.storage.setAlarm(Date.now() + LOBBY_FILL);
      return J({ ok: true, queued: true });
    }

    /* 取消排队（worker 据此退押金）*/
    if (action === "cancel" && request.method === "POST") {
      const u = String(body.u || "");
      const lower = u.toLowerCase();
      const entry = this.get("act:" + lower);
      if (entry && entry.kind === "queue") {
        const q = this.get("q");
        if (q && q.userLower === lower) this.del("q");
        this.del("act:" + lower);
        return J({ ok: true, refund: entry.ante || 0 });
      }
      return J({ ok: true, refund: 0 });
    }

    /* 对局结束：清理双方归属（游戏 DO 内部调用）*/
    if (action === "game-over" && request.method === "POST") {
      const gameId = String(body.gameId || "");
      const rows = this.ctx.storage.sql
        .exec("SELECT k, v FROM kv WHERE k LIKE 'act:%'").toArray();
      for (const row of rows) {
        try {
          const v = JSON.parse(row.v);
          if (v.kind === "game" && v.gameId === gameId) this.del(row.k);
        } catch { /* 忽略损坏行 */ }
      }
      return J({ ok: true });
    }

    return J({ ok: false, error: "not found" }, 404);
  }

  gameStub(idString) {
    return this.env.GAME_DO.get(this.env.GAME_DO.idFromString(idString));
  }

  /* 创建一局：ante 双方各自押金；人机方押金为虚拟（系统兜底）*/
  async createGame(p1, p2) {
    const doId = this.env.GAME_DO.newUniqueId();
    const id = doId.toString();
    const fixed4 = Math.random() < 0.5 ? SPLIT : STEAL;
    const resp = await this.env.GAME_DO.get(doId).fetch(
      new Request("https://do/match/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, p1, p2, fixed4 }),
      })
    );
    if (!resp.ok) throw new Error("create game failed");
    return id;
  }

  /* alarm：等待超时则用随机人机补位（单一队列，不限押金）*/
  async alarm() {
    this.init();
    const now = Date.now();
    const q = this.get("q");
    if (!q) return;
    if (now - q.ts >= LOBBY_FILL) {
      const bot = 1 + Math.floor(Math.random() * 11);
      try {
        const gameId = await this.createGame(
          { u: q.user, avatar: q.avatar, ante: q.ante },
          { u: null, avatar: null, ante: q.ante, bot }
        );
        this.del("q");
        this.set("act:" + q.userLower, { kind: "game", gameId });
      } catch {
        this.ctx.storage.setAlarm(now + 2000); // 稍后重试
      }
    } else {
      this.ctx.storage.setAlarm(q.ts + LOBBY_FILL);
    }
  }
}

/* =====================================================
 *「偷还是分？」—— GameMatchDO（每局一个独立实例，SQLite 持久化）
 *   状态机 choose → reveal → next/finish；30s 超时由 alarm 判弃权；
 *   GET /match/state 走 20s 长轮询，状态变更即时推送；
 *   结束时在 KV 完成真人金币结算（人机方不记账）。
 * ===================================================== */

const LONGPOLL_MS = 20_000;
const OFFLINE_MS = 60_000;     // 超过此时长无长轮询=掉线，按逃跑处理
const BOT_THINK_MIN = 400;
const BOT_THINK_MAX = 1500;
const SETTLE_RETRY_MS = 8_000;

export class GameMatchDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.g = null;
    this.waiters = new Set();
  }

  async load() {
    if (this.g !== null) return;
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)"
    );
    const rows = this.ctx.storage.sql
      .exec("SELECT v FROM kv WHERE k = 'game'").toArray();
    this.g = rows.length ? JSON.parse(rows[0].v) : false;
  }

  save() {
    this.ctx.storage.sql
      .exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('game', ?)", JSON.stringify(this.g));
  }

  /* 版本号 +1、落盘并唤醒所有长轮询 */
  bump() {
    this.g.ver++;
    this.save();
    for (const w of this.waiters) { try { w(); } catch { /* 已超时 */ } }
    this.waiters.clear();
  }

  botSide() {
    return this.g && this.g.p2.bot ? "p2" : null;
  }
  sideOf(u) {
    const lower = String(u || "").toLowerCase();
    if (this.g && this.g.p1.u && this.g.p1.u.toLowerCase() === lower) return "p1";
    if (this.g && this.g.p2.u && this.g.p2.u.toLowerCase() === lower) return "p2";
    return null;
  }
  other(side) { return side === "p1" ? "p2" : "p1"; }

  async fetch(request) {
    await this.load();
    if (this.g === false && new URL(request.url).pathname !== "/match/init") {
      return J({ ok: false, error: "对局不存在" }, 404);
    }
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // ["match", action]
    const action = parts[1];

    if (action === "init" && request.method === "POST") {
      if (this.g) return J({ ok: false, error: "exists" }, 409);
      const b = await request.json().catch(() => ({}));
      const g = {
        id: String(b.id || ""),
        ver: 1,
        status: "playing",
        createdAt: Date.now(),
        p1: normPlayer(b.p1),
        p2: normPlayer(b.p2),
        round: 1,
        phase: "choose",
        ch: { p1: null, p2: null },
        scores: { p1: 0, p2: 0 },
        hist: [],
        deadline: 0,
        botDue: 0,
        revealUntil: 0,
        fixed4: b.fixed4 === STEAL ? STEAL : SPLIT,
        last: { p1: 0, p2: 0 },
        lastSaved: { p1: 0, p2: 0 },
        result: null,
        settled: false,
      };
      this.g = g;
      this.startRound(1, true);
      this.save();
      this.schedule();
      return J({ ok: true });
    }

    // 以下动作都需要登录且为参与者（POST body 只能读一次，统一解析）
    const body = request.method === "POST"
      ? await request.json().catch(() => ({}))
      : {};
    const u = request.method === "GET"
      ? (url.searchParams.get("u") || "")
      : (body.u || "");
    const side = this.sideOf(u);
    if (!side) return J({ ok: false, error: "不是你的对局" }, 403);

    if (action === "exists" && request.method === "POST") {
      return J({ ok: true, finished: this.g.status !== "playing" });
    }

    if (action === "state" && request.method === "GET") {
      const now = Date.now();
      this.g.last[side] = now;
      // 心跳落盘限流：避免每条长轮询都写 SQLite
      if (now - (this.g.lastSaved[side] || 0) > 5000) {
        this.g.lastSaved[side] = now;
        this.save();
      }
      // alarm 可能延迟：请求进来时先兜底推进（含人机出牌 / 超时结算）
      if (this.g.status === "playing") {
        await this.tick(now);
        this.schedule();
      }
      const since = Number(url.searchParams.get("ver")) || 0;
      if (this.g.ver <= since) {
        await new Promise(resolve => {
          const timer = setTimeout(() => {
            this.waiters.delete(done);
            resolve();
          }, LONGPOLL_MS);
          const done = () => { clearTimeout(timer); resolve(); };
          this.waiters.add(done);
        });
      }
      return J(this.view(side));
    }

    if (action === "choice" && request.method === "POST") {
      const c = body.choice === SPLIT || body.choice === STEAL ? body.choice : null;
      if (!c) return J({ ok: false, error: "选择无效" }, 400);
      if (this.g.status !== "playing" || this.g.phase !== "choose") {
        return J(this.view(side));
      }
      if (this.g.ch[side] !== null) return J(this.view(side)); // 已提交，幂等
      this.g.ch[side] = c;
      const opp = this.other(side);
      // 对方（真人或人机）都已决定：立即亮牌，不等 30 秒
      if (this.g.ch[opp] !== null) {
        this.resolveRound();
      } else {
        // 6 号人机前 3 轮即时镜像玩家本轮选择
        if (this.botSide() && this.g.p2.bot === 6 && this.g.round <= 3 && this.g.ch[opp] === null) {
          this.g.ch[opp] = this.pickBot();
        }
        this.bump();
      }
      return J(this.view(side));
    }

    if (action === "quit" && request.method === "POST") {
      if (this.g.status === "playing") await this.endQuit(side, "quit");
      return J(this.view(side));
    }

    return J({ ok: false, error: "not found" }, 404);
  }

  /* ---------------- 状态机 ---------------- */

  startRound(r, first = false) {
    const now = Date.now();
    this.g.round = r;
    this.g.phase = "choose";
    this.g.ch = { p1: null, p2: null };
    this.g.deadline = now + ROUND_MS;
    this.g.botDue = this.botSide()
      ? now + BOT_THINK_MIN + Math.random() * (BOT_THINK_MAX - BOT_THINK_MIN)
      : 0;
    if (!first) this.bump();
  }

  /* 人机当前轮的选择 */
  pickBot() {
    const bot = this.botSide();
    if (!bot) return;
    const human = this.other(bot);
    const hist = this.g.hist.map(h => human === "p1" ? h.c1 : h.c2);
    const raw = botChoice(
      this.g.p2.bot,
      this.g.round - 1,
      hist,
      this.g.ch[human], // 6 号前 3 轮镜像本轮
      this.g.fixed4
    );
    return raw || SPLIT;
  }

  resolveRound() {
    const bot = this.botSide();
    if (bot && this.g.ch[bot] === null) this.g.ch[bot] = this.pickBot();
    const [d1, d2] = scoreRound(this.g.ch.p1, this.g.ch.p2);
    this.g.scores.p1 = Math.max(0, this.g.scores.p1 + d1); // 分数不为负
    this.g.scores.p2 = Math.max(0, this.g.scores.p2 + d2);
    this.g.hist.push({
      r: this.g.round,
      c1: this.g.ch.p1, c2: this.g.ch.p2,
      d1, d2,
    });
    this.g.phase = "reveal";
    this.g.revealUntil = Date.now() + REVEAL_MS;
    this.bump();
    // 双方提前决定时（fetch 路径）原 alarm 还指着 30s deadline，必须重排到亮牌结束
    this.schedule();
  }

  async finishGame() {
    this.g.status = "finished";
    const { p1, p2 } = this.g.scores;
    const [w1, w2] = settle(p1, p2, this.g.p1.ante, this.g.p2.ante);
    this.g.result = {
      kind: "end",
      scores: { p1, p2 },
      payouts: { p1: w1, p2: w2 },
      penalties: { p1: 0, p2: 0 },
    };
    await this.settleCoins();
    this.bump();
    this.notifyLobby();
  }

  /* 逃跑：对方（真人或人机）判胜拿全池；对面是真人才扣 50% 池罚金（下限 0）*/
  async endQuit(side, reason) {
    const opp = this.other(side);
    const pool = this.g.p1.ante + this.g.p2.ante;
    const oppHuman = !!this.g[opp].u;
    const penalty = oppHuman ? Math.floor(pool * 0.5) : 0;
    this.g.status = "finished";
    this.g.result = {
      kind: "quit",
      by: side,
      reason: reason || "quit",
      scores: { ...this.g.scores },
      payouts: { p1: 0, p2: 0, [opp]: pool },
      penalties: { p1: 0, p2: 0, [side]: penalty },
    };
    await this.settleCoins();
    this.bump();
    this.notifyLobby();
  }

  /* 按 result 完成真人金币入账/罚金；按 side 幂等，单个 side 失败不影响已入账方，
   * 整体未完成时 settled=false 由 alarm 重试 */
  async settleCoins() {
    if (!this.g.result.paid) this.g.result.paid = { p1: false, p2: false };
    for (const side of ["p1", "p2"]) {
      const p = this.g[side];
      if (!p.u || this.g.result.paid[side]) continue; // 人机不记账 / 已入账跳过
      const gain = this.g.result.payouts[side] || 0;
      const lose = this.g.result.penalties[side] || 0;
      const delta = gain - lose;
      try {
        if (delta !== 0) await this.adjustCoins(p.u, delta, lose > 0, {
          type: "split_settle",
          memo: delta > 0 ? "「偷还是分？」对局分红" : "「偷还是分？」对局罚金",
        });
        this.g.result.paid[side] = true;
        this.g.settled = false;
        this.save();
      } catch (err) {
        this.g.settled = false;
        this.save();
        this.ctx.storage.setAlarm(Date.now() + SETTLE_RETRY_MS);
        return;
      }
    }
    this.g.settled = true;
    this.save();
    try { await this.ctx.storage.deleteAlarm(); } catch { /* 无 alarm 时忽略 */ }
  }

  /* KV 金币增减；clampZero=true（罚金）时不允许扣成负数；ledger 同步写账单流水 */
  async adjustCoins(username, delta, clampZero = false, ledger = null) {
    const key = "user:" + username.toLowerCase();
    const raw = await this.env.AUTH_KV.get(key);
    if (!raw) throw new Error("user missing");
    const user = JSON.parse(raw);
    let coins = (user.coins || 0) + delta;
    if (clampZero && coins < 0) coins = 0;
    user.coins = coins;
    await this.env.AUTH_KV.put(key, JSON.stringify(user));
    if (ledger) await addCoinLedgerDO(this.env, username, { delta, balance: coins, type: ledger.type, memo: ledger.memo || "" });
  }

  async notifyLobby() {
    try {
      await this.env.GAME_LOBBY_DO
        .get(this.env.GAME_LOBBY_DO.idFromName("lobby"))
        .fetch(new Request("https://do/lobby/game-over", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          gameId: this.g.id,
          users: [this.g.p1.u, this.g.p2.u].filter(Boolean),
        }),
        }));
    } catch { /* 归属残留不影响结算，active 查询会自行验活清理 */ }
  }

  schedule() {
    if (!this.g || this.g.status !== "playing") return;
    let t;
    if (this.g.phase === "reveal") {
      t = this.g.revealUntil;
    } else {
      t = this.g.deadline;
      if (this.g.botDue && (!t || this.g.botDue < t)) t = this.g.botDue;
    }
    this.ctx.storage.setAlarm(t);
  }

  async alarm() {
    await this.load();
    if (this.g === false) return;

    // 结算重试
    if (this.g.status === "finished") {
      if (!this.g.settled && this.g.result) {
        await this.settleCoins();
      }
      return;
    }

    await this.tick(Date.now());
    this.schedule();
  }

  /* 状态机推进：alarm 与长轮询共用，保证 alarm 延迟时请求也能兜底推进 */
  async tick(now) {
    // 掉线逃跑判定（真人侧，宽限 60s）
    for (const side of ["p1", "p2"]) {
      if (!this.g[side].u) continue;
      const ts = this.g.last[side] || 0;
      // 开局初期没有心跳不判（机器人补位后玩家还在加载页面）
      if (ts && now - ts > OFFLINE_MS) {
        await this.endQuit(side, "offline");
        return;
      }
    }

    if (this.g.phase === "reveal") {
      if (now >= this.g.revealUntil) {
        if (this.g.round >= ROUNDS) {
          await this.finishGame();
          return;
        }
        this.startRound(this.g.round + 1);
      }
    } else {
      const bot = this.botSide();
      const human = this.other(bot || "p2");
      // 6 号人机前 3 轮要和玩家选得一样：玩家没决定前不急着选，等 deadline 兜底
      const mirrorWaits = this.g.p2.bot === 6 && this.g.round <= 3 && this.g.ch[human] === null;
      if (bot && this.g.ch[bot] === null && this.g.botDue && now >= this.g.botDue && !mirrorWaits) {
        this.g.ch[bot] = this.pickBot();
        this.bump();
      }
      // 人机刚出牌且玩家早已决定：立即亮牌；否则等到 30s deadline（含超时弃权）
      if ((this.g.ch.p1 !== null && this.g.ch.p2 !== null) || now >= this.g.deadline) {
        this.resolveRound();
      }
    }
  }

  /* ---------------- 玩家视角序列化（隐藏对方未亮出的选择）---------------- */

  view(side) {
    const g = this.g;
    const opp = this.other(side);
    const reveal = g.phase === "reveal";
    return {
      ok: true,
      id: g.id,
      ver: g.ver,
      serverNow: Date.now(),
      status: g.status,
      settled: g.settled,
      round: g.round,
      phase: g.phase,
      rounds: ROUNDS,
      deadline: g.deadline,
      revealUntil: g.revealUntil,
      pool: g.p1.ante + g.p2.ante,
      you: side,
      me: playerView(g[side]),
      opp: playerView(g[opp]),
      scores: { ...g.scores },
      myChoice: g.ch[side],
      oppChosen: reveal ? g.ch[opp] : (g.ch[opp] !== null),
      revealChoices: reveal ? { mine: g.ch[side], opp: g.ch[opp] } : null,
      hist: g.hist,
      result: g.result ? {
        ...g.result,
        myPayout: g.result.payouts[side] || 0,
        oppPayout: g.result.payouts[opp] || 0,
        myPenalty: g.result.penalties[side] || 0,
      } : null,
    };
  }
}

function normPlayer(p) {
  p = p || {};
  return {
    u: p.u ? String(p.u) : null,
    avatar: Number.isInteger(p.avatar) ? p.avatar : null,
    ante: Number.isInteger(p.ante) ? p.ante : 0,
    bot: Number.isInteger(p.bot) ? p.bot : 0,
  };
}

/* 对前端序列化：永远不透露对方是否人机，统一叫“神秘玩家”（头像回退到默认款） */
function playerView(p) {
  return {
    name: p.u || "神秘玩家",
    avatar: p.u ? p.avatar : null,
    ante: p.ante,
  };
}
