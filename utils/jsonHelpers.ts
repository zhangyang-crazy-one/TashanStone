import { JsonValue } from '../types';

export interface ParsedToolResult {
  success?: boolean;
  output?: JsonValue;
  error?: JsonValue;
  [key: string]: JsonValue | undefined;
}

export const deepParseJson = (value: JsonValue, maxDepth: number = 3): JsonValue => {
  if (maxDepth <= 0) return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();

  const jsonPatterns = [
    /^{\s*["']?\w+["']?\s*:/,
    /^\[/,
    /^{/,
  ];

  const hasJsonPrefix = jsonPatterns.some(pattern => pattern.test(trimmed));

  if (
    hasJsonPrefix ||
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      const parsed = JSON.parse(trimmed) as JsonValue;
      return deepParseJson(parsed, maxDepth - 1);
    } catch {
    }
  }

  const embeddedPatterns = [
    /(?:^|\n)json\s*\n([\s\S]*?)$/i,
    /(?:^|\n)```json\s*\n([\s\S]*?)(?:\n```\s*)?$/i,
    /(["'])json\1\s*:\s*(["'])([\s\S]*?)\2/i,
  ];

  for (const pattern of embeddedPatterns) {
    const embeddedMatch = trimmed.match(pattern);
    if (embeddedMatch) {
      try {
        const jsonStr = embeddedMatch[embeddedMatch.length - 1];
        const parsed = JSON.parse(jsonStr) as JsonValue;
        return deepParseJson(parsed, maxDepth - 1);
      } catch {
      }
    }
  }

  return value;
};

export const deepParseObject = (obj: JsonValue, maxDepth: number = 3): JsonValue => {
  if (maxDepth <= 0) return obj;
  if (typeof obj === 'string') return deepParseJson(obj, maxDepth);
  if (Array.isArray(obj)) return obj.map(item => deepParseObject(item, maxDepth - 1));
  if (obj && typeof obj === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepParseObject(value as JsonValue, maxDepth - 1);
    }
    return result;
  }
  return obj;
};

export const formatWithSyntaxHighlight = (
  content: string
): { type: 'json' | 'html' | 'text'; formatted: string } => {
  const deepParsed = deepParseJson(content);

  if (typeof deepParsed === 'object' && deepParsed !== null) {
    return { type: 'json', formatted: JSON.stringify(deepParsed, null, 2) };
  }

  const trimmed = String(deepParsed).trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') ||
      trimmed.startsWith('<!') || (trimmed.startsWith('<') && trimmed.endsWith('>'))) {
    return { type: 'html', formatted: trimmed };
  }

  return { type: 'text', formatted: trimmed };
};
