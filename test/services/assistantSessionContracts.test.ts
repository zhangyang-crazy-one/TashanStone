import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type {
  AssistantActivationContext,
  AssistantActivationDecision,
  AssistantActivationPolicy,
  AssistantReplyContextRef,
  AssistantRouteKind,
  AssistantSessionRecord,
} from '../../types';
import { ASSISTANT_ROUTE_KIND_ORDER, ASSISTANT_ROUTE_POLICY_DEFAULTS } from '../../src/services/assistant-runtime/sessionRoutingConfig';

const sessionContractPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/services/assistant-runtime/sessionTypes.ts',
);

describe('assistant session contracts', () => {
  it('describes a canonical session record with route identity, lifecycle status, and reply-context metadata', () => {
    const replyContext: AssistantReplyContextRef = {
      transportMessageId: 'msg-42',
      replyToMessageId: 'msg-21',
      replyTarget: 'thread-9',
      channelThreadId: 'thread-9',
      quotedText: 'Follow up on the earlier note',
    };

    const session: AssistantSessionRecord = {
      sessionId: 'session-1',
      scope: 'notebook',
      origin: 'app',
      status: 'active',
      route: {
        routeId: 'route-1',
        kind: 'direct',
        routeKey: 'app:primary',
        transport: 'electron-ipc',
        origin: 'app',
        scope: 'notebook',
        participantIds: ['user-primary'],
      },
      title: 'Primary App Conversation',
      notebookId: 'notebook-1',
      workspaceId: 'workspace-1',
      replyContext,
      startedAt: 1_747_000_000_000,
      updatedAt: 1_747_000_001_000,
      lastMessageAt: 1_747_000_002_000,
    };

    expect(session).toMatchObject({
      sessionId: 'session-1',
      status: 'active',
      route: {
        kind: 'direct',
        routeKey: 'app:primary',
      },
      replyContext: {
        replyToMessageId: 'msg-21',
      },
    });
  });

  it('keeps route kinds and activation defaults transport-neutral across direct, group, and channel routes', () => {
    const routeKinds: AssistantRouteKind[] = ['direct', 'group', 'channel-thread', 'automation'];
    expect(ASSISTANT_ROUTE_KIND_ORDER).toEqual(routeKinds);

    const directPolicy: AssistantActivationPolicy = ASSISTANT_ROUTE_POLICY_DEFAULTS.direct;
    const groupPolicy: AssistantActivationPolicy = ASSISTANT_ROUTE_POLICY_DEFAULTS.group;
    const channelPolicy: AssistantActivationPolicy = ASSISTANT_ROUTE_POLICY_DEFAULTS['channel-thread'];

    expect(directPolicy.mode).toBe('always');
    expect(groupPolicy.mode).toBe('mentions-only');
    expect(channelPolicy.allowReplies).toBe(true);
    expect(channelPolicy.allowedRouteKinds).toEqual(['channel-thread']);
  });

  it('describes activation decisions without relying on transport-specific UI state', () => {
    const context: AssistantActivationContext = {
      route: {
        routeId: 'route-group',
        kind: 'group',
        routeKey: 'channel:qq:room-1',
        transport: 'webhook',
        origin: 'channel',
        scope: 'channel',
        threadId: 'room-1',
      },
      caller: {
        callerId: 'qq-channel',
        surface: 'channel',
        transport: 'webhook',
        routeKey: 'channel:qq:room-1',
      },
      messageText: '@assistant summarize this thread',
      mentioned: true,
      isReply: true,
      replyContext: {
        replyToMessageId: 'msg-prev',
      },
    };

    const decision: AssistantActivationDecision = {
      shouldInvoke: true,
      reason: 'reply-allowed',
      sessionKey: context.route.routeKey,
      normalizedReplyContext: context.replyContext,
    };

    expect(decision).toMatchObject({
      shouldInvoke: true,
      reason: 'reply-allowed',
      sessionKey: 'channel:qq:room-1',
      normalizedReplyContext: {
        replyToMessageId: 'msg-prev',
      },
    });
  });

  it('keeps the session contract surface free of React setters and component-local state', () => {
    const source = readFileSync(sessionContractPath, 'utf8');

    expect(source).not.toMatch(/Dispatch|SetStateAction|useState|useEffect|JSX|React/);
    expect(source).toContain('export interface AssistantSessionRecord');
    expect(source).toContain('export interface AssistantActivationDecision');
  });
});
