import type { JsonValue } from '@/types';

import type {
  AssistantRuntimeCaller,
  AssistantRuntimeTransportMetadata,
  AssistantSessionRef,
} from './types';
import type {
  AssistantReplyContextRef,
  AssistantRouteKind,
  AssistantRouteParticipant,
  AssistantSessionRecord,
  AssistantSessionRoute,
  AssistantSessionStatus,
} from './sessionTypes';

export interface AssistantSessionRouteInput {
  caller: Pick<AssistantRuntimeCaller, 'callerId' | 'routeKey' | 'surface' | 'transport'>;
  metadata?: Record<string, JsonValue>;
  notebookId?: string;
  now?: number;
  participantIds?: string[];
  participants?: AssistantRouteParticipant[];
  replyContext?: AssistantReplyContextRef;
  routeKey?: string;
  routeKind?: AssistantRouteKind;
  routeMetadata?: Record<string, JsonValue>;
  session?: Partial<AssistantSessionRef>;
  sessionId?: string;
  startedAt?: number;
  status?: AssistantSessionStatus;
  threadId?: string;
  title?: string;
  transport?: Pick<AssistantRuntimeTransportMetadata, 'channel' | 'replyTarget'>;
  updatedAt?: number;
  workspaceId?: string;
}

export interface AssistantSessionResolution {
  route: AssistantSessionRoute;
  session: AssistantSessionRecord;
  sessionKey: string;
}

export function resolveAssistantSessionScope(
  input: Pick<AssistantSessionRouteInput, 'caller' | 'session'>,
): AssistantSessionRef['scope'] {
  if (input.session?.scope) {
    return input.session.scope;
  }

  if (input.caller.surface === 'channel') {
    return 'channel';
  }

  if (input.caller.surface === 'automation') {
    return 'automation';
  }

  return 'notebook';
}

export function resolveAssistantRouteKind(input: AssistantSessionRouteInput): AssistantRouteKind {
  if (input.routeKind) {
    return input.routeKind;
  }

  const scope = resolveAssistantSessionScope(input);
  if (scope === 'automation' || input.caller.surface === 'automation') {
    return 'automation';
  }

  if (input.threadId || input.transport?.replyTarget) {
    return 'channel-thread';
  }

  if ((input.participants?.length ?? 0) > 1 || (input.participantIds?.length ?? 0) > 1) {
    return 'group';
  }

  return 'direct';
}

export function buildAssistantRouteKey(input: AssistantSessionRouteInput): string {
  if (input.routeKey) {
    return input.routeKey;
  }

  if (input.caller.routeKey) {
    return input.caller.routeKey;
  }

  const scope = resolveAssistantSessionScope(input);
  const kind = resolveAssistantRouteKind(input);
  const threadKey = input.threadId ?? input.transport?.replyTarget ?? 'default';
  const participantKey = (input.participantIds ?? input.participants?.map(participant => participant.participantId) ?? [])
    .join(',')
    || 'shared';

  switch (kind) {
    case 'automation':
      return `${scope}:${input.caller.callerId}:automation`;
    case 'channel-thread':
      return `${scope}:${input.caller.callerId}:thread:${threadKey}`;
    case 'group':
      return `${scope}:${input.caller.callerId}:group:${participantKey}`;
    case 'direct':
    default:
      return `${scope}:${input.caller.callerId}:primary`;
  }
}

export function resolveAssistantSessionKey(
  route: Pick<AssistantSessionRoute, 'routeKey'>,
): string {
  return route.routeKey;
}

export function resolveAssistantSession(input: AssistantSessionRouteInput): AssistantSessionResolution {
  const scope = resolveAssistantSessionScope(input);
  const routeKind = resolveAssistantRouteKind(input);
  const routeKey = buildAssistantRouteKey(input);
  const participantIds = input.participantIds ?? input.participants?.map(participant => participant.participantId);
  const route: AssistantSessionRoute = {
    routeId: routeKey,
    kind: routeKind,
    routeKey,
    transport: input.transport?.channel ?? 'electron-ipc',
    origin: input.session?.origin ?? (scope === 'channel' ? 'channel' : scope === 'automation' ? 'automation' : 'app'),
    scope,
    threadId: input.threadId,
    participantIds,
    participants: input.participants,
    metadata: input.routeMetadata,
  };

  const now = input.now ?? Date.now();
  const sessionKey = input.sessionId ?? resolveAssistantSessionKey(route);
  const session: AssistantSessionRecord = {
    sessionId: sessionKey,
    threadId: input.threadId,
    scope,
    origin: route.origin,
    parentSessionId: input.session?.parentSessionId,
    route,
    status: input.status ?? 'active',
    title: input.title,
    notebookId: input.notebookId,
    workspaceId: input.workspaceId,
    replyContext: input.replyContext,
    startedAt: input.startedAt ?? now,
    updatedAt: input.updatedAt ?? now,
    metadata: input.metadata,
  };

  return {
    route,
    session,
    sessionKey,
  };
}
