/* =====================================================
 * /server/ 页 · 一键复制服务器地址 / QQ 群号
 * ===================================================== */

document.querySelectorAll(".join-copy").forEach(btn => {
  btn.addEventListener("click", async () => {
    const text = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 旧浏览器 / 非安全上下文回退
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      ta.remove();
    }
    const original = btn.textContent;
    btn.textContent = "已复制 ✓";
    showToast(`已复制：${text}`);
    setTimeout(() => { btn.textContent = original; }, 1600);
  });
});
