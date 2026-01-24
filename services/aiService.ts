

import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { AIConfig, MarkdownFile, GraphData, Quiz, QuizQuestion, ChatMessage, JsonValue, ToolCall, ToolEventCallback } from "../types";
import { mcpService } from "../src/services/mcpService";
import { platformFetch, platformStreamFetch } from "../src/services/ai/platformFetch";
import { ToolAnalyzer, createToolAnalyzer } from "./toolSelector";
import {
  createStreamingAdapterState,
  getStreamingToolCallAdapter,
  getToolCallAdapter,
  StreamingAdapterState,
  StreamingToolCallAdapter
} from "./toolCallAdapters";
import {
  ContextManager,
  createContextManager,
  TokenUsage,
  TokenBudget,
  ContextConfig,
  ApiMessage,
  Checkpoint,
  CompactedSession,
  IndexedConversation,
  DEFAULT_CONTEXT_CONFIG,
  ContextMemoryService,
  InMemoryStorage,
  MessageRole,
  PersistentMemoryService,
  createPersistentMemoryService,
  MemoryDocument,
  toolDistinctionGuide,
} from "../src/services/context";

// --- Types for MCP ---
interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  parameters?: any; // For MCP tools, the parameters structure
}

type ToolCallback = (toolName: string, args: Record<string, JsonValue>) => Promise<JsonValue>;

// --- Dynamic MCP Tool Guide Generator ---
/**
 * 根据工具名称智能识别工具类型
 */
const categorizeMCPTool = (toolName: string): string => {
  const name = toolName.toLowerCase();

  // 浏览器/网页工具
  if (name.includes('navigate') || name.includes('page') || name.includes('click') ||
      name.includes('snapshot') || name.includes('fill') || name.includes('screenshot') ||
      name.includes('browser') || name.includes('scroll') || name.includes('hover') ||
      name.includes('devtools') || name.includes('chrome')) {
    return 'browser';
  }

  // 搜索工具
  if (name.includes('search') || name.includes('query') || name.includes('find')) {
    return 'search';
  }

  // 文件操作工具
  if (name.includes('file') || name.includes('read') || name.includes('write') ||
      name.includes('create') || name.includes('delete') || name.includes('directory')) {
    return 'file';
  }

  // 数据库工具
  if (name.includes('database') || name.includes('sql') || name.includes('db') ||
      name.includes('table') || name.includes('record')) {
    return 'database';
  }

  // API/网络工具
  if (name.includes('fetch') || name.includes('request') || name.includes('api') ||
      name.includes('http') || name.includes('get') || name.includes('post')) {
    return 'network';
  }

  return 'general';
};

/**
 * 动态生成 MCP 工具使用指南
 * 根据可用工具类型生成简洁的使用提示
 */
const generateMCPToolGuide = (tools: MCPTool[], lang: 'en' | 'zh' = 'en'): string => {
  if (tools.length === 0) return '';

  // 按类型分组工具
  const categories: Record<string, string[]> = {};
  tools.forEach(t => {
    const cat = categorizeMCPTool(t.name);
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(t.name);
  });

  const guides: string[] = [];

  // 重要提示：区分内置工具和 MCP 工具
  guides.push(lang === 'zh'
    ? '⚠️ 重要: 创建/修改应用内文件请用 create_file/update_file，MCP工具仅用于外部操作'
    : '⚠️ Important: Use create_file/update_file for app files. MCP tools are for external operations only');

  // 浏览器工具指南
  if (categories['browser']) {
    const hasNavigate = categories['browser'].some(n => n.includes('navigate'));
    const hasSnapshot = categories['browser'].some(n => n.includes('snapshot'));

    if (hasNavigate && hasSnapshot) {
      guides.push(lang === 'zh'
        ? '🌐 浏览器: 先 navigate_page 打开网址，再 take_snapshot 获取内容'
        : '🌐 Browser: navigate_page first, then take_snapshot');
    }
  }

  // 搜索工具指南
  if (categories['search']) {
    guides.push(lang === 'zh'
      ? '🔍 搜索: 可直接搜索，无需先打开网页'
      : '🔍 Search: Query directly without opening pages');
  }

  return '\n\n**' + (lang === 'zh' ? '工具使用提示' : 'Usage Tips') + ':**\n' + guides.join('\n');
};

// Base interface for MCP clients (both Virtual and Real)
interface IMCPClient {
  connect(): Promise<void>;
  getTools(): FunctionDeclaration[];
  executeTool(name: string, args: any): Promise<any>;
}

// Default configuration
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

// Initialize Gemini Client
const getClient = (apiKey?: string) => new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY });

// --- Virtual MCP Client (Browser Implementation) ---
/**
 * A Virtual Client that mimics the architecture requested:
 * 1. Loads Config
 * 2. "Launches" Servers (Virtual Modules)
 * 3. Discovers Tools
 */
export class VirtualMCPClient {
  private config: MCPConfig | null = null;
  private activeServers: Map<string, { status: 'running' | 'stopped', tools: MCPTool[] }> = new Map();

  constructor(configStr: string) {
    try {
      // Robust Parsing: Handle both raw array (old) and mcpServers object (new)
      const parsed = JSON.parse(configStr || '{}');
      if (parsed.mcpServers) {
        this.config = parsed as MCPConfig;
      } else if (Array.isArray(parsed)) {
        // Legacy: Array of tools treated as a default "custom" server
        this.config = {
          mcpServers: {
            "custom-tools": { command: "internal", args: [], env: {} }
          }
        };
        // Store raw tools temporarily to inject later
        this.activeServers.set("custom-tools", { status: 'running', tools: parsed });
      }
    } catch (e) {
      console.warn("MCP Config Parse Error", e);
    }
  }

  async connect() {
    if (!this.config) return;

    const entries = Object.entries(this.config.mcpServers);
    const results = await Promise.all(entries.map(async ([name, srv]) => {
      return this.launchVirtualServer(name, srv);
    }));
  }

  private async launchVirtualServer(name: string, config: MCPServerConfig) {
    // Simulate Async Startup
    await new Promise(r => setTimeout(r, 500)); 

    let tools: MCPTool[] = [];

    // --- Virtual Server Registry ---
    // Since we are in a browser, we map "commands" to internal capability modules
    
    // 1. Chrome DevTools (Requested by user)
    if (name.includes('chrome') || config.args.some(a => a.includes('chrome-devtools'))) {
       tools = [
         {
           name: "console_log",
           description: "Log a message to the browser console for debugging.",
           inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] }
         },
         {
           name: "get_page_info",
           description: "Get current page title and dimensions.",
           inputSchema: { type: "object", properties: {}, required: [] }
         }
       ];
    }
    // 2. Filesystem (Internal Simulation)
    else if (name.includes('filesystem') || config.command === 'fs') {
       tools = [
         {
           name: "list_files",
           description: "List all files in the current virtual workspace.",
           inputSchema: { type: "object", properties: { path: { type: "string" } } }
         },
         {
           name: "read_file",
           description: "Read file content.",
           inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
         }
       ];
    }
    // 3. Fallback: If it was legacy array format, tools are already set in constructor
    else if (this.activeServers.has(name)) {
       return true;
    }
    
    this.activeServers.set(name, { status: 'running', tools });
    return true;
  }

  getTools(): FunctionDeclaration[] {
    const allTools: FunctionDeclaration[] = [];
    
    this.activeServers.forEach((server) => {
        if (server.status === 'running') {
            server.tools.forEach(t => {
                // Map to Gemini Format
                allTools.push({
                    name: t.name,
                    description: t.description,
                    parameters: t.inputSchema || (t as any).parameters // Handle legacy format
                });
            });
        }
    });

    return allTools;
  }

  async executeTool(name: string, args: any): Promise<any> {
    // Virtual Implementation of specific known tools
    if (name === 'console_log') {
        console.log(`%c[AI Tool Log]`, "color: #06b6d4; font-weight:bold;", args.message);
        return { success: true, output: "Logged to console" };
    }
    if (name === 'get_page_info') {
        return { 
            title: document.title, 
            width: window.innerWidth, 
            height: window.innerHeight,
            url: window.location.href
        };
    }
    
    return { success: true, message: "Tool executed (Simulation)" };
  }
}

// --- Real MCP Client (Electron Implementation) ---
/**
 * 真正的 MCP 客户端 - 使用 Electron 主进程的 MCP 功能
 * 通过 IPC 与主进程的 MCPManager 通信
 */
export class RealMCPClient {
  private isAvailable: boolean = false;
  private tools: MCPTool[] = [];
  private maxRetries = 8; // 增加重试次数，npx 首次运行可能需要较长时间
  private baseDelayMs = 1000; // 基础延迟 1 秒
  private static toolsCache: MCPTool[] | null = null; // 工具缓存，避免重复发现
  private static lastDiscoveryTime: number = 0;
  private static discoveryInProgress: boolean = false;

  constructor(configStr: string) {
    this.isAvailable = mcpService.isAvailable();
    if (this.isAvailable) {
      console.log('[RealMCP] Using Electron MCP client');
      // 如果有缓存的工具，直接使用
      if (RealMCPClient.toolsCache && RealMCPClient.toolsCache.length > 0) {
        this.tools = RealMCPClient.toolsCache;
        console.log(`[RealMCP] Using cached tools: ${this.tools.length} tools available`);
      }
    } else {
      console.warn('[RealMCP] Not available, falling back to VirtualMCPClient');
    }
  }

