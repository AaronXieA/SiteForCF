/* =====================================================
 * 文字画板
 * - 所有人可看
 * - 任何登录用户都可编辑（≤3500 字，后写入者覆盖）
 * ===================================================== */

const boardBody = document.getElementById("boardBody");
const boardTime = document.getElementById("boardTime");
const boardEditBtn = document.getElementById("boardEditBtn");
const boardEditor = document.getElementById("boardEditor");
const boardInput = document.getElementById("boardInput");
const boardCount = document.getElementById("boardCount");
const boardSaveBtn = document.getElementById("boardSaveBtn");
const boardCancelBtn = document.getElementById("boardCancelBtn");

const MAX_CHARS = 3500;
let currentText = "";

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

function renderBoard(text, editor, updatedAt) {
  currentText = text || "";
  if (currentText.trim()) {
    boardBody.innerHTML = `<div class="announce-text">${escapeHtml(currentText).replace(/\n/g, "<br>")}</div>`;
    boardTime.textContent = `${editor ? `最后由 ${editor} 编辑` : ""}${updatedAt ? ` · ${fmtTime(updatedAt)}` : ""}`;
  } else {
    boardBody.innerHTML = '<p class="announce-empty">画板空空如也，来写下第一笔吧。</p>';
    boardTime.textContent = "";
  }
}

async function loadBoard() {
  try {
    const res = await fetch("/api/board?t=" + Date.now(), {
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json();
    renderBoard(data.text, data.editor, data.updatedAt);
  } catch {
    boardBody.innerHTML = '<p class="announce-empty">画板加载失败，刷新试试。</p>';
  }
}

/* ---------- 编辑模式 ---------- */

boardEditBtn?.addEventListener("click", () => {
  boardInput.value = currentText;
  boardCount.textContent = [...boardInput.value].length;
  boardEditor.hidden = false;
  boardEditBtn.hidden = true;
  boardBody.hidden = true;
  boardInput.focus();
});

boardCancelBtn?.addEventListener("click", () => {
  boardEditor.hidden = true;
  boardBody.hidden = false;
  boardEditBtn.hidden = false;
});

boardInput?.addEventListener("input", () => {
  const len = [...boardInput.value].length;
  if (len > MAX_CHARS) boardInput.value = [...boardInput.value].slice(0, MAX_CHARS).join("");
  boardCount.textContent = [...boardInput.value].length;
});

boardSaveBtn?.addEventListener("click", async () => {
  const text = boardInput.value;
  if ([...text].length > MAX_CHARS) {
    showToast(`画板内容不能超过 ${MAX_CHARS} 字`);
    return;
  }

  boardSaveBtn.disabled = true;
  boardSaveBtn.textContent = "保存中…";

  try {
    // 用 POST + 时间戳防 CDN 缓存
    const res = await fetch("/api/board?t=" + Date.now(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok) {
      renderBoard(data.text, data.editor, data.updatedAt);
      boardEditor.hidden = true;
      boardBody.hidden = false;
      boardEditBtn.hidden = false;
      showToast("画板已更新 🎨");
    } else {
      showToast(data.error || `保存失败 (${res.status})`);
      if (res.status === 401 && typeof openAuthModal === "function") openAuthModal();
    }
  } catch {
    showToast("网络异常，保存失败");
  } finally {
    boardSaveBtn.disabled = false;
    boardSaveBtn.textContent = "保存画板";
  }
});

/* 登录/退出状态变化：控制编辑按钮显隐 */
window.addEventListener("auth-user", (e) => {
  const me = e.detail;
  boardEditBtn.hidden = !me;
  if (!me) {
    boardEditor.hidden = true;
    boardBody.hidden = false;
  }
});

loadBoard();
