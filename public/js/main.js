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
async function renderNavAuth(knownUser) {
  const box = document.getElementById("navAuth");
  if (!box) return;
  const user = knownUser !== undefined ? knownUser : await Auth.currentUser();
  if (user) {
    box.innerHTML = `
      <a class="nav-shop-link" href="/#rewards" title="每日签到 · 兑换商店">🪙<b id="navCoins">–</b></a>
      <a class="nav-search-link" href="/search/">搜索用户</a>
      ${user === "AaronXie" ? '<a class="nav-search-link" href="/admin/coins" title="管理员金币后台">金币管理</a>' : ""}
      <a class="nav-user" href="/profile/" title="进入我的个人主页">你好，<strong></strong><span class="vip-badge nav-vip" id="navVip" title="VIP 会员" hidden>👑</span></a>
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

/* ---------- 登录 / 注册弹窗 ---------- */
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

/* 滚动入场：给首页卡片 / 各页标题等打标记，进入视口时淡入上移 */
(function revealOnScroll() {
  const groups = [
    ".hero-eyebrow", ".hero-title", ".hero-sub", ".hero-actions",
    ".section-title",
    ".card",
    ".about-list li",
    ".wb-eyebrow", ".wb-title", ".wb-sub",
    ".announce-board", ".chat-box", ".pixel-board",
  ];
  const els = [];
  groups.forEach(sel => document.querySelectorAll(sel).forEach(el => {
    if (el.hasAttribute("data-reveal")) return;
    el.setAttribute("data-reveal", "");
    // 同一父容器内依次入场（最多 5 级延迟）
    const idx = Array.prototype.indexOf.call(el.parentElement.children, el);
    const delay = Math.min(idx, 5) * 70;
    if (delay) el.style.transitionDelay = delay + "ms";
    els.push(el);
  }));
  if (!("IntersectionObserver" in window)) {
    els.forEach(el => el.classList.add("in-view"));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add("in-view");
        io.unobserve(en.target);
      }
    });
  }, { threshold: .1, rootMargin: "0px 0px -6% 0px" });
  els.forEach(el => io.observe(el));
})();

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
      showToast("🥚 彩蛋解锁，正在传送…");
      setTimeout(() => { window.location.href = "https://114514.xrst.uk"; }, 700);
    } else if (copyClickCount >= 7) {
      showToast(`再点 ${10 - copyClickCount} 次…`, 1000);
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

  function setOpen(open) {
    works.classList.toggle("works-open", open);
    toggle.textContent = open ? "收起 ▴" : "展开好玩的 ▾";
    toggle.setAttribute("aria-expanded", String(open));
  }

  toggle.addEventListener("click", () => {
    const open = !works.classList.contains("works-open");
    setOpen(open);
    // 收起时滚回板块标题，避免页面突然缩短把人甩走
    if (!open) works.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // 带 #works 锚点进来时自动展开
  if (location.hash === "#works") setOpen(true);
})();