  async connect() {
    if (!this.isAvailable) {
      console.warn('[RealMCP] Cannot connect: not in Electron environment');
      return;
    }

    // 如果有最近发现的缓存工具（5分钟内），直接使用
    const cacheAge = Date.now() - RealMCPClient.lastDiscoveryTime;
    if (RealMCPClient.toolsCache && RealMCPClient.toolsCache.length > 0 && cacheAge < 300000) {
      this.tools = RealMCPClient.toolsCache;
      console.log(`[RealMCP] Using cached tools (${Math.round(cacheAge / 1000)}s old): ${this.tools.length} tools`);
      return;
    }

    // 避免并发发现
    if (RealMCPClient.discoveryInProgress) {
      console.log('[RealMCP] Tool discovery already in progress, waiting...');
      // 等待最多 30 秒
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!RealMCPClient.discoveryInProgress && RealMCPClient.toolsCache) {
          this.tools = RealMCPClient.toolsCache;
          return;
        }
      }
    }

    RealMCPClient.discoveryInProgress = true;

    // 使用指数退避重试机制
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // 指数退避: 1s, 2s, 4s, 8s, 8s, 8s, 8s, 8s (最大 8 秒)
        const delay = Math.min(this.baseDelayMs * Math.pow(2, attempt - 1), 8000);

        console.log(`[RealMCP] Attempting to connect (attempt ${attempt}/${this.maxRetries}, next delay: ${delay}ms)`);

        // 获取工具列表
        this.tools = await mcpService.getTools();

        if (this.tools.length > 0) {
          console.log(`[RealMCP] ✓ Connected successfully, discovered ${this.tools.length} MCP tools:`,
            this.tools.map(t => t.name).join(', ')
          );
          // 更新缓存
          RealMCPClient.toolsCache = this.tools;
          RealMCPClient.lastDiscoveryTime = Date.now();
          RealMCPClient.discoveryInProgress = false;
          return;
        } else {
          console.warn(`[RealMCP] Connection attempt ${attempt}: No MCP tools available yet (npx may still be downloading)`);

          if (attempt < this.maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      } catch (error) {
        console.error(`[RealMCP] Connection attempt ${attempt} failed:`, error);

        if (attempt < this.maxRetries) {
          const delay = Math.min(this.baseDelayMs * Math.pow(2, attempt - 1), 8000);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          this.isAvailable = false;
          RealMCPClient.discoveryInProgress = false;
          throw error;
        }
      }
    }

    RealMCPClient.discoveryInProgress = false;

    // 如果所有重试都失败，但不阻塞 - 后台继续尝试
    if (this.tools.length === 0) {
      console.warn('[RealMCP] ⚠ Failed to discover MCP tools after all retries. Will use internal tools only.');
      console.log('[RealMCP] Starting background tool discovery...');
      this.startBackgroundDiscovery();
      // 不设置 isAvailable = false，允许后续调用时再次尝试
    }
  }

  getTools(): FunctionDeclaration[] {
    if (!this.isAvailable) {
      return [];
    }

    // 将 MCP 工具格式转换为 Gemini 格式
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }));
  }

  async executeTool(name: string, args: any): Promise<any> {
    if (!this.isAvailable) {
      throw new Error('MCP not available');
    }

    console.log(`[RealMCP] Executing ${name}`, args);

    try {
      const result = await mcpService.callTool(name, args);

      if (!result.success) {
        console.error(`[RealMCP] Tool execution failed:`, result.error);

        // 如果是工具未找到的错误，刷新工具列表并重试一次
        if (result.error && result.error.includes('not found')) {
          console.log('[RealMCP] Refreshing tool list and retrying...');
          this.tools = await mcpService.getTools();

          if (this.tools.some(t => t.name === name)) {
            // 工具现在可用了，重试
            const retryResult = await mcpService.callTool(name, args);
            if (!retryResult.success) {
              return {
                success: false,
                error: retryResult.error,
                output: `Error: ${retryResult.error}`
              };
            }
            return retryResult.result || { success: true, output: 'Tool executed successfully' };
          }
        }

        return {
          success: false,
          error: result.error,
          output: `Error: ${result.error}`
        };
      }

      return result.result || { success: true, output: 'Tool executed successfully' };
    } catch (error) {
      console.error(`[RealMCP] Tool execution error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 后台持续尝试发现工具
   * 当初始连接失败时启动，每 10 秒尝试一次
   */
  private startBackgroundDiscovery() {
    const backgroundInterval = setInterval(async () => {
      if (RealMCPClient.toolsCache && RealMCPClient.toolsCache.length > 0) {
        // 已经发现工具，停止后台发现
        clearInterval(backgroundInterval);
        return;
      }

      try {
        console.log('[RealMCP] Background discovery attempt...');
        const tools = await mcpService.getTools();
        if (tools.length > 0) {
          this.tools = tools;
          RealMCPClient.toolsCache = tools;
          RealMCPClient.lastDiscoveryTime = Date.now();
          console.log(`[RealMCP] ✓ Background discovery succeeded: ${tools.length} tools`);
          clearInterval(backgroundInterval);
        }
      } catch (error) {
        console.warn('[RealMCP] Background discovery failed:', error);
      }
    }, 10000); // 每 10 秒尝试一次

    // 5 分钟后停止后台发现
    setTimeout(() => {
      clearInterval(backgroundInterval);
      console.log('[RealMCP] Background discovery stopped after 5 minutes');
    }, 300000);
  }

  /**
   * 检查是否真正可用
   */
  isRealMCP(): boolean {
    return this.isAvailable;
  }
}

// --- Function Declarations for Gemini (Google SDK format) ---

const createFileParams = {
  name: 'create_file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: "Name of the file (e.g. 'notes.md')" },
      content: { type: Type.STRING, description: "Markdown content of the file" }
    },
    required: ['filename', 'content']
  }
};

const updateFileParams = {
  name: 'update_file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: "Name of the file to update" },
      content: { type: Type.STRING, description: "New content to append or replace" }
    },
    required: ['filename', 'content']
  }
};

const deleteFileParams = {
  name: 'delete_file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: "Name of the file to delete" }
    },
    required: ['filename']
  }
};

const readFileParams = {
  name: 'read_file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      path: { type: Type.STRING, description: "File name or path to read" },
      startLine: { type: Type.NUMBER, description: "Optional: Start line number (1-indexed)" },
      endLine: { type: Type.NUMBER, description: "Optional: End line number (1-indexed)" }
    },
    required: ['path']
  }
};

const searchFilesParams = {
  name: 'search_files',
  parameters: {
    type: Type.OBJECT,
    properties: {
      keyword: { type: Type.STRING, description: "Keyword to search for in file contents" },
      filePattern: { type: Type.STRING, description: "Optional: File name pattern to filter (e.g., 'todo', '.md')" }
    },
    required: ['keyword']
  }
};

type OpenAIToolDefinition = {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>;
    };
};

type AnthropicToolDefinition = {
    name: string;
    description?: string;
    input_schema: Record<string, unknown>;
};

// --- Function Declarations for OpenAI / Ollama (JSON Schema format) ---

const OPENAI_TOOLS: OpenAIToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_file",
      description: "Create a new file with the given name and content. Use this to create documents.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", "description": "Name of the file (e.g. 'notes.md')" },
          content: { type: "string", "description": "Markdown content of the file" }
        },
        required: ["filename", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_file",
      description: "Update an existing file. Replaces content or appends based on logic.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", "description": "Name of the file to update" },
          content: { type: "string", "description": "New content" }
        },
        required: ["filename", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file by name.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", "description": "Name of the file to delete" }
        },
        required: ["filename"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the content of a specific file. Optionally specify line range to read.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File name or path to read" },
          startLine: { type: "number", description: "Optional: Start line number (1-indexed)" },
          endLine: { type: "number", description: "Optional: End line number (1-indexed)" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search for a keyword across all files. Returns matching lines with line numbers.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Keyword to search for in file contents" },
          filePattern: { type: "string", description: "Optional: File name pattern to filter (e.g., 'todo', '.md')" }
        },
        required: ["keyword"]
      }
    }
  }
];

// --- RAG Tool Declarations ---

// OpenAI/Ollama format
const SEARCH_KNOWLEDGE_BASE_TOOL: OpenAIToolDefinition = {
  type: "function",
  function: {
    name: "search_knowledge_base",
    description: "Search the user's indexed notes and documents. Use this when the user asks about their notes, references specific documents, or needs information from their knowledge base.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        maxResults: { type: "number", description: "Maximum results (default: 10)" }
      },
      required: ["query"]
    }
  }
};

const buildOpenAIToolsForPrompt = (prompt: string, mcpClient?: IMCPClient): OpenAIToolDefinition[] => {
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

const buildAnthropicToolsForPrompt = (prompt: string, mcpClient?: IMCPClient): AnthropicToolDefinition[] => {
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
                    filename: { type: 'string', description: "Name of the file" },
                    content: { type: 'string', description: "Content of the file" }
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
                    filename: { type: 'string', description: "Name of the file" },
                    content: { type: 'string', description: "New content" }
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
                    filename: { type: 'string', description: "Name of the file" }
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
                    path: { type: 'string', description: "File name or path" },
                    startLine: { type: 'number', description: "Optional: Start line (1-indexed)" },
                    endLine: { type: 'number', description: "Optional: End line (1-indexed)" }
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
                    keyword: { type: 'string', description: "Keyword to search" },
                    filePattern: { type: 'string', description: "Optional: File name pattern" }
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
                    query: { type: 'string', description: "Search query" },
                    maxResults: { type: 'number', description: "Max results" }
                },
                required: ['query']
            }
        }
    ];

    return [...baseToolsAnthropic, ...mappedDynamic];
};

// Gemini format (using @google/genai's Type)
const GEMINI_SEARCH_KB_TOOL: FunctionDeclaration = {
  name: 'search_knowledge_base',
  description: "Search the user's indexed notes and documents. Use this when the user asks about their notes, references specific documents, or needs information from their knowledge base.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "The search query" },
      maxResults: { type: Type.NUMBER, description: "Maximum results (default: 10)" }
    },
    required: ['query']
  }
};

// Helper: Convert OpenAI JSON Schema Tool to Gemini FunctionDeclaration
const mapOpenAIToolsToGemini = (openAITools: any[]): FunctionDeclaration[] => {
    return openAITools.map(tool => {
        // Robust check: try 'tool.function', fallback to 'tool' (flat format), or null
        const fn = tool?.function || tool;
        
        // Guard against malformed entries where name is missing
        if (!fn || !fn.name) {
            return null;
        }

        return {
            name: fn.name,
            description: fn.description,
            parameters: fn.parameters 
        } as FunctionDeclaration;
    }).filter(t => t !== null) as FunctionDeclaration[];
};

// Helper to sanitize code blocks and extract JSON
const cleanCodeBlock = (text: string): string => {
  let cleaned = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  return cleaned;
};

// Robust JSON extractor that finds the first '{' and last '}' OR first '[' and last ']'
const extractJson = (text: string): string => {
  const startObj = text.indexOf('{');
  const endObj = text.lastIndexOf('}');
  const startArr = text.indexOf('[');
  const endArr = text.lastIndexOf(']');

  if (startArr !== -1 && (startObj === -1 || startArr < startObj)) {
     if (endArr !== -1 && endArr > startArr) {
        return text.substring(startArr, endArr + 1);
     }
  }

  if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
    return text.substring(startObj, endObj + 1);
  }
  return cleanCodeBlock(text);
};

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Streaming Response Helpers ---
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const shouldLogAnthropicStream = (): boolean => {
  const globalAny = globalThis as Record<string, unknown>;
  if (globalAny.__TASHAN_STREAM_DEBUG__ === true) {
    return true;
  }
  if (typeof process !== 'undefined' && process.env?.TASHAN_STREAM_DEBUG === '1') {
    return true;
  }
  return false;
};

const formatAnthropicStreamEvent = (event: unknown): string => {
  if (!isRecord(event)) {
    return JSON.stringify({ type: 'unknown', rawType: typeof event });
  }

  const summary: Record<string, unknown> = {};
  const eventType = typeof event.type === 'string' ? event.type : 'unknown';
  summary.type = eventType;

  if (typeof event.index === 'number') {
    summary.index = event.index;
  }
  if (typeof event.stop_reason === 'string') {
    summary.stop_reason = event.stop_reason;
  }

  if (isRecord(event.delta)) {
    const delta = event.delta;
    if (typeof delta.stop_reason === 'string') {
      summary.delta_stop_reason = delta.stop_reason;
    }
    if (typeof delta.text === 'string') {
      summary.delta_text_len = delta.text.length;
    }
    if (typeof delta.partial_json === 'string') {
      summary.delta_partial_json_len = delta.partial_json.length;
      summary.delta_partial_json_tail = delta.partial_json.slice(-160);
    }
  }

  if (isRecord(event.content_block)) {
    const block = event.content_block;
    if (typeof block.type === 'string') {
      summary.content_block_type = block.type;
    }
    if (typeof block.name === 'string') {
      summary.tool_name = block.name;
    }
    if (typeof block.id === 'string') {
      summary.tool_id = block.id;
    }
    if (block.type === 'tool_use') {
      const input = block.input;
      if (typeof input === 'string') {
        summary.tool_input_len = input.length;
      } else if (isRecord(input) || Array.isArray(input)) {
        summary.tool_input_len = JSON.stringify(input).length;
      }
    }
  }

  return JSON.stringify(summary);
};

const formatAnthropicStreamLine = (line: string): string => {
  const trimmed = line.trim();
  const summary: Record<string, unknown> = {
    length: trimmed.length,
    prefix: trimmed.slice(0, 16)
  };

  if (trimmed.startsWith('event:')) {
    summary.event = trimmed.slice(6).trim();
  }

  if (trimmed.startsWith('data:')) {
    const data = trimmed.replace(/^data:\s*/, '');
    const typeMatch = data.match(/\"type\"\s*:\s*\"([^\"]+)\"/);
    if (typeMatch) {
      summary.json_type = typeMatch[1];
    }
    summary.data_head = data.slice(0, 60);
    summary.data_tail = data.slice(-60);
  }

  return JSON.stringify(summary);
};

const shouldLogOpenAIStream = (): boolean => shouldLogAnthropicStream();

const formatOpenAIStreamEvent = (event: unknown): string => {
  if (!isRecord(event)) {
    return JSON.stringify({ type: 'unknown', rawType: typeof event });
  }

  const summary: Record<string, unknown> = { type: 'openai' };
  if (typeof event.id === 'string') {
    summary.id = event.id;
  }

  const choices = Array.isArray(event.choices) ? event.choices : [];
  const firstChoice = choices[0];
  if (isRecord(firstChoice)) {
    if (typeof firstChoice.finish_reason === 'string') {
      summary.finish_reason = firstChoice.finish_reason;
    }
    const delta = isRecord(firstChoice.delta) ? firstChoice.delta : null;
    if (delta) {
      if (typeof delta.content === 'string') {
        summary.delta_content_len = delta.content.length;
      }
      if (Array.isArray(delta.tool_calls)) {
        summary.tool_calls = delta.tool_calls.length;
        const toolNames = delta.tool_calls
          .map(call => (isRecord(call) && isRecord(call.function) && typeof call.function.name === 'string')
            ? call.function.name
            : null)
          .filter((name): name is string => Boolean(name))
          .slice(0, 3);
        if (toolNames.length > 0) {
          summary.tool_names = toolNames;
        }
        const argLengths = delta.tool_calls
          .map(call => (isRecord(call) && isRecord(call.function) && typeof call.function.arguments === 'string')
            ? call.function.arguments.length
            : null)
          .filter((len): len is number => typeof len === 'number')
          .slice(0, 3);
        if (argLengths.length > 0) {
          summary.tool_args_len = argLengths;
        }
      }
    }
  }

  if (isRecord(event.error)) {
    const error = event.error;
    if (typeof error.message === 'string') {
      summary.error_message = error.message;
    }
    if (typeof error.type === 'string') {
      summary.error_type = error.type;
    }
  }

  return JSON.stringify(summary);
};

const formatOpenAIStreamLine = (line: string): string => {
  const trimmed = line.trim();
  const summary: Record<string, unknown> = {
    length: trimmed.length,
    prefix: trimmed.slice(0, 16)
  };

  if (trimmed.startsWith('event:')) {
    summary.event = trimmed.slice(6).trim();
  }

  if (trimmed.startsWith('data:')) {
    const data = trimmed.replace(/^data:\s*/, '');
    summary.is_done = data === '[DONE]';
    summary.data_head = data.slice(0, 60);
    summary.data_tail = data.slice(-60);
  }

  return JSON.stringify(summary);
};

const extractLastUrl = (text: string): string | null => {
  const matches = text.match(/https?:\/\/[^\s"'<>]+/g);
  if (!matches || matches.length === 0) {
    return null;
  }
  return matches[matches.length - 1];
};

const applyToolCallFallbackArgs = (toolCall: ToolCall, contextText: string): ToolCall => {
  if (toolCall.name !== 'navigate_page' && toolCall.name !== 'new_page') {
    return toolCall;
  }

  const urlValue = toolCall.args?.url;
  const hasUrl = typeof urlValue === 'string' && urlValue.trim().length > 0;
  if (hasUrl) {
    return toolCall;
  }

  const fallbackUrl = extractLastUrl(contextText);
  if (!fallbackUrl) {
    return toolCall;
  }

  const nextArgs: Record<string, JsonValue> = { url: fallbackUrl };
  return {
    ...toolCall,
    args: nextArgs,
    rawArgs: toolCall.rawArgs ?? JSON.stringify(nextArgs)
  };
};

const ensureJsonArguments = (rawArgs: string | undefined, args: Record<string, JsonValue> | undefined): string => {
  if (typeof rawArgs === 'string' && rawArgs.trim().length > 0) {
    try {
      JSON.parse(rawArgs);
      return rawArgs;
    } catch {
    }
  }
  return JSON.stringify(args ?? {});
};

const isMiniMaxCompatible = (config: AIConfig): boolean => {
  const baseUrl = (config.baseUrl || '').toLowerCase();
  const model = (config.model || '').toLowerCase();
  return baseUrl.includes('minimax') || baseUrl.includes('minimaxi') || model.includes('minimax');
};

const isOpenAICompatibleEndpoint = (config: AIConfig): boolean => {
  const baseUrl = (config.baseUrl || '').toLowerCase();
  if (!baseUrl) {
    return false;
  }
  return !baseUrl.includes('api.openai.com');
};

const buildOpenAIToolCallMessage = (
  toolCallPayload: Array<Record<string, unknown>>,
  accumulatedText: string,
  config: AIConfig
): Record<string, unknown> => {
  const message: Record<string, unknown> = {
    role: 'assistant',
    tool_calls: toolCallPayload
  };

  if (accumulatedText.trim()) {
    message.content = accumulatedText;
  } else if (isOpenAICompatibleEndpoint(config)) {
    // Some OpenAI-compatible endpoints reject null content values.
    message.content = '';
  } else {
    message.content = null;
  }

  return message;
};

export const supportsNativeStreamingToolCalls = (config: AIConfig): boolean => {
  if (config.provider === 'openai') {
    return true;
  }
  if (config.provider === 'anthropic') {
    return !isMiniMaxCompatible(config);
  }
  return false;
};

interface OpenAIStreamOptions {
  tools?: OpenAIToolDefinition[];
  messagesOverride?: Array<Record<string, unknown>>;
  streamingAdapter?: StreamingToolCallAdapter;
  adapterState?: StreamingAdapterState;
  toolEventCallback?: ToolEventCallback;
}

interface AnthropicStreamOptions {
  tools?: AnthropicToolDefinition[];
  messagesOverride?: Array<Record<string, unknown>>;
  streamingAdapter?: StreamingToolCallAdapter;
  adapterState?: StreamingAdapterState;
  toolEventCallback?: ToolEventCallback;
}

/**
 * Stream Gemini response
 */
async function* streamGemini(
  prompt: string,
  config: AIConfig,
  systemInstruction?: string,
  conversationHistory?: ChatMessage[]
): AsyncGenerator<string, void, unknown> {
  try {
    const client = getClient(config.apiKey);
    const modelName = config.model || DEFAULT_GEMINI_MODEL;

    // Build contents array
    const contents: any[] = [];

    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        if (msg.role === 'user') {
          contents.push({ role: 'user', parts: [{ text: msg.content }] });
        } else if (msg.role === 'assistant') {
          contents.push({ role: 'model', parts: [{ text: msg.content }] });
        }
      }
    }

    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const generateConfig: any = { systemInstruction };

    const result = await client.models.generateContentStream({
      model: modelName,
      contents,
      config: generateConfig
    });

    // Gemini's generateContentStream returns an AsyncGenerator
    for await (const chunk of result) {
      const text = chunk.text;
      if (text) yield text;
    }
  } catch (error: any) {
    throw new Error(`Gemini Streaming Error: ${error.message || "Unknown error"}`);
  }
}

/**
 * Stream Ollama response (NDJSON format)
 */
async function* streamOllama(
  prompt: string,
  config: AIConfig,
  systemInstruction?: string,
  conversationHistory?: ChatMessage[]
): AsyncGenerator<string, void, unknown> {
  const baseUrl = config.baseUrl || 'http://localhost:11434';
  const model = config.model || 'llama3';

  const messages: any[] = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });

  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: msg.content });
      }
    }
  }

  messages.push({ role: 'user', content: prompt });

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: { temperature: config.temperature }
      })
    };

    // Use platformStreamFetch for true streaming in Electron
    let buffer = '';
    for await (const chunk of platformStreamFetch(url, options)) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            yield json.message.content;
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const json = JSON.parse(buffer);
        if (json.message?.content) {
          yield json.message.content;
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }
  } catch (error: any) {
    throw new Error(`Ollama Streaming Error: ${error.message || "Unknown error"}`);
  }
}

/**
 * Stream Anthropic-compatible response (SSE format)
 */
async function* streamAnthropic(
  prompt: string,
  config: AIConfig,
  systemInstruction?: string,
  conversationHistory?: ChatMessage[],
  options?: AnthropicStreamOptions
): AsyncGenerator<string, void, unknown> {
  const baseUrl = config.baseUrl || 'https://api.anthropic.com';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/messages`;

  const messages: Array<Record<string, unknown>> = options?.messagesOverride
    ? [...options.messagesOverride]
    : [];

  if (!options?.messagesOverride && conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: msg.content });
      }
    }
  }

  if (!options?.messagesOverride) {
    messages.push({ role: 'user', content: prompt });
  }

  // 🔧 修复: 当 modelOutputLimit 未设置时，自动从 modelContextLimit 计算
  const MODEL_LIMIT = config.contextEngine?.modelContextLimit ?? 200000;
  const MAX_OUTPUT_TOKENS = config.contextEngine?.modelOutputLimit ?? 
                            Math.floor(MODEL_LIMIT * 0.08) ?? 4096;
  const logStreamEvents = shouldLogAnthropicStream();
  
  try {
    const requestBody: Record<string, unknown> = {
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: MAX_OUTPUT_TOKENS,
      messages,
      stream: true
    };

    if (systemInstruction) {
      requestBody.system = systemInstruction;
    }

    if (options?.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
    }

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    };

    // Use platformStreamFetch for true streaming in Electron
    let buffer = '';
    for await (const chunk of platformStreamFetch(endpoint, requestOptions)) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data:') || line.startsWith('event:')) {
          if (logStreamEvents) {
            console.info('[AnthropicStreamRaw]', formatAnthropicStreamLine(line));
          }
        }
        if (line.startsWith('data:')) {
          const data = line.replace(/^data:\s*/, '').trim();
          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            if (logStreamEvents) {
              console.info('[AnthropicStreamDebug]', formatAnthropicStreamEvent(json));
            }
            if (options?.streamingAdapter && options.adapterState) {
              options.streamingAdapter.parseStreamingChunk(json, options.adapterState);
              const toolCalls = options.streamingAdapter.getToolCalls(options.adapterState);
              for (const toolCall of toolCalls) {
                options.toolEventCallback?.(toolCall);
              }
            }
            // Anthropic SSE format: content_block_delta with delta.text
            if (json.type === 'content_block_delta' && json.delta?.text) {
              yield json.delta.text;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    // Process any remaining buffer
    const remaining = buffer.trim();
    if (remaining) {
      if (logStreamEvents && (remaining.startsWith('data:') || remaining.startsWith('event:'))) {
        console.info('[AnthropicStreamRaw]', formatAnthropicStreamLine(remaining));
      }
      if (!remaining.startsWith('data:')) {
        return;
      }
      const data = remaining.replace(/^data:\s*/, '').trim();
      if (data !== '[DONE]') {
        try {
          const json = JSON.parse(data);
          if (logStreamEvents) {
            console.info('[AnthropicStreamDebug]', formatAnthropicStreamEvent(json));
          }
          if (options?.streamingAdapter && options.adapterState) {
            options.streamingAdapter.parseStreamingChunk(json, options.adapterState);
            const toolCalls = options.streamingAdapter.getToolCalls(options.adapterState);
            for (const toolCall of toolCalls) {
              options.toolEventCallback?.(toolCall);
            }
          }
          if (json.type === 'content_block_delta' && json.delta?.text) {
            yield json.delta.text;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  } catch (error: any) {
    throw new Error(`Anthropic Streaming Error: ${error.message || "Unknown error"}`);
  }
}

/**
 * Stream OpenAI-compatible response (SSE format)
 */
async function* streamOpenAICompatible(
  prompt: string,
  config: AIConfig,
  systemInstruction?: string,
  conversationHistory?: ChatMessage[],
  options?: OpenAIStreamOptions
): AsyncGenerator<string, void, unknown> {
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const logStreamEvents = shouldLogOpenAIStream();

  const messages: Array<Record<string, unknown>> = options?.messagesOverride
    ? [...options.messagesOverride]
    : [];
  if (!options?.messagesOverride && systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }

  if (!options?.messagesOverride && conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: msg.content });
      }
    }
  }

  if (!options?.messagesOverride) {
    messages.push({ role: 'user', content: prompt });
  }

  try {
    const requestBody: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: config.temperature,
      stream: true
    };
    if (options?.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
      requestBody.tool_choice = 'auto';
    }

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey || ''}`
      },
      body: JSON.stringify(requestBody)
    };

    // Use platformStreamFetch for true streaming in Electron
    let buffer = '';
    for await (const chunk of platformStreamFetch(endpoint, requestOptions)) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data:') || line.startsWith('event:')) {
          if (logStreamEvents) {
            console.info('[OpenAIStreamRaw]', formatOpenAIStreamLine(line));
          }
        }
        if (line.startsWith('data:')) {
          const data = line.replace(/^data:\s*/, '').trim();
          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            if (logStreamEvents) {
              console.info('[OpenAIStreamDebug]', formatOpenAIStreamEvent(json));
            }
            if (options?.streamingAdapter && options.adapterState) {
              options.streamingAdapter.parseStreamingChunk(json, options.adapterState);
              const toolCalls = options.streamingAdapter.getToolCalls(options.adapterState);
              for (const toolCall of toolCalls) {
                options.toolEventCallback?.(toolCall);
              }
            }
            const content = json.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    // Process any remaining buffer
    const remaining = buffer.trim();
    if (remaining) {
      if (logStreamEvents && (remaining.startsWith('data:') || remaining.startsWith('event:'))) {
        console.info('[OpenAIStreamRaw]', formatOpenAIStreamLine(remaining));
      }
      if (!remaining.startsWith('data:')) {
        return;
      }
      const data = remaining.replace(/^data:\s*/, '').trim();
      if (data !== '[DONE]') {
        try {
          const json = JSON.parse(data);
          if (logStreamEvents) {
            console.info('[OpenAIStreamDebug]', formatOpenAIStreamEvent(json));
          }
          if (options?.streamingAdapter && options.adapterState) {
            options.streamingAdapter.parseStreamingChunk(json, options.adapterState);
            const toolCalls = options.streamingAdapter.getToolCalls(options.adapterState);
            for (const toolCall of toolCalls) {
              options.toolEventCallback?.(toolCall);
            }
          }
          const content = json.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  } catch (error: any) {
    throw new Error(`Streaming Error: ${error.message || "Unknown error"}`);
  }
}

// Helper to format MCP tool results for better display
const formatMCPToolResult = (toolName: string, result: any): string => {
    // Check for success/error status
    const isSuccess = result?.success !== false;
    const statusEmoji = isSuccess ? '✅' : '❌';
    const errorMsg = result?.output || result?.error || result?.message || '';

    // CRITICAL: If failed, always show error message prominently
    if (!isSuccess) {
        const errorDetail = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);
        return `${statusEmoji} **${toolName}** failed\n> Error: ${errorDetail}`;
    }

    // Format based on tool type (success cases)
    if (toolName === 'take_snapshot' || toolName.includes('snapshot')) {
        // Page snapshot - extract key info
        const output = result?.output || result;
        if (typeof output === 'string' && output.includes('Page content')) {
            // Extract a summary instead of full content
            const lines = output.split('\n').slice(0, 10);
            const summary = lines.join('\n');
            const totalLines = output.split('\n').length;
            return `${statusEmoji} **Page Snapshot** captured\n\`\`\`\n${summary}\n...(${totalLines} total lines)\n\`\`\``;
        }
    }

    if (toolName === 'fill' || toolName === 'fill_form') {
        return `${statusEmoji} **Form filled** successfully`;
    }

    if (toolName === 'click') {
        return `${statusEmoji} **Clicked** element`;
    }

    if (toolName === 'navigate_page' || toolName === 'new_page') {
        const output = result?.output || '';
        // Extract page list info if present
        if (typeof output === 'string' && output.includes('Pages')) {
            const pageMatch = output.match(/(\d+):.*\[selected\]/);
            return `${statusEmoji} **${toolName}** completed${pageMatch ? ` (page ${pageMatch[1]} selected)` : ''}`;
        }
        return `${statusEmoji} **Navigated** to page`;
    }

    if (toolName === 'take_screenshot') {
        return `${statusEmoji} **Screenshot** captured`;
    }

    if (toolName === 'list_pages') {
        const pages = result?.pages || result;
        if (Array.isArray(pages)) {
            return `${statusEmoji} **Found ${pages.length} pages**`;
        }
    }

    // For other tools, try to provide a concise summary
    if (result?.output && typeof result.output === 'string') {
        // Truncate long outputs
        const output = result.output;
        if (output.length > 500) {
            return `${statusEmoji} **${toolName}** completed\n\`\`\`\n${output.substring(0, 500)}...\n\`\`\``;
        }
        return `${statusEmoji} **${toolName}** completed\n\`\`\`\n${output}\n\`\`\``;
    }

    // Fallback: compact JSON
    const jsonStr = JSON.stringify(result, null, 2);
    if (jsonStr.length > 300) {
        return `${statusEmoji} **${toolName}** completed (result truncated)`;
    }
    return `${statusEmoji} **${toolName}** completed`;
};

