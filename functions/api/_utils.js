// =====================================================
// 共享工具：KV 读写、PBKDF2 密码哈希、会话 Cookie
// KV 绑定名：AUTH_KV（在 CF Pages 项目设置中绑定）
// =====================================================

export const SESSION_COOKIE = "xrst_session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 天（秒）
// PBKDF2 迭代次数：兼顾 Workers 免费版 10ms CPU 限制与基本安全
const PBKDF2_ITERATIONS = 20_000;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr);
}

export async function hashPassword(password, saltHex) {
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

export function validateCredentials(username, password) {
  if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/.test(username || "")) {
    return "用户名需为 2-20 位字母、数字、下划线或中文";
  }
  if (!password || password.length < 6) return "密码至少 6 位";
  return null;
}

export function userKey(username) {
  return `user:${username.toLowerCase()}`;
}

/* ---------- 会话 ---------- */
export async function createSession(env, username) {
  const token = randomHex(32);
  await env.AUTH_KV.put(`session:${token}`, username, { expirationTtl: SESSION_TTL });
  return { token, cookie: sessionCookie(token, SESSION_TTL) };
}

export async function getSessionUser(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([a-f0-9]+)`));
  if (!m) return null;
  const username = await env.AUTH_KV.get(`session:${m[1]}`);
  return username || null;
}

export async function destroySession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([a-f0-9]+)`));
  if (m) await env.AUTH_KV.delete(`session:${m[1]}`);
  return sessionCookie("", 0);
}

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function authHeaders(cookie) {
  return { "Set-Cookie": cookie };
}
