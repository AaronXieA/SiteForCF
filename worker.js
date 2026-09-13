// =====================================================
// XRST.Uk · Cloudflare Worker
// 静态资源（public/）由 Assets 运行时直接响应；
// /api/* 由本脚本处理（注册/登录/会话/退出），数据存 KV。
// =====================================================

const SESSION_COOKIE = "xrst_session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 天（秒）
const PBKDF2_ITERATIONS = 20_000;

/* 商店目录（服务端权威定价）：头像框 / 聊天气泡 */
const FRAME_SHOP = { f1: 30, f2: 20, f3: 60, f4: 100, f5: 150 };
const BUBBLE_SHOP = { b1: 30, b2: 30, b3: 50, b4: 80, b5: 150 };

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, pathname);
      } catch (err) {
        return json({ ok: false, error: "服务器内部错误" }, 500);
      }
    }
    // 其余路径交给静态资源（/、/dontclickit/、css/js 等）
    const assetResponse = await env.ASSETS.fetch(request);
    // 给 HTML / JS / CSS 加 no-store 头，防止浏览器或 CDN 缓存旧版本
    const url = new URL(request.url);
    if (url.pathname.match(/\.(js|css)$/) || url.pathname === "/" || url.pathname.endsWith("/")) {
      const newHeaders = new Headers(assetResponse.headers);
      newHeaders.delete("Cache-Control");
      // text() 已自动解压，移除压缩相关头避免浏览器二次解压
      newHeaders.delete("Content-Encoding");
      newHeaders.delete("Content-Length");
      newHeaders.set("Cache-Control", "no-store");
      const body = await assetResponse.text();
      return new Response(body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers: newHeaders,
      });
    }
    return assetResponse;
  },
};

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
    return json(meView(user), 200);
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
    return json({ ok: true, reward, coins: user.coins, streak, checked: true }, 200);
  }

  /* ---------- 兑换商店：购买 / 装备 / 卸下 ---------- */
  if (pathname === "/api/shop" && method === "POST") {
    const me = await getSessionUser(request, env);
    if (!me) return json({ ok: false, error: "请先登录" }, 401);
    const body = await request.json().catch(() => ({}));
    const { action, type, id } = body;
    if (!["frame", "bubble"].includes(type)) return json({ ok: false, error: "商品类型错误" }, 400);
    const catalog = type === "frame" ? FRAME_SHOP : BUBBLE_SHOP;
    if (!["buy", "equip", "unequip"].includes(action)) return json({ ok: false, error: "操作错误" }, 400);

    const key = userKey(me);
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: false, error: "用户不存在" }, 401);
    const user = JSON.parse(raw);
    const ownedKey = type === "frame" ? "frames" : "bubbles";
    const equipKey = type;
    user[ownedKey] = Array.isArray(user[ownedKey]) ? user[ownedKey] : [];

    if (action === "unequip") {
      user[equipKey] = null;
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
      return json({ ok: true, ...meView(user) }, 200);
    }

    // equip
    if (!user[ownedKey].includes(id)) return json({ ok: false, error: "还没拥有这件商品" }, 400);
    user[equipKey] = id;
    await env.AUTH_KV.put(key, JSON.stringify(user));
    return json({ ok: true, ...meView(user) }, 200);
  }

  /* ---------- 在线访客：心跳（单键聚合，省 KV 写入）---------- */
  if (pathname === "/api/presence") {
    const PRES_KEY = "online:agg";
    const PRES_TTL = 160;       // KV 键过期秒数
    const FRESH_MS = 130_000;   // 130 秒内有心跳算在线

    if (method === "GET") {
      const agg = await readPresence(env, PRES_KEY);
      const now = Date.now();
      const usersMap = new Map();
      let guests = 0;
      for (const [sid, p] of Object.entries(agg)) {
        if (!p.ts || now - p.ts > FRESH_MS) continue;
        if (p.u) {
          const lower = p.u.toLowerCase();
          const old = usersMap.get(lower);
          if (!old || p.ts > old.ts) usersMap.set(lower, { u: p.u, a: p.a ?? 0, f: p.f || null, ts: p.ts });
        } else {
          guests++;
        }
      }
      const users = [...usersMap.values()].map(x => ({ username: x.u, avatar: x.a, frame: x.f }));
      return json({ users, guests, total: users.length + guests }, 200);
    }

    if (method === "POST") {
      const body = await request.json().catch(() => ({}));
      const sid = String(body.sid || "").slice(0, 64);
      if (!sid) return json({ ok: false }, 400);
      const now = Date.now();
      const agg = await readPresence(env, PRES_KEY);
      // 顺手清理过期会话
      for (const k of Object.keys(agg)) {
        if (!agg[k].ts || now - agg[k].ts > FRESH_MS) delete agg[k];
      }
      const me = await getSessionUser(request, env);
      if (me) {
        const uRaw = await env.AUTH_KV.get(userKey(me));
        const u = uRaw ? JSON.parse(uRaw) : {};
        agg[sid] = { ts: now, u: me, a: u.avatar ?? 0, f: u.frame || null };
      } else {
        agg[sid] = { ts: now };
      }
      await env.AUTH_KV.put(PRES_KEY, JSON.stringify(agg), { expirationTtl: PRES_TTL });
      return json({ ok: true }, 200);
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
    if (await env.AUTH_KV.get(key)) return json({ ok: false, error: "该用户名已被注册" }, 409);

    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    const uid = await genUid(env);
    await env.AUTH_KV.put(key, JSON.stringify({
      name: username, salt, hash, createdAt: Date.now(), uid, searchable: true, avatar: 0,
      coins: 0, streak: 0, lastCheckin: null, frames: [], bubbles: [], frame: null, bubble: null,
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
      if (!raw) {
        // 用户存在但没写简介也返回空，方便分享主页链接
        return json({ username: u.name, uid: u.uid, avatar: u.avatar ?? 0, frame: u.frame || null, searchable: u.searchable, text: "", updatedAt: null }, 200);
      }
      const data = JSON.parse(raw);
      return json({ username: u.name, uid: u.uid, avatar: u.avatar ?? 0, frame: u.frame || null, searchable: u.searchable, text: data.text || "", updatedAt: data.updatedAt || null }, 200);
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

  /* ---------- 像素画板（256×256，20 色，RLE+base64 压缩存 KV）---------- */
  if (pathname === "/api/pixel") {
    const PX_KEY = "pixel:main";
    const PX_SIZE = 256 * 256;
    const MAX_PIXELS_PER_REQ = 3000;

    if (method === "GET") {
      const raw = await env.AUTH_KV.get(PX_KEY);
      if (!raw) return json({ data: "", v: 0 }, 200);
      try {
        const obj = JSON.parse(raw);
        return json({ data: obj.data || "", v: obj.v || 0 }, 200);
      } catch {
        return json({ data: "", v: 0 }, 200);
      }
    }

    if (method === "POST") {
      const me = await getSessionUser(request, env);
      if (!me) return json({ ok: false, error: "请先登录" }, 401);
      const body = await request.json().catch(() => ({}));
      const pixels = Array.isArray(body.pixels) ? body.pixels : null;
      if (!pixels || !pixels.length) return json({ ok: false, error: "没有要画的像素" }, 400);
      if (pixels.length > MAX_PIXELS_PER_REQ) return json({ ok: false, error: "一次画得太多了，慢一点～" }, 400);

      // 读当前网格
      const raw = await env.AUTH_KV.get(PX_KEY);
      let grid = new Uint8Array(PX_SIZE);
      let v = 0;
      if (raw) {
        try {
          const obj = JSON.parse(raw);
          if (obj.data) grid = rleDecode(obj.data, PX_SIZE);
          v = obj.v || 0;
        } catch { /* 数据损坏则从空白开始 */ }
      }

      // 合并本批像素（c: 0=橡皮/空白，1-20=调色板颜色）
      let changed = 0;
      for (const p of pixels) {
        const x = Number(p && p.x), y = Number(p && p.y), c = Number(p && p.c);
        if (!Number.isInteger(x) || x < 0 || x > 255) continue;
        if (!Number.isInteger(y) || y < 0 || y > 255) continue;
        if (!Number.isInteger(c) || c < 0 || c > 20) continue;
        const idx = y * 256 + x;
        if (grid[idx] !== c) { grid[idx] = c; changed++; }
      }
      if (!changed) return json({ ok: true, v }, 200);

      v++;
      const data = rleEncode(grid);
      await env.AUTH_KV.put(PX_KEY, JSON.stringify({ v, data }));
      return json({ ok: true, v }, 200);
    }
  }

  if (pathname === "/api/board") {
    // GET：公开读取文字画板
    if (method === "GET") {
      const raw = await env.AUTH_KV.get("board:main");
      if (!raw) return json({ text: "", editor: null, updatedAt: null }, 200);
      const data = JSON.parse(raw);
      return json({ text: data.text || "", editor: data.editor || null, updatedAt: data.updatedAt || null }, 200);
    }
    // POST/PUT：任何登录用户都可编辑（≤3500 字，后写入者覆盖）
    if (method === "POST" || method === "PUT") {
      const me = await getSessionUser(request, env);
      if (!me) return json({ ok: false, error: "请先登录" }, 401);
      const body = await request.json().catch(() => ({}));
      const text = typeof body.text === "string" ? body.text : "";
      if ([...text].length > 3500) return json({ ok: false, error: "画板内容不能超过 3500 字" }, 400);

      const data = { text, editor: me, updatedAt: Date.now() };
      await env.AUTH_KV.put("board:main", JSON.stringify(data));
      return json({ ok: true, ...data }, 200);
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
            results.push({ username: u.name, uid: u.uid || digits, avatar: u.avatar ?? 0, frame: u.frame || null });
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
          results.push({ username: u.name, uid: u.uid || null, avatar: u.avatar ?? 0, frame: u.frame || null });
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

  if (pathname === "/api/chat") {
    const CHAT_KEY = "chat:messages";
    const CHAT_MAX = 150;
    const MSG_MAX = 500;

    if (method === "GET") {
      const raw = await env.AUTH_KV.get(CHAT_KEY);
      const messages = raw ? JSON.parse(raw) : [];
      return json({ messages }, 200);
    }

    if (method === "POST") {
      const me = await getSessionUser(request, env);
      if (!me) return json({ ok: false, error: "请先登录" }, 401);
      const body = await request.json().catch(() => ({}));
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) return json({ ok: false, error: "消息不能为空" }, 400);
      if ([...text].length > MSG_MAX) return json({ ok: false, error: `每条消息最多 ${MSG_MAX} 字` }, 400);

      const raw = await env.AUTH_KV.get(CHAT_KEY);
      const messages = raw ? JSON.parse(raw) : [];
      const uRaw = await env.AUTH_KV.get(userKey(me));
      const u = uRaw ? JSON.parse(uRaw) : {};
      const msg = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        username: me,
        avatar: u.avatar ?? 0,
        frame: u.frame || null,
        bubble: (u.bubbles || []).includes(u.bubble) ? u.bubble : null,
        text,
        ts: Date.now(),
      };
      messages.push(msg);
      // 只保留最近 CHAT_MAX 条
      const trimmed = messages.slice(-CHAT_MAX);
      await env.AUTH_KV.put(CHAT_KEY, JSON.stringify(trimmed));
      return json({ ok: true, message: msg }, 200);
    }
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
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.hash) return json({ ok: false, error: "密码错误" }, 401);

    const cookie = await createSession(env, user.name);
    return json({ ok: true, username: user.name }, 200, authHeaders(cookie));
  }

  return json({ ok: false, error: "Not found" }, 404);
}

/* ---------------- 工具函数 ---------------- */

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
    // varint
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
  const CH = 0x8000; // 分块避免 apply 参数过多
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

/* /api/me 与商店操作返回的用户视图（缺失字段按默认值，不写盘） */
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
    frame: u.frame || null,
    bubble: u.bubble || null,
  };
}

/* 北京时间日期串（UTC+8），offset 天可为 -1 */
function beijingDate(offset = 0) {
  const d = new Date(Date.now() + (8 * 3600 + offset * 86400) * 1000);
  return d.toISOString().slice(0, 10);
}

async function readPresence(env, key) {
  const raw = await env.AUTH_KV.get(key);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
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
  return (await env.AUTH_KV.get(`session:${token}`)) || null;
}

async function destroySession(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.AUTH_KV.delete(`session:${token}`);
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