const INTERNAL_TOOL_NAMES = new Set([
  'create_file',
  'update_file',
  'delete_file',
  'read_file',
  'search_files',
  'search_knowledge_base'
]);

const STREAMING_TOOL_RESULT_MAX_CHARS = 8000;

const compactToolResultForStreaming = (toolName: string, result: JsonValue): JsonValue => {
  if (INTERNAL_TOOL_NAMES.has(toolName)) {
    return result;
  }

  const formatted = formatMCPToolResult(toolName, result);
  if (formatted.length > STREAMING_TOOL_RESULT_MAX_CHARS) {
    return `${formatted.slice(0, STREAMING_TOOL_RESULT_MAX_CHARS)}...(truncated)`;
  }
  return formatted;
};

// Helper: Segment Text (Rule 1 & 3)
const chunkText = (text: string, chunkSize: number = 800, overlap: number = 100): string[] => {
    const chunks = [];
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    
    if (cleanText.length <= chunkSize) return [cleanText];
    
    for (let i = 0; i < cleanText.length; i += (chunkSize - overlap)) {
        let end = Math.min(i + chunkSize, cleanText.length);
        if (end < cleanText.length) {
            const nextPeriod = cleanText.indexOf('.', end - 50);
            const nextNewline = cleanText.indexOf('\n', end - 50);
            if (nextPeriod !== -1 && nextPeriod < end + 50) end = nextPeriod + 1;
            else if (nextNewline !== -1 && nextNewline < end + 50) end = nextNewline + 1;
        }
        chunks.push(cleanText.substring(i, end));
        if (end >= cleanText.length) break;
    }
    return chunks;
};

// --- EMBEDDING LRU CACHE ---
// P0 Performance Optimization: Cache embeddings to avoid redundant API calls

interface CacheEntry {
  embedding: number[];
  timestamp: number;
}

class EmbeddingCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private maxAge: number; // milliseconds

  constructor(maxSize: number = 1000, maxAgeMinutes: number = 60) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.maxAge = maxAgeMinutes * 60 * 1000;
  }

  private hash(text: string): string {
    // Simple hash for cache key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  get(text: string): number[] | null {
    const key = this.hash(text);
    const entry = this.cache.get(key);
    
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.embedding;
  }

  set(text: string, embedding: number[]): void {
    const key = this.hash(text);

    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      embedding,
      timestamp: Date.now()
    });
  }

  clear(): void {
    this.cache.clear();
  }

  stats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }
}

// Global embedding cache instance
const embeddingCache = new EmbeddingCache(500, 60); // 500 entries, 60 minutes

// Helper function to get embeddings from Ollama (used as fallback)
// Ollama API uses /api/embed with { model, input } format (not /api/embeddings with prompt)
const getOllamaEmbedding = async (text: string, embeddingModel?: string): Promise<number[]> => {
    const modelName = embeddingModel || 'nomic-embed-text';
    const ollamaUrl = 'http://localhost:11434';

    const response = await platformFetch(`${ollamaUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modelName,
            input: text
        })
    });

    if (!response.ok) {
        throw new Error(`Ollama embedding failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // Ollama /api/embed returns { embeddings: [[...]] } for single input
    return data.embeddings?.[0] || [];
};

export const getEmbedding = async (text: string, config: AIConfig): Promise<number[]> => {
    const cleanText = text.replace(/\n/g, ' ').trim().substring(0, 8000); // Truncate safe limit

    // P0: Check cache first
    const cached = embeddingCache.get(cleanText);
    if (cached) {
      console.log(`[EmbeddingCache] HIT (${embeddingCache.stats().size}/${embeddingCache.stats().maxSize})`);
      return cached;
    }
    console.log(`[EmbeddingCache] MISS for text length: ${cleanText.length}`);

    // Use embeddingProvider if set, otherwise fall back to main provider
    const embeddingProvider = config.embeddingProvider || config.provider;
    const embeddingModel = config.embeddingModel;
    const embeddingBaseUrl = config.embeddingBaseUrl || config.baseUrl;
    const embeddingApiKey = config.embeddingApiKey || config.apiKey;

    if (embeddingProvider === 'gemini') {
        try {
            const client = getClient(embeddingApiKey);
            const modelName = embeddingModel || 'text-embedding-004';
            const result = await client.models.embedContent({
                model: modelName,
                contents: [{ parts: [{ text: cleanText }] }]
            });
            const embedding = result.embeddings?.[0]?.values || [];
            embeddingCache.set(cleanText, embedding);
            return embedding;
        } catch (e: any) {
            console.error("Gemini Embedding Error", e);
            throw new Error(`Embedding Failed: ${e.message}`);
        }
    } else if (embeddingProvider === 'openai') {
        try {
            const modelName = embeddingModel || 'text-embedding-3-small';
            const response = await platformFetch(`${(embeddingBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${embeddingApiKey}`
                },
                body: JSON.stringify({
                    input: cleanText,
                    model: modelName
                })
            });
            if (!response.ok) {
                // If embeddings endpoint not available (e.g., DeepSeek), fallback to Ollama
                console.warn(`OpenAI-compatible API doesn't support embeddings (${response.status}), falling back to Ollama`);
                return await getOllamaEmbedding(cleanText, embeddingModel);
            }
            const data = await response.json();
            const embedding = data.data[0].embedding;
            embeddingCache.set(cleanText, embedding);
            return embedding;
        } catch (e: any) {
            console.error("OpenAI Embedding Error", e);
            // Fallback to Ollama on any error
            console.warn("Falling back to Ollama for embeddings");
            try {
                return await getOllamaEmbedding(cleanText, embeddingModel);
            } catch (ollamaError) {
                console.error("Ollama fallback also failed", ollamaError);
                throw e;
            }
        }
    } else if (embeddingProvider === 'ollama') {
        try {
            const modelName = embeddingModel || 'nomic-embed-text';
            // Ollama API uses /api/embed with { model, input } format
            const response = await platformFetch(`${(embeddingBaseUrl || 'http://localhost:11434').replace(/\/$/, '')}/api/embed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelName,
                    input: cleanText
                })
            });

            if (!response.ok) {
                 // Fallback to generative model if dedicated embedder missing (or configured one fails)
                 // Only try fallback if the user hasn't explicitly set a different model that failed
                 if (modelName !== config.model) {
                     const responseFallback = await platformFetch(`${(embeddingBaseUrl || 'http://localhost:11434').replace(/\/$/, '')}/api/embed`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: config.model,
                            input: cleanText
                        })
                    });
                    if (!responseFallback.ok) throw new Error("Ollama Embedding Failed");
                    const data = await responseFallback.json();
                    // Ollama /api/embed returns { embeddings: [[...]] }
                    const fallbackEmbedding = data.embeddings?.[0] || [];
                    embeddingCache.set(cleanText, fallbackEmbedding);
                    return fallbackEmbedding;
                 } else {
                     throw new Error(`Ollama Embedding Failed: ${response.statusText}`);
                 }
            }
            const data = await response.json();
            // Ollama /api/embed returns { embeddings: [[...]] }
            const embedding = data.embeddings?.[0] || [];
            embeddingCache.set(cleanText, embedding);
            return embedding;
        } catch (e: any) {
             console.error("Ollama Embedding Error", e);
             throw e;
        }
    }
    
    return [];
};

export const compactConversation = async (messages: ChatMessage[], config: AIConfig): Promise<ChatMessage[]> => {
    // We want to keep the last 2 interactions (user + assistant) to maintain flow
    // Everything before that gets summarized into a system-like context message
    
    if (messages.length <= 3) return messages; // Nothing to compact really
    
    const messagesToSummarize = messages.slice(0, messages.length - 2);
    const recentMessages = messages.slice(messages.length - 2);
    
    const conversationText = messagesToSummarize.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    
    const prompt = `Summarize the following conversation history into a concise but comprehensive context block. 
    Preserve key information, user preferences, and important technical details. 
    The goal is to reduce token usage while maintaining memory.
    
    Conversation History:
    ${conversationText}`;
    
    // Create a temporary config that uses the compactModel if available, otherwise default model
    const compactionConfig = { 
        ...config, 
        model: config.compactModel || config.model 
    };

    const summary = await generateAIResponse(
      prompt,
      compactionConfig,
      "You are a helpful assistant summarizer.",
      false, // jsonMode
      [], // contextFiles
      undefined, // toolsCallback
      undefined, // retrievedContext
      undefined, // conversationHistory
      true // disableTools: true - CRITICAL: No tools needed for summarization
    );
    
    const summaryMessage: ChatMessage = {
        id: `summary-${Date.now()}`,
        role: 'system', // or assistant with special marker
        content: `**[Conversation Summarized]**\n${summary}`,
        timestamp: Date.now()
    };
    
    return [summaryMessage, ...recentMessages];
};

/**
 * Stream AI response as it's being generated
 * @yields Text chunks as they arrive
 */
export async function* generateAIResponseStream(
  prompt: string,
  config: AIConfig,
  systemInstruction?: string,
  contextFiles: MarkdownFile[] = [],
  retrievedContext?: string,
  conversationHistory?: ChatMessage[],
  toolsCallback?: ToolCallback,
  toolEventCallback?: ToolEventCallback
): AsyncGenerator<string, void, unknown> {
  // Build full prompt with RAG context
  let fullPrompt = prompt;

  if (retrievedContext) {
    fullPrompt = `You are answering based on the provided Knowledge Base.\n\nrelevant_context:\n${retrievedContext}\n\nuser_query: ${prompt}`;
  } else if (contextFiles.length > 0) {
    const charLimit = config.provider === 'gemini' ? 2000000 : 30000;
    const contextStr = contextFiles.map(f => `--- File: ${f.name} ---\n${f.content}`).join('\n\n');
    const truncatedContext = contextStr.substring(0, charLimit);
    fullPrompt = `Context from user knowledge base:\n${truncatedContext}\n\nUser Query: ${prompt}`;
  }

  const langInstruction = config.language === 'zh'
    ? " IMPORTANT: Respond in Chinese (Simplified) for all content, explanations, and labels."
    : "";

  // Initialize MCP Client for tool descriptions - Use Real if available, fallback to Virtual
  let mcpClient: RealMCPClient | VirtualMCPClient;
  const realMCP = new RealMCPClient(config.mcpTools || '{}');

  console.log('[generateAIResponseStream] mcpService.isAvailable:', mcpService.isAvailable());
  console.log('[generateAIResponseStream] realMCP.isRealMCP:', realMCP.isRealMCP());

  if (realMCP.isRealMCP()) {
    mcpClient = realMCP;
    await mcpClient.connect();
    console.log('[generateAIResponseStream] RealMCP tools:', mcpClient.getTools().length);
  } else {
    mcpClient = new VirtualMCPClient(config.mcpTools || '{}');
    await mcpClient.connect();
    console.log('[generateAIResponseStream] VirtualMCP tools:', mcpClient.getTools().length);
  }

  // Generate MCP Tool Descriptions for System Prompt
  const rawTools = mcpClient ? mcpClient.getTools() : [];
  const mcpToolDescriptions = rawTools.length > 0
    ? rawTools.map(t => `- **${t.name}**: ${t.description}`).join('\n')
    : '';

  // 动态生成工具使用指南
  const toolGuide = generateMCPToolGuide(
    rawTools.map(t => ({ name: t.name, description: t.description || '', inputSchema: {} })),
    config.language === 'zh' ? 'zh' : 'en'
  );

  const supportsStreamingToolCalls = supportsNativeStreamingToolCalls(config);
  const canUseTools = Boolean(toolsCallback);
  const useNativeStreamingTools = supportsStreamingToolCalls && canUseTools;

  const mcpPromptAddition = mcpToolDescriptions
    ? useNativeStreamingTools
      ? `\n\n## Your Available Tools\n\nYou are equipped with ${rawTools.length} external tools that you CAN and SHOULD use when appropriate. These tools are already connected and ready to use.\n\n**Available Tools:**\n${mcpToolDescriptions}${toolGuide}\n\n**Important:** You HAVE these tools - they are not hypothetical. Do NOT say "I don't have access to..." for tools listed above.`
      : `\n\n## Your Available Tools\n\nYou are equipped with ${rawTools.length} external tools that you CAN and SHOULD use when appropriate. These tools are already connected and ready to use.\n\nWhen you need to use a tool, output a tool call in this exact JSON format:\n\`\`\`tool_call\n{"tool": "tool_name", "arguments": {...}}\n\`\`\`\n\n**Available Tools:**\n${mcpToolDescriptions}${toolGuide}\n\n**Important:** You HAVE these tools - they are not hypothetical. Do NOT say "I don't have access to..." for tools listed above.`
    : '';

  const finalSystemInstruction = (systemInstruction || "") + mcpPromptAddition + toolDistinctionGuide(config.language === 'zh' ? 'zh' : 'en') + langInstruction;

  if (useNativeStreamingTools) {
    const streamingAdapter = getStreamingToolCallAdapter(config.provider);
    const toolAdapter = getToolCallAdapter(config.provider);
    const shouldPromptForToolContinuation = config.provider === 'openai' && isOpenAICompatibleEndpoint(config);
    const toolContinuationPrompt = config.language === 'zh'
      ? '请继续下一步或给出最终答案。'
      : 'Continue with the next step or provide your final answer.';

    if (!streamingAdapter) {
      yield* streamOpenAICompatible(fullPrompt, config, finalSystemInstruction, conversationHistory);
      return;
    }

    if (config.provider === 'openai') {
      const tools = buildOpenAIToolsForPrompt(fullPrompt, mcpClient);
      const messages: Array<Record<string, unknown>> = [];
      if (finalSystemInstruction) {
        messages.push({ role: 'system', content: finalSystemInstruction });
      }
      if (conversationHistory && conversationHistory.length > 0) {
        for (const msg of conversationHistory) {
          if (msg.role === 'user') {
            messages.push({ role: 'user', content: msg.content });
          } else if (msg.role === 'assistant') {
            messages.push({ role: 'assistant', content: msg.content });
          }
        }
      }
      messages.push({ role: 'user', content: fullPrompt });

      while (true) {
        const adapterState = createStreamingAdapterState();
        yield* streamOpenAICompatible(fullPrompt, config, finalSystemInstruction, conversationHistory, {
          messagesOverride: messages,
          tools,
          streamingAdapter,
          adapterState,
          toolEventCallback
        });

        const toolCalls = streamingAdapter.getToolCalls(adapterState);
        const resolvedToolCalls = toolCalls.map(toolCall => applyToolCallFallbackArgs(toolCall, adapterState.accumulatedText));
        if (adapterState.isComplete && resolvedToolCalls.length > 0 && toolsCallback) {
          const toolCallPayload = resolvedToolCalls.map(toolCall => ({
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: ensureJsonArguments(toolCall.rawArgs, toolCall.args)
            }
          }));

          const toolCallMessage = buildOpenAIToolCallMessage(
            toolCallPayload,
            adapterState.accumulatedText,
            config
          );
          messages.push(toolCallMessage);

          for (const toolCall of resolvedToolCalls) {
            const runningCall: ToolCall = {
              ...toolCall,
              status: 'running',
              startTime: Date.now()
            };
            toolEventCallback?.(runningCall);

            try {
              const result = await toolsCallback(toolCall.name, toolCall.args);
              const completedCall: ToolCall = {
                ...runningCall,
                status: 'success',
                result,
                endTime: Date.now()
              };
              toolEventCallback?.(completedCall);

              const compactResult = compactToolResultForStreaming(toolCall.name, result as JsonValue);
              const toolResultMessage = toolAdapter.formatResult(toolCall, compactResult);
              messages.push(toolResultMessage as Record<string, unknown>);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              toolEventCallback?.({
                ...runningCall,
                status: 'error',
                error: errorMessage,
                endTime: Date.now()
              });
              throw error;
            }
          }

          if (shouldPromptForToolContinuation) {
            messages.push({ role: 'user', content: toolContinuationPrompt });
          }
          continue;
        }

        return;
      }
    }

    if (config.provider === 'anthropic') {
      const tools = buildAnthropicToolsForPrompt(fullPrompt, mcpClient);
      const messages: Array<Record<string, unknown>> = [];
      if (conversationHistory && conversationHistory.length > 0) {
        for (const msg of conversationHistory) {
          if (msg.role === 'user') {
            messages.push({ role: 'user', content: msg.content });
          } else if (msg.role === 'assistant') {
            messages.push({ role: 'assistant', content: msg.content });
          }
        }
      }
      messages.push({ role: 'user', content: fullPrompt });

      while (true) {
        const adapterState = createStreamingAdapterState();
        yield* streamAnthropic(fullPrompt, config, finalSystemInstruction, conversationHistory, {
          messagesOverride: messages,
          tools,
          streamingAdapter,
          adapterState,
          toolEventCallback
        });

        const toolCalls = streamingAdapter.getToolCalls(adapterState);
        const resolvedToolCalls = toolCalls.map(toolCall => applyToolCallFallbackArgs(toolCall, adapterState.accumulatedText));
        if (adapterState.isComplete && resolvedToolCalls.length > 0 && toolsCallback) {
          const contentBlocks: Array<Record<string, unknown>> = [];
          if (adapterState.accumulatedText.trim()) {
            contentBlocks.push({ type: 'text', text: adapterState.accumulatedText });
          }
          for (const toolCall of resolvedToolCalls) {
            contentBlocks.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.args
            });
          }

          messages.push({ role: 'assistant', content: contentBlocks });

          const resultBlocks: Array<Record<string, unknown>> = [];
          for (const toolCall of resolvedToolCalls) {
            const runningCall: ToolCall = {
              ...toolCall,
              status: 'running',
              startTime: Date.now()
            };
            toolEventCallback?.(runningCall);

            try {
              const result = await toolsCallback(toolCall.name, toolCall.args);
              const completedCall: ToolCall = {
                ...runningCall,
                status: 'success',
                result,
                endTime: Date.now()
              };
              toolEventCallback?.(completedCall);

              const compactResult = compactToolResultForStreaming(toolCall.name, result as JsonValue);
              resultBlocks.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: typeof compactResult === 'string' ? compactResult : JSON.stringify(compactResult)
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              toolEventCallback?.({
                ...runningCall,
                status: 'error',
                error: errorMessage,
                endTime: Date.now()
              });
              throw error;
            }
          }

          messages.push({ role: 'user', content: resultBlocks });
          continue;
        }

        return;
      }
    }
  }

  // Route to appropriate streaming function
  if (config.provider === 'gemini') {
    yield* streamGemini(fullPrompt, config, finalSystemInstruction, conversationHistory);
  } else if (config.provider === 'ollama') {
    yield* streamOllama(fullPrompt, config, finalSystemInstruction, conversationHistory);
  } else if (config.provider === 'openai') {
    yield* streamOpenAICompatible(fullPrompt, config, finalSystemInstruction, conversationHistory);
  } else if (config.provider === 'anthropic') {
    yield* streamAnthropic(fullPrompt, config, finalSystemInstruction, conversationHistory);
  } else {
    throw new Error(`Unsupported provider for streaming: ${config.provider}`);
  }
}

