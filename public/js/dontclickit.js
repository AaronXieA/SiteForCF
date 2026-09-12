/* =====================================================
 * DontClick 页 · 计数按钮 + 右下角提示 + 里程碑彩蛋
 * 按下次数与已触发标记都保存在 localStorage
 * ===================================================== */

const COUNT_KEY = "xrst_dontclick_count";
const SEEN_PREFIX = "xrst_dc_seen_";

const btn = document.getElementById("dontClickBtn");
const hint = document.getElementById("dcHint");

let count = parseInt(localStorage.getItem(COUNT_KEY), 10) || 0;

const taunts = [
  "真的，手拿开。",
  "……你按了。",
  "还要继续吗？",
  "你可能有点上头。",
  "行吧，随你。",
  "这已经是第 %n 次了。",
  "要不要停一下？",
  "按键都替你尴尬了。",
  "你赢了……继续吧。",
  "数不清了吧？其实我数着呢。"
];

/* ---------------- 里程碑 ---------------- */
const modal114 = document.getElementById("milestone114");
const modal1000 = document.getElementById("milestone1000");

function seen(n) {
  return localStorage.getItem(SEEN_PREFIX + n) === "1";
}
function markSeen(n) {
  localStorage.setItem(SEEN_PREFIX + n, "1");
}
function openModal(mask) {
  mask.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal(mask) {
  mask.hidden = true;
  document.body.style.overflow = "";
}

document.querySelectorAll("[data-close114]").forEach(b =>
  b.addEventListener("click", () => closeModal(modal114)));
document.querySelectorAll("[data-close1000]").forEach(b =>
  b.addEventListener("click", () => closeModal(modal1000)));

// 到达 / 越过某个里程碑且本次没看过 → 触发一次
function checkMilestones(n) {
  if (n >= 114 && !seen(114)) {
    markSeen(114);
    openModal(modal114); // 只能点三个“知道”之一关闭
  }
  if (n >= 514 && !seen(514)) {
    markSeen(514);
    showToast("这么肝？！", 3000, "danger");
  }
  if (n >= 1000 && !seen(1000)) {
    markSeen(1000);
    openModal(modal1000);
  }
}

/* ---------------- 计数 ---------------- */
function hintText(n) {
  const idx = Math.min(taunts.length - 1, Math.floor((n - 1) / 5));
  return taunts[idx].replace("%n", n);
}

btn.addEventListener("click", () => {
  count++;
  localStorage.setItem(COUNT_KEY, String(count));
  hint.textContent = hintText(count);
  showToast(`你已经按下了 ${count} 次`);
  checkMilestones(count);
});
