import { describe, it, expect } from 'vitest';
import { getToolCallAdapter } from '../../services/toolCallAdapters';
import type { JsonValue, ToolCall } from '../../types';

describe('toolCallAdapters', () => {
  it('parses OpenAI tool calls and formats tool results', () => {
    const adapter = getToolCallAdapter('openai');
    const response = {
      choices: [{
        message: {
          tool_calls: [{
            id: 'call-1',
            function: {
              name: 'search_files',
              arguments: '{"keyword":"hello"}'
            }
          }]
        }
      }]
    };

    const toolCalls = adapter.parseResponse(response);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].id).toBe('call-1');
    expect(toolCalls[0].name).toBe('search_files');
    expect(toolCalls[0].args).toEqual({ keyword: 'hello' });
    expect(toolCalls[0].provider).toBe('openai');

    const result: JsonValue = { ok: true };
    const formatted = adapter.formatResult(toolCalls[0], result) as Record<string, JsonValue>;
    expect(formatted).toEqual({
      role: 'tool',
      tool_call_id: 'call-1',
      content: JSON.stringify(result)
    });
  });

  it('parses Gemini function calls and formats tool results', () => {
    const adapter = getToolCallAdapter('gemini');
    const response = {
      functionCalls: [{
        name: 'read_file',
        args: { path: 'README.md' }
      }]
    };

    const toolCalls = adapter.parseResponse(response);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('read_file');
    expect(toolCalls[0].args).toEqual({ path: 'README.md' });
    expect(toolCalls[0].provider).toBe('gemini');

    const result: JsonValue = { content: 'ok' };
    const formatted = adapter.formatResult(toolCalls[0], result) as Record<string, JsonValue>;
    expect(formatted).toEqual({
      role: 'user',
      parts: [{
        functionResponse: {
          name: 'read_file',
          response: result
        }
      }]
    });
  });

  it('parses Ollama tool calls and formats tool results', () => {
    const adapter = getToolCallAdapter('ollama');
    const response = {
      message: {
        tool_calls: [{
          function: {
            name: 'update_file',
            arguments: '{"filename":"a.md","content":"b"}'
          }
        }]
      }
    };

    const toolCalls = adapter.parseResponse(response);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('update_file');
    expect(toolCalls[0].args).toEqual({ filename: 'a.md', content: 'b' });
    expect(toolCalls[0].provider).toBe('ollama');

    const result: JsonValue = { ok: true };
    const formatted = adapter.formatResult(toolCalls[0], result) as Record<string, JsonValue>;
    expect(formatted).toEqual({
      role: 'tool',
      content: JSON.stringify(result)
    });
  });

  it('parses Anthropic tool use blocks and formats tool results', () => {
    const adapter = getToolCallAdapter('anthropic');
    const response = {
      content: [{
        type: 'tool_use',
        id: 'toolu_1',
        name: 'search_knowledge_base',
        input: { query: 'note' }
      }, {
        type: 'text',
        text: 'ok'
      }]
    };

    const toolCalls = adapter.parseResponse(response);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].id).toBe('toolu_1');
    expect(toolCalls[0].name).toBe('search_knowledge_base');
    expect(toolCalls[0].args).toEqual({ query: 'note' });
    expect(toolCalls[0].provider).toBe('anthropic');

    const result: JsonValue = { hits: 2 };
    const formatted = adapter.formatResult(toolCalls[0], result) as Record<string, JsonValue>;
    expect(formatted).toEqual({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: 'toolu_1',
        content: JSON.stringify(result)
      }]
    });
  });

  it('normalizes invalid argument payloads to empty objects', () => {
    const adapter = getToolCallAdapter('openai');
    const response = {
      choices: [{
        message: {
          tool_calls: [{
            function: {
              name: 'search_files',
              arguments: '{invalid'
            }
          }]
        }
      }]
    };

    const toolCalls = adapter.parseResponse(response);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].args).toEqual({});
  });
});
