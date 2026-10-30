/**
 * 布局档案（Layout Profile）：画布、安全区、各区域锚点全部来自 JSON 档案，
 * 切换平台档案不改代码。输出为以画布左上角为原点的矩形（y 向下）。
 */
export type Anchor = 'top' | 'bottom' | 'center' | 'top-left' | 'top-right';

export interface RegionSpec {
  anchor: Anchor;
  offsetY?: number;
  width?: number;
  height?: number;
  heightRatio?: number;
}

export interface LayoutProfile {
  name: string;
  canvas: { width: number; height: number };
  safeArea: { top: number; bottom: number; left: number; right: number };
  regions: Record<'topBar' | 'rank' | 'battlefield' | 'feed' | 'ruleSticker' | 'watermark', RegionSpec>;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ResolvedLayout = Record<keyof LayoutProfile['regions'], Rect>;

const REGION_KEYS: (keyof LayoutProfile['regions'])[] = ['topBar', 'rank', 'battlefield', 'feed', 'ruleSticker', 'watermark'];

export function parseProfile(input: unknown): LayoutProfile {
  const p = input as Partial<LayoutProfile> | null;
  if (!p || typeof p !== 'object') throw new Error('profile: not an object');
  if (typeof p.name !== 'string') throw new Error('profile: name missing');
  const c = p.canvas;
  if (!c || !(c.width > 0) || !(c.height > 0)) throw new Error('profile: invalid canvas');
  const s = p.safeArea;
  if (!s || [s.top, s.bottom, s.left, s.right].some((v) => typeof v !== 'number' || v < 0)) throw new Error('profile: invalid safeArea');
  if (s.top + s.bottom >= c.height || s.left + s.right >= c.width) throw new Error('profile: safeArea larger than canvas');
  for (const k of REGION_KEYS) if (!p.regions?.[k]) throw new Error(`profile: region ${k} missing`);
  return p as LayoutProfile;
}

export function resolveLayout(profile: LayoutProfile): ResolvedLayout {
  const { canvas, safeArea: s, regions } = profile;
  const innerW = canvas.width - s.left - s.right;
  const innerH = canvas.height - s.top - s.bottom;
  const out = {} as ResolvedLayout;
  for (const key of REGION_KEYS) {
    const r = regions[key];
    const h = r.heightRatio !== undefined ? innerH * r.heightRatio : r.height ?? 24;
    const w = r.width ?? innerW;
    const off = r.offsetY ?? 0;
    let x = s.left;
    let y = s.top;
    switch (r.anchor) {
      case 'top':
        y = s.top + off;
        break;
      case 'top-left':
        y = s.top + off;
        break;
      case 'top-right':
        x = canvas.width - s.right - w;
        y = s.top + off;
        break;
      case 'bottom':
        y = canvas.height - s.bottom - h - off;
        break;
      case 'center':
        y = s.top + (innerH - h) / 2 + off;
        break;
    }
    if (r.anchor === 'top' || r.anchor === 'bottom' || r.anchor === 'center') x = s.left + (innerW - w) / 2;
    out[key] = { x, y, w, h };
  }
  return out;
}
