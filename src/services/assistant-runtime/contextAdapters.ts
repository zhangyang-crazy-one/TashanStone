import type { AIConfig, JsonValue, MarkdownFile } from '@/types';

import {
  createContextAssembler,
  type AssistantRuntimeContextAssembler,
  type ContextAssemblerDependencies,
} from './contextAssembler';
import type {
  AssistantContextAdapter,
  AssistantContextPayload,
  AssistantContextSection,
  AssistantNotebookContextInput,
  AssistantRuntimeRequest,
} from './types';

type AdapterRequestContext = Pick<AssistantRuntimeRequest, 'session' | 'caller' | 'input'>;
type ValueOrProvider<T, Args extends unknown[]> = T | ((...args: Args) => T | Promise<T>);

interface KnowledgeSearchResult {
  score: number;
  chunk: {
    metadata: {
      fileName: string;
    };
    text: string;
  };
}

export interface NotebookNotesContextAdapterDependencies {
  getFiles: ValueOrProvider<MarkdownFile[], [AssistantNotebookContextInput, AdapterRequestContext | undefined]>;
  maxContentLength?: number;
}

export interface WorkspaceStateSnapshot {
  notebookId?: string;
  workspaceId?: string;
  activeFileId?: string;
  activeFileName?: string;
  selectedFileIds?: string[];
  selectedFileNames?: string[];
  selectedText?: string;
  summary?: string;
  metadata?: Record<string, JsonValue>;
}

export interface WorkspaceStateContextAdapterDependencies {
  getWorkspaceState?:
    | ValueOrProvider<WorkspaceStateSnapshot | undefined, [AssistantNotebookContextInput, AdapterRequestContext | undefined]>;
}

export interface KnowledgeContextSnapshot {
  context: string;
  results?: KnowledgeSearchResult[];
  metadata?: Record<string, JsonValue>;
}

export interface KnowledgeContextAdapterDependencies {
  getKnowledgeContext:
    | ValueOrProvider<KnowledgeContextSnapshot | undefined, [AssistantNotebookContextInput, AdapterRequestContext | undefined]>;
}

export interface NotebookContextAssemblerDependencies
  extends Pick<ContextAssemblerDependencies, 'contextInjector' | 'now'> {
  notebookNotes: NotebookNotesContextAdapterDependencies;
  workspaceState?: WorkspaceStateContextAdapterDependencies;
  knowledge?: KnowledgeContextAdapterDependencies;
}

function isFunctionProvider<T, Args extends unknown[]>(
  provider: ValueOrProvider<T, Args>,
): provider is (...args: Args) => T | Promise<T> {
  return typeof provider === 'function';
}

async function resolveProvider<T, Args extends unknown[]>(
  provider: ValueOrProvider<T, Args> | undefined,
  ...args: Args
): Promise<T | undefined> {
  if (provider === undefined) {
    return undefined;
  }

  if (isFunctionProvider(provider)) {
    return provider(...args);
  }

  return provider;
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }

  return `${content.slice(0, maxLength).trimEnd()}\n...(truncated)`;
}

function findFileByReference(files: MarkdownFile[], reference?: string): MarkdownFile | undefined {
  if (!reference) {
    return undefined;
  }

  return files.find(file =>
    file.id === reference ||
    file.path === reference ||
    file.name === reference ||
    file.name === reference.replace(/\.md$/i, '') ||
    file.path?.endsWith(reference),
  );
}

function getRequestedFiles(files: MarkdownFile[], input: AssistantNotebookContextInput): MarkdownFile[] {
  const requested = [
    input.activeFileId,
    ...(input.selectedFileIds ?? []),
    ...(input.noteIds ?? []),
  ];

  const resolved: MarkdownFile[] = [];
  const seen = new Set<string>();

  for (const reference of requested) {
    const file = findFileByReference(files, reference);
    if (!file || seen.has(file.id)) {
      continue;
    }

    seen.add(file.id);
    resolved.push(file);
  }

  return resolved;
}

function formatNoteSection(file: MarkdownFile, isActive: boolean, maxContentLength: number): AssistantContextSection {
  const labelPrefix = isActive ? 'Active Note' : 'Selected Note';
  const lines = [
    `File ID: ${file.id}`,
    `File Name: ${file.name}`,
  ];

  if (file.path) {
    lines.push(`File Path: ${file.path}`);
  }

  lines.push('', truncateContent(file.content, maxContentLength));

  return {
    id: `note-${file.id}`,
    label: `${labelPrefix}: ${file.name}`,
    content: lines.join('\n'),
    metadata: {
      fileId: file.id,
      filePath: file.path ?? '',
      lastModified: file.lastModified,
    },
  };
}

