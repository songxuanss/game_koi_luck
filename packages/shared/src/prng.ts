/**
 * 确定性伪随机：同一种子永远得到同一序列（对局可回放）。
 * core 禁用 Math.random()，所有"随机外观"均以事件幂等键为种子。
 */

/** FNV-1a 32 位字符串哈希。 */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32：返回 [0,1) 均匀分布的生成器。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 按权重确定性选取。weights 全为 0 时返回 0。 */
export function pickWeighted(weights: readonly number[], r: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let x = r * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i] ?? 0;
    if (x < 0) return i;
  }
  return weights.length - 1;
}
