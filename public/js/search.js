/* =====================================================
 * /search/ 用户搜索
 * - 按用户名模糊搜或 12 位 XRSTUID 精确搜
 * - 只显示开启了「允许被搜索」的用户
 * ===================================================== */

const usForm = document.getElementById("usForm");
const usInput = document.getElementById("usInput");
const usList = document.getElementById("usList");

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function renderResults(results) {
  if (!results.length) {
    usList.innerHTML = `<li class="us-empty">${I18n.t("search.notFoundDetail")}</li>`;
    return;
  }
  usList.innerHTML = results.map(r => `
    <li class="us-item">
      <a class="us-link" href="/profile/?u=${encodeURIComponent(r.username)}">
        <span class="us-avatar-slot">${window.XRST_AVATARS.withFrame(r.avatar ?? 0, /^(?:f[1-8]|fv1)$/.test(r.frame || "") ? r.frame : null, "xrst-avatar-44")}</span>
        <span class="us-info">
          <span class="us-name">${escapeHtml(r.username)}${r.vip ? '<span class="vip-badge us-vip" title="VIP 会员">👑</span>' : ""}</span>
          <span class="us-uid">${I18n.t("search.uidLabel")}${r.uid ? escapeHtml(r.uid) : "—"}</span>
        </span>
        <span class="us-go">${I18n.t("search.viewProfile")}</span>
      </a>
    </li>
  `).join("");
}

async function doSearch(q) {
  usList.innerHTML = `<li class="us-empty">${I18n.t("search.loading")}</li>`;
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&t=${Date.now()}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({ results: [] }));
    renderResults(data.results || []);
  } catch {
    usList.innerHTML = `<li class="us-empty">${I18n.t("search.failed")}</li>`;
  }
}

usForm.addEventListener("submit", e => {
  e.preventDefault();
  const q = usInput.value.trim();
  if (!q) {
    showToast(I18n.t("search.noInputFull"));
    return;
  }
  doSearch(q);
});
