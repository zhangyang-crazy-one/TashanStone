import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ASSISTANT_DELIVERY_UNIT_KINDS,
  ASSISTANT_MEDIA_STATUSES,
  ASSISTANT_TOOL_EXECUTION_STATUSES,
} from '../../src/services/assistant-runtime';
import type {
  AssistantDeliveryPolicy,
  AssistantDeliveryUnit,
  AssistantToolExecutionResult,
} from '../../src/services/assistant-runtime';

const runtimeIndexPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/services/assistant-runtime/index.ts',
);

describe('assistant delivery policy contracts', () => {
  it('exposes the Phase 3 contract surface from the assistant runtime barrel', () => {
    const policy: AssistantDeliveryPolicy = {
      policyId: 'barrel-default',
      mode: 'chunked',
      preserveMarkdown: true,
      emitToolStatus: true,
      emitMediaStatus: true,
    };

    const unit: AssistantDeliveryUnit = {
      unitId: 'delivery-1',
      policyId: policy.policyId,
      kind: 'tool-status',
      sequence: 1,
      status: 'ready',
      content: 'Tool finished successfully',
      toolCallId: 'tool-1',
    };

    expect(unit).toMatchObject({
      kind: 'tool-status',
      status: 'ready',
      toolCallId: 'tool-1',
    });
  });

  it('keeps delivery-policy contracts transport-neutral and future-channel-safe', () => {
    const unit: AssistantDeliveryUnit = {
      unitId: 'delivery-2',
      policyId: 'neutral',
      kind: 'message',
      sequence: 0,
      status: 'pending',
      content: 'Chunked response',
      target: {
        routeKey: 'channel:future:test',
      },
    };

    expect(unit.target).toMatchObject({
      routeKey: 'channel:future:test',
    });
    expect('whatsAppPayload' in unit).toBe(false);
    expect('qqGuildPayload' in unit).toBe(false);
  });

  it('fails loudly if delivery-unit or tool and media status types drift from the shared contract', () => {
    expect(ASSISTANT_TOOL_EXECUTION_STATUSES).toEqual(['pending', 'running', 'success', 'error']);
    expect(ASSISTANT_MEDIA_STATUSES).toEqual(['pending', 'processing', 'ready', 'error']);
    expect(ASSISTANT_DELIVERY_UNIT_KINDS).toEqual(['message', 'tool-status', 'media-status']);

    const result: AssistantToolExecutionResult = {
      executionId: 'exec-1',
      toolCallId: 'tool-1',
      toolName: 'summarize-note',
      status: 'error',
      error: {
        code: 'TOOL_FAILURE',
        message: 'Tool execution failed',
        retryable: true,
      },
    };

    expect(result.error?.retryable).toBe(true);
  });

  it('keeps the barrel export readable and aligned with the dedicated contract module', () => {
    const source = readFileSync(runtimeIndexPath, 'utf8');

    expect(source).toContain("export * from './toolMediaContracts';");
  });
});
