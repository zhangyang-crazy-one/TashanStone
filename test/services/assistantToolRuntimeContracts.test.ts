import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type {
  AssistantDeliveryPolicy,
  AssistantDeliveryUnit,
  AssistantNormalizedMediaPart,
  AssistantToolExecutionRequest,
  AssistantToolExecutionResult,
} from '../../src/services/assistant-runtime/toolMediaContracts';
import type { AssistantRuntimeEvent } from '../../src/services/assistant-runtime/types';

const contractPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/services/assistant-runtime/toolMediaContracts.ts',
);

const runtimeTypesPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/services/assistant-runtime/types.ts',
);

describe('assistant tool runtime contracts', () => {
  it('defines explicit tool execution request and result contracts instead of caller-owned callback assumptions', () => {
    const request: AssistantToolExecutionRequest = {
      executionId: 'exec-1',
      toolCallId: 'tool-call-1',
      toolName: 'search-notes',
      sessionId: 'session-1',
      callerId: 'app-chat',
      transport: 'internal',
      arguments: {
        query: 'phase 3 contracts',
      },
      media: [],
    };

    const result: AssistantToolExecutionResult = {
      executionId: request.executionId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      status: 'success',
      result: {
        hitCount: 2,
      },
    };

    expect(result).toMatchObject({
      executionId: 'exec-1',
      toolName: 'search-notes',
      status: 'success',
      result: {
        hitCount: 2,
      },
    });
  });

  it('maps text, image, audio, and document inputs into one normalized media contract surface', () => {
    const parts: AssistantNormalizedMediaPart[] = [
      {
        partId: 'text-1',
        kind: 'text',
        role: 'input',
        text: 'Summarize the attached artifacts.',
      },
      {
        partId: 'image-1',
        kind: 'image',
        role: 'input',
        mimeType: 'image/png',
        uri: 'file:///tmp/screenshot.png',
      },
      {
        partId: 'audio-1',
        kind: 'audio',
        role: 'input',
        mimeType: 'audio/mpeg',
        uri: 'file:///tmp/meeting.mp3',
        extractedText: 'Agenda recap',
      },
      {
        partId: 'document-1',
        kind: 'document',
        role: 'input',
        mimeType: 'application/pdf',
        uri: 'file:///tmp/spec.pdf',
        extractedText: 'Runtime requirements',
      },
    ];

    expect(parts.map(part => part.kind)).toEqual(['text', 'image', 'audio', 'document']);
    expect(parts[2]).toMatchObject({
      kind: 'audio',
      extractedText: 'Agenda recap',
    });
  });

  it('describes delivery policy outputs as transport-neutral delivery units rather than channel-specific payloads', () => {
    const policy: AssistantDeliveryPolicy = {
      policyId: 'default',
      mode: 'chunked',
      maxChunkCharacters: 1200,
      preserveMarkdown: true,
      emitToolStatus: true,
      emitMediaStatus: true,
    };

    const unit: AssistantDeliveryUnit = {
      unitId: 'delivery-1',
      policyId: policy.policyId,
      kind: 'message',
      sequence: 0,
      status: 'ready',
      content: 'Chunk 1 of the answer',
    };

    expect(unit).toMatchObject({
      kind: 'message',
      status: 'ready',
      content: 'Chunk 1 of the answer',
    });
    expect('whatsAppPayload' in unit).toBe(false);
    expect('qqChannelPayload' in unit).toBe(false);
  });

  it('extends runtime events with media status visibility alongside tool status updates', () => {
    const event: AssistantRuntimeEvent = {
      type: 'media-status',
      requestId: 'request-1',
      sessionId: 'session-1',
      timestamp: Date.now(),
      mediaId: 'audio-1',
      kind: 'audio',
      status: 'processing',
      detail: 'Transcribing audio attachment',
    };

    expect(event).toMatchObject({
      type: 'media-status',
      kind: 'audio',
      status: 'processing',
    });
  });

  it('keeps the contract surface transport-neutral and free of UI component state', () => {
    const contractSource = readFileSync(contractPath, 'utf8');
    const runtimeTypesSource = readFileSync(runtimeTypesPath, 'utf8');

    expect(contractSource).toContain('export interface AssistantToolExecutionRequest');
    expect(contractSource).toContain('export interface AssistantDeliveryUnit');
    expect(contractSource).not.toMatch(/WhatsApp|QQ Channel|React|useState|setState|JSX/);

    expect(runtimeTypesSource).toContain("type: 'media-status'");
    expect(runtimeTypesSource).not.toMatch(/React|useState|setState|JSX/);
  });
});
