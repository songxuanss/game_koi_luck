import { Color, Graphics, Label, Node, Sprite, UITransform, Vec3 } from 'cc';
import type { Snapshot } from '../generated/core';
import type { SideId } from '../generated/shared';
import type { LayoutProfile, Rect, ResolvedLayout } from '../logic/layout';
import { momentumText, PHASE_LABEL, phaseCue, sideStatus, type ViewModel } from '../logic/view-model';
import type { ArtAssets } from './art';

const color = (r: number, g: number, b: number, a = 255) => new Color(r, g, b, a);
const C = {
  ink: color(5, 17, 27), sky: color(10, 34, 46), mountain: color(13, 45, 53),
  river: color(8, 38, 51, 235), panel: color(7, 20, 29, 224), panelSoft: color(11, 30, 39, 190),
  gold: color(235, 190, 94), goldSoft: color(235, 190, 94, 92), text: color(246, 239, 218),
  muted: color(166, 188, 187), A: color(238, 83, 74), AGlow: color(255, 139, 95),
  B: color(48, 174, 207), BGlow: color(104, 220, 228), white: color(255, 252, 232),
} as const;
const LABELS = ['phase', 'countdown', 'sideA', 'sideB', 'chargeA', 'chargeB', 'phaseSub', 'gate', 'momentum', 'rank', 'cheers', 'feed', 'rule', 'banner', 'settleDetail', 'dev'] as const;

/** 夜河灯宴场景。静态山水只画一次，动态层不创建节点。 */
export class KoiRenderer {
  private readonly background: Graphics;
  private readonly graphics: Graphics;
  private readonly labels = new Map<string, Label>();
  private readonly labelLayouts = new Map<string, string>();
  private readonly koiNodes: Record<SideId, Node[]> = { A: [], B: [] };
  private readonly floating: Label[] = [];
  private readonly gate: Node;
  private readonly leap: Node;
  private readonly previousProgress = { A: -1, B: -1 };
  private readonly advanceAt = { A: -Infinity, B: -Infinity };
  private labelSnapshot: Snapshot | null = null;

  constructor(private readonly root: Node, private readonly profile: LayoutProfile, private readonly layout: ResolvedLayout, private readonly art: ArtAssets) {
    const ui = root.getComponent(UITransform) ?? root.addComponent(UITransform);
    ui.setContentSize(profile.canvas.width, profile.canvas.height);
    this.spriteNode('backdrop-art', art.background, profile.canvas.width, profile.canvas.height);
    this.background = this.graphicsNode('background');
    this.graphics = this.graphicsNode('graphics');
    this.gate = this.spriteNode('dragon-gate', art.gate, 104, 78);
    this.leap = this.spriteNode('leap-koi', art.koi.gold, 72, 45);
    this.leap.active = false;
    for (const side of ['A', 'B'] as const) {
      for (let i = 0; i < 32; i++) {
        const node = this.spriteNode(`koi-${side}-${i}`, art.koi[side], 36, 23);
        node.active = false;
        this.koiNodes[side].push(node);
      }
    }
    this.createFloatingLabels();
    for (const name of LABELS) this.createLabel(name);
    this.drawBackground();
  }

  render(vm: ViewModel, timeMs: number): void {
    const snap = vm.snapshot;
    if (!snap) return;
    const g = this.graphics;
    g.clear();
    this.drawPhaseTint(snap);
    this.drawProgress(snap);
    this.drawRiver(timeMs);
    this.drawGate(snap);
    this.drawFish(snap, 'A', timeMs);
    this.drawFish(snap, 'B', timeMs);
    this.drawVisualEvents(vm);
    this.drawFloatingText(vm);
    this.drawSettlement(snap);
    if (this.labelSnapshot !== snap) {
      this.updateLabels(vm);
      this.labelSnapshot = snap;
    }
  }

