import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AIConfig,
  AssistantRuntimeEvent,
  AssistantRuntimeRequest,
  MarkdownFile,
} from '../../types';
import {
  createAssistantRuntime,
  createKnowledgeContextAdapter,
  createNotebookContextAssembler,
  createNotebookNotesContextAdapter,
  createWorkspaceStateContextAdapter,
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

const notebookFiles: MarkdownFile[] = [
  {
    id: 'daily-note.md',
    name: 'Daily Note',
    path: 'Daily Note.md',
    content: 'Architecture notes\nRuntime extraction details',
    lastModified: 10,
  },
  {
    id: 'ideas.md',
    name: 'Ideas',
    path: 'Ideas.md',
    content: 'Ideas about future channel adapters',
    lastModified: 11,
  },
];

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

  it('exposes production notebook, workspace, and knowledge adapter builders', async () => {
    const notebookAdapter = createNotebookNotesContextAdapter({
      getFiles: notebookFiles,
    });
    const workspaceAdapter = createWorkspaceStateContextAdapter({
      getWorkspaceState: input => ({
        workspaceId: input.workspaceId,
        activeFileId: input.activeFileId,
        selectedFileIds: input.selectedFileIds,
        selectedText: input.selectedText,
      }),
    });
    const knowledgeAdapter = createKnowledgeContextAdapter({
      getKnowledgeContext: async input => ({
        context: `Knowledge query: ${input.knowledgeQuery ?? 'none'}`,
        results: [
          {
            score: 0.92,
            chunk: {
              metadata: { fileName: 'Daily Note.md' },
              text: 'Runtime extraction details',
            },
          },
        ],
      }),
    });
    const assembler = createNotebookContextAssembler({
      notebookNotes: {
        getFiles: notebookFiles,
      },
      workspaceState: {
        getWorkspaceState: input => ({
          workspaceId: input.workspaceId,
          activeFileId: input.activeFileId,
          selectedFileIds: input.selectedFileIds,
          selectedText: input.selectedText,
        }),
      },
      knowledge: {
        getKnowledgeContext: async input => ({
          context: `Knowledge query: ${input.knowledgeQuery ?? 'none'}`,
          results: [
            {
              score: 0.92,
              chunk: {
                metadata: { fileName: 'Daily Note.md' },
                text: 'Runtime extraction details',
              },
            },
          ],
        }),
      },
    });

    const assembled = await assembler.assemble(createRequest());

    expect(notebookAdapter.kind).toBe('notebook');
    expect(workspaceAdapter.kind).toBe('workspace');
    expect(knowledgeAdapter.kind).toBe('knowledge');
    expect(assembled.prompt).toContain('Architecture notes');
    expect(assembled.prompt).toContain('Ideas about future channel adapters');
    expect(assembled.prompt).toContain('workspace-7');
    expect(assembled.prompt).toContain('daily-note.md');
    expect(assembled.prompt).toContain('Knowledge query: assistant runtime architecture');
    expect(assembled.prompt).toContain('Runtime extraction details');
    expect(assembled.payloads.map(payload => payload.source)).toEqual([
      'notebook',
      'workspace',
      'knowledge',
    ]);
    expect(assembled.metadata.adapterIds).toEqual([
      'notebook-notes',
      'workspace-state',
      'knowledge-context',
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

    const assembler = createNotebookContextAssembler({
      notebookNotes: {
        getFiles: () => notebookFiles,
      },
    });

    const assembled = await assembler.assemble(createRequest());

    expect(assembled.prompt).toContain('Focus on the architecture changes.');
    expect(assembled.prompt).toContain('Architecture notes');
    expect(getItem).not.toHaveBeenCalled();
  });

  it('accepts callback and plain-data providers so non-UI callers can reuse the same context path', async () => {
    const prompts: string[] = [];
    const runtime = createAssistantRuntime({
      contextAssembler: createNotebookContextAssembler({
        notebookNotes: {
          getFiles: notebookFiles,
        },
        workspaceState: {
          getWorkspaceState: {
            workspaceId: 'workspace-static',
            activeFileId: 'daily-note.md',
            selectedFileIds: ['daily-note.md'],
          },
        },
        knowledge: {
          getKnowledgeContext: {
            context: 'Precomputed knowledge context',
            results: [
              {
                score: 0.84,
                chunk: {
                  metadata: { fileName: 'Ideas.md' },
                  text: 'Ideas about future channel adapters',
                },
              },
            ],
          },
        },
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
    expect(prompts[0]).toContain('Architecture notes');
    expect(prompts[1]).toContain('Precomputed knowledge context');
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
