import type {
  AssistantDeliveryPolicy,
  AssistantDeliveryUnit,
} from './toolMediaContracts';
import type { AssistantRuntimeRequest } from './types';

export type AssistantDeliveryProfileId = 'in-app' | 'whatsapp' | 'qq-channel';

const DEFAULT_PROFILES: Record<AssistantDeliveryProfileId, AssistantDeliveryPolicy> = {
  'in-app': {
    policyId: 'in-app-default',
    mode: 'single',
    maxChunkCharacters: 4000,
    preserveMarkdown: true,
    emitToolStatus: true,
    emitMediaStatus: true,
    metadata: {
      channel: 'in-app',
      profile: 'in-app',
    },
  },
  whatsapp: {
    policyId: 'whatsapp-default',
    mode: 'chunked',
    maxChunkCharacters: 1200,
    preserveMarkdown: true,
    emitToolStatus: true,
    emitMediaStatus: true,
    metadata: {
      channel: 'whatsapp',
      profile: 'whatsapp',
    },
  },
  'qq-channel': {
    policyId: 'qq-channel-default',
    mode: 'chunked',
    maxChunkCharacters: 1800,
    preserveMarkdown: true,
    emitToolStatus: true,
    emitMediaStatus: true,
    metadata: {
      channel: 'qq-channel',
      profile: 'qq-channel',
    },
  },
};

export interface AssistantDeliveryPlan {
  policy: AssistantDeliveryPolicy;
  units: AssistantDeliveryUnit[];
}

export const resolveDeliveryProfileId = (
  request: Pick<AssistantRuntimeRequest, 'caller' | 'transport'>,
): AssistantDeliveryProfileId => {
  const explicit = request.transport?.metadata?.deliveryProfile;
  if (explicit === 'whatsapp' || explicit === 'qq-channel' || explicit === 'in-app') {
    return explicit;
  }

  if (request.caller.transport === 'in-app') {
    return 'in-app';
  }

  if (request.transport?.channel === 'webhook') {
    return 'whatsapp';
  }

  return 'qq-channel';
};

export const getDeliveryPolicyProfile = (profileId: AssistantDeliveryProfileId): AssistantDeliveryPolicy =>
  DEFAULT_PROFILES[profileId];

const splitIntoChunks = (content: string, maxChunkCharacters: number): string[] => {
  if (!content) {
    return [''];
  }

  if (content.length <= maxChunkCharacters) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content.trim();

  while (remaining.length > maxChunkCharacters) {
    let splitIndex = remaining.lastIndexOf('\n\n', maxChunkCharacters);
    if (splitIndex < Math.floor(maxChunkCharacters / 2)) {
      splitIndex = remaining.lastIndexOf('\n', maxChunkCharacters);
    }
    if (splitIndex < Math.floor(maxChunkCharacters / 2)) {
      splitIndex = remaining.lastIndexOf('. ', maxChunkCharacters);
    }
    if (splitIndex < Math.floor(maxChunkCharacters / 2)) {
      splitIndex = maxChunkCharacters;
    }

    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
};

export const createDeliveryPlan = (
  content: string,
  request: Pick<AssistantRuntimeRequest, 'caller' | 'transport'>,
): AssistantDeliveryPlan => {
  const profileId = resolveDeliveryProfileId(request);
  const policy = getDeliveryPolicyProfile(profileId);
  const chunks = policy.mode === 'single'
    ? [content]
    : splitIntoChunks(content, policy.maxChunkCharacters ?? 2000);

  return {
    policy,
    units: chunks.map((chunk, index) => ({
      unitId: `${policy.policyId}-${index + 1}`,
      policyId: policy.policyId,
      kind: 'message',
      sequence: index + 1,
      status: 'ready',
      content: chunk,
      target: policy.target,
      metadata: {
        profile: profileId,
        totalChunks: chunks.length,
      },
    })),
  };
};
