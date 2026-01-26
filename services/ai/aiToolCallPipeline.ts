import type { AIConfig, JsonValue, ToolCall } from "../../types";
import { extractLastUrl } from "./aiTextUtils";

const INTERNAL_TOOL_NAMES = new Set([
  'create_file',
  'update_file',
  'delete_file',
  'read_file',
  'search_files',
  'search_knowledge_base'
]);

const STREAMING_TOOL_RESULT_MAX_CHARS = 8000;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

export const applyToolCallFallbackArgs = (toolCall: ToolCall, contextText: string): ToolCall => {
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

export const ensureJsonArguments = (
  rawArgs: string | undefined,
  args: Record<string, JsonValue> | undefined
): string => {
  if (typeof rawArgs === 'string' && rawArgs.trim().length > 0) {
    try {
      JSON.parse(rawArgs);
      return rawArgs;
    } catch {
      // Fall through to stringify args.
    }
  }
  return JSON.stringify(args ?? {});
};

export const isOpenAICompatibleEndpoint = (config: AIConfig): boolean => {
  const baseUrl = (config.baseUrl || '').toLowerCase();
  if (!baseUrl) {
    return false;
  }
  return !baseUrl.includes('api.openai.com');
};

export const buildOpenAIToolCallMessage = (
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

export const formatMCPToolResult = (toolName: string, result: unknown): string => {
  const resultRecord = isRecord(result) ? result : undefined;
  const successValue = resultRecord?.success;
  const isSuccess = successValue !== false;
  const statusEmoji = isSuccess ? '✅' : '❌';
  const errorMsg = resultRecord?.output ?? resultRecord?.error ?? resultRecord?.message ?? '';

  if (!isSuccess) {
    const errorDetail = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);
    return `${statusEmoji} **${toolName}** failed\n> Error: ${errorDetail}`;
  }

  if (toolName === 'take_snapshot' || toolName.includes('snapshot')) {
    const output = resultRecord?.output ?? result;
    if (typeof output === 'string' && output.includes('Page content')) {
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
    const output = resultRecord?.output ?? '';
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
    const pages = resultRecord?.pages ?? result;
    if (Array.isArray(pages)) {
      return `${statusEmoji} **Found ${pages.length} pages**`;
    }
  }

  const outputValue = resultRecord?.output;
  if (typeof outputValue === 'string') {
    if (outputValue.length > 500) {
      return `${statusEmoji} **${toolName}** completed\n\`\`\`\n${outputValue.substring(0, 500)}...\n\`\`\``;
    }
    return `${statusEmoji} **${toolName}** completed\n\`\`\`\n${outputValue}\n\`\`\``;
  }

  const jsonStr = JSON.stringify(result, null, 2);
  if (jsonStr.length > 300) {
    return `${statusEmoji} **${toolName}** completed (result truncated)`;
  }
  return `${statusEmoji} **${toolName}** completed`;
};

export const compactToolResultForStreaming = (toolName: string, result: JsonValue): JsonValue => {
  if (INTERNAL_TOOL_NAMES.has(toolName)) {
    return result;
  }

  const formatted = formatMCPToolResult(toolName, result);
  if (formatted.length > STREAMING_TOOL_RESULT_MAX_CHARS) {
    return `${formatted.slice(0, STREAMING_TOOL_RESULT_MAX_CHARS)}...(truncated)`;
  }
  return formatted;
};

export { INTERNAL_TOOL_NAMES, STREAMING_TOOL_RESULT_MAX_CHARS };
