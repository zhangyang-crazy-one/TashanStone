

import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { AIConfig, MarkdownFile, GraphData, Quiz, QuizQuestion, ChatMessage } from "../types";
import { mcpService } from "../src/services/mcpService";
import { platformFetch, platformStreamFetch } from "../src/services/ai/platformFetch";
import {
  ContextManager,
  createContextManager,
  TokenUsage,
  ContextConfig,
  ApiMessage,
  Checkpoint,
  DEFAULT_CONTEXT_CONFIG,
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

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

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
    
    console.log(`[MCP] Connected to ${results.filter(r => r).length} servers.`);
  }

  private async launchVirtualServer(name: string, config: MCPServerConfig) {
    console.log(`[MCP] Starting server '${name}' with command: ${config.command} ${config.args.join(' ')}`);
    
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
    console.log(`[MCP] Executing ${name}`, args);
    
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
  private maxRetries = 3;
  private retryDelayMs = 500;

  constructor(configStr: string) {
    this.isAvailable = mcpService.isAvailable();
    if (this.isAvailable) {
      console.log('[RealMCP] Using Electron MCP client');
      // 配置加载将在 connect() 中进行
    } else {
      console.warn('[RealMCP] Not available, falling back to VirtualMCPClient');
    }
  }

  async connect() {
    if (!this.isAvailable) {
      console.warn('[RealMCP] Cannot connect: not in Electron environment');
      return;
    }

    // 使用重试机制确保工具映射表已就绪
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[RealMCP] Attempting to connect (attempt ${attempt}/${this.maxRetries})`);

        // 获取工具列表
        this.tools = await mcpService.getTools();

        if (this.tools.length > 0) {
          console.log(`[RealMCP] Connected successfully, discovered ${this.tools.length} tools:`,
            this.tools.map(t => t.name).join(', ')
          );
          return;
        } else {
          console.warn(`[RealMCP] Connection attempt ${attempt}: No tools available yet`);

          if (attempt < this.maxRetries) {
            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * attempt));
          }
        }
      } catch (error) {
        console.error(`[RealMCP] Connection attempt ${attempt} failed:`, error);

        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * attempt));
        } else {
          this.isAvailable = false;
          throw error;
        }
      }
    }

    // 如果所有重试都失败
    if (this.tools.length === 0) {
      console.warn('[RealMCP] Failed to discover tools after all retries. MCP may not be ready.');
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

// --- Function Declarations for OpenAI / Ollama (JSON Schema format) ---

const OPENAI_TOOLS = [
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
const SEARCH_KNOWLEDGE_BASE_TOOL = {
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
  conversationHistory?: ChatMessage[]
): AsyncGenerator<string, void, unknown> {
  const baseUrl = config.baseUrl || 'https://api.anthropic.com';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/messages`;

  const messages: any[] = [];

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
    const requestBody: any = {
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages,
      stream: true
    };

    if (systemInstruction) {
      requestBody.system = systemInstruction;
    }

    const options = {
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
    for await (const chunk of platformStreamFetch(endpoint, options)) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
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
    if (buffer.trim() && buffer.startsWith('data: ')) {
      const data = buffer.slice(6).trim();
      if (data !== '[DONE]') {
        try {
          const json = JSON.parse(data);
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
  conversationHistory?: ChatMessage[]
): AsyncGenerator<string, void, unknown> {
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

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
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey || ''}`
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
        stream: true
      })
    };

    // Use platformStreamFetch for true streaming in Electron
    let buffer = '';
    for await (const chunk of platformStreamFetch(endpoint, options)) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim() && buffer.startsWith('data: ')) {
      const data = buffer.slice(6).trim();
      if (data !== '[DONE]') {
        try {
          const json = JSON.parse(data);
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

// --- EMBEDDING SUPPORT ---

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
            return result.embeddings?.[0]?.values || [];
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
            return data.data[0].embedding;
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
                    return data.embeddings?.[0] || [];
                 } else {
                     throw new Error(`Ollama Embedding Failed: ${response.statusText}`);
                 }
            }
            const data = await response.json();
            // Ollama /api/embed returns { embeddings: [[...]] }
            return data.embeddings?.[0] || [];
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

    const summary = await generateAIResponse(prompt, compactionConfig, "You are a helpful assistant summarizer.");
    
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
  conversationHistory?: ChatMessage[]
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

  const mcpPromptAddition = mcpToolDescriptions
    ? `\n\n## Available MCP Tools\nYou have access to the following MCP tools. When you need to use a tool, output a tool call in this exact JSON format:\n\`\`\`tool_call\n{"tool": "tool_name", "arguments": {...}}\n\`\`\`\n\nAvailable tools:\n${mcpToolDescriptions}${toolGuide}`
    : '';

  const finalSystemInstruction = (systemInstruction || "") + mcpPromptAddition + langInstruction;

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
  toolsCallback?: (toolName: string, args: any) => Promise<any>,
  retrievedContext?: string, // New: Accept pre-retrieved RAG context string
  conversationHistory?: ChatMessage[], // NEW: Historical conversation context
  disableTools: boolean = false // NEW: Disable tool calling for content processing tasks
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
    ? `\n\n## Available MCP Tools\nYou have access to the following MCP tools:\n${mcpToolDescriptions}${toolGuide2}\n\nUse function calling to invoke these tools.`
    : '';

  const finalSystemInstruction = (systemInstruction || "") + mcpPromptAddition + langInstruction;

  // Create Unified Tool Callback
  // IMPORTANT: 所有工具调用都必须经过 toolsCallback 以便 UI 能显示实时反馈
  const unifiedToolCallback = async (name: string, args: any) => {
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
    return callGemini(fullPrompt, config, finalSystemInstruction, jsonMode, callbackToPass, mcpClient, conversationHistory);
  } else if (config.provider === 'ollama') {
    return callOllama(fullPrompt, config, finalSystemInstruction, jsonMode, callbackToPass, mcpClient, conversationHistory);
  } else if (config.provider === 'openai') {
    return callOpenAICompatible(fullPrompt, config, finalSystemInstruction, jsonMode, callbackToPass, mcpClient, conversationHistory);
  } else if (config.provider === 'anthropic') {
    return callAnthropic(fullPrompt, config, finalSystemInstruction, jsonMode, callbackToPass, mcpClient, conversationHistory);
  }
  throw new Error(`Unsupported provider: ${config.provider}`);
};

const callGemini = async (
  prompt: string,
  config: AIConfig,
  systemInstruction?: string,
  jsonMode: boolean = false,
  toolsCallback?: (toolName: string, args: any) => Promise<any>,
  mcpClient?: IMCPClient,
  conversationHistory?: ChatMessage[],
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

    // Build contents array from conversation history
    const contents: any[] = [];

    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        if (msg.role === 'user') {
          contents.push({
            role: 'user',
            parts: [{ text: msg.content }]
          });
        } else if (msg.role === 'assistant') {
          contents.push({
            role: 'model',
            parts: [{ text: msg.content }]
          });
        }
        // system messages are handled via systemInstruction
        // tool messages will be handled in the multi-turn loop below
      }
    }

    // Add current prompt
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

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

        // Dynamic MCP Tools
        const dynamicTools = mcpClient ? mcpClient.getTools() : [];

        generateConfig.tools = [{
            functionDeclarations: [...baseTools, ...dynamicTools]
        }];
    }

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

      // Handle Function Calls (multi-turn loop)
      if (response.functionCalls && toolsCallback && !config.enableWebSearch && !jsonMode) {
        const calls = response.functionCalls;

        // Add model's response (with function calls) to contents
        contents.push({
          role: 'model',
          parts: response.candidates?.[0]?.content?.parts || []
        });

        // Execute all function calls and add results
        for (const call of calls) {
          const result = await toolsCallback(call.name, call.args);

          // Add function response to contents
          contents.push({
            role: 'user',  // Gemini uses 'user' role for functionResponse
            parts: [{
              functionResponse: {
                name: call.name,
                response: result
              }
            }]
          });
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
        return callGemini(prompt, config, systemInstruction, jsonMode, toolsCallback, mcpClient, conversationHistory, retries - 1);
    }
    throw new Error(`Gemini Error: ${error.message || "Unknown error"}`);
  }
};

const callOllama = async (
  prompt: string,
  config: AIConfig,
  systemInstruction?: string,
  jsonMode: boolean = false,
  toolsCallback?: (toolName: string, args: any) => Promise<any>,
  mcpClient?: IMCPClient,
  conversationHistory?: ChatMessage[]
): Promise<string> => {
    const baseUrl = config.baseUrl || 'http://localhost:11434';
    const model = config.model || 'llama3';

    const messages: any[] = [];

    // Add system instruction
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        if (msg.role === 'user') {
          messages.push({ role: 'user', content: msg.content });
        } else if (msg.role === 'assistant') {
          messages.push({ role: 'assistant', content: msg.content });
        }
        // system messages already added above
      }
    }

    // Add current prompt
    messages.push({ role: 'user', content: prompt });

    // Define tools
    let tools = undefined;
    if (toolsCallback && !jsonMode) {
        const dynamicTools = mcpClient ? mcpClient.getTools() : [];
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
          const toolCalls = message.tool_calls;

          messages.push(message);

          // Check for [TASK_COMPLETE] signal in response
          if (message.content && message.content.includes('[TASK_COMPLETE]')) {
            console.log('[Ollama] Task complete signal detected after', iterations, 'iterations');
            return message.content.replace(/\[TASK_COMPLETE\]/g, '').trim();
          }

          if (toolCalls && toolCalls.length > 0 && toolsCallback) {
              for (const tool of toolCalls) {
                  const functionName = tool.function.name;
                  const args = tool.function.arguments;
                  const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                  const result = await toolsCallback(functionName, parsedArgs);
                  messages.push({ role: 'tool', content: JSON.stringify(result) });
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
    toolsCallback?: (toolName: string, args: any) => Promise<any>,
    mcpClient?: IMCPClient,
    conversationHistory?: ChatMessage[]
  ): Promise<string> => {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    const messages: any[] = [];

    // Add system instruction
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        if (msg.role === 'user') {
          messages.push({ role: 'user', content: msg.content });
        } else if (msg.role === 'assistant') {
          messages.push({ role: 'assistant', content: msg.content });
        }
        // system messages already added above
      }
    }

    // Add current prompt
    messages.push({ role: 'user', content: prompt });

    let tools = undefined;
    if (toolsCallback && !jsonMode) {
        const dynamicTools = mcpClient ? mcpClient.getTools() : [];
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

          if (message.tool_calls && message.tool_calls.length > 0 && toolsCallback) {
              for (const toolCall of message.tool_calls) {
                  const fnName = toolCall.function.name;
                  const argsStr = toolCall.function.arguments;
                  const args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
                  const result = await toolsCallback(fnName, args);

                  messages.push({
                      role: 'tool',
                      tool_call_id: toolCall.id,
                      content: JSON.stringify(result)
                  });
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
    toolsCallback?: (toolName: string, args: any) => Promise<any>,
    mcpClient?: IMCPClient,
    conversationHistory?: ChatMessage[]
  ): Promise<string> => {
    const baseUrl = config.baseUrl || 'https://api.anthropic.com';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/messages`;

    const messages: any[] = [];

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        if (msg.role === 'user') {
          messages.push({ role: 'user', content: msg.content });
        } else if (msg.role === 'assistant') {
          messages.push({ role: 'assistant', content: msg.content });
        }
      }
    }

    // Add current prompt
    messages.push({ role: 'user', content: prompt });

    // Build tools array for Anthropic format
    let tools: any[] | undefined = undefined;
    if (toolsCallback && !jsonMode) {
        const dynamicTools = mcpClient ? mcpClient.getTools() : [];
        // Map to Anthropic tool format
        const baseToolsAnthropic = [
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

        const mappedDynamic = dynamicTools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters || { type: 'object', properties: {} }
        }));

        tools = [...baseToolsAnthropic, ...mappedDynamic];
    }

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

        const requestBody: any = {
          model: config.model || 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages
        };

        if (systemInstruction) {
          requestBody.system = systemInstruction;
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
            throw new Error(`Anthropic API Error: ${response.status} ${errorData.error?.message || response.statusText}`);
          }

          const data = await response.json();

          // Check for tool use
          const toolUseBlocks = data.content?.filter((block: any) => block.type === 'tool_use') || [];
          const textBlocks = data.content?.filter((block: any) => block.type === 'text') || [];

          // Check for [TASK_COMPLETE] signal in text response
          const responseText = textBlocks.map((b: any) => b.text).join('');
          if (responseText.includes('[TASK_COMPLETE]')) {
            console.log('[Anthropic] Task complete signal detected after', iterations, 'iterations');
            return responseText.replace(/\[TASK_COMPLETE\]/g, '').trim();
          }

          if (toolUseBlocks.length > 0 && toolsCallback) {
            // Add assistant message with tool use to history
            messages.push({
              role: 'assistant',
              content: data.content
            });

            // Execute tools and build tool results
            const toolResults: any[] = [];
            for (const toolUse of toolUseBlocks) {
              const result = await toolsCallback(toolUse.name, toolUse.input);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(result)
              });
            }

            // Add tool results as user message
            messages.push({
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
      throw new Error(`Anthropic API Error: ${error.message}`);
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

  // Use huge context for Gemini to allow full graph generation
  const limit = config.provider === 'gemini' ? 2000000 : 15000;

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
  
  // Use huge context for Gemini
  const limit = config.provider === 'gemini' ? 2000000 : 30000;
  
  const prompt = `Read the notes. Organize info. Synthesize key findings. Produce a Master Summary in Markdown.\nNotes:\n${combinedContent.substring(0, limit)}`;
  return generateAIResponse(prompt, config, "You are a Knowledge Manager.");
};

export const generateMindMap = async (content: string, config: AIConfig): Promise<string> => {
  // Use huge context for Gemini
  const limit = config.provider === 'gemini' ? 2000000 : 15000;

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
        explanation: q.explanation
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
       // Gemini can handle huge content
       const limit = config.provider === 'gemini' ? 2000000 : 500000;

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
                   type: q.options && q.options.length > 0 ? 'single' : 'text'
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

const sessionContextManagers: Map<string, ContextManager> = new Map();

export function getContextManager(sessionId: string): ContextManager {
  let manager = sessionContextManagers.get(sessionId);
  if (!manager) {
    manager = createContextManager(sessionId);
    sessionContextManagers.set(sessionId, manager);
  }
  return manager;
}

export function createContextManagerForSession(
  sessionId: string,
  config?: Partial<ContextConfig>
): ContextManager {
  const manager = createContextManager(sessionId, config);
  sessionContextManagers.set(sessionId, manager);
  return manager;
}

export function removeContextManager(sessionId: string): void {
  sessionContextManagers.delete(sessionId);
}

export function clearAllContextManagers(): void {
  sessionContextManagers.clear();
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