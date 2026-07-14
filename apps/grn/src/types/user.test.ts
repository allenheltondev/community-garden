import { describe, it, expect } from 'vitest';
import type { UserType, UserProfile, GrowerProfile } from './user';

describe('User Types', () => {
  describe('UserType', () => {
    it('should accept the grower user type', () => {
      const grower: UserType = 'grower';

      expect(grower).toBe('grower');
    });
  });

  describe('GrowerProfile', () => {
    it('should accept valid grower profile', () => {
      const profile: GrowerProfile = {
        homeZone: '8a',
        address: '123 Main St, Springfield, IL',
        geoKey: '9q8yy9',
        lat: 37.7749,
        lng: -122.4194,
        shareRadiusMiles: 5.0,
        isOrganization: false,
        units: 'imperial',
        locale: 'en-US',
      };

      expect(profile.homeZone).toBe('8a');
      expect(profile.shareRadiusMiles).toBe(5.0);
      expect(profile.units).toBe('imperial');
    });

    it('should accept optional timestamp fields', () => {
      const profile: GrowerProfile = {
        homeZone: '8a',
        address: '123 Main St, Springfield, IL',
        geoKey: '9q8yy9',
        lat: 37.7749,
        lng: -122.4194,
        shareRadiusMiles: 5.0,
        isOrganization: false,
        units: 'metric',
        locale: 'en-US',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z',
      };

      expect(profile.createdAt).toBeDefined();
      expect(profile.updatedAt).toBeDefined();
    });

    it('should accept organization grower metadata', () => {
      const profile: GrowerProfile = {
        homeZone: '8a',
        address: '800 Community Garden Way, Austin, TX 78701',
        geoKey: '9q8yy9',
        lat: 30.2672,
        lng: -97.7431,
        shareRadiusMiles: 12.0,
        isOrganization: true,
        organizationName: 'North Austin Community Garden',
        units: 'imperial',
        locale: 'en-US',
      };

      expect(profile.isOrganization).toBe(true);
      expect(profile.organizationName).toBe('North Austin Community Garden');
    });
  });

  describe('UserProfile', () => {
    it('should accept user with no onboarding', () => {
      const user: UserProfile = {
        id: 'test-uuid',
        email: 'test@example.com',
        displayName: 'Jane Doe',
        userType: null,
        onboardingCompleted: false,
        subscription: { tier: 'free' },
      };

      expect(user.userType).toBeNull();
      expect(user.onboardingCompleted).toBe(false);
    });

    it('should accept grower user with profile', () => {
      const user: UserProfile = {
        id: 'test-uuid',
        email: 'grower@example.com',
        displayName: 'John Grower',
        userType: 'grower',
        onboardingCompleted: true,
        subscription: { tier: 'free' },
        growerProfile: {
          homeZone: '8a',
          address: '123 Main St, Springfield, IL',
          geoKey: '9q8yy9',
          lat: 37.7749,
          lng: -122.4194,
          shareRadiusMiles: 5.0,
          isOrganization: false,
          units: 'imperial',
          locale: 'en-US',
        },
      };

      expect(user.userType).toBe('grower');
      expect(user.growerProfile).toBeDefined();
      expect(user.growerProfile?.homeZone).toBe('8a');
    });

    it('exposes tier under subscription', () => {
      const user: UserProfile = {
        id: 'test-uuid',
        email: 'pro@example.com',
        displayName: 'Pro User',
        userType: 'grower',
        onboardingCompleted: true,
        subscription: { tier: 'pro', subscriptionStatus: 'active', proExpiresAt: '2026-12-31T00:00:00Z' },
      };

      expect(user.subscription.tier).toBe('pro');
      expect(user.subscription.subscriptionStatus).toBe('active');
    });
  });
});
