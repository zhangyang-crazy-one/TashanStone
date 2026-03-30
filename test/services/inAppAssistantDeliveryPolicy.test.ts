import { describe, expect, it, vi } from 'vitest';

import type { AIConfig, AssistantRuntimeRequest } from '../../types';
import {
  createDeliveryPlan,
  getDeliveryPolicyProfile,
} from '../../src/services/assistant-runtime/deliveryPolicy';
import { createProviderExecution } from '../../src/services/assistant-runtime/providerExecution';

const baseConfig: AIConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.3,
  language: 'en',
  enableStreaming: true,
};

function createRequest(profile?: 'in-app' | 'whatsapp' | 'qq-channel'): AssistantRuntimeRequest {
  return {
    requestId: 'request-1',
    session: {
      sessionId: 'session-1',
      scope: 'notebook',
      origin: 'test',
    },
    caller: {
      callerId: 'delivery-policy-test',
      surface: 'app-chat',
      transport: 'in-app',
      language: 'en',
      capabilities: {
        streaming: false,
        toolStatus: true,
        multimodalInput: true,
      },
    },
    modelConfig: baseConfig,
    input: {
      prompt: 'Summarize this long response',
    },
    transport: {
      channel: 'electron-ipc',
      metadata: profile ? { deliveryProfile: profile } : undefined,
    },
  };
}

describe('in-app assistant delivery policy', () => {
  it('selects different channel policy configs without caller-side branching', () => {
    const inAppPolicy = getDeliveryPolicyProfile('in-app');
    const whatsappPolicy = getDeliveryPolicyProfile('whatsapp');
    const qqPolicy = getDeliveryPolicyProfile('qq-channel');

    expect(inAppPolicy.policyId).toBe('in-app-default');
    expect(whatsappPolicy.policyId).toBe('whatsapp-default');
    expect(qqPolicy.policyId).toBe('qq-channel-default');
    expect(inAppPolicy.maxChunkCharacters).toBeGreaterThan(whatsappPolicy.maxChunkCharacters ?? 0);
    expect(qqPolicy.maxChunkCharacters).toBeGreaterThan(whatsappPolicy.maxChunkCharacters ?? 0);
  });

  it('chunks long responses into transport-neutral delivery units according to the selected profile', () => {
    const longResponse = Array.from({ length: 12 }, (_, index) => `Paragraph ${index + 1}: ${'context '.repeat(40)}`).join('\n\n');

    const inAppPlan = createDeliveryPlan(longResponse, createRequest('in-app'));
    const whatsappPlan = createDeliveryPlan(longResponse, createRequest('whatsapp'));

    expect(inAppPlan.policy.policyId).toBe('in-app-default');
    expect(whatsappPlan.policy.policyId).toBe('whatsapp-default');
    expect(inAppPlan.units.length).toBeLessThanOrEqual(whatsappPlan.units.length);
    expect(whatsappPlan.units.every(unit => unit.kind === 'message')).toBe(true);
    expect(whatsappPlan.units[0]?.metadata).toMatchObject({
      profile: 'whatsapp',
    });
  });

  it('maps both non-streaming and streaming provider outputs into delivery plans', async () => {
    const providerExecution = createProviderExecution({
      generateResponse: vi.fn(async () => 'Non-streaming response ' + 'x'.repeat(1800)),
      generateResponseStream: vi.fn(async function* () {
        yield 'Streaming response ';
        yield 'part two ';
        yield 'part three ' + 'y'.repeat(1800);
      }),
    });

    const nonStreaming = await providerExecution({
      prompt: 'Base prompt',
      request: {
        ...createRequest('whatsapp'),
        caller: {
          ...createRequest('whatsapp').caller,
          capabilities: {
            streaming: false,
            toolStatus: true,
            multimodalInput: true,
          },
        },
        modelConfig: {
          ...baseConfig,
          enableStreaming: false,
        },
      },
    });

    const streaming = await providerExecution({
      prompt: 'Base prompt',
      request: {
        ...createRequest('qq-channel'),
        caller: {
          ...createRequest('qq-channel').caller,
          capabilities: {
            streaming: true,
            toolStatus: true,
            multimodalInput: true,
          },
        },
      },
      onStreamDelta: vi.fn(),
    });

    expect(nonStreaming.delivery?.policy.policyId).toBe('whatsapp-default');
    expect(nonStreaming.delivery?.units.length).toBeGreaterThan(1);
    expect(streaming.delivery?.policy.policyId).toBe('qq-channel-default');
    expect(streaming.delivery?.units.length).toBeGreaterThan(1);
  });
});
