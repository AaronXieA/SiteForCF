/* =====================================================
 *「偷还是分？」前端：大厅 → 匹配 → 对局 → 结算
 * 对局长轮询（20s），服务端 alarm 权威计时与结算。
 * ===================================================== */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const screens = {
    lobby: $("screenLobby"),
    matching: $("screenMatching"),
    game: $("screenGame"),
    guest: $("screenGuest"),
  };
  function show(name) {
    for (const k of Object.keys(screens)) screens[k].hidden = k !== name;
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      headers: opts.body ? { "Content-Type": "application/json" } : {},
      ...opts,
    });
    const data = await res.json().catch(() => ({ ok: false, error: "服务器响应异常" }));
    return { status: res.status, data };
  }

  /* ---------------- 全局状态 ---------------- */
  let me = null;            // /api/me
  let ante = 3;
  let gameId = null;
  let gs = null;            // 最近一次对局视图
  let ver = 0;
  let clockOffset = 0;      // 服务器时间 - 本地时间
  let pollToken = 0;
  let matchTimer = 0;
  let uiTimer = 0;
  let resultShown = false;

  /* ---------------- 大厅 ---------------- */
  function renderLobbyLists() {
    const row = $("anteRow");
    row.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
      const b = document.createElement("button");
      b.className = "sg-chip" + (i === ante ? " on" : "");
      b.textContent = i;
      b.addEventListener("click", () => {
        ante = i;
        [...row.children].forEach((c, j) => c.classList.toggle("on", j + 1 === ante));
        refreshStartLabel();
      });
      row.appendChild(b);
    }
  }

  function refreshStartLabel() {
    $("startBtn").textContent = I18n.t("split.startMatchAnte", { n: ante });
  }

  async function refreshMe() {
    const { data } = await api("/api/me?t=" + Date.now());
    if (data && data.username) {
      me = data;
      $("lobbyCoins").textContent = data.coins ?? 0;
    }
  }

  async function startMatch() {
    if (!me) return;
    if ((me.coins || 0) < ante) {
      showToast(I18n.t("split.coinsNotEnough"));
      return;
    }
    $("startBtn").disabled = true;
    const { data } = await api("/api/split/match", {
      method: "POST",
      body: JSON.stringify({ ante }),
    });
    $("startBtn").disabled = false;
    if (!data.ok) { showToast(data.error || I18n.t("split.matchFailed")); await refreshMe(); return; }

    if (data.gameId) {
      enterGame(data.gameId);
    } else {
      enterMatching();
    }
  }

  /* ---------------- 匹配等待 ---------------- */
  function enterMatching(resumeAnte) {
    if (Number.isInteger(resumeAnte) && resumeAnte >= 1 && resumeAnte <= 10) ante = resumeAnte;
    $("matchAnte").textContent = ante;
    show("matching");
    clearInterval(matchTimer);
    let tries = 0;
    matchTimer = setInterval(async () => {
      tries++;
      const { data } = await api("/api/split/active");
      if (data && data.active && data.gameId) {
        clearInterval(matchTimer);
        enterGame(data.gameId);
      } else if (data && data.active === false) {
        clearInterval(matchTimer);
        leaveGame();
        showToast(I18n.t("split.matchCanceled"));
      }
      // 最多 5 秒补位，留到 ~20 秒兜底
      if (tries > 18) {
        clearInterval(matchTimer);
        showToast(I18n.t("split.matchTimeout"));
        leaveGame();
      }
    }, 1200);
  }

  async function cancelMatch() {
    clearInterval(matchTimer);
    await api("/api/split/cancel", { method: "POST", body: "{}" });
    await refreshMe();
    leaveGame();
    showToast(I18n.t("split.matchCancelRefund"));
  }

  function leaveGame() {
    pollToken++;
    clearInterval(uiTimer);
    gameId = null;
    gs = null;
    ver = 0;
    resultShown = false;
    $("resultMask").hidden = true;
    show("lobby");
    refreshMe();
  }

  /* ---------------- 对局 ---------------- */
  function enterGame(id) {
    clearInterval(matchTimer);
    gameId = id;
    gs = null;
    ver = 0;
    resultShown = false;
    $("resultMask").hidden = true;
    show("game");
    pollToken++;
    pollLoop(pollToken);
    startUiTicker();
  }

  async function pollLoop(token) {
    while (token === pollToken && gameId) {
      let data;
      try {
        const res = await fetch(
          `/api/split/game/${gameId}?ver=${ver}&t=${Date.now()}`,
          { credentials: "same-origin", cache: "no-store" }
        );
        data = await res.json();
        $("reconnBar").hidden = true;
      } catch {
        $("reconnBar").hidden = false;
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      if (token !== pollToken || !gameId) return;
      if (!data.ok) {
        if (data.error === "不是你的对局" || data.error === "对局不存在") {
          pollToken++;
          leaveGame();
          return;
        }
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      gs = data;
      ver = data.ver;
      clockOffset = data.serverNow - Date.now();
      renderGame();
      if (data.status === "finished" && data.settled) {
        showResult();
        return; // 结算完成，结束轮询
      }
      if (data.status === "finished" && !data.settled) {
        // KV 结算重试中，继续轮询直到 settled
        showResult();
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  function startUiTicker() {
    clearInterval(uiTimer);
    uiTimer = setInterval(() => {
      if (!gs) return;
      const now = Date.now() + clockOffset;
      const end = gs.phase === "reveal" ? gs.revealUntil : gs.deadline;
      const total = gs.phase === "reveal" ? 4000 : 30000;
      const left = Math.max(0, end - now);
      const pct = Math.min(100, (left / total) * 100);
      const fill = $("timerFill");
      fill.style.width = pct + "%";
      $("timerBar").classList.toggle("urgent", gs.phase === "choose" && left <= 10000);
    }, 250);
  }

  function avatarHtml(p, size) {
    const st = size ? `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.55)}px` : "";
    if (window.XRST_AVATARS) return window.XRST_AVATARS.html(p.avatar ?? 0, "", st);
    return "";
  }

  function choiceCls(c) { return c === "split" ? "s" : c === "steal" ? "t" : "n"; }
  function choiceTxt(c) { return c === "split" ? I18n.t("split.splitWord") : c === "steal" ? I18n.t("split.stealWord") : "–"; }

  function renderGame() {
    const mySide = gs.you;
    const oppSide = mySide === "p1" ? "p2" : "p1";
    const myScore = gs.scores[mySide];
    const oppScore = gs.scores[oppSide];

    $("roundNo").textContent = Math.min(gs.round, gs.rounds);
    $("poolNo").textContent = gs.pool;
    $("myScore").textContent = myScore;
    $("oppScore").textContent = oppScore;
    $("myWho").innerHTML = `${avatarHtml(gs.me, 26)} ${escapeHtml(gs.me.name)}`;
    $("oppWho").innerHTML = `${avatarHtml(gs.opp, 26)} ${escapeHtml(gs.opp.name)}`;

    const mySlot = $("mySlot");
    const oppSlot = $("oppSlot");
    mySlot.className = "sg-card-slot";
    oppSlot.className = "sg-card-slot";

    if (gs.phase === "reveal" && gs.revealChoices) {
      const mc = gs.revealChoices.mine;
      const oc = gs.revealChoices.opp;
      mySlot.classList.add(choiceCls(mc));
      mySlot.textContent = choiceTxt(mc);
      oppSlot.classList.add(choiceCls(oc));
      oppSlot.textContent = choiceTxt(oc);
    } else {
      if (gs.myChoice) {
        mySlot.classList.add(choiceCls(gs.myChoice));
        mySlot.textContent = choiceTxt(gs.myChoice);
      } else {
        mySlot.textContent = "?";
      }
      if (gs.oppChosen === true) {
        oppSlot.classList.add("picked");
        oppSlot.textContent = I18n.t("split.oppDecided");
      } else {
        oppSlot.classList.add("waiting");
        oppSlot.textContent = I18n.t("split.oppWaiting");
      }
    }

    // 行动按钮
    const canAct = gs.status === "playing" && gs.phase === "choose" && !gs.myChoice;
    $("splitBtn").disabled = !canAct;
    $("stealBtn").disabled = !canAct;

    // 中部提示
    renderBanner();

    // 历史
    renderHist();
  }

  function renderBanner() {
    const el = $("banner");
    if (gs.status === "finished") { el.textContent = I18n.t("split.gameOver"); return; }
    if (gs.phase === "reveal") {
      const h = gs.hist[gs.hist.length - 1];
      if (!h) { el.textContent = ""; return; }
      const mine = gs.you === "p1" ? h.c1 : h.c2;
      const opp = gs.you === "p1" ? h.c2 : h.c1;
      el.textContent = revealText(mine, opp);
      return;
    }
    el.textContent = gs.myChoice
      ? I18n.t("split.waitingReveal", { c: gs.myChoice === "split" ? I18n.t("split.splitWord") : I18n.t("split.stealWord") })
      : I18n.t("split.roundTimer", { n: gs.round });
  }

  function revealText(mine, opp) {
    if (mine === null && opp === null) return I18n.t("split.revealBothTimeout");
    if (mine === null) return I18n.t("split.revealMineTimeout");
    if (opp === null) return I18n.t("split.revealOppTimeout");
    if (mine === "split" && opp === "split") return I18n.t("split.revealSplitSplit");
    if (mine === "steal" && opp === "split") return I18n.t("split.revealStealSplit");
    if (mine === "split" && opp === "steal") return I18n.t("split.revealSplitSteal");
    return I18n.t("split.revealStealSteal");
  }

  function renderHist() {
    const row = $("histRow");
    row.innerHTML = "";
    for (let i = 0; i < gs.rounds; i++) {
      const h = gs.hist[i];
      const cell = document.createElement("div");
      cell.className = "sg-hcell";
      if (gs.status === "playing" && i === gs.hist.length) cell.classList.add("cur");
      if (!h) {
        cell.innerHTML = `<div class="hr">${i + 1}</div><div class="hp"><b class="n">–</b><b class="n">–</b></div>`;
      } else {
        const mc = gs.you === "p1" ? h.c1 : h.c2;
        const oc = gs.you === "p1" ? h.c2 : h.c1;
        cell.innerHTML = `<div class="hr">${i + 1}</div>
          <div class="hp"><b class="${choiceCls(mc)}">${choiceTxt(mc)}</b><b class="${choiceCls(oc)}">${choiceTxt(oc)}</b></div>`;
      }
      row.appendChild(cell);
    }
  }

  async function submitChoice(choice) {
    if (!gs || gs.myChoice || gs.phase !== "choose" || gs.status !== "playing") return;
    $("splitBtn").disabled = true;
    $("stealBtn").disabled = true;
    const { data } = await api(`/api/split/game/${gameId}/choice`, {
      method: "POST",
      body: JSON.stringify({ choice }),
    });
    if (data.ok) {
      gs = data;
      ver = data.ver;
      renderGame();
    } else {
      showToast(data.error || I18n.t("split.submitFailed"));
      renderGame();
    }
  }

  /* ---------------- 逃跑 ---------------- */
  function askQuit() {
    if (!gs || gs.status !== "playing") return;
    const pool = gs.pool;
    const t = $("quitText");
    t.innerHTML = I18n.t("split.quitText", { pool, fine: Math.floor(pool * 0.5) });
    $("quitMask").hidden = false;
  }

  async function confirmQuit() {
    $("quitMask").hidden = true;
    const { data } = await api(`/api/split/game/${gameId}/quit`, {
      method: "POST",
      body: "{}",
    });
    if (data.ok) {
      gs = data;
      ver = data.ver;
      renderGame();
    } else {
      showToast(data.error || I18n.t("split.operFailed"));
    }
  }

  /* ---------------- 结算 ---------------- */
  function showResult() {
    if (resultShown && gs.settled === false) {
      // 仅结算状态翻转时重渲染内容，不重复弹动画
      $("resultBox").querySelector(".settle-note")?.remove();
      appendSettleNote();
      return;
    }
    resultShown = true;
    const box = $("resultBox");
    const r = gs.result;
    const mySide = gs.you;
    const oppSide = mySide === "p1" ? "p2" : "p1";
    const myAnte = gs.me.ante;
    let head = "", cls = "", desc = "";

    if (r.kind === "quit") {
      const iQuit = r.by === mySide;
      const offline = r.reason === "offline";
      if (iQuit) {
        head = offline ? "你掉线逃跑了" : "你逃跑了";
        cls = "lose";
        desc = `判负，奖池 ${gs.pool} 金币归对方${r.myPenalty ? `，另扣 ${r.myPenalty} 金币罚金` : ""}。`;
      } else {
        head = offline ? "对方掉线了，你赢！" : "对方逃跑了，你赢！";
        cls = "win";
        desc = `奖池 ${gs.pool} 金币全部归你。`;
      }
    } else {
      const ms = r.scores[mySide];
      const os = r.scores[oppSide];
      if (ms > os) { head = "🎉 你赢了！"; cls = "win"; desc = "分数更高，拿走奖池 120%。"; }
      else if (ms < os) { head = "你输了…"; cls = "lose"; desc = "奖池被对方拿走了，下把偷回来。"; }
      else if (ms === 0) { head = "0:0 平"; cls = "tie"; desc = "各得自己押金的 80%（向下取整）。"; }
      else { head = "平分 🤝"; cls = "tie"; desc = `各拿奖池的 80%（${Math.floor(gs.pool * 0.8)} 金币，向下取整）。`; }
    }

    const net = r.myPayout - myAnte - (r.myPenalty || 0);
    const netTxt = net >= 0 ? `+${net}` : `${net}`;
    box.innerHTML = `
      <div class="big ${cls}">${head}</div>
      <p>${desc}</p>
      <div class="scores-line">比分 ${r.scores[mySide]} : ${r.scores[oppSide]}　·　押金 ${myAnte} 金币</div>
      <div class="coins-line">🪙 获得 ${r.myPayout} 金币${r.myPenalty ? `　罚金 -${r.myPenalty}` : ""}</div>
      <div class="net ${net >= 0 ? "up" : "down"}">本局净${net >= 0 ? "赚" : "亏"} ${Math.abs(net)} 金币</div>
      <div style="height:16px"></div>
    `;
    appendSettleNote();
    $("resultMask").hidden = false;

    window.dispatchEvent(new Event("coins-changed"));
    refreshMe();
  }

  function appendSettleNote() {
    if (!gs || gs.settled) return;
    const note = document.createElement("p");
    note.className = "settle-note";
    note.style.cssText = "font-size:12.5px;color:var(--ink-3);margin-top:6px;";
    note.textContent = I18n.t("split.settling");
    $("resultBox").appendChild(note);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  /* ---------------- 初始化 / 断线重连 ---------------- */
  async function init() {
    renderLobbyLists();
    refreshStartLabel();

    $("startBtn").addEventListener("click", startMatch);
    $("cancelMatchBtn").addEventListener("click", cancelMatch);
    $("splitBtn").addEventListener("click", () => submitChoice("split"));
    $("stealBtn").addEventListener("click", () => submitChoice("steal"));
    $("quitBtn").addEventListener("click", askQuit);
    $("quitCancelBtn").addEventListener("click", () => ($("quitMask").hidden = true));
    $("quitConfirmBtn").addEventListener("click", confirmQuit);
    $("resultLobbyBtn").addEventListener("click", leaveGame);
    $("resultAgainBtn").addEventListener("click", () => { leaveGame(); });
    $("guestLoginBtn").addEventListener("click", () => {
      if (typeof openAuthModal === "function") openAuthModal();
    });

    await refreshMe();
    if (!me) {
      show("guest");
      return;
    }

    // 恢复未完成的排队 / 对局
    const { data } = await api("/api/split/active");
    if (data && data.active) {
      if (data.gameId) enterGame(data.gameId);
      else enterMatching(data.ante);
    } else {
      show("lobby");
    }
  }

  // 登录 / 登录后同步大厅（init 只在 DOMContentLoaded 时绑定一次按钮，这里不能直接调 init）
  window.addEventListener("auth-user", async (e) => {
    if (e.detail && !me) {
      await refreshMe();
      if (me) show("lobby");
    } else if (!e.detail && me) {
      me = null;
      show("guest");
    }
  });

  document.addEventListener("DOMContentLoaded", init);
})();
