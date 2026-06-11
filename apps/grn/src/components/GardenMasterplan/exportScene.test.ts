import { describe, expect, it } from 'vitest';
import { exportFilename, inlineSceneStyles, serializeScene } from './exportScene';

function makeScene(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'mp-scene');
  svg.setAttribute('width', '400');
  svg.setAttribute('height', '300');
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('class', 'mp-label');
  text.textContent = 'Herb spiral';
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('tabindex', '0');
  group.appendChild(text);
  svg.appendChild(group);
  document.body.appendChild(svg);
  return svg;
}

describe('exportFilename', () => {
  it('stamps the current date', () => {
    expect(exportFilename('svg', new Date(2026, 5, 11))).toBe(
      'garden-masterplan-2026-06-11.svg'
    );
    expect(exportFilename('png', new Date(2026, 0, 3))).toBe(
      'garden-masterplan-2026-01-03.png'
    );
  });
});

describe('inlineSceneStyles', () => {
  it('returns a clone and strips interaction attributes', () => {
    const svg = makeScene();
    const clone = inlineSceneStyles(svg);
    expect(clone).not.toBe(svg);
    expect(clone.querySelector('[tabindex]')).toBeNull();
    // The original is untouched.
    expect(svg.querySelector('[tabindex]')).not.toBeNull();
    svg.remove();
  });
});

describe('serializeScene', () => {
  it('produces standalone svg markup with the xmlns declared', () => {
    const svg = makeScene();
    const markup = serializeScene(svg);
    expect(markup).toContain('<svg');
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('Herb spiral');
    svg.remove();
  });
});
