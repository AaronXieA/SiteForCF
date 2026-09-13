/* =====================================================
 * XRST 个人主页 · 通用交互（导航 / 登录弹窗 / Toast）
 * ===================================================== */

/* ---------- Toast ---------- */
function showToast(message, duration = 2600, type = "") {
  const box = document.getElementById("toastBox");
  if (!box) return;
  const toast = document.createElement("div");
  toast.className = "toast" + (type ? " toast-" + type : "");
  toast.textContent = message;
  box.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("out");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, duration);
}

/* ---------- 导航滚动态 ---------- */
const nav = document.getElementById("nav");
if (nav) {
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ---------- 导航右上角登录区 ---------- */
async function renderNavAuth(knownUser) {
  const box = document.getElementById("navAuth");
  if (!box) return;
  const user = knownUser !== undefined ? knownUser : await Auth.currentUser();
  if (user) {
    box.innerHTML = `
      <a class="nav-shop-link" href="/#rewards" title="每日签到 · 兑换商店">🪙<b id="navCoins">–</b></a>
      <a class="nav-search-link" href="/search/">搜索用户</a>
      <a class="nav-user" href="/profile/" title="进入我的个人主页">你好，<strong></strong></a>
      <button class="btn btn-ghost btn-small" id="logoutBtn">退出</button>
    `;
    box.querySelector("strong").textContent = user; // 防 XSS
    box.querySelector("#logoutBtn").addEventListener("click", async () => {
      await Auth.logout();
      renderNavAuth(null);
      if (typeof loadProfile === "function") loadProfile();
      showToast("已退出登录");
    });
    refreshNavCoins();
    // 通知公告栏：管理员已登录
    window.dispatchEvent(new CustomEvent("auth-user", { detail: user }));
  } else {
    box.innerHTML = `
      <a class="nav-search-link" href="/search/">搜索用户</a>
      <button class="btn btn-solid btn-small" id="openAuthBtn">登录</button>
    `;
    box.querySelector("#openAuthBtn").addEventListener("click", openAuthModal);
    window.dispatchEvent(new CustomEvent("auth-user", { detail: null }));
  }
}

/* 导航栏金币数（静默失败，不影响其他功能）*/
async function refreshNavCoins() {
  try {
    const res = await fetch("/api/me?t=" + Date.now(), { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return;
    const d = await res.json();
    const el = document.getElementById("navCoins");
    if (el) el.textContent = d.coins ?? 0;
  } catch { /* 忽略 */ }
}
window.addEventListener("coins-changed", () => refreshNavCoins());

/* ---------- 在线心跳（所有页面共用，游客也会计数）---------- */
(function presenceHeartbeat() {
  let sid = localStorage.getItem("xrst_sid");
  if (!sid) {
    sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    localStorage.setItem("xrst_sid", sid);
  }
  let beating = false;
  function beat() {
    if (beating || document.hidden) return;
    beating = true;
    fetch("/api/presence?t=" + Date.now(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ sid }),
      keepalive: true,
    }).catch(() => {}).finally(() => { beating = false; });
  }
  setTimeout(beat, 800);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) beat(); });
  window.addEventListener("focus", beat);
  window.addEventListener("pageshow", beat);
  window.addEventListener("auth-user", beat);
  setInterval(beat, 100_000); // 100 秒一次，服务端 130 秒过期窗口
})();

/* ---------- 登录 / 注册弹窗 ---------- */
const authModal = document.getElementById("authModal");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

function openAuthModal() {
  if (!authModal) return;
  authModal.hidden = false;
  switchTab("login");
  document.body.style.overflow = "hidden";
}
function closeAuthModal() {
  if (!authModal) return;
  authModal.hidden = true;
  document.body.style.overflow = "";
  loginForm.reset();
  registerForm.reset();
  setMsg(loginForm, "");
  setMsg(registerForm, "");
}

function switchTab(name) {
  document.querySelectorAll("#authModal .tab").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === name));
  loginForm.hidden = name !== "login";
  registerForm.hidden = name !== "register";
}

function setMsg(form, text, type = "") {
  const el = form.querySelector("[data-msg]");
  el.textContent = text;
  el.className = "form-msg" + (type ? " " + type : "");
}

document.querySelectorAll("#authModal .tab").forEach(tab =>
  tab.addEventListener("click", () => switchTab(tab.dataset.tab)));

document.getElementById("authClose")?.addEventListener("click", closeAuthModal);
authModal?.addEventListener("click", e => { if (e.target === authModal) closeAuthModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeAuthModal(); });

loginForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const data = new FormData(loginForm);
  setMsg(loginForm, "登录中…");
  const res = await Auth.login(data.get("username"), data.get("password"));
  if (res.ok) {
    closeAuthModal();
    renderNavAuth(res.username);
    if (typeof loadProfile === "function") loadProfile();
    showToast(`欢迎回来，${res.username}`);
  } else {
    setMsg(loginForm, res.error || "登录失败", "err");
  }
});

registerForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const data = new FormData(registerForm);
  if (data.get("password") !== data.get("password2")) {
    setMsg(registerForm, "两次输入的密码不一致", "err");
    return;
  }
  setMsg(registerForm, "创建中…");
  const res = await Auth.register(data.get("username"), data.get("password"));
  if (res.ok) {
    closeAuthModal();
    renderNavAuth(res.username);
    if (typeof loadProfile === "function") loadProfile();
    showToast(`注册成功，欢迎 ${res.username}`);
  } else {
    setMsg(registerForm, res.error || "注册失败", "err");
  }
});

renderNavAuth();

/* ---------- 彩蛋：连续点击版权 10 次跳转 114514.xrst.uk ---------- */
const footerCopy = document.getElementById("footerCopy");
if (footerCopy) {
  let copyClickCount = 0;
  let copyClickTimer = null;
  footerCopy.addEventListener("click", () => {
    copyClickCount++;
    clearTimeout(copyClickTimer);
    copyClickTimer = setTimeout(() => copyClickCount = 0, 1500);
    if (copyClickCount >= 10) {
      copyClickCount = 0;
      showToast("🥚 彩蛋解锁，正在传送…");
      setTimeout(() => { window.location.href = "https://114514.xrst.uk"; }, 700);
    } else if (copyClickCount >= 7) {
      showToast(`再点 ${10 - copyClickCount} 次…`, 1000);
    }
  });
}
