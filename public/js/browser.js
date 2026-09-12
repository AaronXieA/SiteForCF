/* =====================================================
 * 浏览器里的浏览器……？
 * - 地址栏输入网址 → iframe 就地打开（不开新标签页）
 * - 登录用户可收藏网页到云端书签（每人最多 15 个）
 * ===================================================== */

const form = document.getElementById("wbForm");
const urlInput = document.getElementById("wbUrl");
const starBtn = document.getElementById("wbStar");
const emptyBox = document.getElementById("wbEmpty");
const blockedBox = document.getElementById("wbBlocked");
const toolbar = document.getElementById("wbToolbar");
const nowSpan = document.getElementById("wbNow");
const openNewLink = document.getElementById("wbOpenNew");
const blockedNewLink = document.getElementById("wbBlockedNew");

const bmList = document.getElementById("bmList");
const bmCount = document.getElementById("bmCount");
const bmHint = document.getElementById("bmHint");

let currentUrl = "";

/* ---------------- 地址处理 ---------------- */

function normalizeUrl(input) {
  let s = (input || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (!u.hostname.includes(".")) return ""; // 拒绝明显无效的输入
    return u.href;
  } catch {
    return "";
  }
}

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

/* ---------------- 多标签页 ----------------
 * 每个标签页 = 一个 iframe；切换 = 显示/隐藏。
 * 跨域限制：iframe 内 target="_blank" 的链接仍会开新标签页（浏览器安全机制），
 * 但普通链接会在 iframe 内跳转，标签页不会丢。
 */

const MAX_TABS = 8;
const tabs = []; // { id, title, url, frame, blocked }
let activeId = null;
let tabSeq = 0;

const tabBar = document.getElementById("wbTabs");
const newTabBtn = document.getElementById("wbNewTab");

function saveTabs() {
  try {
    localStorage.setItem("wb_tabs", JSON.stringify({
      seq: tabSeq,
      active: activeId,
      tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url })),
    }));
  } catch { /* 无痕模式等，忽略 */ }
}

function restoreTabs() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("wb_tabs")); } catch { return; }
  if (!saved || !Array.isArray(saved.tabs) || !saved.tabs.length) return;
  tabSeq = saved.seq || saved.tabs.length;
  for (const t of saved.tabs.slice(0, MAX_TABS)) {
    if (t.url && /^https?:\/\//.test(t.url)) createTab(t.url, t.title, t.id);
  }
  if (tabs.length) activate(saved.active && tabs.some(t => t.id === saved.active) ? saved.active : tabs[0].id);
}

function createTab(url = "", title = "", id = null) {
  if (tabs.length >= MAX_TABS) {
    showToast(`最多 ${MAX_TABS} 个标签页`);
    return null;
  }
  const tab = {
    id: id ?? "t" + (++tabSeq),
    title: title || (url ? hostnameOf(url) : "新标签页"),
    url,
    blocked: false,
    frame: document.createElement("iframe"),
  };
  tab.frame.className = "wb-frame";
  tab.frame.hidden = true;
  tab.frame.title = tab.title;
  tab.frame.addEventListener("load", () => {
    // 被 X-Frame-Options 拦下的 iframe 会停留在 about:blank（同源，可探测）
    try {
      const d = tab.frame.contentDocument;
      if (d && d.location.href === "about:blank") {
        tab.blocked = true;
        if (tab.id === activeId) blockedBox.hidden = false;
        return;
      }
    } catch { /* 跨域 → 正常加载了外部页面 */ }
    tab.blocked = false;
    if (tab.id === activeId) blockedBox.hidden = true;
  });
  document.querySelector(".wb-stage").appendChild(tab.frame);
  tabs.push(tab);
  renderTabs();
  return tab;
}

function activate(id) {
  activeId = id;
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  for (const t of tabs) t.frame.hidden = t.id !== id;
  emptyBox.hidden = true;
  blockedBox.hidden = !tab.blocked;
  blockedNewLink.href = tab.url || "#";
  toolbar.hidden = !tab.url;
  nowSpan.textContent = tab.url ? hostnameOf(tab.url) : "";
  openNewLink.href = tab.url || "#";
  if (tab.url) urlInput.value = tab.url;
  renderTabs();
  saveTabs();
}

function visit(url, tab = null) {
  currentUrl = url;
  const t = tab || tabs.find(x => x.id === activeId) || createTab();
  if (!t) return;
  t.url = url;
  t.title = hostnameOf(url);
  t.blocked = false;
  t.frame.src = url;
  blockedBox.hidden = true;
  toolbar.hidden = false;
  nowSpan.textContent = t.title;
  openNewLink.href = url;
  blockedNewLink.href = url;
  urlInput.value = url;
  emptyBox.hidden = true;
  t.frame.hidden = false;
  activate(t.id);
  saveTabs();
}

function closeTab(id) {
  const i = tabs.findIndex(t => t.id === id);
  if (i === -1) return;
  tabs[i].frame.remove();
  tabs.splice(i, 1);
  if (activeId === id) {
    const next = tabs[i - 1] || tabs[i] || null;
    if (next) activate(next.id);
    else {
      activeId = null;
      toolbar.hidden = true;
      blockedBox.hidden = true;
      emptyBox.hidden = false;
      urlInput.value = "";
    }
  }
  renderTabs();
  saveTabs();
}

