import type { AIConfig, MarkdownFile, ChatMessage, ToolEventCallback } from "../types";
import { RealMCPClient, VirtualMCPClient } from "./ai/mcpClients";
import type { IMCPClient, MCPTool } from "./ai/mcpClients";
import { callAnthropic } from "./ai/providers/anthropicProvider";
import { callGemini } from "./ai/providers/geminiProvider";
import { callOllama } from "./ai/providers/ollamaProvider";
import { callOpenAICompatible } from "./ai/providers/openaiProvider";
import type { ToolCallback } from "./ai/providerTypes";
import {
  ApiMessage,
} from "../src/services/context";
import { getContextManager } from "./ai/aiMemoryPipeline";
import { createFeaturePipelines } from "./ai/aiFeaturePipelines";
import {
  buildFinalSystemInstruction,
  buildMcpPromptAddition,
  buildMcpToolDescriptions,
  buildMcpToolGuide,
  buildRagPrompt,
  normalizeMcpTools,
} from "./ai/aiRequestBuilder";
export { RealMCPClient, VirtualMCPClient };
export type { IMCPClient, MCPTool };
export { supportsNativeStreamingToolCalls } from "./ai/streamingProviders";
export { getEmbedding } from "./ai/embeddings";
export { generateAIResponseStream } from "./ai/aiStreamingPipeline";

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
  
  const fullPrompt = buildRagPrompt({ prompt, config, contextFiles, retrievedContext });

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
  const normalizedTools = normalizeMcpTools(rawTools2);
  const mcpToolDescriptions = buildMcpToolDescriptions(normalizedTools);
  const toolGuide2 = buildMcpToolGuide(normalizedTools, config.language);
  const mcpPromptAddition = buildMcpPromptAddition({
    toolCount: normalizedTools.length,
    toolDescriptions: mcpToolDescriptions,
    toolGuide: toolGuide2,
    mode: 'nonStreaming',
  });

  const finalSystemInstruction = buildFinalSystemInstruction({
    systemInstruction,
    mcpPromptAddition,
    language: config.language,
  });

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

const featurePipelines = createFeaturePipelines({ generateAIResponse });

export const polishContent = featurePipelines.polishContent;
export const expandContent = featurePipelines.expandContent;
export const generateKnowledgeGraph = featurePipelines.generateKnowledgeGraph;
export const synthesizeKnowledgeBase = featurePipelines.synthesizeKnowledgeBase;
export const generateMindMap = featurePipelines.generateMindMap;
export const extractQuizFromRawContent = featurePipelines.extractQuizFromRawContent;
export const generateQuiz = featurePipelines.generateQuiz;
export const gradeQuizQuestion = featurePipelines.gradeQuizQuestion;
export const generateQuizExplanation = featurePipelines.generateQuizExplanation;

// ========================
// Context Engineering Integration
// ========================

export {
  addMessageToContext,
  addMessagesToContext,
  addMessageToMemory,
  analyzeContextUsage,
  analyzeSessionForMemory,
  autoCreateMemoryFromSession,
  clearAllContextManagers,
  clearContext,
  clearMemorySession,
  convertApiMessageToChatMessage,
  convertChatMessageToApiMessage,
  createContextCheckpoint,
  createContextManagerForSession,
  createMemoryFromCandidate,
  createMemoryFromCheckpoint,
  deleteContextCheckpoint,
  deletePermanentMemory,
  disableContextPersistence,
  enableContextPersistence,
  getAllMemoryStats,
  getCompactedSessions,
  getContextCacheStats,
  getContextCheckpoints,
  getContextManager,
  getContextMemoryService,
  getContextMessages,
  getEffectiveContextHistory,
  getGlobalCheckpointStorage,
  getMemoryContext,
  getMemoryStats,
  getPermanentMemories,
  getPermanentMemory,
  getPersistentMemoryService,
  initPersistentMemory,
  initializeContextMemory,
  initializePersistentMemory,
  manageContextForSession,
  promoteSessionToLongTerm,
  promoteSessionToMidTerm,
  promoteToPermanentMemory,
  removeContextManager,
  reconstructContextWithMemories,
  restoreContextFromCheckpoint,
  saveCompactedSession,
  searchPermanentMemories,
  searchRelevantHistory,
  setContextMemoryService,
  setGlobalCheckpointStorage,
  setMemoryEmbeddingService,
  setPersistentMemoryService,
  updatePermanentMemory,
} from "./ai/aiMemoryPipeline";
export type { ChatMessageForMemory, CheckpointStorage, MemoryStats } from "./ai/aiMemoryPipeline";

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

export { suggestTags } from "./ai/aiTagPipeline";
