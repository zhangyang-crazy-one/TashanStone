import { ASSISTANT_ROUTE_POLICY_DEFAULTS } from './sessionRoutingConfig';
import { resolveAssistantSessionKey } from './sessionRouter';
import type {
  AssistantActivationContext,
  AssistantActivationDecision,
  AssistantActivationPolicy,
  AssistantReplyContextRef,
} from './sessionTypes';

export function isExplicitAssistantInvocation(messageText?: string): boolean {
  if (!messageText) {
    return false;
  }

  return /(^|[\s(])(@assistant|\/assistant\b|assistant[:,])/i.test(messageText.trim());
}

export function normalizeReplyContext(
  replyContext?: Partial<AssistantReplyContextRef>,
): AssistantReplyContextRef | undefined {
  if (!replyContext) {
    return undefined;
  }

  const normalized: AssistantReplyContextRef = {};
  if (replyContext.transportMessageId) {
    normalized.transportMessageId = replyContext.transportMessageId;
  }
  if (replyContext.replyToMessageId) {
    normalized.replyToMessageId = replyContext.replyToMessageId;
  }
  if (replyContext.replyTarget || replyContext.channelThreadId) {
    normalized.replyTarget = replyContext.replyTarget ?? replyContext.channelThreadId;
  }
  if (replyContext.channelThreadId || replyContext.replyTarget) {
    normalized.channelThreadId = replyContext.channelThreadId ?? replyContext.replyTarget;
  }
  if (replyContext.quotedText) {
    normalized.quotedText = replyContext.quotedText.trim();
  }
  if (replyContext.metadata && Object.keys(replyContext.metadata).length > 0) {
    normalized.metadata = replyContext.metadata;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function evaluateAssistantActivation(
  context: AssistantActivationContext,
  policy: AssistantActivationPolicy = ASSISTANT_ROUTE_POLICY_DEFAULTS[context.route.kind],
): AssistantActivationDecision {
  const sessionKey = resolveAssistantSessionKey(context.route);
  const normalizedReplyContext = normalizeReplyContext(context.replyContext);

  if (policy.blockedRouteKinds?.includes(context.route.kind)) {
    return {
      shouldInvoke: false,
      reason: 'blocked',
      sessionKey,
      normalizedReplyContext,
    };
  }

  if (policy.allowedRouteKinds && !policy.allowedRouteKinds.includes(context.route.kind)) {
    return {
      shouldInvoke: false,
      reason: 'blocked',
      sessionKey,
      normalizedReplyContext,
    };
  }

  const hasPrimaryRoute = context.route.kind === 'direct'
    || Boolean(context.route.participants?.some(participant => participant.role === 'primary'));

  if (policy.requirePrimaryParticipant && !hasPrimaryRoute) {
    return {
      shouldInvoke: false,
      reason: 'blocked',
      sessionKey,
      normalizedReplyContext,
    };
  }

  if (context.isReply && normalizedReplyContext && policy.allowReplies) {
    return {
      shouldInvoke: true,
      reason: 'reply-allowed',
      sessionKey,
      normalizedReplyContext,
    };
  }

  const explicitInvocation = Boolean(context.mentioned) || isExplicitAssistantInvocation(context.messageText);

  if (policy.mode === 'never') {
    return {
      shouldInvoke: false,
      reason: 'explicit-opt-out',
      sessionKey,
      normalizedReplyContext,
    };
  }

  if (policy.mode === 'mentions-only') {
    return explicitInvocation
      ? {
          shouldInvoke: true,
          reason: 'allowed',
          sessionKey,
          normalizedReplyContext,
        }
      : {
          shouldInvoke: false,
          reason: 'mentions-required',
          sessionKey,
          normalizedReplyContext,
        };
  }

  if (policy.mode === 'explicit') {
    return explicitInvocation
      ? {
          shouldInvoke: true,
          reason: 'allowed',
          sessionKey,
          normalizedReplyContext,
        }
      : {
          shouldInvoke: false,
          reason: 'explicit-opt-out',
          sessionKey,
          normalizedReplyContext,
        };
  }

  if (policy.requirePrimaryParticipant && hasPrimaryRoute) {
    return {
      shouldInvoke: true,
      reason: 'primary-route',
      sessionKey,
      normalizedReplyContext,
    };
  }

  return {
    shouldInvoke: true,
    reason: 'allowed',
    sessionKey,
    normalizedReplyContext,
  };
}
