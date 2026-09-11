// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ShortsAdminPage from './page';

const mocks = vi.hoisted(() => ({ admin: false, catalogue: vi.fn().mockResolvedValue({ places: [] }) }));
vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser: vi.fn().mockResolvedValue(null) }));
vi.mock('@/backend/auth/admin', () => ({ isAdminUser: () => mocks.admin }));
vi.mock('@/backend/request-locale', () => ({ getRequestLocale: async () => 'en' }));
vi.mock('@/backend/tour-mvp-data', () => ({ getTourMvpData: mocks.catalogue }));
vi.mock('@/frontend/components/common/direct-page-shell', () => ({ DirectPageShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/frontend/components/travel/shorts-editor', () => ({ ShortsEditor: () => <div>Video editor</div> }));

describe('shorts administration page authorization', () => {
  afterEach(() => { cleanup(); mocks.admin = false; vi.clearAllMocks(); });
  it('denies unauthorized visitors before loading catalogue data', async () => {
    render(await ShortsAdminPage());
    expect(screen.getByRole('alert')).toHaveTextContent('Administrator access is required.');
    expect(mocks.catalogue).not.toHaveBeenCalled();
  });
  it('loads the current locale catalogue for authorized administrators', async () => {
    mocks.admin = true;
    render(await ShortsAdminPage());
    expect(screen.getByText('Video editor')).toBeInTheDocument();
    expect(mocks.catalogue).toHaveBeenCalledWith('en');
  });
});
