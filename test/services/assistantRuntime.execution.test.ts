import { describe, expect, it, vi } from 'vitest';

import type {
  AIConfig,
  AssistantRuntimeEvent,
  AssistantRuntimeRequest,
} from '../../types';
import {
  createAssistantRuntime,
  createProviderExecution,
} from '../../src/services/assistant-runtime';

const baseModelConfig: AIConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.3,
  language: 'en',
  enableStreaming: true,
};

function createRequest(overrides: Partial<AssistantRuntimeRequest> = {}): AssistantRuntimeRequest {
  return {
    requestId: 'request-1',
    session: {
      sessionId: 'session-1',
      scope: 'notebook',
      origin: 'test',
    },
    caller: {
      callerId: 'assistant-runtime-test',
      surface: 'automation',
      transport: 'cli',
      language: 'en',
      capabilities: {
        streaming: true,
        toolStatus: true,
        multimodalInput: false,
      },
    },
    modelConfig: baseModelConfig,
    input: {
      prompt: 'Summarize the notebook state.',
      messages: [
        {
          role: 'user',
          content: 'Previous request',
        },
      ],
    },
    ...overrides,
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

describe('assistant runtime execution', () => {
  it('executes through a shared runtime entrypoint and emits lifecycle plus streaming events', async () => {
    const runtime = createAssistantRuntime({
      providerExecution: createProviderExecution({
        generateResponseStream: vi.fn(async function* () {
          yield 'Notebook ';
          yield 'summary';
        }),
      }),
    });

    const events = await collectEvents(runtime, createRequest());

    expect(events.map(event => event.type)).toEqual([
      'lifecycle',
      'lifecycle',
      'lifecycle',
      'lifecycle',
      'stream-delta',
      'stream-delta',
      'result',
      'lifecycle',
    ]);
    expect(events.filter((event): event is Extract<AssistantRuntimeEvent, { type: 'lifecycle' }> => event.type === 'lifecycle').map(event => event.phase)).toEqual([
      'queued',
      'assembling-context',
      'executing',
      'streaming',
      'completed',
    ]);
    expect(events.filter((event): event is Extract<AssistantRuntimeEvent, { type: 'stream-delta' }> => event.type === 'stream-delta').map(event => event.accumulatedText)).toEqual([
      'Notebook ',
      'Notebook summary',
    ]);
    const resultEvent = events.find((event): event is Extract<AssistantRuntimeEvent, { type: 'result' }> => event.type === 'result');
    expect(resultEvent?.result.outputText).toBe('Notebook summary');
  });

  it('keeps the event envelope stable when switching providers', async () => {
    const providerExecution = createProviderExecution({
      generateResponseStream: vi.fn(async function* (_prompt, config) {
        yield `${config.provider}-chunk`;
      }),
    });
    const runtime = createAssistantRuntime({ providerExecution });

    const geminiEvents = await collectEvents(
      runtime,
      createRequest({
        requestId: 'request-gemini',
        session: { sessionId: 'session-gemini', scope: 'notebook', origin: 'test' },
        modelConfig: { ...baseModelConfig, provider: 'gemini' },
      }),
    );
    const openAiEvents = await collectEvents(
      runtime,
      createRequest({
        requestId: 'request-openai',
        session: { sessionId: 'session-openai', scope: 'notebook', origin: 'test' },
        modelConfig: { ...baseModelConfig, provider: 'openai', model: 'gpt-4o-mini' },
      }),
    );

    const summarize = (events: AssistantRuntimeEvent[]) =>
      events.map(event => {
        if (event.type === 'lifecycle') {
          return `lifecycle:${event.phase}`;
        }
        return event.type;
      });

    expect(summarize(geminiEvents)).toEqual(summarize(openAiEvents));
    expect(geminiEvents.at(-2)).toMatchObject({
      type: 'result',
      result: {
        status: 'success',
      },
    });
    expect(openAiEvents.at(-2)).toMatchObject({
      type: 'result',
      result: {
        status: 'success',
      },
    });
  });

  it('emits tool status events and terminal error events from the runtime surface', async () => {
    const runtime = createAssistantRuntime({
      providerExecution: createProviderExecution({
        generateResponseStream: vi.fn(async function* (_prompt, _config, _instruction, _contextFiles, _retrievedContext, _history, _tools, toolEventCallback) {
          toolEventCallback?.({
            id: 'tool-1',
            name: 'search_knowledge_base',
            args: { query: 'architecture' },
            provider: 'openai',
            status: 'running',
            startTime: 100,
          });
          toolEventCallback?.({
            id: 'tool-1',
            name: 'search_knowledge_base',
            args: { query: 'architecture' },
            provider: 'openai',
            status: 'success',
            result: { matches: 2 },
            startTime: 100,
            endTime: 120,
          });
          throw new Error('provider timed out');
        }),
      }),
    });

    const events = await collectEvents(
      runtime,
      createRequest({
        modelConfig: { ...baseModelConfig, provider: 'openai', model: 'gpt-4o-mini' },
      }),
    );

    expect(events.filter((event): event is Extract<AssistantRuntimeEvent, { type: 'tool-status' }> => event.type === 'tool-status')).toEqual([
      expect.objectContaining({
        type: 'tool-status',
        toolCallId: 'tool-1',
        toolName: 'search_knowledge_base',
        status: 'running',
      }),
      expect.objectContaining({
        type: 'tool-status',
        toolCallId: 'tool-1',
        toolName: 'search_knowledge_base',
        status: 'success',
        result: { matches: 2 },
      }),
    ]);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: {
        code: 'PROVIDER_EXECUTION_FAILED',
        message: 'provider timed out',
      },
    });
  });
});
