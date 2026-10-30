import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractLiterals, scan } from '../scan-wordlist';

function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'scan-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

describe('wordlist scanner', () => {
  it('flags banned words in string literals with the right line, ignoring comments and identifiers', () => {
    const dir = fixtureDir({
      'a.ts': `// 这里提到抽奖只是注释\nconst gameState = 1;\nconst ok = '正常文案';\nconst bad = \`今天来抽奖 \${ok}\`;\n`,
    });
    const { hits } = scan([dir], dir);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ file: 'a.ts', line: 4, term: '抽奖', kind: 'string' });
  });

  it('flags JSON values and file names', () => {
    const dir = fixtureDir({ 'cfg.json': '{\n "title": "盲盒",\n "ok": "锦鲤"\n}', '抽奖图标.png': 'x' });
    const { hits } = scan([dir], dir);
    expect(hits.map((h) => `${h.kind}:${h.term}`).sort()).toEqual(['filename:抽奖', 'json:盲盒']);
  });

  it('picks up newly appended banned words immediately (wordlist is data)', () => {
    // 词表是 shared 内的数据文件：此处验证扫描器没有任何内置词
    const dir = fixtureDir({ 'a.ts': "const x = '锦鲤';" });
    expect(scan([dir], dir).hits).toHaveLength(0);
  });

  it('extracts literals across escapes and nested template expressions', () => {
    const lits = extractLiterals("const a = 'it\\'s';\nconst b = `x ${'y'} z`;");
    expect(lits.map((l) => l.text)).toContain("it's");
    expect(lits.map((l) => l.text.trim())).toContain('x   z');
  });
});

import { paginate } from '../softcopyright-pdf';

describe('softcopyright pagination', () => {
  it('takes first and last 30 pages when the source is long', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `line ${i}`);
    const { pages, total, truncated } = paginate(lines, 50, 30);
    expect(total).toBe(100);
    expect(truncated).toBe(true);
    expect(pages).toHaveLength(60);
    expect(pages[0]![0]).toBe('line 0');
    expect(pages[59]!.at(-1)).toBe('line 4999');
    expect(pages.every((p) => p.length === 50)).toBe(true);
  });

  it('keeps everything when under 60 pages', () => {
    expect(paginate(Array.from({ length: 120 }, String), 50, 30).pages).toHaveLength(3);
  });
});

describe('softcopyright last page', () => {
  it('keeps the final page full (>=15 lines) when truncating', () => {
    const lines = Array.from({ length: 5003 }, (_, i) => `line ${i}`);
    const { pages } = paginate(lines, 50, 30);
    expect(pages).toHaveLength(60);
    expect(pages.at(-1)!.length).toBe(50);
    expect(pages.at(-1)!.at(-1)).toBe('line 5002');
  });
});