  private graphicsNode(name: string): Graphics {
    const node = new Node(name);
    node.layer = this.root.layer;
    this.root.addChild(node);
    return node.addComponent(Graphics);
  }

  private spriteNode(name: string, frame: ArtAssets['background'], w: number, h: number): Node {
    const node = new Node(name);
    node.layer = this.root.layer;
    this.root.addChild(node);
    const ui = node.addComponent(UITransform);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    ui.setContentSize(w, h);
    return node;
  }

  private createFloatingLabels(): void {
    for (let i = 0; i < 8; i++) {
      const node = new Node(`float-${i}`);
      node.layer = this.root.layer;
      this.root.addChild(node);
      node.addComponent(UITransform).setContentSize(84, 30);
      const label = node.addComponent(Label);
      label.fontSize = 20;
      label.lineHeight = 24;
      label.color = C.gold;
      if (this.art.font) label.font = this.art.font;
      label.isBold = true;
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.node.active = false;
      this.floating.push(label);
    }
  }

  private createLabel(name: string): void {
    const node = new Node(name);
    node.layer = this.root.layer;
    this.root.addChild(node);
    node.addComponent(UITransform);
    const label = node.addComponent(Label);
    label.fontSize = name === 'banner' ? 30 : name === 'phase' || name.startsWith('side') ? 16 : name === 'rank' || name === 'feed' ? 13 : 14;
    label.lineHeight = name === 'rank' || name === 'feed' ? 19 : 22;
    label.color = name === 'banner' || name === 'gate' ? C.gold : name === 'phaseSub' || name === 'cheers' ? C.muted : C.text;
    if (this.art.font) label.font = this.art.font;
    label.isBold = name === 'banner' || name === 'phase' || name.startsWith('side');
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    this.labels.set(name, label);
  }

  private point(x: number, y: number): [number, number] {
    return [x - this.profile.canvas.width / 2, this.profile.canvas.height / 2 - y];
  }

  private rect(g: Graphics, r: Rect, fill: Color): void {
    g.fillColor = fill;
    g.rect(...this.point(r.x, r.y + r.h), r.w, r.h);
    g.fill();
  }

  private circle(g: Graphics, x: number, y: number, radius: number, fill: Color): void {
    g.fillColor = fill;
    g.circle(...this.point(x, y), radius);
    g.fill();
  }

  private stroke(g: Graphics, points: [number, number][], stroke: Color, width = 1): void {
    if (points.length < 2) return;
    g.strokeColor = stroke;
    g.lineWidth = width;
    g.moveTo(...this.point(...points[0]!));
    for (const p of points.slice(1)) g.lineTo(...this.point(...p));
    g.stroke();
  }

  private panel(g: Graphics, r: Rect, fill = C.panel): void {
    const radius = Math.min(12, r.h / 4, r.w / 4);
    g.fillColor = color(1, 8, 15, 90);
    g.roundRect(...this.point(r.x + 2, r.y + r.h + 3), r.w, r.h, radius);
    g.fill();
    g.fillColor = fill;
    g.roundRect(...this.point(r.x, r.y + r.h), r.w, r.h, radius);
    g.fill();
    this.stroke(g, [[r.x + radius, r.y], [r.x + r.w - radius, r.y]], C.goldSoft);
    this.stroke(g, [[r.x + radius, r.y + r.h], [r.x + r.w - radius, r.y + r.h]], color(235, 190, 94, 40));
  }

  private drawBackground(): void {
    const g = this.background;
    const L = this.layout;
    this.panel(g, L.topBar, color(5, 20, 31, 188));
    this.panel(g, L.battlefield, color(4, 28, 41, 72));
    this.panel(g, L.feed, color(5, 22, 34, 214));
    this.panel(g, L.ruleSticker, color(5, 20, 31, 238));
  }

