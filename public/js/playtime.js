/* wkw 小游戏游玩时长奖励 SDK
   用法：<script src="/js/playtime.js?v=4" data-game="match3|cards|watermelon|fourchess|sort"></script>
   规则：每 30s 判定一个活跃周期；最后一次真实交互在 45s 宽限内才算活跃；
   切走标签页 / 最小化立即暂停；挂机不产生任何上报。
   KV 省额度版：本地攒 6 个活跃周期（180 秒）才批量上报一次，
   页面隐藏/关闭时用 sendBeacon 把零头立即补报，避免白玩。 */
(function () {
  "use strict";
  var script = document.currentScript;
  var GAME = script && script.getAttribute("data-game");
  if (!GAME || /^[a-z0-9]+$/.test(GAME) === false) return;

  var BEAT_MS = 30000;      // 活跃周期（与服务端计费单位一致）
  var GRACE_MS = 45000;     // 一次操作后 45 秒内都算"在玩"（看球滚、思考出牌不误伤）
  var FLUSH_UNITS = 6;      // 攒 6 个周期（180s）批量上报，KV 写次数降 ~9 倍
  var state = {
    active: true,           // 当前是否在宽限期内
    loggedIn: true,
    capped: false,
    dailySec: 0,
    dailyCapSec: 6000,
    dailyCoins: 0,
    coins: 0,
    gainedFlash: 0,
    flashUntil: 0,
  };
  var graceUntil = Date.now() + GRACE_MS;
  var lastMoveTick = 0;
  var pendingUnits = 0;     // 已攒未上报的活跃周期数
  var sending = false;      // fetch 上报进行中（防重入）

  /* ---------- 浮窗 UI ---------- */
  var box = document.createElement("div");
  box.id = "xrst-pt-box";
  box.setAttribute("style", [
    "position:fixed", "right:10px", "bottom:10px", "z-index:2147483646",
    "font:12px/1.5 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif",
    "background:rgba(20,24,35,.82)", "color:#eef1f7",
    "border:1px solid rgba(255,255,255,.14)", "border-radius:12px",
    "padding:7px 11px", "max-width:230px", "cursor:default",
    "box-shadow:0 4px 18px rgba(0,0,0,.28)", "user-select:none",
    "-webkit-user-select:none", "backdrop-filter:blur(6px)",
    "transition:opacity .3s", "pointer-events:auto",
  ].join(";"));
  box.innerHTML =
    '<div id="xrst-pt-main" style="display:flex;align-items:center;gap:6px;white-space:nowrap;"></div>' +
    '<div id="xrst-pt-sub" style="font-size:11px;color:#aab2c5;margin-top:2px;"></div>';
  function mount() {
    if (!box.parentNode) document.body.appendChild(box);
  }
  function fmtMin(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? m + "分" + (s >= 30 ? "半" : "") : s + "秒";
  }
  function render() {
    var main = box.querySelector("#xrst-pt-main");
    var sub = box.querySelector("#xrst-pt-sub");
    if (!state.loggedIn) {
      box.style.cursor = "pointer";
      main.innerHTML = '🪙 <a href="/?z=playlogin" target="_blank" style="color:#ffd66b;text-decoration:none;">登录 xrst.uk 玩游戏赚金币</a>';
      sub.textContent = "每玩 30 秒 +5 金币";
      return;
    }
    box.style.cursor = "default";
    var dot = state.capped ? "🏁" : (state.active ? "🟢" : "⏸️");
    var flash = (Date.now() < state.flashUntil && state.gainedFlash > 0)
      ? ' <b style="color:#7fe39a;">+' + state.gainedFlash + "</b>" : "";
    main.innerHTML = dot + ' 今日 <b style="color:#ffd66b;">🪙 ' + state.dailyCoins + "</b>" +
      ' <span style="color:#8b93a7;">·</span> ' + fmtMin(state.dailySec + pendingUnits * 30) + flash;
    if (state.capped) {
      sub.textContent = "今日奖励已领满（" + Math.round(state.dailyCapSec / 60) + " 分钟），明天再来";
    } else if (state.active) {
      sub.textContent = "每分钟 +10 · 攒 3 分钟批量到账";
    } else {
      sub.textContent = "挂起中 —— 动一下继续计时";
    }
  }

  /* ---------- 活跃检测 ---------- */
  function poke() {
    graceUntil = Date.now() + GRACE_MS;
    if (!state.active) { state.active = true; render(); }
  }
  function onMove() {
    var t = Date.now();
    if (t - lastMoveTick < 2000) return; // pointermove 节流，也防假脚本刷事件
    lastMoveTick = t;
    poke();
  }
  var EVENTS = ["pointerdown", "touchstart", "keydown", "click", "wheel"];
  EVENTS.forEach(function (ev) {
    window.addEventListener(ev, poke, { passive: true });
  });
  window.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      state.active = false;
      graceUntil = 0; // 切走立即清宽限
      beaconFlush();  // 零头立即补报，防止切走后一直不回来白玩
      render();
    }
  });
  window.addEventListener("blur", function () {
    // 切到其他窗口：宽限缩短到 10 秒，很快自动挂起
    graceUntil = Math.min(graceUntil, Date.now() + 10000);
  });
  window.addEventListener("pagehide", beaconFlush);
  window.addEventListener("beforeunload", beaconFlush);

  /* ---------- 上报 ---------- */
  function payload(sec) {
    return JSON.stringify({ game: GAME, sec: sec });
  }
  /* sendBeacon 兜底上报（页面隐藏/卸载时用，不关心响应） */
  function beaconFlush() {
    if (!state.loggedIn || state.capped || pendingUnits <= 0) return;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/playtime/beat", new Blob([payload(pendingUnits * 30)], { type: "application/json" }));
        pendingUnits = 0;
      }
    } catch (e) { /* 静默 */ }
  }
  /* 批量上报（可读响应刷新 UI） */
  async function flush() {
    if (sending || pendingUnits <= 0) return;
    if (!state.loggedIn || state.capped) { pendingUnits = 0; return; }
    sending = true;
    var sec = pendingUnits * 30;
    try {
      var res = await fetch("/api/playtime/beat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload(sec),
        keepalive: true,
      });
      if (res.status === 401) {
        state.loggedIn = false;
        pendingUnits = 0;
        render();
        return;
      }
      var d = await res.json();
      if (!d.ok) return;
      pendingUnits = Math.max(0, pendingUnits - Math.round(sec / 30)); // 成功才扣减
      state.dailySec = d.dailySec;
      state.dailyCapSec = d.dailyCapSec;
      state.dailyCoins = d.dailyCoins;
      state.coins = d.coins;
      state.capped = !!d.capped;
      if (d.gained > 0) {
        state.gainedFlash = d.gained;
        state.flashUntil = Date.now() + 2500;
      }
      render();
    } catch (e) { /* 网络抖动静默，周期攒着下轮再报 */ }
    finally { sending = false; }
  }
  /* 登录态探测（sec=0 不记账，让未登录用户立刻看到登录提示） */
  async function probe() {
    try {
      var res = await fetch("/api/playtime/beat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload(0),
      });
      if (res.status === 401) { state.loggedIn = false; render(); return; }
      var d = await res.json();
      if (d && d.ok) {
        state.dailySec = d.dailySec;
        state.dailyCapSec = d.dailyCapSec;
        state.dailyCoins = d.dailyCoins;
        state.coins = d.coins;
        state.capped = !!d.capped;
        render();
      }
    } catch (e) { /* 静默 */ }
  }

  /* ---------- 启动 ---------- */
  if (document.body) mount();
  else window.addEventListener("DOMContentLoaded", mount);
  render();
  setInterval(render, 1000);        // 刷新挂起/到账动画状态
  probe();
  setTimeout(function tick() {
    var active = document.visibilityState === "visible" && Date.now() < graceUntil;
    state.active = active;
    if (active && !state.capped && state.loggedIn) {
      pendingUnits++;
      if (pendingUnits >= FLUSH_UNITS) flush();   // 攒满 3 分钟批量上报
    }
    setTimeout(tick, BEAT_MS);
  }, BEAT_MS);
})();
