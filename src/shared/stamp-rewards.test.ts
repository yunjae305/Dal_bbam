import { describe, expect, it } from 'vitest';
import { localizeStampReward } from './stamp-rewards';

describe('stamp reward localization', () => {
  const reward = { id: 'reward', code: 'stamp-first-visit', title: '첫 달밤 여행자', description: '첫 현장 스탬프를 획득한 여행자 칭호', earnedAt: '2026-09-06' };

  it.each(['en', 'ja', 'zh'] as const)('translates built-in reward copy into %s while retaining earned state', lang => {
    const translated = localizeStampReward(reward, lang);
    expect(translated.title).not.toBe(reward.title);
    expect(translated.description).not.toBe(reward.description);
    expect(translated).toMatchObject({ id: reward.id, code: reward.code, earnedAt: reward.earnedAt });
  });

  it('preserves Korean and custom administrator copy', () => {
    expect(localizeStampReward(reward, 'ko')).toEqual(reward);
    const custom = { ...reward, code: 'custom-reward' };
    expect(localizeStampReward(custom, 'en')).toEqual(custom);
  });
});
