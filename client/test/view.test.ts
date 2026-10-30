import { beforeEach, describe, expect, it } from 'vitest';
import { Graphics, Label, Node, UITransform, mockResources } from 'cc';
import { findBanned } from '../assets/scripts/generated/shared';
import { JinliMain } from '../assets/scripts/view/JinliMain';
import douyin from '../assets/resources/profiles/douyin-375x812.json';
import wide from '../assets/resources/profiles/test-wide.json';

beforeEach(() => {
  mockResources['profiles/douyin-375x812'] = douyin;
  mockResources['profiles/test-wide'] = wide;
});

function boot(profileName: string, speed = 20): { main: JinliMain; g: Graphics; labels: Map<string, Label>; canvas: { width: number; height: number } } {
  const root = new Node('Canvas');
  const main = root.addComponent(JinliMain);
  main.profileName = profileName;
  main.mode = 'demo';
  main.demoSpeed = speed;
  main.start();
  const g = root.children.find((c) => c.name === 'graphics')!.getComponent(Graphics)!;
  const labels = new Map<string, Label>();
  for (const c of root.children) {
    const l = c.getComponent(Label);
    if (l) labels.set(c.name, l);
  }
  const ui = root.getComponent(UITransform)!;
  return { main, g, labels, canvas: { width: ui.width, height: ui.height } };
}

function run(main: JinliMain, seconds: number, onFrame?: () => void): void {
  for (let i = 0; i < seconds * 60; i++) {
    main.update(1 / 60);
    onFrame?.();
  }
}

describe('JinliMain (executed against the cc behavioural fake)', () => {
  it('builds the UI from the layout profile: canvas size, graphics node, 9 labels', () => {
    const { labels, canvas } = boot('douyin-375x812');
    expect(canvas).toEqual({ width: 375, height: 812 });
    expect([...labels.keys()].sort()).toEqual(['banner', 'countdown', 'dev', 'feed', 'phase', 'rank', 'rule', 'sideA', 'sideB']);
  });

  it('survives 6 virtual minutes of frames and shows phase, countdown, DEV watermark and rule text', () => {
    const { main, labels } = boot('douyin-375x812');
    const phases = new Set<string>();
    run(main, 18, () => phases.add(labels.get('phase')!.string.split(' · ')[0]!));
    expect([...phases]).toEqual(expect.arrayContaining(['蓄势', '攻防']));
    expect(labels.get('dev')!.string).toBe('DEV');
    expect(labels.get('rule')!.string).toContain('锦鲤');
    expect(labels.get('sideA')!.string).toMatch(/^锦鲤 \d+%/);
    expect(labels.get('sideB')!.string).toMatch(/^神龟 \d+%/);
  });

  it('keeps every drawn shape and every label inside the canvas', () => {
    const { main, g, labels, canvas } = boot('douyin-375x812');
    const halfW = canvas.width / 2;
    const halfH = canvas.height / 2;
    run(main, 40, () => {
      for (const c of g.calls) {
        if (c.op === 'rect') {
          const [x, y, w, h] = c.args as [number, number, number, number];
          expect(x).toBeGreaterThanOrEqual(-halfW - 1e-6);
          expect(x + w).toBeLessThanOrEqual(halfW + 1e-6);
          expect(y).toBeGreaterThanOrEqual(-halfH - 1e-6);
          expect(y + h).toBeLessThanOrEqual(halfH + 1e-6);
        }
      }
      for (const l of labels.values()) {
        expect(Math.abs(l.node.position.x)).toBeLessThanOrEqual(halfW);
        expect(Math.abs(l.node.position.y)).toBeLessThanOrEqual(halfH);
      }
    });
    expect(g.calls.length).toBeGreaterThan(5);
  });

  it('switching the profile name re-lays out the UI with zero code change (rank panel moves, DEV mark moves)', () => {
    const a = boot('douyin-375x812');
    const b = boot('test-wide');
    run(a.main, 3);
    run(b.main, 3);
    expect(b.canvas).toEqual({ width: 540, height: 960 });
    expect(a.labels.get('rank')!.node.position.x).toBeLessThan(0);
    expect(b.labels.get('rank')!.node.position.x).toBeGreaterThan(0);
    expect(a.labels.get('dev')!.node.position.x).toBeGreaterThan(0);
    expect(b.labels.get('dev')!.node.position.x).toBeLessThan(0);
  });

  it('never puts a banned word or a money unit on screen across a whole session', () => {
    const { main, labels } = boot('douyin-375x812', 30);
    run(main, 60, () => {
      for (const [k, l] of labels) {
        expect(findBanned(l.string), `${k}: ${l.string}`).toEqual([]);
        expect(l.string).not.toMatch(/[元￥¥]|抖币/);
      }
    });
  });

  it('shows a settlement banner at the end of a match', () => {
    const { main, labels } = boot('douyin-375x812', 40);
    const banners = new Set<string>();
    run(main, 90, () => banners.add(labels.get('banner')!.string));
    expect([...banners].some((b) => /获胜|平分秋色/.test(b))).toBe(true);
  });

  it('does not throw before the profile resource is available, and reports a missing profile', () => {
    delete mockResources['profiles/nope'];
    const root = new Node('Canvas');
    const main = root.addComponent(JinliMain);
    main.profileName = 'nope';
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    try {
      main.start();
      main.update(0.016);
    } finally {
      console.error = orig;
    }
    expect(errors).toHaveLength(1);
  });
});
