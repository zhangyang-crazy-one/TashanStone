import type { JsonValue } from '../../types';

export interface ToolCallExtraction {
  name: string;
  args: Record<string, JsonValue>;
  startIndex: number;
  endIndex: number;
}

const isPlainObject = (value: JsonValue): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeJsonString = (raw: string): string => {
  let result = '';
  let inString = false;
  let escape = false;
  for (const char of raw) {
    if (escape) {
      result += char;
      escape = false;
      continue;
    }
    if (char === '\\') {
      result += char;
      if (inString) {
        escape = true;
      }
      continue;
    }
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }
    if (inString && (char === '\n' || char === '\r')) {
      result += '\\n';
      continue;
    }
    result += char;
  }
  return result;
};

const parseJsonValue = (raw: string): JsonValue | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
  }
  const sanitized = sanitizeJsonString(trimmed);
  if (sanitized !== trimmed) {
    try {
      return JSON.parse(sanitized) as JsonValue;
    } catch {
    }
  }
  return null;
};

const parseJsonArgs = (raw: string): Record<string, JsonValue> | null => {
  const parsed = parseJsonValue(raw);
  if (parsed && isPlainObject(parsed)) {
    return parsed;
  }
  return null;
};

const normalizeToolArgs = (raw: JsonValue | undefined): Record<string, JsonValue> => {
  if (typeof raw === 'string') {
    return parseJsonArgs(raw) ?? { raw };
  }
  if (isPlainObject(raw)) {
    return raw;
  }
  if (raw !== undefined) {
    return { input: raw };
  }
  return {};
};

const parseToolCallPayload = (raw: string): { name: string; args: Record<string, JsonValue> } | null => {
  const parsed = parseJsonValue(raw);
  if (!parsed || !isPlainObject(parsed)) {
    const toolNameMatch = raw.match(/"tool"\s*:\s*"([^"]+)"/) || raw.match(/"name"\s*:\s*"([^"]+)"/);
    if (!toolNameMatch) {
      return null;
    }
    const toolName = toolNameMatch[1].trim();
    if (!toolName) {
      return null;
    }

    const extractArgsBlock = (key: 'arguments' | 'args' | 'input'): string | null => {
      const keyIndex = raw.indexOf(`"${key}"`);
      if (keyIndex === -1) {
        return null;
      }
      const braceStart = raw.indexOf('{', keyIndex);
      if (braceStart === -1) {
        return null;
      }
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = braceStart; i < raw.length; i++) {
        const char = raw[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          if (inString) {
            escape = true;
          }
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === '{') {
            depth += 1;
          } else if (char === '}') {
            depth -= 1;
            if (depth === 0) {
              return raw.slice(braceStart, i + 1);
            }
          }
        }
      }
      return null;
    };

    const argsBlock = extractArgsBlock('arguments') || extractArgsBlock('args') || extractArgsBlock('input');
    if (argsBlock) {
      const parsedArgs = parseJsonValue(argsBlock);
      if (parsedArgs && isPlainObject(parsedArgs)) {
        return { name: toolName, args: parsedArgs };
      }
    }

    return { name: toolName, args: {} };
  }
  const toolName = typeof parsed.tool === 'string'
    ? parsed.tool
    : typeof parsed.name === 'string'
      ? parsed.name
      : '';
  if (!toolName.trim()) {
    return null;
  }
  const rawArgs = (parsed.arguments ?? parsed.args ?? parsed.input) as JsonValue | undefined;
  return { name: toolName.trim(), args: normalizeToolArgs(rawArgs) };
};

const parseInvokeArguments = (raw: string): Record<string, JsonValue> => {
  const args: Record<string, JsonValue> = {};
  const paramPattern = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/gi;
  let match: RegExpExecArray | null;
  while ((match = paramPattern.exec(raw)) !== null) {
    args[match[1]] = match[2].trim();
  }
  if (Object.keys(args).length > 0) {
    return args;
  }
  return parseJsonArgs(raw) ?? { raw: raw.trim() };
};

