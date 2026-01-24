import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIConfig, JsonValue, ToolCall } from '../../types';
import { platformFetch } from '../../src/services/ai/platformFetch';
import { generateAIResponse } from '../../services/aiService';

vi.mock('../../src/services/ai/platformFetch', () => ({
  platformFetch: vi.fn(),
  platformStreamFetch: vi.fn()
}));

const createMockResponse = (data: unknown): Response => {
  return {
    ok: true,
    status: 200,
    json: async () => data
  } as Response;
};

describe('generateAIResponse tool events', () => {
  beforeEach(() => {
    vi.mocked(platformFetch).mockReset();
  });

  it('emits running/success events for OpenAI tool calls', async () => {
    const responses = [
      {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call-1',
              type: 'function',
              function: {
                name: 'search_files',
                arguments: '{"keyword":"hello"}'
              }
            }]
          }
        }]
      },
      {
        choices: [{
          message: {
            role: 'assistant',
            content: 'All done'
          }
        }]
      }
    ];

    vi.mocked(platformFetch).mockImplementation(async () => {
      const next = responses.shift();
      if (!next) {
        throw new Error('No more mock responses');
      }
      return createMockResponse(next);
    });

    const events: ToolCall[] = [];
    const toolCallback = vi.fn(async () => ({ ok: true } as JsonValue));
    const config: AIConfig = {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.2,
      language: 'en'
    };

    const result = await generateAIResponse(
      'hello',
      config,
      'system',
      false,
      [],
      toolCallback,
      undefined,
      [],
      false,
      (toolCall) => events.push(toolCall)
    );

    expect(result).toBe('All done');
    expect(platformFetch).toHaveBeenCalledTimes(2);
    expect(toolCallback).toHaveBeenCalledTimes(1);
    expect(toolCallback).toHaveBeenCalledWith('search_files', { keyword: 'hello' });

    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('running');
    expect(events[1].status).toBe('success');
    expect(events[0].id).toBe('call-1');
    expect(events[1].id).toBe('call-1');
    expect(events[0].provider).toBe('openai');
    expect(events[1].result).toEqual({ ok: true });
  });
});
