import type { AIConfig, MarkdownFile, GraphData, Quiz, QuizQuestion, ChatMessage, JsonValue, ToolCall, ToolEventCallback } from "../types";
import { mcpService } from "../src/services/mcpService";
import { platformFetch } from "../src/services/ai/platformFetch";
import {
  createStreamingAdapterState,
  getStreamingToolCallAdapter,
  getToolCallAdapter,
} from "./toolCallAdapters";
import { RealMCPClient, VirtualMCPClient } from "./ai/mcpClients";
import type { IMCPClient, MCPTool } from "./ai/mcpClients";
import { generateMCPToolGuide } from "./ai/mcpToolGuide";
import { DEFAULT_GEMINI_MODEL, getGeminiClient } from "./ai/geminiClient";
import { callAnthropic } from "./ai/providers/anthropicProvider";
import { callGemini } from "./ai/providers/geminiProvider";
import { callOllama } from "./ai/providers/ollamaProvider";
import { callOpenAICompatible } from "./ai/providers/openaiProvider";
import type { ToolCallback } from "./ai/providerTypes";
import {
  streamAnthropic,
  streamGemini,
  streamOllama,
  streamOpenAICompatible,
  supportsNativeStreamingToolCalls
} from "./ai/streamingProviders";
import { buildAnthropicToolsForPrompt, buildOpenAIToolsForPrompt } from "./ai/toolDefinitions";
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
export { RealMCPClient, VirtualMCPClient };
export type { IMCPClient, MCPTool };
export { supportsNativeStreamingToolCalls };
export { getEmbedding } from "./ai/embeddings";

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
        const client = getGeminiClient(config.apiKey);

        const response = await client.models.generateContent({
          model: config.model || DEFAULT_GEMINI_MODEL,
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
