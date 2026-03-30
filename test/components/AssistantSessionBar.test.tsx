import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AssistantSessionBar } from '../../components/ChatPanel/AssistantSessionBar';
import type { AssistantSessionRecord } from '../../src/services/assistant-runtime/sessionTypes';

function createSession(overrides: Partial<AssistantSessionRecord> = {}): AssistantSessionRecord {
  const sessionId = overrides.sessionId ?? 'notebook:in-app-assistant:primary';

  return {
    sessionId,
    scope: 'workspace',
    origin: 'app',
    route: {
      routeId: `route:${sessionId}`,
      kind: 'direct',
      routeKey: sessionId,
      transport: 'electron-ipc',
      origin: 'app',
      scope: 'workspace',
    },
    status: 'active',
    title: 'Primary App Session',
    notebookId: 'in-app-notebook',
    workspaceId: 'workspace:in-app',
    startedAt: 1710000000000,
    updatedAt: 1710000000000,
    lastMessageAt: 1710000000000,
    ...overrides,
  };
}

describe('AssistantSessionBar', () => {
  it('renders isolated-thread guidance, marks the active thread, and keeps canonical callbacks', () => {
    const onCreateSession = vi.fn();
    const onSelectSession = vi.fn();
    const primary = createSession();
    const secondary = createSession({
      sessionId: 'notebook:in-app-assistant:session:secondary',
      title: 'Research Thread',
      status: 'idle',
    });

    render(
      <AssistantSessionBar
        sessions={[primary, secondary]}
        activeSessionId={primary.sessionId}
        onCreateSession={onCreateSession}
        onSelectSession={onSelectSession}
      />,
    );

    expect(screen.getByText('Isolated threads')).toBeInTheDocument();
    expect(screen.getByText('Each thread keeps separate history and context.')).toBeInTheDocument();
    expect(screen.getByText('Active thread')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Primary App Session/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Research Thread/i })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: /Research Thread/i }));
    expect(onSelectSession).toHaveBeenCalledWith(secondary.sessionId);

    fireEvent.click(screen.getByRole('button', { name: /New thread/i }));
    expect(onCreateSession).toHaveBeenCalledTimes(1);
  });

  it('shows an explanatory empty state when there are no threads yet', () => {
    render(
      <AssistantSessionBar
        sessions={[]}
        activeSessionId={null}
        onCreateSession={vi.fn()}
        onSelectSession={vi.fn()}
      />,
    );

    expect(screen.getByText('No isolated threads yet.')).toBeInTheDocument();
    expect(screen.getByText('Start a new thread to keep a separate chat history and context.')).toBeInTheDocument();
  });
});
