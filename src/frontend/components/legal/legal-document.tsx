'use client';

import Link from 'next/link';
import { LocaleSwitcher } from '@/frontend/components/common/locale-switcher';
import { useLocale } from '@/frontend/i18n/locale-context';
import { legalDocuments, legalShell, type LegalPolicy } from '@/shared/legal-messages';

export function LegalDocument({ policy, operator, contact, effectiveDate }: {
  policy: LegalPolicy;
  operator: string | null;
  contact: string | null;
  effectiveDate: string | null;
}) {
  const { locale } = useLocale();
  const document = legalDocuments[locale][policy];
  const ui = legalShell[locale];
  const configured = Boolean(operator && contact && effectiveDate);

  return (
    <main className="min-h-dvh bg-[#eef3ee] px-5 py-8 text-[#202725]" lang={locale}>
      <article className="mx-auto max-w-[720px] rounded-[28px] bg-white p-6 shadow-[0_18px_60px_rgba(19,55,47,0.12)] sm:p-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold text-[#2f7567]">{ui.back}</Link>
          <div className="rounded-full bg-[#173e78] p-1 [&_button]:min-h-11 [&_button]:min-w-11"><LocaleSwitcher /></div>
        </div>
        <header className="mt-4 border-b border-[#e4ebe7] pb-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2f7567]">DAL BBAM POLICY</p>
          <h1 className="mt-3 text-balance text-3xl font-black">{document.title}</h1>
          <p className="mt-3 text-pretty text-sm leading-6 text-[#65706c]">{document.description}</p>
          <dl className="mt-5 grid gap-2 rounded-2xl bg-[#f5f8f6] p-4 text-xs sm:grid-cols-2">
            <div><dt className="font-black">{ui.operator}</dt><dd className="mt-1">{operator || ui.missing}</dd></div>
            <div><dt className="font-black">{ui.contact}</dt><dd className="mt-1">{contact || ui.missing}</dd></div>
            <div><dt className="font-black">{ui.effective}</dt><dd className="mt-1 tabular-nums">{effectiveDate || ui.missing}</dd></div>
          </dl>
          {!configured && <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-900 ring-1 ring-amber-200">{ui.unconfigured}</p>}
        </header>
        <div className="mt-7 space-y-8">
          {document.sections.map(section => <section key={section.title}>
            <h2 className="text-balance text-lg font-black">{section.title}</h2>
            {section.paragraphs?.map(paragraph => <p key={paragraph} className="mt-3 text-pretty text-sm leading-7 text-[#4f5c57]">{paragraph}</p>)}
            {section.items && <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-[#4f5c57]">{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
          </section>)}
        </div>
        <footer className="mt-10 border-t border-[#e4ebe7] pt-6 text-xs leading-5 text-[#65706c]">{ui.footer}</footer>
      </article>
    </main>
  );
}
