import { describe, expect, it } from 'vitest';

import { resolveAssistantSession } from '../../src/services/assistant-runtime/sessionRouter';

describe('assistant session router', () => {
  it('resolves direct app calls to one stable primary session model instead of request-local ids', () => {
    const first = resolveAssistantSession({
      caller: {
        callerId: 'in-app-assistant',
        surface: 'app-chat',
        transport: 'in-app',
      },
      now: 1000,
    });

    const second = resolveAssistantSession({
      caller: {
        callerId: 'in-app-assistant',
        surface: 'app-chat',
        transport: 'in-app',
      },
      now: 2000,
    });

    expect(first.route.kind).toBe('direct');
    expect(first.sessionKey).toBe('notebook:in-app-assistant:primary');
    expect(second.sessionKey).toBe(first.sessionKey);
  });

  it('keeps grouped and channel-thread routes isolated by canonical route metadata', () => {
    const group = resolveAssistantSession({
      caller: {
        callerId: 'qq-channel',
        surface: 'channel',
        transport: 'webhook',
      },
      participantIds: ['user-a', 'user-b'],
    });

    const thread = resolveAssistantSession({
      caller: {
        callerId: 'qq-channel',
        surface: 'channel',
        transport: 'webhook',
      },
      threadId: 'thread-42',
      transport: {
        channel: 'webhook',
        replyTarget: 'thread-42',
      },
    });

    expect(group.route.kind).toBe('group');
    expect(group.sessionKey).toContain(':group:');
    expect(thread.route.kind).toBe('channel-thread');
    expect(thread.sessionKey).toBe('channel:qq-channel:thread:thread-42');
    expect(thread.sessionKey).not.toBe(group.sessionKey);
  });

  it('stays transport-neutral by preserving explicit route keys from future callers', () => {
    const resolved = resolveAssistantSession({
      caller: {
        callerId: 'future-adapter',
        surface: 'channel',
        transport: 'webhook',
        routeKey: 'custom:transport-neutral:key',
      },
      routeMetadata: {
        provider: 'qq',
      },
      transport: {
        channel: 'webhook',
      },
    });

    expect(resolved.route.routeKey).toBe('custom:transport-neutral:key');
    expect(resolved.route.transport).toBe('webhook');
    expect(resolved.route.metadata).toEqual({ provider: 'qq' });
  });
});
