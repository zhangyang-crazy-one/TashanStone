import { getDatabase } from '../index.js';

import type {
    AssistantReplyContextRef,
    AssistantRouteParticipant,
    AssistantSessionRecord,
    ChatMessage,
    JsonValue,
} from '../../../types';

interface AssistantSessionRow {
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
}

interface AssistantSessionMetadataEnvelope {
    notebookId?: string;
    routeId?: string;
    routeMetadata?: Record<string, JsonValue>;
    sessionMetadata?: Record<string, JsonValue>;
    transport?: string;
    workspaceId?: string;
}

interface ChatMessageRow {
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
}

const DEFAULT_SESSION_STATUS: AssistantSessionRecord['status'] = 'active';

export class SessionRepository {
    list(): AssistantSessionRecord[] {
        const db = getDatabase();
        const rows = db.prepare(`
            SELECT
                id,
                route_kind,
                route_key,
                scope,
                origin,
                status,
                title,
                thread_id,
                parent_session_id,
                primary_participant_id,
                participants_json,
                reply_context_json,
                metadata_json,
                started_at,
                updated_at,
                last_message_at
            FROM assistant_sessions
            ORDER BY updated_at DESC, started_at DESC
        `).all() as AssistantSessionRow[];

        return rows.map(row => this.rowToSession(row));
    }

    getById(sessionId: string): AssistantSessionRecord | null {
        const db = getDatabase();
        const row = db.prepare(`
            SELECT
                id,
                route_kind,
                route_key,
                scope,
                origin,
                status,
                title,
                thread_id,
                parent_session_id,
                primary_participant_id,
                participants_json,
                reply_context_json,
                metadata_json,
                started_at,
                updated_at,
                last_message_at
            FROM assistant_sessions
            WHERE id = ?
        `).get(sessionId) as AssistantSessionRow | undefined;

        return row ? this.rowToSession(row) : null;
    }

    getByRouteKey(routeKey: string): AssistantSessionRecord | null {
        const db = getDatabase();
        const row = db.prepare(`
            SELECT
                id,
                route_kind,
                route_key,
                scope,
                origin,
                status,
                title,
                thread_id,
                parent_session_id,
                primary_participant_id,
                participants_json,
                reply_context_json,
                metadata_json,
                started_at,
                updated_at,
                last_message_at
            FROM assistant_sessions
            WHERE route_key = ?
        `).get(routeKey) as AssistantSessionRow | undefined;

        return row ? this.rowToSession(row) : null;
    }

    save(session: AssistantSessionRecord): AssistantSessionRecord {
        const db = getDatabase();
        const participants = this.normalizeParticipants(session);
        const primaryParticipant = participants.find(participant => participant.role === 'primary');
        const metadataEnvelope: AssistantSessionMetadataEnvelope = {
            notebookId: session.notebookId,
            routeId: session.route.routeId,
            routeMetadata: session.route.metadata,
            sessionMetadata: session.metadata,
            transport: session.route.transport,
            workspaceId: session.workspaceId,
        };

        db.prepare(`
            INSERT INTO assistant_sessions (
                id,
                route_kind,
                route_key,
                scope,
                origin,
                status,
                title,
                thread_id,
                parent_session_id,
                primary_participant_id,
                participants_json,
                reply_context_json,
                metadata_json,
                started_at,
                updated_at,
                last_message_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                route_kind = excluded.route_kind,
                route_key = excluded.route_key,
                scope = excluded.scope,
                origin = excluded.origin,
                status = excluded.status,
                title = excluded.title,
                thread_id = excluded.thread_id,
                parent_session_id = excluded.parent_session_id,
                primary_participant_id = excluded.primary_participant_id,
                participants_json = excluded.participants_json,
                reply_context_json = excluded.reply_context_json,
                metadata_json = excluded.metadata_json,
                started_at = excluded.started_at,
                updated_at = excluded.updated_at,
                last_message_at = excluded.last_message_at
        `).run(
            session.sessionId,
            session.route.kind,
            session.route.routeKey,
            session.scope,
            session.origin,
            session.status ?? DEFAULT_SESSION_STATUS,
            session.title ?? null,
            session.threadId ?? session.route.threadId ?? null,
            session.parentSessionId ?? null,
            primaryParticipant?.participantId ?? null,
            participants.length > 0 ? JSON.stringify(participants) : null,
            session.replyContext ? JSON.stringify(session.replyContext) : null,
            JSON.stringify(metadataEnvelope),
            session.startedAt,
            session.updatedAt,
            session.lastMessageAt ?? null,
        );

        return this.getById(session.sessionId)!;
    }

    delete(sessionId: string): boolean {
        const db = getDatabase();
        const transaction = db.transaction(() => {
            db.prepare(`
                DELETE FROM chat_messages
                WHERE session_id = ? OR (session_id IS NULL AND conversation_id = ?)
            `).run(sessionId, sessionId);

            return db.prepare('DELETE FROM assistant_sessions WHERE id = ?').run(sessionId).changes > 0;
        });

        return transaction();
    }

