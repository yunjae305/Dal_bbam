export type Feature = 'ai' | 'community';

export function isFeatureEnabled(feature: Feature): boolean {
  const value = process.env[`FEATURE_${feature.toUpperCase()}`];
  return value === undefined || !['0', 'false', 'off'].includes(value.trim().toLowerCase());
}

/**
 * The shorts video feed stays hidden until real videos are in place. Unlike the
 * flags above this one is opt-in, so an environment that never sets it shows the
 * "coming soon" notice instead of an empty feed. Admin registration and the
 * stored shorts rows are untouched by this flag.
 */
export function isShortsFeedEnabled(): boolean {
  return ['1', 'true', 'on'].includes(process.env.FEATURE_SHORTS?.trim().toLowerCase() ?? '');
}
