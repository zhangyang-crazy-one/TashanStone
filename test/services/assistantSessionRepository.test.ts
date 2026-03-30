import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssistantSessionRecord, ChatMessage } from '../../types';

type AssistantSessionRow = {
  id: string;
  route_kind: string;
  route_key: string;
  scope: string;
  origin: string;
  status: string;
  title: string | null;
  thread_id: string | null;
  parent_session_id: string | null;
  primary_participant_id: string | null;
  participants_json: string | null;
  reply_context_json: string | null;
  metadata_json: string | null;
  started_at: number;
  updated_at: number;
  last_message_at: number | null;
};

type ChatMessageRow = {
  id: string;
  role: string;
  content: string;
  timestamp: number;
  conversation_id: string;
  is_summary: number;
  condense_id: string | null;
  condense_parent: string | null;
  is_truncation_marker: number;
  truncation_id: string | null;
  truncation_parent: string | null;
  checkpoint_id: string | null;
  token_count: number | null;
  session_id: string | null;
  route_key: string | null;
  reply_context_json: string | null;
};

class FakeDatabase {
  assistantSessions: AssistantSessionRow[] = [];
  chatMessages: ChatMessageRow[] = [];

  prepare(sql: string) {
    if (sql.includes('DELETE FROM assistant_sessions')) {
      return {
        run: (sessionId: string) => {
          const before = this.assistantSessions.length;
          this.assistantSessions = this.assistantSessions.filter(row => row.id !== sessionId);
          return { changes: before - this.assistantSessions.length };
        },
      };
    }

    if (sql.includes('FROM assistant_sessions') && sql.includes('ORDER BY updated_at DESC')) {
      return {
        all: () => [...this.assistantSessions].sort((a, b) => b.updated_at - a.updated_at),
      };
    }

    if (sql.includes('FROM assistant_sessions') && sql.includes('WHERE id = ?')) {
      return {
        get: (sessionId: string) => this.assistantSessions.find(row => row.id === sessionId),
      };
    }

    if (sql.includes('FROM assistant_sessions') && sql.includes('WHERE route_key = ?')) {
      return {
        get: (routeKey: string) => this.assistantSessions.find(row => row.route_key === routeKey),
      };
    }

    if (sql.includes('INSERT INTO assistant_sessions')) {
      return {
        run: (...args: unknown[]) => {
          const row: AssistantSessionRow = {
            id: args[0] as string,
            route_kind: args[1] as string,
            route_key: args[2] as string,
            scope: args[3] as string,
            origin: args[4] as string,
            status: args[5] as string,
            title: args[6] as string | null,
            thread_id: args[7] as string | null,
            parent_session_id: args[8] as string | null,
            primary_participant_id: args[9] as string | null,
            participants_json: args[10] as string | null,
            reply_context_json: args[11] as string | null,
            metadata_json: args[12] as string | null,
            started_at: args[13] as number,
            updated_at: args[14] as number,
            last_message_at: args[15] as number | null,
          };
          const index = this.assistantSessions.findIndex(existing => existing.id === row.id);
          if (index >= 0) {
            this.assistantSessions[index] = row;
          } else {
            this.assistantSessions.push(row);
          }
        },
      };
    }

    if (sql.includes('DELETE FROM chat_messages')) {
      return {
        run: (sessionId: string, conversationId: string) => {
          const before = this.chatMessages.length;
          this.chatMessages = this.chatMessages.filter(row =>
            row.session_id !== sessionId && !(row.session_id === null && row.conversation_id === conversationId),
          );
          return { changes: before - this.chatMessages.length };
        },
      };
    }

    if (sql.includes('FROM chat_messages') && sql.includes('ORDER BY timestamp ASC')) {
      return {
        all: (sessionId: string, conversationId: string) =>
          this.chatMessages
            .filter(row => row.session_id === sessionId || (row.session_id === null && row.conversation_id === conversationId))
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(row => ({
              id: row.id,
              role: row.role,
              content: row.content,
              timestamp: row.timestamp,
              conversation_id: row.conversation_id,
              is_summary: row.is_summary,
              condense_id: row.condense_id,
              condense_parent: row.condense_parent,
              is_truncation_marker: row.is_truncation_marker,
              truncation_id: row.truncation_id,
              truncation_parent: row.truncation_parent,
              checkpoint_id: row.checkpoint_id,
              token_count: row.token_count,
            })),
      };
    }

    if (sql.includes('INSERT INTO chat_messages')) {
      return {
        run: (...args: unknown[]) => {
          this.chatMessages.push({
            id: args[0] as string,
            role: args[1] as string,
            content: args[2] as string,
            timestamp: args[3] as number,
            conversation_id: args[4] as string,
            is_summary: args[5] as number,
            condense_id: args[6] as string | null,
            condense_parent: args[7] as string | null,
            is_truncation_marker: args[8] as number,
            truncation_id: args[9] as string | null,
            truncation_parent: args[10] as string | null,
            checkpoint_id: args[11] as string | null,
            token_count: args[12] as number | null,
            session_id: args[13] as string | null,
            route_key: args[14] as string | null,
            reply_context_json: args[15] as string | null,
          });
        },
      };
    }

    throw new Error(`Unhandled SQL in fake database: ${sql}`);
  }

