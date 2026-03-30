import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RuntimeInspectorPanel } from '../../components/ChatPanel/RuntimeInspectorPanel';
import type { AssistantRuntimeInspectionState } from '../../src/app/hooks/useAssistantRuntimeInspection';

function createInspection(overrides: Partial<AssistantRuntimeInspectionState> = {}): AssistantRuntimeInspectionState {
  return {
    requestId: 'req-01',
    sessionId: 'notebook:in-app-assistant:primary',
    threadId: 'thread-01',
    parentSessionId: null,
    routeKey: 'notebook:in-app-assistant:primary',
    callerId: 'in-app-assistant',
    surface: 'app-chat',
    transport: 'in-app',
    lifecyclePhase: 'streaming',
    lifecycleDetail: 'assembling notebook context',
    streamed: true,
    streamDeltaCount: 3,
    accumulatedTextLength: 128,
    lastDelta: 'delta',
    contextAdapterIds: ['workspace-state', 'knowledge-search'],
    contextSources: ['workspace', 'knowledge'],
    contextSections: [
      {
        id: 'workspace',
        label: 'Workspace Selection',
        source: 'workspace',
        preview: 'Selected note.md and highlighted paragraph.',
        charCount: 42,
      },
      {
        id: 'knowledge',
        label: 'Knowledge Context',
        source: 'knowledge',
        preview: 'Relevant notebook facts.',
        charCount: 24,
      },
    ],
    lastError: null,
    updatedAt: 1710000000000,
    completedAt: null,
    ...overrides,
  };
}

describe('RuntimeInspectorPanel', () => {
  it('shows live runtime activity, delta details, and context sections in a read-only panel', () => {
    render(<RuntimeInspectorPanel inspection={createInspection()} />);

    expect(screen.getByText('Live runtime')).toBeInTheDocument();
    expect(screen.getByText('3 deltas · 128 chars')).toBeInTheDocument();
    expect(screen.getByText('streaming · assembling notebook context')).toBeInTheDocument();
    expect(screen.getByText('Last delta')).toBeInTheDocument();
    expect(screen.getByText('delta')).toBeInTheDocument();
    expect(screen.getByText('Last update')).toBeInTheDocument();
    expect(screen.getByText('Workspace Selection')).toBeInTheDocument();
    expect(screen.getByText('Selected note.md and highlighted paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Knowledge Context')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an idle empty-state message when no context has been assembled yet', () => {
    render(
      <RuntimeInspectorPanel
        inspection={createInspection({
          lifecyclePhase: 'idle',
          streamed: false,
          contextAdapterIds: [],
          contextSources: [],
          contextSections: [],
          sessionId: null,
          requestId: null,
        })}
      />,
    );

    expect(screen.getByText('No context sections assembled yet.')).toBeInTheDocument();
    expect(screen.getByText('No runtime activity yet.')).toBeInTheDocument();
  });
});
