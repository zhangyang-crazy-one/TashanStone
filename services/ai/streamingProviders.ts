import type { AIConfig, ChatMessage, ToolEventCallback } from '@/types';
import { platformStreamFetch } from '@/src/services/ai/platformFetch';
import type { StreamingAdapterState, StreamingToolCallAdapter } from '../toolCallAdapters';
import type { AnthropicToolDefinition, OpenAIToolDefinition } from './toolDefinitions';
import { DEFAULT_GEMINI_MODEL, getGeminiClient } from './geminiClient';

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

const isMiniMaxCompatible = (config: AIConfig): boolean => {
  const baseUrl = (config.baseUrl || '').toLowerCase();
  const model = (config.model || '').toLowerCase();
  return baseUrl.includes('minimax') || baseUrl.includes('minimaxi') || model.includes('minimax');
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

export interface OpenAIStreamOptions {
  tools?: OpenAIToolDefinition[];
  messagesOverride?: Array<Record<string, unknown>>;
  streamingAdapter?: StreamingToolCallAdapter;
  adapterState?: StreamingAdapterState;
  toolEventCallback?: ToolEventCallback;
}

export interface AnthropicStreamOptions {
  tools?: AnthropicToolDefinition[];
  messagesOverride?: Array<Record<string, unknown>>;
  streamingAdapter?: StreamingToolCallAdapter;
  adapterState?: StreamingAdapterState;
  toolEventCallback?: ToolEventCallback;
}

export async function* streamGemini(
  prompt: string,
  config: AIConfig,
  systemInstruction?: string,
  conversationHistory?: ChatMessage[]
): AsyncGenerator<string, void, unknown> {
  try {
    const client = getGeminiClient(config.apiKey);
    const modelName = config.model || DEFAULT_GEMINI_MODEL;

    const contents: Array<Record<string, unknown>> = [];

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

    const generateConfig: Record<string, unknown> = { systemInstruction };

    const result = await client.models.generateContentStream({
      model: modelName,
      contents,
      config: generateConfig
    });

    for await (const chunk of result) {
      const text = chunk.text;
      if (text) {
        yield text;
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Gemini Streaming Error: ${message}`);
  }
}

export async function* streamOllama(
  prompt: string,
  config: AIConfig,
  systemInstruction?: string,
  conversationHistory?: ChatMessage[]
): AsyncGenerator<string, void, unknown> {
  const baseUrl = config.baseUrl || 'http://localhost:11434';
  const model = config.model || 'llama3';

  const messages: Array<Record<string, unknown>> = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
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

    let buffer = '';
    for await (const chunk of platformStreamFetch(url, options)) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            yield json.message.content;
          }
        } catch {
          // Skip invalid JSON lines.
        }
      }
    }

    if (buffer.trim()) {
      try {
        const json = JSON.parse(buffer);
        if (json.message?.content) {
          yield json.message.content;
        }
      } catch {
        // Skip invalid JSON.
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Ollama Streaming Error: ${message}`);
  }
}

export async function* streamAnthropic(
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

  const modelLimit = config.contextEngine?.modelContextLimit ?? 200000;
  const maxOutputTokens = config.contextEngine?.modelOutputLimit ??
    Math.floor(modelLimit * 0.08) ?? 4096;
  const logStreamEvents = shouldLogAnthropicStream();

  try {
    const requestBody: Record<string, unknown> = {
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: maxOutputTokens,
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
          if (data === '[DONE]') {
            continue;
          }

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
          } catch {
            // Skip invalid JSON.
          }
        }
      }
    }

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
        } catch {
          // Skip invalid JSON.
        }
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Anthropic Streaming Error: ${message}`);
  }
}

export async function* streamOpenAICompatible(
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
          if (data === '[DONE]') {
            continue;
          }

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
            if (content) {
              yield content;
            }
          } catch {
            // Skip invalid JSON.
          }
        }
      }
    }

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
          if (content) {
            yield content;
          }
        } catch {
          // Skip invalid JSON.
        }
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Streaming Error: ${message}`);
  }
}
