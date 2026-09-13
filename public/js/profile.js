/* =====================================================
 * /profile/ 个人主页
 * - 登录后进入自己的主页：头像 / XRSTUID / 简介 / 改名 / 改密码 / 允许被搜索
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

/* 设置区元素 */
const ownAvatar = document.getElementById("ownAvatar");
const avatarUploadBtn = document.getElementById("avatarUploadBtn");
const avatarRemoveBtn = document.getElementById("avatarRemoveBtn");
const avatarFile = document.getElementById("avatarFile");
const pfUid = document.getElementById("pfUid");
const copyUidBtn = document.getElementById("copyUidBtn");
const searchableToggle = document.getElementById("searchableToggle");
const renameOpenBtn = document.getElementById("renameOpenBtn");
const renameModal = document.getElementById("renameModal");
const renameClose = document.getElementById("renameClose");
const renameForm = document.getElementById("renameForm");
const renameInput = document.getElementById("renameInput");
const renameMsg = document.getElementById("renameMsg");
const renameBtn = document.getElementById("renameBtn");
const pwOpenBtn = document.getElementById("pwOpenBtn");
const pwModal = document.getElementById("pwModal");
const pwClose = document.getElementById("pwClose");
const pwForm = document.getElementById("pwForm");
const oldPw = document.getElementById("oldPw");
const newPw = document.getElementById("newPw");
const newPw2 = document.getElementById("newPw2");
const pwMsg = document.getElementById("pwMsg");
const pwSaveBtn = document.getElementById("pwSaveBtn");

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

/* 头像显示：优先云端图片，失败回退为彩色字母 */
function applyAvatar(container, username) {
  const img = document.createElement("img");
  img.alt = "";
  img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:inherit;";
  img.onload = () => {
    container.textContent = "";
    container.appendChild(img);
  };
  img.onerror = () => {
    container.textContent = [...username][0].toUpperCase();
    container.style.background = avatarColor(username);
  };
  img.src = `/api/avatar?u=${encodeURIComponent(username)}&t=${Date.now()}`;
}

function updateShareLink(username) {
  shareLink.textContent = `${location.origin}/profile/?u=${encodeURIComponent(username)}`;
}

let currentUsername = "";

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
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });

  if (!res.ok) {
    show("404");
    return;
  }

  const data = await res.json();
  if (!data.username) { show("guest"); return; }

  const isOwn = !!me && me.toLowerCase() === data.username.toLowerCase();
  currentUsername = data.username;

  applyAvatar(avatarEl, data.username);
  nameEl.textContent = data.username;
  roleEl.textContent = (isOwn ? "我的个人主页" : `${data.username} 的主页`) + (data.uid ? ` · XRSTUID：${data.uid}` : "");
  show("profile");

  if (isOwn) {
    ownPanel.hidden = false;
    otherPanel.hidden = true;

    /* 头像设置区 */
    applyAvatar(ownAvatar, data.username);
    hasAvatar(data.username).then(yes => { avatarRemoveBtn.hidden = !yes; });

    /* XRSTUID */
    pfUid.textContent = data.uid || "生成中…";

    /* 允许被搜索 */
    searchableToggle.checked = data.searchable !== false;

    /* 简介 */
    bioInput.value = data.text || "";
    bioCount.textContent = [...bioInput.value].length;
    bioSaved.textContent = data.updatedAt ? `上次保存于 ${fmtTime(data.updatedAt)}` : "还没有保存过";
    updateShareLink(data.username);
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

async function hasAvatar(username) {
  try {
    const res = await fetch(`/api/avatar?u=${encodeURIComponent(username)}&t=${Date.now()}`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/* ---------------- 头像上传 ---------------- */

avatarUploadBtn?.addEventListener("click", () => avatarFile.click());

avatarFile?.addEventListener("change", async () => {
  const file = avatarFile.files && avatarFile.files[0];
  avatarFile.value = "";
  if (!file) return;
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
    showToast("只支持 jpg / png / webp / gif");
    return;
  }
  try {
    const dataUrl = await compressImage(file, 256);
    if (dataUrl.length > 100_000) {
      showToast("图片压缩后仍然太大，换一张试试");
      return;
    }
    const res = await fetch("/api/avatar?t=" + Date.now(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar: dataUrl }),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      applyAvatar(ownAvatar, currentUsername);
      applyAvatar(avatarEl, currentUsername);
      avatarRemoveBtn.hidden = false;
      showToast("头像已更新");
    } else {
      showToast(data.error || "头像上传失败");
    }
  } catch {
    showToast("图片处理失败");
  }
});

avatarRemoveBtn?.addEventListener("click", async () => {
  try {
    const res = await fetch("/api/avatar?t=" + Date.now(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar: null }),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      applyAvatar(ownAvatar, currentUsername);
      applyAvatar(avatarEl, currentUsername);
      avatarRemoveBtn.hidden = true;
      showToast("头像已移除");
    } else {
      showToast(data.error || "移除失败");
    }
  } catch {
    showToast("网络异常");
  }
});

/* 压缩图片到 size×size 的 JPEG dataURL */
function compressImage(file, size) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read fail"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode fail"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        // 居中裁剪成方形
        const side = Math.min(img.width, img.height);
        ctx.drawImage(
          img,
          (img.width - side) / 2, (img.height - side) / 2, side, side,
          0, 0, size, size
        );
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------- XRSTUID 复制 ---------------- */

copyUidBtn?.addEventListener("click", async () => {
  const uid = pfUid.textContent;
  try {
    await navigator.clipboard.writeText(uid);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = uid;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch {}
    ta.remove();
  }
  showToast("XRSTUID 已复制");
});

/* ---------------- 允许被搜索开关 ---------------- */

searchableToggle?.addEventListener("change", async () => {
  const enabled = searchableToggle.checked;
  try {
    const res = await fetch("/api/searchable?t=" + Date.now(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      showToast(enabled ? "已开启：别人可以搜到你了" : "已关闭：你不会再出现在搜索结果里");
    } else {
      searchableToggle.checked = !enabled;
      showToast(data.error || "设置失败");
    }
  } catch {
    searchableToggle.checked = !enabled;
    showToast("网络异常，设置失败");
  }
});

/* ---------------- 通用弹窗开关 ---------------- */

function openModal(modal) {
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal(modal) {
  modal.hidden = true;
  document.body.style.overflow = "";
}
function bindModal(modal, closeBtn) {
  closeBtn?.addEventListener("click", () => closeModal(modal));
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(modal); });
}
bindModal(renameModal, renameClose);
bindModal(pwModal, pwClose);
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (renameModal && !renameModal.hidden) closeModal(renameModal);
    if (pwModal && !pwModal.hidden) closeModal(pwModal);
  }
});

