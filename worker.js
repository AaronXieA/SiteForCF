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
    return env.ASSETS.fetch(request);
  },
};

async function handleApi(request, env, pathname) {
  if (!env.AUTH_KV) return json({ ok: false, error: "后端未配置 KV 绑定（AUTH_KV）" }, 500);

  const method = request.method;

  if (pathname === "/api/me" && method === "GET") {
    const username = await getSessionUser(request, env);
    return json({ username: username || null }, username ? 200 : 401);
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
    await env.AUTH_KV.put(key, JSON.stringify({ name: username, salt, hash, createdAt: Date.now() }));

    const cookie = await createSession(env, username);
    return json({ ok: true, username }, 200, authHeaders(cookie));
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

      const raw = await env.AUTH_KV.get(bioKey(target));
      if (!raw) {
        // 本人访问：允许空白简介进入编辑；他人访问：404
        if (me && me.toLowerCase() === target.toLowerCase()) {
          return json({ username: me, text: "", updatedAt: null }, 200);
        }
        // 用户存在但没写简介也返回空，方便分享主页链接
        const exists = await env.AUTH_KV.get(userKey(target));
        if (exists) return json({ username: target, text: "", updatedAt: null }, 200);
        return json({ ok: false, error: "用户不存在" }, 404);
      }
      const data = JSON.parse(raw);
      return json({ username: target, text: data.text || "", updatedAt: data.updatedAt || null }, 200);
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
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
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
