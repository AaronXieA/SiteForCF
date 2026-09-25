/* =====================================================
 * 二手交易 /market/（MC 服务器内物品自由交易）
 * 玩家自填物品名，网站只负责帖子、金币担保、临时聊天。
 * sell=我卖什么，价格定金币；buy=我要收什么，出价金币；
 * barter=我用什么换什么，不碰金币。
 * ===================================================== */
(function () {
  const TYPE_META = {
    sell:   { tag: "出售", cls: "mk-t-sell" },
    buy:    { tag: "收购", cls: "mk-t-buy" },
    barter: { tag: "交换", cls: "mk-t-barter" },
  };

  const boardEl = document.getElementById("mkBoard");
  const hallTitleEl = document.getElementById("mkHallTitle");
  const mineEl = document.getElementById("mkMine");
  const mineListEl = document.getElementById("mkMineList");
  const chatsEl = document.getElementById("mkChats");
  const chatListEl = document.getElementById("mkChatList");
  const slotsEl = document.getElementById("mkSlots");
  const postBtn = document.getElementById("mkPostBtn");
  const filtersEl = document.getElementById("mkFilters");

  const postModal = document.getElementById("postModal");
  const postForm = document.getElementById("postForm");
  const postType = document.getElementById("postType");
  const itemWrap = document.getElementById("itemWrap");
  const itemInput = document.getElementById("itemInput");
  const priceWrap = document.getElementById("priceWrap");
  const priceHint = document.getElementById("priceHint");

  const chatModal = document.getElementById("chatModal");
  const chatTitleEl = document.getElementById("chatTitle");
  const chatMetaEl = document.getElementById("chatMeta");
  const chatMsgsEl = document.getElementById("chatMsgs");
  const chatForm = document.getElementById("chatForm");
  const chatTextEl = document.getElementById("chatText");
  const chatCompleteBtn = document.getElementById("chatComplete");

  const bindBtn = document.getElementById("mcBindBtn");
  const bindModal = document.getElementById("bindModal");
  const bindGenBtn = document.getElementById("bindGenBtn");
  const bindCodeBox = document.getElementById("bindCodeBox");
  const bindCodeEl = document.getElementById("bindCode");
  const bindMsg = bindModal?.querySelector("[data-msg]");

  let me = null;
  let open = [];
  let mine = [];
  let slots = { used: 0, max: 8, vip: false };
  let filter = "all";
  let postTypeVal = "sell";
  const busy = new Set();

  let chatLid = null;
  let chatPoll = null;
  let chatSeen = 0;

  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function timeAgo(ts) {
    const d = Date.now() - ts;
    if (d < 60000) return "刚刚";
    if (d < 3600000) return Math.floor(d / 60000) + " 分钟前";
    if (d < 86400000) return Math.floor(d / 3600000) + " 小时前";
    return Math.floor(d / 86400000) + " 天前";
  }

  function remainText(expireAt) {
    const ms = expireAt - Date.now();
    if (ms <= 0) return "即将关闭";
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    if (d > 0) return `剩 ${d} 天 ${h} 小时`;
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `剩 ${h} 小时 ${m} 分` : `剩 ${m} 分钟`;
  }

  function clockTime(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  async function api(url, opts) {
    const res = await fetch(url, Object.assign({
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    }, opts || {}));
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok, status: res.status, data };
  }

  /* ---------------- 帖子卡片 ---------------- */

  function priceHtml(l) {
    if (l.type === "barter") {
      return `<span class="mk-price mk-price-barter">🔄 以物易物</span>`;
    }
    if (l.price === 0) return '<span class="mk-price mk-price-zero">🪙 0 · 免费</span>';
    return `<span class="mk-price">🪙 ${l.price.toLocaleString("zh-CN")}</span>`;
  }

  // 大厅卡片（open）的操作按钮
  function hallAction(l) {
    if (!me) return '<button type="button" class="btn btn-ghost btn-small mk-act" data-act="login">登录后交易</button>';
    if (l.owner === me) return '<button type="button" class="btn btn-ghost btn-small mk-act" data-act="cancel">下架</button>';
    if (l.type === "sell") {
      const label = l.price === 0 ? "免费认领" : `拍下 · 付 ${l.price.toLocaleString("zh-CN")} 🪙`;
      return `<button type="button" class="btn btn-solid btn-small mk-act" data-act="take">${label}</button>`;
    }
    if (l.type === "buy") {
      const label = l.price === 0 ? "我有！送给 TA" : `我有！卖给 TA · 得 ${l.price.toLocaleString("zh-CN")} 🪙`;
      return `<button type="button" class="btn btn-solid btn-small mk-act" data-act="take">${label}</button>`;
    }
    // barter
    return `<button type="button" class="btn btn-solid btn-small mk-act" data-act="take">🔄 我要交换</button>`;
  }

  function cardTitle(l) {
    if (l.type === "buy") return `收 ${l.item}`;
    if (l.type === "barter") return l.item;
    return `出 ${l.item}`;
  }

  function cardHtml(l, zone) {
    const meta = TYPE_META[l.type];
    const isMine = me && l.owner === me;
    let stateLine = "";
    let actions = hallAction(l);
    if (zone === "mine") {
      if (l.status === "taken") {
        const other = me === l.owner ? l.taker : l.owner;
        stateLine = `<span class="mk-badge mk-badge-taken">交易中 · 对方 ${esc(other)} · ${remainText(l.expireAt)}</span>`;
        actions = `
          <button type="button" class="btn btn-solid btn-small mk-act" data-act="chat">💬 打开聊天</button>
          <button type="button" class="btn btn-ghost btn-small mk-act" data-act="complete">完成交易</button>`;
      } else {
        stateLine = '<span class="mk-badge mk-badge-open">在架中</span>';
        actions = '<button type="button" class="btn btn-ghost btn-small mk-act" data-act="cancel">下架</button>';
      }
    }
    return `
    <article class="mk-card ${meta.cls}" data-id="${l.id}">
      <div class="mk-card-head">
        <span class="mk-type-tag">${meta.tag}</span>
        ${stateLine}
        <span class="mk-time">${timeAgo(l.createdAt)}</span>
      </div>
      <h3 class="mk-card-title">${esc(cardTitle(l))}</h3>
      ${l.desc ? `<p class="mk-card-desc">${esc(l.desc)}</p>` : ""}
      <div class="mk-card-foot">
        ${priceHtml(l)}
        <span class="mk-owner">${isMine ? "我发布的" : "@" + esc(l.owner)}</span>
      </div>
      <div class="mk-card-actions">${actions}</div>
    </article>`;
  }

  /* ---------------- 渲染 ---------------- */

  function render() {
    slotsEl.textContent = me
      ? `栏位 ${slots.used}/${slots.max}${slots.vip ? "（VIP）" : ""}（每完成或下架一帖就空出一个）`
      : "登录后即可发布和交易";

    const trading = mine.filter(l => l.status === "taken");
    chatsEl.hidden = trading.length === 0;
    chatListEl.innerHTML = trading.length ? trading.map(l => {
      const other = me === l.owner ? l.taker : l.owner;
      return `
        <div class="mk-chat-row" data-id="${l.id}">
          <div class="mk-chat-row-main">
            <span class="mk-chat-row-title">${esc(cardTitle(l))}</span>
            <span class="mk-chat-row-meta">对方 @${esc(other)} · ${remainText(l.expireAt)}</span>
          </div>
          <button type="button" class="btn btn-solid btn-small mk-act" data-act="chat">💬 聊天</button>
        </div>`;
    }).join("") : "";

    mineEl.hidden = mine.length === 0;
    mineListEl.innerHTML = mine.length ? mine.map(l => cardHtml(l, "mine")).join("") : "";

    const list = filter === "all" ? open : open.filter(l => l.type === filter);
    hallTitleEl.textContent = `集市大厅（${open.length} 帖在架）`;
    boardEl.innerHTML = list.length
      ? list.map(l => cardHtml(l, "hall")).join("")
      : '<p class="mk-loading">这里还空空如也，来发第一帖吧～</p>';
  }

  async function loadAll(silent) {
    const r = await api("/api/market?t=" + Date.now());
    if (!r.ok) {
      if (!silent) boardEl.innerHTML = '<p class="mk-loading">集市加载失败，稍后再试。</p>';
      return;
    }
    me = r.data.me;
    open = r.data.open;
    mine = r.data.mine;
    slots = r.data.slots;
    render();
    if (chatLid) renderChatHead(mine.find(l => l.id === chatLid));
  }

  /* ---------------- 帖子操作 ---------------- */

  async function postAction(id, act) {
    if (act === "login") { openAuthModal(); return; }
    if (busy.has(id)) return;

    const l = open.find(x => x.id === id) || mine.find(x => x.id === id);
    if (!l) return;

    if (act === "chat") { openChat(l); return; }

    if (act === "cancel") {
      if (!window.confirm("确定下架这帖吗？下架后不可恢复。")) return;
    } else if (act === "take") {
      const tip = l.type === "barter"
        ? `确定与 @${esc(l.owner)} 交换吗？你的物品换 TA 的「${esc(l.item)}」，具体聊天里谈。`
        : l.type === "buy"
          ? (l.price === 0
              ? `确定把「${esc(l.item)}」送给 @${esc(l.owner)} 吗？对方点「完成交易」后金币到账。`
              : `确定成交吗？对方将把 ${l.price} 金币打入担保，你点「完成交易」后金币到账、「${esc(l.item)}」交给对方。`)
          : (l.price === 0
              ? `确定免费认领「${esc(l.item)}」吗？`
              : `确定买下「${esc(l.item)}」吗？${l.price} 金币先打入担保，确认「完成交易」后金币才打给卖家；7 天没完成自动退款。`);
      if (!window.confirm(tip)) return;
    } else if (act === "complete") {
      const tip = l.type === "barter"
        ? "完成后帖子和聊天记录永久删除，确定吗？（物品在游戏内交割）"
        : "完成后金币立刻结算给卖家，帖子和聊天记录永久删除，确定吗？";
      if (!window.confirm(tip)) return;
    }

    busy.add(id);
    const r = await api("/api/market", { method: "POST", body: JSON.stringify({ id, action: act }) });
    busy.delete(id);
    if (r.ok) {
      window.dispatchEvent(new CustomEvent("coins-changed"));
      if (act === "take") {
        showToast("拍下成功，临时聊天已开启！");
        await loadAll(true);
        const fresh = mine.find(x => x.id === id);
        if (fresh) openChat(fresh);
      } else if (act === "complete") {
        showToast("交易完成，金币已结算");
        closeChat(true);
      } else if (act === "cancel") {
        showToast("帖子已下架");
      }
      await loadAll(true);
    } else {
      showToast(r.data.error || "操作失败");
      await loadAll(true);
    }
  }

  /* ---------------- 发布表单 ---------------- */

  function syncPostType() {
    postType.querySelectorAll(".mk-type-btn").forEach(b =>
      b.classList.toggle("is-on", b.dataset.type === postTypeVal));
    const t = postTypeVal;
    if (t === "sell") {
      itemWrap.firstChild.textContent = "物品";
      priceWrap.hidden = false;
      priceHint.textContent = "0 = 免费送";
    } else if (t === "buy") {
      itemWrap.firstChild.textContent = "物品";
      priceWrap.hidden = false;
      priceHint.textContent = "你愿意出多少金币收购";
    } else {
      itemWrap.firstChild.textContent = "物品";
      priceWrap.hidden = true;
    }
  }

  postType?.addEventListener("click", e => {
    const b = e.target.closest(".mk-type-btn");
    if (!b) return;
    postTypeVal = b.dataset.type;
    syncPostType();
  });

  postBtn?.addEventListener("click", () => {
    if (!me) { openAuthModal(); return; }
    if (slots.used >= slots.max) {
      showToast(`栏位已满（${slots.max} 个），先完成或下架旧帖`);
      return;
    }
    postForm.reset();
    postTypeVal = "sell";
    syncPostType();
    XRST.openMask(postModal);
  });

  document.getElementById("postClose")?.addEventListener("click", () => XRST.closeMask(postModal));
  document.getElementById("chatClose")?.addEventListener("click", () => closeChat(false));

  /* ---------------- MC 绑定码 ---------------- */
  bindBtn?.addEventListener("click", () => {
    if (!me) { openAuthModal(); return; }
    bindCodeBox.hidden = true;
    bindMsg.textContent = "";
    XRST.openMask(bindModal);
  });
  document.getElementById("bindClose")?.addEventListener("click", () => XRST.closeMask(bindModal));
  bindGenBtn?.addEventListener("click", async () => {
    bindGenBtn.disabled = true;
    const r = await api("/api/mc/bind-code", { method: "POST" });
    bindGenBtn.disabled = false;
    if (r.ok) {
      bindCodeEl.textContent = r.data.code;
      bindCodeBox.hidden = false;
      bindMsg.textContent = "";
    } else {
      bindMsg.textContent = r.data.error || "生成失败，再试一次";
    }
  });

  postForm?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!me) { XRST.closeMask(postModal); openAuthModal(); return; }
    const fd = new FormData(postForm);
    const item = String(fd.get("item") || "").trim();
    if (!item) { showToast("请填写物品名称"); return; }
    const payload = {
      action: "post",
      type: postTypeVal,
      item,
      desc: String(fd.get("desc") || "").trim(),
      price: postTypeVal === "barter" ? 0 : Number(fd.get("price")),
    };
    const btn = postForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    const r = await api("/api/market", { method: "POST", body: JSON.stringify(payload) });
    btn.disabled = false;
    if (r.ok) {
      XRST.closeMask(postModal);
      showToast("发布成功，帖子已上架");
      await loadAll(true);
    } else {
      showToast(r.data.error || "发布失败");
    }
  });

  filtersEl?.addEventListener("click", e => {
    const b = e.target.closest(".mk-filter");
    if (!b) return;
    filter = b.dataset.type;
    filtersEl.querySelectorAll(".mk-filter").forEach(x =>
      x.classList.toggle("is-on", x === b));
    render();
  });

  document.querySelector(".mk-main").addEventListener("click", e => {
    const btn = e.target.closest(".mk-act");
    if (!btn || btn.disabled) return;
    const card = btn.closest("[data-id]");
    if (card) postAction(card.dataset.id, btn.dataset.act);
  });

  /* ---------------- 临时聊天 ---------------- */

  function renderChatHead(l) {
    if (!l) return;
    const meta = TYPE_META[l.type];
    chatTitleEl.textContent = `${meta.tag} · ${cardTitle(l)}`;
    const other = me === l.owner ? l.taker : l.owner;
    const priceTxt = l.type === "barter"
      ? `以物易物`
      : `担保 ${l.price.toLocaleString("zh-CN")} 🪙`;
    chatMetaEl.textContent = `对方 @${other} · ${priceTxt} · ${remainText(l.expireAt)}`;
  }

  async function openChat(l) {
    chatLid = l.id;
    renderChatHead(l);
    chatMsgsEl.innerHTML = '<p class="mk-loading">聊天记录加载中…</p>';
    chatSeen = 0;
    XRST.openMask(chatModal);
    await pullChat(true);
    clearInterval(chatPoll);
    chatPoll = setInterval(() => pullChat(false), 4000);
  }

  function closeChat(reload) {
    chatLid = null;
    clearInterval(chatPoll);
    chatPoll = null;
    XRST.closeMask(chatModal);
    if (reload) loadAll(true);
  }

  async function pullChat(scrollHint) {
    if (!chatLid) return;
    const r = await api(`/api/market/chat?lid=${encodeURIComponent(chatLid)}&t=${Date.now()}`);
    if (!r.ok) {
      if (r.status === 404) {
        showToast("交易已结束，临时聊天已关闭");
        closeChat(true);
      }
      return;
    }
    const msgs = r.data.msgs || [];
    if (msgs.length !== chatSeen || scrollHint) {
      chatSeen = msgs.length;
      chatMsgsEl.innerHTML = msgs.length ? msgs.map(m => `
        <div class="mk-msg ${m.f === me ? "is-me" : ""}">
          <span class="mk-msg-name">${esc(m.f === me ? "我" : m.f)}</span>
          <span class="mk-msg-bubble"></span>
          <span class="mk-msg-time">${clockTime(m.t)}</span>
        </div>`).join("") : '<p class="mk-loading">还没有消息，先打个招呼吧。</p>';
      const bubbles = chatMsgsEl.querySelectorAll(".mk-msg-bubble");
      msgs.forEach((m, i) => { if (bubbles[i]) bubbles[i].textContent = m.x; });
      chatMsgsEl.scrollTop = chatMsgsEl.scrollHeight;
    }
  }

  chatForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const text = chatTextEl.value.trim();
    if (!text || !chatLid) return;
    chatTextEl.value = "";
    const r = await api(`/api/market/chat?lid=${encodeURIComponent(chatLid)}`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    if (!r.ok) {
      showToast(r.data.error || "发送失败");
      chatTextEl.value = text;
      if (r.status === 404) closeChat(true);
      return;
    }
    chatSeen = -1;
    await pullChat(true);
  });

  chatCompleteBtn?.addEventListener("click", () => {
    if (chatLid) postAction(chatLid, "complete");
  });

  window.addEventListener("auth-user", async e => {
    me = e.detail ? String(e.detail).toLowerCase() : null;
    await loadAll(true);
  });

  loadAll();
  setInterval(() => loadAll(true), 30000);
})();