function renderTabs() {
  tabBar.innerHTML = tabs.map(t => `
    <div class="wb-tab ${t.id === activeId ? "active" : ""}" data-tab="${t.id}" title="${t.title}">
      <span class="wb-tab-title">${escapeHtml(t.title)}</span>
      <button class="wb-tab-close" data-close="${t.id}" type="button" aria-label="关闭标签页">×</button>
    </div>
  `).join("");
}

tabBar.addEventListener("click", e => {
  const close = e.target.closest("[data-close]");
  if (close) {
    e.stopPropagation();
    closeTab(close.dataset.close);
    return;
  }
  const tabEl = e.target.closest("[data-tab]");
  if (tabEl) activate(tabEl.dataset.tab);
});

newTabBtn.addEventListener("click", () => {
  const t = createTab();
  if (t) {
    activate(t.id);
    saveTabs();
    urlInput.value = "";
    urlInput.focus();
  }
});

form.addEventListener("submit", e => {
  e.preventDefault();
  const url = normalizeUrl(urlInput.value);
  if (!url) {
    showToast("请输入有效的网址");
    return;
  }
  visit(url);
  saveTabs();
});

/* 恢复上次会话的标签页 */
restoreTabs();
renderTabs();

/* ---------------- 云端书签 ---------------- */

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

async function apiBookmarks(method = "GET", payload = null, query = "") {
  const opt = {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {},
  };
  if (payload) {
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(payload);
  }
  const sep = query ? "&" : "?";
  const res = await fetch("/api/bookmarks" + query + sep + "t=" + Date.now(), opt);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function renderBookmarks(list) {
  bmCount.textContent = list.length ? `（${list.length} / 15）` : "";
  if (!list.length) {
    bmList.innerHTML = '<li class="bm-empty">还没有收藏，访问一个网页后点「☆ 收藏」试试。</li>';
    return;
  }
  bmList.innerHTML = list.map(b => `
    <li class="bm-item">
      <a class="bm-link" href="${escapeHtml(b.url)}" data-url="${escapeHtml(b.url)}">
        <span class="bm-fav" aria-hidden="true">▸</span>
        <span class="bm-title">${escapeHtml(b.title || hostnameOf(b.url))}</span>
        <span class="bm-host">${escapeHtml(hostnameOf(b.url))}</span>
      </a>
      <button class="bm-del" type="button" data-del="${escapeHtml(b.id)}" title="删除书签">×</button>
    </li>
  `).join("");
}

async function loadBookmarks() {
  const me = await Auth.currentUser();
  if (!me) {
    bmHint.textContent = "登录后可收藏网页，每人最多 15 个。";
    bmList.innerHTML = '<li class="bm-empty">未登录 —— 登录后书签会保存在云端，换设备也能看到。</li>';
    bmCount.textContent = "";
    starBtn.disabled = false;
    return;
  }
  const { ok, data } = await apiBookmarks("GET");
  if (ok) {
    bmHint.textContent = `你好 ${me}，书签存在云端，最多 15 个。`;
    renderBookmarks(data.bookmarks || []);
  } else {
    bmList.innerHTML = '<li class="bm-empty">书签加载失败，刷新试试。</li>';
  }
}

function activeTab() {
  return tabs.find(t => t.id === activeId) || null;
}

starBtn.addEventListener("click", async () => {
  const t = activeTab();
  const url = (t && t.url) || normalizeUrl(urlInput.value);
  if (!url) {
    showToast("先访问一个网页再收藏");
    return;
  }
  const me = await Auth.currentUser();
  if (!me) {
    showToast("请先登录再收藏");
    if (typeof openAuthModal === "function") openAuthModal();
    return;
  }
  starBtn.disabled = true;
  try {
    const { ok, data } = await apiBookmarks("POST", { url, title: hostnameOf(url) });
    if (ok) {
      renderBookmarks(data.bookmarks || []);
      showToast("已收藏到云端 ☆");
    } else {
      showToast(data.error || "收藏失败");
    }
  } catch {
    showToast("网络异常，收藏失败");
  } finally {
    starBtn.disabled = false;
  }
});

bmList.addEventListener("click", async e => {
  // 删除
  const del = e.target.closest("[data-del]");
  if (del) {
    e.preventDefault();
    const { ok, data } = await apiBookmarks("DELETE", null, "?id=" + encodeURIComponent(del.dataset.del));
    if (ok) {
      renderBookmarks(data.bookmarks || []);
      showToast("已删除书签");
    } else {
      showToast(data.error || "删除失败");
    }
    return;
  }
  // 点击书签 → 就地访问
  const link = e.target.closest(".bm-link");
  if (link) {
    e.preventDefault();
    visit(link.dataset.url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

// 登录/退出状态变化时刷新书签区
window.addEventListener("auth-user", () => loadBookmarks());

loadBookmarks();
