/*!
 * fsrs.js — FSRS-5 调度核心（零依赖）
 *
 * 自评三档映射：
 *   1 = 不认识 / 完全没想起来  → Again
 *   2 = 模糊   / 想了半天才想起 → Hard
 *   3 = 认识   / 秒答          → Good
 *   4 = 太简单（可选，设置里开启四档时用）→ Easy
 *
 * 用法：
 *   const card = FSRS.newCard();
 *   FSRS.schedule(card, 3, Date.now(), { retention: 0.9 });
 *   card.dueAt  // 下次该复习的时间戳
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FSRS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── 常量 ────────────────────────────────────────────────
  const DECAY = -0.5;
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // = 19/81 ≈ 0.2346
  const DAY = 86400000;
  const MIN = 60000;
  const S_MIN = 0.01;
  const MAX_INTERVAL = 36500;

  // FSRS-5 官方默认参数（19 个）
  const W = [
    0.40255, 1.18385, 3.173, 15.69105, 7.1949,
    0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
    1.01925, 1.9395, 0.11, 0.29605, 2.2698,
    0.2315, 2.9898, 0.51655, 0.6621
  ];

  // 当天内的小步骤（学习阶段）
  const STEP_AGAIN = 1 * MIN;
  const STEP_HARD = 5 * MIN;
  const STEP_RELEARN = 10 * MIN;

  const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

  // ── 基础公式 ────────────────────────────────────────────
  function initStability(g) {
    return Math.max(W[g - 1], 0.1);
  }

  function initDifficulty(g) {
    return clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
  }

  /** 可提取性：距上次复习 elapsedDays 天后，还记得的概率 */
  function retrievability(elapsedDays, s) {
    if (!(s > 0)) return 0;
    return Math.pow(1 + FACTOR * elapsedDays / s, DECAY);
  }

  /** 稳定性 → 间隔天数。retention 默认 0.9（此时 interval ≈ stability） */
  function intervalFromStability(s, retention) {
    const r = retention == null ? 0.9 : retention;
    const iv = (s / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
    return clamp(Math.round(iv), 1, MAX_INTERVAL);
  }

  function linearDamping(deltaD, oldD) {
    return deltaD * (10 - oldD) / 9;
  }

  function nextDifficulty(d, g) {
    const deltaD = -W[6] * (g - 3);
    const damped = d + linearDamping(deltaD, d);
    const reverted = W[7] * initDifficulty(4) + (1 - W[7]) * damped;
    return clamp(reverted, 1, 10);
  }

  function nextRecallStability(d, s, r, g) {
    const hardPenalty = g === 2 ? W[15] : 1;
    const easyBonus = g === 4 ? W[16] : 1;
    return s * (1 +
      Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) *
      (Math.exp((1 - r) * W[10]) - 1) * hardPenalty * easyBonus);
  }

  function nextForgetStability(d, s, r) {
    return W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) *
      Math.exp((1 - r) * W[14]);
  }

  function shortTermStability(s, g) {
    return s * Math.exp(W[17] * (g - 3 + W[18]));
  }

  // ── 卡片 ────────────────────────────────────────────────
  function newCard() {
    return {
      state: 'new',   // new | learning | review | relearning
      stability: 0,
      difficulty: 0,
      dueAt: 0,
      lastReview: 0,
      reps: 0,
      lapses: 0
    };
  }

  /**
   * 评分并推进卡片（原地修改并返回）
   * @param {object} card
   * @param {1|2|3|4} rating
   * @param {number} now 时间戳(ms)
   * @param {{retention?:number}} [opts]
   */
  function schedule(card, rating, now, opts) {
    now = (now == null) ? Date.now() : now;
    const retention = (opts && opts.retention) || 0.9;
    const g = clamp(rating | 0, 1, 4);

    if (card.state === 'new') {
      card.stability = Math.max(initStability(g), S_MIN);
      card.difficulty = initDifficulty(g);
      card.reps = 1;
      card.lastReview = now;

      if (g === 1) {
        card.state = 'learning';
        card.dueAt = now + STEP_AGAIN;
      } else if (g === 2) {
        card.state = 'learning';
        card.dueAt = now + STEP_HARD;
      } else {
        card.state = 'review';
        card.dueAt = now + intervalFromStability(card.stability, retention) * DAY;
      }
      return card;
    }

    // 已学过的卡
    const last = (card.lastReview == null) ? now : card.lastReview;
    const elapsedDays = Math.max(0, (now - last) / DAY);
    const r = retrievability(elapsedDays, card.stability);
    const sameDay = elapsedDays < 1;

    if (g === 1) {
      card.stability = Math.max(nextForgetStability(card.difficulty, card.stability, r), S_MIN);
      if (!sameDay || card.state === 'review') {
        card.state = 'relearning';
        card.dueAt = now + STEP_RELEARN;
      } else {
        card.dueAt = now + STEP_AGAIN;
      }
      card.lapses = (card.lapses || 0) + 1;
    } else {
      if (sameDay && (card.state === 'learning' || card.state === 'relearning')) {
        card.stability = Math.max(shortTermStability(card.stability, g), S_MIN);
      } else {
        card.stability = Math.max(nextRecallStability(card.difficulty, card.stability, r, g), S_MIN);
      }
      card.state = 'review';
      card.dueAt = now + intervalFromStability(card.stability, retention) * DAY;
    }

    card.difficulty = nextDifficulty(card.difficulty, g);
    card.lastReview = now;
    card.reps = (card.reps || 0) + 1;
    return card;
  }

  /** 不修改卡片，只预览这次评分会排到多久之后（毫秒） */
  function preview(card, rating, now, opts) {
    const copy = Object.assign({}, card);
    const t = (now == null) ? Date.now() : now;
    schedule(copy, rating, t, opts);
    return copy.dueAt - t;
  }

  // ── 展示辅助 ────────────────────────────────────────────
  function humanizeDuration(ms) {
    if (ms < MIN) return '马上';
    if (ms < 60 * MIN) return Math.round(ms / MIN) + ' 分钟';
    if (ms < DAY) return Math.round(ms / (60 * MIN)) + ' 小时';
    const d = ms / DAY;
    if (d < 30) return Math.round(d) + ' 天';
    if (d < 365) return (d / 30).toFixed(1).replace(/\.0$/, '') + ' 个月';
    return (d / 365).toFixed(1).replace(/\.0$/, '') + ' 年';
  }

  /** 处于「今天内还要再看」的状态 */
  function isShortTerm(card) {
    return card.state === 'learning' || card.state === 'relearning';
  }

  return {
    DECAY, FACTOR, DAY, MIN, W,
    newCard, schedule, preview,
    initStability, initDifficulty, retrievability,
    intervalFromStability, nextDifficulty,
    nextRecallStability, nextForgetStability, shortTermStability,
    humanizeDuration, isShortTerm
  };
});
