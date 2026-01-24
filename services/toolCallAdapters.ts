import { AIProvider, JsonValue, ToolCall } from '../types';

type ProviderToolCallStatus = ToolCall['status'];

export interface ToolCallAdapter {
  provider: AIProvider;
  hasToolCalls(response: unknown): boolean;
  parseResponse(response: unknown): ToolCall[];
  formatResult(toolCall: ToolCall, result: JsonValue): unknown;
}

export interface StreamingToolCallState {
  id: string;
  name: string;
  rawArguments: string;
}

export interface StreamingAdapterState {
  toolCalls: Map<number, StreamingToolCallState>;
  accumulatedText: string;
  finishReason?: string;
  isComplete: boolean;
}

export interface StreamingToolCallAdapter extends ToolCallAdapter {
  parseStreamingChunk(chunk: unknown, state: StreamingAdapterState): StreamingAdapterState;
  getToolCalls(state: StreamingAdapterState): ToolCall[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const createToolCallId = (provider: AIProvider, index: number) =>
  `${provider}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeArgs = (args: unknown): Record<string, JsonValue> => {
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args) as Record<string, JsonValue>;
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
    }
    return {};
  }

  if (isRecord(args)) {
    return args as Record<string, JsonValue>;
  }

  return {};
};

const parseToolArgs = (rawArgs: string): { args: Record<string, JsonValue>; partialArgs?: Record<string, JsonValue> } => {
  if (!rawArgs.trim()) {
    return { args: {} };
  }

  try {
    const parsed = JSON.parse(rawArgs) as Record<string, JsonValue>;
    if (isRecord(parsed)) {
      return { args: parsed };
    }
  } catch {
  }

  return { args: {} };
};

export const createStreamingAdapterState = (): StreamingAdapterState => ({
  toolCalls: new Map<number, StreamingToolCallState>(),
  accumulatedText: '',
  finishReason: undefined,
  isComplete: false
});

const buildToolCall = (
  provider: AIProvider,
  name: string,
  args: unknown,
  id?: string,
  status: ProviderToolCallStatus = 'pending'
): ToolCall => ({
  id: id || createToolCallId(provider, 0),
  name,
  args: normalizeArgs(args),
  status,
  provider
});

const extractOpenAIToolCalls = (message: Record<string, unknown>, provider: AIProvider) => {
  const toolCalls = message.tool_calls;
  if (!Array.isArray(toolCalls)) {
    return [];
  }

  return toolCalls
    .map((toolCall, index) => {
      if (!isRecord(toolCall) || !isRecord(toolCall.function)) {
        return null;
      }

      const name = typeof toolCall.function.name === 'string' ? toolCall.function.name : '';
      if (!name) {
        return null;
      }

      const id = typeof toolCall.id === 'string' ? toolCall.id : createToolCallId(provider, index);
      const args = toolCall.function.arguments;

      return buildToolCall(provider, name, args, id);
    })
    .filter((toolCall): toolCall is ToolCall => toolCall !== null);
};

const GeminiAdapter: ToolCallAdapter = {
  provider: 'gemini',
  hasToolCalls(response: unknown) {
    return isRecord(response) && Array.isArray(response.functionCalls);
  },
  parseResponse(response: unknown) {
    if (!isRecord(response) || !Array.isArray(response.functionCalls)) {
      return [];
    }

    return response.functionCalls
      .map((call, index) => {
        if (!isRecord(call)) {
          return null;
        }
        const name = typeof call.name === 'string' ? call.name : '';
        if (!name) {
          return null;
        }
        return buildToolCall('gemini', name, call.args, createToolCallId('gemini', index));
      })
      .filter((toolCall): toolCall is ToolCall => toolCall !== null);
  },
  formatResult(toolCall, result) {
    return {
      role: 'user',
      parts: [{
        functionResponse: {
          name: toolCall.name,
          response: result
        }
      }]
    };
  }
};

const OpenAIAdapter: ToolCallAdapter = {
  provider: 'openai',
  hasToolCalls(response: unknown) {
    if (!isRecord(response)) {
      return false;
    }
    const choices = response.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      return false;
    }
    const choice = choices[0];
    return isRecord(choice) && isRecord(choice.message) && Array.isArray(choice.message.tool_calls);
  },
  parseResponse(response: unknown) {
    if (!isRecord(response)) {
      return [];
    }
    const choices = response.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      return [];
    }
    const choice = choices[0];
    if (!isRecord(choice) || !isRecord(choice.message)) {
      return [];
    }
    return extractOpenAIToolCalls(choice.message, 'openai');
  },
  formatResult(toolCall, result) {
    const content = typeof result === 'string' ? result : JSON.stringify(result);
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content
    };
  }
};

const OllamaAdapter: ToolCallAdapter = {
  provider: 'ollama',
  hasToolCalls(response: unknown) {
    return isRecord(response) &&
      isRecord(response.message) &&
      Array.isArray((response.message as Record<string, unknown>).tool_calls);
  },
  parseResponse(response: unknown) {
    if (!isRecord(response) || !isRecord(response.message)) {
      return [];
    }
    return extractOpenAIToolCalls(response.message, 'ollama');
  },
  formatResult(_toolCall, result) {
    return {
      role: 'tool',
      content: JSON.stringify(result)
    };
  }
};

const AnthropicAdapter: ToolCallAdapter = {
  provider: 'anthropic',
  hasToolCalls(response: unknown) {
    return isRecord(response) && Array.isArray(response.content) &&
      response.content.some(block => isRecord(block) && block.type === 'tool_use');
  },
  parseResponse(response: unknown) {
    if (!isRecord(response) || !Array.isArray(response.content)) {
      return [];
    }

    return response.content
      .map((block, index) => {
        if (!isRecord(block) || block.type !== 'tool_use') {
          return null;
        }
        const name = typeof block.name === 'string' ? block.name : '';
        if (!name) {
          return null;
        }
        const id = typeof block.id === 'string' ? block.id : createToolCallId('anthropic', index);
        return buildToolCall('anthropic', name, block.input, id);
      })
      .filter((toolCall): toolCall is ToolCall => toolCall !== null);
  },
  formatResult(toolCall, result) {
    return {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolCall.id,
        content: JSON.stringify(result)
      }]
    };
  }
};

const parseSseData = (chunk: string): Array<Record<string, unknown>> => {
  const events: Array<Record<string, unknown>> = [];
  const lines = chunk.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) {
      continue;
    }
    const data = trimmed.replace(/^data:\s*/, '');
    if (!data || data === '[DONE]') {
      continue;
    }
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      if (isRecord(parsed)) {
        events.push(parsed);
      }
    } catch {
    }
  }
  return events;
};

const isToolStopReason = (reason?: string) =>
  reason === 'tool_use' || reason === 'tool_calls' || reason === 'tool_call';

const isOpenAIToolStopReason = (reason?: string) =>
  reason === 'tool_calls' || reason === 'tool_call' || reason === 'function_call';

const buildStreamingToolCall = (
  provider: AIProvider,
  index: number,
  state: StreamingToolCallState
): ToolCall | null => {
  if (!state.name) {
    return null;
  }

  const parsed = parseToolArgs(state.rawArguments);
  const rawArgs = state.rawArguments.trim() ? state.rawArguments : undefined;

  return {
    id: state.id || createToolCallId(provider, index),
    name: state.name,
    args: parsed.args,
    partialArgs: parsed.partialArgs,
    rawArgs,
    status: 'pending',
    provider
  };
};

const OpenAIStreamingAdapter: StreamingToolCallAdapter = {
  provider: 'openai',
  hasToolCalls: OpenAIAdapter.hasToolCalls,
  parseResponse: OpenAIAdapter.parseResponse,
  formatResult: OpenAIAdapter.formatResult,
  parseStreamingChunk(chunk, state) {
    const events = typeof chunk === 'string'
      ? parseSseData(chunk)
      : isRecord(chunk) ? [chunk] : [];

    for (const event of events) {
      const choices = Array.isArray(event.choices) ? event.choices : [];
      const choice = choices[0];
      if (!isRecord(choice)) {
        continue;
      }
      const delta = isRecord(choice.delta) ? choice.delta : null;
      if (delta) {
        if (typeof delta.content === 'string') {
          state.accumulatedText += delta.content;
        }
        const toolCalls = delta.tool_calls;
        if (Array.isArray(toolCalls)) {
          for (const call of toolCalls) {
            if (!isRecord(call)) continue;
            const index = typeof call.index === 'number' ? call.index : 0;
            const existing = state.toolCalls.get(index) || { id: '', name: '', rawArguments: '' };
            if (typeof call.id === 'string') {
              existing.id = call.id;
            }
            if (isRecord(call.function)) {
              if (typeof call.function.name === 'string') {
                existing.name = call.function.name;
              }
              if (typeof call.function.arguments === 'string') {
                existing.rawArguments += call.function.arguments;
              }
            }
            state.toolCalls.set(index, existing);
          }
        }
      }

      if (typeof choice.finish_reason === 'string') {
        state.finishReason = choice.finish_reason;
        if (isOpenAIToolStopReason(choice.finish_reason)) {
          state.isComplete = true;
        }
      }
    }

    return state;
  },
  getToolCalls(state) {
    return Array.from(state.toolCalls.entries())
      .map(([index, callState]) => buildStreamingToolCall('openai', index, callState))
      .filter((toolCall): toolCall is ToolCall => toolCall !== null);
  }
};

const AnthropicStreamingAdapter: StreamingToolCallAdapter = {
  provider: 'anthropic',
  hasToolCalls: AnthropicAdapter.hasToolCalls,
  parseResponse: AnthropicAdapter.parseResponse,
  formatResult: AnthropicAdapter.formatResult,
  parseStreamingChunk(chunk, state) {
    const events = typeof chunk === 'string'
      ? parseSseData(chunk)
      : isRecord(chunk) ? [chunk] : [];

    for (const event of events) {
      const eventType = typeof event.type === 'string' ? event.type : '';
      if (eventType === 'message_delta' && isRecord(event.delta)) {
        const delta = event.delta as Record<string, unknown>;
        if (typeof delta.stop_reason === 'string') {
          state.finishReason = delta.stop_reason;
          if (isToolStopReason(delta.stop_reason)) {
            state.isComplete = true;
          }
        }
      }
      if (eventType === 'content_block_start' && isRecord(event.content_block)) {
        const index = typeof event.index === 'number' ? event.index : 0;
        const block = event.content_block as Record<string, unknown>;
        if (block.type === 'tool_use') {
          const existing = state.toolCalls.get(index) || { id: '', name: '', rawArguments: '' };
          if (typeof block.id === 'string') {
            existing.id = block.id;
          }
          if (typeof block.name === 'string') {
            existing.name = block.name;
          }
          if (!existing.rawArguments) {
            const input = block.input;
            if (typeof input === 'string') {
              existing.rawArguments = input;
            } else if (isRecord(input) || Array.isArray(input)) {
              existing.rawArguments = JSON.stringify(input);
            }
          }
          state.toolCalls.set(index, existing);
        }
      }

      if (eventType === 'content_block_delta' && isRecord(event.delta)) {
        const delta = event.delta as Record<string, unknown>;
        if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const index = typeof event.index === 'number' ? event.index : 0;
          const existing = state.toolCalls.get(index) || { id: '', name: '', rawArguments: '' };
          existing.rawArguments += delta.partial_json;
          state.toolCalls.set(index, existing);
        }
        if (typeof delta.text === 'string') {
          state.accumulatedText += delta.text;
        }
      }

      if (eventType === 'message_stop') {
        if (typeof event.stop_reason === 'string') {
          state.finishReason = event.stop_reason;
          if (isToolStopReason(event.stop_reason)) {
            state.isComplete = true;
          }
        }
        if (!state.isComplete && state.toolCalls.size > 0) {
          state.isComplete = true;
        }
      }
    }

    return state;
  },
  getToolCalls(state) {
    return Array.from(state.toolCalls.entries())
      .map(([index, callState]) => buildStreamingToolCall('anthropic', index, callState))
      .filter((toolCall): toolCall is ToolCall => toolCall !== null);
  }
};

export const getToolCallAdapter = (provider: AIProvider): ToolCallAdapter => {
  switch (provider) {
    case 'gemini':
      return GeminiAdapter;
    case 'openai':
      return OpenAIAdapter;
    case 'anthropic':
      return AnthropicAdapter;
    case 'ollama':
      return OllamaAdapter;
    default:
      return OpenAIAdapter;
  }
};

export const getStreamingToolCallAdapter = (provider: AIProvider): StreamingToolCallAdapter | null => {
  switch (provider) {
    case 'openai':
      return OpenAIStreamingAdapter;
    case 'anthropic':
      return AnthropicStreamingAdapter;
    default:
      return null;
  }
};