  transaction<T extends (...args: never[]) => unknown>(fn: T): T {
    return ((...args: Parameters<T>) => fn(...args)) as T;
  }
}

const { getDatabaseMock } = vi.hoisted(() => ({
  getDatabaseMock: vi.fn(),
}));

vi.mock('../../electron/database/index.js', () => ({
  getDatabase: getDatabaseMock,
}));

import { SessionRepository } from '../../electron/database/repositories/sessionRepository';

function buildSession(overrides: Partial<AssistantSessionRecord> = {}): AssistantSessionRecord {
  return {
    sessionId: 'session-app-primary',
    scope: 'notebook',
    origin: 'app',
    route: {
      routeId: 'route-app-primary',
      kind: 'direct',
      routeKey: 'app:in-app-assistant:primary',
      transport: 'electron-ipc',
      origin: 'app',
      scope: 'notebook',
      participantIds: ['user-primary'],
      participants: [
        {
          participantId: 'user-primary',
          role: 'primary',
          displayName: 'Primary User',
        },
      ],
      metadata: {
        callerId: 'in-app-assistant',
      },
    },
    status: 'active',
    title: 'Primary App Session',
    notebookId: 'notebook-1',
    workspaceId: 'workspace-1',
    replyContext: {
      replyToMessageId: 'msg-previous',
      replyTarget: 'app-panel',
    },
    startedAt: 1000,
    updatedAt: 2000,
    lastMessageAt: 2000,
    metadata: {
      source: 'test',
    },
    ...overrides,
  };
}

describe('SessionRepository', () => {
  let database: FakeDatabase;
  let repository: SessionRepository;

  beforeEach(() => {
    database = new FakeDatabase();
    getDatabaseMock.mockReturnValue(database);
    repository = new SessionRepository();
  });

  it('creates and resumes canonical sessions with route and reply-context metadata intact', () => {
    const saved = repository.save(buildSession());

    expect(saved.route.routeKey).toBe('app:in-app-assistant:primary');
    expect(saved.route.transport).toBe('electron-ipc');
    expect(saved.replyContext).toEqual(
      expect.objectContaining({
        replyToMessageId: 'msg-previous',
      }),
    );
    expect(saved.notebookId).toBe('notebook-1');
    expect(saved.workspaceId).toBe('workspace-1');

    const resumed = repository.getByRouteKey('app:in-app-assistant:primary');
    expect(resumed?.sessionId).toBe('session-app-primary');
    expect(repository.list()).toHaveLength(1);
  });

  it('replaces and reloads transcripts through the canonical session path', () => {
    const session = repository.save(buildSession());
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Summarize the notebook',
        timestamp: 3000,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Here is the summary.',
        timestamp: 4000,
      },
    ];

    repository.replaceMessages(session.sessionId, messages);

    expect(repository.getMessages(session.sessionId)).toEqual(messages);
    expect(repository.getById(session.sessionId)?.lastMessageAt).toBe(4000);
  });

  it('deletes sessions and their scoped transcripts together', () => {
    const session = repository.save(buildSession());
    repository.replaceMessages(session.sessionId, [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Persisted answer',
        timestamp: 5000,
      },
    ]);

    expect(repository.delete(session.sessionId)).toBe(true);
    expect(repository.getById(session.sessionId)).toBeNull();
    expect(repository.getMessages(session.sessionId)).toEqual([]);
  });
});
