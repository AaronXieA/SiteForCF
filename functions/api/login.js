// POST /api/login  { username, password }
import { json, userKey, hashPassword, createSession, authHeaders } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  if (!env.AUTH_KV) return json({ ok: false, error: "后端未配置 KV 绑定（AUTH_KV）" }, 500);

  const body = await request.json().catch(() => ({}));
  const username = (body.username || "").trim();
  const password = body.password || "";

  const raw = await env.AUTH_KV.get(userKey(username));
  if (!raw) return json({ ok: false, error: "用户不存在，请先注册" }, 401);

  const user = JSON.parse(raw);
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.hash) return json({ ok: false, error: "密码错误" }, 401);

  const { cookie } = await createSession(env, user.name);
  return json({ ok: true, username: user.name }, 200, authHeaders(cookie));
}
