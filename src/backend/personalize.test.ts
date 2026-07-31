import { describe, expect, it } from 'vitest';
import { rankPersonalizedPlaces, type PersonalizationSignals } from './personalize';
import type { PlaceCategory, PlaceSummary } from '@/shared/types';

function summary(contentId: string, category: PlaceCategory, rating = 4): PlaceSummary {
  return {
    contentId,
    category,
    name: contentId,
    description: '',
    address: '경주시',
    imageUrl: '/login-spring-bg.png',
    coordinates: [35.8562, 129.2247],
    tags: [],
    rating,
    source: 'database'
  };
}

const noSignals: PersonalizationSignals = {
  viewedContentIds: [],
  viewedCategories: [],
  cartCategories: []
};

describe('rankPersonalizedPlaces', () => {
  it('returns nothing for users without signals', () => {
    const places = [summary('a', 'heritage'), summary('b', 'food')];
    expect(rankPersonalizedPlaces(places, noSignals)).toEqual([]);
  });

  it('prefers categories the user viewed and excludes already-viewed places', () => {
    const places = [
      summary('seen-heritage', 'heritage'),
      summary('new-heritage', 'heritage'),
      summary('new-food', 'food', 5)
    ];
    const ranked = rankPersonalizedPlaces(places, {
      viewedContentIds: ['seen-heritage'],
      viewedCategories: ['heritage'],
      cartCategories: []
    });

    expect(ranked.map(item => item.place.contentId)).toEqual(['new-heritage', 'new-food']);
    expect(ranked[0].reasonCategory).toBe('heritage');
    expect(ranked[1].reasonCategory).toBeNull();
  });

  it('weights cart categories above single views', () => {
    const places = [summary('h', 'heritage'), summary('f', 'food')];
    const ranked = rankPersonalizedPlaces(places, {
      viewedContentIds: [],
      viewedCategories: ['heritage'],
      cartCategories: ['food']
    });
    expect(ranked[0].place.contentId).toBe('f');
    expect(ranked[0].reasonCategory).toBe('food');
  });

  it('falls back to rating order when no category matches remain', () => {
    const places = [summary('low', 'nature', 3), summary('high', 'nature', 5)];
    const ranked = rankPersonalizedPlaces(places, {
      viewedContentIds: ['gone'],
      viewedCategories: ['food'],
      cartCategories: []
    });
    expect(ranked.map(item => item.place.contentId)).toEqual(['high', 'low']);
    expect(ranked.every(item => item.reasonCategory === null)).toBe(true);
  });

  it('respects the limit', () => {
    const places = Array.from({ length: 10 }, (_, index) => summary(`p${index}`, 'heritage'));
    const ranked = rankPersonalizedPlaces(places, {
      viewedContentIds: [],
      viewedCategories: ['heritage'],
      cartCategories: []
    }, 4);
    expect(ranked).toHaveLength(4);
  });
});
