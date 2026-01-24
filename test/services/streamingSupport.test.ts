import { describe, expect, it } from 'vitest';
import type { AIConfig } from '../../types';
import { supportsNativeStreamingToolCalls } from '../../services/aiService';

const baseConfig = {
  model: 'test-model',
  temperature: 0.7,
  language: 'en'
} as const;

describe('supportsNativeStreamingToolCalls', () => {
  it('enables native streaming tools for OpenAI', () => {
    const config: AIConfig = {
      ...baseConfig,
      provider: 'openai'
    };
    expect(supportsNativeStreamingToolCalls(config)).toBe(true);
  });

  it('enables native streaming tools for Anthropic by default', () => {
    const config: AIConfig = {
      ...baseConfig,
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com'
    };
    expect(supportsNativeStreamingToolCalls(config)).toBe(true);
  });

  it('disables native streaming tools for MiniMax endpoints', () => {
    const config: AIConfig = {
      ...baseConfig,
      provider: 'anthropic',
      baseUrl: 'https://api.minimaxi.com/anthropic'
    };
    expect(supportsNativeStreamingToolCalls(config)).toBe(false);
  });

  it('disables native streaming tools for MiniMax models', () => {
    const config: AIConfig = {
      ...baseConfig,
      provider: 'anthropic',
      model: 'minimax-m2.1'
    };
    expect(supportsNativeStreamingToolCalls(config)).toBe(false);
  });
});
