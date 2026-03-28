import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type {
  AIConfig,
  AssistantContextAdapter,
  AssistantNotebookContextInput,
  AssistantRuntimeCaller,
  AssistantRuntimeEvent,
  AssistantRuntimeRequest,
  AssistantRuntimeResult,
  AssistantSessionRef,
} from '../../types';

const runtimeContractPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/services/assistant-runtime/types.ts',
);

const baseModelConfig: AIConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.4,
  language: 'en',
};

function assertNever(value: never): never {
  throw new Error(`Unhandled runtime event: ${JSON.stringify(value)}`);
}

describe('assistant runtime contracts', () => {
  it('describes a caller-neutral runtime request with session, model, notebook, and transport metadata', () => {
    const session: AssistantSessionRef = {
      sessionId: 'session-1',
      threadId: 'thread-1',
      scope: 'notebook',
      origin: 'app',
    };

    const notebook: AssistantNotebookContextInput = {
      notebookId: 'notebook-1',
      workspaceId: 'workspace-1',
      activeFileId: 'file-1',
      selectedFileIds: ['file-1'],
      selectedText: 'Important paragraph',
      knowledgeQuery: 'summarize the active notebook',
      attachments: [
        {
          kind: 'file',
          fileId: 'file-1',
          mimeType: 'text/markdown',
          label: 'Active note',
        },
      ],
    };

    const request: AssistantRuntimeRequest = {
      requestId: 'request-1',
      session,
      caller: {
        callerId: 'chat-panel',
        surface: 'app-chat',
        transport: 'in-app',
        language: 'en',
        capabilities: {
          streaming: true,
          toolStatus: true,
          multimodalInput: true,
        },
      },
      modelConfig: baseModelConfig,
      input: {
        prompt: 'Summarize the active notebook context.',
        attachments: notebook.attachments,
      },
      notebook,
      transport: {
        channel: 'electron-ipc',
        messageId: 'ipc-42',
        metadata: {
          route: 'assistant:chat',
          source: 'chat-panel',
        },
      },
    };

    expect(request).toMatchObject({
      requestId: 'request-1',
      session: {
        sessionId: 'session-1',
        scope: 'notebook',
      },
      caller: {
        callerId: 'chat-panel',
        transport: 'in-app',
      },
      modelConfig: {
        provider: 'gemini',
      },
      transport: {
        channel: 'electron-ipc',
      },
    });
    expect(request.notebook?.attachments?.[0]?.kind).toBe('file');
  });

  it('covers lifecycle, streaming, tool status, success, and error runtime events as a discriminated union', () => {
    const terminalResult: AssistantRuntimeResult = {
      status: 'success',
      sessionId: 'session-1',
      outputText: 'Notebook summary',
      completedAt: 1_747_000_000_000,
    };

    const events: AssistantRuntimeEvent[] = [
      {
        type: 'lifecycle',
        phase: 'queued',
        requestId: 'request-1',
        sessionId: 'session-1',
        timestamp: 1,
      },
      {
        type: 'stream-delta',
        requestId: 'request-1',
        sessionId: 'session-1',
        timestamp: 2,
        delta: 'Notebook ',
        accumulatedText: 'Notebook ',
      },
      {
        type: 'tool-status',
        requestId: 'request-1',
        sessionId: 'session-1',
        timestamp: 3,
        toolCallId: 'tool-1',
        toolName: 'search_knowledge_base',
        status: 'running',
      },
      {
        type: 'result',
        requestId: 'request-1',
        sessionId: 'session-1',
        timestamp: 4,
        result: terminalResult,
      },
      {
        type: 'error',
        requestId: 'request-1',
        sessionId: 'session-1',
        timestamp: 5,
        error: {
          code: 'MODEL_TIMEOUT',
          message: 'provider timed out',
          retryable: true,
        },
      },
    ];

    const summaries = events.map(event => {
      switch (event.type) {
        case 'lifecycle':
          return `lifecycle:${event.phase}`;
        case 'stream-delta':
          return `delta:${event.delta}`;
        case 'tool-status':
          return `tool:${event.toolName}:${event.status}`;
        case 'result':
          return `result:${event.result.status}`;
        case 'error':
          return `error:${event.error.code}`;
        default:
          return assertNever(event);
      }
    });

    expect(summaries).toEqual([
      'lifecycle:queued',
      'delta:Notebook ',
      'tool:search_knowledge_base:running',
      'result:success',
      'error:MODEL_TIMEOUT',
    ]);
  });

  it('lets caller adapters consume runtime events without React, JSX, or component-local message state in the contract', async () => {
    const caller: AssistantRuntimeCaller = {
      callerId: 'qq-channel',
      surface: 'channel',
      transport: 'webhook',
      language: 'zh',
      capabilities: {
        streaming: false,
        toolStatus: true,
        multimodalInput: true,
      },
    };

    const adapter: AssistantContextAdapter = {
      adapterId: 'notebook-context',
      kind: 'notebook',
      assemble: async input => ({
        source: 'notebook',
        sections: [
          {
            id: 'selection',
            label: 'Active Selection',
            content: input.selectedText ?? '',
          },
        ],
      }),
    };

    const consumeEvent = (currentCaller: AssistantRuntimeCaller, event: AssistantRuntimeEvent): string => {
      switch (event.type) {
        case 'stream-delta':
          return `${currentCaller.callerId}:${event.delta}`;
        case 'result':
          return `${currentCaller.surface}:${event.result.status}`;
        case 'error':
          return `${currentCaller.transport}:${event.error.code}`;
        case 'lifecycle':
          return event.phase;
        case 'tool-status':
          return event.toolName;
        default:
          return assertNever(event);
      }
    };

    const notebookInput: AssistantNotebookContextInput = {
      notebookId: 'notebook-1',
      selectedText: 'A context block',
    };

    await expect(adapter.assemble(notebookInput)).resolves.toMatchObject({
      source: 'notebook',
      sections: [
        {
          id: 'selection',
          content: 'A context block',
        },
      ],
    });
    expect(
      consumeEvent(caller, {
        type: 'result',
        requestId: 'request-1',
        sessionId: 'session-1',
        timestamp: 12,
        result: {
          status: 'success',
          sessionId: 'session-1',
          outputText: 'done',
          completedAt: 12,
        },
      }),
    ).toBe('channel:success');

    const source = readFileSync(runtimeContractPath, 'utf8');
    expect(source).not.toMatch(/from ['"]react['"]/);
    expect(source).not.toMatch(/\bDispatch\b|\bSetStateAction\b|\bJSX\b/);
    expect(source).not.toMatch(/\bchatMessages\b|\bsetChatMessages\b/);
  });
});
