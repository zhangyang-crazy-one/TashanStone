import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPanel } from '../../components/ChatPanel';
import type { AssistantRuntimeInspectionState } from '../../src/app/hooks/useAssistantRuntimeInspection';
import type { AssistantSessionRecord } from '../../src/services/assistant-runtime/sessionTypes';
import type { ChatMessage } from '../../types';

const {
  buildInjectedMessageMock,
  speechRecognitionControls,
} = vi.hoisted(() => ({
  buildInjectedMessageMock: vi.fn(async (text: string) => `[Injected] ${text}`),
  speechRecognitionControls: {
    onResult: null as null | ((transcript: string, isFinal: boolean) => void),
  },
}));

vi.mock('../../components/ChatPanel/useChatMemory', () => ({
  useChatMemory: () => ({
    showMemorySearch: false,
    memorySearchQuery: '',
    setMemorySearchQuery: vi.fn(),
    memorySearchResults: [],
    isSearchingMemories: false,
    injectedMemories: [],
    previewMemory: null,
    isPreviewOpen: false,
    handleToggleMemorySearch: vi.fn(),
    handleCloseMemoryPanel: vi.fn(),
    handleRemoveInjectedMemory: vi.fn(),
    handleMemorySearch: vi.fn(),
    buildInjectedMessage: buildInjectedMessageMock,
    handleMemoryClick: vi.fn(),
    handleConfirmAddMemory: vi.fn(),
    handleSaveMemory: vi.fn(),
    handleStarMemory: vi.fn(),
    handleCloseMemoryPreview: vi.fn(),
  }),
}));

vi.mock('../../hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: (options: { onResult: (transcript: string, isFinal: boolean) => void }) => {
    speechRecognitionControls.onResult = options.onResult;
    return {
      isListening: false,
      isProcessing: false,
      isSupported: false,
      toggle: vi.fn(),
    };
  },
}));

vi.mock('../../components/ChatPanel/MessageList', () => ({
  MessageList: ({
    messages,
    onStopStreaming,
  }: {
    messages: ChatMessage[];
    onStopStreaming?: () => void;
  }) => (
    <div data-testid="message-list">
      {messages.map(message => (
        <div key={message.id}>{message.content}</div>
      ))}
      {onStopStreaming && (
        <button type="button" onClick={onStopStreaming}>
          Stop Generation
        </button>
      )}
    </div>
  ),
}));

vi.mock('../../components/context', () => ({
  CheckpointDrawer: () => null,
}));

vi.mock('../../components/MemoryPreviewModal', () => ({
  MemoryPreviewModal: () => null,
}));

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
    workspaceId: 'workspace:focused',
    startedAt: 1710000000000,
    updatedAt: 1710000000000,
    lastMessageAt: 1710000000000,
    ...overrides,
  };
}

function createInspection(): AssistantRuntimeInspectionState {
  return {
    requestId: 'req-01',
    sessionId: 'notebook:in-app-assistant:primary',
    threadId: 'thread-01',
    parentSessionId: null,
    routeKey: 'notebook:in-app-assistant:primary',
    callerId: 'in-app-assistant',
    surface: 'app-chat',
    transport: 'in-app',
    lifecyclePhase: 'completed',
    lifecycleDetail: 'runtime complete',
    streamed: true,
    streamDeltaCount: 2,
    accumulatedTextLength: 64,
    lastDelta: 'Done',
    contextAdapterIds: ['workspace-state'],
    contextSources: ['workspace'],
    contextSections: [
      {
        id: 'workspace',
        label: 'Workspace Selection',
        source: 'workspace',
        preview: 'Focused runtime paragraph',
        charCount: 24,
      },
    ],
    lastError: null,
    updatedAt: 1710000000000,
    completedAt: 1710000001000,
  };
}

