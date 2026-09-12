// =====================================================
// XRST.Uk · Cloudflare Worker
// 静态资源（public/）由 Assets 运行时直接响应；
// /api/* 由本脚本处理（注册/登录/会话/退出），数据存 KV。
// =====================================================

const SESSION_COOKIE = "xrst_session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 天（秒）
const PBKDF2_ITERATIONS = 20_000;

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
    // 给 JS/CSS 加 no-cache 头，防止浏览器缓存旧版本
    const url = new URL(request.url);
    if (url.pathname.match(/\.(js|css)$/)) {
      const newHeaders = new Headers(assetResponse.headers);
      newHeaders.delete("Cache-Control");
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
    // 懒补 uid / searchable（兼容老用户）
    const user = await ensureUserFields(env, key, JSON.parse(raw));
    return json({ username: user.name, uid: user.uid }, 200);
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
    await env.AUTH_KV.put(key, JSON.stringify({ name: username, salt, hash, createdAt: Date.now(), uid, searchable: true }));
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
        return json({ username: u.name, uid: u.uid, searchable: u.searchable, text: "", updatedAt: null }, 200);
      }
      const data = JSON.parse(raw);
      return json({ username: u.name, uid: u.uid, searchable: u.searchable, text: data.text || "", updatedAt: data.updatedAt || null }, 200);
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
            results.push({ username: u.name, uid: u.uid || digits });
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
          results.push({ username: u.name, uid: u.uid || null });
        }
      }
    }
    return json({ results }, 200);
  }

  if (pathname === "/api/avatar") {
    // GET/HEAD ?u=xxx：读取用户头像（无则 404，前端回退为字母头像）
    if (method === "GET" || method === "HEAD") {
      const target = (new URL(request.url).searchParams.get("u") || "").trim().toLowerCase();
      if (!target) return json({ ok: false, error: "缺少用户" }, 400);
      const raw = await env.AUTH_KV.get(`avatar:${target}`);
      if (!raw) return json({ ok: false, error: "无头像" }, 404);
      const m = raw.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return json({ ok: false, error: "头像数据无效" }, 404);
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Response(bytes, {
        headers: { "Content-Type": m[1], "Cache-Control": "no-store" },
      });
    }
    // POST：上传/移除自己的头像（dataURL，≤100KB）
    if (method === "POST") {
      const me = await getSessionUser(request, env);
      if (!me) return json({ ok: false, error: "请先登录" }, 401);
      const body = await request.json().catch(() => ({}));
      const dataUrl = typeof body.avatar === "string" ? body.avatar.trim() : "";
      const akey = `avatar:${me.toLowerCase()}`;
      if (!dataUrl) {
        await env.AUTH_KV.delete(akey);
        return json({ ok: true, removed: true }, 200);
      }
      if (dataUrl.length > 100_000) return json({ ok: false, error: "头像图片太大，请换一张小图" }, 400);
      if (!/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
        return json({ ok: false, error: "图片格式不支持" }, 400);
      }
      await env.AUTH_KV.put(akey, dataUrl);
      return json({ ok: true }, 200);
    }
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

    // 迁移简介 / 书签 / 头像
    for (const [src, dst] of [
      [`bio:${oldLower}`, `bio:${newLower}`],
      [`bookmarks:${oldLower}`, `bookmarks:${newLower}`],
      [`avatar:${oldLower}`, `avatar:${newLower}`],
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
    const username = (body.username || "").trim();
    const password = body.password || "";

    const raw = await env.AUTH_KV.get(userKey(username));
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
