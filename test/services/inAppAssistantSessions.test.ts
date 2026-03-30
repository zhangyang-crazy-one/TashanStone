import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AssistantSessionRecord, ChatMessage } from '../../types';
import { useAssistantSessions } from '../../src/app/hooks/useAssistantSessions';
import { useChatHistory } from '../../src/app/hooks/useChatHistory';
import type { StorageService } from '../../src/services/storage/storageService';

function createStorageHarness() {
  const sessions = new Map<string, AssistantSessionRecord>();
  const sessionMessages = new Map<string, ChatMessage[]>();
  const settings = new Map<string, string>();

  const storage = {
    getAssistantSessions: vi.fn(async () => Array.from(sessions.values())),
    getAssistantSession: vi.fn(async (sessionId: string) => sessions.get(sessionId) ?? null),
    saveAssistantSession: vi.fn(async (session: AssistantSessionRecord) => {
      sessions.set(session.sessionId, session);
      return session;
    }),
    deleteAssistantSession: vi.fn(async (sessionId: string) => {
      const existed = sessions.delete(sessionId);
      sessionMessages.delete(sessionId);
      return existed;
    }),
    getSessionMessages: vi.fn(async (sessionId: string) => sessionMessages.get(sessionId) ?? []),
    replaceSessionMessages: vi.fn(async (sessionId: string, messages: ChatMessage[]) => {
      sessionMessages.set(sessionId, messages);
      return messages;
    }),
    getSetting: vi.fn(async (key: string) => settings.get(key) ?? null),
    setSetting: vi.fn(async (key: string, value: string) => {
      settings.set(key, value);
    }),
  } as unknown as StorageService;

  return {
    sessionMessages,
    sessions,
    settings,
    storage,
  };
}

describe('in-app assistant sessions', () => {
  it('creates a primary session, allows switching, and keeps chat history scoped by active session', async () => {
    const harness = createStorageHarness();

    const { result } = renderHook(() => useAssistantSessions({ storage: harness.storage }));

    await waitFor(() => {
      expect(result.current.activeSessionId).toBe('notebook:in-app-assistant:primary');
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.activeSession?.title).toBe('Primary App Session');

    let secondarySession!: AssistantSessionRecord;
    await act(async () => {
      secondarySession = await result.current.createSession({
        routeKey: 'notebook:in-app-assistant:session:secondary',
        title: 'Secondary Session',
      });
    });

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.activeSessionId).toBe(secondarySession.sessionId);

    const { result: history, rerender } = renderHook(
      ({ sessionId }) => useChatHistory(sessionId, harness.storage),
      {
        initialProps: {
          sessionId: result.current.activeSessionId,
        },
      },
    );

    await waitFor(() => {
      expect(history.current.chatMessages).toEqual([]);
    });

    await act(async () => {
      history.current.setChatMessages([
        {
          id: 'secondary-message',
          role: 'user',
          content: 'Secondary conversation',
          timestamp: 1,
        },
      ]);
    });

    await waitFor(() => {
      expect(harness.sessionMessages.get(secondarySession.sessionId)).toEqual([
        expect.objectContaining({ id: 'secondary-message' }),
      ]);
    });

    await act(async () => {
      await result.current.setActiveSessionId('notebook:in-app-assistant:primary');
    });
    rerender({ sessionId: result.current.activeSessionId });

    await waitFor(() => {
      expect(history.current.chatMessages).toEqual([]);
    });

    await act(async () => {
      history.current.setChatMessages([
        {
          id: 'primary-message',
          role: 'assistant',
          content: 'Primary conversation',
          timestamp: 2,
        },
      ]);
    });

    await waitFor(() => {
      expect(harness.sessionMessages.get('notebook:in-app-assistant:primary')).toEqual([
        expect.objectContaining({ id: 'primary-message' }),
      ]);
    });

    rerender({ sessionId: secondarySession.sessionId });
    await waitFor(() => {
      expect(history.current.chatMessages).toEqual([
        expect.objectContaining({ id: 'secondary-message' }),
      ]);
    });
  });
});
