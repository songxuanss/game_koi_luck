import { beforeEach, describe, expect, it } from 'vitest';
import { Font, Graphics, Label, Node, Sprite, SpriteFrame, Texture2D, UITransform, mockResources, view } from 'cc';
import { findBanned } from '../assets/scripts/generated/shared';
import { ART_FONT_PATH, ART_SPRITE_PATHS } from '../assets/scripts/view/art';
import { JinliMain } from '../assets/scripts/view/JinliMain';
import douyin from '../assets/resources/profiles/douyin-375x812.json';
import wide from '../assets/resources/profiles/test-wide.json';

beforeEach(() => {
  mockResources['profiles/douyin-375x812'] = douyin;
  mockResources['profiles/test-wide'] = wide;
  for (const path of Object.values(ART_SPRITE_PATHS)) mockResources[path] = new Texture2D();
  mockResources[ART_FONT_PATH] = new Font();
});

function boot(profileName: string, speed = 20): { main: JinliMain; root: Node; g: Graphics; labels: Map<string, Label>; canvas: { width: number; height: number } } {
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
    if (l && !c.name.startsWith('float-')) labels.set(c.name, l);
  }
  const ui = root.getComponent(UITransform)!;
  return { main, root, g, labels, canvas: { width: ui.width, height: ui.height } };
}

function run(main: JinliMain, seconds: number, onFrame?: () => void): void {
  for (let i = 0; i < seconds * 60; i++) {
    main.update(1 / 60);
    onFrame?.();
  }
}

describe('JinliMain (executed against the cc behavioural fake)', () => {
  it('builds the night-river UI from the layout profile with static and dynamic layers', () => {
    const { labels, canvas, root } = boot('douyin-375x812');
    expect(canvas).toEqual({ width: 375, height: 812 });
    expect(view.designResolution).toMatchObject({ width: 375, height: 812 });
    expect([...labels.keys()].sort()).toEqual(['banner', 'chargeA', 'chargeB', 'cheers', 'countdown', 'dev', 'feed', 'gate', 'momentum', 'phase', 'phaseSub', 'rank', 'rule', 'settleDetail', 'sideA', 'sideB']);
    expect(root.children.find((c) => c.name === 'background')?.getComponent(Graphics)).toBeTruthy();
    expect(labels.get('phase')!.font).toBeInstanceOf(Font);
    expect(root.children.find((c) => c.name === 'koi-A-0')?.getComponent(Sprite)?.spriteFrame).toBeInstanceOf(SpriteFrame);
    expect(root.children.find((c) => c.name === 'backdrop-art')?.getComponent(UITransform)).toMatchObject({ width: 375, height: 812 });
    expect(root.children.find((c) => c.name === 'koi-A-0')?.getComponent(UITransform)).toMatchObject({ width: 36, height: 23 });
  });

  it('renders every engine update without frame-rate throttling artifacts', () => {
    const { main, g } = boot('douyin-375x812');
    run(main, 1);
    expect(g.clearCount).toBe(60);
    for (let i = 0; i < 36; i++) main.update(1 / 36);
    expect(g.clearCount).toBe(96);
  });

  it('animates koi sprites and surfaces gift progress as floating attribution', () => {
    const { main, root } = boot('douyin-375x812', 20);
    const koi = root.children.find((c) => c.name === 'koi-A-0')!;
    run(main, 1);
    const first = { ...koi.position };
    run(main, 1);
    expect({ ...koi.position }).not.toEqual(first);
    let attribution = false;
    run(main, 30, () => {
      for (const node of root.children) {
        if (node.name.startsWith('float-') && node.active && /^\+\d/.test(node.getComponent(Label)!.string)) attribution = true;
      }
    });
    expect(attribution).toBe(true);
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

  it('keeps shapes and labels inside the canvas without rebuilding static nodes', () => {
    const { main, root, g, labels, canvas } = boot('douyin-375x812');
    const background = root.children.find((c) => c.name === 'background')!.getComponent(Graphics)!;
    const nodeCount = root.children.length;
    const halfW = canvas.width / 2;
    const halfH = canvas.height / 2;
    run(main, 12, () => {
      for (const c of g.calls) {
        if (c.op === 'rect' || c.op === 'roundRect') {
          const [x, y, w, h] = c.args as [number, number, number, number];
          expect(x).toBeGreaterThanOrEqual(-halfW - 1e-6);
          expect(x + w).toBeLessThanOrEqual(halfW + 1e-6);
          expect(y).toBeGreaterThanOrEqual(-halfH - 1e-6);
          expect(y + h).toBeLessThanOrEqual(halfH + 1e-6);
        }
        if (c.op === 'circle' || c.op === 'ellipse') {
          const [x, y, rx, ry = rx] = c.args as [number, number, number, number?];
          expect(x - rx).toBeGreaterThanOrEqual(-halfW - 1e-6);
          expect(x + rx).toBeLessThanOrEqual(halfW + 1e-6);
          expect(y - ry).toBeGreaterThanOrEqual(-halfH - 1e-6);
          expect(y + ry).toBeLessThanOrEqual(halfH + 1e-6);
        }
      }
      for (const l of labels.values()) {
        expect(Math.abs(l.node.position.x)).toBeLessThanOrEqual(halfW);
        expect(Math.abs(l.node.position.y)).toBeLessThanOrEqual(halfH);
      }
      for (const node of root.children) {
        if (node.name.startsWith('koi-') && node.active) {
          expect(Math.abs(node.position.x)).toBeLessThanOrEqual(halfW);
          expect(Math.abs(node.position.y)).toBeLessThanOrEqual(halfH);
        }
      }
    });
    expect(g.calls.length).toBeGreaterThan(20);
    expect(background.clearCount).toBe(0);
    expect(root.children).toHaveLength(nodeCount);
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

  it('shows a clean settlement without live ranks or stale chase guidance', () => {
    const { main, labels } = boot('douyin-375x812', 40);
    let settled = false;
    run(main, 90, () => {
      if (!/获胜|平分秋色/.test(labels.get('banner')!.string)) return;
      settled = true;
      expect(labels.get('rank')!.string).toBe('');
      expect(labels.get('cheers')!.string).toBe('');
      expect(labels.get('momentum')!.string).toBe('夜河已定 · 感谢同行');
    });
    expect(settled).toBe(true);
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
