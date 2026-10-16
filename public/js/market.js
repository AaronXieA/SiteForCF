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

  /* 确认状态：我方是否已确认、对方是否已确认。
     sell: taker=buyer→buyerOk, owner=seller→sellerOk
     buy:  owner=buyer→buyerOk, taker=seller→sellerOk
     barter: owner→sellerOk, taker→buyerOk（后端约定） */
  function confState(l) {
    if (l.type === "barter") {
      return me === l.owner
        ? { mineOk: l.sellerOk, otherOk: l.buyerOk }
        : { mineOk: l.buyerOk, otherOk: l.sellerOk };
    }
    const isBuyer = me === l.buyer;
    return isBuyer
      ? { mineOk: l.buyerOk, otherOk: l.sellerOk }
      : { mineOk: l.sellerOk, otherOk: l.buyerOk };
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
        const cs = confState(l);
        const confBadge = cs.mineOk
          ? (cs.otherOk ? "双方已确认" : "我已确认 · 等待对方")
          : (cs.otherOk ? "对方已确认 · 待我确认" : "双方待确认");
        stateLine = `<span class="mk-badge mk-badge-taken">交易中 · 对方 ${esc(other)} · ${remainText(l.expireAt)}</span>
          <span class="mk-badge mk-badge-conf">${confBadge}</span>`;
        actions = `
          <button type="button" class="btn btn-solid btn-small mk-act" data-act="chat">💬 打开聊天</button>
          <button type="button" class="btn btn-ghost btn-small mk-act" data-act="confirm" ${cs.mineOk ? "disabled" : ""}>${cs.mineOk ? "已确认" : "确认完成"}</button>`;
      } else if (l.status === "done") {
        stateLine = '<span class="mk-badge mk-badge-done">✅ 已完成 · 聊天保留 24h</span>';
        actions = '<button type="button" class="btn btn-solid btn-small mk-act" data-act="chat">💬 查看聊天</button>';
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

    const trading = mine.filter(l => l.status === "taken" || l.status === "done");
    chatsEl.hidden = trading.length === 0;
    chatListEl.innerHTML = trading.length ? trading.map(l => {
      const other = me === l.owner ? l.taker : l.owner;
      const metaTxt = l.status === "done"
        ? `对方 @${esc(other)} · 已完成`
        : `对方 @${esc(other)} · ${remainText(l.expireAt)}`;
      return `
        <div class="mk-chat-row" data-id="${l.id}">
          <div class="mk-chat-row-main">
            <span class="mk-chat-row-title">${esc(cardTitle(l))}</span>
            <span class="mk-chat-row-meta">${metaTxt}</span>
          </div>
          <button type="button" class="btn btn-solid btn-small mk-act" data-act="chat">💬 聊天</button>
        </div>`;
    }).join("") : "";

    mineEl.hidden = mine.length === 0;
    mineListEl.innerHTML = mine.length ? mine.map(l => cardHtml(l, "mine")).join("") : "";

    const list = filter === "all" ? open : open.filter(l => l.type === filter);
    hallTitleEl.textContent = I18n.t("market.hallCount", { n: open.length });
    boardEl.innerHTML = list.length
      ? list.map(l => cardHtml(l, "hall")).join("")
      : `<p class="mk-loading">${I18n.t("market.emptyHall")}</p>`;
  }

  async function loadAll(silent) {
    const r = await api("/api/market?t=" + Date.now());
    if (!r.ok) {
      if (!silent) boardEl.innerHTML = `<p class="mk-loading">${I18n.t("market.loadFail")}</p>`;
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
      if (!window.confirm(I18n.t("market.confirmCancel"))) return;
    } else if (act === "take") {
      const owner = esc(l.owner), item = esc(l.item);
      const tip = l.type === "barter"
        ? I18n.t("market.takeBarter", { owner, item })
        : l.type === "buy"
          ? (l.price === 0
              ? I18n.t("market.takeBuyFree", { item, owner })
              : I18n.t("market.takeBuy", { price: l.price, item }))
          : (l.price === 0
              ? I18n.t("market.takeSellFree", { item })
              : I18n.t("market.takeSell", { item, price: l.price }));
      if (!window.confirm(tip)) return;
    } else if (act === "confirm") {
      const tip = l.type === "barter"
        ? I18n.t("market.confirmBarter")
        : I18n.t("market.confirmOther");
      if (!window.confirm(tip)) return;
    }

    busy.add(id);
    const r = await api("/api/market", { method: "POST", body: JSON.stringify({ id, action: act }) });
    busy.delete(id);
    if (r.ok) {
      window.dispatchEvent(new CustomEvent("coins-changed"));
      if (act === "take") {
        showToast(I18n.t("market.takeOk"));
        await loadAll(true);
        const fresh = mine.find(x => x.id === id);
        if (fresh) openChat(fresh);
      } else if (act === "confirm") {
        if (r.data.settled) {
          showToast(I18n.t("market.confirmBothOk"));
        } else {
          showToast(I18n.t("market.confirmWait"));
        }
      } else if (act === "cancel") {
        showToast(I18n.t("market.cancelOk"));
      }
      await loadAll(true);
    } else {
      showToast(r.data.error || I18n.t("market.operFail"));
      await loadAll(true);
    }
  }

  /* ---------------- 发布表单 ---------------- */

  function syncPostType() {
    postType.querySelectorAll(".mk-type-btn").forEach(b =>
      b.classList.toggle("is-on", b.dataset.type === postTypeVal));
    const t = postTypeVal;
    if (t === "sell") {
      itemWrap.firstChild.textContent = I18n.t("market.itemLabel");
      priceWrap.hidden = false;
      priceHint.textContent = I18n.t("market.priceHint");
    } else if (t === "buy") {
      itemWrap.firstChild.textContent = I18n.t("market.itemLabel");
      priceWrap.hidden = false;
      priceHint.textContent = I18n.t("market.priceHintBuy");
    } else {
      itemWrap.firstChild.textContent = I18n.t("market.itemLabel");
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
      showToast(I18n.t("market.slotsFull", { n: slots.max }));
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
      bindMsg.textContent = r.data.error || I18n.t("market.bindFail");
    }
  });

  postForm?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!me) { XRST.closeMask(postModal); openAuthModal(); return; }
    const fd = new FormData(postForm);
    const item = String(fd.get("item") || "").trim();
    if (!item) { showToast(I18n.t("market.itemRequired")); return; }
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
      showToast(I18n.t("market.postOk"));
      await loadAll(true);
    } else {
      showToast(r.data.error || I18n.t("market.postFail"));
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
      ? I18n.t("market.barter")
      : I18n.t("market.escrow", { n: l.price.toLocaleString("zh-CN") });
    if (l.status === "done") {
      chatMetaEl.textContent = `对方 @${other} · ${priceTxt} · 交易已完成 · 聊天记录保留至 24 小时后清除`;
      chatCompleteBtn.hidden = true;
      chatTextEl.disabled = true;
      chatTextEl.placeholder = "交易已完成，聊天记录只读";
      chatForm.querySelector('button[type="submit"]').disabled = true;
      return;
    }
    chatCompleteBtn.hidden = false;
    chatTextEl.disabled = false;
    chatTextEl.placeholder = I18n.t("market.chatPlaceholder");
    chatForm.querySelector('button[type="submit"]').disabled = false;
    const cs = confState(l);
    if (cs.mineOk) {
      chatCompleteBtn.disabled = true;
      chatCompleteBtn.textContent = "已确认 · 等待对方";
    } else {
      chatCompleteBtn.disabled = false;
      chatCompleteBtn.textContent = cs.otherOk ? "对方已确认 · 我也确认" : "✅ 确认完成";
    }
    chatMetaEl.textContent = I18n.t("market.chatMeta", { other, price: priceTxt, remain: remainText(l.expireAt) });
  }

  async function openChat(l) {
    chatLid = l.id;
    renderChatHead(l);
    chatMsgsEl.innerHTML = `<p class="mk-loading">${I18n.t("market.chatLoading")}</p>`;
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
        showToast(I18n.t("market.tradeEnded"));
        closeChat(true);
      }
      return;
    }
    if (r.data.listing) renderChatHead(r.data.listing);
    const msgs = r.data.msgs || [];
    if (msgs.length !== chatSeen || scrollHint) {
      chatSeen = msgs.length;
      chatMsgsEl.innerHTML = msgs.length ? msgs.map(m => m.f === "SYSTEM" ? `
        <div class="mk-msg mk-msg-sys"><span class="mk-msg-bubble"></span></div>` : `
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
      showToast(r.data.error || I18n.t("market.sendFail"));
      chatTextEl.value = text;
      if (r.status === 404) closeChat(true);
      return;
    }
    chatSeen = -1;
    await pullChat(true);
  });

  chatCompleteBtn?.addEventListener("click", () => {
    if (chatLid) postAction(chatLid, "confirm");
  });

  window.addEventListener("auth-user", async e => {
    me = e.detail ? String(e.detail).toLowerCase() : null;
    await loadAll(true);
  });

  loadAll();
  setInterval(() => loadAll(true), 30000);
})();
