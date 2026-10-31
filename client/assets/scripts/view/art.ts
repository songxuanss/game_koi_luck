import { Font, resources, SpriteFrame, Texture2D } from 'cc';

export interface ArtAssets {
  background: SpriteFrame;
  gate: SpriteFrame;
  panel: SpriteFrame;
  glow: SpriteFrame;
  koi: Record<'A' | 'B' | 'gold', SpriteFrame>;
  font: Font | null;
}

export const ART_SPRITE_PATHS = {
  background: 'art/bg-night-river/texture',
  gate: 'art/dragon-gate/texture',
  panel: 'art/glass-panel/texture',
  glow: 'art/glow/texture',
  koiA: 'art/koi-red/texture',
  koiB: 'art/koi-blue/texture',
  koiGold: 'art/koi-gold/texture',
} as const;
export const ART_FONT_PATH = 'fonts/NotoSansCJKsc-Regular';

export function loadArt(done: (assets: ArtAssets | null) => void): void {
  const frames: Partial<Record<keyof typeof ART_SPRITE_PATHS, SpriteFrame>> = {};
  let pending = Object.keys(ART_SPRITE_PATHS).length + 1;
  let failed = false;
  const finish = () => {
    if (--pending > 0 || failed) return;
    done({
      background: frames.background!, gate: frames.gate!, panel: frames.panel!, glow: frames.glow!,
      koi: { A: frames.koiA!, B: frames.koiB!, gold: frames.koiGold! }, font,
    });
  };
  const fail = (path: string, error: unknown) => {
    if (failed) return;
    failed = true;
    console.error(`art load failed: ${path}`, error);
    done(null);
  };
  for (const [key, path] of Object.entries(ART_SPRITE_PATHS) as [keyof typeof ART_SPRITE_PATHS, string][]) {
    resources.load(path, Texture2D, (error, texture) => {
      if (error || !texture) return fail(path, error);
      const frame = new SpriteFrame();
      frame.texture = texture;
      frames[key] = frame;
      finish();
    });
  }
  let font: Font | null = null;
  resources.load(ART_FONT_PATH, Font, (error, asset) => {
    if (error) console.warn('custom font unavailable; use engine fallback', error);
    font = asset;
    finish();
  });
}
