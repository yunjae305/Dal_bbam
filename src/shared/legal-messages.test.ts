import { describe, expect, it } from 'vitest';
import { legalDocuments, legalShell, type LegalPolicy } from './legal-messages';
import { languages } from './types';

const policies: LegalPolicy[] = ['terms', 'privacy', 'location'];

describe('legal policy translation completeness', () => {
  it.each(languages)('retains every policy section and paragraph/list entry in %s', locale => {
    expect(Object.keys(legalShell[locale]).sort()).toEqual(Object.keys(legalShell.ko).sort());
    for (const policy of policies) {
      const original = legalDocuments.ko[policy];
      const translated = legalDocuments[locale][policy];
      expect(translated.title.trim()).not.toBe('');
      expect(translated.description.trim()).not.toBe('');
      expect(translated.sections).toHaveLength(original.sections.length);
      translated.sections.forEach((section, index) => {
        expect(section.title.trim()).not.toBe('');
        expect(section.items?.length ?? 0).toBe(original.sections[index].items?.length ?? 0);
        expect(section.paragraphs?.length ?? 0).toBe(original.sections[index].paragraphs?.length ?? 0);
        for (const value of [...section.items ?? [], ...section.paragraphs ?? []]) expect(value.trim()).not.toBe('');
      });
    }
  });

  it.each(['en', 'ja', 'zh'] as const)('translates every Korean heading rather than falling back in %s', locale => {
    for (const policy of policies) legalDocuments[locale][policy].sections.forEach((section, index) => {
      expect(section.title).not.toBe(legalDocuments.ko[policy].sections[index].title);
      expect(section.title).not.toMatch(/[가-힣]/);
    });
  });
});
