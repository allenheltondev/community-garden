// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isColorVariation, resolveColorSwatch } from '@olivias/ui';

describe('isColorVariation', () => {
  it('matches color/colour option names regardless of case', () => {
    expect(isColorVariation('Color')).toBe(true);
    expect(isColorVariation('colour')).toBe(true);
    expect(isColorVariation('Shirt Color')).toBe(true);
  });

  it('does not match non-color options', () => {
    expect(isColorVariation('Size')).toBe(false);
    expect(isColorVariation('Ink')).toBe(false);
  });
});

describe('resolveColorSwatch', () => {
  it('accepts hex codes', () => {
    expect(resolveColorSwatch('#fff')).toBe('#fff');
    expect(resolveColorSwatch('#1f2a44')).toBe('#1f2a44');
  });

  it('maps apparel color names that the browser cannot resolve', () => {
    expect(resolveColorSwatch('Navy')).toBe('#1f2a44');
    expect(resolveColorSwatch('heather gray')).toBe('#b7b7b7');
    expect(resolveColorSwatch('Royal Blue')).toBe('#2b4c9b');
  });

  it('resolves standard CSS color names', () => {
    expect(resolveColorSwatch('red')).toBe('red');
  });

  it('returns null for values that are not colors', () => {
    expect(resolveColorSwatch('Large')).toBeNull();
    expect(resolveColorSwatch('   ')).toBeNull();
  });
});
