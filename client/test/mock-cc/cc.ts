/**
 * Cocos Creator 3.8 `cc` 模块的行为级替身：足以在 Node 里真正执行视图层（JinliMain）的 start/update，
 * 记录节点树、位置、文字与绘制调用，供测试断言。API 形状按 3.8 文档；它不是真实引擎——
 * 视图层在编辑器里的真实编译与渲染仍需人验证（任务 5.1）。
 */
export class Color {
  constructor(
    public r = 255,
    public g = 255,
    public b = 255,
    public a = 255,
  ) {}
}

export class Vec3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}
}

export class Component {
  node!: Node;
}

type Ctor<T> = new () => T;

export class Node {
  layer = 1;
  parent: Node | null = null;
  children: Node[] = [];
  position = new Vec3();
  scale = new Vec3(1, 1, 1);
  angle = 0;
  active = true;
  private components: Component[] = [];

  constructor(public name = '') {}

  addChild(child: Node): void {
    child.parent = this;
    this.children.push(child);
  }

  addComponent<T extends Component>(type: Ctor<T>): T {
    const c = new type();
    c.node = this;
    this.components.push(c);
    return c;
  }

  getComponent<T extends Component>(type: Ctor<T>): T | null {
    return (this.components.find((c) => c instanceof type) as T | undefined) ?? null;
  }

  setPosition(p: Vec3): void {
    this.position = p;
  }

  setScale(x: number, y: number, z: number): void {
    this.scale = new Vec3(x, y, z);
  }
}

export class UITransform extends Component {
  width = 0;
  height = 0;
  anchor = { x: 0.5, y: 0.5 };
  setContentSize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }
  setAnchorPoint(x: number, y: number): void {
    this.anchor = { x, y };
  }
}

export interface DrawCall {
  op: 'rect' | 'roundRect' | 'circle' | 'ellipse' | 'moveTo' | 'lineTo' | 'bezierCurveTo';
  args: number[];
  color: Color;
}

export class Graphics extends Component {
  fillColor = new Color();
  strokeColor = new Color();
  lineWidth = 1;
  calls: DrawCall[] = [];
  clearCount = 0;
  clear(): void {
    this.calls = [];
    this.clearCount++;
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.calls.push({ op: 'rect', args: [x, y, w, h], color: this.fillColor });
  }
  roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.calls.push({ op: 'roundRect', args: [x, y, w, h, r], color: this.fillColor });
  }
  circle(x: number, y: number, r: number): void {
    this.calls.push({ op: 'circle', args: [x, y, r], color: this.fillColor });
  }
  ellipse(x: number, y: number, rx: number, ry: number): void {
    this.calls.push({ op: 'ellipse', args: [x, y, rx, ry], color: this.fillColor });
  }
  moveTo(x: number, y: number): void {
    this.calls.push({ op: 'moveTo', args: [x, y], color: this.strokeColor });
  }
  lineTo(x: number, y: number): void {
    this.calls.push({ op: 'lineTo', args: [x, y], color: this.strokeColor });
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.calls.push({ op: 'bezierCurveTo', args: [c1x, c1y, c2x, c2y, x, y], color: this.strokeColor });
  }
  close(): void {}
  fill(): void {}
  stroke(): void {}
}

export class Texture2D {}
export class SpriteFrame { texture: Texture2D | null = null }
export class Font {}

export class Sprite extends Component {
  static SizeMode = { CUSTOM: 0, TRIMMED: 1, RAW: 2 };
  spriteFrame: SpriteFrame | null = null;
  sizeMode = 0;
  color = new Color();
}

export class Label extends Component {
  static HorizontalAlign = { LEFT: 0, CENTER: 1, RIGHT: 2 };
  static VerticalAlign = { TOP: 0, CENTER: 1, BOTTOM: 2 };
  static Overflow = { NONE: 0, CLAMP: 1, SHRINK: 2, RESIZE_HEIGHT: 3 };
  string = '';
  font: Font | null = null;
  isBold = false;
  fontSize = 20;
  lineHeight = 40;
  color = new Color();
  horizontalAlign = 0;
  verticalAlign = 0;
  overflow = 0;
}

export class JsonAsset {
  json: unknown = null;
}

/** 测试可注入资源表：路径 → JSON。 */
export const mockResources: Record<string, unknown> = {};

export const resources = {
  load<T>(path: string, type: Ctor<T>, cb: (err: Error | null, asset: T | null) => void): void {
    if (!(path in mockResources)) return cb(new Error(`resource not found: ${path}`), null);
    const a = new type() as unknown as JsonAsset;
    a.json = mockResources[path];
    cb(null, a as unknown as T);
  },
};

export const ResolutionPolicy = { SHOW_ALL: 4 };
export const view = {
  designResolution: { width: 0, height: 0, policy: 0 },
  setDesignResolutionSize(width: number, height: number, policy: number): void {
    this.designResolution = { width, height, policy };
  },
};

export const _decorator = {
  ccclass: (_name?: string) => (_target: unknown) => undefined,
  // 兼容旧式装饰器（experimentalDecorators）：属性装饰器不改变任何东西
  property: ((..._args: unknown[]) => undefined) as unknown as PropertyDecorator & ((opts?: unknown) => PropertyDecorator),
};