/* ---------------- 修改用户名 ---------------- */

renameOpenBtn?.addEventListener("click", () => {
  renameInput.value = "";
  renameMsg.textContent = "";
  openModal(renameModal);
  renameInput.focus();
});

renameForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const newName = renameInput.value.trim();
  if (!newName) {
    renameMsg.textContent = "先输入新用户名";
    return;
  }
  if (newName === currentUsername) {
    renameMsg.textContent = "新用户名和当前一样";
    return;
  }
  renameMsg.textContent = "";
  renameBtn.disabled = true;
  renameBtn.textContent = "修改中…";
  try {
    const res = await fetch("/api/rename?t=" + Date.now(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newUsername: newName }),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      showToast(`用户名已改为「${data.username}」`);
      closeModal(renameModal);
      currentUsername = data.username;
      // 刷新导航与本页显示
      if (typeof renderNavAuth === "function") renderNavAuth(data.username);
      nameEl.textContent = data.username;
      updateShareLink(data.username);
      history.replaceState(null, "", `/profile/?u=${encodeURIComponent(data.username)}`);
    } else {
      renameMsg.textContent = data.error || "修改失败";
    }
  } catch {
    renameMsg.textContent = "网络异常，修改失败";
  } finally {
    renameBtn.disabled = false;
    renameBtn.textContent = "确认修改";
  }
});

/* ---------------- 修改密码 ---------------- */

pwOpenBtn?.addEventListener("click", () => {
  pwForm.reset();
  pwMsg.textContent = "";
  openModal(pwModal);
  oldPw.focus();
});

pwForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const oldP = oldPw.value;
  const newP = newPw.value;
  if (newP.length < 6) {
    pwMsg.textContent = "新密码至少 6 位";
    return;
  }
  if (newP !== newPw2.value) {
    pwMsg.textContent = "两次输入的新密码不一致";
    return;
  }
  pwMsg.textContent = "";
  pwSaveBtn.disabled = true;
  pwSaveBtn.textContent = "提交中…";
  try {
    const res = await fetch("/api/password?t=" + Date.now(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPassword: oldP, newPassword: newP }),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      showToast("密码已更新");
      closeModal(pwModal);
      pwForm.reset();
    } else {
      pwMsg.textContent = data.error || "修改失败";
    }
  } catch {
    pwMsg.textContent = "网络异常，修改失败";
  } finally {
    pwSaveBtn.disabled = false;
    pwSaveBtn.textContent = "确认修改密码";
  }
});

/* ---------------- 简介 ---------------- */
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
      credentials: "same-origin",
      cache: "no-store",
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
