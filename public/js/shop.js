/* =====================================================
 * 兑换商店目录（与 worker.js FRAME_SHOP/BUBBLE_SHOP 对应）
 * 价格仅用于展示，真正的扣款校验在服务端
 * ===================================================== */
(function () {
  const FRAMES = [
    { id: "f1", name: "经典金环", price: 30,  desc: "朴素的金色圆环" },
    { id: "f2", name: "冷冽银环", price: 20,  desc: "银白金属质感" },
    { id: "f3", name: "霓虹光环", price: 60,  desc: "会发光的青蓝光环" },
    { id: "f4", name: "彩虹流动", price: 100, desc: "旋转的彩虹渐变" },
    { id: "f5", name: "像素皇冠", price: 150, desc: "顶级身份象征" },
  ];
  const BUBBLES = [
    { id: "b1", name: "天空蓝", price: 30,  desc: "清爽天蓝气泡" },
    { id: "b2", name: "薄荷绿", price: 30,  desc: "清凉薄荷绿色" },
    { id: "b3", name: "樱花粉", price: 50,  desc: "粉色樱花物语" },
    { id: "b4", name: "暗夜紫", price: 80,  desc: "神秘深紫渐变" },
    { id: "b5", name: "流光金", price: 150, desc: "华贵金色流光" },
  ];
  window.XRST_SHOP = { FRAMES, BUBBLES };
})();
