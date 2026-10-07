/* =====================================================
 * XRST.Uk ·「偷还是分？」纯游戏逻辑（无运行时依赖，可直接 node 测试）
 *
 * 选择：'split'（分） | 'steal'（偷） | null（本轮未决定=放弃）
 * 计分：
 *   分-分  双方 +1
 *   分-偷  偷的一方 +2，分的一方 +0
 *   偷-偷  双方 -1
 *   弃权   未决定者不得分，对方 +1；双方都未决定则各 +1
 * 结算（所有百分数向下取整）：
 *   平分且分数非 0 → 各得 floor(奖池*0.8)
 *   平分且分数为 0 → 各得 floor(自己投入*0.8)
 *   否则胜者拿走奖池全部
 * ===================================================== */

export const SPLIT = "split";
export const STEAL = "steal";
export const ROUNDS = 10;
export const ROUND_MS = 30_000;
export const REVEAL_MS = 4_000;
export const QUEUE_FILL_MS = 5_000;
export const BOT_COUNT = 11;

/* 单轮得分增量。c1/c2 为 null 表示该方超时弃权 */
export function scoreRound(c1, c2) {
  if (c1 === null && c2 === null) return [1, 1];
  if (c1 === null) return [0, 1];
  if (c2 === null) return [1, 0];
  if (c1 === SPLIT && c2 === SPLIT) return [1, 1];
  if (c1 === STEAL && c2 === SPLIT) return [2, 0];
  if (c1 === SPLIT && c2 === STEAL) return [0, 2];
  return [-2, -2]; // steal-steal
}

/* 终局结算 → [p1 所得, p2 所得] */
export function settle(s1, s2, a1, a2) {
  const pool = a1 + a2;
  if (s1 === s2) {
    if (s1 === 0) return [Math.floor(a1 * 0.8), Math.floor(a2 * 0.8)];
    const x = Math.floor(pool * 0.8);
    return [x, x];
  }
  return s1 > s2 ? [Math.floor(pool * 1.2), 0] : [0, Math.floor(pool * 1.2)];
}

/* 人机策略
 * type      1..11
 * r0        当前回合（0 基）
 * hist      人类玩家此前每一轮的选择（数组，长度 r0）
 * current   人类本轮的已提交选择（6 号人机前 3 轮要"和你选的一样"）
 * fixed4    4 号人机开局定死的全偷/全分
 * 返回 null 表示本轮暂不决定（不存在，保留参数位）
 */
export function botChoice(type, r0, hist, current = null, fixed4 = STEAL) {
  switch (Number(type)) {
    case 1: // 完全随机
      return Math.random() < 0.5 ? SPLIT : STEAL;
    case 2: // 照抄你上一次，首次分（你上轮弃权则当分处理）
      return r0 === 0 ? SPLIT : (hist[r0 - 1] || SPLIT);
    case 3: // 前 4 次同 2 号，之后全偷
      if (r0 < 4) return r0 === 0 ? SPLIT : (hist[r0 - 1] || SPLIT);
      return STEAL;
    case 4: // 50% 全偷 / 50% 全分（开局定死）
      return fixed4;
    case 5: // 偷-分轮换（首轮偷）
      return r0 % 2 === 0 ? STEAL : SPLIT;
    case 6: // 前 3 轮必定和你一样，之后同 2 号
      if (r0 < 3) return current || SPLIT;
      return hist[r0 - 1] || SPLIT;
    case 7: // 一直分，你偷过一次后一直偷
      return hist.includes(STEAL) ? STEAL : SPLIT;
    case 8: // 一直偷，你分过一次后一直分
      return hist.includes(SPLIT) ? SPLIT : STEAL;
    case 9: // 和你前一次的前一次相同，前两轮分
      return r0 < 2 ? SPLIT : (hist[r0 - 2] || SPLIT);
    case 10: // 偷-偷-分
      return [STEAL, STEAL, SPLIT][r0 % 3];
    case 11: // 分-分-偷
      return [SPLIT, SPLIT, STEAL][r0 % 3];
    default:
      return SPLIT;
  }
}

/* 人机介绍（大厅展示用） */
export const BOT_INFO = [
  { id: 1, name: "乱乱", desc: "每轮完全随机，谁也猜不透" },
  { id: 2, name: "复读机", desc: "永远照抄你上一轮，第一轮先分" },
  { id: 3, name: "笑面虎", desc: "前 4 轮学复读机，之后刀刀偷" },
  { id: 4, name: "一根筋", desc: "要么全程偷，要么全程分，五五开" },
  { id: 5, name: "摇摆怪", desc: "偷一轮分一轮，首轮必偷" },
  { id: 6, name: "镜子", desc: "前 3 轮和你选得一模一样，之后复读" },
  { id: 7, name: "记仇鬼", desc: "一直分，你偷一次后永远偷" },
  { id: 8, name: "软心肠", desc: "一直偷，你分一次后永远分" },
  { id: 9, name: "慢半拍", desc: "学你上两轮的选择，前两轮先分" },
  { id: 10, name: "三连偷", desc: "偷-偷-分，无限循环" },
  { id: 11, name: "三分暖", desc: "分-分-偷，无限循环" },
];
