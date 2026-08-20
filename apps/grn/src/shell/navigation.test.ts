import { describe, expect, it } from 'vitest';
import {
  LEGACY_ROUTE_REDIRECTS,
  PRIMARY_NAVIGATION,
  isPrimaryDestinationActive,
} from './navigation';

describe('primary navigation', () => {
  it('exposes the four grower destinations', () => {
    // Settings is a primary destination rather than an avatar-menu-only
    // link: people looking for their profile or API keys searched the nav
    // for it and did not find it behind the avatar.
    expect(PRIMARY_NAVIGATION).toEqual([
      { id: 'today', label: 'Today', path: '/' },
      { id: 'garden', label: 'Garden', path: '/garden' },
      { id: 'share', label: 'Share', path: '/share' },
      { id: 'settings', label: 'Settings', path: '/settings' },
    ]);
  });

  it.each([
    ['today', '/', true],
    ['today', '/today/reminders', true],
    ['today', '/garden', false],
    ['garden', '/garden', true],
    ['garden', '/garden/plants/new', true],
    ['garden', '/garden/plan/recommendations', true],
    ['garden', '/share', false],
    ['share', '/share', true],
    ['share', '/share/find', true],
    ['share', '/settings', false],
    ['settings', '/settings', true],
    ['settings', '/settings/api-keys', true],
    ['settings', '/settings/api-keys/reference', true],
    ['settings', '/garden', false],
  ] as const)('marks %s active for %s as %s', (destination, pathname, expected) => {
    expect(isPrimaryDestinationActive(destination, pathname)).toBe(expected);
  });

  it('keeps every prior feature path addressable through a canonical destination', () => {
    expect(LEGACY_ROUTE_REDIRECTS).toEqual({
      '/crops': '/garden/plants',
      '/crops/new': '/garden/plants/new',
      '/planner': '/garden/plan',
      '/recommendations': '/garden/plan/recommendations',
      '/listings': '/share/listings',
      '/connect': '/share',
      '/requests': '/share/find',
      '/reminders': '/today/reminders',
    });
  });
});
