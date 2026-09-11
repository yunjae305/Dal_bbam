// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommunityAdminPage from './page';

vi.mock('@/frontend/components/common/direct-page-shell', () => ({ DirectPageShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

describe('community report queue', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('names the report reason instead of showing its stored code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [
      { id: 'r1', reason: 'other', detail: null, created_at: '2026-09-11T06:00:00Z', community_posts: { title: '신고된 글', content: '본문' } }
    ] }), { status: 200 })));
    render(<CommunityAdminPage />);
    expect(await screen.findByText('기타')).toBeInTheDocument();
    expect(screen.queryByText('other')).not.toBeInTheDocument();
  });
});
