/* =====================================================
 * /profile/ 个人主页
 * - 登录后进入自己的主页：编辑/保存云端简介（≤1000 字）
 * - /profile/?u=用户名 可查看任何人的公开主页
 * ===================================================== */

const guestView = document.getElementById("guestView");
const notFoundView = document.getElementById("notFoundView");
const profileView = document.getElementById("profileView");

const avatarEl = document.getElementById("pfAvatar");
const nameEl = document.getElementById("pfName");
const roleEl = document.getElementById("pfRole");

const ownPanel = document.getElementById("ownPanel");
const otherPanel = document.getElementById("otherPanel");
const bioInput = document.getElementById("bioInput");
const bioCount = document.getElementById("bioCount");
const bioSaved = document.getElementById("bioSaved");
const bioSaveBtn = document.getElementById("bioSaveBtn");
const shareLink = document.getElementById("shareLink");
const otherBio = document.getElementById("otherBio");
const otherEmpty = document.getElementById("otherEmpty");

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

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function show(view) {
  guestView.hidden = view !== "guest";
  notFoundView.hidden = view !== "404";
  profileView.hidden = view !== "profile";
}

async function loadProfile() {
  const me = await Auth.currentUser();
  const params = new URLSearchParams(location.search);
  const target = (params.get("u") || "").trim();

  // 未登录、也没指定看谁
  if (!me && !target) {
    show("guest");
    return;
  }

  const url = target ? `/api/profile?u=${encodeURIComponent(target)}` : "/api/profile";
  const res = await fetch(url);

  if (res.status === 404) {
    show("404");
    return;
  }
  if (!res.ok) {
    show("404");
    return;
  }

  const data = await res.json();
  if (!data.username) { show("guest"); return; }

  const isOwn = !!me && me.toLowerCase() === data.username.toLowerCase();

  avatarEl.textContent = [...data.username][0].toUpperCase();
  avatarEl.style.background = avatarColor(data.username);
  nameEl.textContent = data.username;
  roleEl.textContent = isOwn ? "我的个人主页" : `${data.username} 的主页`;
  show("profile");

  if (isOwn) {
    ownPanel.hidden = false;
    otherPanel.hidden = true;
    bioInput.value = data.text || "";
    bioCount.textContent = [...bioInput.value].length;
    bioSaved.textContent = data.updatedAt ? `上次保存于 ${fmtTime(data.updatedAt)}` : "还没有保存过";
    shareLink.textContent = `${location.origin}/profile/?u=${encodeURIComponent(data.username)}`;
  } else {
    ownPanel.hidden = true;
    otherPanel.hidden = false;
    if (data.text && data.text.trim()) {
      otherBio.innerHTML = escapeHtml(data.text).replace(/\n/g, "<br>");
      otherBio.hidden = false;
      otherEmpty.hidden = true;
    } else {
      otherBio.hidden = true;
      otherEmpty.hidden = false;
    }
  }
}

/* ---------------- 编辑 ---------------- */
bioInput?.addEventListener("input", () => {
  bioCount.textContent = [...bioInput.value].length;
  bioSaved.textContent = "";
});

bioSaveBtn?.addEventListener("click", async () => {
  const text = bioInput.value;
  if ([...text].length > 1000) {
    showToast("简介不能超过 1000 字");
    return;
  }
  bioSaveBtn.disabled = true;
  bioSaveBtn.textContent = "保存中…";
  try {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      bioSaved.textContent = `已保存 · ${fmtTime(data.updatedAt)}`;
      showToast("简介已保存到云端");
    } else {
      showToast(data.error || "保存失败");
    }
  } catch {
    showToast("网络异常，保存失败");
  } finally {
    bioSaveBtn.disabled = false;
    bioSaveBtn.textContent = "保存简介";
  }
});

/* ---------------- 其他 ---------------- */
document.getElementById("guestLoginBtn")?.addEventListener("click", openAuthModal);

document.getElementById("copyShareBtn")?.addEventListener("click", async () => {
  const text = shareLink.textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch {}
    ta.remove();
  }
  showToast("公开主页链接已复制");
});

loadProfile();
