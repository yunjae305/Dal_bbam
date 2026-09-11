// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LegalDocument } from './legal-document';
import { LocaleProvider } from '@/frontend/i18n/locale-context';
import { legalDocuments, legalShell, type LegalPolicy } from '@/shared/legal-messages';
import { languages } from '@/shared/types';
import { localeCookieName } from '@/shared/i18n';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('locale-aware legal policy pages', () => {
  afterEach(() => { cleanup(); window.localStorage.clear(); });

  it.each(languages)('renders all three policies in %s with unchanged operator metadata', locale => {
    for (const policy of ['terms', 'privacy', 'location'] as LegalPolicy[]) {
      const view = render(<LocaleProvider initialLocale={locale}><LegalDocument policy={policy} operator="Test Operator" contact="privacy@example.com" effectiveDate="2026-09-06" /></LocaleProvider>);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(legalDocuments[locale][policy].title);
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(legalDocuments[locale][policy].sections.length);
      expect(screen.getByText('Test Operator')).toBeInTheDocument();
      expect(screen.getByText('privacy@example.com')).toBeInTheDocument();
      expect(screen.getByText('2026-09-06')).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('switches document content and missing-configuration labels with the active locale', () => {
    render(<LocaleProvider initialLocale="ko"><LegalDocument policy="privacy" operator={null} contact={null} effectiveDate={null} /></LocaleProvider>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(legalDocuments.ko.privacy.title);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(legalDocuments.en.privacy.title);
    expect(screen.getByRole('status')).toHaveTextContent(legalShell.en.unconfigured);
    expect(screen.getAllByText(legalShell.en.missing)).toHaveLength(3);
    expect(document.cookie).toContain(`${localeCookieName}=en`);
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
  });
});
