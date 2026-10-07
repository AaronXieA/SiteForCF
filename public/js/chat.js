/* =====================================================
 * /chat/ 聊天室（网页 × Minecraft 互通）
 * - 所有人可看；登录用户可发言（≤500 字）
 * - 服务端保留最近 100 条；实时消息走 WebSocket（DO 推送）
 * - WS 不可用/断线时自动降级为低频轮询，重连后自动补漏
 * - source: "web"（网页）/ "mc"（游戏内 mod 上报）
 * ===================================================== */

const chatList = document.getElementById("chatList");
const chatCount = document.getElementById("chatCount");
const chatComposer = document.getElementById("chatComposer");
const chatGuest = document.getElementById("chatGuest");
const chatInput = document.getElementById("chatInput");
const chatCharCount = document.getElementById("chatCharCount");
const chatSendBtn = document.getElementById("chatSendBtn");
const chatLoginBtn = document.getElementById("chatLoginBtn");
const chatMcOnline = document.getElementById("chatMcOnline");
const deathBoardList = document.getElementById("deathBoardList");
const deathBoardSub = document.getElementById("deathBoardSub");

const MC_SERVER_ADDR = "mc.xrst.uk";

const MAX_CHARS = 500;
const FALLBACK_POLL_MS = 6000; // WS 断开期间的兜底轮询间隔
const WS_PING_MS = 30000;      // 应用层心跳（DO 端由基础设施自动应答，不唤醒实例）

let me = null;
let knownIds = new Set();   // 已渲染消息 id
let sending = false;

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function fmtTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isNearBottom() {
  return chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight < 80;
}

function scrollToBottom(smooth) {
  chatList.scrollTo({ top: chatList.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

function renderMessages(messages, { forceScroll = false } = {}) {
  if (!messages.length) {
    chatList.innerHTML = `<p class="chat-tip">${I18n.t("chat.empty")}</p>`;
    chatCount.textContent = I18n.t("chat.msgCount", { n: 0 });
    return;
  }

  const wasNearBottom = isNearBottom();
  const newOnes = messages.filter(m => !knownIds.has(m.id));

  if (knownIds.size === 0 || messages.length < knownIds.size) {
    // 首次加载，或服务端已裁剪旧消息：整体重绘
    chatList.innerHTML = messages.map(m => messageHtml(m)).join("");
    if (forceScroll) scrollToBottom(false);
  } else if (newOnes.length) {
    appendNodes(newOnes);
  }

  knownIds = new Set(messages.map(m => m.id));
  updateCount();

  // 自己发的、或本来就在底部时才自动滚动，避免打断用户看历史
  const mine = newOnes.some(m => m.username === me);
  if ((newOnes.length && wasNearBottom) || mine || forceScroll) {
    scrollToBottom(newOnes.length > 0 && !forceScroll);
  }
}

// 实时推送 / 发送回执：单条增量渲染（按 id 去重）
function appendMessage(m) {
  if (!m || !m.id || knownIds.has(m.id)) return false;
  const wasNearBottom = isNearBottom();
  const tip = chatList.querySelector(".chat-tip");
  if (tip) tip.remove();
  appendNodes([m]);
  knownIds.add(m.id);
  updateCount();
  if (wasNearBottom || m.username === me) scrollToBottom(true);
  // 实时收到死亡事件：顺手刷新死亡榜
  if (m.source === "mc" && m.kind === "death") refreshDeathBoard();
  return true;
}

function appendNodes(list) {
  const frag = document.createDocumentFragment();
  for (const m of list) {
    const wrap = document.createElement("div");
    wrap.innerHTML = messageHtml(m).trim();
    frag.appendChild(wrap.firstChild);
  }
  chatList.appendChild(frag);
}

function updateCount() {
  const n = chatList.querySelectorAll(".chat-msg").length;
  chatCount.textContent = I18n.t("chat.msgCount", { n });
}

function messageHtml(m) {
  const isMc = m.source === "mc";
  const textHtml = escapeHtml(m.text).replace(/\n/g, "<br>");
  const timeHtml = `<span class="chat-time">${fmtTime(m.ts)}</span>`;

  // MC 系统事件（死亡 / 加入 / 退出）：居中事件行，不算聊天气泡
  if (isMc && (m.kind === "death" || m.kind === "join" || m.kind === "quit")) {
    const icon = m.kind === "death" ? "💀" : m.kind === "join" ? "🟢" : "⚪";
    let inner;
    if (m.kind === "death") {
      // text 是游戏内死亡提示原文（已含玩家名）
      inner = `${icon} ${textHtml} ${timeHtml}`;
    } else {
      inner = `${icon} <span class="chat-event-name">${escapeHtml(m.username)}</span> ${textHtml} ${timeHtml}`;
    }
    return `<div class="chat-event chat-event-${m.kind}" data-id="${escapeHtml(m.id)}">${inner}</div>`;
  }

  if (isMc) {
    // 游戏内玩家：没有网站头像与主页，用 ⛏️ 徽标，昵称纯文本
    return `
    <div class="chat-msg chat-msg-mc" data-id="${escapeHtml(m.id)}">
      <span class="xrst-avatar xrst-avatar-36 chat-mc-avatar" title="Minecraft 玩家">⛏️</span>
      <div class="chat-bubble chat-bubble-mc">
        <div class="chat-meta">
          <span class="chat-src chat-src-mc">${I18n.t("chat.sourceMc")}</span>
          <span class="chat-name">${escapeHtml(m.username)}</span>
          ${timeHtml}
        </div>
        <div class="chat-text">${textHtml}</div>
      </div>
    </div>`;
  }

  // 网页用户
  const self = m.username === me ? " chat-msg-self" : "";
  const bubbleSkin = /^(?:b[1-8]|bv1)$/.test(m.bubble || "") ? " cb-" + m.bubble : "";
  const frameId = /^(?:f[1-8]|fv1)$/.test(m.frame || "") ? m.frame : null;
  const crown = m.vip ? '<span class="vip-badge chat-vip-crown" title="VIP 会员">👑</span>' : "";
  const profileUrl = "/profile/?u=" + encodeURIComponent(m.username);
  return `
    <div class="chat-msg${self}" data-id="${escapeHtml(m.id)}">
      <a class="chat-avatar-link" href="${profileUrl}" title="查看 ${escapeHtml(m.username)} 的主页">${window.XRST_AVATARS.withFrame(m.avatar ?? 0, frameId, "xrst-avatar-36")}</a>
      <div class="chat-bubble${bubbleSkin}">
        <div class="chat-meta">
          <span class="chat-src chat-src-web">${I18n.t("chat.sourceWeb")}</span>
          <a class="chat-name chat-name-link" href="${profileUrl}">${escapeHtml(m.username)}</a>${crown}
          ${timeHtml}
        </div>
        <div class="chat-text">${textHtml}</div>
      </div>
    </div>`;
}

async function loadMessages({ forceScroll = false } = {}) {
  try {
    const res = await fetch("/api/chat?t=" + Date.now(), { cache: "no-store" });
    const data = await res.json().catch(() => ({ messages: [] }));
    renderMessages(data.messages || [], { forceScroll });
  } catch {
    // 轮询失败静默，不打断阅读
  }
}

/* ---------------- 发送 ---------------- */

chatInput?.addEventListener("input", () => {
  const len = [...chatInput.value].length;
  if (len > MAX_CHARS) chatInput.value = [...chatInput.value].slice(0, MAX_CHARS).join("");
  chatCharCount.textContent = [...chatInput.value].length;
});

chatInput?.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage();
  }
});

