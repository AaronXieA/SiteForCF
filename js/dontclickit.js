/* =====================================================
 * DontClick 页 · 计数按钮 + 右下角提示
 * 按下次数保存在 localStorage，刷新页面后继续累计
 * ===================================================== */

const COUNT_KEY = "xrst_dontclick_count";

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

function hintText(n) {
  const idx = Math.min(taunts.length - 1, Math.floor((n - 1) / 5));
  return taunts[idx].replace("%n", n);
}

btn.addEventListener("click", () => {
  count++;
  localStorage.setItem(COUNT_KEY, String(count));
  hint.textContent = hintText(count);
  showToast(`你已经按下了 ${count} 次`);
});
