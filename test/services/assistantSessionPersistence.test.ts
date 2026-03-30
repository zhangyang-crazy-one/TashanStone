import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssistantSessionRecord, ChatMessage } from '../../types';
import { ElectronStorageService } from '../../src/services/storage/electronStorage';
import { WebStorageService } from '../../src/services/storage/webStorage';

function buildSession(sessionId: string, routeKey: string): AssistantSessionRecord {
  return {
    sessionId,
    scope: 'notebook',
    origin: 'app',
    route: {
      routeId: `${sessionId}:route`,
      kind: 'direct',
      routeKey,
      transport: 'electron-ipc',
      origin: 'app',
      scope: 'notebook',
      participantIds: ['user-primary'],
    },
    status: 'active',
    title: routeKey,
    startedAt: 1000,
    updatedAt: 1000,
  };
}

describe('assistant session persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('delegates canonical session persistence to the Electron db.session bridge', async () => {
    const session = buildSession('session-electron', 'app:primary');
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Electron transcript',
        timestamp: 42,
      },
    ];

    const sessionApi = {
      list: vi.fn().mockResolvedValue([session]),
      get: vi.fn().mockResolvedValue(session),
      save: vi.fn().mockResolvedValue(session),
      delete: vi.fn().mockResolvedValue(true),
      getMessages: vi.fn().mockResolvedValue(messages),
      replaceMessages: vi.fn().mockResolvedValue(messages),
    };

    window.electronAPI = {
      db: {
        config: { get: vi.fn().mockResolvedValue({}) },
        session: sessionApi,
      },
    } as unknown as typeof window.electronAPI;

    const storage = new ElectronStorageService();

    await expect(storage.getAssistantSessions()).resolves.toEqual([session]);
    await expect(storage.getAssistantSession(session.sessionId)).resolves.toEqual(session);
    await expect(storage.saveAssistantSession(session)).resolves.toEqual(session);
    await expect(storage.getSessionMessages(session.sessionId)).resolves.toEqual(messages);
    await expect(storage.replaceSessionMessages(session.sessionId, messages)).resolves.toEqual(messages);
    await expect(storage.deleteAssistantSession(session.sessionId)).resolves.toBe(true);

    expect(sessionApi.list).toHaveBeenCalledOnce();
    expect(sessionApi.get).toHaveBeenCalledWith(session.sessionId);
    expect(sessionApi.save).toHaveBeenCalledWith(session);
    expect(sessionApi.getMessages).toHaveBeenCalledWith(session.sessionId);
    expect(sessionApi.replaceMessages).toHaveBeenCalledWith(session.sessionId, messages);
    expect(sessionApi.delete).toHaveBeenCalledWith(session.sessionId);
  });

  it('keeps web session transcripts isolated instead of collapsing them into one global chat key', async () => {
    const storage = new WebStorageService();
    const sessionA = buildSession('session-a', 'app:primary');
    const sessionB = buildSession('session-b', 'channel:group:42');

    await storage.saveAssistantSession(sessionA);
    await storage.saveAssistantSession(sessionB);

    await storage.replaceSessionMessages(sessionA.sessionId, [
      {
        id: 'user-a',
        role: 'user',
        content: 'Notebook question',
        timestamp: 1,
      },
    ]);
    await storage.replaceSessionMessages(sessionB.sessionId, [
      {
        id: 'user-b',
        role: 'user',
        content: 'Group question',
        timestamp: 2,
      },
    ]);

    await expect(storage.getAssistantSessions()).resolves.toEqual([sessionA, sessionB]);
    await expect(storage.getSessionMessages(sessionA.sessionId)).resolves.toEqual([
      expect.objectContaining({ id: 'user-a', content: 'Notebook question' }),
    ]);
    await expect(storage.getSessionMessages(sessionB.sessionId)).resolves.toEqual([
      expect.objectContaining({ id: 'user-b', content: 'Group question' }),
    ]);

    await storage.addChatMessage(
      {
        id: 'default-msg',
        role: 'assistant',
        content: 'Legacy default transcript',
        timestamp: 3,
      },
      undefined,
    );

    await expect(storage.getChatMessages()).resolves.toEqual([
      expect.objectContaining({ id: 'default-msg' }),
    ]);

    await storage.deleteAssistantSession(sessionB.sessionId);
    await expect(storage.getAssistantSession(sessionB.sessionId)).resolves.toBeNull();
    await expect(storage.getSessionMessages(sessionB.sessionId)).resolves.toEqual([]);
  });
});