  private drawPhaseTint(snap: Snapshot): void {
    const { width: w, height: h } = this.profile.canvas;
    if (snap.phase === 'fortune') this.rect(this.graphics, { x: 0, y: 0, w, h }, color(235, 190, 94, 14));
    if (snap.phase === 'overtime') this.rect(this.graphics, { x: 0, y: 0, w, h }, color(48, 174, 207, 20));
    if (snap.phase === 'settle') this.rect(this.graphics, this.layout.battlefield, color(3, 12, 20, 92));
    if (snap.phase !== 'settle') this.panel(this.graphics, this.layout.rank, C.panelSoft);
  }

  private drawProgress(snap: Snapshot): void {
    const g = this.graphics;
    const r = this.layout.topBar;
    const y = r.y + 62;
    const h = 12;
    const half = r.w / 2;
    this.rect(g, { x: r.x, y, w: r.w, h }, color(2, 10, 16, 230));
    const a = half * snap.sides.A.progress;
    const b = half * snap.sides.B.progress;
    this.rect(g, { x: r.x + half - a, y, w: a, h }, C.A);
    this.rect(g, { x: r.x + half, y, w: b, h }, C.B);
    this.circle(g, r.x + half - a, y + h / 2, 4, C.AGlow);
    this.circle(g, r.x + half + b, y + h / 2, 4, C.BGlow);
    for (const side of ['A', 'B'] as const) {
      const charge = snap.sides[side].charge;
      const w = (half - 10) * charge;
      const x = side === 'A' ? r.x + half - 10 - w : r.x + half + 10;
      this.rect(g, { x, y: y + 18, w, h: 3 }, side === 'A' ? C.AGlow : C.BGlow);
    }
    this.stroke(g, [[r.x + half, y - 3], [r.x + half, y + h + 3]], C.gold, 1);
  }

  private drawRiver(timeMs: number): void {
    const g = this.graphics;
    const r = this.layout.battlefield;
    const t = timeMs / 1400;
    for (let i = 0; i < 6; i++) {
      const y = r.y + r.h * (0.22 + i * 0.115);
      const drift = Math.sin(t + i * 1.7) * 7;
      g.strokeColor = color(104, 220, 228, 24 + i * 3);
      g.lineWidth = 1;
      g.moveTo(...this.point(r.x + 12, y));
      g.bezierCurveTo(...this.point(r.x + r.w * 0.3, y - 7 + drift), ...this.point(r.x + r.w * 0.65, y + 8 - drift), ...this.point(r.x + r.w - 12, y));
      g.stroke();
    }
  }

  private drawGate(snap: Snapshot): void {
    const r = this.layout.battlefield;
    const active = snap.phase === 'fortune' || snap.phase === 'settle';
    const pulse = active ? 1.08 : 1;
    this.gate.setScale(pulse, pulse, 1);
    this.gate.setPosition(new Vec3(...this.point(r.x + r.w / 2, r.y + 52), 0));
    const ui = this.gate.getComponent(UITransform)!;
    ui.setContentSize(active ? 122 : 104, active ? 92 : 78);
    this.circle(this.graphics, r.x + r.w / 2, r.y + 62, active ? 48 : 34, color(255, 224, 143, active ? 24 : 10));
  }

