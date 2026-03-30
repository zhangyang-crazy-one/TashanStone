import type { AIConfig, JsonValue, MarkdownFile } from '@/types';

import type {
  AssistantToolExecutionRequest,
  AssistantToolExecutionResult,
  AssistantToolExecutionSource,
} from './toolMediaContracts';

const DEFAULT_ERROR_CODE = 'TOOL_EXECUTION_FAILED';

interface FileMutation {
  getFiles: () => MarkdownFile[];
  setFiles: (
    updater: MarkdownFile[] | ((current: MarkdownFile[]) => MarkdownFile[]),
  ) => void;
  createId?: () => string;
}

export interface NotebookToolSearchMatch {
  score: number;
  chunk: {
    metadata: {
      fileName: string;
    };
    text: string;
  };
}

export interface NotebookToolSearchResult {
  results: NotebookToolSearchMatch[];
  context: string;
}

interface KnowledgeToolDependencies {
  prepareSearch?: () => Promise<void>;
  search: (
    query: string,
    maxResults: number,
    config: AIConfig,
  ) => Promise<NotebookToolSearchResult>;
}

interface McpToolDependencies {
  callTool: (toolName: string, args: Record<string, JsonValue>) => Promise<unknown>;
}

interface NotebookToolExecutorDependencies {
  aiConfig: AIConfig;
  getAiConfig?: () => AIConfig;
  files: FileMutation;
  knowledge: KnowledgeToolDependencies;
  mcp?: McpToolDependencies;
  now?: () => number;
}

interface AssistantToolHandler {
  source: AssistantToolExecutionSource;
  execute: (
    args: Record<string, JsonValue>,
    request: AssistantToolExecutionRequest,
  ) => Promise<JsonValue>;
}

interface AssistantToolExecutorDependencies {
  handlers: Record<string, AssistantToolHandler>;
  fallback?: (
    request: AssistantToolExecutionRequest,
  ) => Promise<{ result: JsonValue; source: AssistantToolExecutionSource }>;
}

export interface AssistantToolExecutor {
  execute: (request: AssistantToolExecutionRequest) => Promise<AssistantToolExecutionResult>;
  supports: (toolName: string) => boolean;
}

const isJsonObject = (value: JsonValue): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toJsonValue = (value: unknown): JsonValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value as JsonValue;
  }

  if (Array.isArray(value)) {
    return value.map(item => toJsonValue(item));
  }

  if (typeof value === 'object' && value !== null) {
    const jsonObject: Record<string, JsonValue> = {};
    Object.entries(value).forEach(([key, entryValue]) => {
      jsonObject[key] = toJsonValue(entryValue);
    });
    return jsonObject;
  }

  return String(value);
};

const getString = (value: JsonValue | undefined): string =>
  typeof value === 'string' ? value : '';

const getNumber = (value: JsonValue | undefined): number | undefined =>
  typeof value === 'number' ? value : undefined;

const createErrorResult = (
  request: AssistantToolExecutionRequest,
  message: string,
  source: AssistantToolExecutionSource,
  code = DEFAULT_ERROR_CODE,
): AssistantToolExecutionResult => ({
  executionId: request.executionId,
  toolCallId: request.toolCallId,
  toolName: request.toolName,
  status: 'error',
  error: {
    code,
    message,
    retryable: false,
    details: {
      source,
    },
  },
  metadata: {
    source,
  },
});

const createSuccessResult = (
  request: AssistantToolExecutionRequest,
  result: JsonValue,
  source: AssistantToolExecutionSource,
): AssistantToolExecutionResult => ({
  executionId: request.executionId,
  toolCallId: request.toolCallId,
  toolName: request.toolName,
  status: 'success',
  result,
  metadata: {
    source,
  },
});

const matchesFileReference = (file: MarkdownFile, reference: string): boolean =>
  file.id === reference ||
  file.path === reference ||
  file.name === reference ||
  file.name === reference.replace(/\.md$/i, '') ||
  file.path?.endsWith(reference) === true;

