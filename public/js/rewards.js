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
      checkinStreak.textContent = I18n.t("rewards.streak", { n: 0 });
      checkinBtn.textContent = I18n.t("rewards.checkinBtnLogin");
      checkinBtn.disabled = false;
      checkinSub.textContent = I18n.t("rewards.checkinSub");
      return;
    }
    checkinCoins.textContent = me.coins;
    checkinStreak.textContent = I18n.t("rewards.streak", { n: me.streak || 0 });
    const today = beijingToday();
    if (me.lastCheckin === today) {
      checkinBtn.textContent = I18n.t("rewards.checkinBtnDone");
      checkinBtn.disabled = true;
      checkinSub.textContent = I18n.t("rewards.checkedInSub");
    } else {
      checkinBtn.textContent = I18n.t("rewards.checkinBtnDo");
      checkinBtn.disabled = false;
      const tomorrow = me.lastCheckin === beijingToday(-1);
      const amt = Math.min(10 + Math.min((me.streak || 0), 6) * 5, 40);
      checkinSub.textContent = tomorrow ? I18n.t("rewards.streakContinue", { n: amt }) : I18n.t("rewards.notCheckedIn");
    }
  }

  function beijingToday(offset = 0) {
    const d = new Date(Date.now() + (8 * 3600 + offset * 86400) * 1000);
    return d.toISOString().slice(0, 10);
  }

  checkinBtn?.addEventListener("click", async () => {
    if (!me) { openAuthModal(); return; }
    checkinBtn.disabled = true;
    checkinBtn.textContent = I18n.t("rewards.checkingIn");
    try {
      const res = await fetch("/api/checkin?t=" + Date.now(), {
        method: "POST", credentials: "same-origin", cache: "no-store",
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        showToast(I18n.t("rewards.checkinSuccess", { n: d.reward, s: d.streak }));
        me.coins = d.coins; me.streak = d.streak; me.lastCheckin = beijingToday();
        renderCheckin();
        window.dispatchEvent(new Event("coins-changed"));
      } else {
        showToast(d.error || I18n.t("rewards.checkinFailed"));
        checkinBtn.disabled = false;
        checkinBtn.textContent = I18n.t("rewards.checkinBtnDo");
      }
    } catch {
      showToast(I18n.t("rewards.networkError"));
      checkinBtn.disabled = false;
      checkinBtn.textContent = I18n.t("rewards.checkinBtnDo");
    }
  });

  /* ---------- 兑换商店 ---------- */
  let shopTab = "frame";

  function openShop() {
    if (!me) { openAuthModal(); showToast(I18n.t("rewards.shopNeedLogin")); return; }
    XRST.openMask(shopModal);
    shopCoinsEl.textContent = me.coins;
    renderShop();
  }
  function closeShop() {
    XRST.closeMask(shopModal);
  }
  $("openShopBtn")?.addEventListener("click", openShop);
  $("shopClose")?.addEventListener("click", closeShop);
  shopModal?.addEventListener("click", e => { if (e.target === shopModal) closeShop(); });

  $("shopTabFrame")?.addEventListener("click", () => { shopTab = "frame"; renderShop(); });
  $("shopTabBubble")?.addEventListener("click", () => { shopTab = "bubble"; renderShop(); });
  $("shopTabVip")?.addEventListener("click", () => { shopTab = "vip"; renderShop(); });

  function vipDaysLeft() {
    if (!me?.vipUntil) return 0;
    return Math.max(0, Math.ceil((me.vipUntil - Date.now()) / 86400000));
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function renderShop() {
    $("shopTabFrame").classList.toggle("active", shopTab === "frame");
    $("shopTabBubble").classList.toggle("active", shopTab === "bubble");
    $("shopTabVip").classList.toggle("active", shopTab === "vip");
    shopCoinsEl.textContent = me.coins;

    if (shopTab === "vip") { renderVipTab(); return; }

    const list = shopTab === "frame" ? XRST_SHOP.FRAMES : XRST_SHOP.BUBBLES;
    const owned = me[shopTab === "frame" ? "frames" : "bubbles"] || [];
    const equipped = me[shopTab] || null;
    const vipActive = !!me.vip;

    shopGrid.innerHTML = list.map(item => {
      let btn, badge = "";
      if (item.vip) {
        // VIP 专属款：会员期内可装备，非会员只展示并引导开通
        badge = '<span class="shop-vip-tag">👑 VIP</span>';
        const isEquipped = equipped === item.id;
        if (isEquipped) {
          btn = `<button class="btn btn-ghost btn-small" data-act="unequip" data-id="${item.id}">${I18n.t("shop.unequip")}</button>`;
        } else if (vipActive) {
          btn = `<button class="btn btn-vip btn-small" data-act="equip" data-id="${item.id}">${I18n.t("shop.equipVip")}</button>`;
        } else {
          btn = `<button class="btn btn-vip btn-small" data-act="go-vip">${I18n.t("shop.goVip")}</button>`;
        }
      } else {
        const isOwned = owned.includes(item.id);
        const isEquipped = equipped === item.id;
        if (isEquipped) {
          btn = `<button class="btn btn-ghost btn-small" data-act="unequip" data-id="${item.id}">${I18n.t("shop.unequip")}</button>`;
        } else if (isOwned) {
          btn = `<button class="btn btn-solid btn-small" data-act="equip" data-id="${item.id}">${I18n.t("shop.equip")}</button>`;
        } else {
          const afford = me.coins >= item.price;
          btn = `<button class="btn btn-solid btn-small ${afford ? "" : "btn-disabled"}" data-act="buy" data-id="${item.id}" ${afford ? "" : "disabled"}>${I18n.t("shop.buyItem", { n: item.price })}</button>`;
        }
      }
      const preview = shopTab === "frame"
        ? `<span class="af af-${item.id}">${XRST_AVATARS.html(13, "xrst-avatar-44")}</span>`
        : `<span class="cb cb-${item.id} shop-preview-bubble">${I18n.t("shop.previewBubble")}</span>`;
      return `
        <div class="shop-item${equipped === item.id ? " equipped" : ""}${item.vip ? " shop-item-vip" : ""}">
          <div class="shop-preview">${preview}${badge}</div>
          <div class="shop-item-name">${item.name}</div>
          <div class="shop-item-desc">${item.desc}</div>
          ${btn}
        </div>`;
    }).join("");
  }

  /* VIP 页签：会员卡 + 权益说明 + 专属款预览 */
  function renderVipTab() {
    const days = vipDaysLeft();
    const active = days > 0;
    const afford = me.coins >= XRST_SHOP.VIP_PRICE;
    const btnLabel = active
      ? I18n.t("shop.vipRenew", { n: XRST_SHOP.VIP_DAYS, p: XRST_SHOP.VIP_PRICE })
      : I18n.t("shop.vipBuy", { n: XRST_SHOP.VIP_DAYS, p: XRST_SHOP.VIP_PRICE });

    shopGrid.innerHTML = `
      <div class="vip-card ${active ? "is-active" : ""}">
        <div class="vip-card-head">
          <span class="vip-crown-big">👑</span>
          <div>
            <div class="vip-card-title">${I18n.t("shop.vipCardTitle")}</div>
            <div class="vip-card-state">
              ${active
                ? I18n.t("shop.vipActive", { n: days, d: fmtDate(me.vipUntil) })
                : I18n.t("shop.vipInactive")}
            </div>
          </div>
        </div>
        <ul class="vip-perks">
          <li>${I18n.t("shop.vipPerk1")}</li>
          <li>${I18n.t("shop.vipPerk2")}</li>
          <li>${I18n.t("shop.vipPerk3")}</li>
          <li>${I18n.t("shop.vipPerk4")}</li>
        </ul>
        <button class="btn btn-vip ${afford || active ? "" : "btn-disabled"}" data-act="buy-vip"
          ${afford || active ? "" : "disabled"}>
          ${active ? btnLabel : (afford ? btnLabel : I18n.t("shop.vipInsufficient", { p: XRST_SHOP.VIP_PRICE }))}
        </button>
      </div>
      <div class="vip-exclusive-row">
        <div class="shop-item shop-item-vip">
          <div class="shop-preview">
            <span class="af af-${XRST_SHOP.VIP_FRAME}">${XRST_AVATARS.html(13, "xrst-avatar-44")}</span>
            <span class="shop-vip-tag">👑 VIP</span>
          </div>
          <div class="shop-item-name">至尊金冠</div>
          <div class="shop-item-desc">VIP 专属头像框</div>
        </div>
        <div class="shop-item shop-item-vip">
          <div class="shop-preview">
            <span class="cb cb-${XRST_SHOP.VIP_BUBBLE} shop-preview-bubble">气泡预览</span>
            <span class="shop-vip-tag">👑 VIP</span>
          </div>
          <div class="shop-item-name">至尊鎏金</div>
          <div class="shop-item-desc">VIP 专属聊天气泡</div>
        </div>
      </div>`;
  }

  async function buyVip() {
    try {
      const res = await fetch("/api/vip?t=" + Date.now(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ action: "buy" }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        Object.assign(me, { coins: d.coins, vipUntil: d.vipUntil, vip: d.vip, frame: d.frame, bubble: d.bubble });
        showToast(`开通成功！VIP 有效期 30 天，专属套装已为你换上 👑`);
        renderShop();
        renderCheckin();
        window.dispatchEvent(new Event("coins-changed"));
        window.dispatchEvent(new Event("vip-changed"));
      } else {
        showToast(d.error || "开通失败");
      }
    } catch {
      showToast("网络错误");
    }
  }

  shopGrid?.addEventListener("click", async e => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === "go-vip") { shopTab = "vip"; renderShop(); return; }
    if (act === "buy-vip") { btn.disabled = true; await buyVip(); renderShop(); return; }

    const id = btn.dataset.id;
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
        me.vipUntil = d.vipUntil; me.vip = d.vip;
        showToast(act === "buy" ? I18n.t("shop.buySuccessAuto") : I18n.t("shop.equipUpdated"));
        renderShop();
        renderCheckin();
        window.dispatchEvent(new Event("coins-changed"));
        window.dispatchEvent(new Event("vip-changed"));
      } else {
        showToast(d.error || I18n.t("shop.actFailed"));
        btn.disabled = false;
      }
    } catch {
      showToast(I18n.t("common.networkError"));
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
      let html = `<div class="online-total">${I18n.t("rewards.onlineTotal", { n: total })}</div>`;
      if (d.users && d.users.length) {
        html += `<div class="online-users">` + d.users.map(u => `
          <a class="online-user" href="/profile/?u=${encodeURIComponent(u.username)}">
            ${XRST_AVATARS.withFrame(u.avatar ?? 0, u.frame || null, "xrst-avatar-36")}
            <span>${escapeHtml(u.username)}</span>
            <i class="online-dot"></i>
          </a>`).join("") + `</div>`;
      }
      if (d.guests > 0) {
        html += `<div class="online-guests">${I18n.t("rewards.onlineGuests", { n: d.guests })}</div>`;
      }
      if (!total) html += `<div class="online-guests">${I18n.t("rewards.onlineAlone")}</div>`;
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

  /* 语言切换时重渲染动态文案 */
  window.addEventListener("lang-changed", () => {
    renderCheckin();
    if (shopModal && !shopModal.hidden) renderShop();
    refreshOnline();
  });

  /* ---------- 启动 ---------- */
  loadMe();
  refreshOnline();
  setInterval(() => { if (!document.hidden) refreshOnline(); }, 30_000);
})();
