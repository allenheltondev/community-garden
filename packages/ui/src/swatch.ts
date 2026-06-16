// Helpers for rendering color swatches next to product variation values
// (e.g. t-shirt colors). These are purely presentational: variation values
// are still stored as plain strings, and the swatch color is derived from
// the value text at render time.

const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

// Apparel-specific names that the browser can't resolve on its own (multi-word
// names, or shades that differ from the CSS named color). Keys are lowercased.
const APPAREL_COLORS: Record<string, string> = {
  navy: '#1f2a44',
  'navy blue': '#1f2a44',
  royal: '#2b4c9b',
  'royal blue': '#2b4c9b',
  'carolina blue': '#4b9cd3',
  'baby blue': '#a3c1e0',
  'sky blue': '#87ceeb',
  heather: '#b7b7b7',
  'heather gray': '#b7b7b7',
  'heather grey': '#b7b7b7',
  'sport gray': '#9e9e9e',
  'sport grey': '#9e9e9e',
  charcoal: '#36454f',
  ash: '#d6d6cf',
  'kelly green': '#4cbb17',
  forest: '#228b22',
  'forest green': '#228b22',
  'military green': '#4b5320',
  cardinal: '#8c1515',
  burgundy: '#800020',
  maroon: '#800000',
  rust: '#b7410e',
  sand: '#c2b280',
  natural: '#f5f0e1',
  cream: '#fffdd0',
  mustard: '#e1ad01',
  'dusty rose': '#c9a9a6',
  blush: '#de9b9b',
};

let probe: HTMLElement | null = null;

function resolveViaBrowser(value: string): string | null {
  if (typeof document === 'undefined') return null;
  if (!probe) {
    probe = document.createElement('span');
  }
  probe.style.color = '';
  probe.style.color = value;
  // Invalid values are rejected by the browser and leave the property empty.
  return probe.style.color ? value : null;
}

/**
 * Returns a CSS color string to use for a swatch, or null when the value
 * doesn't look like a color we can render. Handles hex codes, common apparel
 * color names, and any CSS named color the browser recognizes.
 */
export function resolveColorSwatch(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (HEX_PATTERN.test(trimmed)) return trimmed;
  const mapped = APPAREL_COLORS[trimmed.toLowerCase()];
  if (mapped) return mapped;
  return resolveViaBrowser(trimmed);
}

/** True when a variation's name suggests its values are colors. */
export function isColorVariation(name: string): boolean {
  return /colou?r/i.test(name);
}