describe('ChatPanel parity surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    speechRecognitionControls.onResult = null;
  });

  it('keeps visible context controls while making isolated threads discoverable in the chat shell', async () => {
    const onSendMessage = vi.fn();
    const onClearChat = vi.fn();
    const onCompactChat = vi.fn().mockResolvedValue(undefined);
    const onStopStreaming = vi.fn();
    const onCreateSession = vi.fn().mockResolvedValue(undefined);
    const onSelectSession = vi.fn().mockResolvedValue(undefined);

    render(
      <ChatPanel
        isOpen
        onClose={vi.fn()}
        messages={[
          { id: '1', role: 'user', content: 'Earlier question', timestamp: 1 },
          { id: '2', role: 'assistant', content: 'Earlier answer', timestamp: 2 },
        ]}
        onSendMessage={onSendMessage}
        onClearChat={onClearChat}
        onCompactChat={onCompactChat}
        aiState={{ isThinking: false, error: null, message: null }}
        language="en"
        isStreaming
        onStopStreaming={onStopStreaming}
        showToast={vi.fn()}
        sessions={[
          createSession(),
          createSession({
            sessionId: 'notebook:in-app-assistant:session:secondary',
            title: 'Research Thread',
            status: 'idle',
          }),
        ]}
        workspaceContext={{
          workspaceId: 'workspace:focused',
          activeFileId: 'note-1',
          selectedFileIds: ['note-1', 'note-2'],
          selectedText: 'Focused runtime paragraph',
          contextScope: 'open-panes',
          includeSelectedText: true,
        }}
        contextScope="open-panes"
        setContextScope={vi.fn()}
        includeSelectedText={true}
        setIncludeSelectedText={vi.fn()}
        activeSessionId="notebook:in-app-assistant:primary"
        activeSessionTitle="Primary App Session"
        onCreateSession={onCreateSession}
        onSelectSession={onSelectSession}
        assistantRuntimeInspection={createInspection()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Compact Context/i }));
    expect(onCompactChat).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('button', { name: /Workspace context/i })).toBeInTheDocument();
    expect(screen.getByText('Isolated threads')).toBeInTheDocument();
    expect(screen.getByText('Each thread keeps separate history and context.')).toBeInTheDocument();
    expect(screen.getByText('Active thread')).toBeInTheDocument();
    expect(screen.getByText('Active note')).toBeInTheDocument();
    expect(screen.getByText('note-1')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Focused note only/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Open panes/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Include highlighted text/i })).toBeChecked();
    expect(screen.getByText('Focused runtime paragraph')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Clear History/i }));
    expect(onClearChat).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Inspect runtime state/i }));
    expect(screen.getByTestId('runtime-inspector-panel')).toBeInTheDocument();
    expect(screen.getByText('Workspace Selection')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Research Thread/i }));
    expect(onSelectSession).toHaveBeenCalledWith('notebook:in-app-assistant:session:secondary');

    fireEvent.click(screen.getByRole('button', { name: /New thread/i }));
    expect(onCreateSession).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Stop Generation/i }));
    expect(onStopStreaming).toHaveBeenCalledTimes(1);

    const composer = screen.getByRole('textbox');
    expect(composer.tagName).toBe('TEXTAREA');

    fireEvent.change(composer, { target: { value: 'Explain this' } });
    fireEvent.submit(composer.closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(buildInjectedMessageMock).toHaveBeenCalledWith('Explain this');
      expect(onSendMessage).toHaveBeenCalledWith('[Injected] Explain this');
    });
  });

  it('keeps voice-input append working with the multiline composer', async () => {
    const onSendMessage = vi.fn();

    render(
      <ChatPanel
        isOpen
        onClose={vi.fn()}
        messages={[]}
        onSendMessage={onSendMessage}
        onClearChat={vi.fn()}
        aiState={{ isThinking: false, error: null, message: null }}
        language="en"
        showToast={vi.fn()}
        workspaceContext={{
          workspaceId: 'workspace:focused',
          activeFileId: 'note-1',
          selectedFileIds: ['note-1'],
          selectedText: 'Focused runtime paragraph',
          contextScope: 'focused-note',
          includeSelectedText: true,
        }}
        contextScope="focused-note"
        setContextScope={vi.fn()}
        includeSelectedText={true}
        setIncludeSelectedText={vi.fn()}
      />,
    );

    expect(speechRecognitionControls.onResult).not.toBeNull();

    act(() => {
      speechRecognitionControls.onResult?.('Voice append', true);
    });

    const composer = screen.getByRole('textbox');
    await waitFor(() => {
      expect(composer).toHaveValue('Voice append');
    });

    fireEvent.submit(composer.closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(buildInjectedMessageMock).toHaveBeenCalledWith('Voice append');
      expect(onSendMessage).toHaveBeenCalledWith('[Injected] Voice append');
    });
  });
});
