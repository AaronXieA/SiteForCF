/* =====================================================
 * XRST 个人主页 · 通用交互（导航 / 登录弹窗 / Toast）
 * ===================================================== */

/* =====================================================
 * 弹窗动画助手（PCL 风格：淡入淡出 + 窗口绕左侧旋转）
 * 所有页面的弹窗统一走 XRST.openMask / XRST.closeMask，
 * 动画时长由 CSS 变量 --mask-out / --win-out 控制。
 * ===================================================== */
(function setupMaskAnimations() {
  let depth = 0; // 同时打开的弹窗数，用于正确恢复 body 滚动

  function cssDuration(name, fallback) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    const m = (raw || "").trim().match(/([\d.]+)(ms|s)/);
    if (!m) return fallback;
    return parseFloat(m[1]) * (m[2] === "s" ? 1000 : 1);
  }

  function openMask(mask) {
    if (!mask) return;
    if (!mask.hidden) return; // 已在显示/退场中
    mask.classList.remove("closing");
    mask.hidden = false;
    if (depth++ === 0) document.body.style.overflow = "hidden";
    // 强制回流后再加 .show，保证入场关键帧从第一帧开始
    void mask.offsetWidth;
    mask.classList.add("show");
  }

  function closeMask(mask) {
    if (!mask || mask.hidden || mask.classList.contains("closing")) return;
    mask.classList.remove("show");
    mask.classList.add("closing");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      mask.hidden = true;
      mask.classList.remove("closing");
      depth = Math.max(0, depth - 1);
      if (depth === 0) document.body.style.overflow = "";
    };
    mask.addEventListener("animationend", function onEnd(e) {
      // 只认遮罩自身的淡出动画，忽略内部元素冒泡上来的事件
      if (e.target === mask && e.animationName === "xrstMaskOut") {
        mask.removeEventListener("animationend", onEnd);
        finish();
      }
    });
    // 兜底：动画事件万一丢失也不会关不上
    setTimeout(finish, cssDuration("--mask-out", 170) + 140);
  }

  window.XRST = window.XRST || {};
  window.XRST.openMask = openMask;
  window.XRST.closeMask = closeMask;
})();

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
let _cachedNavUser = undefined;
async function renderNavAuth(knownUser) {
  const box = document.getElementById("navAuth");
  if (!box) return;
  const user = knownUser !== undefined ? knownUser : await Auth.currentUser();
  _cachedNavUser = user;
  const langBtn = `<button class="btn btn-ghost btn-small nav-lang" id="navLangBtn" title="${I18n.getLang() === "zh" ? "Switch to English" : "切换到中文"}">${I18n.getLang() === "zh" ? "EN" : "中"}</button>`;
  if (user) {
    box.innerHTML = `
      ${langBtn}
      <a class="nav-shop-link" href="/#rewards" title="${I18n.t("nav.coinsTip")}">🪙<b id="navCoins">–</b></a>
      <a class="nav-search-link" href="/search/">${I18n.t("nav.searchUser")}</a>
      ${user === "AaronXie" ? `<a class="nav-search-link" href="/admin/" title="${I18n.t("nav.coinManageTip")}">${I18n.t("nav.coinManage")}</a>` : ""}
      <a class="nav-user" href="/profile/" title="${I18n.t("nav.profileTip")}">${I18n.t("nav.hello")}<strong></strong><span class="vip-badge nav-vip" id="navVip" title="${I18n.t("nav.vip")}" hidden>👑</span></a>
      <button class="btn btn-ghost btn-small" id="logoutBtn">${I18n.t("nav.logout")}</button>
    `;
    box.querySelector("strong").textContent = user; // 防 XSS
    box.querySelector("#logoutBtn").addEventListener("click", async () => {
      await Auth.logout();
      renderNavAuth(null);
      if (typeof loadProfile === "function") loadProfile();
      showToast(I18n.t("chat.logoutOk"));
    });
    refreshNavCoins();
    // 通知公告栏：管理员已登录
    window.dispatchEvent(new CustomEvent("auth-user", { detail: user }));
  } else {
    box.innerHTML = `
      ${langBtn}
      <a class="nav-search-link" href="/search/">${I18n.t("nav.searchUser")}</a>
      <button class="btn btn-solid btn-small" id="openAuthBtn">${I18n.t("nav.login")}</button>
    `;
    box.querySelector("#openAuthBtn").addEventListener("click", openAuthModal);
    window.dispatchEvent(new CustomEvent("auth-user", { detail: null }));
  }
  box.querySelector("#navLangBtn")?.addEventListener("click", () => {
    I18n.setLang(I18n.getLang() === "zh" ? "en" : "zh");
    renderNavAuth(_cachedNavUser);
  });
}