  private drawFish(snap: Snapshot, side: SideId, timeMs: number): void {
    const s = snap.sides[side];
    const r = this.layout.battlefield;
    const previous = this.previousProgress[side];
    if (previous >= 0 && s.progress > previous + 0.0005) this.advanceAt[side] = timeMs;
    this.previousProgress[side] = s.progress;
    const dashAge = (timeMs - this.advanceAt[side]) / 900;
    const dash = dashAge >= 0 && dashAge < 1 ? Math.sin(dashAge * Math.PI) * 30 : 0;
    const n = Math.min(32, 5 + Math.ceil(s.members / 4) + Math.min(12, s.fry));
    const direction = side === 'A' ? 1 : -1;
    const lane = side === 'A' ? 0.60 : 0.80;
    const front = side === 'A'
      ? r.x + 34 + (r.w / 2 - 54) * s.progress + dash
      : r.x + r.w - 34 - (r.w / 2 - 54) * s.progress - dash;
    for (let k = 0; k < this.koiNodes[side].length; k++) {
      const node = this.koiNodes[side][k]!;
      node.active = k < n;
      if (!node.active) continue;
      const row = Math.floor(k / 8);
      const swim = Math.sin(timeMs / 650 + k * 1.3) * 8;
      const rawX = front - direction * (k % 8) * 16 + swim;
      const x = Math.max(r.x + 20, Math.min(r.x + r.w - 20, rawX));
      const y = r.y + r.h * lane + row * 22 + Math.sin(timeMs / 460 + k * 1.9) * 5;
      const accent = (s.dragon && k === 0) || (s.elite && k % 7 === 0);
      const sprite = node.getComponent(Sprite)!;
      sprite.spriteFrame = accent ? this.art.koi.gold : this.art.koi[side];
      const ui = node.getComponent(UITransform)!;
      if (ui.width !== 36 || ui.height !== 23) ui.setContentSize(36, 23);
      const scale = (accent ? 1.25 : 0.82 + (k % 3) * 0.08) * (1 + (dashAge >= 0 && dashAge < 1 ? 0.18 : 0));
      node.angle = direction * Math.sin(timeMs / 310 + k) * 7;
      node.setScale(direction * scale, scale * (1 + Math.sin(timeMs / 240 + k) * 0.08), 1);
      node.setPosition(new Vec3(...this.point(x, y), 0));
    }
  }

  private drawVisualEvents(vm: ViewModel): void {
    const snap = vm.snapshot!;
    const g = this.graphics;
    const r = this.layout.battlefield;
    this.leap.active = false;
    let particles = 0;
    for (let i = vm.visualEvents.length - 1; i >= 0; i--) {
      const e = vm.visualEvents[i]!;
      const age = Math.max(0, Math.min(1, (snap.now - e.at) / Math.max(1, e.until - e.at)));
      const alpha = Math.round(220 * (1 - age));
      const sideX = e.side === 'A' ? r.x + r.w * 0.28 : e.side === 'B' ? r.x + r.w * 0.72 : r.x + r.w / 2;
      const y = e.side === 'A' ? r.y + r.h * 0.60 : e.side === 'B' ? r.y + r.h * 0.80 : r.y + r.h * 0.58;
      const tint = e.side === 'A' ? C.AGlow : e.side === 'B' ? C.BGlow : C.gold;
      if (e.kind === 'ripple' || e.kind === 'surge') {
        const count = e.kind === 'surge' ? 3 : 1;
        for (let ring = 0; ring < count; ring++) {
          g.strokeColor = color(tint.r, tint.g, tint.b, alpha);
          g.lineWidth = e.kind === 'surge' ? 2 : 1;
          g.circle(...this.point(sideX, y), 8 + age * (38 + ring * 15));
          g.stroke();
        }
      }
      if (e.kind === 'counter') {
        this.stroke(g, [[sideX - 20, y - 20], [sideX + 20, y + 20]], color(235, 190, 94, alpha), 3);
        this.stroke(g, [[sideX + 20, y - 20], [sideX - 20, y + 20]], color(235, 190, 94, alpha), 3);
      }
      if (e.kind === 'comeback') {
        this.stroke(g, [[sideX - 28, y + 18], [sideX, y - 18], [sideX + 28, y + 18]], color(tint.r, tint.g, tint.b, alpha), 4);
      }
      if (e.kind === 'leap') {
        const gateX = r.x + r.w / 2;
        const gateY = r.y + 58 - Math.sin(age * Math.PI) * 46;
        this.leap.active = true;
        this.leap.setScale(e.side === 'B' ? -1.25 : 1.25, 1.25, 1);
        this.leap.setPosition(new Vec3(...this.point(gateX, gateY), 0));
        g.strokeColor = color(235, 190, 94, alpha);
        g.lineWidth = 3;
        g.circle(...this.point(gateX, r.y + 58), 24 + age * 50);
        g.stroke();
      }
      const sparkCount = e.kind === 'settle' ? 18 : e.kind === 'gift' ? Math.min(8, 2 + e.tier) : e.kind === 'leap' ? 12 : 0;
      for (let p = 0; p < sparkCount && particles < 48; p++, particles++) {
        const angle = (p / Math.max(1, sparkCount)) * Math.PI * 2 + e.id * 0.37;
        const distance = 8 + age * (28 + (p % 4) * 9);
        const px = (e.kind === 'settle' ? r.x + r.w / 2 : sideX) + Math.cos(angle) * distance;
        const py = (e.kind === 'settle' ? r.y + r.h * 0.4 : y) + Math.sin(angle) * distance;
        this.circle(g, px, py, e.rare ? 2.2 : 1.5, color(e.rare ? C.gold.r : tint.r, e.rare ? C.gold.g : tint.g, e.rare ? C.gold.b : tint.b, alpha));
      }
    }
  }

