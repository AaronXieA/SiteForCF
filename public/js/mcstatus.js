/* =====================================================
 * MC 服务器实时状态（MOTD + 在线人数）
 * 数据源：mcsrvstat.us 公共 API（支持浏览器跨域）
 * ===================================================== */

const MC_SERVER_ADDR = "mc.xrst.uk"; // 服务器连接地址

const statusBtn = document.getElementById("mcStatusBtn");
const statusBtnText = document.getElementById("mcStatusBtnText");
const panel = document.getElementById("mcStatus");
const pill = document.getElementById("mcStatusPill");
const versionEl = document.getElementById("mcStatusVersion");
const playersEl = document.getElementById("mcStatusPlayers");
const motdEl = document.getElementById("mcStatusMotd");

let fetching = false;

function renderOffline() {
  pill.className = "pill pill-off";
  pill.innerHTML = "离线或查询失败";
  versionEl.textContent = "";
  playersEl.textContent = "— / —";
  motdEl.textContent = "服务器当前不在线，稍后再来看看。";
}

async function fetchStatus() {
  if (fetching) return;
  fetching = true;
  statusBtnText.textContent = "查询中…";
  panel.hidden = false;
  pill.className = "pill";
  pill.innerHTML = "查询中…";
  playersEl.textContent = "— / —";
  motdEl.textContent = "…";

  try {
    const res = await fetch(`https://api.mcsrvstat.us/3/${MC_SERVER_ADDR}?t=${Date.now()}`);
    const data = await res.json();

    if (data && data.online) {
      const online = data.players?.online ?? 0;
      const max = data.players?.max ?? 0;
      const motd = (data.motd?.clean || []).filter(Boolean).join(" ") || "无 MOTD";

      pill.className = "pill pill-live";
      pill.innerHTML = '<i class="dot"></i>在线';
      versionEl.textContent = data.version || "";
      playersEl.textContent = `${online} / ${max} 人在线`;
      motdEl.textContent = motd;
      statusBtnText.textContent = "刷新状态";
    } else {
      renderOffline();
      statusBtnText.textContent = "重试";
    }
  } catch {
    renderOffline();
    statusBtnText.textContent = "重试";
  } finally {
    fetching = false;
  }
}

statusBtn?.addEventListener("click", fetchStatus);
