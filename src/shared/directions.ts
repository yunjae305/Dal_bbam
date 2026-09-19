export type DirectionMode = 'car' | 'walking' | 'public' | 'bicycle';

export const directionModes: DirectionMode[] = ['walking', 'public', 'bicycle', 'car'];

export type DirectionStep = {
  guidance: string;
  type?: string;
  distanceMeters?: number;
  durationSeconds?: number;
};

export type DirectionSummary = {
  type?: string;
  transfers?: number;
  fareWon?: number;
};

export type DirectionResult = {
  mode: DirectionMode;
  distanceMeters: number;
  durationSeconds: number;
  path: [number, number][];
  externalUrl: string;
  webFallbackUrl: string;
  appUrl: string;
  source: string;
  pathSource?: 'provider' | 'straight-line';
  fallbackReason?: 'not-configured' | 'no-route' | 'provider-error';
  disclaimer?: string;
  summary?: DirectionSummary;
  steps?: DirectionStep[];
};

export type DirectionComparison = {
  origin: { lat: number; lng: number; name: string };
  destination: { lat: number; lng: number; name: string };
  straightDistanceMeters: number;
  results: DirectionResult[];
};

export function isFallbackDirection(result: Pick<DirectionResult, 'source'>): boolean {
  return result.source.startsWith('straight-line');
}

export function validRouteMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
