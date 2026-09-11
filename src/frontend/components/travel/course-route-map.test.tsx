// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CourseRouteMap } from '@/frontend/components/travel/course-route-map';
import type { CoursePlan } from '@/shared/types';
import { plannerMessages } from '@/shared/planner-messages';
vi.mock('@/frontend/i18n/locale-context', () => ({ useLocale: () => ({ locale: 'en' }) }));

const plan: CoursePlan = { title: 'Route', summary: '', transport: 'car', days: 2, generatedBy: 'fallback', timingSource: 'map-provider', totalDistanceMeters: 100, estimatedMinutes: 190,
  stops: [0, 1, 2].map(index => ({ contentId: String(index), order: index, stayMinutes: 60, reason: '', dayIndex: index === 2 ? 1 : 0, travelMinutes: index === 1 ? 10 : 0,
    ...(index === 1 ? { travelPath: [[35.85, 129.2], [35.851, 129.21]] as [number, number][] } : {}),
    place: { contentId: String(index), name: `Place ${index}`, category: 'heritage', address: '', description: '', tags: [], imageUrl: '', source: 'sample', coordinates: [35.85 + index * 0.001, 129.2] } })) };

afterEach(() => { cleanup(); delete window.kakao; vi.unstubAllEnvs(); });
describe('course map routes', () => {
  it('renders provider paths for each day and does not draw overnight transfers', async () => {
    const marker = vi.fn(); const polyline = vi.fn(); const detach = vi.fn();
    window.kakao = { maps: {
      load: (callback: () => void) => callback(),
      Map: class { setBounds() {} }, LatLng: class {}, LatLngBounds: class { extend() {} },
      Marker: class { constructor(options: unknown) { marker(options); } setMap = detach; },
      Polyline: class { constructor(options: unknown) { polyline(options); } setMap = detach; }
    } } as unknown as NonNullable<typeof window.kakao>;
    const view = render(<CourseRouteMap plan={plan} />);
    await waitFor(() => expect(marker).toHaveBeenCalledTimes(3));
    expect(polyline).toHaveBeenCalledTimes(1);
    expect(polyline).toHaveBeenCalledWith(expect.objectContaining({ strokeStyle: 'solid' }));
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveAttribute('href', expect.stringContaining('/link/by/car/'));
    view.unmount();
    expect(detach).toHaveBeenCalledWith(null);
  });
  it('keeps directions links available when the map SDK cannot load', async () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_JS_KEY', '');
    render(<CourseRouteMap plan={plan} />);
    expect(await screen.findByText(plannerMessages.en.mapUnavailable)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveTextContent('Place 0 → Place 1');
  });
});
