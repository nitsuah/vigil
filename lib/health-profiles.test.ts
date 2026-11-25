import { describe, it, expect } from 'vitest';
import {
  HEALTH_PROFILES,
  DEFAULT_HEALTH_PROFILE,
  isHealthProfileId,
  getHealthProfile,
  type HealthProfileId,
} from './health-profiles';

describe('HEALTH_PROFILES', () => {
  it('has exactly three profiles with matching keys and ids', () => {
    const keys = Object.keys(HEALTH_PROFILES);
    expect(keys).toEqual(['starter', 'production', 'enterprise']);

    for (const key of keys) {
      expect(HEALTH_PROFILES[key as HealthProfileId].id).toBe(key);
    }
  });

  it('each profile has six weights summing to 100, all positive', () => {
    for (const key of Object.keys(HEALTH_PROFILES) as HealthProfileId[]) {
      const profile = HEALTH_PROFILES[key];
      const weights = profile.weights;
      const weightKeys = [
        'security',
        'testing',
        'bestPractices',
        'documentation',
        'community',
        'activity',
      ] as const;

      for (const w of weightKeys) {
        expect(weights[w]).toBeGreaterThan(0);
      }

      const sum = weightKeys.reduce((acc, w) => acc + weights[w], 0);
      expect(sum).toBe(100);
    }
  });

  it('each profile has a non-empty array of unique requiredSecurityControls', () => {
    for (const key of Object.keys(HEALTH_PROFILES) as HealthProfileId[]) {
      const controls = HEALTH_PROFILES[key].requiredSecurityControls;
      expect(Array.isArray(controls)).toBe(true);
      expect(controls.length).toBeGreaterThan(0);
      const unique = new Set(controls);
      expect(unique.size).toBe(controls.length);
    }
  });
});

describe('DEFAULT_HEALTH_PROFILE', () => {
  it('is production', () => {
    expect(DEFAULT_HEALTH_PROFILE).toBe('production');
  });
});

describe('isHealthProfileId', () => {
  it('returns true for valid ids', () => {
    expect(isHealthProfileId('starter')).toBe(true);
    expect(isHealthProfileId('production')).toBe(true);
    expect(isHealthProfileId('enterprise')).toBe(true);
  });

  it('returns false for invalid values', () => {
    expect(isHealthProfileId('Starter')).toBe(false);
    expect(isHealthProfileId('')).toBe(false);
    expect(isHealthProfileId(null)).toBe(false);
    expect(isHealthProfileId(undefined)).toBe(false);
    expect(isHealthProfileId(42)).toBe(false);
  });
});

describe('getHealthProfile', () => {
  it('returns the matching profile for each valid id', () => {
    expect(getHealthProfile('starter').id).toBe('starter');
    expect(getHealthProfile('production').id).toBe('production');
    expect(getHealthProfile('enterprise').id).toBe('enterprise');
  });

  it('falls back to production profile for unknown id and undefined', () => {
    expect(getHealthProfile('nope').id).toBe('production');
    expect(getHealthProfile(undefined).id).toBe('production');
  });
});