/* 导航栏金币数与 VIP 皇冠（静默失败，不影响其他功能）*/
async function refreshNavCoins() {
  try {
    const res = await fetch("/api/me?t=" + Date.now(), { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return;
    const d = await res.json();
    const el = document.getElementById("navCoins");
    if (el) el.textContent = d.coins ?? 0;
    const vipEl = document.getElementById("navVip");
    if (vipEl) {
      vipEl.hidden = !d.vip;
      if (d.vip && d.vipUntil) vipEl.title = `VIP 会员（${new Date(d.vipUntil).toLocaleDateString("zh-CN")} 到期）`;
    }
  } catch { /* 忽略 */ }
}
window.addEventListener("coins-changed", () => refreshNavCoins());
window.addEventListener("vip-changed", () => refreshNavCoins());

/* ---------- 在线心跳（所有页面共用，游客也会计数）----------
 * KV 写入极其宝贵（免费额度 1000 次/天），双端严格节流：
 * - 定时器 120 秒一次；切后台/回前台等事件 90 秒内不重复发
 * - 服务端还会再吞掉同一会话 200 秒内的心跳，实际约 4 分钟一次写
 */
(function presenceHeartbeat() {
  let sid = localStorage.getItem("xrst_sid");
  if (!sid) {
    sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    localStorage.setItem("xrst_sid", sid);
  }
  let beating = false;
  let lastBeatAt = 0;
  const MIN_GAP_MS = 90_000; // 事件触发的心跳至少间隔 90 秒
  function beat(force) {
    if (beating || document.hidden) return;
    const now = Date.now();
    if (!force && now - lastBeatAt < MIN_GAP_MS) return;
    lastBeatAt = now;
    beating = true;
    fetch("/api/presence?t=" + now, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ sid }),
      keepalive: true,
    }).catch(() => {}).finally(() => { beating = false; });
  }
  setTimeout(() => beat(true), 1500);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) beat(); });
  window.addEventListener("focus", () => beat());
  window.addEventListener("pageshow", () => beat());
  window.addEventListener("auth-user", () => beat());
  setInterval(() => beat(true), 120_000); // 120 秒一次，服务端新鲜窗口 270 秒
})();

/* ---------- 登录 / 注册弹窗 ----------
 * 若页面未内置 #authModal（子页面常见），动态注入一份标准弹窗，
 * 保证所有加载 main.js 的页面都能登录。 */
