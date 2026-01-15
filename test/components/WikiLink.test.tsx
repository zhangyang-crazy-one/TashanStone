/**
 * WikiLink Component Tests
 * test/components/WikiLink.test.tsx
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WikiLink } from '../../components/WikiLink';
import { MarkdownFile } from '../../types';

const mockFiles: MarkdownFile[] = [
  { id: '1', name: 'TestPage', content: 'Test content here', lastModified: Date.now() }
];

describe('WikiLink', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders link with correct text', () => {
    render(
      <WikiLink
        href="?wiki=TestPage"
        files={mockFiles}
        onNavigate={() => {}}
      >
        TestPage
      </WikiLink>
    );

    expect(screen.getByText('[[TestPage]]')).toBeInTheDocument();
  });

  it('does not show preview immediately on hover', () => {
    render(
      <WikiLink
        href="?wiki=TestPage"
        files={mockFiles}
        onNavigate={() => {}}
      >
        TestPage
      </WikiLink>
    );

    fireEvent.mouseEnter(screen.getByText('[[TestPage]]'));
    
    expect(screen.queryByText(/Test content/)).not.toBeInTheDocument();
  });

  it('calls onNavigate when clicked', () => {
    const onNavigate = vi.fn();

    render(
      <WikiLink
        href="?wiki=TestPage"
        files={mockFiles}
        onNavigate={onNavigate}
      >
        TestPage
      </WikiLink>
    );

    fireEvent.click(screen.getByText('[[TestPage]]'));

    expect(onNavigate).toHaveBeenCalledWith('1');
  });

  it('shows non-existent link style when target not found', () => {
    render(
      <WikiLink
        href="?wiki=NonExistent"
        files={mockFiles}
        onNavigate={() => {}}
      >
        NonExistent
      </WikiLink>
    );

    const link = screen.getByText('[[NonExistent]]').closest('a');
    expect(link).toHaveClass('text-slate-400');
  });
});
