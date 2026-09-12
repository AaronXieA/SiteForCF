/* =====================================================
 * 公告栏
 * - 所有人可看
 * - 登录 AaronXie 后显示「编辑公告」按钮，可编辑（≤2000字）
 * ===================================================== */

const ADMIN_USERNAME = "AaronXie";

const announceBody = document.getElementById("announceBody");
const announceTime = document.getElementById("announceTime");
const announceEditBtn = document.getElementById("announceEditBtn");
const announceEditor = document.getElementById("announceEditor");
const announceInput = document.getElementById("announceInput");
const announceCount = document.getElementById("announceCount");
const announceSaveBtn = document.getElementById("announceSaveBtn");
const announceCancelBtn = document.getElementById("announceCancelBtn");

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function loadAnnounce() {
  try {
    const res = await fetch("/api/announce", { credentials: "same-origin", cache: "no-store" });
    const data = await res.json();
    renderAnnounce(data.text, data.updatedAt);

    // 检查是否是管理员
    const me = await Auth.currentUser();
    if (me && me.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
      announceEditBtn.hidden = false;
    }
  } catch {
    renderAnnounce("", null);
  }
}

function renderAnnounce(text, updatedAt) {
  if (text && text.trim()) {
    announceBody.innerHTML = `<div class="announce-text">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
    announceTime.textContent = updatedAt ? `更新于 ${fmtTime(updatedAt)}` : "";
  } else {
    announceBody.innerHTML = '<p class="announce-empty">暂无公告。</p>';
    announceTime.textContent = "";
  }
}

/* ---------- 编辑模式 ---------- */
announceEditBtn?.addEventListener("click", () => {
  const currentText = announceBody.querySelector(".announce-text");
  announceInput.value = currentText ? currentText.textContent.replace(/<br>/g, "\n") : "";
  announceCount.textContent = [...announceInput.value].length;
  announceEditor.hidden = false;
  announceEditBtn.hidden = true;
  announceInput.focus();
});

announceCancelBtn?.addEventListener("click", () => {
  announceEditor.hidden = true;
  announceEditBtn.hidden = false;
});

announceInput?.addEventListener("input", () => {
  announceCount.textContent = [...announceInput.value].length;
});

announceSaveBtn?.addEventListener("click", async () => {
  const text = announceInput.value;
  if ([...text].length > 2000) {
    showToast("公告不能超过 2000 字");
    return;
  }
  announceSaveBtn.disabled = true;
  announceSaveBtn.textContent = "保存中…";
  try {
    const res = await fetch("/api/announce", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      renderAnnounce(data.text, data.updatedAt);
      announceEditor.hidden = true;
      announceEditBtn.hidden = false;
      showToast("公告已更新");
    } else {
      showToast(data.error || "保存失败");
    }
  } catch {
    showToast("网络异常，保存失败");
  } finally {
    announceSaveBtn.disabled = false;
    announceSaveBtn.textContent = "保存公告";
  }
});

loadAnnounce();
