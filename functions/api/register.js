// POST /api/register  { username, password }
import { json, validateCredentials, userKey, hashPassword, randomHex, createSession, authHeaders } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  if (!env.AUTH_KV) return json({ ok: false, error: "后端未配置 KV 绑定（AUTH_KV）" }, 500);

  const body = await request.json().catch(() => ({}));
  const username = (body.username || "").trim();
  const password = body.password || "";

  const invalid = validateCredentials(username, password);
  if (invalid) return json({ ok: false, error: invalid }, 400);

  const key = userKey(username);
  const existing = await env.AUTH_KV.get(key);
  if (existing) return json({ ok: false, error: "该用户名已被注册" }, 409);

  const salt = randomHex(16);
  const hash = await hashPassword(password, salt);
  await env.AUTH_KV.put(key, JSON.stringify({ name: username, salt, hash, createdAt: Date.now() }));

  const { cookie } = await createSession(env, username);
  return json({ ok: true, username }, 200, authHeaders(cookie));
}