function formatWorkspaceSection(
  input: AssistantNotebookContextInput,
  snapshot?: WorkspaceStateSnapshot,
): AssistantContextSection {
  const notebookId = snapshot?.notebookId ?? input.notebookId;
  const workspaceId = snapshot?.workspaceId ?? input.workspaceId ?? 'unknown';
  const activeFileId = snapshot?.activeFileId ?? input.activeFileId ?? 'none';
  const selectedFileIds = snapshot?.selectedFileIds ?? input.selectedFileIds ?? [];
  const selectedFileNames = snapshot?.selectedFileNames ?? [];

  const lines = [
    `Notebook ID: ${notebookId}`,
    `Workspace ID: ${workspaceId}`,
    `Active File ID: ${activeFileId}`,
    `Selected File IDs: ${selectedFileIds.length > 0 ? selectedFileIds.join(', ') : 'none'}`,
  ];

  if (snapshot?.activeFileName) {
    lines.push(`Active File Name: ${snapshot.activeFileName}`);
  }

  if (selectedFileNames.length > 0) {
    lines.push(`Selected File Names: ${selectedFileNames.join(', ')}`);
  }

  const selectedText = snapshot?.selectedText ?? input.selectedText;
  if (selectedText) {
    lines.push('', `Selected Text:\n${selectedText}`);
  }

  if (snapshot?.summary) {
    lines.push('', snapshot.summary);
  }

  return {
    id: 'workspace-state',
    label: 'Workspace State',
    content: lines.join('\n'),
    metadata: snapshot?.metadata,
  };
}

function formatKnowledgeSections(snapshot: KnowledgeContextSnapshot): AssistantContextSection[] {
  const sections: AssistantContextSection[] = [
    {
      id: 'knowledge-context',
      label: 'Knowledge Context',
      content: snapshot.context,
      metadata: snapshot.metadata,
    },
  ];

  if (snapshot.results && snapshot.results.length > 0) {
    sections.push({
      id: 'knowledge-sources',
      label: 'Knowledge Sources',
      content: snapshot.results
        .map(result => {
          const relevance = `${Math.round(result.score * 100)}%`;
          return `${result.chunk.metadata.fileName} (${relevance})\n${result.chunk.text}`;
        })
        .join('\n\n'),
    });
  }

  return sections;
}

export function createNotebookNotesContextAdapter(
  dependencies: NotebookNotesContextAdapterDependencies,
): AssistantContextAdapter {
  const maxContentLength = dependencies.maxContentLength ?? 2000;

  return {
    adapterId: 'notebook-notes',
    kind: 'notebook',
    async assemble(input, request) {
      const files = (await resolveProvider(dependencies.getFiles, input, request)) ?? [];
      const requestedFiles = getRequestedFiles(files, input);

      return {
        source: 'notebook',
        sections: requestedFiles.map(file =>
          formatNoteSection(file, file.id === input.activeFileId, maxContentLength),
        ),
        metadata: {
          notebookId: input.notebookId,
          fileCount: requestedFiles.length,
        },
      };
    },
  };
}

export function createWorkspaceStateContextAdapter(
  dependencies: WorkspaceStateContextAdapterDependencies = {},
): AssistantContextAdapter {
  return {
    adapterId: 'workspace-state',
    kind: 'workspace',
    async assemble(input, request) {
      const snapshot = await resolveProvider(dependencies.getWorkspaceState, input, request);

      return {
        source: 'workspace',
        sections: [formatWorkspaceSection(input, snapshot)],
        metadata: snapshot?.metadata,
      };
    },
  };
}

export function createKnowledgeContextAdapter(
  dependencies: KnowledgeContextAdapterDependencies,
): AssistantContextAdapter {
  return {
    adapterId: 'knowledge-context',
    kind: 'knowledge',
    async assemble(input, request) {
      const snapshot = await resolveProvider(dependencies.getKnowledgeContext, input, request);
      if (!snapshot?.context) {
        return {
          source: 'knowledge',
          sections: [],
        };
      }

      return {
        source: 'knowledge',
        sections: formatKnowledgeSections(snapshot),
        metadata: snapshot.metadata,
      };
    },
  };
}

export function createNotebookContextAssembler(
  dependencies: NotebookContextAssemblerDependencies,
): AssistantRuntimeContextAssembler {
  const adapters: AssistantContextAdapter[] = [
    createNotebookNotesContextAdapter(dependencies.notebookNotes),
  ];

  if (dependencies.workspaceState) {
    adapters.push(createWorkspaceStateContextAdapter(dependencies.workspaceState));
  }

  if (dependencies.knowledge) {
    adapters.push(createKnowledgeContextAdapter(dependencies.knowledge));
  }

  return createContextAssembler({
    adapters,
    contextInjector: dependencies.contextInjector,
    now: dependencies.now,
  });
}

export interface InAppKnowledgeContextDependencies {
  getModelConfig: () => AIConfig;
  ensureIndexed?: () => Promise<void> | void;
  searchKnowledge: (query: string, config: AIConfig, maxResults: number) => Promise<KnowledgeContextSnapshot>;
  maxResults?: number;
}

export function createInAppKnowledgeContextDependencies(
  dependencies: InAppKnowledgeContextDependencies,
): KnowledgeContextAdapterDependencies {
  return {
    getKnowledgeContext: async input => {
      const query = input.knowledgeQuery?.trim();
      if (!query) {
        return undefined;
      }

      await dependencies.ensureIndexed?.();

      return dependencies.searchKnowledge(
        query,
        dependencies.getModelConfig(),
        dependencies.maxResults ?? 5,
      );
    },
  };
}
