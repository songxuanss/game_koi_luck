/**
 * Cocos 视图层（极薄）：运行时用 Graphics/Label 构建全部占位 UI，逻辑全部来自 logic 层。
 * 使用：Canvas 节点挂载本组件即可，无需手写场景内容。画面统一带 DEV 水印。
 */
import { _decorator, Color, Component, Graphics, JsonAsset, Label, Node, resources, UITransform, Vec3 } from 'cc';
import type { Snapshot } from '../generated/core';
import { parseProfile, resolveLayout, type LayoutProfile, type Rect, type ResolvedLayout } from '../logic/layout';
import { DemoSource, NetSource, type FrameSource } from '../logic/sources';
import { PHASE_LABEL, ViewModel } from '../logic/view-model';

const { ccclass, property } = _decorator;

const COLORS = {
  A: new Color(231, 76, 60, 255),
  B: new Color(52, 152, 219, 255),
  panel: new Color(0, 0, 0, 120),
  text: new Color(255, 245, 220, 255),
  gold: new Color(255, 205, 80, 255),
};

@ccclass('JinliMain')
export class JinliMain extends Component {
  @property profileName = 'douyin-375x812';
  @property mode = 'demo';
  @property serverUrl = 'ws://127.0.0.1:7788/?room=demo-room';
  @property demoSpeed = 1;

  private layout!: ResolvedLayout;
  private profile!: LayoutProfile;
  private source!: FrameSource;
  private vm = new ViewModel({ A: '锦鲤', B: '神龟' });
  private g!: Graphics;
  private labels = new Map<string, Label>();
  private elapsedMs = 0;

  start(): void {
    resources.load(`profiles/${this.profileName}`, JsonAsset, (err, asset) => {
      if (err || !asset) {
        console.error('layout profile load failed', err);
        return;
      }
      this.profile = parseProfile(asset.json);
      this.layout = resolveLayout(this.profile);
      this.build();
    });
    if (this.mode === 'net') {
      const net = new NetSource(this.serverUrl);
      net.connect();
      this.source = net;
    } else {
      this.source = new DemoSource({ speed: this.demoSpeed });
    }
  }

  update(dt: number): void {
    if (!this.layout) return;
    this.elapsedMs += dt * 1000;
    const frame = this.source.poll(this.elapsedMs);
    if (frame) this.vm.apply(frame.snapshot, frame.effects);
    this.draw();
  }

  private build(): void {
    const { canvas } = this.profile;
    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ui.setContentSize(canvas.width, canvas.height);
    const gNode = this.child('graphics');
    this.g = gNode.addComponent(Graphics);
    for (const key of ['phase', 'countdown', 'sideA', 'sideB', 'banner', 'rank', 'feed', 'rule', 'dev']) {
      this.labels.set(key, this.label(key));
    }
  }

  private child(name: string): Node {
    const n = new Node(name);
    n.layer = this.node.layer;
    this.node.addChild(n);
    return n;
  }

  private label(name: string): Label {
    const node = this.child(name);
    node.addComponent(UITransform);
    const l = node.addComponent(Label);
    l.fontSize = 14;
    l.lineHeight = 18;
    l.color = COLORS.text;
    return l;
  }

  /** 档案坐标（左上原点，y 向下）→ 节点坐标（画布中心原点，y 向上）。 */
  private place(key: string, r: Rect, align: 'left' | 'center' = 'left'): void {
    const l = this.labels.get(key);
    if (!l) return;
    const { canvas } = this.profile;
    const ui = l.node.getComponent(UITransform)!;
    ui.setContentSize(r.w, r.h);
    ui.setAnchorPoint(0.5, 0.5);
    l.horizontalAlign = align === 'center' ? Label.HorizontalAlign.CENTER : Label.HorizontalAlign.LEFT;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    l.overflow = Label.Overflow.SHRINK;
    l.node.setPosition(new Vec3(r.x + r.w / 2 - canvas.width / 2, canvas.height / 2 - (r.y + r.h / 2), 0));
  }

  private rect(g: Graphics, r: Rect, color: Color): void {
    const { canvas } = this.profile;
    g.fillColor = color;
    g.rect(r.x - canvas.width / 2, canvas.height / 2 - r.y - r.h, r.w, r.h);
    g.fill();
  }

