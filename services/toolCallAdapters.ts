import { AIProvider, JsonValue, ToolCall } from '../types';

type ProviderToolCallStatus = ToolCall['status'];

export interface ToolCallAdapter {
  provider: AIProvider;
  hasToolCalls(response: unknown): boolean;
  parseResponse(response: unknown): ToolCall[];
  formatResult(toolCall: ToolCall, result: JsonValue): unknown;
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
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(result)
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