  private drawFloatingText(vm: ViewModel): void {
    const snap = vm.snapshot!;
    const r = this.layout.battlefield;
    const gifts = vm.visualEvents.filter((event) => event.kind === 'gift' && event.progressPct > 0).slice(-this.floating.length);
    for (let i = 0; i < this.floating.length; i++) {
      const label = this.floating[i]!;
      const event = gifts[i];
      label.node.active = Boolean(event);
      if (!event) continue;
      const age = Math.max(0, Math.min(1, (snap.now - event.at) / Math.max(1, event.until - event.at)));
      const side = event.side ?? 'A';
      const x = side === 'A' ? r.x + r.w * 0.28 : r.x + r.w * 0.72;
      const baseY = side === 'A' ? r.y + r.h * 0.52 : r.y + r.h * 0.72;
      const y = baseY - age * 42;
      const tint = event.rare ? C.gold : side === 'A' ? C.AGlow : C.BGlow;
      label.string = `+${event.progressPct}%`;
      label.color = color(tint.r, tint.g, tint.b, Math.round(255 * (1 - age * age)));
      label.node.setScale(1 + Math.sin(age * Math.PI) * 0.18, 1 + Math.sin(age * Math.PI) * 0.18, 1);
      label.node.setPosition(new Vec3(...this.point(x, y), 0));
    }
  }

  private drawSettlement(snap: Snapshot): void {
    if (snap.phase !== 'settle' || !snap.result) return;
    const r = this.layout.battlefield;
    const card = { x: r.x + r.w * 0.1, y: r.y + r.h * 0.27, w: r.w * 0.8, h: r.h * 0.42 };
    this.panel(this.graphics, card, color(5, 17, 27, 242));
    this.stroke(this.graphics, [[card.x + 12, card.y + 8], [card.x + card.w - 12, card.y + 8]], C.gold, 2);
    this.circle(this.graphics, card.x + card.w / 2, card.y + 12, 3, C.gold);
  }

