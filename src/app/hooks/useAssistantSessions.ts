import { useCallback, useEffect, useRef, useState } from 'react';

import type { AssistantSessionRecord } from '@/types';
import { resolveAssistantSession } from '@/src/services/assistant-runtime';
import { getStorageService, type StorageService } from '@/src/services/storage/storageService';

const ACTIVE_SESSION_SETTING_KEY = 'assistant.activeSessionId';
const PRIMARY_APP_ROUTE_KEY = 'notebook:in-app-assistant:primary';

export interface CreateAssistantSessionInput {
  routeKey?: string;
  sessionId?: string;
  title?: string;
}

interface UseAssistantSessionsOptions {
  notebookId?: string;
  storage?: StorageService;
  workspaceId?: string;
}

interface UseAssistantSessionsResult {
  activeSession: AssistantSessionRecord | null;
  activeSessionId: string | null;
  createSession: (input?: CreateAssistantSessionInput) => Promise<AssistantSessionRecord>;
  isLoading: boolean;
  saveSession: (session: AssistantSessionRecord) => Promise<AssistantSessionRecord>;
  sessions: AssistantSessionRecord[];
  setActiveSessionId: (sessionId: string) => Promise<void>;
}

function upsertSession(
  sessions: AssistantSessionRecord[],
  nextSession: AssistantSessionRecord,
): AssistantSessionRecord[] {
  const index = sessions.findIndex(session => session.sessionId === nextSession.sessionId);
  if (index >= 0) {
    const nextSessions = [...sessions];
    nextSessions[index] = nextSession;
    return nextSessions;
  }

  return [...sessions, nextSession];
}

export function useAssistantSessions({
  notebookId = 'in-app-notebook',
  storage,
  workspaceId,
}: UseAssistantSessionsOptions = {}): UseAssistantSessionsResult {
  const storageRef = useRef<StorageService>(storage ?? getStorageService());
  const [sessions, setSessions] = useState<AssistantSessionRecord[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const persistSession = useCallback(async (session: AssistantSessionRecord): Promise<AssistantSessionRecord> => {
    const saved = await storageRef.current.saveAssistantSession(session);
    setSessions(prev => upsertSession(prev, saved));
    return saved;
  }, []);

  const setActiveSessionId = useCallback(async (sessionId: string): Promise<void> => {
    await storageRef.current.setSetting(ACTIVE_SESSION_SETTING_KEY, sessionId);
    setActiveSessionIdState(sessionId);
  }, []);

  const createSession = useCallback(async (input: CreateAssistantSessionInput = {}): Promise<AssistantSessionRecord> => {
    const now = Date.now();
    const routeKey = input.routeKey ?? `notebook:in-app-assistant:session:${now}`;
    const resolved = resolveAssistantSession({
      caller: {
        callerId: 'in-app-assistant',
        surface: 'app-chat',
        transport: 'in-app',
        routeKey,
      },
      notebookId,
      now,
      routeKey,
      sessionId: input.sessionId ?? routeKey,
      title: input.title ?? 'Assistant Session',
      transport: {
        channel: 'electron-ipc',
      },
      workspaceId,
    });

    const saved = await persistSession(resolved.session);
    await setActiveSessionId(saved.sessionId);
    return saved;
  }, [notebookId, persistSession, setActiveSessionId, workspaceId]);

  useEffect(() => {
    let cancelled = false;

    async function initializeSessions() {
      setIsLoading(true);

      const [loadedSessions, storedActiveSessionId] = await Promise.all([
        storageRef.current.getAssistantSessions(),
        storageRef.current.getSetting(ACTIVE_SESSION_SETTING_KEY),
      ]);

      let nextSessions = loadedSessions;
      let nextActiveSessionId = storedActiveSessionId;

      if (nextSessions.length === 0) {
        const initialSession = await createSession({
          routeKey: PRIMARY_APP_ROUTE_KEY,
          sessionId: PRIMARY_APP_ROUTE_KEY,
          title: 'Primary App Session',
        });
        nextSessions = [initialSession];
        nextActiveSessionId = initialSession.sessionId;
      } else if (!nextActiveSessionId || !nextSessions.some(session => session.sessionId === nextActiveSessionId)) {
        nextActiveSessionId = nextSessions[0]?.sessionId ?? null;
        if (nextActiveSessionId) {
          await storageRef.current.setSetting(ACTIVE_SESSION_SETTING_KEY, nextActiveSessionId);
        }
      }

      if (cancelled) {
        return;
      }

      setSessions(nextSessions);
      setActiveSessionIdState(nextActiveSessionId ?? null);
      setIsLoading(false);
    }

    void initializeSessions();

    return () => {
      cancelled = true;
    };
  }, [createSession]);

  const activeSession = sessions.find(session => session.sessionId === activeSessionId) ?? null;

  return {
    activeSession,
    activeSessionId,
    createSession,
    isLoading,
    saveSession: persistSession,
    sessions,
    setActiveSessionId,
  };
}
