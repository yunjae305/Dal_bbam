/** Short distance label shared by the map and the stamp tour: "91m", "14.0km", "288km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(1, Math.round(meters))}m`;
  const km = meters / 1000;
  return km < 100 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`;
}
