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
const avatarGrid = document.getElementById("avatarGrid");
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

/* 内置头像渲染 */
let currentAvatar = 0;
let currentFrame = null;

function setAvatar(container, id, sizeClass, frameId) {
  container.innerHTML = window.XRST_AVATARS.withFrame(id, frameId || null, sizeClass || "");
}

function renderAvatarGrid(selected) {
  currentAvatar = window.XRST_AVATARS.normalize(selected);
  avatarGrid.innerHTML = window.XRST_AVATARS.LIST.map((a, i) =>
    `<button type="button" class="pf-avatar-option${i === currentAvatar ? " selected" : ""}" data-avatar="${i}"
             aria-label="${I18n.t("profile.avatarN", { n: i + 1 })}">${window.XRST_AVATARS.html(i)}</button>`
  ).join("");
}

avatarGrid?.addEventListener("click", async e => {
  const btn = e.target.closest("[data-avatar]");
  if (!btn) return;
  const id = Number(btn.dataset.avatar);
  try {
    const res = await fetch("/api/avatar?t=" + Date.now(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar: id }),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      currentAvatar = id;
      renderAvatarGrid(id);
      setAvatar(ownAvatar, id, "xrst-avatar-84", currentFrame);
      setAvatar(avatarEl, id, "xrst-avatar-44", currentFrame);
      showToast(I18n.t("profile.avatarUpdated"));
    } else if (res.status === 401) {
      showToast(I18n.t("auth.pleaseLogin"));
      if (typeof openAuthModal === "function") openAuthModal();
    } else {
      showToast(data.error || I18n.t("profile.avatarSetFail"));
    }
  } catch {
    showToast(I18n.t("profile.avatarNetworkFail"));
  }
});

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

  currentFrame = /^(?:f[1-8]|fv1)$/.test(data.frame || "") ? data.frame : null;
  setAvatar(avatarEl, data.avatar ?? 0, "xrst-avatar-44", currentFrame);
  nameEl.textContent = data.username;
  let oldCrown = nameEl.parentElement?.querySelector(".pf-vip-crown");
  if (oldCrown) oldCrown.remove();
  if (data.vip) {
    const crown = document.createElement("span");
    crown.className = "vip-badge pf-vip-crown";
    crown.title = I18n.t("profile.vipBadge");
    crown.textContent = "👑";
    nameEl.insertAdjacentElement("afterend", crown);
  }
  roleEl.textContent = (isOwn ? I18n.t("profile.myHome") : I18n.t("profile.userHome", { name: data.username })) + (data.uid ? I18n.t("profile.uidLabel") + data.uid : "") + (data.vip ? " · 👑 VIP" : "");
  show("profile");

  if (isOwn) {
    ownPanel.hidden = false;
    otherPanel.hidden = true;

    /* 头像设置区 */
    setAvatar(ownAvatar, data.avatar ?? 0, "xrst-avatar-84", currentFrame);
    renderAvatarGrid(data.avatar ?? 0);

    /* XRSTUID */
    pfUid.textContent = data.uid || I18n.t("profile.generating");

    /* 允许被搜索 */
    searchableToggle.checked = data.searchable !== false;

    /* 简介 */
    bioInput.value = data.text || "";
    bioCount.textContent = [...bioInput.value].length;
    bioSaved.textContent = data.updatedAt ? I18n.t("profile.lastSaved", { t: fmtTime(data.updatedAt) }) : I18n.t("profile.neverSaved");
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
  showToast(I18n.t("profile.uidCopied"));
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
      showToast(enabled ? I18n.t("profile.searchOn") : I18n.t("profile.searchOff"));
    } else {
      searchableToggle.checked = !enabled;
      showToast(data.error || I18n.t("profile.setFail"));
    }
  } catch {
    searchableToggle.checked = !enabled;
    showToast(I18n.t("profile.setNetworkFail"));
  }
});

/* ---------------- 通用弹窗开关 ---------------- */