const createGeneratedFileId = (): string =>
  `tool-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createCreateFileHandler = (
  files: FileMutation,
  now: () => number,
): AssistantToolHandler => ({
  source: 'builtin',
  async execute(args) {
    const filename = getString(args.filename).trim();
    const content = getString(args.content);

    if (!filename) {
      return {
        success: false,
        error: 'Missing filename',
      };
    }

    const nextFile: MarkdownFile = {
      id: files.createId?.() ?? createGeneratedFileId(),
      name: filename.replace(/\.md$/i, ''),
      content,
      lastModified: now(),
      path: filename,
    };

    files.setFiles(current => [...current, nextFile]);

    return {
      success: true,
      message: `Created file: ${filename}`,
      file: {
        id: nextFile.id,
        name: nextFile.name,
        path: nextFile.path ?? filename,
      },
    };
  },
});

const createUpdateFileHandler = (
  files: FileMutation,
  now: () => number,
): AssistantToolHandler => ({
  source: 'builtin',
  async execute(args) {
    const filename = getString(args.filename).trim();
    const content = getString(args.content);
    const targetFile = files.getFiles().find(file => matchesFileReference(file, filename));

    if (!targetFile) {
      return {
        success: false,
        error: 'File not found',
      };
    }

    files.setFiles(current =>
      current.map(file =>
        file.id === targetFile.id
          ? { ...file, content, lastModified: now() }
          : file,
      ),
    );

    return {
      success: true,
      message: `Updated file: ${filename}`,
      fileId: targetFile.id,
    };
  },
});

const createDeleteFileHandler = (files: FileMutation): AssistantToolHandler => ({
  source: 'builtin',
  async execute(args) {
    const filename = getString(args.filename).trim();
    const targetFile = files.getFiles().find(file => matchesFileReference(file, filename));

    if (!targetFile) {
      return {
        success: false,
        error: 'File not found',
      };
    }

    files.setFiles(current => current.filter(file => file.id !== targetFile.id));

    return {
      success: true,
      message: `Deleted file: ${filename}`,
      fileId: targetFile.id,
    };
  },
});

const createReadFileHandler = (files: FileMutation): AssistantToolHandler => ({
  source: 'builtin',
  async execute(args) {
    const path = getString(args.path).trim();
    const targetFile = files.getFiles().find(file => matchesFileReference(file, path));

    if (!targetFile) {
      return {
        success: false,
        error: 'File not found',
        availableFiles: files.getFiles()
          .map(file => file.path ?? file.name)
          .filter((value): value is string => Boolean(value)),
      };
    }

    const lines = targetFile.content.split('\n');
    const startLineValue = getNumber(args.startLine) ?? 1;
    const endLineValue = getNumber(args.endLine) ?? lines.length;
    const startLine = Math.max(0, startLineValue - 1);
    const endLine = Math.min(lines.length, endLineValue);

    return {
      success: true,
      fileName: targetFile.path ?? targetFile.name,
      content: lines.slice(startLine, endLine).join('\n'),
      lineRange: {
        start: startLine + 1,
        end: endLine,
      },
      totalLines: lines.length,
    };
  },
});

const createSearchFilesHandler = (files: FileMutation): AssistantToolHandler => ({
  source: 'builtin',
  async execute(args) {
    const keyword = getString(args.keyword).trim();
    const filePattern = getString(args.filePattern).trim();

    if (!keyword) {
      return {
        success: false,
        error: 'Missing keyword parameter',
      };
    }

    const results = files.getFiles().flatMap(file => {
      const fileName = file.path ?? file.name;
      if (filePattern && !fileName.includes(filePattern)) {
        return [];
      }

      const matches = file.content
        .split('\n')
        .flatMap((line, index) => line.toLowerCase().includes(keyword.toLowerCase())
          ? [{
              line: index + 1,
              content: line.trim(),
            }]
          : [],
        );

      if (matches.length === 0) {
        return [];
      }

      return [{
        fileName,
        matches: matches.slice(0, 10),
      }];
    });

    return {
      success: true,
      keyword,
      filePattern: filePattern || null,
      totalFiles: results.length,
      totalMatches: results.reduce((sum, entry) => sum + entry.matches.length, 0),
      results: results.slice(0, 20),
    };
  },
});

const createKnowledgeBaseHandler = (
  knowledge: KnowledgeToolDependencies,
  getAiConfig: () => AIConfig,
): AssistantToolHandler => ({
  source: 'knowledge',
  async execute(args) {
    const query = getString(args.query).trim();
    const maxResultsValue = getNumber(args.maxResults) ?? 5;
    const maxResults = Math.min(maxResultsValue, 8);

    if (!query) {
      return {
        success: false,
        error: 'Missing query parameter',
      };
    }

    await knowledge.prepareSearch?.();
    const ragResponse = await knowledge.search(query, maxResults, getAiConfig());

    return {
      success: true,
      query,
      matchCount: ragResponse.results.length,
      sources: ragResponse.results.map(result => ({
        file: result.chunk.metadata.fileName,
        relevance: `${Math.round(result.score * 100)}%`,
        excerpt: `${result.chunk.text.substring(0, 100).replace(/\n/g, ' ').trim()}...`,
      })),
      summary: ragResponse.context.length > 500
        ? `${ragResponse.context.substring(0, 500)}...(truncated)`
        : ragResponse.context,
    };
  },
});

const normalizeMcpResult = (
  toolName: string,
  value: unknown,
): { success: boolean; result: JsonValue; error?: string } => {
  const normalized = toJsonValue(value);

  if (!isJsonObject(normalized)) {
    return {
      success: true,
      result: normalized,
    };
  }

  const success = normalized.success;
  if (typeof success === 'boolean') {
    if (success) {
      return {
        success: true,
        result: 'result' in normalized ? normalized.result ?? normalized : normalized,
      };
    }

    return {
      success: false,
      result: normalized,
      error: typeof normalized.error === 'string' ? normalized.error : `Tool ${toolName} failed`,
    };
  }

  return {
    success: true,
    result: normalized,
  };
};

export function createToolExecutor(
  dependencies: AssistantToolExecutorDependencies,
): AssistantToolExecutor {
  return {
    supports(toolName) {
      return toolName in dependencies.handlers || Boolean(dependencies.fallback);
    },
    async execute(request) {
      const handler = dependencies.handlers[request.toolName];

      try {
        if (handler) {
          const result = await handler.execute(request.arguments, request);
          return createSuccessResult(request, result, handler.source);
        }

        if (!dependencies.fallback) {
          return createErrorResult(
            request,
            `Tool ${request.toolName} is not registered`,
            'automation',
            'TOOL_NOT_REGISTERED',
          );
        }

        const fallbackResult = await dependencies.fallback(request);
        return createSuccessResult(request, fallbackResult.result, fallbackResult.source);
      } catch (error) {
        const source = handler?.source ?? 'mcp';
        const message = error instanceof Error ? error.message : String(error);
        return createErrorResult(request, message, source);
      }
    },
  };
}

export function createNotebookToolExecutor(
  dependencies: NotebookToolExecutorDependencies,
): AssistantToolExecutor {
  const now = dependencies.now ?? (() => Date.now());
  const getAiConfig = dependencies.getAiConfig ?? (() => dependencies.aiConfig);
  const handlers: Record<string, AssistantToolHandler> = {
    create_file: createCreateFileHandler(dependencies.files, now),
    update_file: createUpdateFileHandler(dependencies.files, now),
    delete_file: createDeleteFileHandler(dependencies.files),
    read_file: createReadFileHandler(dependencies.files),
    search_files: createSearchFilesHandler(dependencies.files),
    search_knowledge_base: createKnowledgeBaseHandler(
      dependencies.knowledge,
      getAiConfig,
    ),
  };

  return createToolExecutor({
    handlers,
    fallback: async request => {
      if (!dependencies.mcp?.callTool) {
        throw new Error(`Tool ${request.toolName} is not registered`);
      }

      const fallbackResult = await dependencies.mcp.callTool(
        request.toolName,
        request.arguments,
      );
      const normalized = normalizeMcpResult(request.toolName, fallbackResult);
      if (!normalized.success) {
        throw new Error(normalized.error ?? `Tool ${request.toolName} failed`);
      }

      return {
        result: normalized.result,
        source: 'mcp',
      };
    },
  });
}
