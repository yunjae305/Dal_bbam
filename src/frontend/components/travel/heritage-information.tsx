'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useLocale } from '@/frontend/i18n/locale-context';
import { heritageMessages, type HeritageRecord } from '@/shared/heritage';

export function HeritageInformation({ contentId }: { contentId: string }) {
  const { locale } = useLocale();
  const copy = heritageMessages[locale];
  const [result, setResult] = useState<{ contentId: string; record: HeritageRecord | null } | null>(null);
  const record = result?.contentId === contentId ? result.record : null;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/places/${encodeURIComponent(contentId)}/heritage`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const payload = await response.json();
        if (!controller.signal.aborted) setResult({ contentId, record: payload.data ?? null });
      }).catch(() => { /* The base TourAPI information remains visible on failure. */ });
    return () => controller.abort();
  }, [contentId]);
  if (!record) return null;
  return <section className="rounded-2xl bg-white p-5 shadow-sm">
    <h2 className="text-sm font-black">{copy.title}</h2>
    <p className="mt-2 text-xs font-bold" lang="ko">{record.designation} · {record.name}</p>
    <p className="mt-1 text-[10px] text-[#69717e]">{copy.original}</p>
    <p className="mt-3 whitespace-pre-line text-xs leading-6 text-[#616a67]" lang="ko">{record.description}</p>
    <dl className="mt-3 space-y-2 text-xs">
      {record.era && <div><dt className="font-bold">{copy.era}</dt><dd lang="ko">{record.era}</dd></div>}
      {record.designatedDate && <div><dt className="font-bold">{copy.date}</dt><dd>{record.designatedDate}</dd></div>}
    </dl>
    <a href={record.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-[#223c72] underline underline-offset-4">
      {copy.source}<ExternalLink size={13} aria-hidden="true" />
    </a>
  </section>;
}