    getMessages(sessionId: string): ChatMessage[] {
        const db = getDatabase();
        const rows = db.prepare(`
            SELECT
                id,
                role,
                content,
                timestamp,
                conversation_id,
                is_summary,
                condense_id,
                condense_parent,
                is_truncation_marker,
                truncation_id,
                truncation_parent,
                checkpoint_id,
                token_count
            FROM chat_messages
            WHERE session_id = ? OR (session_id IS NULL AND conversation_id = ?)
            ORDER BY timestamp ASC
        `).all(sessionId, sessionId) as ChatMessageRow[];

        return rows.map(row => ({
            id: row.id,
            role: row.role as ChatMessage['role'],
            content: row.content,
            timestamp: row.timestamp,
        }));
    }

    replaceMessages(sessionId: string, messages: ChatMessage[]): ChatMessage[] {
        const db = getDatabase();
        const session = this.getById(sessionId);
        const routeKey = session?.route.routeKey ?? sessionId;
        const latestTimestamp = messages.reduce<number | undefined>((current, message) => {
            if (typeof current !== 'number') {
                return message.timestamp;
            }
            return Math.max(current, message.timestamp);
        }, undefined);

        const transaction = db.transaction(() => {
            db.prepare(`
                DELETE FROM chat_messages
                WHERE session_id = ? OR (session_id IS NULL AND conversation_id = ?)
            `).run(sessionId, sessionId);

            const insert = db.prepare(`
                INSERT INTO chat_messages (
                    id,
                    role,
                    content,
                    timestamp,
                    conversation_id,
                    is_summary,
                    condense_id,
                    condense_parent,
                    is_truncation_marker,
                    truncation_id,
                    truncation_parent,
                    checkpoint_id,
                    token_count,
                    session_id,
                    route_key,
                    reply_context_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const message of messages) {
                insert.run(
                    message.id,
                    message.role,
                    message.content,
                    message.timestamp,
                    sessionId,
                    0,
                    null,
                    null,
                    0,
                    null,
                    null,
                    null,
                    null,
                    sessionId,
                    routeKey,
                    session?.replyContext ? JSON.stringify(session.replyContext) : null,
                );
            }

            if (session) {
                this.save({
                    ...session,
                    updatedAt: latestTimestamp ?? Date.now(),
                    lastMessageAt: latestTimestamp ?? session.lastMessageAt,
                });
            }
        });

        transaction();
        return this.getMessages(sessionId);
    }

    private normalizeParticipants(session: AssistantSessionRecord): AssistantRouteParticipant[] {
        if (session.route.participants && session.route.participants.length > 0) {
            return session.route.participants;
        }

        return (session.route.participantIds ?? []).map((participantId, index) => ({
            participantId,
            role: index === 0 ? 'primary' : 'member',
        }));
    }

    private rowToSession(row: AssistantSessionRow): AssistantSessionRecord {
        const participants = this.parseJson<AssistantRouteParticipant[]>(row.participants_json, []);
        const replyContext = this.parseJson<AssistantReplyContextRef | undefined>(row.reply_context_json, undefined);
        const metadataEnvelope = this.parseJson<AssistantSessionMetadataEnvelope>(row.metadata_json, {});

        return {
            sessionId: row.id,
            threadId: row.thread_id ?? undefined,
            scope: row.scope as AssistantSessionRecord['scope'],
            origin: row.origin as AssistantSessionRecord['origin'],
            parentSessionId: row.parent_session_id ?? undefined,
            route: {
                routeId: metadataEnvelope.routeId ?? row.route_key,
                kind: row.route_kind as AssistantSessionRecord['route']['kind'],
                routeKey: row.route_key,
                transport: (metadataEnvelope.transport ?? 'electron-ipc') as AssistantSessionRecord['route']['transport'],
                origin: row.origin as AssistantSessionRecord['route']['origin'],
                scope: row.scope as AssistantSessionRecord['route']['scope'],
                threadId: row.thread_id ?? undefined,
                participantIds: participants.map(participant => participant.participantId),
                participants,
                metadata: metadataEnvelope.routeMetadata,
            },
            status: row.status as AssistantSessionRecord['status'],
            title: row.title ?? undefined,
            notebookId: metadataEnvelope.notebookId,
            workspaceId: metadataEnvelope.workspaceId,
            replyContext,
            startedAt: row.started_at,
            updatedAt: row.updated_at,
            lastMessageAt: row.last_message_at ?? undefined,
            metadata: metadataEnvelope.sessionMetadata,
        };
    }

    private parseJson<T>(value: string | null, fallback: T): T {
        if (!value) {
            return fallback;
        }

        try {
            return JSON.parse(value) as T;
        } catch {
            return fallback;
        }
    }
}

export const sessionRepository = new SessionRepository();
