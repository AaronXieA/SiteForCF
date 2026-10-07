/* =====================================================
 * 兑换商店目录（与 worker.js FRAME_SHOP/BUBBLE_SHOP 对应）
 * 价格仅用于展示，真正的扣款校验在服务端
 * f1-f8 / b1-b8：金币直购；fv1 / bv1：VIP 会员专属
 * ===================================================== */
(function () {
  const VIP_FRAME = "fv1";
  const VIP_BUBBLE = "bv1";
  const VIP_PRICE = 250; // 金币
  const VIP_DAYS = 30;   // 天

  const FRAMES = [
    { id: "f1", name: "经典金环", price: 30,  desc: "朴素的金色圆环" },
    { id: "f2", name: "冷冽银环", price: 20,  desc: "银白金属质感" },
    { id: "f3", name: "霓虹光环", price: 60,  desc: "会发光的青蓝光环" },
    { id: "f4", name: "彩虹流动", price: 100, desc: "旋转的彩虹渐变" },
    { id: "f5", name: "像素皇冠", price: 150, desc: "顶级身份象征" },
    { id: "f6", name: "草莓甜心", price: 80,  desc: "粉粉的草莓奶油圈" },
    { id: "f7", name: "翡翠龙鳞", price: 120, desc: "深绿龙鳞流光" },
    { id: "f8", name: "星尘幻境", price: 200, desc: "紫蓝星尘缓缓流转" },
    // VIP 专属（vip:true，不出售，会员期内可用）
    { id: VIP_FRAME, name: "至尊金冠", vip: true, desc: "VIP 专属 · 鎏金与紫罗兰的荣耀光环" },
  ];
  const BUBBLES = [
    { id: "b1", name: "天空蓝", price: 30,  desc: "清爽天蓝气泡" },
    { id: "b2", name: "薄荷绿", price: 30,  desc: "清凉薄荷绿色" },
    { id: "b3", name: "樱花粉", price: 50,  desc: "粉色樱花物语" },
    { id: "b4", name: "暗夜紫", price: 80,  desc: "神秘深紫渐变" },
    { id: "b5", name: "流光金", price: 150, desc: "华贵金色流光" },
    { id: "b6", name: "橘子汽水", price: 60,  desc: "活力橙，带气泡感" },
    { id: "b7", name: "黑金绅士", price: 120, desc: "黑金搭配，低调奢华" },
    { id: "b8", name: "莓果星云", price: 200, desc: "紫红星云渐变" },
    // VIP 专属
    { id: VIP_BUBBLE, name: "至尊鎏金", vip: true, desc: "VIP 专属 · 暗金流光聊天气泡" },
  ];

  /* 装扮 id 合法性（与服务端同步）：普通 1-8 或 VIP 款 */
  function isFrameId(id) { return /^f(?:[1-8]|v1)$/.test(id || ""); }
  function isBubbleId(id) { return /^b(?:[1-8]|v1)$/.test(id || ""); }

  window.XRST_SHOP = {
    FRAMES, BUBBLES,
    VIP_FRAME, VIP_BUBBLE, VIP_PRICE, VIP_DAYS,
    isFrameId, isBubbleId,
  };
})();
