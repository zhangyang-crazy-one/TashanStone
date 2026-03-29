import { Type } from '@google/genai';
import type { FunctionDeclaration } from '@google/genai';

import { createToolAnalyzer } from '../toolSelector';
import type { IMCPClient } from './mcpClients';

export type OpenAIToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

export type AnthropicToolDefinition = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

type ToolJsonSchemaType = 'string' | 'number' | 'boolean' | 'object' | 'array';

interface AssistantToolParameterSchema {
  type: ToolJsonSchemaType;
  description?: string;
}

interface AssistantBuiltInToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, AssistantToolParameterSchema>;
    required?: string[];
  };
}

const toGeminiType = (type: ToolJsonSchemaType): Type => {
  switch (type) {
    case 'number':
      return Type.NUMBER;
    case 'boolean':
      return Type.BOOLEAN;
    case 'array':
      return Type.ARRAY;
    case 'object':
      return Type.OBJECT;
    case 'string':
    default:
      return Type.STRING;
  }
};

const toGeminiFunctionDeclaration = (
  definition: AssistantBuiltInToolDefinition,
): FunctionDeclaration => ({
  name: definition.name,
  description: definition.description,
  parameters: {
    type: Type.OBJECT,
    properties: Object.fromEntries(
      Object.entries(definition.parameters.properties).map(([name, property]) => [
        name,
        {
          type: toGeminiType(property.type),
          description: property.description,
        },
      ]),
    ),
    required: definition.parameters.required,
  },
});

const toOpenAIToolDefinition = (
  definition: AssistantBuiltInToolDefinition,
): OpenAIToolDefinition => ({
  type: 'function',
  function: {
    name: definition.name,
    description: definition.description,
    parameters: {
      type: definition.parameters.type,
      properties: definition.parameters.properties,
      required: definition.parameters.required,
    },
  },
});

const toAnthropicToolDefinition = (
  definition: AssistantBuiltInToolDefinition,
): AnthropicToolDefinition => ({
  name: definition.name,
  description: definition.description,
  input_schema: {
    type: definition.parameters.type,
    properties: definition.parameters.properties,
    required: definition.parameters.required ?? [],
  },
});

export const ASSISTANT_BUILT_IN_TOOLS: AssistantBuiltInToolDefinition[] = [
  {
    name: 'create_file',
    description: 'Create a new file with the given name and content. Use this to create documents.',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: "Name of the file (e.g. 'notes.md')" },
        content: { type: 'string', description: 'Markdown content of the file' },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'update_file',
    description: 'Update an existing file. Replaces content or appends based on logic.',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Name of the file to update' },
        content: { type: 'string', description: 'New content to append or replace' },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file by name.',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Name of the file to delete' },
      },
      required: ['filename'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the content of a specific file. Optionally specify line range to read.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File name or path to read' },
        startLine: { type: 'number', description: 'Optional: Start line number (1-indexed)' },
        endLine: { type: 'number', description: 'Optional: End line number (1-indexed)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for a keyword across all files. Returns matching lines with line numbers.',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Keyword to search for in file contents' },
        filePattern: { type: 'string', description: "Optional: File name pattern to filter (e.g., 'todo', '.md')" },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'search_knowledge_base',
    description: "Search the user's indexed notes and documents. Use this when the user asks about their notes, references specific documents, or needs information from their knowledge base.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        maxResults: { type: 'number', description: 'Maximum results (default: 10)' },
      },
      required: ['query'],
    },
  },
];

export const ASSISTANT_BUILT_IN_TOOL_NAMES = ASSISTANT_BUILT_IN_TOOLS.map(tool => tool.name);

const baseFileToolDefinitions = ASSISTANT_BUILT_IN_TOOLS.filter(
  tool => tool.name !== 'search_knowledge_base',
);
const knowledgeBaseToolDefinition = ASSISTANT_BUILT_IN_TOOLS.find(
  tool => tool.name === 'search_knowledge_base',
);

if (!knowledgeBaseToolDefinition) {
  throw new Error('search_knowledge_base tool definition is required');
}

export const GEMINI_FILE_TOOLS: FunctionDeclaration[] = baseFileToolDefinitions.map(
  toGeminiFunctionDeclaration,
);

export const OPENAI_TOOLS: OpenAIToolDefinition[] = baseFileToolDefinitions.map(
  toOpenAIToolDefinition,
);

export const SEARCH_KNOWLEDGE_BASE_TOOL: OpenAIToolDefinition = toOpenAIToolDefinition(
  knowledgeBaseToolDefinition,
);

export const GEMINI_SEARCH_KB_TOOL: FunctionDeclaration = toGeminiFunctionDeclaration(
  knowledgeBaseToolDefinition,
);

export const buildOpenAIToolsForPrompt = (
  prompt: string,
  mcpClient?: IMCPClient,
): OpenAIToolDefinition[] => {
  const allTools = mcpClient ? mcpClient.getTools() : [];
  const toolAnalyzer = createToolAnalyzer();
  const analysisResult = toolAnalyzer.analyze(allTools, prompt || '');
  const dynamicTools = toolAnalyzer.selectByIntent(allTools, analysisResult.intent);
  const mappedDynamic = dynamicTools.map<OpenAIToolDefinition>(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: (tool.parameters || {}) as Record<string, unknown>,
    },
  }));
  return [...OPENAI_TOOLS, SEARCH_KNOWLEDGE_BASE_TOOL, ...mappedDynamic];
};

export const buildAnthropicToolsForPrompt = (
  prompt: string,
  mcpClient?: IMCPClient,
): AnthropicToolDefinition[] => {
  const allTools = mcpClient ? mcpClient.getTools() : [];
  const toolAnalyzer = createToolAnalyzer();
  const analysisResult = toolAnalyzer.analyze(allTools, prompt || '');
  const dynamicTools = toolAnalyzer.selectByIntent(allTools, analysisResult.intent);
  const mappedDynamic = dynamicTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: (tool.parameters || { type: 'object', properties: {} }) as Record<string, unknown>,
  }));

  const baseToolsAnthropic: AnthropicToolDefinition[] = ASSISTANT_BUILT_IN_TOOLS.map(
    toAnthropicToolDefinition,
  );

  return [...baseToolsAnthropic, ...mappedDynamic];
};
