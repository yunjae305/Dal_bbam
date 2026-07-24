import { describe, expect, it } from 'vitest';
import { messages } from '@/shared/i18n';
import { languages, placeCategories } from '@/shared/types';

function keys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort();
}

describe('i18n dictionary', () => {
  it('has the same top-level and nested message keys in all four languages', () => {
    for (const lang of languages) {
      expect(keys(messages[lang])).toEqual(keys(messages.ko));
      for (const section of keys(messages.ko)) {
        expect(keys(messages[lang][section as keyof typeof messages.ko])).toEqual(
          keys(messages.ko[section as keyof typeof messages.ko])
        );
      }
    }
  });

  it('has a non-empty label for every category', () => {
    for (const lang of languages) {
      for (const category of placeCategories) {
        expect(messages[lang].categories[category].trim()).not.toBe('');
      }
    }
  });
});
