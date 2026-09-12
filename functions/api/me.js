// GET /api/me → { username } 或 401
import { json, getSessionUser } from "./_utils.js";

export async function onRequestGet({ request, env }) {
  if (!env.AUTH_KV) return json({ username: null }, 200);
  const username = await getSessionUser(request, env);
  if (!username) return json({ username: null }, 401);
  return json({ username }, 200);
}
