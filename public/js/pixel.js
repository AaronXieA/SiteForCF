/* =====================================================
 * /board/ 像素画板（256×256，20 色 + 橡皮）
 * - 数据：每格 1 字节颜色索引（0=空白），RLE+base64 压缩存 KV
 * - 绘画：本地乐观更新，防抖批量 POST；远端 5 秒轮询合并
 * ===================================================== */

(function () {
  const N = 256;
  const TOTAL = N * N;
  const POLL_MS = 5000;
  const FLUSH_MS = 500;
  const BATCH = 2500; // 服务端单次上限 3000，留余量
  const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8];

  // 20 色调色板（索引 1-20）
  const COLORS = [
    "#000000", "#5b5b5b", "#9e9e9e", "#ffffff",
    "#e53935", "#fb5607", "#fb8c00", "#fdd835",
    "#9ccc24", "#43a047", "#00897b", "#00acc1",
    "#039be5", "#1e63d6", "#3949ab", "#7b1fa2",
    "#ab47bc", "#ec407a", "#6d4c41", "#ffab91",
  ];
  const RGB = COLORS.map(h => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]);

  /* ---------- DOM ---------- */
  const tabBtnText = document.getElementById("tabBtnText");
  const tabBtnPixel = document.getElementById("tabBtnPixel");
  const panelText = document.getElementById("panelText");
  const panelPixel = document.getElementById("panelPixel");
  const palette = document.getElementById("pixelPalette");
  const statusEl = document.getElementById("pixelStatus");
  const canvas = document.getElementById("pixelCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const scrollBox = document.getElementById("pixelScroll");
  const innerBox = document.getElementById("pixelInner");
  const zoomInBtn = document.getElementById("zoomIn");
  const zoomOutBtn = document.getElementById("zoomOut");
  const zoomFitBtn = document.getElementById("zoomFit");
  const zoomLabel = document.getElementById("zoomLabel");
  const panModeBtn = document.getElementById("panModeBtn");
  const mask = document.getElementById("pixelMask");
  const loginBtn = document.getElementById("pixelLoginBtn");

  /* ---------- 状态 ---------- */
  let me = null;
  let grid = new Uint8Array(TOTAL);
  let imageData = ctx.createImageData(N, N);
  let remoteV = -1;
  let drawing = false;
  let currentColor = 1;
  let lastCell = null;
  let pending = [];
  let flushTimer = null;
  let inited = false;
  let pollTimer = null;
  let zoomIdx = 1; // ZOOM_LEVELS[1] = 2×
  let panMode = false;   // 工具栏切换的抓手模式
  let spacePan = false;  // 按住空格临时抓手
  const panning = () => panMode || spacePan;

  /* ---------- RLE(varint) + base64（与 worker.js 同构）---------- */
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function rleDecode(b64) {
    if (!b64) return new Uint8Array(TOTAL);
    const bytes = b64ToBytes(b64);
    const out = new Uint8Array(TOTAL);
    let p = 0, idx = 0;
    while (p < bytes.length && idx < TOTAL) {
      let len = 0, shift = 0, b;
      do { b = bytes[p++]; len |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
      const c = bytes[p++];
      const end = Math.min(idx + (len >>> 0), TOTAL);
      out.fill(c, idx, end);
      idx = end;
    }
    return out;
  }

  /* ---------- 渲染 ---------- */
  let dirty = null; // [minX, minY, maxX, maxY]

  function paintIndex(i, c) {
    const o = i * 4;
    const rgb = c === 0 ? [255, 255, 255] : RGB[c - 1];
    imageData.data[o] = rgb[0];
    imageData.data[o + 1] = rgb[1];
    imageData.data[o + 2] = rgb[2];
    imageData.data[o + 3] = 255;
  }

  function renderAll() {
    for (let i = 0; i < TOTAL; i++) paintIndex(i, grid[i]);
    ctx.putImageData(imageData, 0, 0);
    dirty = null;
  }

  function setLocal(x, y, c) {
    const i = y * N + x;
    if (grid[i] === c) return;
    grid[i] = c;
    paintIndex(i, c);
    if (!dirty) dirty = [x, y, x, y];
    else {
      if (x < dirty[0]) dirty[0] = x;
      if (y < dirty[1]) dirty[1] = y;
      if (x > dirty[2]) dirty[2] = x;
      if (y > dirty[3]) dirty[3] = y;
    }
    pending.push({ x, y, c });
  }

  function flushRender() {
    if (!dirty) return;
    ctx.putImageData(imageData, 0, 0, dirty[0], dirty[1], dirty[2] - dirty[0] + 1, dirty[3] - dirty[1] + 1);
    dirty = null;
  }

  /* ---------- 调色板 UI ---------- */
  function buildPalette() {
    const items = [];
    COLORS.forEach((hex, idx) => {
      const c = idx + 1;
      items.push(
        `<button type="button" class="px-color${c === currentColor ? " selected" : ""}"
          data-c="${c}" title="颜色 ${c}" style="background:${hex}"></button>`
      );
    });
    items.push(
      `<button type="button" class="px-color px-eraser" data-c="0" title="橡皮擦">擦</button>`
    );
    palette.innerHTML = items.join("");
  }

  palette?.addEventListener("click", e => {
    const btn = e.target.closest("[data-c]");
    if (!btn) return;
    currentColor = Number(btn.dataset.c);
    palette.querySelectorAll(".px-color").forEach(el =>
      el.classList.toggle("selected", Number(el.dataset.c) === currentColor));
  });

  /* ---------- 绘画交互 ---------- */
  function cellFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * N);
    const y = Math.floor((e.clientY - r.top) / r.height * N);
    if (x < 0 || y < 0 || x >= N || y >= N) return null;
    return { x, y };
  }

  // Bresenham：快速拖动时补齐中间像素
  function line(x0, y0, x1, y1, c) {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      setLocal(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  let panState = null; // 抓手拖动中：{x,y,sl,st}

  function onDown(e) {
    if (!me) return;
    e.preventDefault();
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    if (panning()) {
      panState = { x: e.clientX, y: e.clientY, sl: scrollBox.scrollLeft, st: scrollBox.scrollTop };
      scrollBox.classList.add("pan-active");
      return;
    }
    drawing = true;
    lastCell = cellFromEvent(e);
    if (lastCell) { setLocal(lastCell.x, lastCell.y, currentColor); flushRender(); scheduleFlush(); }
  }
  function onMove(e) {
    if (panState) {
      e.preventDefault();
      scrollBox.scrollLeft = panState.sl - (e.clientX - panState.x);
      scrollBox.scrollTop = panState.st - (e.clientY - panState.y);
      return;
    }
    if (!drawing || !me) return;
    e.preventDefault();
    const cell = cellFromEvent(e);
    if (!cell) return;
    if (lastCell) line(lastCell.x, lastCell.y, cell.x, cell.y, currentColor);
    else setLocal(cell.x, cell.y, currentColor);
    lastCell = cell;
    flushRender();
    if (pending.length >= BATCH) flushNow();
    else scheduleFlush();
  }
  function onUp() {
    if (panState) {
      panState = null;
      scrollBox.classList.remove("pan-active");
      return;
    }
    if (!drawing) return;
    drawing = false;
    lastCell = null;
    flushNow();
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  /* ---------- 缩放 / 平移 ---------- */
  // inner 在 scrollBox 中靠 margin:auto 居中；内容超出时偏移为 0
  function innerOffset(contentSize, viewSize) {
    const free = viewSize - contentSize;
    return free > 0 ? free / 2 : 0;
  }

  // 初始化时按当前 zoomIdx 应用尺寸并居中
  function applyZoom() {
    const scale = ZOOM_LEVELS[zoomIdx];
    const size = N * scale;
    innerBox.style.width = size + "px";
    innerBox.style.height = size + "px";
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    zoomLabel.textContent = scale + "×";
    zoomOutBtn.disabled = zoomIdx === 0;
    zoomInBtn.disabled = zoomIdx === ZOOM_LEVELS.length - 1;
    const maxX = Math.max(0, size - scrollBox.clientWidth);
    const maxY = Math.max(0, size - scrollBox.clientHeight);
    scrollBox.scrollLeft = maxX / 2;
    scrollBox.scrollTop = maxY / 2;
  }

  // 以指定屏幕坐标为锚点切换缩放，保持该点下的画布像素不动
  function zoomAt(newIdx, clientX, clientY) {
    newIdx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, newIdx));
    if (newIdx === zoomIdx) return;
    const before = ZOOM_LEVELS[zoomIdx];
    const after = ZOOM_LEVELS[newIdx];
    const vr = scrollBox.getBoundingClientRect();
    const px = clientX - vr.left;
    const py = clientY - vr.top;
    const ir = innerBox.getBoundingClientRect();
    // 锚点对应的画布像素坐标
    const cx = (clientX - ir.left) / before;
    const cy = (clientY - ir.top) / before;

    zoomIdx = newIdx;
    const size = N * after;
    innerBox.style.width = size + "px";
    innerBox.style.height = size + "px";
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    zoomLabel.textContent = after + "×";
    zoomOutBtn.disabled = zoomIdx === 0;
    zoomInBtn.disabled = zoomIdx === ZOOM_LEVELS.length - 1;

    const maxX = Math.max(0, size - scrollBox.clientWidth);
    const maxY = Math.max(0, size - scrollBox.clientHeight);
    const offX = innerOffset(size, scrollBox.clientWidth);
    const offY = innerOffset(size, scrollBox.clientHeight);
    scrollBox.scrollLeft = Math.max(0, Math.min(maxX, cx * after + offX - px));
    scrollBox.scrollTop = Math.max(0, Math.min(maxY, cy * after + offY - py));
  }

  zoomInBtn.addEventListener("click", () => {
    const r = scrollBox.getBoundingClientRect();
    zoomAt(zoomIdx + 1, r.left + r.width / 2, r.top + r.height / 2);
  });
  zoomOutBtn.addEventListener("click", () => {
    const r = scrollBox.getBoundingClientRect();
    zoomAt(zoomIdx - 1, r.left + r.width / 2, r.top + r.height / 2);
  });
  zoomFitBtn.addEventListener("click", () => {
    // 选不超过可视区的最大倍率
    const fit = Math.floor(Math.min(scrollBox.clientWidth, scrollBox.clientHeight) / N);
    let idx = 0;
    for (let i = 0; i < ZOOM_LEVELS.length; i++) {
      if (ZOOM_LEVELS[i] <= fit) idx = i;
    }
    const r = scrollBox.getBoundingClientRect();
    zoomAt(idx, r.left + r.width / 2, r.top + r.height / 2);
  });

  // 滚轮缩放（必须 passive:false 才能阻止页面滚动）
  scrollBox.addEventListener("wheel", e => {
    e.preventDefault();
    zoomAt(zoomIdx + (e.deltaY < 0 ? 1 : -1), e.clientX, e.clientY);
  }, { passive: false });

  // 工具栏抓手模式切换
  function syncPanUI() {
    scrollBox.classList.toggle("pan", panning());
    panModeBtn.classList.toggle("active", panning());
    panModeBtn.textContent = panning() ? "✋ 拖动" : "✏️ 画笔";
  }
  panModeBtn.addEventListener("click", () => {
    panMode = !panMode;
    syncPanUI();
  });

  // 按住空格临时抓手（输入框 / 按钮上不触发，避免误触）
  function editableTarget(t) {
    return t && (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName) || t.isContentEditable);
  }
  document.addEventListener("keydown", e => {
    if (e.code !== "Space" || spacePan || panelPixel.hidden) return;
    if (editableTarget(e.target)) return;
    spacePan = true;
    syncPanUI();
    e.preventDefault();
  });
  document.addEventListener("keyup", e => {
    if (e.code !== "Space" || !spacePan) return;
    spacePan = false;
    syncPanUI();
  });
  window.addEventListener("blur", () => {
    if (spacePan) { spacePan = false; syncPanUI(); }
  });

  /* ---------- 提交 ---------- */
  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushNow, FLUSH_MS);
  }

  async function flushNow() {
    clearTimeout(flushTimer);
    if (!pending.length) return;
    const batch = pending.splice(0, BATCH);
    try {
      const res = await fetch("/api/pixel?t=" + Date.now(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixels: batch }),
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (typeof data.v === "number") remoteV = Math.max(remoteV, data.v);
        statusEl.textContent = "已保存 ✓";
        if (pending.length) scheduleFlush();
      } else if (res.status === 401) {
        pending = batch.concat(pending); // 未同步成功，放回队列
        showLoginMask();
        showToast("请先登录后再画");
      } else {
        pending = batch.concat(pending);
        statusEl.textContent = "保存失败，将重试…";
        scheduleFlush();
      }
    } catch {
      pending = batch.concat(pending);
      scheduleFlush();
    }
  }

  /* ---------- 拉取远端 ---------- */
  async function pullRemote() {
    if (panelPixel.hidden || drawing || pending.length) return;
    try {
      const res = await fetch("/api/pixel?t=" + Date.now(), { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!data) return;
      if (data.v > remoteV) {
        remoteV = data.v;
        grid = rleDecode(data.data || "");
        renderAll();
      }
    } catch { /* 静默，下轮再试 */ }
  }

  /* ---------- 登录态 ---------- */
  function showLoginMask() {
    mask.hidden = !!me;
  }
  window.addEventListener("auth-user", e => {
    me = e.detail;
    showLoginMask();
    if (me) statusEl.textContent = "选个颜色开始画吧";
  });
  loginBtn?.addEventListener("click", () => {
    if (typeof openAuthModal === "function") openAuthModal();
  });

  /* ---------- tab 切换 ---------- */
  function switchTab(name, writeHash) {
    const isPixel = name === "pixel";
    tabBtnText.classList.toggle("active", !isPixel);
    tabBtnPixel.classList.toggle("active", isPixel);
    panelText.hidden = isPixel;
    panelPixel.hidden = !isPixel;
    if (writeHash !== false) {
      history.replaceState(null, "", "#" + (isPixel ? "pixel" : "text"));
    }
    if (isPixel) initPixel();
  }
  tabBtnText.addEventListener("click", () => switchTab("text"));
  tabBtnPixel.addEventListener("click", () => switchTab("pixel"));
  window.addEventListener("hashchange", () => {
    switchTab(location.hash === "#pixel" ? "pixel" : "text", false);
  });

  async function initPixel() {
    if (inited) return;
    inited = true;
    // 初始白底
    for (let i = 0; i < TOTAL; i++) paintIndex(i, 0);
    renderAll();
    applyZoom();
    syncPanUI();
    me = await Auth.currentUser();
    showLoginMask();
    await pullRemote();
    statusEl.textContent = me ? "选个颜色开始画吧" : "登录后可以一起画";
    pollTimer = setInterval(pullRemote, POLL_MS);
  }

  /* ---------- 启动 ---------- */
  buildPalette();
  switchTab(location.hash === "#pixel" ? "pixel" : "text", false);
})();
