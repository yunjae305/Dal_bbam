import { describe, expect, it } from 'vitest';
import { mapTourPlaceSummary } from '@/backend/tour-mvp-data';

describe('nearby TourAPI place mapping', () => {
  it('maps provider longitude/latitude and distance into the shared place model', () => {
    const place = mapTourPlaceSummary({
      contentid: '125780',
      contenttypeid: '14',
      title: '테스트 문화유산',
      addr1: '경상북도 경주시',
      mapx: '129.2247',
      mapy: '35.8562',
      dist: '320',
      firstimage: 'https://example.com/place.jpg'
    });

    expect(place).toMatchObject({
      contentId: '125780',
      category: 'heritage',
      distance: '320m',
      coordinates: [35.8562, 129.2247],
      source: 'tour-api'
    });
  });
});
