/**
 * 合规词表扫描器（CI 门禁）：扫描代码内文案（TS 字符串/模板字面量）、JSON 配置值、全部文件名。
 * 命中禁用词输出 文件:行号 并 exit 1。词表来自 packages/shared（单一数据源），追加即生效。
 *
 *   npm run scan                 # 扫描整个仓库
 *   npm run scan -- <path...>    # 扫描指定路径（夹具测试用）
 *   npm run scan -- --json=artifacts/verification/scan-result.json
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { findBanned } from '../packages/shared/src/text-filter';

export const ROOT = resolve(import.meta.dirname, '..');

/** 不扫描的目录/文件（内部工程语言、文档、生成物、词表本身、故意含禁用词的测试）。 */
export const IGNORE = [
  'node_modules', 'package-lock.json', '.git', 'artifacts', 'dist', 'docs', 'openspec', '.opencode', '.github',
  'client/library', 'client/temp', 'client/local', 'client/build', 'client/profiles',
  'packages/shared/src/wordlist-data.ts',
  'client/assets/scripts/generated/shared/wordlist-data.ts',
];
const IGNORE_DIR_NAMES = new Set(['test', 'fixtures']);
const TEXT_EXT = new Set(['.ts', '.json', '.txt', '.html', '.yml', '.yaml']);

export interface ScanHit {
  file: string;
  line: number;
  term: string;
  category: string;
  kind: 'string' | 'json' | 'filename' | 'text';
  excerpt: string;
}

export interface Literal {
  text: string;
  line: number;
}

/** 提取 TS 源码中的字符串与模板字面量（跳过注释与正则字面量之外的代码）。 */
export function extractLiterals(src: string): Literal[] {
  const out: Literal[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === '\n') {
      line++;
      i++;
    } else if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++;
        i++;
      }
      i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      const startLine = line;
      let text = '';
      i++;
      let depth = 0;
      while (i < n) {
        const ch = src[i]!;
        if (ch === '\\') {
          text += src[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (ch === '\n') line++;
        if (c === '`' && ch === '$' && src[i + 1] === '{') {
          depth++;
          text += ' ';
          i += 2;
          continue;
        }
        if (c === '`' && depth > 0) {
          if (ch === '}') depth--;
          i++;
          continue;
        }
        if (ch === c) break;
        text += ch;
        i++;
      }
      i++;
      if (text.trim()) out.push({ text, line: startLine });
    } else {
      i++;
    }
  }
  return out;
}

function jsonStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) value.forEach((v) => jsonStrings(v, acc));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => jsonStrings(v, acc));
  return acc;
}

function lineOf(src: string, needle: string): number {
  const idx = src.indexOf(needle);
  return idx < 0 ? 1 : src.slice(0, idx).split('\n').length;
}

function isIgnored(rel: string): boolean {
  const norm = rel.split(sep).join('/');
  return IGNORE.some((p) => norm === p || norm.startsWith(`${p}/`));
}

export function walk(dir: string, root = ROOT, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(root, full);
    if (isIgnored(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!IGNORE_DIR_NAMES.has(name)) walk(full, root, acc);
    } else acc.push(full);
  }
  return acc;
}

export function scanFile(full: string, root = ROOT): ScanHit[] {
  const rel = relative(root, full).split(sep).join('/');
  const hits: ScanHit[] = [];
  const base = rel.split('/').pop() ?? rel;
  for (const h of findBanned(base.replace(/\.[^.]+$/, '').replace(/[-_.]/g, ' '))) {
    hits.push({ file: rel, line: 0, term: h.term, category: h.category, kind: 'filename', excerpt: base });
  }
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
  if (!TEXT_EXT.has(ext)) return hits;
  const src = readFileSync(full, 'utf8');
  if (ext === '.ts') {
    for (const lit of extractLiterals(src)) {
      for (const h of findBanned(lit.text)) hits.push({ file: rel, line: lit.line, term: h.term, category: h.category, kind: 'string', excerpt: lit.text.slice(0, 60) });
    }
  } else if (ext === '.json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(src);
    } catch {
      parsed = src;
    }
    for (const s of jsonStrings(parsed)) {
      for (const h of findBanned(s)) hits.push({ file: rel, line: lineOf(src, s), term: h.term, category: h.category, kind: 'json', excerpt: s.slice(0, 60) });
    }
  } else {
    src.split('\n').forEach((text, i) => {
      for (const h of findBanned(text)) hits.push({ file: rel, line: i + 1, term: h.term, category: h.category, kind: 'text', excerpt: text.slice(0, 60) });
    });
  }
  return hits;
}

export function scan(paths: string[], root = ROOT): { files: number; hits: ScanHit[] } {
  const files = paths.flatMap((p) => (statSync(p).isDirectory() ? walk(p, root) : [p]));
  return { files: files.length, hits: files.flatMap((f) => scanFile(f, root)) };
}

function main(): void {
  const args = process.argv.slice(2);
  const jsonOut = args.find((a) => a.startsWith('--json='))?.slice(7);
  const targets = args.filter((a) => !a.startsWith('--')).map((p) => resolve(p));
  const result = scan(targets.length ? targets : [ROOT]);
  if (jsonOut) {
    mkdirSync(dirname(resolve(jsonOut)), { recursive: true });
    writeFileSync(resolve(jsonOut), JSON.stringify({ ok: result.hits.length === 0, ...result }, null, 2));
  }
  if (result.hits.length === 0) {
    console.log(`wordlist scan: ${result.files} files, 0 hits`);
    return;
  }
  for (const h of result.hits) console.error(`${h.file}:${h.line}  [${h.category}] "${h.term}"  (${h.kind}) ${h.excerpt}`);
  console.error(`wordlist scan: ${result.hits.length} hit(s) in ${result.files} files`);
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
