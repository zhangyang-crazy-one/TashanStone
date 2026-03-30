import type { JsonValue } from '@/types';

import type {
  AssistantRuntimeCaller,
  AssistantSessionOrigin,
  AssistantSessionRef,
  AssistantSessionScope,
  AssistantTransportChannel,
} from './types';

export type AssistantRouteKind = 'direct' | 'group' | 'channel-thread' | 'automation';
export type AssistantSessionStatus = 'active' | 'idle' | 'archived';
export type AssistantParticipantRole = 'primary' | 'member' | 'assistant' | 'system';
export type AssistantActivationMode = 'always' | 'explicit' | 'mentions-only' | 'never';
export type AssistantActivationReason =
  | 'allowed'
  | 'blocked'
  | 'mentions-required'
  | 'reply-allowed'
  | 'primary-route'
  | 'explicit-opt-out';

export interface AssistantRouteParticipant {
  participantId: string;
  role: AssistantParticipantRole;
  displayName?: string;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantReplyContextRef {
  transportMessageId?: string;
  replyToMessageId?: string;
  replyTarget?: string;
  channelThreadId?: string;
  quotedText?: string;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantSessionRoute {
  routeId: string;
  kind: AssistantRouteKind;
  routeKey: string;
  transport: AssistantTransportChannel;
  origin: AssistantSessionOrigin;
  scope: AssistantSessionScope;
  threadId?: string;
  participantIds?: string[];
  participants?: AssistantRouteParticipant[];
  metadata?: Record<string, JsonValue>;
}

export interface AssistantSessionRecord extends AssistantSessionRef {
  route: AssistantSessionRoute;
  status: AssistantSessionStatus;
  title?: string;
  notebookId?: string;
  workspaceId?: string;
  replyContext?: AssistantReplyContextRef;
  startedAt: number;
  updatedAt: number;
  lastMessageAt?: number;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantActivationContext {
  route: AssistantSessionRoute;
  caller: Pick<AssistantRuntimeCaller, 'callerId' | 'surface' | 'transport' | 'routeKey'>;
  messageText?: string;
  mentioned?: boolean;
  isReply?: boolean;
  replyContext?: AssistantReplyContextRef;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantActivationPolicy {
  mode: AssistantActivationMode;
  allowReplies?: boolean;
  requirePrimaryParticipant?: boolean;
  allowedRouteKinds?: AssistantRouteKind[];
  blockedRouteKinds?: AssistantRouteKind[];
  metadata?: Record<string, JsonValue>;
}

export interface AssistantActivationDecision {
  shouldInvoke: boolean;
  reason: AssistantActivationReason;
  sessionKey: string;
  normalizedReplyContext?: AssistantReplyContextRef;
  metadata?: Record<string, JsonValue>;
}
