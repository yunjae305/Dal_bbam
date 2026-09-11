'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, EyeOff, LoaderCircle, ShieldAlert, XCircle } from 'lucide-react';
import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';

type ReportRow = {
  id: string;
  reason: string;
  detail: string | null;
  created_at: string;
  community_posts?: { title?: string; content?: string; author_name?: string } | null;
  community_comments?: { content?: string; author_name?: string } | null;
};

// Report reasons are stored as the codes /api/community/[id]/report accepts.
const reasonLabels: Record<string, string> = {
  spam: '스팸·광고', harassment: '욕설·괴롭힘', privacy: '개인정보 노출', illegal: '불법 정보', misinformation: '허위 정보', other: '기타'
};

export default function CommunityAdminPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/community/reports?status=open', { cache: 'no-store' });
      const payload = await response.json() as { data?: ReportRow[]; error?: { message?: string } };
      if (!response.ok) setError(payload.error?.message ?? '신고 큐를 불러오지 못했습니다.');
      else setReports(payload.data ?? []);
    } catch {
      setError('신고 큐를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function resolve(id: string, status: 'resolved' | 'dismissed', hideTarget: boolean) {
    setError('');
    try {
      const response = await fetch('/api/admin/community/reports', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, hideTarget })
      });
      if (response.ok) setReports(current => current.filter(report => report.id !== id));
      else {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? '신고 처리에 실패했습니다.');
      }
    } catch {
      setError('신고 처리에 실패했습니다. 네트워크 연결을 확인해 주세요.');
    }
  }

  return (
    <DirectPageShell>
      <section className="px-5 py-6">
        <header className="flex items-center gap-3"><ShieldAlert className="text-[#b94f4a]" /><div><h1 className="text-xl font-black">커뮤니티 신고 큐</h1><p className="text-xs text-[#68736f]">오래된 신고부터 검토합니다.</p></div></header>
        {loading && <p className="mt-10 flex items-center justify-center gap-2 text-sm"><LoaderCircle className="animate-spin" size={18} />불러오는 중</p>}
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
        {!loading && !reports.length && !error && <p className="mt-8 rounded-2xl bg-white p-6 text-center text-sm text-[#68736f]">처리할 신고가 없습니다.</p>}
        <div className="mt-5 grid gap-4">
          {reports.map(report => {
            const target = report.community_posts || report.community_comments;
            return <article key={report.id} className="rounded-[22px] bg-white p-5 shadow-sm ring-1 ring-black/5"><p className="text-xs font-black uppercase tracking-wide text-[#b94f4a]">{reasonLabels[report.reason] ?? report.reason}</p><h2 className="mt-2 font-black">{'title' in (target || {}) ? report.community_posts?.title : '댓글 신고'}</h2><p className="mt-2 line-clamp-4 text-sm leading-6 text-[#56625e]">{target?.content}</p>{report.detail && <p className="mt-3 rounded-xl bg-[#f5f6f5] p-3 text-xs">신고자 설명: {report.detail}</p>}<p className="mt-3 text-[11px] tabular-nums text-[#7a8580]">{new Date(report.created_at).toLocaleString('ko-KR')}</p><div className="mt-4 grid grid-cols-3 gap-2"><button type="button" onClick={() => void resolve(report.id, 'resolved', true)} className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-red-700 text-xs font-bold text-white transition-transform active:scale-[0.96]"><EyeOff size={15} />숨김</button><button type="button" onClick={() => void resolve(report.id, 'resolved', false)} className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-[#2f7567] text-xs font-bold text-white transition-transform active:scale-[0.96]"><CheckCircle2 size={15} />조치완료</button><button type="button" onClick={() => void resolve(report.id, 'dismissed', false)} className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-[#ecefeb] text-xs font-bold transition-transform active:scale-[0.96]"><XCircle size={15} />기각</button></div></article>;
          })}
        </div>
      </section>
    </DirectPageShell>
  );
}

