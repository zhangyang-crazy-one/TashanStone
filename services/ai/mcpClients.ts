import type { FunctionDeclaration } from '@google/genai';
import type { JsonValue } from '@/types';
import { mcpService } from '@/src/services/mcpService';

export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

export interface IMCPClient {
  connect(): Promise<void>;
  getTools(): FunctionDeclaration[];
  executeTool(name: string, args: Record<string, JsonValue>): Promise<JsonValue>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

const isMCPServerConfig = (value: unknown): value is MCPServerConfig => {
  if (!isRecord(value)) return false;
  if (typeof value.command !== 'string') return false;
  if (!isStringArray(value.args)) return false;
  if (value.env !== undefined && !isRecord(value.env)) return false;
  return true;
};

const isMCPConfig = (value: unknown): value is MCPConfig => {
  if (!isRecord(value) || !isRecord(value.mcpServers)) return false;
  return Object.values(value.mcpServers).every(isMCPServerConfig);
};

// Virtual MCP client (browser implementation).
export class VirtualMCPClient implements IMCPClient {
  private config: MCPConfig | null = null;
  private activeServers: Map<string, { status: 'running' | 'stopped'; tools: MCPTool[] }> = new Map();

  constructor(configStr: string) {
    try {
      const parsed = JSON.parse(configStr || '{}') as unknown;
      if (isMCPConfig(parsed)) {
        this.config = parsed;
      } else if (Array.isArray(parsed)) {
        // Legacy: array of tools treated as a default "custom" server.
        this.config = {
          mcpServers: {
            'custom-tools': { command: 'internal', args: [], env: {} }
          }
        };
        this.activeServers.set('custom-tools', { status: 'running', tools: parsed as MCPTool[] });
      }
    } catch (error) {
      console.warn('MCP Config Parse Error', error);
    }
  }

  async connect(): Promise<void> {
    if (!this.config) return;

    const entries = Object.entries(this.config.mcpServers);
    await Promise.all(entries.map(async ([name, srv]) => {
      return this.launchVirtualServer(name, srv);
    }));
  }

  private async launchVirtualServer(name: string, config: MCPServerConfig): Promise<boolean> {
    // Simulate async startup.
    await new Promise(resolve => setTimeout(resolve, 500));

    let tools: MCPTool[] = [];

    // 1) Chrome devtools tools
    if (name.includes('chrome') || config.args.some(arg => arg.includes('chrome-devtools'))) {
      tools = [
        {
          name: 'console_log',
          description: 'Log a message to the browser console for debugging.',
          inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] }
        },
        {
          name: 'get_page_info',
          description: 'Get current page title and dimensions.',
          inputSchema: { type: 'object', properties: {}, required: [] }
        }
      ];
    }
    // 2) Filesystem simulation
    else if (name.includes('filesystem') || config.command === 'fs') {
      tools = [
        {
          name: 'list_files',
          description: 'List all files in the current virtual workspace.',
          inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
        },
        {
          name: 'read_file',
          description: 'Read file content.',
          inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
        }
      ];
    }
    // 3) Legacy array format already injected in constructor.
    else if (this.activeServers.has(name)) {
      return true;
    }

    this.activeServers.set(name, { status: 'running', tools });
    return true;
  }

  getTools(): FunctionDeclaration[] {
    const allTools: FunctionDeclaration[] = [];

    this.activeServers.forEach(server => {
      if (server.status === 'running') {
        server.tools.forEach(tool => {
          allTools.push({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema ?? tool.parameters ?? {}
          });
        });
      }
    });

    return allTools;
  }

  async executeTool(name: string, args: Record<string, JsonValue>): Promise<JsonValue> {
    if (name === 'console_log') {
      const message = typeof args.message === 'string' ? args.message : String(args.message ?? '');
      console.log('%c[AI Tool Log]', 'color: #06b6d4; font-weight:bold;', message);
      return { success: true, output: 'Logged to console' };
    }
    if (name === 'get_page_info') {
      return {
        title: document.title,
        width: window.innerWidth,
        height: window.innerHeight,
        url: window.location.href
      };
    }

    return { success: true, message: 'Tool executed (Simulation)' };
  }
}

// Real MCP client (Electron implementation).
export class RealMCPClient implements IMCPClient {
  private isAvailable = false;
  private tools: MCPTool[] = [];
  private maxRetries = 8;
  private baseDelayMs = 1000;
  private static toolsCache: MCPTool[] | null = null;
  private static lastDiscoveryTime = 0;
  private static discoveryInProgress = false;

