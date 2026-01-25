import { Type } from '@google/genai';
import type { FunctionDeclaration } from '@google/genai';
import type { IMCPClient } from './mcpClients';
import { createToolAnalyzer } from '../toolSelector';

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

const createFileParams: FunctionDeclaration = {
  name: 'create_file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: "Name of the file (e.g. 'notes.md')" },
      content: { type: Type.STRING, description: 'Markdown content of the file' }
    },
    required: ['filename', 'content']
  }
};

const updateFileParams: FunctionDeclaration = {
  name: 'update_file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: 'Name of the file to update' },
      content: { type: Type.STRING, description: 'New content to append or replace' }
    },
    required: ['filename', 'content']
  }
};

const deleteFileParams: FunctionDeclaration = {
  name: 'delete_file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: 'Name of the file to delete' }
    },
    required: ['filename']
  }
};

const readFileParams: FunctionDeclaration = {
  name: 'read_file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      path: { type: Type.STRING, description: 'File name or path to read' },
      startLine: { type: Type.NUMBER, description: 'Optional: Start line number (1-indexed)' },
      endLine: { type: Type.NUMBER, description: 'Optional: End line number (1-indexed)' }
    },
    required: ['path']
  }
};

const searchFilesParams: FunctionDeclaration = {
  name: 'search_files',
  parameters: {
    type: Type.OBJECT,
    properties: {
      keyword: { type: Type.STRING, description: 'Keyword to search for in file contents' },
      filePattern: { type: Type.STRING, description: "Optional: File name pattern to filter (e.g., 'todo', '.md')" }
    },
    required: ['keyword']
  }
};

export const GEMINI_FILE_TOOLS: FunctionDeclaration[] = [
  createFileParams,
  updateFileParams,
  deleteFileParams,
  readFileParams,
  searchFilesParams
];

export const OPENAI_TOOLS: OpenAIToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: 'Create a new file with the given name and content. Use this to create documents.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: "Name of the file (e.g. 'notes.md')" },
          content: { type: 'string', description: 'Markdown content of the file' }
        },
        required: ['filename', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_file',
      description: 'Update an existing file. Replaces content or appends based on logic.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Name of the file to update' },
          content: { type: 'string', description: 'New content' }
        },
        required: ['filename', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file by name.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Name of the file to delete' }
        },
        required: ['filename']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the content of a specific file. Optionally specify line range to read.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File name or path to read' },
          startLine: { type: 'number', description: 'Optional: Start line number (1-indexed)' },
          endLine: { type: 'number', description: 'Optional: End line number (1-indexed)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for a keyword across all files. Returns matching lines with line numbers.',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: 'Keyword to search for in file contents' },
          filePattern: { type: 'string', description: "Optional: File name pattern to filter (e.g., 'todo', '.md')" }
        },
        required: ['keyword']
      }
    }
  }
];

export const SEARCH_KNOWLEDGE_BASE_TOOL: OpenAIToolDefinition = {
  type: 'function',
  function: {
    name: 'search_knowledge_base',
    description: "Search the user's indexed notes and documents. Use this when the user asks about their notes, references specific documents, or needs information from their knowledge base.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        maxResults: { type: 'number', description: 'Maximum results (default: 10)' }
      },
      required: ['query']
    }
  }
};

export const GEMINI_SEARCH_KB_TOOL: FunctionDeclaration = {
  name: 'search_knowledge_base',
  description: "Search the user's indexed notes and documents. Use this when the user asks about their notes, references specific documents, or needs information from their knowledge base.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The search query' },
      maxResults: { type: Type.NUMBER, description: 'Maximum results (default: 10)' }
    },
    required: ['query']
  }
};

export const buildOpenAIToolsForPrompt = (
  prompt: string,
  mcpClient?: IMCPClient
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
      parameters: (tool.parameters || {}) as Record<string, unknown>
    }
  }));
  return [...OPENAI_TOOLS, SEARCH_KNOWLEDGE_BASE_TOOL, ...mappedDynamic];
};

export const buildAnthropicToolsForPrompt = (
  prompt: string,
  mcpClient?: IMCPClient
): AnthropicToolDefinition[] => {
  const allTools = mcpClient ? mcpClient.getTools() : [];
  const toolAnalyzer = createToolAnalyzer();
  const analysisResult = toolAnalyzer.analyze(allTools, prompt || '');
  const dynamicTools = toolAnalyzer.selectByIntent(allTools, analysisResult.intent);
  const mappedDynamic = dynamicTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: (tool.parameters || { type: 'object', properties: {} }) as Record<string, unknown>
  }));

  const baseToolsAnthropic: AnthropicToolDefinition[] = [
    {
      name: 'create_file',
      description: 'Create a new file with the given name and content.',
      input_schema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Name of the file' },
          content: { type: 'string', description: 'Content of the file' }
        },
        required: ['filename', 'content']
      }
    },
    {
      name: 'update_file',
      description: 'Update an existing file.',
      input_schema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Name of the file' },
          content: { type: 'string', description: 'New content' }
        },
        required: ['filename', 'content']
      }
    },
    {
      name: 'delete_file',
      description: 'Delete a file by name.',
      input_schema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Name of the file' }
        },
        required: ['filename']
      }
    },
    {
      name: 'read_file',
      description: 'Read the content of a specific file. Optionally specify line range.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File name or path' },
          startLine: { type: 'number', description: 'Optional: Start line (1-indexed)' },
          endLine: { type: 'number', description: 'Optional: End line (1-indexed)' }
        },
        required: ['path']
      }
    },
    {
      name: 'search_files',
      description: 'Search for a keyword across all files.',
      input_schema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: 'Keyword to search' },
          filePattern: { type: 'string', description: 'Optional: File name pattern' }
        },
        required: ['keyword']
      }
    },
    {
      name: 'search_knowledge_base',
      description: "Search the user's indexed notes and documents.",
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxResults: { type: 'number', description: 'Max results' }
        },
        required: ['query']
      }
    }
  ];

  return [...baseToolsAnthropic, ...mappedDynamic];
};