export const generateAIResponse = async (
  prompt: string,
  config: AIConfig,
  systemInstruction?: string,
  jsonMode: boolean = false,
  contextFiles: MarkdownFile[] = [],
  toolsCallback?: ToolCallback,
  retrievedContext?: string, // New: Accept pre-retrieved RAG context string
  conversationHistory?: ChatMessage[], // NEW: Historical conversation context
  disableTools: boolean = false, // NEW: Disable tool calling for content processing tasks
  toolEventCallback?: ToolEventCallback
): Promise<string> => {
  
  // RAG: Inject context
  let fullPrompt = prompt;

  // Strategy: Use retrievedContext if provided (High Quality RAG),
  // otherwise fallback to raw concatenation of contextFiles (Legacy/Small context)
  if (retrievedContext) {
      fullPrompt = `You are answering based on the provided Knowledge Base.\n\nrelevant_context:\n${retrievedContext}\n\nuser_query: ${prompt}`;
  } else if (contextFiles.length > 0) {
    // Dynamic context limit for legacy mode
    const charLimit = config.provider === 'gemini' ? 2000000 : 30000;
    const contextStr = contextFiles.map(f => `--- File: ${f.name} ---\n${f.content}`).join('\n\n');
    const truncatedContext = contextStr.substring(0, charLimit);
    fullPrompt = `Context from user knowledge base:\n${truncatedContext}\n\nUser Query: ${prompt}`;
  }

  const langInstruction = config.language === 'zh'
    ? " IMPORTANT: Respond in Chinese (Simplified) for all content, explanations, and labels."
    : "";

  // Initialize MCP Client - Use Real if available, fallback to Virtual
  let mcpClient: RealMCPClient | VirtualMCPClient;
  const realMCP = new RealMCPClient(config.mcpTools || '{}');

  if (realMCP.isRealMCP()) {
    mcpClient = realMCP;
    await mcpClient.connect();
    console.log('[AI] Using Real MCP Client (Electron)');
  } else {
    mcpClient = new VirtualMCPClient(config.mcpTools || '{}');
    await mcpClient.connect();
    console.log('[AI] Using Virtual MCP Client (Browser Simulation)');
  }

  // Generate MCP Tool Descriptions for System Prompt
  const rawTools2 = mcpClient ? mcpClient.getTools() : [];
  const mcpToolDescriptions = rawTools2.length > 0
    ? rawTools2.map(t => `- **${t.name}**: ${t.description}`).join('\n')
    : '';

  // 动态生成工具使用指南
  const toolGuide2 = generateMCPToolGuide(
    rawTools2.map(t => ({ name: t.name, description: t.description || '', inputSchema: {} })),
    config.language === 'zh' ? 'zh' : 'en'
  );

  const mcpPromptAddition = mcpToolDescriptions
    ? `\n\n## Your Available Tools\n\nYou are equipped with ${rawTools2.length} external tools that you CAN and SHOULD use when appropriate. These tools are already connected and ready to use.\n\n**Available Tools:**\n${mcpToolDescriptions}${toolGuide2}\n\n**Important:**\n- You HAVE these tools - they are not hypothetical. When a task requires browser control, web navigation, or other tool capabilities, USE them.\n- Simply call the tool by name with the required parameters. The system will execute it and return results.\n- Do NOT say "I don't have access to..." for tools listed above - you DO have access.`
    : '';

  const finalSystemInstruction = (systemInstruction || "") + mcpPromptAddition + toolDistinctionGuide(config.language === 'zh' ? 'zh' : 'en') + langInstruction;

  // Create Unified Tool Callback
  // IMPORTANT: 所有工具调用都必须经过 toolsCallback 以便 UI 能显示实时反馈
  const unifiedToolCallback: ToolCallback = async (name, args) => {
      // 始终通过 toolsCallback 执行，让 App.tsx 能够捕获所有工具调用并显示 UI
      // toolsCallback 内部（App.tsx 的 executeToolUnified）会判断是内置工具还是 MCP 工具
      if (toolsCallback) {
          return await toolsCallback(name, args);
      }
      // Fallback: 如果没有 callback，直接执行 MCP 工具
      return await mcpClient.executeTool(name, args);
  };

  // IMPORTANT: Conflicting Config Handling
  // If JSON Mode is enabled, we CANNOT use Function Calling tools in Gemini (API Error 400).
  // If disableTools is true, skip tool initialization for content processing tasks (expand/polish)
  const shouldEnableTools = !jsonMode && !disableTools && (!!toolsCallback || (mcpClient.getTools().length > 0));
  const callbackToPass = shouldEnableTools ? unifiedToolCallback : undefined;

  if (config.provider === 'gemini') {
    return callGemini(fullPrompt, config, finalSystemInstruction, jsonMode, callbackToPass, mcpClient, conversationHistory, toolEventCallback);
  } else if (config.provider === 'ollama') {
    return callOllama(fullPrompt, config, finalSystemInstruction, jsonMode, callbackToPass, mcpClient, conversationHistory, toolEventCallback);
  } else if (config.provider === 'openai') {
    return callOpenAICompatible(fullPrompt, config, finalSystemInstruction, jsonMode, callbackToPass, mcpClient, conversationHistory, toolEventCallback);
  } else if (config.provider === 'anthropic') {
    return callAnthropic(fullPrompt, config, finalSystemInstruction, jsonMode, callbackToPass, mcpClient, conversationHistory, toolEventCallback);
  }
  throw new Error(`Unsupported provider: ${config.provider}`);
};

const callGemini = async (
    prompt: string,
    config: AIConfig,
    systemInstruction?: string,
    jsonMode: boolean = false,
    toolsCallback?: ToolCallback,
    mcpClient?: IMCPClient,
    conversationHistory?: ChatMessage[],
    toolEventCallback?: ToolEventCallback,
    retries = 3
  ): Promise<string> => {
    try {
      const client = getClient(config.apiKey);
      const modelName = config.model;

      const generateConfig: any = {
        systemInstruction: systemInstruction,
      };

      if (jsonMode) {
        generateConfig.responseMimeType = 'application/json';
      }

      // 从用户配置获取限制，默认为 Gemini 1.5 Pro (1M)
      const MODEL_LIMIT = config.contextEngine?.modelContextLimit ?? 1000000;
      const MAX_OUTPUT_TOKENS = config.contextEngine?.modelOutputLimit ?? 8192;
      const MAX_INPUT_TOKENS = MODEL_LIMIT - MAX_OUTPUT_TOKENS - 500;

      const estimateTokens = (text: string): number => {
        return Math.ceil(text.length / 3);
      };

      const truncateHistoryForGemini = (
        history: ChatMessage[],
        systemPrompt: string,
        currentPrompt: string,
        maxTokens: number
      ): { contents: any[]; truncated: number } => {
        const systemTokens = estimateTokens(systemPrompt);
        const currentTokens = estimateTokens(currentPrompt);
        let availableTokens = maxTokens - systemTokens - currentTokens;

        const contents: any[] = [];

        for (let i = history.length - 1; i >= 0; i--) {
          const msg = history[i];
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          const msgTokens = estimateTokens(content);

          if (availableTokens - msgTokens < 0) {
            return {
              contents: [{
                role: 'user',
                parts: [{ text: `[上下文截断 - 已省略 ${i + 1} 条早期消息]\n\n---\n\n${currentPrompt}` }]
              }],
              truncated: i + 1
            };
          }

          availableTokens -= msgTokens;

          if (msg.role === 'user') {
            contents.unshift({ role: 'user', parts: [{ text: content }] });
          } else if (msg.role === 'assistant') {
            contents.unshift({ role: 'model', parts: [{ text: content }] });
          }
        }

        return { contents, truncated: 0 };
      };

      let contents: any[];
      let truncatedCount = 0;

      if (conversationHistory && conversationHistory.length > 0) {
        const truncationResult = truncateHistoryForGemini(
          conversationHistory,
          systemInstruction || '',
          prompt,
          MAX_INPUT_TOKENS
        );
        contents = truncationResult.contents;
        truncatedCount = truncationResult.truncated;
      } else {
        contents = [];
      }

      contents.push({ role: 'user', parts: [{ text: prompt }] });

      if (truncatedCount > 0) {
        console.warn(`[Gemini] 上下文过长，已截断 ${truncatedCount} 条早期消息`);
      }

    // Handle Web Search (Gemini only)
    if (config.enableWebSearch && !jsonMode) {
       generateConfig.tools = [{ googleSearch: {} }];
    }
    // Only add Function Calling tools if Web Search is NOT active AND toolsCallback is present
    else if (toolsCallback && !jsonMode) {
        // Base File Tools
        const baseTools: FunctionDeclaration[] = [
          createFileParams,
          updateFileParams,
          deleteFileParams,
          readFileParams,
          searchFilesParams,
          GEMINI_SEARCH_KB_TOOL
        ];

        // Dynamic MCP Tools - 根据意图选择工具
        const allTools = mcpClient ? mcpClient.getTools() : [];
        const userQuery = prompt || '';
        const toolAnalyzer = createToolAnalyzer();
        const analysisResult = toolAnalyzer.analyze(allTools, userQuery);
        const dynamicTools = toolAnalyzer.selectByIntent(allTools, analysisResult.intent);  // 根据意图选择工具

        generateConfig.tools = [{
            functionDeclarations: [...baseTools, ...dynamicTools]
        }];
    }

    const toolAdapter = getToolCallAdapter('gemini');

    // Multi-turn tool calling loop

    let iterations = 0;
    const MAX_ITERATIONS = 10;
    let finalResponse = '';

    while (iterations < MAX_ITERATIONS) {
      const response = await client.models.generateContent({
        model: modelName || DEFAULT_GEMINI_MODEL,
        contents: contents,
        config: generateConfig
      });

      let outputText = response.text || '';

      // Handle Grounding Metadata (Sources)
      if (config.enableWebSearch && response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        const chunks = response.candidates[0].groundingMetadata.groundingChunks;
        const links: string[] = [];
        const visitedUrls = new Set<string>();

        chunks.forEach((chunk: any) => {
          if (chunk.web && chunk.web.uri && chunk.web.title) {
            if (!visitedUrls.has(chunk.web.uri)) {
               links.push(`- [${chunk.web.title}](${chunk.web.uri})`);
               visitedUrls.add(chunk.web.uri);
            }
          }
        });

        if (links.length > 0) {
          outputText += `\n\n### Sources\n${links.join('\n')}`;
        }
      }

      const toolCalls = toolAdapter.parseResponse(response);

      // Handle Function Calls (multi-turn loop)
      if (toolCalls.length > 0 && toolsCallback && !config.enableWebSearch && !jsonMode) {

        // Add model's response (with function calls) to contents
        contents.push({
          role: 'model',
          parts: response.candidates?.[0]?.content?.parts || []
        });

        // Execute all function calls and add results
        for (const toolCall of toolCalls) {
          const runningCall: ToolCall = {
            ...toolCall,
            status: 'running',
            startTime: Date.now()
          };
          toolEventCallback?.(runningCall);

          try {
            const result = await toolsCallback(toolCall.name, toolCall.args);
            const completedCall: ToolCall = {
              ...runningCall,
              status: 'success',
              result,
              endTime: Date.now()
            };
            toolEventCallback?.(completedCall);

            const toolResultMessage = toolAdapter.formatResult(toolCall, result);
            contents.push(toolResultMessage as { role: string; parts?: unknown[] });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            toolEventCallback?.({
              ...runningCall,
              status: 'error',
              error: errorMessage,
              endTime: Date.now()
            });
            throw error;
          }
        }

        iterations++;
        // Continue loop to get AI's next response
      } else {
        // No more function calls, return final response
        finalResponse = outputText;
        break;
      }
    }

    if (iterations >= MAX_ITERATIONS) {
      return finalResponse || "Maximum tool iterations reached. Task may be incomplete.";
    }

    return finalResponse;
  } catch (error: any) {
    console.warn(`Gemini Attempt Failed (Retries left: ${retries}):`, error.message);
    const isNetworkError = error.message && (
        error.message.includes("xhr error") ||
        error.message.includes("fetch failed") ||
        error.status === 503 ||
        error.status === 500
    );

    if (isNetworkError && retries > 0) {
        await delay(2000);
        return callGemini(prompt, config, systemInstruction, jsonMode, toolsCallback, mcpClient, conversationHistory, toolEventCallback, retries - 1);
    }
    throw new Error(`Gemini Error: ${error.message || "Unknown error"}`);
  }
};

const callOllama = async (
    prompt: string,
    config: AIConfig,
    systemInstruction?: string,
    jsonMode: boolean = false,
    toolsCallback?: ToolCallback,
    mcpClient?: IMCPClient,
    conversationHistory?: ChatMessage[],
    toolEventCallback?: ToolEventCallback
  ): Promise<string> => {
    const baseUrl = config.baseUrl || 'http://localhost:11434';
    const model = config.model || 'llama3';

    // 从用户配置获取限制，默认 Ollama 模型 (8K)
    const MODEL_LIMIT = config.contextEngine?.modelContextLimit ?? 8192;
    const MAX_OUTPUT_TOKENS = config.contextEngine?.modelOutputLimit ?? 2048;
    const MAX_INPUT_TOKENS = MODEL_LIMIT - MAX_OUTPUT_TOKENS - 500;

    const estimateTokens = (text: string): number => {
      return Math.ceil(text.length / 3);
    };

    const truncateHistoryForOllama = (
      history: ChatMessage[],
      systemPrompt: string,
      currentPrompt: string,
      maxTokens: number
    ): { messages: any[]; truncated: number } => {
      const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
      const currentTokens = estimateTokens(currentPrompt);
      let availableTokens = maxTokens - systemTokens - currentTokens;

      const messages: any[] = [];

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const msgTokens = estimateTokens(content);

        if (availableTokens - msgTokens < 0) {
          return {
            messages: [
              ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
              { role: 'user', content: `[上下文截断 - 已省略 ${i + 1} 条早期消息]\n\n---\n\n${currentPrompt}` }
            ],
            truncated: i + 1
          };
        }

        availableTokens -= msgTokens;

        if (msg.role === 'user') {
          messages.push({ role: 'user', content });
        } else if (msg.role === 'assistant') {
          messages.push({ role: 'assistant', content });
        }
      }

      return { messages, truncated: 0 };
    };

    let messages: any[];
    let truncatedCount = 0;

    if (conversationHistory && conversationHistory.length > 0) {
      const truncationResult = truncateHistoryForOllama(
        conversationHistory,
        systemInstruction || '',
        prompt,
        MAX_INPUT_TOKENS
      );
      messages = truncationResult.messages;
      truncatedCount = truncationResult.truncated;
    } else {
      messages = [];
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
    }

    messages.push({ role: 'user', content: prompt });

    if (truncatedCount > 0) {
      console.warn(`[Ollama] 上下文过长，已截断 ${truncatedCount} 条早期消息`);
    }

    // Define tools
    let tools = undefined;
    if (toolsCallback && !jsonMode) {
        const allTools = mcpClient ? mcpClient.getTools() : [];
        // 根据意图选择工具
        const toolAnalyzer = createToolAnalyzer();
        const analysisResult = toolAnalyzer.analyze(allTools, prompt || '');
        const dynamicTools = toolAnalyzer.selectByIntent(allTools, analysisResult.intent);
        // Map dynamic tools back to OpenAI format for Ollama
        const mappedDynamic = dynamicTools.map(t => ({
             type: 'function',
             function: {
                 name: t.name,
                 description: t.description,
                 parameters: t.parameters
             }
        }));
        tools = [...OPENAI_TOOLS, SEARCH_KNOWLEDGE_BASE_TOOL, ...mappedDynamic];
    }
    const toolAdapter = getToolCallAdapter('ollama');

    let iterations = 0;
    const TOTAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes total timeout
    const SINGLE_ROUND_TIMEOUT_MS = 60 * 1000; // 60 seconds per round
    const startTime = Date.now();

    try {
      while (true) {
        // Check total timeout
        if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
          console.log('[Ollama] Total timeout reached after', iterations, 'iterations');
          return messages[messages.length - 1]?.content || "Total timeout reached (10 minutes).";
        }

        const body: any = {
          model: model,
          messages: messages,
          stream: false,
          format: jsonMode ? 'json' : undefined,
          options: { temperature: config.temperature },
        };

        if (tools) body.tools = tools;

        // Add timeout to fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SINGLE_ROUND_TIMEOUT_MS);

        try {
          const response = await platformFetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) throw new Error(`Ollama Error: ${response.statusText}`);
          const data = await response.json();
          const message = data.message;
          const toolCalls = toolAdapter.parseResponse(data);

          messages.push(message);

          // Check for [TASK_COMPLETE] signal in response
          if (message.content && message.content.includes('[TASK_COMPLETE]')) {
            console.log('[Ollama] Task complete signal detected after', iterations, 'iterations');
            return message.content.replace(/\[TASK_COMPLETE\]/g, '').trim();
          }

          if (toolCalls.length > 0 && toolsCallback) {
            for (const toolCall of toolCalls) {
              const runningCall: ToolCall = {
                ...toolCall,
                status: 'running',
                startTime: Date.now()
              };
              toolEventCallback?.(runningCall);

              try {
                const result = await toolsCallback(toolCall.name, toolCall.args);
                const completedCall: ToolCall = {
                  ...runningCall,
                  status: 'success',
                  result,
                  endTime: Date.now()
                };
                toolEventCallback?.(completedCall);
                const toolResultMessage = toolAdapter.formatResult(toolCall, result);
                messages.push(toolResultMessage as { role: string; content?: string });
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                toolEventCallback?.({
                  ...runningCall,
                  status: 'error',
                  error: errorMessage,
                  endTime: Date.now()
                });
                throw error;
              }
            }
            iterations++;
          } else {
            return message.content || '';
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            console.log('[Ollama] Single round timeout after', iterations, 'iterations');
            return messages[messages.length - 1]?.content || "Single round timeout (60 seconds).";
          }
          throw fetchError;
        }
      }
    } catch (error) { throw new Error("Failed to communicate with Ollama."); }
};
  
