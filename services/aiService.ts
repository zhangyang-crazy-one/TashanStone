

import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { AIConfig, MarkdownFile, GraphData, Quiz, QuizQuestion, ChatMessage } from "../types";

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
  }
];

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

export const getEmbedding = async (text: string, config: AIConfig): Promise<number[]> => {
    const cleanText = text.replace(/\n/g, ' ').trim().substring(0, 8000); // Truncate safe limit

    if (config.provider === 'gemini') {
        try {
            const client = getClient(config.apiKey);
            const modelName = config.embeddingModel || 'text-embedding-004';
            const result = await client.models.embedContent({
                model: modelName,
                contents: [{ parts: [{ text: cleanText }] }]
            });
            return result.embeddings?.[0]?.values || [];
        } catch (e: any) {
            console.error("Gemini Embedding Error", e);
            throw new Error(`Embedding Failed: ${e.message}`);
        }
    } else if (config.provider === 'openai') {
        try {
            const modelName = config.embeddingModel || 'text-embedding-3-small';
            const response = await fetch(`${(config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    input: cleanText,
                    model: modelName
                })
            });
            if (!response.ok) throw new Error(response.statusText);
            const data = await response.json();
            return data.data[0].embedding;
        } catch (e: any) {
            console.error("OpenAI Embedding Error", e);
            throw e;
        }
    } else if (config.provider === 'ollama') {
        try {
            const modelName = config.embeddingModel || 'nomic-embed-text';
            const response = await fetch(`${(config.baseUrl || 'http://localhost:11434').replace(/\/$/, '')}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelName,
                    prompt: cleanText
                })
            });
            
            if (!response.ok) {
                 // Fallback to generative model if dedicated embedder missing (or configured one fails)
                 // Only try fallback if the user hasn't explicitly set a different model that failed
                 if (modelName !== config.model) {
                     const responseFallback = await fetch(`${(config.baseUrl || 'http://localhost:11434').replace(/\/$/, '')}/api/embeddings`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: config.model,
                            prompt: cleanText
                        })
                    });
                    if (!responseFallback.ok) throw new Error("Ollama Embedding Failed");
                    const data = await responseFallback.json();
                    return data.embedding;
                 } else {
                     throw new Error(`Ollama Embedding Failed: ${response.statusText}`);
                 }
            }
            const data = await response.json();
            return data.embedding;
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

export const generateAIResponse = async (
  prompt: string, 
  config: AIConfig, 
  systemInstruction?: string,
  jsonMode: boolean = false,
  contextFiles: MarkdownFile[] = [],
  toolsCallback?: (toolName: string, args: any) => Promise<any>,
  retrievedContext?: string // New: Accept pre-retrieved RAG context string
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

  const finalSystemInstruction = (systemInstruction || "") + langInstruction;

  // Initialize Virtual MCP
  const mcpClient = new VirtualMCPClient(config.mcpTools || '{}');
  await mcpClient.connect();

  // Create Unified Tool Callback
  const unifiedToolCallback = async (name: string, args: any) => {
      // 1. Check if it's a built-in file tool
      if (['create_file', 'update_file', 'delete_file'].includes(name) && toolsCallback) {
          return await toolsCallback(name, args);
      }
      // 2. Delegate to MCP
      return await mcpClient.executeTool(name, args);
  };
  
  // IMPORTANT: Conflicting Config Handling
  // If JSON Mode is enabled, we CANNOT use Function Calling tools in Gemini (API Error 400).
  const shouldEnableTools = !jsonMode && (!!toolsCallback || (mcpClient.getTools().length > 0));
  const callbackToPass = shouldEnableTools ? unifiedToolCallback : undefined;

  if (config.provider === 'gemini') {
    return callGemini(fullPrompt, config, finalSystemInstruction, jsonMode, callbackToPass, mcpClient);
  } else if (config.provider === 'ollama') {
    return callOllama(fullPrompt, config, finalSystemInstruction, jsonMode, callbackToPass, mcpClient);
  } else if (config.provider === 'openai') {
    return callOpenAICompatible(fullPrompt, config, finalSystemInstruction, jsonMode, callbackToPass, mcpClient);
  }
  throw new Error(`Unsupported provider: ${config.provider}`);
};

