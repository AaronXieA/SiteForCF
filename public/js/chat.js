/* =====================================================
 * /chat/ 在线聊天室
 * - 所有人可看；登录用户可发言（≤500 字）
 * - 服务端保留最近 150 条；前端每 4 秒轮询
 * ===================================================== */

const chatList = document.getElementById("chatList");
const chatCount = document.getElementById("chatCount");
const chatComposer = document.getElementById("chatComposer");
const chatGuest = document.getElementById("chatGuest");
const chatInput = document.getElementById("chatInput");
const chatCharCount = document.getElementById("chatCharCount");
const chatSendBtn = document.getElementById("chatSendBtn");
const chatLoginBtn = document.getElementById("chatLoginBtn");

const MAX_CHARS = 500;
const POLL_MS = 4000;

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
    chatList.innerHTML = '<p class="chat-tip">还没有消息，来抢沙发吧。</p>';
    chatCount.textContent = "0 条消息";
    return;
  }

  const wasNearBottom = isNearBottom();
  const newOnes = messages.filter(m => !knownIds.has(m.id));

  if (knownIds.size === 0 || messages.length < knownIds.size) {
    // 首次加载，或服务端已裁剪旧消息：整体重绘
    chatList.innerHTML = messages.map(m => messageHtml(m)).join("");
    if (forceScroll) scrollToBottom(false);
  } else if (newOnes.length) {
    // 增量追加
    const frag = document.createDocumentFragment();
    for (const m of newOnes) {
      const wrap = document.createElement("div");
      wrap.innerHTML = messageHtml(m).trim();
      frag.appendChild(wrap.firstChild);
    }
    chatList.appendChild(frag);
  }

  knownIds = new Set(messages.map(m => m.id));
  chatCount.textContent = `${messages.length} / 150 条消息`;

  // 自己发的、或本来就在底部时才自动滚动，避免打断用户看历史
  const mine = newOnes.some(m => m.username === me);
  if ((newOnes.length && wasNearBottom) || mine || forceScroll) {
    scrollToBottom(newOnes.length > 0 && !forceScroll);
  }
}

function messageHtml(m) {
  const self = m.username === me ? " chat-msg-self" : "";
  const bubbleSkin = /^b[1-5]$/.test(m.bubble || "") ? " cb-" + m.bubble : "";
  return `
    <div class="chat-msg${self}" data-id="${escapeHtml(m.id)}">
      <span class="chat-avatar-slot">${window.XRST_AVATARS.withFrame(m.avatar ?? 0, /^f[1-5]$/.test(m.frame || "") ? m.frame : null, "xrst-avatar-36")}</span>
      <div class="chat-bubble${bubbleSkin}">
        <div class="chat-meta">
          <span class="chat-name">${escapeHtml(m.username)}</span>
          <span class="chat-time">${fmtTime(m.ts)}</span>
        </div>
        <div class="chat-text">${escapeHtml(m.text).replace(/\n/g, "<br>")}</div>
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
    showToast("消息不能为空");
    return;
  }
  if ([...text].length > MAX_CHARS) {
    showToast(`每条消息最多 ${MAX_CHARS} 字`);
    return;
  }
  sending = true;
  chatSendBtn.disabled = true;
  chatSendBtn.textContent = "发送中…";
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
      await loadMessages(); // 立即拉取，不用等下一次轮询
    } else if (res.status === 401) {
      showToast("请先登录");
      if (typeof openAuthModal === "function") openAuthModal();
    } else {
      showToast(data.error || "发送失败");
    }
  } catch {
    showToast("网络异常，发送失败");
  } finally {
    sending = false;
    chatSendBtn.disabled = false;
    chatSendBtn.textContent = "发送";
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

/* ---------------- 启动 ---------------- */
(async function init() {
  me = await Auth.currentUser();
  chatComposer.hidden = !me;
  chatGuest.hidden = !!me;
  await loadMessages({ forceScroll: true });
  setInterval(() => loadMessages(), POLL_MS);
})();
