import Link from 'next/link';

export type LegalSection = { title: string; paragraphs?: string[]; items?: string[] };

export function LegalPage({
  title,
  description,
  sections
}: {
  title: string;
  description: string;
  sections: LegalSection[];
}) {
  const operator = process.env.PUBLIC_OPERATOR_NAME?.trim();
  const contact = process.env.PRIVACY_CONTACT_EMAIL?.trim();
  const effectiveDate = process.env.LOCATION_TERMS_EFFECTIVE_DATE?.trim();
  const configured = Boolean(operator && contact && effectiveDate);

  return (
    <main className="min-h-dvh bg-[#eef3ee] px-5 py-8 text-[#202725]">
      <article className="mx-auto max-w-[720px] rounded-[28px] bg-white p-6 shadow-[0_18px_60px_rgba(19,55,47,0.12)] sm:p-10">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold text-[#2f7567]">← 달밤으로 돌아가기</Link>
        <header className="mt-4 border-b border-[#e4ebe7] pb-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2f7567]">DAL BBAM POLICY</p>
          <h1 className="mt-3 text-balance text-3xl font-black">{title}</h1>
          <p className="mt-3 text-pretty text-sm leading-6 text-[#65706c]">{description}</p>
          <dl className="mt-5 grid gap-2 rounded-2xl bg-[#f5f8f6] p-4 text-xs sm:grid-cols-2">
            <div><dt className="font-black">운영자</dt><dd className="mt-1">{operator || '환경설정 필요'}</dd></div>
            <div><dt className="font-black">문의</dt><dd className="mt-1">{contact || '환경설정 필요'}</dd></div>
            <div><dt className="font-black">시행일</dt><dd className="mt-1 tabular-nums">{effectiveDate || '환경설정 필요'}</dd></div>
          </dl>
          {!configured && (
            <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-900 ring-1 ring-amber-200">
              운영자·담당자·시행일이 아직 설정되지 않아 이 문서는 배포 준비 상태가 아닙니다.
            </p>
          )}
        </header>

        <div className="mt-7 space-y-8">
          {sections.map(section => (
            <section key={section.title}>
              <h2 className="text-balance text-lg font-black">{section.title}</h2>
              {section.paragraphs?.map(paragraph => <p key={paragraph} className="mt-3 text-pretty text-sm leading-7 text-[#4f5c57]">{paragraph}</p>)}
              {section.items && <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-[#4f5c57]">{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
            </section>
          ))}
        </div>

        <footer className="mt-10 border-t border-[#e4ebe7] pt-6 text-xs leading-5 text-[#65706c]">
          서비스 기능이나 처리 방식이 변경되면 문서를 개정하고 시행일 전에 알립니다. 상용 배포 전 대한민국 법률 전문가의 최종 검토가 필요합니다.
        </footer>
      </article>
    </main>
  );
}

