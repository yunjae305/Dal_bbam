// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '@/frontend/components/common/feedback';

describe('EmptyState', () => {
  it('exposes status copy accessibly', () => {
    render(<EmptyState title="검색 결과 없음" description="필터를 바꿔 주세요." />);
    expect(screen.getByRole('status')).toHaveTextContent('검색 결과 없음');
    expect(screen.getByText('필터를 바꿔 주세요.')).toBeVisible();
  });
});
