// The profile carries a locale that decides how dates read across the app —
// the month names on Today's seasonal guide, for instance. It is captured once
// from the browser during setup and then never revisited, which is wrong for
// anyone who set the app up on a borrowed device or moved country.
//
// Rather than ask for a raw locale tag, the picker offers a short list with a
// worked example of each, so the choice is legible without knowing what
// "en-GB" means.

export interface LocaleOption {
  value: string;
  label: string;
}

const COMMON_LOCALES = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'es-US', 'es-MX', 'fr-CA', 'de-DE'];

const SAMPLE_DATE = new Date(Date.UTC(2026, 2, 9));

function describe(locale: string): string {
  try {
    const language = new Intl.DisplayNames([locale], { type: 'language' }).of(locale);
    const sample = new Intl.DateTimeFormat(locale, {
      month: 'long',
      day: 'numeric',
    }).format(SAMPLE_DATE);
    return `${language ?? locale} — ${sample}`;
  } catch {
    return locale;
  }
}

/**
 * Build the picker's options: whatever the grower has saved, the current
 * device's locale, then the common ones. Deduped, and the saved locale always
 * appears first so it is never silently absent from its own control.
 */
export function localeOptions(
  savedLocale: string,
  deviceLocale: string = typeof navigator === 'undefined' ? 'en-US' : navigator.language
): LocaleOption[] {
  const seen = new Set<string>();
  const options: LocaleOption[] = [];

  for (const locale of [savedLocale, deviceLocale, ...COMMON_LOCALES]) {
    const tag = locale?.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    options.push({
      value: tag,
      label: tag === deviceLocale && tag !== savedLocale ? `${describe(tag)} (this device)` : describe(tag),
    });
  }

  return options;
}
