export type Feature = 'ai' | 'community';

export function isFeatureEnabled(feature: Feature): boolean {
  const value = process.env[`FEATURE_${feature.toUpperCase()}`];
  return value === undefined || !['0', 'false', 'off'].includes(value.trim().toLowerCase());
}
