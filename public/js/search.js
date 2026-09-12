/* =====================================================
 * /search/ 用户搜索
 * - 按用户名模糊搜或 12 位 XRSTUID 精确搜
 * - 只显示开启了「允许被搜索」的用户
 * ===================================================== */

const usForm = document.getElementById("usForm");
const usInput = document.getElementById("usInput");
const usList = document.getElementById("usList");

const AVATAR_COLORS = ["#2f6bff", "#d64545", "#1a7f37", "#8a4fff", "#e07b00", "#00939c"];

function avatarColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function renderResults(results) {
  if (!results.length) {
    usList.innerHTML = '<li class="us-empty">没找到这个用户——可能不存在，也可能对方关闭了「允许被搜索」。</li>';
    return;
  }
  usList.innerHTML = results.map(r => `
    <li class="us-item">
      <a class="us-link" href="/profile/?u=${encodeURIComponent(r.username)}">
        <img class="us-avatar" src="/api/avatar?u=${encodeURIComponent(r.username)}"
             alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
        <span class="us-avatar us-avatar-fallback" style="display:none;background:${avatarColor(r.username)}">${escapeHtml([...r.username][0].toUpperCase())}</span>
        <span class="us-info">
          <span class="us-name">${escapeHtml(r.username)}</span>
          <span class="us-uid">XRSTUID：${r.uid ? escapeHtml(r.uid) : "—"}</span>
        </span>
        <span class="us-go">查看主页 →</span>
      </a>
    </li>
  `).join("");
}

async function doSearch(q) {
  usList.innerHTML = '<li class="us-empty">搜索中…</li>';
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&t=${Date.now()}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({ results: [] }));
    renderResults(data.results || []);
  } catch {
    usList.innerHTML = '<li class="us-empty">搜索失败，请检查网络。</li>';
  }
}

usForm.addEventListener("submit", e => {
  e.preventDefault();
  const q = usInput.value.trim();
  if (!q) {
    showToast("先输入用户名或 XRSTUID");
    return;
  }
  doSearch(q);
});