const callOpenAICompatible = async (
    prompt: string,
    config: AIConfig,
    systemInstruction?: string,
    jsonMode: boolean = false,
    toolsCallback?: ToolCallback,
    mcpClient?: IMCPClient,
    conversationHistory?: ChatMessage[],
    toolEventCallback?: ToolEventCallback
  ): Promise<string> => {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    // 从用户配置获取限制，默认为 128K
    const MODEL_LIMIT = config.contextEngine?.modelContextLimit ?? 128000;
    const MAX_OUTPUT_TOKENS = config.contextEngine?.modelOutputLimit ?? 4096;
    const MAX_INPUT_TOKENS = MODEL_LIMIT - MAX_OUTPUT_TOKENS - 500;

    const estimateTokens = (text: string): number => {
      return Math.ceil(text.length / 3);
    };

    const truncateHistoryForOpenAI = (
      history: ChatMessage[],
      systemPrompt: string,
      currentPrompt: string,
      maxTokens: number
    ): { messages: any[]; truncated: number } => {
      const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
      const currentTokens = estimateTokens(currentPrompt);
      let availableTokens = maxTokens - systemTokens - currentTokens;

      const messages: any[] = [];

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const msgTokens = estimateTokens(content);

        if (availableTokens - msgTokens < 0) {
          return {
            messages: [
              ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
              { role: 'user', content: `[上下文截断 - 已省略 ${i + 1} 条早期消息]\n\n---\n\n${currentPrompt}` }
            ],
            truncated: i + 1
          };
        }

        availableTokens -= msgTokens;

        if (msg.role === 'user') {
          messages.push({ role: 'user', content });
        } else if (msg.role === 'assistant') {
          messages.push({ role: 'assistant', content });
        }
      }

      return { messages, truncated: 0 };
    };

    let messages: any[];
    let truncatedCount = 0;

    if (conversationHistory && conversationHistory.length > 0) {
      const truncationResult = truncateHistoryForOpenAI(
        conversationHistory,
        systemInstruction || '',
        prompt,
        MAX_INPUT_TOKENS
      );
      messages = truncationResult.messages;
      truncatedCount = truncationResult.truncated;
    } else {
      messages = [];
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
    }

    messages.push({ role: 'user', content: prompt });

    if (truncatedCount > 0) {
      console.warn(`[OpenAI Compatible] 上下文过长，已截断 ${truncatedCount} 条早期消息`);
    }

    let tools: OpenAIToolDefinition[] | undefined;
    if (toolsCallback && !jsonMode) {
        tools = buildOpenAIToolsForPrompt(prompt, mcpClient);
    }
    const toolAdapter = getToolCallAdapter('openai');

    let iterations = 0;
    const TOTAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes total timeout
    const SINGLE_ROUND_TIMEOUT_MS = 60 * 1000; // 60 seconds per round
    const startTime = Date.now();

    try {
      while (true) {
        // Check total timeout
        if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
          console.log('[OpenAI] Total timeout reached after', iterations, 'iterations');
          return messages[messages.length - 1]?.content || "Total timeout reached (10 minutes).";
        }

        const body: any = {
          model: config.model,
          messages: messages,
          temperature: config.temperature,
          response_format: jsonMode ? { type: "json_object" } : undefined
        };

        if (tools) {
           body.tools = tools;
           body.tool_choice = "auto";
        }

        // Add timeout to fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SINGLE_ROUND_TIMEOUT_MS);

        try {
          const response = await platformFetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey || ''}`
            },
            body: JSON.stringify(body),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
          const data = await response.json();
          const choice = data.choices?.[0];
          if (!choice) throw new Error("No choices in response");

          const message = choice.message;
          messages.push(message);

          // Check for [TASK_COMPLETE] signal in response
          if (message.content && message.content.includes('[TASK_COMPLETE]')) {
            console.log('[OpenAI] Task complete signal detected after', iterations, 'iterations');
            return message.content.replace(/\[TASK_COMPLETE\]/g, '').trim();
          }

          const toolCalls = toolAdapter.parseResponse(data);

          if (toolCalls.length > 0 && toolsCallback) {
            for (const toolCall of toolCalls) {
              const runningCall: ToolCall = {
                ...toolCall,
                status: 'running',
                startTime: Date.now()
              };
              toolEventCallback?.(runningCall);

              try {
                const result = await toolsCallback(toolCall.name, toolCall.args);
                const completedCall: ToolCall = {
                  ...runningCall,
                  status: 'success',
                  result,
                  endTime: Date.now()
                };
                toolEventCallback?.(completedCall);

                const toolResultMessage = toolAdapter.formatResult(toolCall, result);
                messages.push(toolResultMessage as { role: string; content?: string; tool_call_id?: string });
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                toolEventCallback?.({
                  ...runningCall,
                  status: 'error',
                  error: errorMessage,
                  endTime: Date.now()
                });
                throw error;
              }
            }
            iterations++;
          } else {
            return message.content || '';
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            console.log('[OpenAI] Single round timeout after', iterations, 'iterations');
            return messages[messages.length - 1]?.content || "Single round timeout (60 seconds).";
          }
          throw fetchError;
        }
      }
    } catch (error: any) { throw new Error(`Failed to connect to AI provider: ${error.message}`); }
};

const callAnthropic = async (
    prompt: string,
    config: AIConfig,
    systemInstruction?: string,
    jsonMode: boolean = false,
    toolsCallback?: ToolCallback,
    mcpClient?: IMCPClient,
    conversationHistory?: ChatMessage[],
    toolEventCallback?: ToolEventCallback
  ): Promise<string> => {
    const baseUrl = config.baseUrl || 'https://api.anthropic.com';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/messages`;

    // 获取模型限制 - 优先使用用户配置
    const MODEL = config.model || 'claude-3-5-sonnet';
    const MODEL_LIMIT = config.contextEngine?.modelContextLimit ?? 200000;
    
    // 🔧 修复: 当 modelOutputLimit 未设置时，自动从 modelContextLimit 计算
    // 通常 max_tokens 约为 context window 的 5-10%
    const MAX_OUTPUT_TOKENS = config.contextEngine?.modelOutputLimit ?? 
                              Math.floor(MODEL_LIMIT * 0.08) ?? 4096;
    
    const RESERVED_BUFFER = 1000;
    const MAX_INPUT_TOKENS = MODEL_LIMIT - MAX_OUTPUT_TOKENS - RESERVED_BUFFER;

    // 调试日志
    console.log('[Anthropic] 配置生效:', {
      modelContextLimit: config.contextEngine?.modelContextLimit,
      modelOutputLimit: config.contextEngine?.modelOutputLimit,
      calculatedMaxTokens: MAX_OUTPUT_TOKENS,
      MODEL
    });

    const estimateTokens = (text: string): number => {
      return Math.ceil(text.length / 3);
    };

    const toApiMessage = (msg: ChatMessage): ApiMessage => ({
      id: msg.id || `msg-${Date.now()}-${Math.random()}`,
      role: msg.role as MessageRole,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      timestamp: msg.timestamp || Date.now(),
    });

    // 从用户配置创建 contextConfig
    const contextConfig: ContextConfig = {
      max_tokens: MODEL_LIMIT,
      reserved_output_tokens: MAX_OUTPUT_TOKENS,
      compact_threshold: config.contextEngine?.compactThreshold ?? 0.85,
      prune_threshold: config.contextEngine?.pruneThreshold ?? 0.70,
      truncate_threshold: config.contextEngine?.truncateThreshold ?? 0.90,
      messages_to_keep: config.contextEngine?.messagesToKeep ?? 3,
      buffer_percentage: 0.10,
      checkpoint_interval: config.contextEngine?.checkpointInterval ?? 20,
    };

    const sessionId = `anthropic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const contextManager = createContextManager(sessionId, contextConfig);

    if (conversationHistory && conversationHistory.length > 0) {
      const apiMessages = conversationHistory.map(toApiMessage);
      contextManager.addMessages(apiMessages);
    }

    // 🔧 修复: 传递 pendingPrompt 以便 context manager 正确计算预算
    const manageResult = await contextManager.manageContext(systemInstruction || '', undefined, prompt);
    const { messages: managedMessages, usage, action, saved_tokens } = manageResult;

    if (saved_tokens && saved_tokens > 0) {
      console.log(`[ContextManager] ${action} saved ~${saved_tokens} tokens`);
    }

    /**
     * 构建符合 Anthropic API 要求的消息数组
     * 规则：
     * 1. system 角色不能在 messages 中（使用顶层 system 参数）
     * 2. 消息必须严格交替：user -> assistant -> user -> assistant...
     * 3. 第一条消息必须是 user
     * 4. tool 角色需要转换为 user 角色的 tool_result，并合并到上一个 user 消息
     */
    const buildApiMessages = (msgs: ApiMessage[]): any[] => {
      // 1. 过滤掉 system 消息
      const filtered = msgs.filter(msg => msg.role !== 'system');

      // 🔧 修复: 确保至少有一条消息，避免空数组发送到 API
      if (filtered.length === 0) {
        console.warn('[Anthropic] buildApiMessages: 所有消息都是 system 角色，返回占位消息');
        return [{ role: 'user', content: '[对话开始]' }];
      }

      const result: any[] = [];
      let lastRole: string | null = null;

      for (const msg of filtered) {
        let role = msg.role;
        let content = msg.content;

        // tool 角色转换为 user（工具调用结果）
        if (role === 'tool') {
          role = 'user';
          // 如果上一条也是 user，合并内容
          if (lastRole === 'user' && result.length > 0) {
            const lastMsg = result[result.length - 1];
            lastMsg.content = lastMsg.content + '\n\n[Tool Result]:\n' + content;
            continue;
          }
        }

        // 检查是否会产生连续相同角色
        if (role === lastRole) {
          // 合并连续相同角色的消息
          if (result.length > 0) {
            const lastMsg = result[result.length - 1];
            lastMsg.content = lastMsg.content + '\n\n' + content;
            continue;
          }
        }

        // 确保第一条消息是 user
        if (result.length === 0 && role === 'assistant') {
          // 插入一个占位 user 消息
          result.push({ role: 'user', content: '[继续之前的对话]' });
        }

        result.push({ role, content });
        lastRole = role;
      }

      // 最终验证：确保消息交替
      const validated: any[] = [];
      for (let i = 0; i < result.length; i++) {
        const msg = result[i];
        if (i === 0) {
          // 第一条必须是 user
          if (msg.role !== 'user') {
            validated.push({ role: 'user', content: '[对话开始]' });
          }
          validated.push(msg);
        } else {
          const lastValidated = validated[validated.length - 1];
          if (msg.role === lastValidated.role) {
            // 合并连续相同角色
            lastValidated.content = lastValidated.content + '\n\n' + msg.content;
          } else {
            validated.push(msg);
          }
        }
      }

      return validated;
    };

    let messagesToSend = buildApiMessages(managedMessages);

    // 🔧 修复: Context manager 现在已经包含 pendingPrompt，所以不再需要二次截断
    // 但保留验证日志以确保一切正常
    const finalCheck = estimateTokens(
      JSON.stringify(messagesToSend) + (systemInstruction || '') + prompt
    );

    if (finalCheck > MAX_INPUT_TOKENS) {
      console.warn(`[Anthropic] 警告: 即使经过 context manager 处理，总 tokens (${finalCheck}) 仍超过限制 (${MAX_INPUT_TOKENS})`);
      console.warn(`[Anthropic] 这可能是因为消息中包含了大量工具输出或长内容`);
      // 不再进行二次截断，因为 context manager 应该已经处理过了
      // 如果仍然超出，可能是配置问题或消息内容异常
    } else {
      console.log(`[Anthropic] ContextManager 处理完成: ${(usage.percentage * 100).toFixed(1)}% (${usage.total}/${usage.limit} tokens)`);
    }

    // 检查最后一条消息是否是 assistant，如果是则直接添加 user 消息
    // 如果是 user，则需要确保不会产生连续 user
    if (messagesToSend.length > 0) {
      const lastMsg = messagesToSend[messagesToSend.length - 1];
      if (lastMsg.role === 'user') {
        // 合并到最后一条 user 消息
        lastMsg.content = lastMsg.content + '\n\n' + prompt;
      } else {
        messagesToSend.push({ role: 'user', content: prompt });
      }
    } else {
      messagesToSend.push({ role: 'user', content: prompt });
    }

    // Build tools array for Anthropic format
    let tools: AnthropicToolDefinition[] | undefined = undefined;
    if (toolsCallback && !jsonMode) {
        const userQuery = prompt || messagesToSend[messagesToSend.length - 1]?.content || '';
        tools = buildAnthropicToolsForPrompt(userQuery, mcpClient);
    }
    const toolAdapter = getToolCallAdapter('anthropic');

    // 发送前验证消息格式
    const validateMessages = (msgs: any[]): { valid: boolean; error?: string } => {
      if (!msgs || msgs.length === 0) {
        return { valid: false, error: '消息数组为空' };
      }

      // 检查第一条消息必须是 user
      if (msgs[0].role !== 'user') {
        return { valid: false, error: `第一条消息必须是 user，当前是 ${msgs[0].role}` };
      }

      // 检查消息交替
      for (let i = 1; i < msgs.length; i++) {
        if (msgs[i].role === msgs[i - 1].role) {
          return {
            valid: false,
            error: `消息 ${i} 和 ${i - 1} 角色相同 (${msgs[i].role})，违反交替规则`
          };
        }
        // 检查角色有效性
        if (!['user', 'assistant'].includes(msgs[i].role)) {
          return {
            valid: false,
            error: `消息 ${i} 角色无效: ${msgs[i].role}，只允许 user 或 assistant`
          };
        }
      }

      return { valid: true };
    };

    // 验证并修复消息
    const validation = validateMessages(messagesToSend);
    if (!validation.valid) {
      console.warn(`[Anthropic] 消息验证失败: ${validation.error}`);
      console.warn('[Anthropic] 当前消息结构:', messagesToSend.map((m, i) => `${i}: ${m.role}`).join(' -> '));

      // 尝试修复：重新构建干净的消息数组
      const fixedMessages: any[] = [];
      for (const msg of messagesToSend) {
        if (!['user', 'assistant'].includes(msg.role)) continue;

        if (fixedMessages.length === 0) {
          if (msg.role === 'user') {
            fixedMessages.push(msg);
          } else {
            fixedMessages.push({ role: 'user', content: '[对话开始]' });
            fixedMessages.push(msg);
          }
        } else {
          const lastRole = fixedMessages[fixedMessages.length - 1].role;
          if (msg.role === lastRole) {
            // 合并相同角色
            fixedMessages[fixedMessages.length - 1].content += '\n\n' + msg.content;
          } else {
            fixedMessages.push(msg);
          }
        }
      }

      if (fixedMessages.length === 0) {
        fixedMessages.push({ role: 'user', content: prompt });
      }

      messagesToSend = fixedMessages;
      console.log('[Anthropic] 消息已修复，新结构:', messagesToSend.map((m, i) => `${i}: ${m.role}`).join(' -> '));
    }

    // 调试日志
    console.log('[Anthropic] 准备发送请求:');
    console.log('[Anthropic]   - 消息数量:', messagesToSend.length);
    console.log('[Anthropic]   - 消息角色序列:', messagesToSend.map(m => m.role).join(' -> '));
    console.log('[Anthropic]   - 工具数量:', tools?.length || 0);

    let iterations = 0;
    const TOTAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes total timeout
    const SINGLE_ROUND_TIMEOUT_MS = 60 * 1000; // 60 seconds per round
    const startTime = Date.now();

    try {
      while (true) {
        // Check total timeout
        if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
          console.log('[Anthropic] Total timeout reached after', iterations, 'iterations');
          return "Total timeout reached (10 minutes).";
        }

        // 🔧 诊断日志：输出完整的请求体信息
        const systemTokenCount = systemInstruction ? estimateTokens(systemInstruction) : 0;
        const messagesTokenCount = estimateTokens(JSON.stringify(messagesToSend));
        let finalSystemInstruction = systemInstruction;
        let finalMessagesToSend = [...messagesToSend];
        let totalTokens = systemTokenCount + messagesTokenCount + MAX_OUTPUT_TOKENS;
        
        console.log('[Anthropic] 请求诊断:');
        console.log('  - 模型:', config.model);
        console.log('  - 模型限制 (MODEL_LIMIT):', MODEL_LIMIT);
        console.log('  - 输出限制 (max_tokens):', MAX_OUTPUT_TOKENS);
        console.log('  - system 消息长度:', systemInstruction?.length || 0, '字符');
        console.log('  - system 消息 tokens:', systemTokenCount);
        console.log('  - messages 数量:', messagesToSend.length);
        console.log('  - messages tokens:', messagesTokenCount);
        console.log('  - 预估总 tokens:', totalTokens);
        console.log('  - 是否超过限制:', totalTokens > MODEL_LIMIT ? '是' : '否');

        // 🔧 修复：如果总 tokens 超过限制，进行截断
        if (totalTokens > MODEL_LIMIT) {
          console.warn('[Anthropic] 上下文过长，尝试截断...');
          
          // 计算可用于 system 和 messages 的空间
          const reservedForOutput = MAX_OUTPUT_TOKENS + 500; // 输出 + 缓冲
          const availableForContent = MODEL_LIMIT - reservedForOutput;
          
          if (availableForContent > 0) {
            // 优先保留 messages，system 可截断
            const maxSystemTokens = Math.floor(availableForContent * 0.3); // system 最多 30%
            const maxMessageTokens = availableForContent - maxSystemTokens;
            
            // 截断 system 消息
            if (systemTokenCount > maxSystemTokens) {
              const maxSystemChars = maxSystemTokens * 3;
              finalSystemInstruction = systemInstruction.slice(0, maxSystemChars) + '\n\n...[系统消息已截断]';
              console.warn('[Anthropic] system 消息截断:', systemTokenCount, '->', maxSystemTokens, 'tokens');
            }
            
            // 如果 messages 仍然过长，从后向前截断
            let currentMessageTokens = 0;
            const truncatedMessages: any[] = [];
            for (let i = finalMessagesToSend.length - 1; i >= 0; i--) {
              const msg = finalMessagesToSend[i];
              const msgTokens = estimateTokens(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));
              
              if (currentMessageTokens + msgTokens <= maxMessageTokens) {
                truncatedMessages.unshift(msg);
                currentMessageTokens += msgTokens;
              } else if (truncatedMessages.length === 0) {
                // 第一条消息就超出限制，强制截断
                const truncatedContent = typeof msg.content === 'string' 
                  ? msg.content.slice(0, maxMessageTokens * 3) + '...[截断]'
                  : JSON.stringify(msg.content).slice(0, maxMessageTokens * 3) + '...[截断]';
                truncatedMessages.unshift({ ...msg, content: truncatedContent });
                currentMessageTokens = maxMessageTokens;
                break;
              } else {
                break; // 空间已满
              }
            }
            finalMessagesToSend = truncatedMessages;
            console.log('[Anthropic] 消息截断后保留:', finalMessagesToSend.length, '条');
          }
          
          // 重新计算
          totalTokens = estimateTokens(finalSystemInstruction || '') + estimateTokens(JSON.stringify(finalMessagesToSend)) + MAX_OUTPUT_TOKENS;
          console.log('[Anthropic] 截断后总 tokens:', totalTokens, '(限制:', MODEL_LIMIT, ')');
        }

        // 检查是否是 MiniMax 模型
        const isMiniMax = (config.model || '').toLowerCase().includes('minimax');
        
        const requestBody: any = {
          model: config.model || 'claude-sonnet-4-20250514',
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: finalMessagesToSend
        };

        // MiniMax 可能需要 OpenAI 兼容格式（将 system 移入 messages）
        if (isMiniMax && finalSystemInstruction) {
          console.log('[Anthropic] 使用 MiniMax 兼容格式 (system 移入 messages)');
          requestBody.messages = [
            { role: 'system', content: finalSystemInstruction },
            ...finalMessagesToSend
          ];
        } else if (finalSystemInstruction) {
          requestBody.system = finalSystemInstruction;
        }

        if (tools && tools.length > 0) {
          requestBody.tools = tools;
        }

        // Add timeout to fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SINGLE_ROUND_TIMEOUT_MS);

        try {
          const response = await platformFetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey || '',
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error?.message || response.statusText;

            // 详细错误日志
            console.error('[Anthropic] API 错误:', response.status, errorMessage);
            console.error('[Anthropic] 请求体预览:', {
              model: requestBody.model,
              max_tokens: requestBody.max_tokens,
              messages_count: requestBody.messages?.length,
              messages_roles: requestBody.messages?.map((m: any) => m.role),
              has_system: !!requestBody.system,
              tools_count: requestBody.tools?.length
            });

            if (response.status === 400 && errorMessage.includes('context window exceeds limit')) {
              throw new Error(`上下文窗口超出限制 (${MODEL_LIMIT} tokens)。请尝试清除对话历史或减少消息长度。当前消息可能过长。`);
            }

            if (response.status === 400 && errorMessage.includes('invalid chat setting')) {
              throw new Error(`消息格式错误: ${errorMessage}。当前消息序列: ${messagesToSend.map(m => m.role).join(' -> ')}`);
            }

            throw new Error(`Anthropic API Error: ${response.status} ${errorMessage}`);
          }

          const data = await response.json();
          const toolCalls = toolAdapter.parseResponse(data);
          const textBlocks = data.content?.filter((block: any) => block.type === 'text') || [];

          // Check for [TASK_COMPLETE] signal in text response
          const responseText = textBlocks.map((b: any) => b.text).join('');
          if (responseText.includes('[TASK_COMPLETE]')) {
            console.log('[Anthropic] Task complete signal detected after', iterations, 'iterations');
            return responseText.replace(/\[TASK_COMPLETE\]/g, '').trim();
          }

          if (toolCalls.length > 0 && toolsCallback) {
            // Add assistant message with tool use to history
            messagesToSend.push({
              role: 'assistant',
              content: data.content
            });

            // Execute tools and build tool results
            const toolResults: unknown[] = [];
            for (const toolCall of toolCalls) {
              const runningCall: ToolCall = {
                ...toolCall,
                status: 'running',
                startTime: Date.now()
              };
              toolEventCallback?.(runningCall);

              try {
                const result = await toolsCallback(toolCall.name, toolCall.args);
                const completedCall: ToolCall = {
                  ...runningCall,
                  status: 'success',
                  result,
                  endTime: Date.now()
                };
                toolEventCallback?.(completedCall);

                const toolResultMessage = toolAdapter.formatResult(toolCall, result);
                if (typeof toolResultMessage === 'object' && toolResultMessage !== null) {
                  const messageRecord = toolResultMessage as Record<string, unknown>;
                  const contentBlocks = messageRecord.content;
                  if (Array.isArray(contentBlocks)) {
                    toolResults.push(...contentBlocks);
                  } else {
                    toolResults.push(toolResultMessage);
                  }
                }
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                toolEventCallback?.({
                  ...runningCall,
                  status: 'error',
                  error: errorMessage,
                  endTime: Date.now()
                });
                throw error;
              }
            }

            // Add tool results as user message
            messagesToSend.push({
              role: 'user',
              content: toolResults
            });

            iterations++;
            // Continue loop
          } else {
            // Extract text from response
            return responseText;
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            console.log('[Anthropic] Single round timeout after', iterations, 'iterations');
            return "Single round timeout (60 seconds).";
          }
          throw fetchError;
        }
      }
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      
      if (errorMsg.includes('context window exceeds limit') || errorMsg.includes('上下文窗口')) {
        console.warn('[Anthropic] 触发紧急截断重试');
        
        try {
          const emergencyMessages = conversationHistory?.slice(-2) || [];
          
          // 🔧 修复: 确保 emergencyMessages 不为空
          if (emergencyMessages.length === 0) {
            console.warn('[Anthropic] 紧急重试: conversationHistory 为空，添加占位消息');
            emergencyMessages.push({
              id: `emergency-${Date.now()}`,
              role: 'user',
              content: '[对话继续]',
              timestamp: Date.now(),
            });
          }
          
          const emergencyApiMessages = emergencyMessages.map(toApiMessage);
          
          const emergencyContextManager = createContextManager(`emergency-${sessionId}`, contextConfig);
          emergencyContextManager.addMessages(emergencyApiMessages);
          
          const { messages: managedEmergencyMessages } = await emergencyContextManager.manageContext(systemInstruction || '');
          let emergencyMessagesToSend = buildApiMessages(managedEmergencyMessages);
          
          // 🔧 修复: 确保 emergencyMessagesToSend 不为空
          if (emergencyMessagesToSend.length === 0) {
            console.warn('[Anthropic] 紧急重试: buildApiMessages 返回空数组，使用占位消息');
            emergencyMessagesToSend = [{ role: 'user', content: '[对话继续]' }];
          }
          
          emergencyMessagesToSend.push({ role: 'user', content: prompt });
          
          const response = await platformFetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey || '',
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: MAX_OUTPUT_TOKENS,
              messages: emergencyMessagesToSend,
              system: systemInstruction,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`[紧急重试] Anthropic API Error: ${response.status} ${errorData.error?.message || response.statusText}`);
          }

          const data = await response.json();
          const textBlocks = data.content?.filter((block: any) => block.type === 'text') || [];
          return textBlocks.map((b: any) => b.text).join('');
        } catch (retryError: any) {
          throw new Error(`上下文窗口超出限制且紧急重试失败: ${retryError.message}`);
        }
      }
      
      throw new Error(`Anthropic API Error: ${errorMsg}`);
    }
};

export const polishContent = async (content: string, config: AIConfig): Promise<string> => {
  const defaultPrompt = "You are an expert technical editor. Improve the provided Markdown content for clarity, grammar, and flow. Return only the polished Markdown.";
  const systemPrompt = config.customPrompts?.polish || defaultPrompt;
  // Disable tools for content processing - no MCP/file operations needed
  return generateAIResponse(content, config, systemPrompt, false, [], undefined, undefined, undefined, true);
};

export const expandContent = async (content: string, config: AIConfig): Promise<string> => {
  const defaultPrompt = "You are a creative technical writer. Expand on the provided Markdown content, adding relevant details, examples, or explanations. Return only the expanded Markdown.";
  const systemPrompt = config.customPrompts?.expand || defaultPrompt;
  // Disable tools for content processing - no MCP/file operations needed
  return generateAIResponse(content, config, systemPrompt, false, [], undefined, undefined, undefined, true);
};

export const generateKnowledgeGraph = async (files: MarkdownFile[], config: AIConfig): Promise<GraphData> => {
  const combinedContent = files.map(f => `<<< FILE_START: ${f.name} >>>\n${f.content}\n<<< FILE_END >>>`).join('\n\n');

  // 从用户配置获取限制，Gemini 使用完整上下文，其他模型使用配置的 1/10
  const contextLimit = config.contextEngine?.modelContextLimit ?? 200000;
  const limit = config.provider === 'gemini' ? contextLimit : Math.floor(contextLimit / 10);

  const prompt = `Task: Generate a comprehensive Knowledge Graph from the provided notes.
  Goal: Identify granular concepts (entities) and their inter-relationships across the entire knowledge base.

  CRITICAL: Output ONLY valid JSON. No explanations, no markdown, no extra text.

  JSON Structure:
  {
    "nodes": [
      {"id": "unique_id_1", "label": "Concept Name", "val": 5, "group": 1},
      {"id": "unique_id_2", "label": "Another Concept", "val": 3, "group": 0}
    ],
    "links": [
      {"source": "unique_id_1", "target": "unique_id_2", "relationship": "relates to"}
    ]
  }

  Rules:
  - "id" must be unique string identifiers
  - "label" is the display text (2-5 words max)
  - "val" is importance weight (1-10)
  - "group" is 1 for core concepts, 0 for entities
  - Generate at least 10 nodes with meaningful connections

  Content to Analyze:
  ${combinedContent.substring(0, limit)}`;

  const systemPrompt = "You are an expert Knowledge Graph Architect. Output ONLY valid JSON. No explanations or markdown code blocks.";

  try {
    const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
    let cleanedJson = extractJson(jsonStr);

    // Additional JSON cleaning: fix common AI mistakes
    // Remove trailing commas before ] or }
    cleanedJson = cleanedJson.replace(/,(\s*[}\]])/g, '$1');
    // Fix missing quotes around keys
    cleanedJson = cleanedJson.replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    const parsed = JSON.parse(cleanedJson) as GraphData;

    // Validate and sanitize nodes
    if (!parsed.nodes || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
      throw new Error("No valid nodes in response");
    }

    parsed.nodes = parsed.nodes.map((n, idx) => ({
      ...n,
      id: n.id || n.label || `node-${idx}`,
      label: n.label || n.id || `Node ${idx}`,
      val: n.val || 5,
      group: n.group || 0
    }));

    parsed.links = (parsed.links || []).filter(l => l.source && l.target);

    return parsed;
  } catch (e) {
    console.warn("Graph Generation failed, using fallback:", e);
    // Create a more meaningful fallback based on file names
    const nodes = files.map((f, idx) => ({
      id: `file-${idx}`,
      label: f.name.replace(/\.[^/.]+$/, ''),
      val: 5,
      group: 1
    }));
    return { nodes, links: [] };
  }
};

export const synthesizeKnowledgeBase = async (files: MarkdownFile[], config: AIConfig): Promise<string> => {
  const combinedContent = files.map(f => `--- File: ${f.name} ---\n${f.content}`).join('\n\n');
  
  // 从用户配置获取限制
  const contextLimit = config.contextEngine?.modelContextLimit ?? 200000;
  const limit = config.provider === 'gemini' ? contextLimit : Math.floor(contextLimit / 6);
  
  const prompt = `Read the notes. Organize info. Synthesize key findings. Produce a Master Summary in Markdown.\nNotes:\n${combinedContent.substring(0, limit)}`;
  return generateAIResponse(prompt, config, "You are a Knowledge Manager.");
};

export const generateMindMap = async (content: string, config: AIConfig): Promise<string> => {
  // 从用户配置获取限制
  const contextLimit = config.contextEngine?.modelContextLimit ?? 200000;
  const limit = config.provider === 'gemini' ? contextLimit : Math.floor(contextLimit / 10);

  const prompt = `Generate a Mermaid.js mind map from the content below.

CRITICAL INSTRUCTIONS:
1. Output ONLY the Mermaid mindmap code - NO explanations, NO descriptions, NO markdown formatting
2. Start with exactly "mindmap" on the first line
3. Use ((Root Topic)) for the root node (double parentheses = circle)
4. Use (Child Node) for all other nodes (single parentheses = rounded rectangle)
5. Use 2-space indentation for hierarchy
6. Keep labels short (2-5 words max)
7. No special characters in labels: no (), #, :, **, *

Example output format:
mindmap
  ((Main Topic))
    (Branch A)
      (Item A1)
      (Item A2)
    (Branch B)
      (Item B1)

Content to analyze:
${content.substring(0, limit)}`;

  const systemPrompt = "Output ONLY valid Mermaid mindmap code. No explanations. Start with 'mindmap' on line 1.";

  const result = await generateAIResponse(prompt, config, systemPrompt, false);

  // Extract only the mindmap code - remove any explanatory text
  let mermaidCode = extractMermaidMindmap(result);

  return mermaidCode;
};

// Helper function to extract mindmap code from AI response
const extractMermaidMindmap = (text: string): string => {
  // Try to find mindmap block in code fence
  const codeFenceMatch = text.match(/```(?:mermaid)?\s*\n?(mindmap[\s\S]*?)```/i);
  if (codeFenceMatch) {
    return sanitizeMindmap(codeFenceMatch[1].trim());
  }

  // Try to find mindmap starting point
  const lines = text.split('\n');
  let mindmapStartIdx = -1;
  let mindmapEndIdx = lines.length;

  // Find where mindmap starts
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim().toLowerCase();
    if (trimmed === 'mindmap') {
      mindmapStartIdx = i;
      break;
    }
  }

  if (mindmapStartIdx === -1) {
    // No mindmap found, return empty with just the declaration
    return 'mindmap\n  ((Content))\n    (No valid mindmap generated)';
  }

  // Find where mindmap ends (look for explanatory text)
  for (let i = mindmapStartIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Skip empty lines and valid mindmap content
    if (trimmed === '' || trimmed.match(/^[\s]*([\(\[]|\)|\])/) || trimmed.match(/^\s+\(/)) {
      continue;
    }
    // If line doesn't look like mindmap content (no indentation + parentheses pattern)
    if (!trimmed.startsWith('(') && !trimmed.startsWith('[') && !lines[i].match(/^\s{2,}/)) {
      // Check if it's explanatory text
      if (trimmed.match(/^(This|The|I |Here|Note|Example|---|###|##|#|\*\*|1\.|2\.)/i)) {
        mindmapEndIdx = i;
        break;
      }
    }
  }

  const mindmapLines = lines.slice(mindmapStartIdx, mindmapEndIdx);
  return sanitizeMindmap(mindmapLines.join('\n'));
};

// Sanitize mindmap content
const sanitizeMindmap = (code: string): string => {
  const lines = code.split('\n');
  const sanitizedLines: string[] = [];
  let foundMindmap = false;

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    // Only allow one 'mindmap' declaration
    if (trimmed === 'mindmap') {
      if (!foundMindmap) {
        foundMindmap = true;
        sanitizedLines.push('mindmap');
      }
      continue;
    }

    // Skip empty lines before mindmap
    if (!foundMindmap && trimmed === '') continue;

    // Skip lines that look like explanations
    if (line.trim().match(/^(This|The|I |Here|Note|Example|---|###|##|#|\*\*|1\.|2\.)/i)) {
      continue;
    }

    // Skip code fence markers
    if (line.trim().startsWith('```')) continue;

    // Sanitize the line
    let sanitizedLine = line;

    // Replace Chinese parentheses
    sanitizedLine = sanitizedLine.replace(/（/g, '(').replace(/）/g, ')');

    // Clean content inside parentheses
    sanitizedLine = sanitizedLine.replace(/\(\(([^)]+)\)\)/g, (match, content) => {
      const cleanContent = content.replace(/[()（）#:：\*\_]/g, ' ').replace(/\s+/g, ' ').trim();
      return `((${cleanContent}))`;
    });
    sanitizedLine = sanitizedLine.replace(/\(([^()]+)\)/g, (match, content) => {
      const cleanContent = content.replace(/[()（）#:：\*\_]/g, ' ').replace(/\s+/g, ' ').trim();
      return `(${cleanContent})`;
    });

    sanitizedLines.push(sanitizedLine);
  }

  // Ensure mindmap declaration exists
  if (!foundMindmap) {
    sanitizedLines.unshift('mindmap');
  }

  return sanitizedLines.join('\n');
};

// Quiz question validation and normalization helper
const validateAndFixQuestion = (q: any, index: number, prefix: string): QuizQuestion | null => {
    // Skip if no question text
    if (!q || !q.question || q.question.trim().length === 0) {
        return null;
    }

    // Normalize type field
    const validTypes = ['single', 'multiple', 'fill_blank', 'text'];
    let type = q.type?.toLowerCase() || 'single';
    if (!validTypes.includes(type)) {
        // Infer type from structure
        if (q.options && Array.isArray(q.options) && q.options.length >= 2) {
            type = Array.isArray(q.correctAnswer) ? 'multiple' : 'single';
        } else {
            type = 'text';
        }
    }

    // For choice questions, validate options array
    if (type === 'single' || type === 'multiple') {
        if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
            // Convert to text question if options are invalid
            type = 'text';
        }
    }

    // Normalize correctAnswer to numeric index for choice questions
    let correctAnswer = q.correctAnswer;
    if ((type === 'single' || type === 'multiple') && q.options?.length > 0) {
        correctAnswer = normalizeAnswerToIndex(q.correctAnswer, q.options, type);
    }

    return {
        id: `${prefix}-${index}`,
        type: type as 'single' | 'multiple' | 'text' | 'fill_blank',
        question: q.question.trim(),
        options: (type === 'single' || type === 'multiple') ? q.options : undefined,
        correctAnswer,
        explanation: q.explanation,
        timesUsed: 0,
        successRate: 0
    };
};

// Convert various answer formats to numeric index
const normalizeAnswerToIndex = (answer: any, options: string[], type: string): number | number[] => {
    const letterToIndex: { [key: string]: number } = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5 };
    const chineseToIndex: { [key: string]: number } = { '一': 0, '二': 1, '三': 2, '四': 3 };

    const parseOne = (val: any): number => {
        // Already a number
        if (typeof val === 'number') {
            return Math.min(Math.max(0, Math.floor(val)), options.length - 1);
        }

        const str = String(val).trim().toUpperCase();

        // Letter format: "A", "B", "C", "D"
        if (letterToIndex[str] !== undefined) {
            return letterToIndex[str];
        }

        // Numeric string: "0", "1", "2", "3"
        const num = parseInt(str, 10);
        if (!isNaN(num) && num >= 0 && num < options.length) {
            return num;
        }

        // Chinese format: "一", "二"
        if (chineseToIndex[str] !== undefined) {
            return chineseToIndex[str];
        }

        // Match option text
        const idx = options.findIndex(opt => opt.trim().toLowerCase() === str.toLowerCase());
        if (idx !== -1) return idx;

        // Default to 0
        return 0;
    };

    if (type === 'multiple') {
        if (Array.isArray(answer)) {
            return [...new Set(answer.map(parseOne))].sort();
        }
        // Handle comma-separated: "A,C" or "0,2"
        if (typeof answer === 'string' && answer.includes(',')) {
            return [...new Set(answer.split(',').map(s => parseOne(s.trim())))].sort();
        }
        return [parseOne(answer)];
    }

    return parseOne(answer);
};

