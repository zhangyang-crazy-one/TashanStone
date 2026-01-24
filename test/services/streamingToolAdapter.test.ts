import { describe, expect, it } from 'vitest';
import { createStreamingAdapterState, getStreamingToolCallAdapter } from '../../services/toolCallAdapters';

describe('streaming tool call adapters', () => {
  it('parses OpenAI tool call deltas into a complete tool call', () => {
    const adapter = getStreamingToolCallAdapter('openai');
    expect(adapter).not.toBeNull();
    if (!adapter) return;

    const state = createStreamingAdapterState();

    adapter.parseStreamingChunk({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_abc123',
            type: 'function',
            function: { name: 'search_knowledge_base', arguments: '' }
          }]
        }
      }]
    }, state);

    adapter.parseStreamingChunk({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            function: { arguments: '{"query"' }
          }]
        }
      }]
    }, state);

    adapter.parseStreamingChunk({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            function: { arguments: ':"notes"}' }
          }]
        }
      }]
    }, state);

    adapter.parseStreamingChunk({
      choices: [{
        delta: {},
        finish_reason: 'tool_calls'
      }]
    }, state);

    const toolCalls = adapter.getToolCalls(state);
    expect(state.isComplete).toBe(true);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('search_knowledge_base');
    expect(toolCalls[0].args).toEqual({ query: 'notes' });
    expect(toolCalls[0].rawArgs).toContain('"query"');
  });

  it('parses Anthropic tool call deltas into a complete tool call', () => {
    const adapter = getStreamingToolCallAdapter('anthropic');
    expect(adapter).not.toBeNull();
    if (!adapter) return;

    const state = createStreamingAdapterState();

    adapter.parseStreamingChunk({
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'toolu_123',
        name: 'search_files'
      }
    }, state);

    adapter.parseStreamingChunk({
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: '{"keyword":"'
      }
    }, state);

    adapter.parseStreamingChunk({
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: 'hello"}'
      }
    }, state);

    adapter.parseStreamingChunk({
      type: 'message_stop',
      stop_reason: 'tool_use'
    }, state);

    const toolCalls = adapter.getToolCalls(state);
    expect(state.isComplete).toBe(true);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('search_files');
    expect(toolCalls[0].args).toEqual({ keyword: 'hello' });
    expect(toolCalls[0].rawArgs).toContain('"keyword"');
  });
});
