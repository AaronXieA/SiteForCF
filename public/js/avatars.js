/* =====================================================
 * 20 个内置头像（纯前端渲染，无需图片存储）
 * 每个 = 渐变底色 + emoji 表情
 * ===================================================== */

(function () {
  const LIST = [
    { emoji: "🐱", from: "#ff9a9e", to: "#fad0c4" },
    { emoji: "🐶", from: "#a18cd1", to: "#fbc2eb" },
    { emoji: "🦊", from: "#f6d365", to: "#fda085" },
    { emoji: "🐼", from: "#84fab0", to: "#8fd3f4" },
    { emoji: "🐨", from: "#fccb90", to: "#d576b3" },
    { emoji: "🦁", from: "#f7b733", to: "#fc4a1a" },
    { emoji: "🐯", from: "#ffb347", to: "#ff7b59" },
    { emoji: "🐸", from: "#5ee7e7", to: "#38d9a9" },
    { emoji: "🐵", from: "#667eea", to: "#764ba2" },
    { emoji: "🐷", from: "#f093fb", to: "#f5576c" },
    { emoji: "🐰", from: "#ffd93d", to: "#ffb142" },
    { emoji: "🐻", from: "#c06c3f", to: "#8e58f0" },
    { emoji: "🐧", from: "#4facfe", to: "#00f2fe" },
    { emoji: "🦄", from: "#6a11cb", to: "#2575fc" },
    { emoji: "🐙", from: "#06b6d4", to: "#0ea5e9" },
    { emoji: "🐳", from: "#0284d7", to: "#11998e" },
    { emoji: "🦋", from: "#7dd3fc", to: "#a855f7" },
    { emoji: "🌟", from: "#fbbf5b", to: "#d946ef" },
    { emoji: "🍀", from: "#34d399", to: "#4ade80" },
    { emoji: "🎮", from: "#ef4444", to: "#e653f" },
  ];

  function normalize(id) {
    const n = Number(id);
    return Number.isInteger(n) && n >= 0 && n < LIST.length ? n : 0;
  }

  /* 渲染为 span 元素的 HTML 字符串 */
  function html(id, extraClass = "", extraStyle = "") {
    const a = LIST[normalize(id)];
    const cls = ("xrst-avatar" + (extraClass ? " " + extraClass : ""));
    const style = `background:linear-gradient(135deg,${a.from},${a.to});${extraStyle}`;
    return `<span class="${cls}" data-avatar="${normalize(id)}" style="${style}">${a.emoji}</span>`;
  }

  window.XRST_AVATARS = {
    LIST,
    COUNT: LIST.length,
    html,
    normalize,
  };
})();
