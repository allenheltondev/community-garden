# PWA Icons

This directory contains the app icons for the Progressive Web App.

## Current Icons

- `icon-192x192.png` - 192x192 icon (required for PWA)
- `icon-512x512.png` - 512x512 icon (required for PWA)

## Regenerating Icons

If you need to regenerate the icons (e.g., with a new design), run:

```bash
node scripts/generate-icons.mjs
```

This will create simple placeholder icons with a green background and white plant symbol.

## Custom Icons

For production, replace these placeholder icons with professionally designed icons that match your brand. The icons should:

- Be PNG format
- Have transparent or solid backgrounds
- Be optimized for mobile display
- Follow PWA icon guidelines
- Include at least 192x192 and 512x512 sizes

The manifest.json references these icons with `purpose: "any maskable"` to ensure they work well on all platforms.