const generateQuestionsFromChunks = async (content: string, config: AIConfig): Promise<QuizQuestion[]> => {
    const langPrompt = config.language === 'zh'
        ? "用中文生成题目和选项。"
        : "Generate questions and options in English.";

    // Unified quiz generation prompt with strict format requirements
    const quizPrompt = (text: string, count: string) => `Task: Generate ${count} quiz questions from the given text.

CRITICAL RULES - MUST FOLLOW:

1. Generate a MIX of 4 question types with this distribution:
   - "single": 40% - Single choice (4 options, ONE correct answer)
   - "multiple": 20% - Multiple choice (4 options, 2-3 correct answers)
   - "fill_blank": 20% - Fill-in-the-blank (exact short answer, 1-5 words)
   - "text": 20% - Essay question (requires paragraph answer)

2. JSON Structure for EACH question:
{
  "type": "single" | "multiple" | "fill_blank" | "text",
  "question": "Question text here",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": 0 | [0,2] | "exact answer" | "key points"
}

3. correctAnswer Format (IMPORTANT - USE NUMERIC INDEX 0-3):
   - "single": Integer 0-3 (0=first option, 1=second option, etc.)
   - "multiple": Array of integers, e.g. [0, 2] means first and third options
   - "fill_blank": Exact string answer (1-5 words)
   - "text": Key points string for grading reference

4. MANDATORY REQUIREMENTS:
   - For "single" and "multiple" types: ALWAYS include "options" array with exactly 4 items
   - For "fill_blank": Answer should be a short, specific term from the text
   - For "text": Answer should list key points that a good answer should cover

5. ${langPrompt}

Text Content:
"${text}"

Output: Valid JSON Array (no markdown, no code blocks, just pure JSON array)`;

    // For short content (< 500 chars), generate directly
    if (content.length < 500) {
        const prompt = quizPrompt(content, "2-4");
        const systemPrompt = "You are an expert Quiz Designer. Create diverse, insightful questions. Return ONLY a valid JSON array, no other text.";

        try {
            const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
            const parsed = JSON.parse(extractJson(jsonStr));
            const questions = Array.isArray(parsed) ? parsed : [];

            const validQuestions = questions
                .map((q: any, i: number) => validateAndFixQuestion(q, i, 'gen-q-short'))
                .filter((q): q is QuizQuestion => q !== null);

            if (validQuestions.length === 0) {
                throw new Error("AI generated response but no valid questions were found. The content may be too short or not suitable for quiz generation.");
            }
            return validQuestions;
        } catch (e: any) {
            console.error("Short content quiz generation failed:", e);
            throw new Error(`Quiz generation failed for short content: ${e.message || 'Unknown error'}`);
        }
    }

    // For longer content, use chunking approach
    const idealChunkSize = Math.max(500, Math.min(2000, Math.ceil(content.length / 15)));
    const chunks = chunkText(content, idealChunkSize, 100).slice(0, 15);
    const systemPrompt = "You are an expert Quiz Designer. Create diverse questions with proper type distribution. Return ONLY a valid JSON array.";

    const questionsPromises = chunks.map(async (chunk, index) => {
        const prompt = quizPrompt(chunk, "1-3");
        try {
            await delay(index * 100);
            const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
            const parsed = JSON.parse(extractJson(jsonStr));
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error(`Chunk ${index} quiz generation failed:`, e);
            return [];
        }
    });

    const results = await Promise.all(questionsPromises);
    const flatQuestions: QuizQuestion[] = [];

    results.forEach((batch, batchIdx) => {
        batch.forEach((q: any, qIdx: number) => {
            const validated = validateAndFixQuestion(q, qIdx, `gen-q-${batchIdx}`);
            if (validated) {
                flatQuestions.push(validated);
            }
        });
    });

    if (flatQuestions.length === 0) {
        throw new Error(`Failed to generate quiz questions. Possible reasons: AI response was invalid, content is not suitable for quiz generation, or API call failed. Please check your AI configuration and try again.`);
    }

    return flatQuestions;
};