chatSendBtn?.addEventListener("click", sendMessage);

async function sendMessage() {
  if (sending) return;
  const text = chatInput.value.trim();
  if (!text) {
    showToast(I18n.t("chat.emptyMsg"));
    return;
  }
  if ([...text].length > MAX_CHARS) {
    showToast(I18n.t("chat.maxChars", { n: MAX_CHARS }));
    return;
  }
  sending = true;
  chatSendBtn.disabled = true;
  chatSendBtn.textContent = I18n.t("chat.sending");
  try {
    const res = await fetch("/api/chat?t=" + Date.now(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      chatInput.value = "";
      chatCharCount.textContent = "0";
      if (data.message) appendMessage(data.message);
    } else if (res.status === 401) {
      showToast(I18n.t("auth.pleaseLogin"));
      if (typeof openAuthModal === "function") openAuthModal();
    } else {
      showToast(data.error || I18n.t("chat.sendFailed"));
    }
  } catch {
    showToast(I18n.t("chat.sendFailed"));
  } finally {
    sending = false;
    chatSendBtn.disabled = false;
    chatSendBtn.textContent = I18n.t("chat.send");
    chatInput.focus();
  }
}

/* ---------------- 登录状态 ---------------- */

window.addEventListener("auth-user", e => {
  me = e.detail;
  chatComposer.hidden = !me;
  chatGuest.hidden = !!me;
  // 登录态变化会影响“自己消息”的高亮与左右位置，清空已渲染记录强制整体重绘
  knownIds = new Set();
  loadMessages({ forceScroll: true });
});

chatLoginBtn?.addEventListener("click", () => {
  if (typeof openAuthModal === "function") openAuthModal();
});

/* ---------------- MC 服务器在线人数（mcstatus.io）---------------- */
async function refreshMcOnline() {
  if (!chatMcOnline) return;
  try {
    const res = await fetch(`https://api.mcstatus.io/v2/status/java/${MC_SERVER_ADDR}?t=${Date.now()}`);
    const d = await res.json();
    if (d && d.online) {
      const n = d.players?.online ?? 0;
      chatMcOnline.classList.add("is-on");
      chatMcOnline.innerHTML = I18n.t("chat.mcOnlinePlayers", { n: `<b>${n}</b>` });
    } else {
      chatMcOnline.classList.remove("is-on");
      chatMcOnline.textContent = I18n.t("chat.gameOffline");
    }
  } catch {
    chatMcOnline.classList.remove("is-on");
    chatMcOnline.textContent = I18n.t("chat.gameUnknown");
  }
}

/* ---------------- MC 死亡榜 ---------------- */

let deathBoardBusy = false;

async function refreshDeathBoard() {
  if (!deathBoardList || deathBoardBusy) return;
  deathBoardBusy = true;
  try {
    const res = await fetch("/api/mc/deaths?t=" + Date.now(), { cache: "no-store" });
    const data = await res.json().catch(() => null);
    const board = (data && Array.isArray(data.board)) ? data.board : [];
    if (!board.length) {
      deathBoardList.innerHTML = `<li class="deathboard-empty">${I18n.t("deathboard.empty")}</li>`;
      deathBoardSub.textContent = I18n.t("deathboard.subtitle");
      return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    deathBoardList.innerHTML = board.slice(0, 10).map((row, i) => {
      const rank = medals[i] || String(i + 1);
      return `<li class="deathboard-row${i < 3 ? " is-podium" : ""}">
        <span class="db-rank">${rank}</span>
        <span class="db-name">${escapeHtml(row.name)}</span>
        <span class="db-count">${I18n.t("deathboard.count", { n: Number(row.deaths) || 0 })}</span>
      </li>`;
    }).join("");
    const total = board.reduce((s, r) => s + (Number(r.deaths) || 0), 0);
    deathBoardSub.textContent = I18n.t("deathboard.total", { n: board.length, m: total });
  } catch {
    // 加载失败静默，下个周期再试
  } finally {
    deathBoardBusy = false;
  }
}

/* ---------------- WebSocket 实时推送（断线自动重连 + 轮询兜底）---------------- */

let chatWs = null;
let wsBackoff = 1000;
let pingTimer = null;
let reconnectTimer = null;

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/api/chat/ws`;
}

function connectChatWs() {
  clearTimeout(reconnectTimer);
  if (chatWs && (chatWs.readyState === WebSocket.OPEN || chatWs.readyState === WebSocket.CONNECTING)) return;

  let ws;
  try { ws = new WebSocket(wsUrl()); } catch { scheduleReconnect(); return; }
  chatWs = ws;

  ws.onopen = () => {
    wsBackoff = 1000;
    // 重连成功后拉一次历史，补齐断线期间漏掉的消息
    loadMessages();
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (document.hidden) return;          // 后台不发心跳，省请求
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send("ping"); } catch {}
      }
    }, WS_PING_MS);
  };

  ws.onmessage = (e) => {
    if (e.data === "pong" || !e.data) return;
    let data;
    try { data = JSON.parse(e.data); } catch { return; }
    if (data && data.type === "message" && data.message) appendMessage(data.message);
  };

  ws.onclose = () => {
    clearInterval(pingTimer);
    scheduleReconnect();
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectChatWs, wsBackoff);
  wsBackoff = Math.min(wsBackoff * 2, 15000); // 1s→2s→4s…封顶 15s
}

// 回到前台：连接还活着就补一次历史；断了立刻重连
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (chatWs && chatWs.readyState === WebSocket.OPEN) {
    loadMessages();
  } else {
    wsBackoff = 1000;
    connectChatWs();
  }
});

/* ---------------- 启动 ---------------- */
(async function init() {
  me = await Auth.currentUser();
  chatComposer.hidden = !me;
  chatGuest.hidden = !!me;
  await loadMessages({ forceScroll: true });
  connectChatWs();
  // 兜底：仅在 WS 未连接时低频轮询（公司代理/弱网封 WS 时功能仍可用）
  setInterval(() => {
    if (document.hidden) return;
    if (!chatWs || chatWs.readyState !== WebSocket.OPEN) loadMessages();
  }, FALLBACK_POLL_MS);
  refreshMcOnline();
  setInterval(() => { if (!document.hidden) refreshMcOnline(); }, 45000);
  refreshDeathBoard();
  setInterval(() => { if (!document.hidden) refreshDeathBoard(); }, 60000);
})();

/* 语言切换时重绘动态内容 */
window.addEventListener("lang-changed", () => {
  knownIds = new Set();
  loadMessages();
  refreshMcOnline();
  refreshDeathBoard();
});
