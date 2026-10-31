/**
 * Cocos 入口：加载布局档案、选择数据源并驱动夜河渲染器。
 * 场景只需在 Canvas 上挂载本组件，无其他场景节点依赖。
 */
import { _decorator, Component, JsonAsset, ResolutionPolicy, resources, view } from 'cc';
import { parseProfile, resolveLayout, type LayoutProfile } from '../logic/layout';
import { DemoSource, NetSource, type FrameSource } from '../logic/sources';
import { ViewModel } from '../logic/view-model';
import { loadArt } from './art';
import { KoiRenderer } from './KoiRenderer';

const { ccclass, property } = _decorator;

@ccclass('JinliMain')
export class JinliMain extends Component {
  @property profileName = 'douyin-375x812';
  @property mode = 'demo';
  @property serverUrl = 'ws://127.0.0.1:7788/?room=demo-room';
  @property demoSpeed = 1;

  private renderer: KoiRenderer | null = null;
  private profile: LayoutProfile | null = null;
  private source: FrameSource | null = null;
  private readonly vm = new ViewModel({ A: '锦鲤', B: '神龟' });
  private elapsedMs = 0;

  start(): void {
    resources.load(`profiles/${this.profileName}`, JsonAsset, (err, asset) => {
      if (err || !asset) {
        console.error('layout profile load failed', err);
        return;
      }
      this.profile = parseProfile(asset.json);
      view.setDesignResolutionSize(this.profile.canvas.width, this.profile.canvas.height, ResolutionPolicy.SHOW_ALL);
      loadArt((art) => {
        if (!art || !this.profile) return;
        this.renderer = new KoiRenderer(this.node, this.profile, resolveLayout(this.profile), art);
      });
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
    if (!this.renderer || !this.source) return;
    this.elapsedMs += dt * 1000;
    const frame = this.source.poll(this.elapsedMs);
    if (frame) this.vm.apply(frame.snapshot, frame.effects);
    this.renderer.render(this.vm, this.elapsedMs);
  }
}
