import { describe, expect, it } from 'vitest';
import { getStampThemeProgress } from './stamp-themes';
import type { PlaceCategory } from './types';

const place = (contentId: string, category: PlaceCategory) => ({ contentId, category });

describe('getStampThemeProgress', () => {
  it('groups places into themes and counts acquired stamps', () => {
    const places = [
      place('h1', 'heritage'),
      place('h2', 'heritage'),
      place('f1', 'food'),
      place('n1', 'nature')
    ];
    const progress = getStampThemeProgress(places, new Set(['h1', 'f1']));

    const history = progress.find(item => item.theme.id === 'history');
    expect(history).toMatchObject({ total: 2, acquired: 1, completed: false });

    const food = progress.find(item => item.theme.id === 'food');
    expect(food).toMatchObject({ total: 1, acquired: 1, completed: true });

    const nature = progress.find(item => item.theme.id === 'nature');
    expect(nature).toMatchObject({ total: 1, acquired: 0, completed: false });
  });

  it('omits themes without matching places', () => {
    const progress = getStampThemeProgress([place('h1', 'heritage')], new Set());
    expect(progress.map(item => item.theme.id)).toEqual(['history']);
  });

  it('counts experience places toward the nature theme', () => {
    const progress = getStampThemeProgress([place('e1', 'experience')], new Set(['e1']));
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ total: 1, acquired: 1, completed: true });
    expect(progress[0].theme.id).toBe('nature');
  });

  it('counts attraction landmarks toward the history theme', () => {
    // 첨성대 and 대릉원 arrive from TourAPI as attractions, not heritage.
    const progress = getStampThemeProgress(
      [place('cheomseongdae', 'attraction'), place('bulguksa', 'heritage'), place('daereungwon', 'attraction')],
      new Set(['cheomseongdae'])
    );
    expect(progress).toHaveLength(1);
    expect(progress[0].theme.id).toBe('history');
    expect(progress[0]).toMatchObject({ total: 3, acquired: 1, completed: false });
  });

  it('places every category the stamp seed can pick into some theme', () => {
    const seeded: PlaceCategory[] = ['heritage', 'attraction', 'food', 'nature'];
    const progress = getStampThemeProgress(seeded.map(category => place(category, category)), new Set());
    const grouped = progress.reduce((sum, item) => sum + item.total, 0);
    expect(grouped).toBe(seeded.length);
  });

  it('never marks an empty selection as completed', () => {
    const progress = getStampThemeProgress(
      [place('h1', 'heritage'), place('h2', 'heritage')],
      new Set()
    );
    expect(progress[0].completed).toBe(false);
  });
});
