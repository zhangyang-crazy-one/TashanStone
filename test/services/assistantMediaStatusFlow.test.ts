import { describe, expect, it, vi } from 'vitest';

import type { AIConfig, AssistantRuntimeEvent, AssistantRuntimeRequest } from '../../types';
import { createAssistantRuntime } from '../../src/services/assistant-runtime/createAssistantRuntime';
import { createProviderExecution } from '../../src/services/assistant-runtime/providerExecution';
import type { AssistantNormalizedMediaEnvelope } from '../../src/services/assistant-runtime/toolMediaContracts';

const baseConfig: AIConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.3,
  language: 'en',
  enableStreaming: false,
};

function createRequest(): AssistantRuntimeRequest {
  return {
    requestId: 'request-1',
    session: {
      sessionId: 'session-1',
      scope: 'notebook',
      origin: 'test',
    },
    caller: {
      callerId: 'media-status-test',
      surface: 'automation',
      transport: 'cli',
      language: 'en',
      capabilities: {
        streaming: false,
        toolStatus: true,
        multimodalInput: true,
      },
    },
    modelConfig: baseConfig,
    input: {
      prompt: 'Summarize the image',
      attachments: [
        {
          kind: 'image',
          label: 'Architecture chart',
          mimeType: 'image/png',
          metadata: { dataUrl: 'data:image/png;base64,chart' },
        },
      ],
    },
    notebook: {
      notebookId: 'notebook-1',
      attachments: [
        {
          kind: 'audio',
          label: 'Voice memo',
          mimeType: 'audio/wav',
          metadata: { path: '/tmp/memo.wav' },
        },
      ],
    },
  };
}

async function collectEvents(
  runtime: ReturnType<typeof createAssistantRuntime>,
  request: AssistantRuntimeRequest,
) {
  const events: AssistantRuntimeEvent[] = [];
  for await (const event of runtime.execute(request)) {
    events.push(event);
  }
  return events;
}

describe('assistant media status flow', () => {
  it('feeds normalized multimodal inputs into provider execution and emits runtime media-status events', async () => {
    const generateResponse = vi.fn(async (prompt: string) => {
      expect(prompt).toContain('[IMAGE: Architecture chart]');
      expect(prompt).toContain('Chart OCR text');
      expect(prompt).toContain('[AUDIO: Voice memo]');
      expect(prompt).toContain('Voice memo transcript');
      return 'Provider completed with multimodal context';
    });

    const providerExecution = createProviderExecution({
      generateResponse,
      multimodalNormalizer: {
        normalize: vi.fn(async (_payload, options) => {
          options?.onStatus?.({
            mediaId: 'image-1',
            kind: 'image',
            status: 'processing',
            detail: 'Running OCR',
          });
          options?.onStatus?.({
            mediaId: 'image-1',
            kind: 'image',
            status: 'ready',
            detail: 'OCR complete',
          });
          options?.onStatus?.({
            mediaId: 'audio-1',
            kind: 'audio',
            status: 'processing',
            detail: 'Running transcription',
          });
          options?.onStatus?.({
            mediaId: 'audio-1',
            kind: 'audio',
            status: 'ready',
            detail: 'Transcription complete',
          });
          const envelope: AssistantNormalizedMediaEnvelope = {
            primaryText: 'Summarize the image',
            parts: [
              {
                partId: 'text-1',
                kind: 'text',
                role: 'input',
                text: 'Summarize the image',
              },
              {
                partId: 'image-1',
                kind: 'image',
                role: 'input',
                label: 'Architecture chart',
                extractedText: 'Chart OCR text',
                metadata: {},
              },
              {
                partId: 'audio-1',
                kind: 'audio',
                role: 'input',
                label: 'Voice memo',
                extractedText: 'Voice memo transcript',
                metadata: {},
              },
            ],
          };
          return envelope;
        }),
      },
    });

    const runtime = createAssistantRuntime({ providerExecution });
    const events = await collectEvents(runtime, createRequest());

    const mediaEvents = events.filter(
      (event): event is Extract<AssistantRuntimeEvent, { type: 'media-status' }> =>
        event.type === 'media-status',
    );

    expect(mediaEvents.map(event => `${event.kind}:${event.status}`)).toEqual([
      'image:processing',
      'image:ready',
      'audio:processing',
      'audio:ready',
    ]);
    expect(events.at(-2)).toMatchObject({
      type: 'result',
      result: {
        outputText: 'Provider completed with multimodal context',
      },
    });
  });

  it('surfaces media extraction failures as explicit runtime-visible error states without silent drops', async () => {
    const generateResponse = vi.fn(async () => 'Fallback provider response');

    const providerExecution = createProviderExecution({
      generateResponse,
      multimodalNormalizer: {
        normalize: vi.fn(async (_payload, options) => {
          options?.onStatus?.({
            mediaId: 'document-1',
            kind: 'document',
            status: 'processing',
            detail: 'Running extraction',
          });
          options?.onStatus?.({
            mediaId: 'document-1',
            kind: 'document',
            status: 'error',
            detail: 'Unsupported document source',
            error: {
              code: 'MEDIA_EXTRACTION_FAILED',
              message: 'Unsupported document source',
              retryable: false,
            },
          });
          const envelope: AssistantNormalizedMediaEnvelope = {
            primaryText: 'Summarize the image',
            parts: [
              {
                partId: 'text-1',
                kind: 'text',
                role: 'input',
                text: 'Summarize the image',
              },
            ],
          };
          return envelope;
        }),
      },
    });

    const runtime = createAssistantRuntime({ providerExecution });
    const events = await collectEvents(runtime, createRequest());

    expect(events.filter(event => event.type === 'media-status')).toEqual([
      expect.objectContaining({
        type: 'media-status',
        kind: 'document',
        status: 'processing',
      }),
      expect.objectContaining({
        type: 'media-status',
        kind: 'document',
        status: 'error',
        error: expect.objectContaining({
          code: 'MEDIA_EXTRACTION_FAILED',
          message: 'Unsupported document source',
        }),
      }),
    ]);
    expect(events.at(-2)).toMatchObject({
      type: 'result',
      result: {
        outputText: 'Fallback provider response',
      },
    });
  });
});