export const extractToolCallsFromText = (text: string): ToolCallExtraction[] => {
  const matches: ToolCallExtraction[] = [];

  const overlaps = (start: number, end: number) =>
    matches.some(existing =>
      (start >= existing.startIndex && start < existing.endIndex) ||
      (end > existing.startIndex && end <= existing.endIndex)
    );

  const addMatch = (start: number, end: number, name: string, args: Record<string, JsonValue>) => {
    if (!name.trim()) {
      return;
    }
    if (overlaps(start, end)) {
      return;
    }
    matches.push({ name: name.trim(), args, startIndex: start, endIndex: end });
  };

  const toolCallBlock = /```tool_call\s*\n([\s\S]*?)```/gi;
  for (const match of text.matchAll(toolCallBlock)) {
    if (match.index === undefined) continue;
    const rawJson = (match[1] || '').trim().replace(/,\s*}/, '}').replace(/,\s*]/, ']');
    const parsed = parseToolCallPayload(rawJson);
    if (parsed) {
      addMatch(match.index, match.index + match[0].length, parsed.name, parsed.args);
    }
  }

  const xmlToolCall = /<(?:minimax:)?tool_call>\s*<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>\s*<\/(?:minimax:)?tool_call>/gi;
  for (const match of text.matchAll(xmlToolCall)) {
    if (match.index === undefined) continue;
    const toolName = (match[1] || '').trim();
    addMatch(match.index, match.index + match[0].length, toolName, parseInvokeArguments(match[2] || ''));
  }

  const jsonToolCall = /<(?:minimax:)?tool_call>\s*([\s\S]*?)<\/(?:minimax:)?tool_call>/gi;
  for (const match of text.matchAll(jsonToolCall)) {
    if (match.index === undefined) continue;
    const inner = match[1] || '';
    if (inner.includes('<invoke')) {
      continue;
    }
    const parsed = parseToolCallPayload(inner);
    if (parsed) {
      addMatch(match.index, match.index + match[0].length, parsed.name, parsed.args);
    }
  }

  const simpleInvoke = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/gi;
  for (const match of text.matchAll(simpleInvoke)) {
    if (match.index === undefined) continue;
    const toolName = (match[1] || '').trim();
    addMatch(match.index, match.index + match[0].length, toolName, parseInvokeArguments(match[2] || ''));
  }

  const toolResultBlock = /<tool_result\b([^>]*)>([\s\S]*?)<\/tool_result>/gi;
  for (const match of text.matchAll(toolResultBlock)) {
    if (match.index === undefined) continue;
    const attrs = match[1] || '';
    const toolNameMatch = attrs.match(/name=(?:"([^"]+)"|'([^']+)')/i);
    const toolName = (toolNameMatch?.[1] || toolNameMatch?.[2] || '').trim();
    if (!toolName) {
      continue;
    }
    const typeMatch = attrs.match(/type=(?:"([^"]+)"|'([^']+)')/i);
    const typeValue = (typeMatch?.[1] || typeMatch?.[2] || '').toLowerCase();
    const urlMatch = attrs.match(/url=(?:"([^"]+)"|'([^']+)')/i);
    const urlValue = (urlMatch?.[1] || urlMatch?.[2] || '').trim();

    let args: Record<string, JsonValue> = {};
    if (urlValue) {
      args = { url: urlValue };
    } else {
      const content = (match[2] || '').trim();
      const parsedValue = parseJsonValue(content);
      if (parsedValue !== null) {
        args = isPlainObject(parsedValue) ? parsedValue : { input: parsedValue };
      } else if (content) {
        args = typeValue === 'url' ? { url: content } : { text: content };
      }
    }
    addMatch(match.index, match.index + match[0].length, toolName, args);
  }

  const markdownTool = /🔧\s*\*\*(?:Tool|Executing):\s*([^*]+)\*\*(?:\.\.\.)?(?:\s*```json\s*([\s\S]*?)```)?/gi;
  for (const match of text.matchAll(markdownTool)) {
    if (match.index === undefined) continue;
    const toolName = (match[1] || '').trim();
    const args = parseJsonArgs(match[2] || '') ?? {};
    addMatch(match.index, match.index + match[0].length, toolName, args);
  }

  return matches.sort((a, b) => a.startIndex - b.startIndex);
};
