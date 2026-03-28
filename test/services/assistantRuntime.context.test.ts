import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AIConfig,
  AssistantContextAdapter,
  AssistantRuntimeEvent,
  AssistantRuntimeRequest,
} from '../../types';
import {
  createAssistantRuntime,
  createContextAssembler,
} from '../../src/services/assistant-runtime';
import { DEFAULT_CONTEXT_BUDGET_RATIOS } from '../../src/services/context';

const baseModelConfig: AIConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.2,
  language: 'en',
  enableStreaming: false,
  contextEngine: {
    enabled: true,
    maxTokens: 12000,
    compactThreshold: 0.85,
    pruneThreshold: 0.7,
    truncateThreshold: 0.9,
    messagesToKeep: 4,
    checkpointInterval: 10,
  },
};

const notebookAdapter: AssistantContextAdapter = {
  adapterId: 'notes',
  kind: 'notebook',
  assemble: async input => ({
    source: 'notebook',
    sections: [
      {
        id: 'note',
        label: 'Notebook Notes',
        content: `Active file: ${input.activeFileId ?? 'none'}`,
      },
    ],
  }),
};

const workspaceAdapter: AssistantContextAdapter = {
  adapterId: 'workspace',
  kind: 'workspace',
  assemble: async input => ({
    source: 'workspace',
    sections: [
      {
        id: 'workspace-state',
        label: 'Workspace State',
        content: `Workspace ${input.workspaceId ?? 'missing'} with ${input.selectedFileIds?.length ?? 0} selected files`,
      },
    ],
  }),
};

const knowledgeAdapter: AssistantContextAdapter = {
  adapterId: 'knowledge',
  kind: 'knowledge',
  assemble: async input => ({
    source: 'knowledge',
    sections: [
      {
        id: 'knowledge',
        label: 'Knowledge Context',
        content: `Knowledge query: ${input.knowledgeQuery ?? 'none'}`,
      },
    ],
  }),
};

function createRequest(overrides: Partial<AssistantRuntimeRequest> = {}): AssistantRuntimeRequest {
  return {
    requestId: 'request-ctx',
    session: {
      sessionId: 'session-ctx',
      scope: 'notebook',
      origin: 'test',
    },
    caller: {
      callerId: 'app-chat',
      surface: 'app-chat',
      transport: 'in-app',
      language: 'en',
      capabilities: {
        streaming: false,
        toolStatus: true,
        multimodalInput: false,
      },
    },
    modelConfig: baseModelConfig,
    input: {
      prompt: 'Summarize the current notebook.',
      instructions: ['Answer with notebook-aware context.'],
    },
    notebook: {
      notebookId: 'notebook-1',
      workspaceId: 'workspace-7',
      activeFileId: 'daily-note.md',
      selectedFileIds: ['daily-note.md', 'ideas.md'],
      selectedText: 'Focus on the architecture changes.',
      knowledgeQuery: 'assistant runtime architecture',
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

describe('assistant runtime context assembly', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('assembles notes, knowledge, and workspace context through adapter inputs', async () => {
    const assembler = createContextAssembler({
      adapters: [notebookAdapter, workspaceAdapter, knowledgeAdapter],
    });

    const assembled = await assembler.assemble(createRequest());

    expect(assembled.prompt).toContain('Active file: daily-note.md');
    expect(assembled.prompt).toContain('Workspace workspace-7 with 2 selected files');
    expect(assembled.prompt).toContain('Knowledge query: assistant runtime architecture');
    expect(assembled.payloads.map(payload => payload.source)).toEqual([
      'notebook',
      'workspace',
      'knowledge',
    ]);
    expect(assembled.metadata.budgetRatios).toEqual(DEFAULT_CONTEXT_BUDGET_RATIOS);
  });

  it('assembles context without touching browser localStorage or hook-owned state', async () => {
    const getItem = vi.fn(() => {
      throw new Error('localStorage should not be read');
    });
    vi.stubGlobal('window', {
      localStorage: { getItem },
    });
    vi.stubGlobal('localStorage', {
      getItem,
    });

    const assembler = createContextAssembler({
      adapters: [notebookAdapter],
    });

    const assembled = await assembler.assemble(createRequest());

    expect(assembled.prompt).toContain('Focus on the architecture changes.');
    expect(getItem).not.toHaveBeenCalled();
  });

  it('lets more than one caller shape use the same runtime contract and context path', async () => {
    const prompts: string[] = [];
    const runtime = createAssistantRuntime({
      contextAssembler: createContextAssembler({
        adapters: [notebookAdapter, workspaceAdapter],
      }),
      providerExecution: vi.fn(async ({ prompt, request }) => {
        prompts.push(`${request.caller.surface}:${prompt}`);
        return {
          outputText: `completed for ${request.caller.callerId}`,
          streamed: false,
        };
      }),
    });

    const appEvents = await collectEvents(runtime, createRequest());
    const automationEvents = await collectEvents(
      runtime,
      createRequest({
        requestId: 'request-cli',
        session: {
          sessionId: 'session-cli',
          scope: 'automation',
          origin: 'test',
        },
        caller: {
          callerId: 'headless-script',
          surface: 'automation',
          transport: 'cli',
          language: 'en',
          capabilities: {
            streaming: false,
            toolStatus: true,
            multimodalInput: false,
          },
        },
      }),
    );

    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain('Active file: daily-note.md');
    expect(prompts[1]).toContain('Workspace workspace-7 with 2 selected files');
    expect(appEvents.at(-2)).toMatchObject({
      type: 'result',
      result: {
        status: 'success',
      },
    });
    expect(automationEvents.at(-2)).toMatchObject({
      type: 'result',
      result: {
        status: 'success',
      },
    });
  });
});