  constructor(configStr: string) {
    void configStr;
    this.isAvailable = mcpService.isAvailable();
    if (this.isAvailable) {
      console.log('[RealMCP] Using Electron MCP client');
      if (RealMCPClient.toolsCache && RealMCPClient.toolsCache.length > 0) {
        this.tools = RealMCPClient.toolsCache;
        console.log(`[RealMCP] Using cached tools: ${this.tools.length} tools available`);
      }
    } else {
      console.warn('[RealMCP] Not available, falling back to VirtualMCPClient');
    }
  }

  async connect(): Promise<void> {
    if (!this.isAvailable) {
      console.warn('[RealMCP] Cannot connect: not in Electron environment');
      return;
    }

    const cacheAge = Date.now() - RealMCPClient.lastDiscoveryTime;
    if (RealMCPClient.toolsCache && RealMCPClient.toolsCache.length > 0 && cacheAge < 300000) {
      this.tools = RealMCPClient.toolsCache;
      console.log(`[RealMCP] Using cached tools (${Math.round(cacheAge / 1000)}s old): ${this.tools.length} tools`);
      return;
    }

    if (RealMCPClient.discoveryInProgress) {
      console.log('[RealMCP] Tool discovery already in progress, waiting...');
      for (let i = 0; i < 30; i += 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!RealMCPClient.discoveryInProgress && RealMCPClient.toolsCache) {
          this.tools = RealMCPClient.toolsCache;
          return;
        }
      }
    }

    RealMCPClient.discoveryInProgress = true;

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        const delay = Math.min(this.baseDelayMs * Math.pow(2, attempt - 1), 8000);
        console.log(`[RealMCP] Attempting to connect (attempt ${attempt}/${this.maxRetries}, next delay: ${delay}ms)`);

        this.tools = await mcpService.getTools();

        if (this.tools.length > 0) {
          console.log(`[RealMCP] Connected successfully, discovered ${this.tools.length} MCP tools:`,
            this.tools.map(tool => tool.name).join(', ')
          );
          RealMCPClient.toolsCache = this.tools;
          RealMCPClient.lastDiscoveryTime = Date.now();
          RealMCPClient.discoveryInProgress = false;
          return;
        }

        console.warn(`[RealMCP] Connection attempt ${attempt}: No MCP tools available yet (npx may still be downloading)`);
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
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

    if (this.tools.length === 0) {
      console.warn('[RealMCP] Failed to discover MCP tools after all retries. Will use internal tools only.');
      console.log('[RealMCP] Starting background tool discovery...');
      this.startBackgroundDiscovery();
    }
  }

  getTools(): FunctionDeclaration[] {
    if (!this.isAvailable) {
      return [];
    }

    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }));
  }

  async executeTool(name: string, args: Record<string, JsonValue>): Promise<JsonValue> {
    if (!this.isAvailable) {
      throw new Error('MCP not available');
    }

    console.log(`[RealMCP] Executing ${name}`, args);

    try {
      const result = await mcpService.callTool(name, args);

      if (!result.success) {
        console.error('[RealMCP] Tool execution failed:', result.error);

        if (result.error && result.error.includes('not found')) {
          console.log('[RealMCP] Refreshing tool list and retrying...');
          this.tools = await mcpService.getTools();

          if (this.tools.some(tool => tool.name === name)) {
            const retryResult = await mcpService.callTool(name, args);
            if (!retryResult.success) {
              return {
                success: false,
                error: retryResult.error,
                output: `Error: ${retryResult.error}`
              } as JsonValue;
            }
            return (retryResult.result ?? { success: true, output: 'Tool executed successfully' }) as JsonValue;
          }
        }

        return {
          success: false,
          error: result.error,
          output: `Error: ${result.error}`
        } as JsonValue;
      }

      return (result.result ?? { success: true, output: 'Tool executed successfully' }) as JsonValue;
    } catch (error) {
      console.error('[RealMCP] Tool execution error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      } as JsonValue;
    }
  }

  private startBackgroundDiscovery(): void {
    const backgroundInterval = setInterval(async () => {
      if (RealMCPClient.toolsCache && RealMCPClient.toolsCache.length > 0) {
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
          console.log(`[RealMCP] Background discovery succeeded: ${tools.length} tools`);
          clearInterval(backgroundInterval);
        }
      } catch (error) {
        console.warn('[RealMCP] Background discovery failed:', error);
      }
    }, 10000);

    setTimeout(() => {
      clearInterval(backgroundInterval);
      console.log('[RealMCP] Background discovery stopped after 5 minutes');
    }, 300000);
  }

  isRealMCP(): boolean {
    return this.isAvailable;
  }
}
