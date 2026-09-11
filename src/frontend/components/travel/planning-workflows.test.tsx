// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiCourseScreen } from '@/frontend/components/travel/ai-course-screen';
import { ItineraryScreen } from '@/frontend/components/travel/itinerary-screen';
import { TravelCartScreen } from '@/frontend/components/travel/travel-cart-screen';
import { messages } from '@/shared/i18n';
import { uiMessages } from '@/shared/ui-messages';
import { plannerMessages } from '@/shared/planner-messages';
import type { CoursePlan, Place } from '@/shared/types';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/frontend/i18n/locale-context', () => ({ useLocale: () => ({ locale: 'ko', messages: messages.ko }) }));
vi.mock('@/frontend/components/common/ui', () => ({ PhoneStatus: () => null, HeaderBar: ({ title }: { title: string }) => <h1>{title}</h1> }));

const planner = plannerMessages.ko;
const places: Place[] = ['Temple', 'Hotel', 'Restaurant'].map((name, index) => ({
  id: String(index), contentId: `place-${index}`, name, category: index === 1 ? 'lodging' : index === 2 ? 'food' : 'heritage',
  description: '', address: 'Gyeongju', distance: '', rating: 4, bestTime: '', image: '/test.jpg', tags: [], coordinates: [35.85 + index * 0.001, 129.2], translations: {}
}));
const rawItem = (index: number, visitDate = '2026-09-06') => ({ id: `item-${index}`, visit_date: visitDate, start_time: '09:00:00', stay_minutes: 60, sort_order: index, places: { content_id: places[index].contentId, name: places[index].name, image_url: '/test.jpg' } });
const response = (data: unknown, ok = true) => ({ ok, json: async () => ok ? { data } : { error: { message: 'Save failed' } } });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('course, itinerary and cart user flows', () => {
  it('lets a traveler delete a saved course after confirming', async () => {
    const saved = { id: 'course-1', title: '나에게 맞춘 경주 여행', description: null, transport: 'walking', is_curated: false, share_token: 'tok', course_places: [] };
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/courses' && !init?.method) return response([saved]);
      if (url === '/api/courses/course-1' && init?.method === 'DELETE') return response({ deleted: true });
      return response([]);
    });
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<AiCourseScreen places={places} />);
    const remove = await screen.findByRole('button', { name: uiMessages.ko.course.deleteCourseLabel.replace('{title}', saved.title) });
    fireEvent.click(remove);
    await waitFor(() => expect(screen.queryByText(saved.title)).not.toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledWith('/api/courses/course-1', { method: 'DELETE' });
  });


  it('creates a dated itinerary from the generated course and keeps every day and start time', async () => {
    const plan: CoursePlan = { title: 'Two-day trip', summary: 'History and food', generatedBy: 'fallback', transport: 'walking', totalDistanceMeters: 0, estimatedMinutes: 120, days: 2, timingSource: 'estimated', stops: [
      { contentId: 'place-0', order: 0, reason: 'History', stayMinutes: 60, dayIndex: 0, startTime: '09:00', endTime: '10:00' },
      { contentId: 'place-2', order: 1, reason: 'Food', stayMinutes: 60, dayIndex: 1, startTime: '10:00', endTime: '11:00' }
    ] };
    const fetcher = vi.fn(async (url: string) => response(url === '/api/courses/recommend' ? plan : url === '/api/schedules' ? { id: 'new-trip' } : []));
    vi.stubGlobal('fetch', fetcher);
    render(<AiCourseScreen places={places} />);
    fireEvent.change(screen.getByLabelText(uiMessages.ko.course.duration), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: messages.ko.ai.recommend }));
    await screen.findByText('Two-day trip');
    fireEvent.change(screen.getByLabelText(planner.startDate), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: planner.addSchedule }));
    expect(await screen.findByRole('link', { name: planner.openSchedule })).toHaveAttribute('href', '/schedule?id=new-trip');
    const call = fetcher.mock.calls.find(([url]) => url === '/api/schedules');
    const args = (call as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(args.body))).toMatchObject({ startDate: '2026-12-31', endDate: '2027-01-01', items: [
      { contentId: 'place-0', visitDate: '2026-12-31', startTime: '09:00' }, { contentId: 'place-2', visitDate: '2027-01-01', startTime: '10:00' }
    ] });
  });

  it('removes one itinerary place while preserving valid times on remaining visits', async () => {
    const schedule = { id: 'trip-1', title: 'Trip', start_date: '2026-09-06', end_date: '2026-09-07', schedule_places: [rawItem(0), rawItem(1)] };
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => response(options?.method === 'PATCH' ? { ...schedule, schedule_places: [rawItem(1)] } : [schedule]));
    vi.stubGlobal('fetch', fetcher);
    render(<ItineraryScreen places={places} />);
    fireEvent.click(await screen.findByRole('button', { name: planner.removePlace.replace('{name}', 'Temple') }));
    await waitFor(() => expect(screen.queryByRole('button', { name: planner.removePlace.replace('{name}', 'Temple') })).not.toBeInTheDocument());
    const options = fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1];
    expect(JSON.parse(String(options?.body))).toEqual({ items: [{ contentId: 'place-1', visitDate: '2026-09-06', startTime: '09:00', stayMinutes: 60 }] });
    fireEvent.click(screen.getByRole('button', { name: uiMessages.ko.itinerary.calendar }));
    expect(screen.getByText('2026-09-07')).toBeInTheDocument();
  });

  it('adds cart selections to the chosen itinerary/date and preserves existing visits', async () => {
    const schedules = [
      { id: 'trip-1', title: 'First trip', start_date: '2026-09-06', end_date: '2026-09-07', schedule_places: [] },
      { id: 'trip-2', title: 'Second trip', start_date: '2026-09-08', end_date: '2026-09-09', schedule_places: [rawItem(1, '2026-09-08')] }
    ];
    const cart = [{ id: 'cart-0', created_at: '', places: { content_id: 'place-0', name: 'Temple', category: 'heritage', image_url: '/test.jpg' } }];
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => response(options?.method === 'PATCH' ? {} : url === '/api/cart' ? cart : schedules));
    vi.stubGlobal('fetch', fetcher);
    render(<TravelCartScreen places={places} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Temple' }));
    fireEvent.change(screen.getByLabelText(planner.targetSchedule), { target: { value: 'trip-2' } });
    fireEvent.change(screen.getByLabelText(planner.targetDate), { target: { value: '2026-09-09' } });
    fireEvent.click(screen.getByRole('button', { name: uiMessages.ko.cart.addToSchedule }));
    await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => url === '/api/schedules/trip-2' && init?.method === 'PATCH')).toBe(true));
    const options = fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1];
    expect(JSON.parse(String(options?.body))).toEqual({ items: [
      { contentId: 'place-1', visitDate: '2026-09-08', startTime: '09:00', stayMinutes: 60 },
      { contentId: 'place-0', visitDate: '2026-09-09', stayMinutes: 60 }
    ] });
  });
});
