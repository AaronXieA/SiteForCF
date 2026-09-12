/* =====================================================
 * XRST.Uk · 账号系统（Cloudflare Worker + KV 后端）
 * 数据存储在服务端 KV，登录状态由 HttpOnly Cookie 维持，
 * 换设备/浏览器登录同一账号即可。
 * ===================================================== */

const Auth = (() => {
  async function post(url, body) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
        cache: "no-store",
      });
      return await res.json().catch(() => ({ ok: false, error: "服务器响应异常" }));
    } catch {
      return { ok: false, error: "无法连接服务器（后端未部署或网络异常）" };
    }
  }

  function register(username, password) {
    return post("/api/register", { username, password });
  }

  function login(username, password) {
    return post("/api/login", { username, password });
  }

  async function logout() {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
    } catch {}
  }

  async function currentUser() {
    try {
      const res = await fetch("/api/me", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.username || null;
    } catch {
      return null;
    }
  }

  return { register, login, logout, currentUser };
})();
