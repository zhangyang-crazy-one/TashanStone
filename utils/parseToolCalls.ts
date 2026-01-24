import { JsonValue } from '../types';
import { decodeBase64Utf8 } from './base64';
import { ParsedToolResult } from './jsonHelpers';

interface MatchItem {
  index: number;
  length: number;
  type: 'thinking' | 'tool';
  content?: string;
  toolName?: string;
  result?: string;
  args?: Record<string, string> | Record<string, JsonValue>;
  status?: 'executing' | 'success' | 'error';
}

export const parseToolCallsFromContent = (content: string): Array<{
  type: 'text' | 'tool' | 'thinking';
  content?: string;
  toolName?: string;
  status?: 'executing' | 'success' | 'error';
  result?: string;
  args?: Record<string, JsonValue>;
}> => {
  const parts: Array<{
    type: 'text' | 'tool' | 'thinking';
    content?: string;
    toolName?: string;
    status?: 'executing' | 'success' | 'error';
    result?: string;
    args?: Record<string, JsonValue>;
  }> = [];

  const matches: MatchItem[] = [];

  const thinkPattern = /<(?:think|thinking)>([\s\S]*?)<\/(?:think|thinking)>/gi;
  const toolResultPattern = /<tool_result\s+([^>]*?)>([\s\S]*?)<\/tool_result>/gi;
  const toolPattern = /🔧\s*\*\*(?:Tool|Executing):\s*([^*]+)\*\*(?:\.\.\.)?(?:\s*```json\s*([\s\S]*?)```)?/g;
  const laxToolPattern = /🔧\s*\*\*(?:Tool|Executing):\s*([^*]+)\*\*(?:\.\.\.)?\s*(?:```json\s*)?([\[{][\s\S]*?[}\]])(?:```)?$/gim;
  const xmlToolPattern = /<(?:minimax:)?tool_call>\s*<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>\s*<\/(?:minimax:)?tool_call>/gi;
  const simpleInvokePattern = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/gi;
  const partialXmlToolPattern = /\*\*Tool:\s*([^">\s]+)["']?>\s*<parameter[^>]*>([^<]*)<\/parameter>\s*(?:<\/invoke>)?\s*(?:<\/(?:minimax:)?tool_call>)?/gi;

  const getMatchRange = (match: RegExpMatchArray) => {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    return { start, end };
  };

  const isOverlappingMatch = (match: RegExpMatchArray, existingMatches: MatchItem[]) => {
    const { start, end } = getMatchRange(match);
    return existingMatches.some(existing =>
      (start >= existing.index && start < existing.index + existing.length) ||
      (end > existing.index && end <= existing.index + existing.length)
    );
  };

  const thinkMatches = [...content.matchAll(thinkPattern)];
  for (const match of thinkMatches) {
    matches.push({
      index: match.index ?? 0,
      length: match[0].length,
      type: 'thinking',
      content: match[1]?.trim()
    });
  }

  const toolResultMatches = [...content.matchAll(toolResultPattern)];
  for (const match of toolResultMatches) {
    const attributes = match[1] || '';
    const toolNameMatch = attributes.match(/name=(?:"([^"]+)"|'([^']+)')/i);
    const statusMatch = attributes.match(/status=(?:"([^"]+)"|'([^']+)')/i);
    const encodingMatch = attributes.match(/encoding=(?:"([^"]+)"|'([^']+)')/i);
    const toolName = toolNameMatch?.[1] || toolNameMatch?.[2];
    const rawStatus = statusMatch?.[1] || statusMatch?.[2];
    const encoding = encodingMatch?.[1] || encodingMatch?.[2];
    const rawResult = match[2] || '';
    let result = rawResult;

    if (encoding?.toLowerCase() === 'base64') {
      const normalized = rawResult.replace(/\s+/g, '');
      const decoded = decodeBase64Utf8(normalized);
      if (decoded) {
        result = decoded;
      }
    }

    if (toolName) {
      matches.push({
        index: match.index ?? 0,
        length: match[0].length,
        type: 'tool',
        toolName,
        result: result.trim(),
        status: rawStatus === 'error' || rawStatus === 'success' || rawStatus === 'executing'
          ? rawStatus
          : undefined
      });
    }
  }

  const toolMatches = [...content.matchAll(toolPattern)];
  for (const match of toolMatches) {
    matches.push({
      index: match.index ?? 0,
      length: match[0].length,
      type: 'tool',
      toolName: match[1]?.trim(),
      result: match[2]?.trim()
    });
  }

  const laxToolMatches = [...content.matchAll(laxToolPattern)];
  for (const match of laxToolMatches) {
    if (!isOverlappingMatch(match, matches)) {
      matches.push({
        index: match.index ?? 0,
        length: match[0].length,
        type: 'tool',
        toolName: match[1]?.trim(),
        result: match[2]?.trim()
      });
    }
  }

  const xmlToolMatches = [...content.matchAll(xmlToolPattern)];
  for (const match of xmlToolMatches) {
    const toolName = match[1]?.trim();
    const paramsXml = match[2] || '';
    const args: Record<string, JsonValue> = {};
    const paramPattern = /<parameter\s+name="([^"]+)">([^<]*)<\/parameter>/gi;
    let paramMatch;
    while ((paramMatch = paramPattern.exec(paramsXml)) !== null) {
      args[paramMatch[1]] = paramMatch[2];
    }
    matches.push({
      index: match.index ?? 0,
      length: match[0].length,
      type: 'tool',
      toolName,
      args
    });
  }

  const simpleInvokeMatches = [...content.matchAll(simpleInvokePattern)];
  for (const match of simpleInvokeMatches) {
    if (!isOverlappingMatch(match, matches)) {
      let args: Record<string, JsonValue> = {};
      const argsContent = match[2] || '';
      try {
        args = JSON.parse(argsContent) as Record<string, JsonValue>;
      } catch {
        args = { raw: argsContent.trim() };
      }

      matches.push({
        index: match.index ?? 0,
        length: match[0].length,
        type: 'tool',
        toolName: match[1]?.trim(),
        args
      });
    }
  }

  const partialXmlMatches = [...content.matchAll(partialXmlToolPattern)];
  for (const match of partialXmlMatches) {
    if (!isOverlappingMatch(match, matches)) {
      matches.push({
        index: match.index ?? 0,
        length: match[0].length,
        type: 'tool',
        toolName: match[1]?.trim(),
        args: { path: match[2]?.trim() }
      });
    }
  }

  matches.sort((a, b) => a.index - b.index);

  let lastIndex = 0;

  for (const match of matches) {
    if (match.index > lastIndex) {
      const textBefore = content.substring(lastIndex, match.index).trim();
      if (textBefore) {
        parts.push({ type: 'text', content: textBefore });
      }
    }

    if (match.type === 'thinking') {
      parts.push({
        type: 'thinking',
        content: match.content
      });
    } else if (match.type === 'tool') {
      let status: 'executing' | 'success' | 'error' = match.status || (match.result ? 'success' : 'executing');

      if (match.result && status !== 'error') {
        try {
          const parsed = JSON.parse(match.result) as ParsedToolResult;
          if (parsed.success === false || match.result.toLowerCase().includes('error')) {
            status = 'error';
          }
        } catch {
          if (match.result.toLowerCase().includes('error')) {
            status = 'error';
          }
        }
      }

      parts.push({
        type: 'tool',
        toolName: match.toolName,
        status,
        result: match.result,
        args: match.args as Record<string, JsonValue> | undefined
      });
    }

    lastIndex = match.index + match.length;
  }

  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex).trim();
    if (remainingText) {
      parts.push({ type: 'text', content: remainingText });
    }
  }

  if (parts.length === 0 && content.trim()) {
    parts.push({ type: 'text', content: content.trim() });
  }

  return parts;
};