  private updateLabels(vm: ViewModel): void {
    const snap = vm.snapshot!;
    const L = this.layout;
    const sec = vm.countdownSec();
    const clock = sec === null ? '潮汐' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    this.setText('phase', `${PHASE_LABEL[snap.phase]} · 第${snap.matchNo}场`, L.topBar, 'left', { x: 12, y: 7, w: L.topBar.w * 0.58, h: 24 });
    this.setText('countdown', clock, L.topBar, 'center', { y: 7, h: 24 });
    for (const side of ['A', 'B'] as const) {
      const s = snap.sides[side];
      const suffix = side === 'A' ? 'A' : 'B';
      this.setText(`side${suffix}`, `${s.name} ${Math.round(s.progress * 100)}% · ${s.members}人`, L.topBar, side === 'A' ? 'left' : 'right', { x: side === 'A' ? 12 : L.topBar.w / 2, y: 35, w: L.topBar.w / 2 - 12, h: 20 });
      this.setText(`charge${suffix}`, sideStatus(snap, side), L.topBar, side === 'A' ? 'left' : 'right', { x: side === 'A' ? 12 : L.topBar.w / 2, y: 83, w: L.topBar.w / 2 - 12, h: 16 });
    }
    this.setText('phaseSub', phaseCue(snap), L.battlefield, 'center', { y: 5, h: 20 });
    this.setText('gate', snap.phase === 'fortune' ? '鸿运龙门' : '龙 门', L.battlefield, 'center', { y: 28, h: 24 });
    this.setText('momentum', momentumText(snap), L.battlefield, 'center', { y: L.battlefield.h - 28, h: 20 });
    const rank = snap.phase === 'settle' ? '' : ['✦ 助力', ...snap.top.slice(0, 3).map((entry, i) => `${i + 1}  ${entry.nick}  ${entry.power}`)].join('\n');
    this.setText('rank', rank, L.rank, 'left', { x: 8, y: 8, w: L.rank.w - 16, h: L.rank.h - 38 });
    const cheer = snap.cheers[0];
    const cheerText = snap.phase === 'settle' ? '' : cheer ? `气氛 ✦ ${cheer.nick} ${cheer.cheers}` : '气氛 ✦ 等你点亮';
    this.setText('cheers', cheerText, L.rank, 'center', { x: 4, y: L.rank.h - 28, w: L.rank.w - 8, h: 22 });
    const marks = { chat: '·', like: '✦', gift: '◆', rare: '✧', system: '—' } as const;
    this.setText('feed', vm.feed.map((item) => `${marks[item.tone]} ${item.text}`).join('\n'), L.feed, 'left', { x: 10, y: 8, w: L.feed.w - 20, h: L.feed.h - 16 });
    this.setText('rule', '弹幕「锦鲤 / 神龟」→ 点赞充能 → 100%', L.ruleSticker, 'center');
    this.setText('dev', 'DEV', L.watermark, 'center');
    this.setText('banner', vm.banner?.text ?? '', L.battlefield, 'center', { y: L.battlefield.h * 0.3, h: 44 });
    const result = snap.result;
    const key = result?.keyPlayer ? `关键先生  ${result.keyPlayer.nick}` : '关键先生  虚位以待';
    const detail = snap.phase === 'settle' && result ? `${key}\n${result.participants} 位同行者 · 幸运星 +${result.stars.winnerEach}` : '';
    this.setText('settleDetail', detail, L.battlefield, 'center', { y: L.battlefield.h * 0.44, h: 64 });
  }

  private setText(key: string, text: string, region: Rect, align: 'left' | 'center' | 'right', box: { x?: number; y?: number; w?: number; h?: number } = {}): void {
    const label = this.labels.get(key);
    if (!label) return;
    if (label.string !== text) label.string = text;
    const r = { x: region.x + (box.x ?? 0), y: region.y + (box.y ?? 0), w: box.w ?? region.w - (box.x ?? 0), h: box.h ?? region.h };
    const cache = `${align}:${r.x}:${r.y}:${r.w}:${r.h}`;
    if (this.labelLayouts.get(key) === cache) return;
    this.labelLayouts.set(key, cache);
    label.horizontalAlign = align === 'center' ? Label.HorizontalAlign.CENTER : align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.LEFT;
    const ui = label.node.getComponent(UITransform)!;
    ui.setContentSize(r.w, r.h);
    const x = align === 'right' ? r.x + r.w : align === 'left' ? r.x : r.x + r.w / 2;
    const anchor = align === 'center' ? 0.5 : align === 'right' ? 1 : 0;
    ui.setAnchorPoint(anchor, 0.5);
    label.node.setPosition(new Vec3(...this.point(x, r.y + r.h / 2), 0));
  }
}