  private draw(): void {
    const snap = this.vm.snapshot;
    if (!snap) return;
    const L = this.layout;
    const g = this.g;
    g.clear();
    this.rect(g, L.topBar, COLORS.panel);
    // 进度条：左锦鲤（红）/右神龟（蓝）
    const barH = 14;
    const barY = L.topBar.y + L.topBar.h - barH - 6;
    const barW = L.topBar.w;
    const half = barW / 2;
    this.rect(g, { x: L.topBar.x, y: barY, w: barW, h: barH }, new Color(40, 40, 40, 200));
    this.rect(g, { x: L.topBar.x + half - half * snap.sides.A.progress, y: barY, w: half * snap.sides.A.progress, h: barH }, COLORS.A);
    this.rect(g, { x: L.topBar.x + half, y: barY, w: half * snap.sides.B.progress, h: barH }, COLORS.B);
    // 集体充能条
    for (const [side, color] of [['A', COLORS.A], ['B', COLORS.B]] as const) {
      const w = (half - 8) * snap.sides[side].charge;
      const x = side === 'A' ? L.topBar.x : L.topBar.x + half + 8;
      this.rect(g, { x, y: barY + barH + 2, w, h: 3 }, color);
    }
    // 战场：双方小鱼占位（按人数与鱼苗数）
    this.drawFish(g, snap, L.battlefield);
    this.rect(g, L.feed, COLORS.panel);
    this.rect(g, L.ruleSticker, new Color(0, 0, 0, 160));

    const sec = this.vm.countdownSec();
    this.setText('phase', `${PHASE_LABEL[snap.phase]} · 第${snap.matchNo}场`, L.topBar, 'left', { x: 0, y: 4, h: 20 });
    this.setText('countdown', sec === null ? '' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, L.topBar, 'center', { x: 0, y: 4, h: 20 });
    const side = (s: 'A' | 'B') => `${snap.sides[s].name} ${Math.round(snap.sides[s].progress * 100)}%  ${snap.sides[s].members}人${snap.sides[s].comeback ? ' ↑' : ''}`;
    this.setText('sideA', side('A'), L.topBar, 'left', { x: 0, y: 24, h: 18 });
    this.setText('sideB', side('B'), L.topBar, 'left', { x: L.topBar.w / 2, y: 24, h: 18 });
    this.setText('rank', snap.top.map((r, i) => `${i + 1} ${r.nick} ${r.power}`).join('\n'), L.rank, 'left');
    this.setText('feed', this.vm.feed.map((f) => f.text).join('\n'), L.feed, 'left');
    this.setText('banner', this.vm.banner?.text ?? '', L.battlefield, 'center', { x: 0, y: 0, h: 40 }, 28);
    this.setText('rule', '弹幕"锦鲤"或"神龟"加入 · 点赞助力 · 礼物召唤', L.ruleSticker, 'center');
    this.setText('dev', 'DEV', L.watermark, 'center');
  }

  private drawFish(g: Graphics, snap: Snapshot, field: Rect): void {
    const { canvas } = this.profile;
    for (const [i, side] of (['A', 'B'] as const).entries()) {
      const n = Math.min(40, snap.sides[side].members + snap.sides[side].fry * 3);
      const laneY = field.y + field.h * (0.3 + 0.4 * i);
      g.fillColor = side === 'A' ? COLORS.A : COLORS.B;
      for (let k = 0; k < n; k++) {
        const t = (k + 1) / (n + 1);
        const x = field.x + 12 + t * (field.w - 24) * (0.2 + 0.8 * snap.sides[side].progress);
        g.circle(x - canvas.width / 2, canvas.height / 2 - laneY + ((k % 5) - 2) * 6, 5);
      }
      g.fill();
    }
  }

  private setText(key: string, text: string, region: Rect, align: 'left' | 'center', box: { x?: number; y?: number; w?: number; h?: number } = {}, size?: number): void {
    const l = this.labels.get(key);
    if (!l) return;
    l.string = text;
    if (size) l.fontSize = size;
    this.place(key, { x: region.x + (box.x ?? 0), y: region.y + (box.y ?? 0), w: box.w ?? region.w - (box.x ?? 0), h: box.h ?? region.h }, align);
  }
}