(function ensureAuthModal() {
  if (document.getElementById("authModal")) return;
  const html = `
  <div class="modal-mask" id="authModal" hidden>
    <div class="modal" role="dialog" aria-modal="true">
      <button class="modal-close" id="authClose" data-i18n="common.close" data-i18n-attr="aria-label" aria-label="关闭">×</button>
      <div class="modal-tabs">
        <button class="tab active" data-tab="login" data-i18n="auth.loginTab">登录</button>
        <button class="tab" data-tab="register" data-i18n="auth.registerTab">注册</button>
      </div>
      <form id="loginForm" class="modal-form" autocomplete="on">
        <label data-i18n="auth.usernameLabel">用户名 / XRSTUID
          <input type="text" name="username" required minlength="2" maxlength="20" data-i18n="auth.usernamePlaceholder" data-i18n-attr="placeholder" placeholder="用户名或 XRSTUID" />
        </label>
        <label data-i18n="auth.passwordLabel">密码
          <input type="password" name="password" required minlength="6" data-i18n="auth.passwordPlaceholder" data-i18n-attr="placeholder" placeholder="至少 6 位" />
        </label>
        <p class="form-msg" data-msg></p>
        <button type="submit" class="btn btn-solid btn-block" data-i18n="auth.loginBtn">登录</button>
      </form>
      <form id="registerForm" class="modal-form" hidden autocomplete="off">
        <label data-i18n="auth.usernameLabel">用户名
          <input type="text" name="username" required minlength="2" maxlength="20" data-i18n="auth.registerUsernamePlaceholder" data-i18n-attr="placeholder" placeholder="2-20 个字符" />
        </label>
        <label data-i18n="auth.passwordLabel">密码
          <input type="password" name="password" required minlength="6" data-i18n="auth.passwordPlaceholder" data-i18n-attr="placeholder" placeholder="至少 6 位" />
        </label>
        <label data-i18n="auth.confirmPasswordLabel">确认密码
          <input type="password" name="password2" required minlength="6" data-i18n="auth.confirmPasswordPlaceholder" data-i18n-attr="placeholder" placeholder="再输一遍" />
        </label>
        <p class="form-msg" data-msg></p>
        <button type="submit" class="btn btn-solid btn-block" data-i18n="auth.registerBtn">创建账号</button>
        <p class="form-note" data-i18n="auth.formNote">账号存储在云端，换设备也能登录。</p>
      </form>
    </div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", html);
  if (window.I18n && window.I18n.applyTo) {
    try { window.I18n.applyTo(document.getElementById("authModal")); } catch (e) {}
  }
})();

const authModal = document.getElementById("authModal");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

function openAuthModal() {
  if (!authModal) return;
  XRST.openMask(authModal);
  switchTab("login");
  requestAnimationFrame(moveAuthTabIndicator);
}
function closeAuthModal() {
  if (!authModal) return;
  XRST.closeMask(authModal);
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
  tab.addEventListener("click", () => {
    switchTab(tab.dataset.tab);
    requestAnimationFrame(() => moveAuthTabIndicator(true));
  }));

/* 登录 / 注册 tab：下划线滑动（注入到现成的 .modal-tabs，免改 HTML） */
let moveAuthTabIndicator = () => {};
(function authTabIndicator() {
  const tabs = document.querySelector("#authModal .modal-tabs");
  if (!tabs) return;
  const ind = document.createElement("span");
  ind.className = "auth-tab-ind";
  tabs.appendChild(ind);
  moveAuthTabIndicator = function (animate) {
    const active = tabs.querySelector(".tab.active");
    if (!active || active.offsetWidth === 0) return;
    ind.style.width = active.offsetWidth + "px";
    ind.style.transform = `translateX(${active.offsetLeft}px)`;
    if (animate) ind.classList.add("ready");
  };
  window.addEventListener("resize", () => moveAuthTabIndicator(false));
})();

/* 方块滑块：所有 .board-tabs（画板的 文字/像素 切换、商店 头像框/气泡 分类） */
document.querySelectorAll(".board-tabs").forEach(tabs => {
  const ind = document.createElement("span");
  ind.className = "board-tab-ind";
  tabs.appendChild(ind);

  function move(animate) {
    const active = tabs.querySelector(".board-tab.active");
    if (!active || active.offsetWidth === 0) return;
    ind.style.width = active.offsetWidth + "px";
    ind.style.transform = `translateX(${active.offsetLeft}px)`;
    if (animate) ind.classList.add("ready");
  }
  move(false);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => move(false)).catch(() => {});
  }
  // 容器级监听在按钮自身的 click 处理（切换 active）之后冒泡触发
  tabs.addEventListener("click", e => {
    if (e.target.closest(".board-tab")) requestAnimationFrame(() => move(true));
  });
  window.addEventListener("resize", () => move(false), { passive: true });
  // 商店的 tabs 在弹窗里，隐藏时无法测量；弹窗一显示立刻定位
  const mask = tabs.closest(".modal-mask");
  if (mask && "MutationObserver" in window) {
    new MutationObserver(() => {
      if (!mask.hidden) requestAnimationFrame(() => move(false));
    }).observe(mask, { attributes: true, attributeFilter: ["hidden"] });
  }
});

document.getElementById("authClose")?.addEventListener("click", closeAuthModal);
authModal?.addEventListener("click", e => { if (e.target === authModal) closeAuthModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeAuthModal(); });

loginForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const data = new FormData(loginForm);
  setMsg(loginForm, I18n.t("auth.loggingIn"));
  const res = await Auth.login(data.get("username"), data.get("password"));
  if (res.ok) {
    closeAuthModal();
    renderNavAuth(res.username);
    if (typeof loadProfile === "function") loadProfile();
    showToast(I18n.t("auth.welcomeBack", { n: res.username }));
  } else {
    setMsg(loginForm, res.error || I18n.t("auth.loginFailed"), "err");
  }
});

registerForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const data = new FormData(registerForm);
  if (data.get("password") !== data.get("password2")) {
    setMsg(registerForm, I18n.t("auth.passwordMismatch"), "err");
    return;
  }
  setMsg(registerForm, I18n.t("auth.creating"));
  const res = await Auth.register(data.get("username"), data.get("password"));
  if (res.ok) {
    closeAuthModal();
    renderNavAuth(res.username);
    if (typeof loadProfile === "function") loadProfile();
    showToast(I18n.t("auth.welcomeRegister", { n: res.username }));
  } else {
    setMsg(registerForm, res.error || I18n.t("auth.registerFailed"), "err");
  }
});

renderNavAuth();

/* ---------- 彩蛋：连续点击版权 10 次进入尹桁页面 ---------- */
(function () {
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
      window.location.href = "/yinheng/";
    }
  });
  }
})();

/* ---------- 玩家榜单 ---------- */
(function () {
  const wrap = document.getElementById("lbWrap");
  if (!wrap) return;
  fetch("/api/dc/leaderboard")
    .then(r => r.json())
    .then(d => {
      if (!d.ok || !wrap) return;
      const cols = [
        { key: "coins", icon: "🪙", title: "金币榜", sub: "全站累计" },
        { key: "souls", icon: "🔥", title: "反骨之魂", sub: "DontClick" },
        { key: "clicks", icon: "👆", title: "点击榜", sub: "DontClick" },
      ];
      wrap.innerHTML = cols.map(c => {
        const arr = d[c.key] || [];
        const rows = arr.length
          ? arr.map((x, i) => {
              const rank = x.rank || i + 1;
              const cls = rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "";
              return '<div class="lb-row ' + cls + '">' +
                '<span class="lb-rank">' + rank + '</span>' +
                '<span class="lb-name">' + escapeHtml(x.username) + '</span>' +
                '<span class="lb-val">' + x.value.toLocaleString() + '</span>' +
              '</div>';
            }).join("")
          : '<p class="lb-empty">暂无数据</p>';
        return '<div class="lb-board">' +
          '<div class="lb-board-head">' +
            '<span class="lb-board-icon">' + c.icon + '</span>' +
            '<div>' +
              '<h3 class="lb-board-title">' + c.title + '</h3>' +
              '<p class="lb-board-sub">' + c.sub + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="lb-list">' + rows + '</div>' +
        '</div>';
      }).join("");
      // 若已登录，补一个 me 提示
      if (d.me && d.me.username) {
        const ranks = d.me.ranks || {};
        const rankText = (r) => (r ? "第 " + r + " 名" : "未上榜");
        wrap.insertAdjacentHTML("afterend",
          '<div class="lb-me">你的排名：🪙 ' + rankText(ranks.coins) + ' · 🔥 ' + rankText(ranks.souls) + ' · 👆 ' + rankText(ranks.clicks) + '</div>'
        );
      }
    })
    .catch(() => {
      if (wrap) wrap.innerHTML = '<p class="lb-empty">榜单加载失败，稍后刷新试试</p>';
    });

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
})();

/* =====================================================
 * 首页「一些小东西」：默认折叠，点底部按钮展开/收起
 * ===================================================== */
(function () {
  const works = document.getElementById("works");
  const toggle = document.getElementById("worksToggle");
  if (!works || !toggle) return;
  const cardsEl = works.querySelector(".cards");

  function label(open) {
    if (window.I18n) return I18n.t(open ? "home.collapseWorks" : "home.expandWorks");
    return open ? "收起好玩的 ▴" : "展开好玩的 ▾";
  }

  function setOpen(open) {
    works.classList.toggle("works-open", open);
    toggle.textContent = label(open);
    toggle.setAttribute("aria-expanded", String(open));
  }

  /* 折叠几何：让折叠条上沿对齐「第二行卡片」顶部——
     第一行完整清晰露出，渐变遮罩从第二行才开始 */
  function measureFold() {
    if (!cardsEl) return;
    const cardEls = Array.prototype.filter.call(cardsEl.children,
      c => c.classList && c.classList.contains("card"));
    if (cardEls.length < 2) return;
    const base = cardsEl.getBoundingClientRect().top;
    const tops = cardEls.map(c => Math.round(c.getBoundingClientRect().top - base));
    const firstTop = tops[0];
    let row2Top = 0;
    for (const t of tops) {
      if (t > firstTop + 4) { row2Top = t; break; }
    }
    if (!row2Top) return;
    const gap = parseFloat(getComputedStyle(cardsEl).rowGap) || 10;
    const foldTop = Math.max(0, row2Top - gap / 2);
    const PEEK = 78; // 第二行卡片在渐变区下露出的高度
    works.style.setProperty("--works-fold-top", foldTop + "px");
    works.style.setProperty("--works-peek", foldTop + PEEK + "px");
  }

  toggle.addEventListener("click", () => {
    const open = !works.classList.contains("works-open");
    setOpen(open);
    // 收起时滚回板块标题，避免页面突然缩短把人甩走
    if (!open) works.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measureFold); };
  window.addEventListener("resize", schedule);
  window.addEventListener("load", schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  measureFold();
  setTimeout(measureFold, 400);
  setTimeout(measureFold, 1200);
  window.addEventListener("lang-changed", () => {
    toggle.textContent = label(works.classList.contains("works-open"));
  });

  // 带 #works 锚点进来时自动展开
  if (location.hash === "#works") setOpen(true);
})();
