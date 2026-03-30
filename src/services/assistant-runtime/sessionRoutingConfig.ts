import type { AssistantActivationPolicy, AssistantRouteKind } from './sessionTypes';

export const ASSISTANT_ROUTE_KIND_ORDER: AssistantRouteKind[] = [
  'direct',
  'group',
  'channel-thread',
  'automation',
];

export const ASSISTANT_ROUTE_POLICY_DEFAULTS: Record<AssistantRouteKind, AssistantActivationPolicy> = {
  direct: {
    mode: 'always',
    allowReplies: true,
    requirePrimaryParticipant: true,
    allowedRouteKinds: ['direct'],
  },
  group: {
    mode: 'mentions-only',
    allowReplies: true,
    allowedRouteKinds: ['group'],
  },
  'channel-thread': {
    mode: 'mentions-only',
    allowReplies: true,
    allowedRouteKinds: ['channel-thread'],
  },
  automation: {
    mode: 'explicit',
    allowReplies: false,
    allowedRouteKinds: ['automation'],
  },
};
