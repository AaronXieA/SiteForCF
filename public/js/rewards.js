/* =====================================================
 * 首页：每日签到 / 兑换商店 / 谁在看我的网站
 * ===================================================== */
(function () {
  const $ = id => document.getElementById(id);

  const checkinBtn = $("checkinBtn");
  const checkinCoins = $("checkinCoins");
  const checkinStreak = $("checkinStreak");
  const checkinSub = $("checkinSub");
  const shopModal = $("shopModal");
  const shopGrid = $("shopGrid");
  const shopCoinsEl = $("shopCoins");
  const onlineBody = $("onlineBody");

  let me = null; // /api/me 完整数据

  /* ---------- 每日签到 ---------- */
  function renderCheckin() {
    if (!me) {
      checkinCoins.textContent = "0";
      checkinStreak.textContent = "连续签到 0 天";
      checkinBtn.textContent = "登录后签到";
      checkinBtn.disabled = false;
      checkinSub.textContent = "登录后签到领金币";
      return;
    }
    checkinCoins.textContent = me.coins;
    checkinStreak.textContent = `连续签到 ${me.streak || 0} 天`;
    const today = beijingToday();
    if (me.lastCheckin === today) {
      checkinBtn.textContent = "今日已签到 ✓";
      checkinBtn.disabled = true;
      checkinSub.textContent = "今天的金币已到手";
    } else {
      checkinBtn.textContent = "立即签到";
      checkinBtn.disabled = false;
      const tomorrow = me.lastCheckin === beijingToday(-1);
      checkinSub.textContent = tomorrow ? "连续签到中，今天 +" + Math.min(10 + Math.min((me.streak || 0), 6) * 5, 40) + " 金币" : "今天还没签到";
    }
  }

  function beijingToday(offset = 0) {
    const d = new Date(Date.now() + (8 * 3600 + offset * 86400) * 1000);
    return d.toISOString().slice(0, 10);
  }

  checkinBtn?.addEventListener("click", async () => {
    if (!me) { openAuthModal(); return; }
    checkinBtn.disabled = true;
    checkinBtn.textContent = "签到中…";
    try {
      const res = await fetch("/api/checkin?t=" + Date.now(), {
        method: "POST", credentials: "same-origin", cache: "no-store",
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        showToast(`签到成功！获得 ${d.reward} 金币 🪙（连续 ${d.streak} 天）`);
        me.coins = d.coins; me.streak = d.streak; me.lastCheckin = beijingToday();
        renderCheckin();
        window.dispatchEvent(new Event("coins-changed"));
      } else {
        showToast(d.error || "签到失败");
        checkinBtn.disabled = false;
        checkinBtn.textContent = "立即签到";
      }
    } catch {
      showToast("网络错误，签到失败");
      checkinBtn.disabled = false;
      checkinBtn.textContent = "立即签到";
    }
  });

  /* ---------- 兑换商店 ---------- */
  let shopTab = "frame";

  function openShop() {
    if (!me) { openAuthModal(); showToast("登录后才能逛商店哦"); return; }
    shopModal.hidden = false;
    document.body.style.overflow = "hidden";
    shopCoinsEl.textContent = me.coins;
    renderShop();
  }
  function closeShop() {
    shopModal.hidden = true;
    document.body.style.overflow = "";
  }
  $("openShopBtn")?.addEventListener("click", openShop);
  $("shopClose")?.addEventListener("click", closeShop);
  shopModal?.addEventListener("click", e => { if (e.target === shopModal) closeShop(); });

  $("shopTabFrame")?.addEventListener("click", () => { shopTab = "frame"; renderShop(); });
  $("shopTabBubble")?.addEventListener("click", () => { shopTab = "bubble"; renderShop(); });

  function renderShop() {
    $("shopTabFrame").classList.toggle("active", shopTab === "frame");
    $("shopTabBubble").classList.toggle("active", shopTab === "bubble");
    const list = shopTab === "frame" ? XRST_SHOP.FRAMES : XRST_SHOP.BUBBLES;
    const owned = me[shopTab === "frame" ? "frames" : "bubbles"] || [];
    const equipped = me[shopTab] || null;
    shopCoinsEl.textContent = me.coins;

    shopGrid.innerHTML = list.map(item => {
      const isOwned = owned.includes(item.id);
      const isEquipped = equipped === item.id;
      let btn;
      if (isEquipped) {
        btn = `<button class="btn btn-ghost btn-small" data-act="unequip" data-id="${item.id}">已装备 · 卸下</button>`;
      } else if (isOwned) {
        btn = `<button class="btn btn-solid btn-small" data-act="equip" data-id="${item.id}">装备</button>`;
      } else {
        const afford = me.coins >= item.price;
        btn = `<button class="btn btn-solid btn-small ${afford ? "" : "btn-disabled"}" data-act="buy" data-id="${item.id}" ${afford ? "" : "disabled"}>🪙 ${item.price} 兑换</button>`;
      }
      const preview = shopTab === "frame"
        ? `<span class="af af-${item.id}">${XRST_AVATARS.html(13, "xrst-avatar-44")}</span>`
        : `<span class="cb cb-${item.id} shop-preview-bubble">气泡预览</span>`;
      return `
        <div class="shop-item${isEquipped ? " equipped" : ""}">
          <div class="shop-preview">${preview}</div>
          <div class="shop-item-name">${item.name}</div>
          <div class="shop-item-desc">${item.desc}</div>
          ${btn}
        </div>`;
    }).join("");
  }

  shopGrid?.addEventListener("click", async e => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act, id = btn.dataset.id;
    btn.disabled = true;
    try {
      const res = await fetch("/api/shop?t=" + Date.now(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ action: act, type: shopTab, id }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        me.frames = d.frames; me.bubbles = d.bubbles;
        me.frame = d.frame; me.bubble = d.bubble; me.coins = d.coins;
        showToast(act === "buy" ? "兑换成功，已自动装备！🎉" : "已更新装备");
        renderShop();
        renderCheckin();
        window.dispatchEvent(new Event("coins-changed"));
      } else {
        showToast(d.error || "操作失败");
        btn.disabled = false;
      }
    } catch {
      showToast("网络错误");
      btn.disabled = false;
    }
  });

  /* ---------- 谁在看 ---------- */
  async function refreshOnline() {
    try {
      const res = await fetch("/api/presence?t=" + Date.now(), { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!d || !onlineBody) return;
      const total = d.total || 0;
      let html = `<div class="online-total">现在共有 <b>${total}</b> 人正在逛</div>`;
      if (d.users && d.users.length) {
        html += `<div class="online-users">` + d.users.map(u => `
          <a class="online-user" href="/profile/?u=${encodeURIComponent(u.username)}">
            ${XRST_AVATARS.withFrame(u.avatar ?? 0, u.frame || null, "xrst-avatar-36")}
            <span>${escapeHtml(u.username)}</span>
            <i class="online-dot"></i>
          </a>`).join("") + `</div>`;
      }
      if (d.guests > 0) {
        html += `<div class="online-guests">还有 <b>${d.guests}</b> 位未登录的神秘访客 🕵️</div>`;
      }
      if (!total) html += `<div class="online-guests">暂时只有你一个人，好安静……</div>`;
      onlineBody.innerHTML = html;
    } catch { /* 静默 */ }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------- 登录态 ---------- */
  async function loadMe() {
    try {
      const res = await fetch("/api/me?t=" + Date.now(), { credentials: "same-origin", cache: "no-store" });
      me = res.ok ? await res.json() : null;
    } catch { me = null; }
    renderCheckin();
  }
  window.addEventListener("auth-user", e => {
    if (e.detail) loadMe();
    else { me = null; renderCheckin(); }
  });

  /* ---------- 启动 ---------- */
  loadMe();
  refreshOnline();
  setInterval(refreshOnline, 15_000);
})();
