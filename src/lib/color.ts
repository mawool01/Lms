/** Client-safe color helpers for generating a readable brand palette from one hex color. */

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Scale = Record<(typeof SHADES)[number], string>;

export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToHex(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Target lightness for each shade (600 is the main button color). */
const LIGHTNESS: Record<(typeof SHADES)[number], number> = {
  50: 0.97, 100: 0.93, 200: 0.86, 300: 0.76, 400: 0.64, 500: 0.54, 600: 0.46, 700: 0.39, 800: 0.32, 900: 0.26, 950: 0.17,
};

/**
 * Builds a 50–950 scale with the color's hue and saturation. The chosen color becomes shade 600
 * unless white text on it would be hard to read, in which case it's darkened until it reaches 4.5:1.
 */
export function brandScale(hex: string): { scale: Scale; adjusted: boolean } {
  const [h, s0, l0] = rgbToHsl(...hexToRgb(isHex(hex) ? hex : "#2547ea"));
  const s = Math.max(s0, 0.05);
  let base = isHex(hex) ? hex.toLowerCase() : "#2547ea";
  let l600 = l0;
  let adjusted = false;
  while (contrastRatio(base, "#ffffff") < 4.5 && l600 > 0.05) {
    l600 -= 0.02;
    base = hslToHex(h, s, l600);
    adjusted = true;
  }
  const scale = {} as Scale;
  for (const shade of SHADES) {
    // Shift the standard lightness curve so 600 lands exactly on the (possibly darkened) chosen color.
    const delta = l600 - LIGHTNESS[600];
    const target = shade >= 600 ? LIGHTNESS[shade] + delta * (1 - (shade - 600) / 400) : LIGHTNESS[shade] + delta * ((shade - 50) / 550);
    scale[shade] = shade === 600 ? base : hslToHex(h, shade <= 100 ? Math.min(s, 0.9) : s, Math.max(0.05, Math.min(0.98, target)));
  }
  return { scale, adjusted };
}

export function scaleCss(name: string, scale: Scale) {
  return SHADES.map((shade) => `--color-${name}-${shade}:${scale[shade]};`).join("");
}