export const extractQuizFromRawContent = async (content: string, config: AIConfig): Promise<Quiz> => {
   // Enhanced Regex to detect STRONG question markers (not just numbered lists)
   // Matches: "Q1.", "Q1:", "Question 1", "问题1", "第1题", etc.
   // NOTE: Removed isStandardList check - numbered lists like "1. xxx" are common in notes and don't indicate quiz content
   const strongQuestionPattern = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:Q\s*\d+|Question\s*\d+|问题\s*\d+|第\s*\d+\s*[题问])[:.．\s]/i;

   // Also check for option patterns like "A.", "A)", "(A)" which strongly indicate quiz content
   const optionPattern = /(?:^|\n)\s*[A-Da-d][.）)]\s+\S/;

   const hasStrongQuestionMarker = strongQuestionPattern.test(content);
   const hasOptions = optionPattern.test(content);

    // Only try to extract if we have STRONG indicators of quiz content
    if (hasStrongQuestionMarker || hasOptions) {
        // 从用户配置获取限制
        const contextLimit = config.contextEngine?.modelContextLimit ?? 200000;
        const limit = config.provider === 'gemini' ? contextLimit : Math.floor(contextLimit / 4);

        const prompt = `Task: Extract ALL questions from the provided text verbatim into a JSON format.

       Rules:
       1. Preserve the exact text of questions and options.
       2. If options are present (A, B, C, D), extract them into the "options" array.
       3. If a correct answer is marked or implied, include it in "correctAnswer".
       4. Return a valid JSON Object with a "questions" array.
       5. If there are NO actual quiz questions in the text, return {"questions": []}

       Text Content:
       ${content.substring(0, limit)}`;

       const jsonStr = await generateAIResponse(prompt, config, "You are a Data Extractor. Extract questions exactly as they appear. Return JSON.", true);
       const result = JSON.parse(extractJson(jsonStr));

       // Handle cases where AI returns array directly vs object wrapper
       const questions = Array.isArray(result) ? result : (result.questions || []);

        // If extraction found valid questions, return them
        if (questions.length > 0) {
            return {
                id: `quiz-extracted-${Date.now()}`,
                title: "Extracted Quiz",
                description: "Extracted from current file.",
                questions: questions.map((q: any, i: number) => ({
                    ...q,
                    id: q.id || `ext-${i}`,
                    type: q.options && q.options.length > 0 ? 'single' : 'text',
                    timesUsed: 0,
                    successRate: 0
                })),
                isGraded: false
            };
        }
       // If extraction returned empty, fall through to generation mode
       console.log('[Quiz] Extraction returned no questions, falling back to generation mode');
   }

   // Fallback: Generate NEW questions from the content notes
   {
       // Fallback: Generate NEW questions from the content notes
       try {
           const questions = await generateQuestionsFromChunks(content, config);
           // 验证题目数组非空（generateQuestionsFromChunks 已经会抛出错误，这是双重保护）
           if (questions.length === 0) {
               throw new Error("No questions generated. The AI did not return any valid questions.");
           }
           return {
               id: `quiz-gen-${Date.now()}`,
               title: "Generated Quiz",
               description: "Generated from notes.",
               questions,
               isGraded: false
           };
       } catch (e: any) {
           // 重新抛出错误，附加上下文信息
           throw new Error(`Quiz generation failed: ${e.message || 'Unknown error'}`);
       }
   }
};

export const generateQuiz = async (content: string, config: AIConfig): Promise<Quiz> => {
  // Smart Switch: If content already looks like a quiz, extract it instead of generating new questions about it
  return extractQuizFromRawContent(content, config);
};

export const gradeQuizQuestion = async (question: string, userAnswer: string, context: string, config: AIConfig): Promise<{isCorrect: boolean, explanation: string}> => {
  const prompt = `Grade User Answer.\nQuestion: ${question}\nUser: ${userAnswer}\nContext: ${context.substring(0, 50000)}\nReturn JSON {isCorrect, explanation}`;
  const jsonStr = await generateAIResponse(prompt, config, "Strict Teacher. Valid JSON.", true);
  return JSON.parse(extractJson(jsonStr));
};

export const generateQuizExplanation = async (question: string, correctAnswer: string, userAnswer: string, context: string, config: AIConfig): Promise<string> => {
  const isZh = config.language === 'zh';

  const prompt = isZh
    ? `为以下测验题目提供解释：

问题：${question}
正确答案：${correctAnswer}
用户答案：${userAnswer}

请按以下格式回答（简洁明了，不超过150字）：
1. 首先明确说出正确答案是什么
2. 简要解释为什么这个答案是正确的
3. 如果用户答错了，指出错误原因

参考资料：${context.substring(0, 30000)}`
    : `Provide explanation for this quiz question:

Question: ${question}
Correct Answer: ${correctAnswer}
User's Answer: ${userAnswer}

Format your response (concise, max 150 words):
1. First, clearly state what the correct answer is
2. Briefly explain why this is the correct answer
3. If the user was wrong, point out why their answer was incorrect

Reference: ${context.substring(0, 30000)}`;

  const systemPrompt = isZh
    ? "你是一位简洁明了的老师。先给出正确答案，再简短解释。不要罗嗦。"
    : "You are a concise tutor. State the correct answer first, then explain briefly. Be direct.";

  return generateAIResponse(prompt, config, systemPrompt);
};

// ========================
// Context Engineering Integration
// ========================

// P0 Performance Optimization: LRU Cache for Context Managers
// Prevent sessionContextManagers from growing indefinitely

interface ContextManagerEntry {
  manager: ContextManager;
  lastAccessed: number;
}

class LRUSessionCache {
  private cache: Map<string, ContextManagerEntry>;
  private maxSize: number;
  private maxAge: number; // milliseconds

  constructor(maxSize: number = 50, maxAgeMinutes: number = 30) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.maxAge = maxAgeMinutes * 60 * 1000;
  }

  get(sessionId: string): ContextManager | undefined {
    const entry = this.cache.get(sessionId);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() - entry.lastAccessed > this.maxAge) {
      this.cache.delete(sessionId);
      return undefined;
    }

    // Update access time (move to end)
    entry.lastAccessed = Date.now();
    this.cache.delete(sessionId);
    this.cache.set(sessionId, entry);

    return entry.manager;
  }

  set(sessionId: string, manager: ContextManager): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      const oldest = this.cache.get(oldestKey);
      if (oldest && Date.now() - oldest.lastAccessed > this.maxAge) {
        // Only remove if expired, otherwise keep it
        this.cache.delete(oldestKey);
      } else {
        // Force remove oldest even if not expired
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(sessionId, {
      manager,
      lastAccessed: Date.now()
    });
  }

  delete(sessionId: string): boolean {
    return this.cache.delete(sessionId);
  }

  clear(): void {
    this.cache.clear();
  }

  stats(): { size: number; maxSize: number; oldestAge: number | null } {
    let oldestAge: number | null = null;
    if (this.cache.size > 0) {
      const oldest = Array.from(this.cache.values())
        .reduce((min, entry) => Math.min(min, Date.now() - entry.lastAccessed), Infinity);
      oldestAge = oldest;
    }
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      oldestAge
    };
  }
}

// Global session cache with 50 sessions, 30 minutes expiry
const sessionContextCache = new LRUSessionCache(50, 30);

// Legacy map for backward compatibility during migration
const sessionContextManagers: Map<string, ContextManager> = new Map();

export function getContextManager(sessionId: string): ContextManager {
  // Try new cache first
  let manager = sessionContextCache.get(sessionId);
  
  // Fallback to legacy map during migration
  if (!manager) {
    manager = sessionContextManagers.get(sessionId);
    if (!manager) {
      manager = createContextManager(sessionId);
    }
  }
  
  // Update both caches
  sessionContextCache.set(sessionId, manager);
  sessionContextManagers.set(sessionId, manager);
  
  return manager;
}

export function createContextManagerForSession(
  sessionId: string,
  config?: Partial<ContextConfig>
): ContextManager {
  const manager = createContextManager(sessionId, config);
  
  // Update both caches
  sessionContextCache.set(sessionId, manager);
  sessionContextManagers.set(sessionId, manager);
  
  return manager;
}

export function removeContextManager(sessionId: string): void {
  sessionContextCache.delete(sessionId);
  sessionContextManagers.delete(sessionId);
}

export function clearAllContextManagers(): void {
  sessionContextCache.clear();
  sessionContextManagers.clear();
}

export function getContextCacheStats(): { cache: { size: number; maxSize: number; oldestAge: number | null } } {
  return {
    cache: sessionContextCache.stats()
  };
}

export async function manageContextForSession(
  sessionId: string,
  systemPrompt: string,
  aiCompactFn?: (content: string) => Promise<string>
): Promise<{ messages: ApiMessage[]; usage: TokenUsage; action: string; savedTokens?: number }> {
  const manager = getContextManager(sessionId);
  const result = await manager.manageContext(systemPrompt, aiCompactFn);
  return {
    messages: result.messages,
    usage: result.usage,
    action: result.action,
    savedTokens: result.saved_tokens,
  };
}

export function addMessageToContext(
  sessionId: string,
  message: ApiMessage
): void {
  const manager = getContextManager(sessionId);
  manager.addMessage(message);
}

export function addMessagesToContext(
  sessionId: string,
  messages: ApiMessage[]
): void {
  const manager = getContextManager(sessionId);
  manager.addMessages(messages);
}

export async function getContextMessages(
  sessionId: string
): Promise<ApiMessage[]> {
  const manager = getContextManager(sessionId);
  return manager.getMessages();
}

export async function getEffectiveContextHistory(
  sessionId: string
): Promise<ApiMessage[]> {
  const manager = getContextManager(sessionId);
  return manager.getEffectiveHistory();
}

export async function analyzeContextUsage(
  sessionId: string,
  systemPrompt: string
): Promise<{ usage: TokenUsage; status: ReturnType<TokenBudget['checkThresholds']> }> {
  const manager = getContextManager(sessionId);
  return manager.analyzeUsage(systemPrompt);
}

export async function createContextCheckpoint(
  sessionId: string,
  name?: string
): Promise<Checkpoint> {
  const manager = getContextManager(sessionId);
  return manager.createCheckpoint(name);
}

export function clearContext(sessionId: string): void {
  const manager = sessionContextManagers.get(sessionId);
  if (manager) {
    manager.clear();
  }
}

export function convertChatMessageToApiMessage(msg: ChatMessage): ApiMessage {
  return {
    id: msg.id,
    role: msg.role as ApiMessage['role'],
    content: msg.content,
    timestamp: msg.timestamp,
    tool_call_id: msg.tool_call_id,
  };
}

export function convertApiMessageToChatMessage(msg: ApiMessage): ChatMessage {
  return {
    id: msg.id,
    role: msg.role === 'system' ? 'assistant' : msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
  };
}

export async function compactConversationWithContext(
  sessionId: string,
  systemPrompt: string,
  config: AIConfig
): Promise<{ compactedMessages: ApiMessage[]; summary: string }> {
  const manager = getContextManager(sessionId);
  const messages = manager.getMessages();

  if (messages.length <= 4) {
    return { compactedMessages: messages, summary: '' };
  }

  const recentMessages = messages.slice(-4);
  const toCompact = messages.slice(0, messages.length - 4);

  const conversationText = toCompact
    .map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
    .join('\n\n');

  const prompt = `将以下对话历史压缩为简洁摘要，保留关键信息和决策（200字以内）：

${conversationText}`;

  const summary = await generateAIResponse(
    prompt,
    config,
    "你是对话摘要助手。用中文回复，输出纯文本摘要，不要JSON或markdown格式。",
    false,
    [],
    undefined,
    undefined,
    undefined,
    true
  );

  const summaryMessage: ApiMessage = {
    id: `compact-${Date.now()}`,
    role: 'system',
    content: `**[对话摘要]**\n${summary}`,
    timestamp: Date.now(),
  };

  for (let i = 0; i < toCompact.length; i++) {
    toCompact[i] = {
      ...toCompact[i],
      compressed: true,
      compression_type: 'compacted',
      condense_id: summaryMessage.id,
    };
  }

  const compactedMessages = [summaryMessage, ...recentMessages];
  manager.setMessages(compactedMessages);

  return { compactedMessages, summary };
}

// ========================
// Context Persistence (Phase 2)
// ========================

interface CheckpointStorage {
  saveCheckpoint(checkpoint: Checkpoint, messages: ApiMessage[]): Promise<void>;
  getCheckpoint(checkpointId: string): Promise<{ checkpoint: Checkpoint; messages: ApiMessage[] } | null>;
  listCheckpoints(sessionId: string): Promise<Checkpoint[]>;
  deleteCheckpoint(checkpointId: string): Promise<boolean>;
  saveCompactedSession(session: CompactedSession): Promise<void>;
  getCompactedSessions(sessionId: string): Promise<CompactedSession[]>;
}

let globalCheckpointStorage: CheckpointStorage | null = null;

export function setGlobalCheckpointStorage(storage: CheckpointStorage): void {
  globalCheckpointStorage = storage;
}

export function getGlobalCheckpointStorage(): CheckpointStorage | null {
  return globalCheckpointStorage;
}

export function enableContextPersistence(
  sessionId: string,
  autoSave: boolean = true
): void {
  const manager = getContextManager(sessionId);
  if (globalCheckpointStorage) {
    manager.enablePersistence(globalCheckpointStorage, autoSave);
  }
}

export function disableContextPersistence(sessionId: string): void {
  const manager = sessionContextManagers.get(sessionId);
  if (manager) {
    manager.disablePersistence();
  }
}

export async function restoreContextFromCheckpoint(
  sessionId: string,
  checkpointId: string
): Promise<boolean> {
  const manager = getContextManager(sessionId);
  return manager.restoreFromCheckpoint(checkpointId);
}

export async function getContextCheckpoints(
  sessionId: string
): Promise<Checkpoint[]> {
  const manager = getContextManager(sessionId);
  return manager.listCheckpoints();
}

export async function deleteContextCheckpoint(
  checkpointId: string
): Promise<boolean> {
  const storage = globalCheckpointStorage;
  if (!storage) return false;
  return storage.deleteCheckpoint(checkpointId);
}