const callGemini = async (
  prompt: string, 
  config: AIConfig,
  systemInstruction?: string, 
  jsonMode: boolean = false,
  toolsCallback?: (toolName: string, args: any) => Promise<any>,
  mcpClient?: VirtualMCPClient,
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

    // Handle Web Search (Gemini only)
    if (config.enableWebSearch && !jsonMode) {
       generateConfig.tools = [{ googleSearch: {} }];
    } 
    // Only add Function Calling tools if Web Search is NOT active AND toolsCallback is present
    else if (toolsCallback && !jsonMode) {
        // Base File Tools
        const baseTools: FunctionDeclaration[] = [createFileParams, updateFileParams, deleteFileParams];
        
        // Dynamic MCP Tools
        const dynamicTools = mcpClient ? mcpClient.getTools() : [];

        generateConfig.tools = [{
            functionDeclarations: [...baseTools, ...dynamicTools]
        }];
    }

    const response = await client.models.generateContent({
      model: modelName || DEFAULT_GEMINI_MODEL,
      contents: prompt,
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

    // Handle Function Calls (only if not searching and tools are enabled)
    if (response.functionCalls && toolsCallback && !config.enableWebSearch && !jsonMode) {
      const calls = response.functionCalls;
      let toolOutputs: string[] = [];
      
      for (const call of calls) {
        const result = await toolsCallback(call.name, call.args);
        toolOutputs.push(`Function ${call.name} executed. Result: ${JSON.stringify(result)}`);
      }
      return toolOutputs.join('\n') + "\n\n(AI performed operations based on your request)";
    }

    return outputText;
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
        return callGemini(prompt, config, systemInstruction, jsonMode, toolsCallback, mcpClient, retries - 1);
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
  mcpClient?: VirtualMCPClient
): Promise<string> => {
    const baseUrl = config.baseUrl || 'http://localhost:11434';
    const model = config.model || 'llama3';
    
    const messages: any[] = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
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
        tools = [...OPENAI_TOOLS, ...mappedDynamic];
    }

    let iterations = 0;
    const MAX_ITERATIONS = 5;

    try {
      while (iterations < MAX_ITERATIONS) {
        const body: any = {
          model: model,
          messages: messages,
          stream: false,
          format: jsonMode ? 'json' : undefined,
          options: { temperature: config.temperature },
        };
        
        if (tools) body.tools = tools;

        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        
        if (!response.ok) throw new Error(`Ollama Error: ${response.statusText}`);
        const data = await response.json();
        const message = data.message;
        const toolCalls = message.tool_calls;

        messages.push(message);

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
      }
      return messages[messages.length - 1].content || "Max iterations reached.";
    } catch (error) { throw new Error("Failed to communicate with Ollama."); }
};
  
const callOpenAICompatible = async (
    prompt: string, 
    config: AIConfig, 
    systemInstruction?: string, 
    jsonMode: boolean = false,
    toolsCallback?: (toolName: string, args: any) => Promise<any>,
    mcpClient?: VirtualMCPClient
  ): Promise<string> => {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    
    const messages: any[] = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
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
        tools = [...OPENAI_TOOLS, ...mappedDynamic];
    }

    let iterations = 0;
    const MAX_ITERATIONS = 5;

    try {
      while (iterations < MAX_ITERATIONS) {
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

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey || ''}`
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
        const data = await response.json();
        const choice = data.choices?.[0];
        if (!choice) throw new Error("No choices in response");

        const message = choice.message;
        messages.push(message); 

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
      }
      return messages[messages.length - 1].content || "Max iterations reached.";
    } catch (error: any) { throw new Error(`Failed to connect to AI provider: ${error.message}`); }
};

export const polishContent = async (content: string, config: AIConfig): Promise<string> => {
  const defaultPrompt = "You are an expert technical editor. Improve the provided Markdown content for clarity, grammar, and flow. Return only the polished Markdown.";
  const systemPrompt = config.customPrompts?.polish || defaultPrompt;
  return generateAIResponse(content, config, systemPrompt);
};

export const expandContent = async (content: string, config: AIConfig): Promise<string> => {
  const defaultPrompt = "You are a creative technical writer. Expand on the provided Markdown content, adding relevant details, examples, or explanations. Return only the expanded Markdown.";
  const systemPrompt = config.customPrompts?.expand || defaultPrompt;
  return generateAIResponse(content, config, systemPrompt);
};

export const generateKnowledgeGraph = async (files: MarkdownFile[], config: AIConfig): Promise<GraphData> => {
  const combinedContent = files.map(f => `<<< FILE_START: ${f.name} >>>\n${f.content}\n<<< FILE_END >>>`).join('\n\n');
  
  // Use huge context for Gemini to allow full graph generation
  const limit = config.provider === 'gemini' ? 2000000 : 15000;
  
  const prompt = `Task: Generate a comprehensive Knowledge Graph from the provided notes.
  Goal: Identify granular concepts (entities) and their inter-relationships across the entire knowledge base.
  Output Format: STRICT JSON ONLY.
  Structure: { "nodes": [{"id", "label", "val", "group"}], "links": [{"source", "target", "relationship"}] }
  Content to Analyze: ${combinedContent.substring(0, limit)}`; 
  
  const systemPrompt = "You are an expert Knowledge Graph Architect. Output valid JSON only.";
  
  try {
    const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
    const cleanedJson = extractJson(jsonStr);
    const parsed = JSON.parse(cleanedJson) as GraphData;
    parsed.nodes = parsed.nodes.map(n => ({ ...n, id: n.id || n.label, label: n.label || n.id, val: n.val || 5 }));
    return parsed;
  } catch (e) {
    console.warn("Graph Generation failed, using fallback:", e);
    return { nodes: files.map(f => ({ id: f.name, label: f.name, val: 5 })), links: [] };
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
  
  const prompt = `Analyze the provided Markdown content and generate a deep, hierarchical Mind Map using Mermaid.js syntax.

  STRICT VISUAL & STRUCTURAL RULES:
  1. Root Node: Use double parentheses ((ROOT_TOPIC)) to render it as a Circle.
  2. ALL Child Nodes: MUST use single parentheses (Node Name) to render them as Rounded Rectangles.
     - Do NOT use circles (( )) for children. Rounded rectangles pack text much better and prevent overlapping.
  3. Hierarchy:
     - Use indentation (2 spaces) to represent depth.
     - Group related concepts under common parents.
     - LIMIT IMMEDIATE CHILDREN to 5-7 per node to prevent overcrowding.
  
  CRITICAL SYNTAX SAFETY:
  - Keep labels EXTREMELY concise (max 2-5 words). This is crucial to prevent overlaps.
  - Remove all parentheses '()' inside the node text. They break the syntax.
  - Remove all hash symbols '#' inside the node text.
  - Remove all colons ':' inside the node text.
  - Do NOT use internal Markdown formatting like **bold** or *italic* inside the labels.

  Example Syntax:
  mindmap
    ((Central Topic))
      (Main Branch A)
        (Sub item A1)
        (Sub item A2)
      (Main Branch B)
        (Sub item B1)
  
  Content to Analyze:
  ${content.substring(0, limit)}`;

  const result = await generateAIResponse(prompt, config, "You are a Visualization Expert. Output strictly valid Mermaid mindmap syntax. Ensure no nested parentheses in labels.");
  let clean = cleanCodeBlock(result);
  if (clean.toLowerCase().startsWith('mermaid')) clean = clean.split('\n').slice(1).join('\n').trim();
  if (!clean.toLowerCase().startsWith('mindmap')) clean = 'mindmap\n' + clean;
  return clean.split('\n').filter(line => !line.trim().startsWith('```')).join('\n');
};

const generateQuestionsFromChunks = async (content: string, config: AIConfig): Promise<QuizQuestion[]> => {
    const idealChunkSize = Math.max(800, Math.min(2000, Math.ceil(content.length / 15))); 
    const chunks = chunkText(content, idealChunkSize, 100).slice(0, 15);
    const langPrompt = config.language === 'zh' ? "Provide questions in Chinese." : "Provide questions in English.";
    const systemPrompt = "You are a Quiz Designer. Create 1-3 questions. Return JSON Array.";

    const questionsPromises = chunks.map(async (chunk, index) => {
        const prompt = `Task: Create questions from this text.\nText: "${chunk}"\nRules: ${langPrompt}\nOutput: JSON Array.`;
        try {
            await delay(index * 100); 
            const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
            const parsed = JSON.parse(extractJson(jsonStr));
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
    });

    const results = await Promise.all(questionsPromises);
    const flatQuestions: QuizQuestion[] = [];
    results.forEach((batch, batchIdx) => {
        batch.forEach((q: any, qIdx: number) => {
            if (q && q.question) flatQuestions.push({
                id: `gen-q-${batchIdx}-${qIdx}`,
                type: q.type || 'single',
                question: q.question,
                options: q.options,
                correctAnswer: q.correctAnswer,
                explanation: q.explanation
            });
        });
    });
    return flatQuestions;
};

export const extractQuizFromRawContent = async (content: string, config: AIConfig): Promise<Quiz> => {
   // Enhanced Regex to detect English (Q1, Question 1) and Chinese (问题1, 第1题) and Markdown Headers (# Question)
   // Matches: "Q1.", "Q1:", "1.", "1)", "## Question 1", "### 问题1", "第1题", etc.
   const questionPattern = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:Q\s*\d+|Question\s*\d+|问题\s*\d+|第\s*\d+\s*[题问])[:.．\s]/i;
   
   const matchCount = (content.match(new RegExp(questionPattern, 'g')) || []).length;
   const isStandardList = (content.match(/(?:^|\n)\s*\d+[.．]\s+/g) || []).length > 2; // Matches "1. ", "2. " lists
   
   // If we detect even ONE strong question marker, or a few numbered list items that likely imply a quiz
   if (matchCount >= 1 || isStandardList) {
       // Gemini can handle huge content
       const limit = config.provider === 'gemini' ? 2000000 : 500000;
       
       const prompt = `Task: Extract ALL questions from the provided text verbatim into a JSON format.
       
       Rules:
       1. Preserve the exact text of questions and options.
       2. If options are present (A, B, C, D), extract them into the "options" array.
       3. If a correct answer is marked or implied, include it in "correctAnswer".
       4. Return a valid JSON Object with a "questions" array.
       
       Text Content:
       ${content.substring(0, limit)}`;
       
       const jsonStr = await generateAIResponse(prompt, config, "You are a Data Extractor. Extract questions exactly as they appear. Return JSON.", true);
       const result = JSON.parse(extractJson(jsonStr));
       
       // Handle cases where AI returns array directly vs object wrapper
       const questions = Array.isArray(result) ? result : (result.questions || []);
       
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
   } else {
       // Fallback: Generate NEW questions from the content notes
       const questions = await generateQuestionsFromChunks(content, config);
       if (questions.length === 0) throw new Error("No questions generated.");
       return { id: `quiz-gen-${Date.now()}`, title: "Generated Quiz", description: "Generated from notes.", questions, isGraded: false };
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
  const prompt = `Explain answer.\nQuestion: ${question}\nCorrect: ${correctAnswer}\nUser: ${userAnswer}\nContext: ${context.substring(0, 50000)}`;
  return generateAIResponse(prompt, config, "Helpful Tutor.");
};