import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../src');
const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));

describe('core purity (platform independence + determinism)', () => {
  it('imports only @jinli/shared or relative modules', () => {
    for (const f of files) {
      const src = readFileSync(join(SRC, f), 'utf8');
      const specs = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);
      for (const s of specs) expect(s === '@jinli/shared' || s.startsWith('./'), `${f} imports ${s}`).toBe(true);
    }
  });

  it('never reads the wall clock or a non-deterministic random source', () => {
    for (const f of files) {
      const code = readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/Date\.now|new Date\(|Math\.random|performance\.now|setTimeout|setInterval/);
    }
  });

  it('exposes no trade/transfer capability for random outputs (附录 C 法律层)', () => {
    for (const f of files) {
      const code = readFileSync(join(SRC, f), 'utf8');
      expect(code, f).not.toMatch(/\b(trade|transfer|exchange|redeem|withdraw|cashout)\w*\s*\(/i);
    }
  });
});
