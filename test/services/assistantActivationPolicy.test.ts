import { describe, expect, it } from 'vitest';

import {
  evaluateAssistantActivation,
  normalizeReplyContext,
} from '../../src/services/assistant-runtime/sessionPolicy';
import { ASSISTANT_ROUTE_POLICY_DEFAULTS } from '../../src/services/assistant-runtime/sessionRoutingConfig';
import type { AssistantActivationContext } from '../../types';

function buildContext(overrides: Partial<AssistantActivationContext> = {}): AssistantActivationContext {
  return {
    route: {
      routeId: 'route-1',
      kind: 'direct',
      routeKey: 'notebook:in-app-assistant:primary',
      transport: 'electron-ipc',
      origin: 'app',
      scope: 'notebook',
      participants: [
        {
          participantId: 'user-primary',
          role: 'primary',
        },
      ],
    },
    caller: {
      callerId: 'in-app-assistant',
      surface: 'app-chat',
      transport: 'in-app',
      routeKey: 'notebook:in-app-assistant:primary',
    },
    ...overrides,
  };
}

describe('assistant activation policy', () => {
  it('allows primary direct routes through explicit policy output instead of UI-local assumptions', () => {
    const decision = evaluateAssistantActivation(
      buildContext(),
      ASSISTANT_ROUTE_POLICY_DEFAULTS.direct,
    );

    expect(decision).toEqual(
      expect.objectContaining({
        shouldInvoke: true,
        reason: 'primary-route',
        sessionKey: 'notebook:in-app-assistant:primary',
      }),
    );
  });

  it('requires mentions for grouped routes unless a reply is explicitly allowed', () => {
    const groupContext = buildContext({
      route: {
        routeId: 'route-group',
        kind: 'group',
        routeKey: 'channel:qq:group:user-a,user-b',
        transport: 'webhook',
        origin: 'channel',
        scope: 'channel',
        participants: [
          { participantId: 'user-a', role: 'member' },
          { participantId: 'user-b', role: 'member' },
        ],
      },
      caller: {
        callerId: 'qq',
        surface: 'channel',
        transport: 'webhook',
        routeKey: 'channel:qq:group:user-a,user-b',
      },
      messageText: 'Please summarize this thread',
      mentioned: false,
    });

    const blocked = evaluateAssistantActivation(groupContext, ASSISTANT_ROUTE_POLICY_DEFAULTS.group);
    expect(blocked.shouldInvoke).toBe(false);
    expect(blocked.reason).toBe('mentions-required');

    const replyAllowed = evaluateAssistantActivation(
      {
        ...groupContext,
        isReply: true,
        replyContext: {
          replyToMessageId: 'msg-prev',
          channelThreadId: 'thread-9',
        },
      },
      ASSISTANT_ROUTE_POLICY_DEFAULTS.group,
    );
    expect(replyAllowed.shouldInvoke).toBe(true);
    expect(replyAllowed.reason).toBe('reply-allowed');
    expect(replyAllowed.normalizedReplyContext).toEqual(
      expect.objectContaining({
        replyToMessageId: 'msg-prev',
        replyTarget: 'thread-9',
      }),
    );
  });

  it('normalizes reply metadata into a persistence-safe shape for later channel resume', () => {
    expect(normalizeReplyContext({
      replyToMessageId: 'msg-1',
      channelThreadId: 'thread-1',
      quotedText: '  quoted text  ',
    })).toEqual({
      replyToMessageId: 'msg-1',
      replyTarget: 'thread-1',
      channelThreadId: 'thread-1',
      quotedText: 'quoted text',
    });
  });
});
