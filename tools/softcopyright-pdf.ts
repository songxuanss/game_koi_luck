/**
 * 软著源代码 PDF 排版（任务 6.1，D1 交付件）。
 * 规范：A4 纵向；页眉=软件全称+版本；页脚=著作权人；右上角页码；每页 50 行；
 * 去空行；前 30 页 + 后 30 页（不足 60 页则全量）。默认排除 V0 专用的 local-grab 与生成物（R3b）。
 *
 *   npm run softcopyright                       # 输出 artifacts/softcopyright/source-code.pdf
 *   npm run softcopyright -- --config=path.json --out=path.pdf
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import PDFDocument from 'pdfkit';

const ROOT = resolve(import.meta.dirname, '..');

export interface SoftCopyrightConfig {
  softwareName: string;
  version: string;
  owner: string;
  include: string[];
  exclude: string[];
  linesPerPage: number;
  pagesEachEnd: number;
  font: string;
  fontFamily: string;
}

export function collectFiles(cfg: SoftCopyrightConfig, root = ROOT): string[] {
  const excluded = cfg.exclude.map((e) => resolve(root, e));
  const out: string[] = [];
  const visit = (p: string) => {
    if (excluded.some((e) => p === e || p.startsWith(e + '/'))) return;
    const st = statSync(p);
    if (st.isDirectory()) readdirSync(p).sort().forEach((n) => visit(join(p, n)));
    else if (p.endsWith('.ts')) out.push(p);
  };
  for (const inc of cfg.include) if (existsSync(resolve(root, inc))) visit(resolve(root, inc));
  return out;
}

/** 有效代码行：去空行；行首加相对路径标记不计入（仅文件首行带路径注释）。 */
export function collectLines(files: string[], root = ROOT): string[] {
  const lines: string[] = [];
  for (const f of files) {
    lines.push(`// ${relative(root, f)}`);
    for (const l of readFileSync(f, 'utf8').split('\n')) {
      const t = l.replace(/\s+$/, '').replace(/\t/g, '  ');
      if (t.trim() !== '') lines.push(t);
    }
  }
  return lines;
}

export function paginate(lines: string[], perPage: number, endPages: number): { pages: string[][]; total: number; truncated: boolean } {
  const all: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) all.push(lines.slice(i, i + perPage));
  if (all.length <= endPages * 2) return { pages: all, total: all.length, truncated: false };
  // 后 30 页从文末倒着切，保证结束页是满页（登记规范：结束页 ≥15 行）
  const tail: string[][] = [];
  for (let end = lines.length; tail.length < endPages; end -= perPage) tail.unshift(lines.slice(end - perPage, end));
  return { pages: [...all.slice(0, endPages), ...tail], total: all.length, truncated: true };
}

async function render(cfg: SoftCopyrightConfig, pages: string[][], outPath: string): Promise<void> {
  mkdirSync(dirname(outPath), { recursive: true });
  const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 }, autoFirstPage: false });
  const stream = createWriteStream(outPath);
  doc.pipe(stream);
  doc.registerFont('cjk', cfg.font, cfg.fontFamily);
  const header = `${cfg.softwareName} ${cfg.version}`;
  const lineH = (842 - 56 - 48) / cfg.linesPerPage;
  pages.forEach((lines, idx) => {
    doc.addPage();
    doc.font('cjk').fontSize(9);
    doc.text(header, 48, 28, { width: 400, lineBreak: false });
    doc.text(String(idx + 1), 595 - 48 - 60, 28, { width: 60, align: 'right', lineBreak: false });
    doc.moveTo(48, 44).lineTo(595 - 48, 44).lineWidth(0.5).stroke();
    doc.fontSize(7.5);
    lines.forEach((l, i) => doc.text(l, 48, 56 + i * lineH, { width: 595 - 96, lineBreak: false }));
    doc.fontSize(8).text(cfg.owner, 48, 842 - 34, { width: 595 - 96, align: 'center', lineBreak: false });
  });
  doc.end();
  await new Promise<void>((r) => stream.on('finish', () => r()));
}

async function main(): Promise<void> {
  const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const cfgPath = resolve(arg('config') ?? join(ROOT, 'tools/softcopyright.config.json'));
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as SoftCopyrightConfig;
  const out = resolve(arg('out') ?? join(ROOT, 'artifacts/softcopyright/source-code.pdf'));
  const files = collectFiles(cfg);
  const lines = collectLines(files);
  const { pages, total, truncated } = paginate(lines, cfg.linesPerPage, cfg.pagesEachEnd);
  await render(cfg, pages, out);
  console.log(`softcopyright: ${files.length} files, ${lines.length} lines, ${total} pages total -> ${pages.length} pages${truncated ? ' (first/last 30)' : ''}\n  ${out}`);
  if (lines.length < 3000) console.warn(`WARNING: ${lines.length} lines < 3000 (软著要求源程序 ≥3000 行)`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) void main();
