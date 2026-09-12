// POST /api/logout → 清除服务端会话与 Cookie
import { json, destroySession, authHeaders } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  if (env.AUTH_KV) await destroySession(request, env);
  return json({ ok: true }, 200, authHeaders("xrst_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"));
}
