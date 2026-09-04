import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildStampArtworkPrompt,
  checkpointRequiredForTarget,
  getStampCatalog,
  hashCheckpointToken,
  isInGyeongjuServiceArea,
  issueCheckpointToken,
  stampMaxAccuracyMeters,
  stampRadiusMeters
} from '@/backend/stamps';

afterEach(() => {
  delete process.env.STAMP_REQUIRE_CHECKPOINT;
  delete process.env.STAMP_MAX_ACCURACY_M;
  delete process.env.STAMP_RADIUS_M;
});

describe('stamp hardening helpers', () => {
  it('enforces Gyeongju bounds and bounded GPS configuration', () => {
    expect(isInGyeongjuServiceArea(35.8562, 129.2247)).toBe(true);
    expect(isInGyeongjuServiceArea(37.5665, 126.978)).toBe(false);
    process.env.STAMP_MAX_ACCURACY_M = '9999';
    process.env.STAMP_RADIUS_M = '1';
    expect(stampMaxAccuracyMeters()).toBe(250);
    expect(stampRadiusMeters()).toBe(25);
  });

  it('lets the global checkpoint switch fail closed for every target', () => {
    expect(checkpointRequiredForTarget(false)).toBe(false);
    process.env.STAMP_REQUIRE_CHECKPOINT = 'true';
    expect(checkpointRequiredForTarget(false)).toBe(true);
  });

  it('issues high-entropy checkpoint tokens while exposing only a stable hash', () => {
    const first = issueCheckpointToken();
    const second = issueCheckpointToken();
    expect(first.token).not.toBe(second.token);
    expect(first.token.length).toBeGreaterThanOrEqual(40);
    expect(first.tokenHash).toBe(hashCheckpointToken(first.token));
    expect(first.tokenHash).not.toContain(first.token);
  });

  it('anchors administrator art direction inside a text-free stamp prompt', () => {
    const prompt = buildStampArtworkPrompt({
      placeName: '동궁과 월지',
      category: 'heritage',
      description: '신라 왕궁의 별궁 터와 야경',
      artDirection: '연꽃 실루엣을 강조'
    });
    expect(prompt).toContain('Landmark: 동궁과 월지');
    expect(prompt).toContain('Do not include any words');
    expect(prompt).toContain('연꽃 실루엣을 강조');
  });
});

describe('getStampCatalog', () => {
  function catalogDb(targets: Array<Record<string, unknown>>) {
    const chain = (rows: unknown[]) => {
      const query: Record<string, unknown> = {
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }
      };
      for (const name of ['select', 'eq', 'in', 'order']) query[name] = () => query;
      return query;
    };
    return {
      from: (table: string) => chain(table === 'stamp_targets' ? targets : [])
    } as unknown as SupabaseClient;
  }

  it('skips a target with invalid coordinates instead of failing the whole catalogue', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const valid = {
      id: 'target-ok',
      checkpoint_required: false,
      radius_m: 120,
      sort_order: 1,
      places: { id: 'place-ok', content_id: '100', name: '첨성대', category: 'heritage', image_url: null, lat: 35.8347, lng: 129.2189 }
    };
    const broken = {
      id: 'target-broken',
      checkpoint_required: false,
      radius_m: null,
      sort_order: 0,
      places: { id: 'place-broken', content_id: '200', name: '좌표 없음', category: 'attraction', image_url: null, lat: null, lng: null }
    };
    const outside = {
      id: 'target-seoul',
      checkpoint_required: false,
      radius_m: null,
      sort_order: 2,
      places: { id: 'place-seoul', content_id: '300', name: '서울', category: 'attraction', image_url: null, lat: 37.5665, lng: 126.978 }
    };

    const catalog = await getStampCatalog(catalogDb([broken, valid, outside]));

    expect(catalog.map(target => target.id)).toEqual(['target-ok']);
    expect(catalog[0]).toMatchObject({ place: { contentId: '100', lat: 35.8347, lng: 129.2189 }, artworkStatus: 'unavailable' });
    expect(error).toHaveBeenCalledTimes(2);
    expect(String(error.mock.calls[0][0])).toContain('STAMP_TARGET_INVALID');
    error.mockRestore();
  });
});
