/* =====================================================
 * 站队投票 /vote/
 * 题目文案与 worker.js VOTE_QUESTIONS 镜像（id 不可改）；
 * 票数以后端为准，前端只缓存 GET 结果做定点 DOM 更新。
 * 规则：一个账号 + 一个 IP 一票，换边先取消再投（后端强校验）。
 * ===================================================== */
(function () {
  const QUESTIONS = [
    { id: "q1", q: "爱玩？", a: "点击按钮", b: "偷还是分？", qEn: "Love to play?", aEn: "Click the button", bEn: "Steal or Split?" },
    { id: "q2", q: "粽子蘸什么？", a: "甜党（白糖蜜枣）", b: "咸党（鲜肉蛋黄）", qEn: "Zongzi dip?", aEn: "Sweet (sugar & red date)", bEn: "Savory (pork & yolk)" },
    { id: "q3", q: "豆腐脑吃甜的还是咸的？", a: "甜的，糖水派", b: "咸的，卤汁派", qEn: "Tofu pudding: sweet or savory?", aEn: "Sweet, sugar syrup", bEn: "Savory, soy broth" },
    { id: "q4", q: "菠萝能不能上披萨？", a: "天作之合，真香", b: "异端，拖出去", qEn: "Pineapple on pizza?", aEn: "Perfect match, so good", bEn: "Heresy, get out" },
    { id: "q5", q: "你的作息是？", a: "夜猫子，凌晨再战", b: "早起鸟，晨光真好", qEn: "Your sleep schedule?", aEn: "Night owl, battle past midnight", bEn: "Early bird, morning light is great" },
    { id: "q6", q: "奶茶里加不加小料？", a: "加满小料，半杯都是料", b: "纯奶茶，小料是邪道", qEn: "Toppings in milk tea?", aEn: "Max toppings, half the cup", bEn: "Pure milk tea, toppings are heresy" },
    { id: "q7", q: "代码的左大括号换不换行？", a: "不换行，K&R 正统", b: "必须换行，Allman", qEn: "Brace on new line or not?", aEn: "Same line, K&R orthodox", bEn: "Must break, Allman style" },
    { id: "q8", q: "夏天空调开几度？", a: "26℃，环保省电", b: "20℃，裹棉被睡", qEn: "AC temp in summer?", aEn: "26℃, eco-friendly", bEn: "20℃, sleep under a quilt" },
  ];

  const listEl = document.getElementById("vtList");
  const footEl = document.getElementById("vtFoot");

  let results = {};           // id -> {a, b, mine}
  const busy = new Set();     // 正在提交的题，防连点

  const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isEn = () => typeof I18n !== "undefined" && I18n.getLang() === "en";
  const trQ = m => isEn() && m.qEn ? m.qEn : m.q;
  const trA = m => isEn() && m.aEn ? m.aEn : m.a;
  const trB = m => isEn() && m.bEn ? m.bEn : m.b;

  function cardHtml(meta, i) {
    return `
    <section class="vt-card" data-id="${meta.id}">
      <h2 class="vt-q"><span class="vt-q-num">${i + 1}</span>${esc(trQ(meta))}</h2>
      <div class="vt-options">
        <button type="button" class="vt-btn vt-btn-a" data-side="a">
          <span class="vt-letter">A</span>
          <span class="vt-text">
            <span class="vt-label">${esc(trA(meta))}</span>
            <span class="vt-hint"></span>
          </span>
          <span class="vt-side-count"></span>
        </button>
        <span class="vt-vs">VS</span>
        <button type="button" class="vt-btn vt-btn-b" data-side="b">
          <span class="vt-letter">B</span>
          <span class="vt-text">
            <span class="vt-label">${esc(trB(meta))}</span>
            <span class="vt-hint"></span>
          </span>
          <span class="vt-side-count"></span>
        </button>
      </div>
      <div class="vt-bar" aria-hidden="true">
        <div class="vt-fill-a"></div>
        <div class="vt-fill-b"></div>
      </div>
      <div class="vt-stats">
        <span class="vt-stat-a"></span>
        <span class="vt-total"></span>
        <span class="vt-stat-b"></span>
      </div>
    </section>`;
  }

  /* 只更新一张卡片，不重绘列表（避免输入态/动画闪烁）*/
  function updateCard(id) {
    const card = listEl.querySelector(`.vt-card[data-id="${id}"]`);
    const s = results[id];
    if (!card || !s) return;
    const total = s.a + s.b;
    const pa = pct(s.a, total), pb = pct(s.b, total);

    card.querySelector(".vt-fill-a").style.width = pa + "%";
    card.querySelector(".vt-fill-b").style.width = pb + "%";
    card.querySelector(".vt-stat-a").textContent = I18n.t("vote.statA", { n: s.a, p: pa });
    card.querySelector(".vt-stat-b").textContent = I18n.t("vote.statB", { n: s.b, p: pb });
    card.querySelector(".vt-total").textContent = total ? I18n.t("vote.totalPeople", { n: total }) : I18n.t("vote.noVotes");

    for (const side of ["a", "b"]) {
      const btn = card.querySelector(`.vt-btn-${side}`);
      const hint = btn.querySelector(".vt-hint");
      const count = btn.querySelector(".vt-side-count");
      count.textContent = s[side] ? String(s[side]) : "";
      btn.classList.toggle("is-active", s.mine === side);
      if (s.mine === side) {
        // 自己这一边：再点一次就是取消
        btn.disabled = busy.has(id);
        btn.dataset.act = "cancel";
        hint.textContent = I18n.t("vote.yourChoice");
      } else if (s.mine) {
        // 已站另一边：必须先取消
        btn.disabled = true;
        btn.dataset.act = "none";
        hint.textContent = I18n.t("vote.switchSide");
      } else {
        btn.disabled = busy.has(id);
        btn.dataset.act = "vote";
        hint.textContent = I18n.t("vote.voteThis");
      }
    }
  }

  async function loadAll(silent = false) {
    try {
      const res = await fetch("/api/vote?t=" + Date.now(), { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        if (!silent) listEl.innerHTML = `<p class="vt-loading">${I18n.t("vote.loadFail")}</p>`;
        return;
      }
      const firstLoad = Object.keys(results).length === 0;
      results = {};
      for (const r of data.results) results[r.id] = r;
      if (firstLoad) {
        listEl.innerHTML = QUESTIONS.map(cardHtml).join("");
        QUESTIONS.forEach(q => updateCard(q.id));
        const totalVotes = data.results.reduce((n, r) => n + r.a + r.b, 0);
        footEl.hidden = false;
        footEl.textContent = I18n.t("vote.footNote", { n: totalVotes });
      } else {
        QUESTIONS.forEach(q => updateCard(q.id));
      }
    } catch {
      if (!silent) listEl.innerHTML = `<p class="vt-loading">${I18n.t("vote.networkError")}</p>`;
    }
  }

  async function submit(id, action, side) {
    if (busy.has(id) || action === "none") return;
    if (action === "vote" && !["a", "b"].includes(side)) return;

    busy.add(id);
    updateCard(id);
    try {
      const res = await fetch("/api/vote?t=" + Date.now(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ id, action, side }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        results[d.id] = { a: d.a, b: d.b, mine: d.mine };
        updateCard(d.id);
        showToast(action === "cancel" ? I18n.t("vote.canceled") : I18n.t("vote.votedOk"));
      } else {
        showToast(d.error || I18n.t("vote.operFail"));
        // 失败后以服务端当前状态为准刷新本题
        await loadAll(true);
      }
    } catch {
      showToast(I18n.t("vote.networkErrorShort"));
      await loadAll(true);
    } finally {
      busy.delete(id);
      updateCard(id);
    }
  }

  listEl?.addEventListener("click", e => {
    const btn = e.target.closest(".vt-btn");
    if (!btn || btn.disabled) return;
    const card = btn.closest(".vt-card");
    submit(card.dataset.id, btn.dataset.act || "vote", btn.dataset.side);
  });

  // 登录 / 退出后身份变化（游客 IP 票 ↔ 账号票），重新拉取我的选择
  window.addEventListener("auth-user", () => loadAll(true));

  loadAll();
  // 每 60 秒静默同步一次其他人的票数
  setInterval(() => loadAll(true), 60000);

  // 语言切换：重绘卡片
  window.addEventListener("lang-changed", () => {
    if (Object.keys(results).length > 0) {
      listEl.innerHTML = QUESTIONS.map(cardHtml).join("");
      QUESTIONS.forEach(q => updateCard(q.id));
    }
  });
})();
