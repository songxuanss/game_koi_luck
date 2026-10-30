/**
 * 词表过滤：命中检测、文本打码、昵称打码。纯函数、零依赖（客户端同步使用）。
 */
import { WORD_CATEGORIES, type WordCategory } from './wordlist-data';

export interface BannedHit {
  term: string;
  category: string;
  index: number;
  /** 命中的原文长度（UTF-16）。 */
  length: number;
}

interface CompiledList {
  zh: { term: string; category: string }[];
  en: { re: RegExp; term: string; category: string }[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function compileWordlist(categories: WordCategory[] = WORD_CATEGORIES): CompiledList {
  const zh: CompiledList['zh'] = [];
  const en: CompiledList['en'] = [];
  for (const c of categories) {
    for (const term of c.zh) zh.push({ term, category: c.id });
    for (const term of c.en) {
      const body = escapeRegExp(term).replace(/ /g, '[\\s_-]?');
      en.push({ re: new RegExp(`(?<![A-Za-z])${body}(?![A-Za-z])`, 'gi'), term, category: c.id });
    }
  }
  return { zh, en };
}

const DEFAULT_LIST = compileWordlist();

/** 找出文本中所有禁用词命中（按出现位置排序）。 */
export function findBanned(text: string, list: CompiledList = DEFAULT_LIST): BannedHit[] {
  const hits: BannedHit[] = [];
  for (const { term, category } of list.zh) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(term, from);
      if (i < 0) break;
      hits.push({ term, category, index: i, length: term.length });
      from = i + term.length;
    }
  }
  for (const { re, term, category } of list.en) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      hits.push({ term, category, index: m.index, length: m[0].length });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** 把命中的禁用词逐字替换为 *。 */
export function maskText(text: string, list: CompiledList = DEFAULT_LIST): string {
  const chars = Array.from(text);
  // 以 UTF-16 下标定位，再映射到字符数组
  const offsets: number[] = [];
  let pos = 0;
  for (const ch of chars) {
    offsets.push(pos);
    pos += ch.length;
  }
  const masked = new Array<boolean>(chars.length).fill(false);
  for (const hit of findBanned(text, list)) {
    const end = hit.index + hit.length;
    chars.forEach((_, i) => {
      const o = offsets[i] ?? 0;
      if (o >= hit.index && o < end) masked[i] = true;
    });
  }
  return chars.map((ch, i) => (masked[i] ? '*' : ch)).join('');
}

export const NICK_MAX_CHARS = 10;
export const NICK_FALLBACK = '水友';

/**
 * 昵称上屏前处理：命中禁用词 → 保留命中前最多 2 个字 + "**"；过长截断。
 * 原始昵称不得出现在任何展示路径。
 */
export function maskNick(nick: string, list: CompiledList = DEFAULT_LIST): string {
  const trimmed = nick.trim();
  if (trimmed.length === 0) return NICK_FALLBACK;
  if (findBanned(trimmed, list).length > 0) {
    const masked = maskText(trimmed, list);
    const prefix = Array.from(masked.split('*')[0] ?? '').slice(0, 2).join('');
    return `${prefix || NICK_FALLBACK}**`;
  }
  const chars = Array.from(trimmed);
  return chars.length > NICK_MAX_CHARS ? `${chars.slice(0, NICK_MAX_CHARS).join('')}…` : trimmed;
}
