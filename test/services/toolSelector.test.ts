import { describe, it, expect } from 'vitest';
import { ToolAnalyzer, createToolAnalyzer, GenericTool } from '../../services/toolSelector';

describe('ToolAnalyzer Intent Classification', () => {
  const analyzer = createToolAnalyzer();

  describe('Navigation Intent', () => {
    it('should classify "open a page" as navigation', () => {
      const result = analyzer.analyze([], 'open a page');
      expect(result.intent).toBe('navigation');
    });

    it('should classify "navigate to website" as navigation', () => {
      const result = analyzer.analyze([], 'navigate to website');
      expect(result.intent).toBe('navigation');
    });

    it('should NOT classify "open the conversation" as navigation', () => {
      const result = analyzer.analyze([], 'open the conversation');
      expect(result.intent).not.toBe('navigation');
    });

    it('should NOT classify "conversation history" as navigation', () => {
      const result = analyzer.analyze([], 'conversation history');
      expect(result.intent).not.toBe('navigation');
    });

    it('should classify "take a screenshot" as navigation', () => {
      const result = analyzer.analyze([], 'take a screenshot');
      expect(result.intent).toBe('navigation');
    });
  });

  describe('Analysis Intent', () => {
    it('should classify "summarize the conversation" as analysis', () => {
      const result = analyzer.analyze([], 'summarize the conversation');
      expect(result.intent).toBe('analysis');
    });

    it('should classify "Summarize the following conversation history" as analysis', () => {
      const result = analyzer.analyze([], 'Summarize the following conversation history into a concise summary');
      expect(result.intent).toBe('analysis');
    });

    it('should classify "analyze the data" as analysis', () => {
      const result = analyzer.analyze([], 'analyze the data');
      expect(result.intent).toBe('analysis');
    });

    it('should classify "extract key points" as analysis', () => {
      const result = analyzer.analyze([], 'extract key points');
      expect(result.intent).toBe('analysis');
    });

    it('should classify "compare options" as analysis', () => {
      const result = analyzer.analyze([], 'compare options');
      expect(result.intent).toBe('analysis');
    });

    it('should classify Chinese "分析数据" as analysis', () => {
      const result = analyzer.analyze([], '分析数据');
      expect(result.intent).toBe('analysis');
    });

    it('should classify Chinese "总结内容" as analysis', () => {
      const result = analyzer.analyze([], '总结内容');
      expect(result.intent).toBe('analysis');
    });
  });

  describe('File Operation Intent', () => {
    it('should classify "read a file" as file_operation', () => {
      const result = analyzer.analyze([], 'read a file');
      expect(result.intent).toBe('file_operation');
    });

    it('should classify "write to file" as file_operation', () => {
      const result = analyzer.analyze([], 'write to file');
      expect(result.intent).toBe('file_operation');
    });

    it('should classify "create new file" as file_operation', () => {
      const result = analyzer.analyze([], 'create new file');
      expect(result.intent).toBe('file_operation');
    });
  });

  describe('Search Intent', () => {
    it('should classify "search for information" as search', () => {
      const result = analyzer.analyze([], 'search for information');
      expect(result.intent).toBe('search');
    });

    it('should classify "find the answer" as search', () => {
      const result = analyzer.analyze([], 'find the answer');
      expect(result.intent).toBe('search');
    });
  });

  describe('Calculation Intent', () => {
    it('should classify "calculate the sum" as calculation', () => {
      const result = analyzer.analyze([], 'calculate the sum');
      expect(result.intent).toBe('calculation');
    });

    it('should classify "compute average" as calculation', () => {
      const result = analyzer.analyze([], 'compute average');
      expect(result.intent).toBe('calculation');
    });
  });

  describe('Code Intent', () => {
    it('should classify "write code" as code', () => {
      const result = analyzer.analyze([], 'write code');
      expect(result.intent).toBe('code');
    });

    it('should classify "debug the function" as code', () => {
      const result = analyzer.analyze([], 'debug the function');
      expect(result.intent).toBe('code');
    });
  });

  describe('Unknown Intent', () => {
    it('should classify "hello" as unknown', () => {
      const result = analyzer.analyze([], 'hello');
      expect(result.intent).toBe('unknown');
    });

    it('should classify random text as unknown', () => {
      const result = analyzer.analyze([], 'asdfghjklqwerty');
      expect(result.intent).toBe('unknown');
    });
  });
});

describe('ToolAnalyzer Tool Selection', () => {
  const analyzer = createToolAnalyzer();

  const mockTools: GenericTool[] = [
    { name: 'click', description: 'Click on an element' },
    { name: 'navigate', description: 'Navigate to a URL' },
    { name: 'read_file', description: 'Read a file from disk' }
  ];

  it('should return empty array for analysis intent', () => {
    const result = analyzer.selectByIntent(mockTools, 'analysis');
    expect(result).toEqual([]);
  });

  it('should return empty array for unknown intent', () => {
    const result = analyzer.selectByIntent(mockTools, 'unknown');
    expect(result).toEqual([]);
  });

  it('should return empty array for calculation intent', () => {
    const result = analyzer.selectByIntent(mockTools, 'calculation');
    expect(result).toEqual([]);
  });

  it('should return all tools for navigation intent', () => {
    const result = analyzer.selectByIntent(mockTools, 'navigation');
    expect(result).toEqual(mockTools);
  });

  it('should return all tools for file_operation intent', () => {
    const result = analyzer.selectByIntent(mockTools, 'file_operation');
    expect(result).toEqual(mockTools);
  });

  it('should return all tools for search intent', () => {
    const result = analyzer.selectByIntent(mockTools, 'search');
    expect(result).toEqual(mockTools);
  });

  it('should return all tools for code intent', () => {
    const result = analyzer.selectByIntent(mockTools, 'code');
    expect(result).toEqual(mockTools);
  });
});

describe('ToolAnalyzer analyzeAndSelect', () => {
  const analyzer = createToolAnalyzer();

  const mockTools: GenericTool[] = [
    { name: 'click', description: 'Click on an element' },
    { name: 'navigate', description: 'Navigate to a URL' }
  ];

  it('should analyze and return empty tools for summarization', () => {
    const { result, tools } = analyzer.analyzeAndSelect(mockTools, 'summarize the conversation');
    expect(result.intent).toBe('analysis');
    expect(tools).toEqual([]);
  });

  it('should analyze and return all tools for navigation', () => {
    const { result, tools } = analyzer.analyzeAndSelect(mockTools, 'navigate to a page');
    expect(result.intent).toBe('navigation');
    expect(tools).toEqual(mockTools);
  });
});

describe('ToolAnalyzer Token Estimation', () => {
  const analyzer = createToolAnalyzer();

  it('should estimate tokens for a single tool', () => {
    const tool: GenericTool = {
      name: 'test_tool',
      description: 'This is a test tool description',
      parameters: { type: 'object', properties: { param1: { type: 'string' } } }
    };
    const tokens = analyzer.estimateToolTokens(tool);
    expect(tokens).toBeGreaterThan(0);
  });

  it('should estimate total tokens for multiple tools', () => {
    const tools: GenericTool[] = [
      { name: 'tool1', description: 'description 1', parameters: {} },
      { name: 'tool2', description: 'description 2', parameters: {} }
    ];
    const totalTokens = analyzer.estimateTotalTokens(tools);
    expect(totalTokens).toBeGreaterThan(0);
  });
});
