import type { AIConfig, ChatMessage, ToolCall, ToolEventCallback } from '@/types';
import { platformFetch } from '@/src/services/ai/platformFetch';
import { getToolCallAdapter } from '@/services/toolCallAdapters';
import type { IMCPClient } from '@/services/ai/mcpClients';
import type { OpenAIToolDefinition } from '@/services/ai/toolDefinitions';
import { buildOpenAIToolsForPrompt } from '@/services/ai/toolDefinitions';
import type { ToolCallback } from '@/services/ai/providerTypes';

export const callOpenAICompatible = async (
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

  const modelLimit = config.contextEngine?.modelContextLimit ?? 128000;
  const maxOutputTokens = config.contextEngine?.modelOutputLimit ?? 4096;
  const maxInputTokens = modelLimit - maxOutputTokens - 500;

  const estimateTokens = (text: string): number => Math.ceil(text.length / 3);

  const truncateHistoryForOpenAI = (
    history: ChatMessage[],
    systemPrompt: string,
    currentPrompt: string,
    maxTokens: number
  ): { messages: Array<Record<string, unknown>>; truncated: number } => {
    const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
    const currentTokens = estimateTokens(currentPrompt);
    let availableTokens = maxTokens - systemTokens - currentTokens;

    const messages: Array<Record<string, unknown>> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    for (let i = history.length - 1; i >= 0; i -= 1) {
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

  let messages: Array<Record<string, unknown>>;
  let truncatedCount = 0;

  if (conversationHistory && conversationHistory.length > 0) {
    const truncationResult = truncateHistoryForOpenAI(
      conversationHistory,
      systemInstruction || '',
      prompt,
      maxInputTokens
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
  const totalTimeoutMs = 10 * 60 * 1000;
  const singleRoundTimeoutMs = 60 * 1000;
  const startTime = Date.now();

  try {
    while (true) {
      if (Date.now() - startTime > totalTimeoutMs) {
        console.log('[OpenAI] Total timeout reached after', iterations, 'iterations');
        return String(messages[messages.length - 1]?.content || 'Total timeout reached (10 minutes).');
      }

      const body: Record<string, unknown> = {
        model: config.model,
        messages,
        temperature: config.temperature,
        response_format: jsonMode ? { type: 'json_object' } : undefined
      };

      if (tools) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), singleRoundTimeoutMs);

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

        if (!response.ok) {
          throw new Error(`API Error: ${response.statusText}`);
        }
        const data = await response.json();
        const choice = data.choices?.[0];
        if (!choice) {
          throw new Error('No choices in response');
        }

        const message = choice.message;
        messages.push(message);

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
          iterations += 1;
        } else {
          return message.content || '';
        }
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.log('[OpenAI] Single round timeout after', iterations, 'iterations');
          return String(messages[messages.length - 1]?.content || 'Single round timeout (60 seconds).');
        }
        throw fetchError;
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to connect to AI provider: ${message}`);
  }
};
