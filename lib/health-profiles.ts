export type HealthProfileId = 'starter' | 'production' | 'enterprise';

export interface HealthProfile {
  id: HealthProfileId;
  label: string;
  description: string;
  weights: {
    security: number;
    testing: number;
    bestPractices: number;
    documentation: number;
    community: number;
    activity: number;
  };
  requiredSecurityControls: Array<
    'securityPolicy' | 'privateVulnerabilityReporting' | 'dependabotAlerts' | 'codeScanning' | 'secretScanning'
  >;
}

export const HEALTH_PROFILES: Record<HealthProfileId, HealthProfile> = {
  starter: {
    id: 'starter',
    label: 'Starter',
    description: 'Core hygiene for personal projects, prototypes, and small open-source repos.',
    weights: {
      security: 15,
      testing: 15,
      bestPractices: 20,
      documentation: 25,
      community: 5,
      activity: 20,
    },
    requiredSecurityControls: ['securityPolicy', 'dependabotAlerts'],
  },
  production: {
    id: 'production',
    label: 'Production',
    description: 'Balanced expectations for software that is actively deployed or maintained.',
    weights: {
      security: 25,
      testing: 20,
      bestPractices: 20,
      documentation: 15,
      community: 10,
      activity: 10,
    },
    requiredSecurityControls: [
      'securityPolicy',
      'privateVulnerabilityReporting',
      'dependabotAlerts',
      'codeScanning',
      'secretScanning',
    ],
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    description: 'Stricter governance, security coverage, and engineering hygiene expectations.',
    weights: {
      security: 30,
      testing: 20,
      bestPractices: 20,
      documentation: 10,
      community: 15,
      activity: 5,
    },
    requiredSecurityControls: [
      'securityPolicy',
      'privateVulnerabilityReporting',
      'dependabotAlerts',
      'codeScanning',
      'secretScanning',
    ],
  },
};

export const DEFAULT_HEALTH_PROFILE: HealthProfileId = 'production';

export function isHealthProfileId(value: unknown): value is HealthProfileId {
  return value === 'starter' || value === 'production' || value === 'enterprise';
}

export function getHealthProfile(value: unknown): HealthProfile {
  return HEALTH_PROFILES[isHealthProfileId(value) ? value : DEFAULT_HEALTH_PROFILE];
}
