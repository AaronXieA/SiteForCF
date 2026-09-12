/* =====================================================
 * MC 服务器实时状态（MOTD + 在线人数）
 * 数据源：mcsrvstat.us 公共 API（支持浏览器跨域）
 * 首页：点击“实时状态”按钮查询
 * /server/ 页：进入自动查询（body[data-mc-autoload]）
 * ===================================================== */

const MC_SERVER_ADDR = "mc.xrtech.dpdns.org"; // 服务器连接地址

const statusBtn = document.getElementById("mcStatusBtn");
const statusBtnText = document.getElementById("mcStatusBtnText");
const panel = document.getElementById("mcStatus");
const pill = document.getElementById("mcStatusPill");
const versionEl = document.getElementById("mcStatusVersion");
const playersEl = document.getElementById("mcStatusPlayers");
const motdEl = document.getElementById("mcStatusMotd");
// /server/ 页顶部的小状态灯
const heroPill = document.getElementById("srvLivePill");

let fetching = false;

function setPill(el, cls, html) {
  if (!el) return;
  el.className = "pill " + cls;
  el.innerHTML = html;
}

function renderOffline() {
  setPill(pill, "pill-off", "离线或查询失败");
  setPill(heroPill, "pill-off", "当前离线");
  if (versionEl) versionEl.textContent = "";
  if (playersEl) playersEl.textContent = "— / —";
  if (motdEl) motdEl.textContent = "服务器当前不在线，稍后再来看看。";
}

async function fetchStatus() {
  if (fetching || !panel) return;
  fetching = true;
  if (statusBtnText) statusBtnText.textContent = "查询中…";
  panel.hidden = false;
  setPill(pill, "", "查询中…");
  setPill(heroPill, "", "状态查询中");
  if (playersEl) playersEl.textContent = "— / —";
  if (motdEl) motdEl.textContent = "…";

  try {
    const res = await fetch(`https://api.mcsrvstat.us/3/${MC_SERVER_ADDR}?t=${Date.now()}`);
    const data = await res.json();

    if (data && data.online) {
      const online = data.players?.online ?? 0;
      const max = data.players?.max ?? 0;
      const motd = (data.motd?.clean || []).filter(Boolean).join(" ") || "无 MOTD";

      setPill(pill, "pill-live", '<i class="dot"></i>在线');
      setPill(heroPill, "pill-live", `<i class="dot"></i>${online} 人在线`);
      if (versionEl) versionEl.textContent = data.version || "";
      if (playersEl) playersEl.textContent = `${online} / ${max} 人在线`;
      if (motdEl) motdEl.textContent = motd;
      if (statusBtnText) statusBtnText.textContent = "刷新状态";
    } else {
      renderOffline();
      if (statusBtnText) statusBtnText.textContent = "重试";
    }
  } catch {
    renderOffline();
    if (statusBtnText) statusBtnText.textContent = "重试";
  } finally {
    fetching = false;
  }
}

statusBtn?.addEventListener("click", fetchStatus);

// /server/ 页进入即自动查询
if (document.body.dataset.mcAutoload !== undefined && panel) {
  fetchStatus();
}
