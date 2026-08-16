import { describe, expect, it } from 'vitest';
import { localeOptions } from './formattingLocales';

describe('localeOptions', () => {
  it('always offers the saved locale first', () => {
    const options = localeOptions('fr-CA', 'en-US');

    expect(options[0].value).toBe('fr-CA');
  });

  it('offers the device locale and says so', () => {
    const options = localeOptions('en-US', 'en-GB');
    const device = options.find((option) => option.value === 'en-GB');

    expect(device?.label).toMatch(/this device/i);
  });

  it('does not label the saved locale as the device one', () => {
    const options = localeOptions('en-GB', 'en-GB');

    expect(options[0].value).toBe('en-GB');
    expect(options[0].label).not.toMatch(/this device/i);
  });

  it('lists each locale once', () => {
    const values = localeOptions('en-US', 'en-US').map((option) => option.value);

    expect(new Set(values).size).toBe(values.length);
  });

  it('describes a locale with a worked example rather than a raw tag', () => {
    const [option] = localeOptions('en-US', 'en-US');

    expect(option.label).toMatch(/March/);
  });

  it('survives a locale tag Intl cannot describe', () => {
    const options = localeOptions('not-a-locale', 'en-US');

    expect(options[0].value).toBe('not-a-locale');
    expect(options[0].label.length).toBeGreaterThan(0);
  });
});
