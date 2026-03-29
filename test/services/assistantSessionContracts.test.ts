import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type {
  AssistantActivationDecision,
  AssistantActivationPolicyInput,
  AssistantCanonicalSession,
  AssistantReplyContext,
  AssistantSessionRoute,
  AssistantSessionRouteParticipant,
} from '../../types';
import {
  ASSISTANT_ROUTE_KIND_ORDER,
  ASSISTANT_SESSION_LIFECYCLE_ORDER,
  DEFAULT_ASSISTANT_ACTIVATION_POLICY,
  DEFAULT_ASSISTANT_SESSION_ROUTE_POLICY,
} from '../../src/services/assistant-runtime/sessionRoutingConfig';

const sessionContractsPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/services/assistant-runtime/sessionTypes.ts',
);

describe('assistant session contracts', () => {
  it('describes canonical session identity, route identity, participant scope, lifecycle, and reply context metadata', () => {
    const participants: AssistantSessionRouteParticipant[] = [
      {
        participantId: 'user:primary',
        scope: 'individual',
        role: 'sender',
        origin: 'app',
        displayName: 'Primary User',
        metadata: {
          notebookId: 'notebook-1',
        },
      },
      {
        participantId: 'assistant:tashanstone',
        scope: 'assistant',
        role: 'assistant',
        origin: 'automation',
      },
    ];

    const route: AssistantSessionRoute = {
      routeId: 'route-app-direct-primary',
      kind: 'direct',
      routeKey: 'app:direct:notebook-1:user-primary',
      scope: 'notebook',
      origin: 'app',
      participantMode: 'one-to-one',
      participants,
      metadata: {
        workspaceId: 'workspace-1',
      },
    };

    const replyContext: AssistantReplyContext = {
      replyContextId: 'reply-1',
      sessionId: 'session-1',
      routeId: route.routeId,
      routeKey: route.routeKey,
      replyTarget: {
        targetId: 'message-42',
        targetKind: 'message',
        participantId: 'user:primary',
      },
      sourceMessageId: 'assistant-message-9',
      sourceThreadId: 'thread-app-primary',
      metadata: {
        via: 'primary',
      },
    };

    const session: AssistantCanonicalSession = {
      sessionId: 'session-1',
      scope: 'notebook',
      origin: 'app',
      status: 'active',
      route,
      activation: {
        status: 'active',
        reason: 'direct-route',
        confidence: 'high',
      },
      replyContext,
      createdAt: 1_743_240_000_000,
      updatedAt: 1_743_240_000_100,
      metadata: {
        canonical: true,
      },
    };

    expect(session.route.participants.map(participant => participant.scope)).toEqual([
      'individual',
      'assistant',
    ]);
    expect(session.replyContext?.replyTarget.targetId).toBe('message-42');
    expect(session.activation.reason).toBe('direct-route');
    expect(ASSISTANT_SESSION_LIFECYCLE_ORDER).toContain(session.status);
  });

  it('normalizes direct, group, and channel routes through one transport-neutral contract surface', () => {
    const routes: AssistantSessionRoute[] = [
      {
        routeId: 'route-direct',
        kind: 'direct',
        routeKey: 'app:direct:notebook-1:user-primary',
        scope: 'notebook',
        origin: 'app',
        participantMode: 'one-to-one',
        participants: [],
      },
      {
        routeId: 'route-group',
        kind: 'group',
        routeKey: 'app:group:workspace-1:study-circle',
        scope: 'workspace',
        origin: 'app',
        participantMode: 'many-to-many',
        participants: [],
        threadId: 'thread-study-circle',
      },
      {
        routeId: 'route-channel',
        kind: 'channel',
        routeKey: 'channel:qq:room-88:thread-9',
        scope: 'channel',
        origin: 'channel',
        participantMode: 'thread',
        participants: [],
        threadId: 'thread-9',
      },
    ];

    expect(routes.map(route => route.kind)).toEqual(ASSISTANT_ROUTE_KIND_ORDER);
    expect(new Set(routes.map(route => route.routeKey)).size).toBe(routes.length);
    expect(routes.every(route => typeof route.routeId === 'string')).toBe(true);
  });

  it('re-exports the canonical session, route, reply, and activation contracts without leaking UI-local hook state', () => {
    const activationInput: AssistantActivationPolicyInput = {
      routeKind: 'group',
      routeScope: 'channel',
      sessionOrigin: 'channel',
      hasReplyContext: true,
      mentionsAssistant: true,
      addressedToAssistant: false,
      initiatedByAssistant: false,
      participantCount: 5,
    };

    const decision: AssistantActivationDecision = {
      status: 'active',
      reason: 'reply-context',
      confidence: 'high',
      matchedRuleId: 'reply-context-wins',
      metadata: {
        normalized: true,
      },
    };

    expect(DEFAULT_ASSISTANT_ACTIVATION_POLICY.allowReplyContextActivation).toBe(true);
    expect(DEFAULT_ASSISTANT_SESSION_ROUTE_POLICY.primaryDirectRouteKind).toBe('direct');
    expect(decision.reason).toBe('reply-context');
    expect(activationInput.routeScope).toBe('channel');

    const source = readFileSync(sessionContractsPath, 'utf8');
    expect(source).not.toContain('useState');
    expect(source).not.toContain('SetStateAction');
    expect(source).not.toContain('ChatMessage');
  });
});
