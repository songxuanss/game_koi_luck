/** 有界幂等去重：最近 capacity 个键内重复的只放行一次。 */
export class Deduper {
  private readonly seen = new Map<string, true>();

  constructor(private readonly capacity = 50_000) {}

  /** 首次见到返回 true；重复返回 false。 */
  admit(key: string): boolean {
    if (this.seen.has(key)) return false;
    this.seen.set(key, true);
    if (this.seen.size > this.capacity) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return true;
  }

  get size(): number {
    return this.seen.size;
  }
}
