/* =====================================================
 * 首页：金币抽奖（100 金币一次）
 * 奖池仅用于前端展示，实际开奖与概率完全以服务端 /api/lottery 为准。
 * ===================================================== */
(function () {
  const $ = id => document.getElementById(id);

  const COST = 100;

  // 奖池（展示顺序）
  const POOL = [
    { icon: "🍎", label: "附魔金苹果 ×1" },
    { icon: "🍎", label: "附魔金苹果 ×3" },
    { icon: "🛡️", label: "钻石套 ×1（无附魔）" },
    { icon: "🥕", label: "金胡萝卜 ×5" },
    { icon: "💠", label: "钻石块 ×1" },
    { icon: "🪙", label: "网站金币 ×150" },
    { icon: "🪙", label: "网站金币 ×80" },
    { icon: "🟩", label: "绿宝石块 ×3" },
    { icon: "👑", label: "1 个月网站 VIP" },
    { icon: "🧱", label: "铁块 ×10" },
  ];
  const REEL_ICONS = ["🍎", "🥕", "💠", "🪙", "🟩", "👑", "🧱", "🛡️", "❓"];

  const poolEl = $("lotPool");
  const coinsEl = $("lotCoins");
  const drawBtn = $("lotDrawBtn");
  const prizesEl = $("lotPrizes");
  const modal = $("lotModal");
  const reelEl = $("lotReel");
  const resultEl = $("lotResult");
  const labelEl = resultEl.querySelector(".lot-result-label");
  const hintEl = resultEl.querySelector(".lot-result-hint");
  const actionsEl = $("lotResultActions");

  let me = null;
  let spinning = false;
  let reelTimer = null;

  /* ---------- 奖池展示 ---------- */
  function renderPool() {
    const normal = POOL.map(p => `
      <div class="lot-prize">
        <span class="lot-prize-icon">${p.icon}</span>
        <span class="lot-prize-label">${p.label}</span>
      </div>`).join("");
    poolEl.innerHTML = normal;
  }

  /* ---------- 登录态 / 金币 ---------- */
  function renderCoins() {
    coinsEl.textContent = me ? me.coins : 0;
    if (!me) {
      drawBtn.textContent = I18n.t("lottery.drawLogin");
      drawBtn.disabled = false;
    } else if (spinning) {
      drawBtn.textContent = I18n.t("lottery.drawing");
    } else if (me.coins < COST) {
      drawBtn.textContent = I18n.t("lottery.insufficient", { n: COST });
    } else {
      drawBtn.textContent = I18n.t("lottery.drawBtnCost", { n: COST });
    }
    drawBtn.disabled = !!me && me.coins < COST || spinning;
  }

  async function loadMe() {
    try {
      const res = await fetch("/api/me?t=" + Date.now(), { credentials: "same-origin", cache: "no-store" });
      me = res.ok ? await res.json() : null;
    } catch { me = null; }
    renderCoins();
    loadPrizes();
  }

  window.addEventListener("auth-user", e => {
    if (e.detail) loadMe();
    else { me = null; renderCoins(); renderPrizes(null); }
  });
  // 签到 / 商店 / 其他页面改动金币后同步余额
  window.addEventListener("coins-changed", loadMe);
  window.addEventListener("vip-changed", loadMe);

  /* ---------- 我的奖品（待兑换游戏物品） ---------- */
  async function loadPrizes() {
    if (!me) { renderPrizes(null); return; }
    try {
      const res = await fetch("/api/lottery/prizes?t=" + Date.now(), {
        credentials: "same-origin", cache: "no-store",
      });
      const d = await res.json().catch(() => null);
      renderPrizes(res.ok && d ? d.prizes : []);
    } catch { renderPrizes([]); }
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function renderPrizes(list) {
    if (!me) {
      prizesEl.innerHTML = `<p class="lot-empty">${I18n.t("lottery.prizesEmpty")}</p>`;
      return;
    }
    if (!list || !list.length) {
      prizesEl.innerHTML = `<p class="lot-empty">${I18n.t("lottery.noPrizes")}</p>`;
      return;
    }
    prizesEl.innerHTML = list.map(p => `
      <div class="lot-prize-row${p.claimed ? " is-claimed" : ""}">
        <span class="lot-row-date">${fmtDate(p.ts)}</span>
        <span class="lot-row-label">${p.label}</span>
        ${p.claimed ? `<span class="lot-row-claimed">${I18n.t("lottery.claimed")}</span>` : ""}
        <button class="lot-code" type="button" data-code="${p.code}" title="点击复制兑换码">${p.code}</button>
      </div>`).join("");
  }

  prizesEl?.addEventListener("click", async e => {
    const btn = e.target.closest(".lot-code");
    if (!btn) return;
    const code = btn.dataset.code;
    try {
      await navigator.clipboard.writeText(code);
      showToast(I18n.t("lottery.codeCopied", { n: code }));
    } catch {
      showToast(I18n.t("lottery.codeShow", { n: code }));
    }
  });

  /* ---------- 抽奖 ---------- */
  drawBtn?.addEventListener("click", () => {
    if (spinning) return;
    if (!me) { openAuthModal(); return; }
    if (me.coins < COST) { showToast(I18n.t("lottery.notEnough")); return; }
    draw();
  });

  async function draw() {
    spinning = true;
    renderCoins();
    openResultModal();
    startReel();

    try {
      const res = await fetch("/api/lottery/draw?t=" + Date.now(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });
      const d = await res.json().catch(() => ({}));
      // 至少播一小段动画再揭奖，体验更像抽奖
      await new Promise(r => setTimeout(r, 900));
      if (!res.ok || !d.ok) {
        stopReel();
        finishResult(null, d.error || I18n.t("lottery.drawFailed"));
        me = null; // 保守刷新
        loadMe();
        return;
      }
      // 同步本地账户（与签到/商店共用同一视图）
      me.coins = d.coins;
      me.vip = d.vip; me.vipUntil = d.vipUntil;
      me.frame = d.frame; me.bubble = d.bubble;
      stopReel();
      finishResult(d.prize);
      renderCoins();
      loadPrizes();
      window.dispatchEvent(new Event("coins-changed"));
      if (d.prize.type === "vip") window.dispatchEvent(new Event("vip-changed"));
    } catch {
      stopReel();
      finishResult(null, I18n.t("lottery.networkError"));
      spinning = false;
      renderCoins();
    }
  }

  function openResultModal() {
    resultEl.classList.remove("is-jackpot");
    actionsEl.hidden = true;
    labelEl.textContent = "";
    hintEl.textContent = I18n.t("lottery.drawingHint");
    reelEl.textContent = "🎲";
    reelEl.classList.add("spinning");
    XRST.openMask(modal);
  }

  function startReel() {
    let i = 0;
    reelTimer = setInterval(() => {
      reelEl.textContent = REEL_ICONS[i++ % REEL_ICONS.length];
    }, 75);
  }

  function stopReel() {
    if (reelTimer) { clearInterval(reelTimer); reelTimer = null; }
    reelEl.classList.remove("spinning");
  }

  function finishResult(prize, errorMsg) {
    spinning = false;
    if (!prize) {
      reelEl.textContent = "😢";
      labelEl.textContent = I18n.t("lottery.notDrawn");
      hintEl.textContent = errorMsg || I18n.t("lottery.drawFailed");
      actionsEl.hidden = true;
      return;
    }
    reelEl.textContent = prize.icon;
    reelEl.classList.add("pop");
    setTimeout(() => reelEl.classList.remove("pop"), 400);

    resultEl.classList.toggle("is-jackpot", !!prize.hidden);
    labelEl.textContent = prize.label;
    hintEl.innerHTML = prizeHint(prize);
    actionsEl.hidden = false;
    drawBtn.disabled = !(me && me.coins >= COST);
  }

  function prizeHint(prize) {
    if (prize.hidden) {
      return I18n.t("lottery.jackpot");
    }
    if (prize.type === "coins") return I18n.t("lottery.coinsHint");
    if (prize.type === "vip") return I18n.t("lottery.vipHint");
    return I18n.t("lottery.itemHint");
  }

  $("lotClose")?.addEventListener("click", () => { stopReel(); spinning = false; XRST.closeMask(modal); renderCoins(); });
  modal?.addEventListener("click", e => {
    if (e.target === modal) { stopReel(); spinning = false; XRST.closeMask(modal); renderCoins(); }
  });
  $("lotOk")?.addEventListener("click", () => { XRST.closeMask(modal); renderCoins(); });
  $("lotAgain")?.addEventListener("click", () => {
    XRST.closeMask(modal);
    if (me && me.coins >= COST) draw();
    else showToast(I18n.t("lottery.notEnoughAgain"));
  });

  /* 语言切换时重渲染 */
  window.addEventListener("lang-changed", () => {
    renderPool();
    renderCoins();
    loadPrizes();
  });

  /* ---------- 启动 ---------- */
  renderPool();
  renderCoins();
  loadMe();
})();
