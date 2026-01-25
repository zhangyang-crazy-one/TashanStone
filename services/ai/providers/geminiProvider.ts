import type { FunctionDeclaration } from '@google/genai';
import type { AIConfig, ChatMessage, ToolCall, ToolEventCallback } from '@/types';
import { getToolCallAdapter } from '@/services/toolCallAdapters';
import { createToolAnalyzer } from '@/services/toolSelector';
import type { IMCPClient } from '@/services/ai/mcpClients';
import { DEFAULT_GEMINI_MODEL, getGeminiClient } from '@/services/ai/geminiClient';
import { GEMINI_FILE_TOOLS, GEMINI_SEARCH_KB_TOOL } from '@/services/ai/toolDefinitions';
import type { ToolCallback } from '@/services/ai/providerTypes';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const callGemini = async (
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
    const client = getGeminiClient(config.apiKey);
    const modelName = config.model;

    const generateConfig: Record<string, unknown> = {
      systemInstruction
    };

    if (jsonMode) {
      generateConfig.responseMimeType = 'application/json';
    }

    const modelLimit = config.contextEngine?.modelContextLimit ?? 1000000;
    const maxOutputTokens = config.contextEngine?.modelOutputLimit ?? 8192;
    const maxInputTokens = modelLimit - maxOutputTokens - 500;

    const estimateTokens = (text: string): number => Math.ceil(text.length / 3);

    const truncateHistoryForGemini = (
      history: ChatMessage[],
      systemPrompt: string,
      currentPrompt: string,
      maxTokens: number
    ): { contents: Array<Record<string, unknown>>; truncated: number } => {
      const systemTokens = estimateTokens(systemPrompt);
      const currentTokens = estimateTokens(currentPrompt);
      let availableTokens = maxTokens - systemTokens - currentTokens;

      const contents: Array<Record<string, unknown>> = [];

      for (let i = history.length - 1; i >= 0; i -= 1) {
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

    let contents: Array<Record<string, unknown>>;
    let truncatedCount = 0;

    if (conversationHistory && conversationHistory.length > 0) {
      const truncationResult = truncateHistoryForGemini(
        conversationHistory,
        systemInstruction || '',
        prompt,
        maxInputTokens
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

    if (config.enableWebSearch && !jsonMode) {
      generateConfig.tools = [{ googleSearch: {} }];
    } else if (toolsCallback && !jsonMode) {
      const baseTools: FunctionDeclaration[] = [
        ...GEMINI_FILE_TOOLS,
        GEMINI_SEARCH_KB_TOOL
      ];

      const allTools = mcpClient ? mcpClient.getTools() : [];
      const userQuery = prompt || '';
      const toolAnalyzer = createToolAnalyzer();
      const analysisResult = toolAnalyzer.analyze(allTools, userQuery);
      const dynamicTools = toolAnalyzer.selectByIntent(allTools, analysisResult.intent);

      generateConfig.tools = [{
        functionDeclarations: [...baseTools, ...dynamicTools]
      }];
    }

    const toolAdapter = getToolCallAdapter('gemini');

    let iterations = 0;
    const maxIterations = 10;
    let finalResponse = '';

    while (iterations < maxIterations) {
      const response = await client.models.generateContent({
        model: modelName || DEFAULT_GEMINI_MODEL,
        contents,
        config: generateConfig
      });

      let outputText = response.text || '';

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

      if (toolCalls.length > 0 && toolsCallback && !config.enableWebSearch && !jsonMode) {
        contents.push({
          role: 'model',
          parts: response.candidates?.[0]?.content?.parts || []
        });

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

        iterations += 1;
      } else {
        finalResponse = outputText;
        break;
      }
    }

    if (iterations >= maxIterations) {
      return finalResponse || 'Maximum tool iterations reached. Task may be incomplete.';
    }

    return finalResponse;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = typeof (error as { status?: number }).status === 'number'
      ? (error as { status?: number }).status
      : undefined;
    console.warn(`Gemini Attempt Failed (Retries left: ${retries}):`, message);
    const isNetworkError = message && (
      message.includes('xhr error') ||
      message.includes('fetch failed') ||
      status === 503 ||
      status === 500
    );

    if (isNetworkError && retries > 0) {
      await delay(2000);
      return callGemini(
        prompt,
        config,
        systemInstruction,
        jsonMode,
        toolsCallback,
        mcpClient,
        conversationHistory,
        toolEventCallback,
        retries - 1
      );
    }
    throw new Error(`Gemini Error: ${message || 'Unknown error'}`);
  }
};
