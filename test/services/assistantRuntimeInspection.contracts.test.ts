import { describe, expect, it } from 'vitest';

import type { AIConfig, AssistantRuntimeRequest } from '../../types';
import {
  createAssistantRuntime,
  createContextAssembler,
  type AssistantRuntime,
  type AssistantRuntimeEvent,
  type AssistantRuntimeResult,
} from '../../src/services/assistant-runtime';

const baseConfig: AIConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.4,
  language: 'en',
  enableStreaming: true,
  mcpTools: '[]',
};

function createRequest(): AssistantRuntimeRequest {
  return {
    requestId: 'request-inspection',
    session: {
      sessionId: 'session-inspection',
      threadId: 'thread-1',
      scope: 'notebook',
      origin: 'app',
    },
    caller: {
      callerId: 'in-app-assistant',
      surface: 'app-chat',
      transport: 'in-app',
      routeKey: 'notebook:in-app-assistant:primary',
      language: 'en',
      capabilities: {
        streaming: true,
        toolStatus: true,
        multimodalInput: true,
      },
    },
    modelConfig: baseConfig,
    input: {
      prompt: 'Summarize the active notebook context.',
      messages: [
        {
          role: 'user',
          content: 'What changed in the runtime?',
        },
      ],
      instructions: ['Keep responses concise.'],
      locale: 'en',
    },
    notebook: {
      notebookId: 'notebook-1',
      workspaceId: 'workspace-1',
      activeFileId: 'note-1',
      selectedFileIds: ['note-1', 'note-2'],
      selectedText: 'The runtime now owns assistant execution.',
      knowledgeQuery: 'assistant runtime execution',
    },
  };
}

async function collectExecution(
  runtime: AssistantRuntime,
  request: AssistantRuntimeRequest,
): Promise<{ events: AssistantRuntimeEvent[]; result: AssistantRuntimeResult }> {
  const iterator = runtime.execute(request);
  const events: AssistantRuntimeEvent[] = [];

  while (true) {
    const next = await iterator.next();
    if (next.done) {
      return {
        events,
        result: next.value,
      };
    }

    events.push(next.value);
  }
}

describe('assistant runtime inspection contracts', () => {
  it('exposes inspectable session and lifecycle metadata on canonical runtime events', async () => {
    const runtime = createAssistantRuntime({
      contextAssembler: createContextAssembler({
        adapters: [
          {
            adapterId: 'workspace-state',
            kind: 'workspace',
            assemble: () => ({
              source: 'workspace',
              sections: [
                {
                  id: 'workspace-state',
                  label: 'Workspace State',
                  content: 'Active File: note-1\nSelected Text: runtime ownership moved to the runtime.',
                },
              ],
            }),
          },
        ],
      }),
      providerExecution: async ({ onStreamDelta }) => {
        onStreamDelta?.('Runtime ', 'Runtime ');
        onStreamDelta?.('inspection', 'Runtime inspection');

        return {
          outputText: 'Runtime inspection',
          streamed: true,
        };
      },
    });

    const { events } = await collectExecution(runtime, createRequest());
    const queuedEvent = events.find(event => event.type === 'lifecycle' && event.phase === 'queued');
    const streamingEvent = events.find(event => event.type === 'stream-delta' && event.accumulatedText === 'Runtime inspection');

    expect(queuedEvent?.inspection?.session.sessionId).toBe('session-inspection');
    expect(queuedEvent?.inspection?.session.scope).toBe('notebook');
    expect(queuedEvent?.inspection?.lifecycle.phase).toBe('queued');
    expect(streamingEvent?.inspection?.streaming.deltaCount).toBe(2);
    expect(streamingEvent?.inspection?.streaming.accumulatedTextLength).toBe('Runtime inspection'.length);
  });

  it('keeps inspection metadata transport-neutral by returning it on runtime result contracts', async () => {
    const runtime = createAssistantRuntime({
      contextAssembler: createContextAssembler({
        adapters: [
          {
            adapterId: 'workspace-state',
            kind: 'workspace',
            assemble: () => ({
              source: 'workspace',
              sections: [
                {
                  id: 'workspace-state',
                  label: 'Workspace State',
                  content: 'Active File: note-1',
                },
              ],
            }),
          },
        ],
      }),
      providerExecution: async () => ({
        outputText: 'Transport-neutral inspection',
        streamed: false,
      }),
    });

    const { result } = await collectExecution(runtime, createRequest());

    expect(result.inspection?.session.sessionId).toBe('session-inspection');
    expect(result.inspection?.lifecycle.phase).toBe('completed');
    expect(result.metadata?.inspection).toEqual(result.inspection);
  });

  it('captures assembled context section summaries so callers do not parse chat text for inspection', async () => {
    const runtime = createAssistantRuntime({
      contextAssembler: createContextAssembler({
        adapters: [
          {
            adapterId: 'workspace-state',
            kind: 'workspace',
            assemble: () => ({
              source: 'workspace',
              sections: [
                {
                  id: 'workspace-state',
                  label: 'Workspace State',
                  content: 'Active File: note-1\nSelected Text: The runtime now owns assistant execution.',
                },
              ],
            }),
          },
          {
            adapterId: 'knowledge-context',
            kind: 'knowledge',
            assemble: () => ({
              source: 'knowledge',
              sections: [
                {
                  id: 'knowledge-context',
                  label: 'Knowledge Context',
                  content: 'Shared runtime notes and parity research.',
                },
              ],
            }),
          },
        ],
      }),
      providerExecution: async () => ({
        outputText: 'Inspection summary ready.',
        streamed: false,
      }),
    });

    const { result } = await collectExecution(runtime, createRequest());
    const sectionLabels = result.inspection?.context.sections.map(section => section.label);
    const workspaceSection = result.inspection?.context.sections.find(section => section.id === 'workspace-state');

    expect(result.inspection?.context.adapterIds).toEqual(['workspace-state', 'knowledge-context']);
    expect(sectionLabels).toEqual(['Workspace State', 'Knowledge Context']);
    expect(workspaceSection?.source).toBe('workspace');
    expect(workspaceSection?.preview).toContain('Selected Text');
    expect(workspaceSection?.charCount).toBeGreaterThan(20);
  });
});
