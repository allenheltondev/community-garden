import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom does not implement matchMedia; several components (e.g. PlantLoader's
// prefers-reduced-motion check) call it during render. Provide a no-op default
// so any test that renders those components works without bespoke setup.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}