export async function saveCompactedSession(
  sessionId: string,
  summary: string,
  keyTopics: string[],
  decisions: string[],
  messageStart: number,
  messageEnd: number
): Promise<void> {
  const storage = globalCheckpointStorage;
  if (!storage) return;

  const session: CompactedSession = {
    id: `mid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    session_id: sessionId,
    summary,
    key_topics: keyTopics,
    decisions: decisions,
    message_range: { start: messageStart, end: messageEnd },
    created_at: Date.now(),
  };

  await storage.saveCompactedSession(session);
}

export async function getCompactedSessions(
  sessionId: string
): Promise<CompactedSession[]> {
  const storage = globalCheckpointStorage;
  if (!storage) return [];
  return storage.getCompactedSessions(sessionId);
}

// ========================
// Phase 3: Three-Layer Memory Integration
// ========================

interface MemoryStats {
  shortTermSessions: number;
  midTermSessions: number;
  longTermConversations: number;
}

let contextMemoryService: ContextMemoryService | null = null;

export function initializeContextMemory(
  options?: {
    maxTokens?: number;
    midTermMaxAge?: number;
    longTermStorage?: any; // LongTermMemoryStorage
  }
): ContextMemoryService {
  const midTermStorage = new InMemoryStorage();
  contextMemoryService = new ContextMemoryService(midTermStorage, options?.longTermStorage);
  return contextMemoryService;
}

export function setContextMemoryService(service: ContextMemoryService): void {
  contextMemoryService = service;
}

export function getContextMemoryService(): ContextMemoryService | null {
  return contextMemoryService;
}

export function addMessageToMemory(
  sessionId: string,
  message: ApiMessage
): void {
  contextMemoryService?.addMessage(sessionId, message);
}

export async function getMemoryContext(
  sessionId: string,
  maxTokens?: number
): Promise<ApiMessage[]> {
  if (!contextMemoryService) {
    return [];
  }
  return contextMemoryService.getContext(sessionId, maxTokens);
}

export async function promoteSessionToMidTerm(
  sessionId: string,
  summary: string,
  keyTopics: string[],
  decisions: string[]
): Promise<CompactedSession | null> {
  if (!contextMemoryService) return null;
  return contextMemoryService.promoteToMidTerm(sessionId, summary, keyTopics, decisions);
}

export async function promoteSessionToLongTerm(
  sessionId: string,
  summary: string,
  topics: string[]
): Promise<IndexedConversation | null> {
  if (!contextMemoryService) return null;
  return contextMemoryService.promoteToLongTerm(sessionId, summary, topics);
}

export async function searchRelevantHistory(
  query: string,
  limit: number = 5
): Promise<IndexedConversation[]> {
  if (!contextMemoryService) return [];
  return contextMemoryService.searchRelevantHistory(query, limit);
}

export function clearMemorySession(sessionId: string): void {
  contextMemoryService?.clearSession(sessionId);
}

export async function getMemoryStats(): Promise<MemoryStats> {
  if (!contextMemoryService) {
    return { shortTermSessions: 0, midTermSessions: 0, longTermConversations: 0 };
  }
  return contextMemoryService.getMemoryStats();
}

export async function createMemoryFromCheckpoint(
  checkpointId: string
): Promise<boolean> {
  const storage = globalCheckpointStorage;
  if (!storage) return false;

  const result = await storage.getCheckpoint(checkpointId);
  if (!result) return false;

  if (!contextMemoryService) {
    initializeContextMemory();
  }

  await contextMemoryService?.createMemoryFromCheckpoint(result.checkpoint, result.messages);
  return true;
}

export async function reconstructContextWithMemories(
  sessionId: string,
  systemPrompt: string
): Promise<ApiMessage[]> {
  const memoryContext = await getMemoryContext(sessionId);
  const currentContext = await getContextMessages(sessionId);

  const allMessages = [...memoryContext, ...currentContext];
  return allMessages;
}

// ========================
// Phase 3.5: Persistent Memory (Permanent Memory Documents)
// ========================

let persistentMemoryService: PersistentMemoryService | null = null;

export function initializePersistentMemory(
  options?: { memoriesFolder?: string }
): PersistentMemoryService {
  persistentMemoryService = createPersistentMemoryService({
    memoriesFolder: options?.memoriesFolder ?? '.memories',
  });
  return persistentMemoryService;
}

export function setPersistentMemoryService(service: PersistentMemoryService): void {
  persistentMemoryService = service;
}

export function getPersistentMemoryService(): PersistentMemoryService | null {
  return persistentMemoryService;
}

export async function initPersistentMemory(): Promise<void> {
  if (!persistentMemoryService) {
    initializePersistentMemory();
  }
  await persistentMemoryService?.initialize();
}

export function setMemoryEmbeddingService(
  service: (text: string) => Promise<number[]>
): void {
  persistentMemoryService?.setEmbeddingService(service);
}

export async function promoteToPermanentMemory(
  sessionId: string,
  summary: string,
  topics: string[],
  decisions: string[],
  keyFindings: string[]
): Promise<MemoryDocument | null> {
  if (!persistentMemoryService) {
    console.warn('[PersistentMemory] Service not initialized');
    return null;
  }
  return persistentMemoryService.createMemoryFromSession(
    sessionId,
    summary,
    topics,
    decisions,
    keyFindings
  );
}

export async function getPermanentMemories(): Promise<MemoryDocument[]> {
  if (!persistentMemoryService) return [];
  return persistentMemoryService.getAllMemories();
}

export async function getPermanentMemory(id: string): Promise<MemoryDocument | null> {
  if (!persistentMemoryService) return null;
  return persistentMemoryService.getMemory(id);
}

export async function searchPermanentMemories(
  query: string,
  limit: number = 5
): Promise<MemoryDocument[]> {
  if (!persistentMemoryService) return [];
  return persistentMemoryService.searchMemories(query, limit);
}

export async function updatePermanentMemory(
  id: string,
  content: string
): Promise<boolean> {
  if (!persistentMemoryService) return false;
  return persistentMemoryService.updateMemory(id, content);
}

export async function deletePermanentMemory(id: string): Promise<boolean> {
  if (!persistentMemoryService) return false;
  return persistentMemoryService.deleteMemory(id);
}

export async function getAllMemoryStats(): Promise<{
  shortTermSessions: number;
  midTermSessions: number;
  longTermConversations: number;
  permanentMemories: number;
}> {
  const memStats = await getMemoryStats();
  const permMemories = await getPermanentMemories();
  return {
    ...memStats,
    permanentMemories: permMemories.length,
  };
}

// ========================
// Memory Analysis for Compact Prompt
// ========================

import type { MemoryCandidate } from '../types';

/**
 * Analyze session for memory without saving - returns MemoryCandidate for user review
 */
export function analyzeSessionForMemory(
  messages: ChatMessageForMemory[]
): MemoryCandidate {
  const summary = generateSessionSummary(messages);
  const topics = extractTopics(messages);
  const decisions = extractDecisions(messages);
  const keyFindings = extractKeyFindings(messages);

  // Calculate score
  const hasCodeFix = decisions.some(d =>
    /\b(fix|bug|error|issue|repair|solve|resolve)\b/i.test(d)
  );
  const hasLearning = keyFindings.some(f =>
    /\b(learn|discover|understand|realize|notice)\b/i.test(f)
  );
  const hasTechStack = topics.some(t =>
    /\b(react|typescript|electron|node|python|api|database|server|client)\b/i.test(t)
  );

  const score = (hasCodeFix ? 3 : 0) +
                (hasLearning ? 2 : 0) +
                (hasTechStack ? 1 : 0);

  const shouldPromote = score >= 3 || messages.length >= 15;

  return {
    summary,
    topics,
    decisions,
    keyFindings,
    score,
    shouldPromote,
    messageCount: messages.length
  };
}

/**
 * Create memory from user-confirmed candidate
 */
export async function createMemoryFromCandidate(
  sessionId: string,
  candidate: MemoryCandidate,
  editedSummary: string,
  embeddingService: (text: string) => Promise<number[]>
): Promise<MemoryDocument | null> {
  if (!persistentMemoryService) {
    console.warn('[CreateMemory] Service not initialized');
    return null;
  }

  persistentMemoryService.setEmbeddingService(embeddingService);

  return persistentMemoryService.createMemoryFromSession(
    sessionId,
    editedSummary || candidate.summary,
    candidate.topics,
    candidate.decisions,
    candidate.keyFindings
  );
}

// ========================
// Memory Auto-Creation Integration
// ========================

export interface ChatMessageForMemory {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export async function autoCreateMemoryFromSession(
  sessionId: string,
  messages: ChatMessageForMemory[],
  embeddingService: (text: string) => Promise<number[]>
): Promise<MemoryDocument | null> {
  if (!persistentMemoryService) {
    console.warn('[AutoMemory] Service not initialized');
    return null;
  }

  if (messages.length < 5) {
    console.log('[AutoMemory] Session too short, skipping');
    return null;
  }

  const summary = generateSessionSummary(messages);
  const topics = extractTopics(messages);
  const decisions = extractDecisions(messages);
  const keyFindings = extractKeyFindings(messages);

  const shouldPromote = shouldPromoteToPermanentMemory(
    decisions,
    keyFindings,
    topics,
    messages.length
  );

  if (!shouldPromote) {
    console.log('[AutoMemory] Does not meet promotion criteria');
    return null;
  }

  persistentMemoryService.setEmbeddingService(embeddingService);

  return persistentMemoryService.createMemoryFromSession(
    sessionId,
    summary,
    topics,
    decisions,
    keyFindings
  );
}

function generateSessionSummary(messages: ChatMessageForMemory[]): string {
  const userMsgs = messages.filter(m => m.role === 'user').slice(-5);
  const assistantMsgs = messages.filter(m => m.role === 'assistant').slice(-5);

  const recentConversation = userMsgs.map((u, i) => {
    const a = assistantMsgs[i];
    const userContent = typeof u.content === 'string' ? u.content : JSON.stringify(u.content);
    const assistantContent = a ? (typeof a.content === 'string' ? a.content : JSON.stringify(a.content)) : 'N/A';
    return `User: ${userContent.substring(0, 200)}...\nAssistant: ${assistantContent.substring(0, 200)}...`;
  }).join('\n\n---\n\n');

  return `会话包含 ${messages.length} 条消息。\n\n最近对话：\n${recentConversation}`;
}

function extractTopics(messages: ChatMessageForMemory[]): string[] {
  const topics: Set<string> = new Set();
  const topicKeywords = [
    'React', 'TypeScript', 'Electron', 'Node.js', 'API', 'Database',
    'AI', 'Claude', 'MCP', 'RAG', '向量数据库', 'Context',
    'Bug', 'Fix', 'Error', '性能', '优化', '架构', '设计',
    '组件', '状态管理', '内存', '存储', '文件', '搜索',
  ];

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    for (const keyword of topicKeywords) {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        topics.add(keyword);
      }
    }
  }

  return Array.from(topics).slice(0, 5);
}

function extractDecisions(messages: ChatMessageForMemory[]): string[] {
  const decisions: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      const decisionPatterns = [
        /(?:we decided|decided to|decision was|chose to|will use|using)\s+([^.]+)/gi,
        /(?:解决方案|solution|方法|approach)[:\s]+([^.]+)/gi,
      ];

      for (const pattern of decisionPatterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            decisions.push(match[1].trim().substring(0, 150));
          }
        }
      }
    }
  }

  return [...new Set(decisions)].slice(0, 5);
}

function extractKeyFindings(messages: ChatMessageForMemory[]): string[] {
  const findings: string[] = [];

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    const findingPatterns = [
      /(?:found|discovered|learned|noticed|realized|important|critical|key)[s]?[:\s]+([^.]+)/gi,
      /(?:发现|重要|关键|注意)[:\s]+([^.]+)/gi,
    ];

    for (const pattern of findingPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          findings.push(match[1].trim().substring(0, 200));
        }
      }
    }
  }

  return [...new Set(findings)].slice(0, 5);
}

function shouldPromoteToPermanentMemory(
  decisions: string[],
  keyFindings: string[],
  topics: string[],
  sessionLength: number
): boolean {
  const hasCodeFix = decisions.some(d =>
    /\b(fix|bug|error|issue|repair|solve|resolve)\b/i.test(d)
  );
  const hasLearning = keyFindings.some(f =>
    /\b(learn|discover|understand|realize|notice)\b/i.test(f)
  );
  const hasTechStack = topics.some(t =>
    /\b(react|typescript|electron|node|python|api|database|server|client)\b/i.test(t)
  );

  const score = (hasCodeFix ? 3 : 0) +
                (hasLearning ? 2 : 0) +
                (hasTechStack ? 1 : 0);

  return score >= 3 || sessionLength >= 15;
}

// --- AI Tag Suggestion ---

/**
  * 使用 AI 为给定内容生成标签建议
   */
  export async function suggestTags(content: string, config: AIConfig): Promise<string[]> {
    if (!content || content.trim().length < 50) {
      return [];
    }

    // 如果内容太长，截取前2000字符进行分析
    const analysisContent = content.length > 2000 ? content.substring(0, 2000) : content;

    // 根据语言设置生成 system prompt
    const isChinese = config.language === 'zh';
    
    const systemPrompt = isChinese
      ? `你是一个标签助手。分析内容并推荐最多5个相关标签。

规则：
1. 使用小写英文标签
2. 使用连字符代替空格（例如："machine-learning" 而不是 "machine learning"）
3. 保持标签简短（1-3个单词）
4. 包含主题、类型和技术标签
5. 避免通用标签如 "article"、"content"、"text"

输出格式：只需一个 JSON 字符串数组，例如：["react", "typescript", "tutorial"]`
      : `You are a tagging assistant. Analyze the content and suggest up to 5 relevant tags.

Rules:
1. Use lowercase English tags
2. Use hyphens instead of spaces (e.g., "machine-learning" not "machine learning")
3. Keep tags short (1-3 words)
4. Include topic, type, and technology tags
5. Avoid generic tags like "article", "content", "text"

Output format: Just a JSON array of strings, e.g., ["react", "typescript", "tutorial"]`;

    try {
      if (config.provider === 'gemini') {
        const client = new GoogleGenAI({ apiKey: config.apiKey || '' });
        
        const response = await client.models.generateContent({
          model: config.model || 'gemini-2.5-flash',
          contents: [{
            parts: [{ text: `Analyze this content and suggest 5 relevant tags:\n\n${analysisContent}` }]
          }],
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.3,
          }
        });

      const text = response.text?.trim() || '';
      
      // 尝试解析 JSON 数组
      const jsonMatch = text.match(/\[.*\]/s);
      if (jsonMatch) {
        try {
          const tags = JSON.parse(jsonMatch[0]);
          if (Array.isArray(tags) && tags.length > 0) {
            return tags.slice(0, 5).map((t: string) => t.toLowerCase().trim());
          }
        } catch {
          // JSON 解析失败，尝试手动解析
        }
      }

      // 备用解析：提取逗号分隔的标签
      const fallbackTags = text
        .replace(/[\[\]"'`]/g, '')
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0 && t.length < 30);
      
      return fallbackTags.slice(0, 5);
    } else if (config.provider === 'ollama' || config.baseUrl?.includes('localhost')) {
      // Ollama 或其他兼容 OpenAI 的 API
      const baseUrl = config.baseUrl || 'http://localhost:11434';
      
      const prompt = isChinese
        ? `分析以下内容，推荐最多5个相关标签（小写英文，用连字符）：\n\n${analysisContent}\n\n请以JSON数组格式返回，如：["tag1", "tag2"]`
        : `Analyze this content and suggest 5 relevant tags (lowercase, hyphens instead of spaces):\n\n${analysisContent}\n\nRespond with JSON array: ["tag1", "tag2"]`;
      
      const response = await platformFetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'llama3',
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3
          }
        })
      });

      const data = await response.json();
      const text = data.response?.trim() || '';
      
      // 解析 JSON 数组
      const jsonMatch = text.match(/\[.*\]/s);
      if (jsonMatch) {
        try {
          const tags = JSON.parse(jsonMatch[0]);
          if (Array.isArray(tags)) {
            return tags.slice(0, 5).map((t: string) => t.toLowerCase().trim());
          }
        } catch {}
      }
      
      return [];
      } else if (config.provider === 'openai' || config.provider === 'anthropic') {
        // OpenAI 或 Anthropic 兼容的 API
        const baseUrl = config.baseUrl;
        if (!baseUrl) {
          console.error('[suggestTags] baseUrl is required for', config.provider);
          return [];
        }

        const isAnthropic = config.provider === 'anthropic';
        
        // 智能构建端点 URL
        const buildEndpoint = (defaultPath: string): string => {
          const trimmedUrl = baseUrl.replace(/\/$/, '');
          if (trimmedUrl.endsWith('/v1/messages') || trimmedUrl.endsWith('/chat/completions')) {
            return trimmedUrl;
          }
          return `${trimmedUrl}${defaultPath}`;
        };

        if (isAnthropic) {
          // Anthropic API 格式
          const endpoint = buildEndpoint('/v1/messages');
          
          const userPrompt = isChinese
            ? `分析以下内容，推荐最多5个相关标签：\n\n${analysisContent}`
            : `Analyze this content and suggest 5 relevant tags:\n\n${analysisContent}`;
          
          const response = await platformFetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey || '',
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: config.model,
              max_tokens: 200,
              temperature: 0.3,
              system: systemPrompt,
              messages: [
                { role: 'user', content: userPrompt }
              ]
            })
          });

          if (!response.ok) {
            console.error('[suggestTags] Anthropic API error:', response.status, response.statusText, 'Endpoint:', endpoint);
            return [];
          }

          const data = await response.json();
          
          // Anthropic 响应格式: content 是数组，每个元素有 type 和 text
          // MiniMaxi 可能使用 thinking 扩展
          let text = '';
          if (Array.isArray(data.content)) {
            // 标准 Anthropic 格式
            const textBlocks = data.content.filter((block: any) => block.type === 'text');
            if (textBlocks.length > 0) {
              text = textBlocks.map((b: any) => b.text).join('').trim();
            } else {
              // MiniMaxi thinking 扩展格式
              const thinkingBlocks = data.content.filter((block: any) => block.type === 'thinking' || block.thinking);
              if (thinkingBlocks.length > 0) {
                text = thinkingBlocks.map((b: any) => b.thinking || b.text || '').join('').trim();
              }
            }
          } else if (typeof data.content === 'string') {
            text = data.content.trim();
          }
          
          console.log('[suggestTags] Extracted thinking text:', text);
          
          // 从 thinking 内容中提取标签
          // MiniMaxi 格式通常是：
          // 1. weather-forecast (description)
          // 2. beijing (description)
          
          const tags: string[] = [];
          
          // 模式1: "1. tag-name (description)" 或 "1. tag-name - description"
          // 提取 tag-name（第一个空格或括号之前的内容）
          const listPattern = /^[\s]*[\d.]+\s*([a-zA-Z0-9-]+)/gm;
          const listMatches = text.matchAll(listPattern);
          
          for (const match of listMatches) {
            if (match[1]) {
              const tag = match[1].toLowerCase();
              // 排除一些明显的非标签词
              if (tag.length > 1 && tag !== 'the' && tag !== 'it' && tag !== 'this') {
                tags.push(tag);
              }
            }
          }
          
          console.log('[suggestTags] Tags from list pattern:', tags);
          
          // 模式2: 如果列表模式没找到，尝试 JSON 数组
          if (tags.length === 0) {
            const jsonMatches = text.match(/\[([^\]]+)\]/g);
            if (jsonMatches && jsonMatches.length > 0) {
              for (const jsonStr of jsonMatches) {
                try {
                  const parsed = JSON.parse(jsonStr);
                  if (Array.isArray(parsed)) {
                    tags.push(...parsed.map((t: string) => t.toLowerCase().trim()));
                  }
                } catch {}
              }
            }
          }
          
          console.log('[suggestTags] Final extracted tags:', tags.slice(0, 5));
          
          if (tags.length > 0) {
            return tags.slice(0, 5).map(t => t.toLowerCase().trim());
          }
          
          // 如果还是没找到，尝试从 thinking 内容末尾提取
          // 通常标签会在最后几行
          const lines = text.split('\n').filter(l => l.trim().length > 0);
          const lastLines = lines.slice(-5);
          
          for (const line of lastLines) {
            // 匹配 "tag1, tag2, tag3" 格式
            const commaTags = line.split(',').map(t => t.trim().toLowerCase().replace(/[^a-zA-Z0-9-]/g, ''));
            for (const tag of commaTags) {
              if (tag.length > 1 && tag.length < 30 && !tags.includes(tag)) {
                tags.push(tag);
              }
            }
          }
          
          console.log('[suggestTags] Tags from last lines:', tags.slice(0, 5));
          
          return tags.slice(0, 5).map(t => t.toLowerCase().trim());
        } else {
          // OpenAI API 格式
          const endpoint = buildEndpoint('/chat/completions');
          
          const userPrompt = isChinese
            ? `分析以下内容，推荐最多5个相关标签：\n\n${analysisContent}`
            : `Analyze this content and suggest 5 relevant tags:\n\n${analysisContent}`;
          
          const response = await platformFetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {})
            },
            body: JSON.stringify({
              model: config.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              temperature: 0.3,
              max_tokens: 200
            })
          });

          if (!response.ok) {
            console.error('[suggestTags] OpenAI API error:', response.status, response.statusText, 'Endpoint:', endpoint);
            return [];
          }

          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            console.error('[suggestTags] Unexpected content-type:', contentType);
            return [];
          }

          const data = await response.json();
          const text = data.choices?.[0]?.message?.content?.trim() || '';
          
          const jsonMatch = text.match(/\[.*\]/s);
          if (jsonMatch) {
            try {
              const tags = JSON.parse(jsonMatch[0]);
              if (Array.isArray(tags)) {
                return tags.slice(0, 5).map((t: string) => t.toLowerCase().trim());
              }
            } catch {}
          }
          
          return [];
        }
      } else {
        // 未知的 provider，尝试使用 baseUrl 作为通用 OpenAI 兼容端点
        const baseUrl = config.baseUrl;
        if (!baseUrl) {
          console.error('[suggestTags] Unknown provider and no baseUrl configured');
          return [];
        }

        const trimmedUrl = baseUrl.replace(/\/$/, '');
        const endpoint = trimmedUrl.endsWith('/chat/completions') 
          ? trimmedUrl 
          : `${trimmedUrl}/chat/completions`;

        const response = await platformFetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {})
          },
          body: JSON.stringify({
            model: config.model || 'gpt-4',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: isChinese
                ? `分析以下内容，推荐最多5个相关标签：\n\n${analysisContent}`
                : `Analyze this content and suggest 5 relevant tags:\n\n${analysisContent}` }
            ],
            temperature: 0.3,
            max_tokens: 200
          })
        });

        if (!response.ok) {
          console.error('[suggestTags] API error:', response.status, response.statusText);
          return [];
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          console.error('[suggestTags] Unexpected content-type:', contentType);
          return [];
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content?.trim() || '';
        
        const jsonMatch = text.match(/\[.*\]/s);
        if (jsonMatch) {
          try {
            const tags = JSON.parse(jsonMatch[0]);
            if (Array.isArray(tags)) {
              return tags.slice(0, 5).map((t: string) => t.toLowerCase().trim());
            }
          } catch {}
        }
        
        return [];
      }
    } catch (error) {
      console.error('[suggestTags] Error:', error);
      return [];
    }
  }
