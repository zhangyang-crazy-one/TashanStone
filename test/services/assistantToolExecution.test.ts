import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIConfig, JsonValue, MarkdownFile } from '../../types';
import {
  ASSISTANT_BUILT_IN_TOOL_NAMES,
  GEMINI_FILE_TOOLS,
  GEMINI_SEARCH_KB_TOOL,
  OPENAI_TOOLS,
  SEARCH_KNOWLEDGE_BASE_TOOL,
} from '../../services/ai/toolDefinitions';
import {
  createNotebookToolExecutor,
  type NotebookToolSearchResult,
} from '../../src/services/assistant-runtime/toolExecutor';

const baseConfig: AIConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.3,
  language: 'en',
  enableStreaming: true,
};

describe('assistant tool executor', () => {
  let files: MarkdownFile[];

  beforeEach(() => {
    files = [
      {
        id: 'file-1',
        name: 'Daily Note',
        content: 'Architecture notes',
        lastModified: 10,
        path: 'Daily Note.md',
      },
    ];
  });

  it('runs built-in notebook tools and MCP tools through one executor surface', async () => {
    const setFiles = vi.fn((updater: MarkdownFile[] | ((current: MarkdownFile[]) => MarkdownFile[])) => {
      files = typeof updater === 'function' ? updater(files) : updater;
    });
    const searchKnowledgeBase = vi.fn(async (): Promise<NotebookToolSearchResult> => ({
      context: 'Runtime bridge context',
      results: [
        {
          score: 0.91,
          chunk: {
            metadata: { fileName: 'Daily Note.md' },
            text: 'Runtime bridge context',
          },
        },
      ],
    }));
    const callMcpTool = vi.fn(async (toolName: string, args: Record<string, JsonValue>) => ({
      success: true,
      result: {
        toolName,
        echoed: args,
      },
    }));

    const executor = createNotebookToolExecutor({
      aiConfig: baseConfig,
      files: {
        getFiles: () => files,
        setFiles,
        createId: () => 'generated-file-id',
      },
      knowledge: {
        search: searchKnowledgeBase,
      },
      mcp: {
        callTool: callMcpTool,
      },
    });

    const createResult = await executor.execute({
      executionId: 'exec-create',
      toolCallId: 'tool-create',
      toolName: 'create_file',
      sessionId: 'session-1',
      callerId: 'caller-1',
      transport: 'internal',
      arguments: {
        filename: 'runtime-note.md',
        content: 'Created from runtime',
      },
      media: [],
    });

    const knowledgeResult = await executor.execute({
      executionId: 'exec-kb',
      toolCallId: 'tool-kb',
      toolName: 'search_knowledge_base',
      sessionId: 'session-1',
      callerId: 'caller-1',
      transport: 'internal',
      arguments: {
        query: 'runtime bridge',
        maxResults: 5,
      },
      media: [],
    });

    const mcpResult = await executor.execute({
      executionId: 'exec-mcp',
      toolCallId: 'tool-mcp',
      toolName: 'web_search',
      sessionId: 'session-1',
      callerId: 'caller-1',
      transport: 'internal',
      arguments: {
        query: 'OpenClaw',
      },
      media: [],
    });

    expect(createResult).toMatchObject({
      status: 'success',
      toolName: 'create_file',
      result: expect.objectContaining({
        success: true,
      }),
    });
    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'generated-file-id',
          path: 'runtime-note.md',
          content: 'Created from runtime',
        }),
      ]),
    );

    expect(knowledgeResult).toMatchObject({
      status: 'success',
      toolName: 'search_knowledge_base',
      result: expect.objectContaining({
        success: true,
        query: 'runtime bridge',
      }),
    });
    expect(searchKnowledgeBase).toHaveBeenCalledWith('runtime bridge', 5, baseConfig);

    expect(mcpResult).toMatchObject({
      status: 'success',
      toolName: 'web_search',
      result: {
        toolName: 'web_search',
        echoed: {
          query: 'OpenClaw',
        },
      },
    });
    expect(callMcpTool).toHaveBeenCalledWith('web_search', { query: 'OpenClaw' });
  });

  it('keeps provider-facing tool definitions aligned with the unified built-in registry', () => {
    expect(ASSISTANT_BUILT_IN_TOOL_NAMES).toEqual([
      'create_file',
      'update_file',
      'delete_file',
      'read_file',
      'search_files',
      'search_knowledge_base',
    ]);

    const geminiNames = [...GEMINI_FILE_TOOLS.map(tool => tool.name), GEMINI_SEARCH_KB_TOOL.name];
    const openAiNames = [...OPENAI_TOOLS.map(tool => tool.function.name), SEARCH_KNOWLEDGE_BASE_TOOL.function.name];

    expect(geminiNames).toEqual(ASSISTANT_BUILT_IN_TOOL_NAMES);
    expect(openAiNames).toEqual(ASSISTANT_BUILT_IN_TOOL_NAMES);
  });
});
