import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceContextPanel } from '../../components/ChatPanel/WorkspaceContextPanel';

describe('WorkspaceContextPanel', () => {
  it('shows the active note, scope summary, and selected text preview', () => {
    render(
      <WorkspaceContextPanel
        workspaceContext={{
          activeFileId: 'note-1',
          selectedFileIds: ['note-1', 'note-2'],
          selectedText: 'Focused runtime paragraph for the assistant.',
        }}
        activeFileName="Project Brief"
        contextScope="open-panes"
        includeSelectedText={true}
        onContextScopeChange={vi.fn()}
        onIncludeSelectedTextChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Workspace context')).toBeInTheDocument();
    expect(screen.getByText('Active note')).toBeInTheDocument();
    expect(screen.getByText('Project Brief')).toBeInTheDocument();
    expect(screen.getAllByText('Open panes')).toHaveLength(2);
    expect(screen.getAllByText('Selected text').length).toBeGreaterThan(0);
    expect(screen.getByText(/Focused runtime paragraph for the assistant\./i)).toBeInTheDocument();
  });

  it('lets the user switch scope and highlighted-text injection', () => {
    const onContextScopeChange = vi.fn();
    const onIncludeSelectedTextChange = vi.fn();

    render(
      <WorkspaceContextPanel
        workspaceContext={{
          activeFileId: 'note-1',
          selectedFileIds: ['note-1', 'note-2'],
          selectedText: 'Selected evidence',
        }}
        activeFileName="Project Brief"
        contextScope="focused-note"
        includeSelectedText={true}
        onContextScopeChange={onContextScopeChange}
        onIncludeSelectedTextChange={onIncludeSelectedTextChange}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /Open panes/i }));
    expect(onContextScopeChange).toHaveBeenCalledWith('open-panes');

    fireEvent.click(screen.getByRole('checkbox', { name: /Include highlighted text/i }));
    expect(onIncludeSelectedTextChange).toHaveBeenCalledWith(false);
  });
});