function openModal(modal) {
  XRST.openMask(modal);
}
function closeModal(modal) {
  XRST.closeMask(modal);
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
    renameMsg.textContent = I18n.t("profile.renameEmpty");
    return;
  }
  if (newName === currentUsername) {
    renameMsg.textContent = I18n.t("profile.renameSame");
    return;
  }
  renameMsg.textContent = "";
  renameBtn.disabled = true;
  renameBtn.textContent = I18n.t("profile.renaming");
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
      showToast(I18n.t("profile.renamed", { name: data.username }));
      closeModal(renameModal);
      currentUsername = data.username;
      // 刷新导航与本页显示
      if (typeof renderNavAuth === "function") renderNavAuth(data.username);
      nameEl.textContent = data.username;
      updateShareLink(data.username);
      history.replaceState(null, "", `/profile/?u=${encodeURIComponent(data.username)}`);
    } else {
      renameMsg.textContent = data.error || I18n.t("profile.renameFail");
    }
  } catch {
    renameMsg.textContent = I18n.t("profile.renameNetworkFail");
  } finally {
    renameBtn.disabled = false;
    renameBtn.textContent = I18n.t("profile.renameConfirm");
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
    pwMsg.textContent = I18n.t("profile.pwTooShort");
    return;
  }
  if (newP !== newPw2.value) {
    pwMsg.textContent = I18n.t("profile.pwMismatch");
    return;
  }
  pwMsg.textContent = "";
  pwSaveBtn.disabled = true;
  pwSaveBtn.textContent = I18n.t("profile.pwSubmitting");
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
      showToast(I18n.t("profile.pwUpdated"));
      closeModal(pwModal);
      pwForm.reset();
    } else {
      pwMsg.textContent = data.error || I18n.t("profile.pwFail");
    }
  } catch {
    pwMsg.textContent = I18n.t("profile.pwNetworkFail");
  } finally {
    pwSaveBtn.disabled = false;
    pwSaveBtn.textContent = I18n.t("profile.pwConfirm");
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
    showToast(I18n.t("profile.introLimit"));
    return;
  }
  bioSaveBtn.disabled = true;
  bioSaveBtn.textContent = I18n.t("profile.bioSaving");
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
      bioSaved.textContent = I18n.t("profile.bioSavedAt", { t: fmtTime(data.updatedAt) });
      showToast(I18n.t("profile.bioSaved"));
    } else {
      showToast(data.error || I18n.t("profile.bioSaveFail"));
    }
  } catch {
    showToast(I18n.t("profile.bioNetworkFail"));
  } finally {
    bioSaveBtn.disabled = false;
    bioSaveBtn.textContent = I18n.t("profile.saveBio");
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
  showToast(I18n.t("profile.linkCopied"));
});

/* ---------------- 金币账单 ---------------- */
const billOpenBtn = document.getElementById("billOpenBtn");
const billModal = document.getElementById("billModal");
const billClose = document.getElementById("billClose");
const billList = document.getElementById("billList");
const billBalance = document.getElementById("billBalance");
const billRefresh = document.getElementById("billRefresh");

const BILL_ICONS = {
  checkin: "🌞", lottery: "🎟️", lottery_prize: "🎉", vip: "👑", shop: "🛍️",
  market_take: "🤝", market_sold: "💰", market_refund: "↩️",
  split_ante: "🎮", split_refund: "↩️", split_settle: "🎲",
  ascend: "🪐", playtime: "🎮", game_bonus: "🎉", admin: "🛠️",
};

async function loadBill() {
  billList.innerHTML = '<div class="bill-empty">' + I18n.t("profile.billLoading") + "</div>";
  try {
    const [meRes, logRes] = await Promise.all([
      fetch("/api/me", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/me/coinlog?t=" + Date.now(), { credentials: "same-origin", cache: "no-store" }),
    ]);
    if (meRes.ok) {
      const me = await meRes.json();
      billBalance.textContent = (me.coins || 0).toLocaleString("zh-CN");
    }
    const d = await logRes.json().catch(() => ({}));
    if (!logRes.ok || !d.ok) {
      billList.innerHTML = '<div class="bill-empty">' + escapeHtml(d.error || I18n.t("profile.billLoadFail")) + "</div>";
      return;
    }
    if (!d.log.length) {
      billList.innerHTML = '<div class="bill-empty">' + I18n.t("profile.billEmpty") + "</div>";
      return;
    }
    billList.innerHTML = d.log.map(e => {
      const ico = BILL_ICONS[e.type] || "🪙";
      const typeName = I18n.t("profile.billType." + (e.type in BILL_ICONS ? e.type : "fallback"));
      const positive = e.delta > 0;
      const deltaText = (positive ? "+" : "−") + Math.abs(e.delta || 0).toLocaleString("zh-CN");
      return `<div class="bill-item">
        <span class="bill-ico">${ico}</span>
        <div class="bill-main">
          <div class="bill-memo">${escapeHtml(e.memo || typeName)}</div>
          <div class="bill-time">${fmtTime(e.ts)}</div>
        </div>
        <div>
          <div class="bill-delta ${positive ? "in" : "out"}">${deltaText}</div>
          <div class="bill-bal">${I18n.t("profile.billRemaining", { n: (e.balance || 0).toLocaleString("zh-CN") })}</div>
        </div>
      </div>`;
    }).join("");
  } catch {
    billList.innerHTML = '<div class="bill-empty">' + I18n.t("profile.billNetworkFail") + "</div>";
  }
}

billOpenBtn?.addEventListener("click", () => { openModal(billModal); loadBill(); });
billRefresh?.addEventListener("click", loadBill);
bindModal(billModal, billClose);
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && billModal && !billModal.hidden) closeModal(billModal);
});

loadProfile();
