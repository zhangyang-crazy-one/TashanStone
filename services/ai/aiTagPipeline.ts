import type { AIConfig } from "../../types";
import { platformFetch } from "../../src/services/ai/platformFetch";
import { DEFAULT_GEMINI_MODEL, getGeminiClient } from "./geminiClient";

type AnthropicContentBlock = {
  type?: string;
  text?: string;
  thinking?: string;
};

type AnthropicResponse = {
  content?: string | AnthropicContentBlock[];
};

type OpenAIResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

const parseJsonTags = (text: string): string[] => {
  const jsonMatch = text.match(/\[.*\]/s);
  if (!jsonMatch) return [];

  try {
    const tags = JSON.parse(jsonMatch[0]);
    if (Array.isArray(tags)) {
      return tags.map(tag => String(tag).toLowerCase().trim());
    }
  } catch {
    return [];
  }

  return [];
};

const parseCommaTags = (text: string): string[] => (
  text
    .replace(/[\[\]"'`]/g, '')
    .split(',')
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => tag.length > 0 && tag.length < 30)
);

const buildEndpoint = (baseUrl: string, defaultPath: string): string => {
  const trimmedUrl = baseUrl.replace(/\/$/, '');
  if (trimmedUrl.endsWith('/v1/messages') || trimmedUrl.endsWith('/chat/completions')) {
    return trimmedUrl;
  }
  return `${trimmedUrl}${defaultPath}`;
};

export async function suggestTags(content: string, config: AIConfig): Promise<string[]> {
  if (!content || content.trim().length < 50) {
    return [];
  }

  const analysisContent = content.length > 2000 ? content.substring(0, 2000) : content;
  const isChinese = config.language === 'zh';

  const systemPrompt = isChinese
    ? `你是一个标签助手。分析内容并推荐最多5个相关标签。

规则：
1. 使用小写英文标签
2. 使用连字符代替空格（例如："machine-learning" 而不是 "machine learning"）
3. 保持标签简短（1-3个单词）
4. 包含主题、类型和技术标签
5. 避免通用标签如 "article"、"content"、"text"

输出格式：只需一个 JSON 字符串数组，例如：["react", "typescript", "tutorial"]`
    : `You are a tagging assistant. Analyze the content and suggest up to 5 relevant tags.

Rules:
1. Use lowercase English tags
2. Use hyphens instead of spaces (e.g., "machine-learning" not "machine learning")
3. Keep tags short (1-3 words)
4. Include topic, type, and technology tags
5. Avoid generic tags like "article", "content", "text"

Output format: Just a JSON array of strings, e.g., ["react", "typescript", "tutorial"]`;

  try {
    if (config.provider === 'gemini') {
      const client = getGeminiClient(config.apiKey);

      const response = await client.models.generateContent({
        model: config.model || DEFAULT_GEMINI_MODEL,
        contents: [{
          parts: [{ text: `Analyze this content and suggest 5 relevant tags:\n\n${analysisContent}` }]
        }],
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3,
        }
      });

      const text = response.text?.trim() || '';
      const jsonTags = parseJsonTags(text);
      if (jsonTags.length > 0) {
        return jsonTags.slice(0, 5);
      }

      return parseCommaTags(text).slice(0, 5);
    }

    if (config.provider === 'ollama' || config.baseUrl?.includes('localhost')) {
      const baseUrl = config.baseUrl || 'http://localhost:11434';

      const prompt = isChinese
        ? `分析以下内容，推荐最多5个相关标签（小写英文，用连字符）：\n\n${analysisContent}\n\n请以JSON数组格式返回，如：["tag1", "tag2"]`
        : `Analyze this content and suggest 5 relevant tags (lowercase, hyphens instead of spaces):\n\n${analysisContent}\n\nRespond with JSON array: ["tag1", "tag2"]`;

      const response = await platformFetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'llama3',
          prompt,
          stream: false,
          options: {
            temperature: 0.3
          }
        })
      });

      const data = await response.json() as { response?: string };
      const text = data.response?.trim() || '';
      const jsonTags = parseJsonTags(text);
      if (jsonTags.length > 0) {
        return jsonTags.slice(0, 5);
      }

      return [];
    }

    if (config.provider === 'openai' || config.provider === 'anthropic') {
      const baseUrl = config.baseUrl;
      if (!baseUrl) {
        console.error('[suggestTags] baseUrl is required for', config.provider);
        return [];
      }

      const isAnthropic = config.provider === 'anthropic';

      if (isAnthropic) {
        const endpoint = buildEndpoint(baseUrl, '/v1/messages');
        const userPrompt = isChinese
          ? `分析以下内容，推荐最多5个相关标签：\n\n${analysisContent}`
          : `Analyze this content and suggest 5 relevant tags:\n\n${analysisContent}`;

        const response = await platformFetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey || '',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 200,
            temperature: 0.3,
            system: systemPrompt,
            messages: [
              { role: 'user', content: userPrompt }
            ]
          })
        });

        if (!response.ok) {
          console.error('[suggestTags] Anthropic API error:', response.status, response.statusText, 'Endpoint:', endpoint);
          return [];
        }

        const data = await response.json() as AnthropicResponse;

        let text = '';
        if (Array.isArray(data.content)) {
          const textBlocks = data.content.filter(block => block.type === 'text' && typeof block.text === 'string');
          if (textBlocks.length > 0) {
            text = textBlocks.map(block => block.text ?? '').join('').trim();
          } else {
            const thinkingBlocks = data.content.filter(block => block.type === 'thinking' || Boolean(block.thinking));
            if (thinkingBlocks.length > 0) {
              text = thinkingBlocks.map(block => block.thinking || block.text || '').join('').trim();
            }
          }
        } else if (typeof data.content === 'string') {
          text = data.content.trim();
        }

        console.log('[suggestTags] Extracted thinking text:', text);

        const tags: string[] = [];
        const listPattern = /^[\s]*[\d.]+\s*([a-zA-Z0-9-]+)/gm;
        const listMatches = text.matchAll(listPattern);

        for (const match of listMatches) {
          if (match[1]) {
            const tag = match[1].toLowerCase();
            if (tag.length > 1 && tag !== 'the' && tag !== 'it' && tag !== 'this') {
              tags.push(tag);
            }
          }
        }

        console.log('[suggestTags] Tags from list pattern:', tags);

        if (tags.length === 0) {
          const jsonTags = parseJsonTags(text);
          if (jsonTags.length > 0) {
            tags.push(...jsonTags);
          }
        }

        console.log('[suggestTags] Final extracted tags:', tags.slice(0, 5));

        if (tags.length > 0) {
          return tags.slice(0, 5).map(tag => tag.toLowerCase().trim());
        }

        const lines = text.split('\n').filter(line => line.trim().length > 0);
        const lastLines = lines.slice(-5);

        for (const line of lastLines) {
          const commaTags = line.split(',').map(tag => tag.trim().toLowerCase().replace(/[^a-zA-Z0-9-]/g, ''));
          for (const tag of commaTags) {
            if (tag.length > 1 && tag.length < 30 && !tags.includes(tag)) {
              tags.push(tag);
            }
          }
        }

        console.log('[suggestTags] Tags from last lines:', tags.slice(0, 5));

        return tags.slice(0, 5).map(tag => tag.toLowerCase().trim());
      }

      const endpoint = buildEndpoint(baseUrl, '/chat/completions');
      const userPrompt = isChinese
        ? `分析以下内容，推荐最多5个相关标签：\n\n${analysisContent}`
        : `Analyze this content and suggest 5 relevant tags:\n\n${analysisContent}`;

      const response = await platformFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 200
        })
      });

      if (!response.ok) {
        console.error('[suggestTags] OpenAI API error:', response.status, response.statusText, 'Endpoint:', endpoint);
        return [];
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.error('[suggestTags] Unexpected content-type:', contentType);
        return [];
      }

      const data = await response.json() as OpenAIResponse;
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      const jsonTags = parseJsonTags(text);
      if (jsonTags.length > 0) {
        return jsonTags.slice(0, 5);
      }

      return [];
    }

    const baseUrl = config.baseUrl;
    if (!baseUrl) {
      console.error('[suggestTags] Unknown provider and no baseUrl configured');
      return [];
    }

    const endpoint = buildEndpoint(baseUrl, '/chat/completions');
    const response = await platformFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: config.model || 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: isChinese
            ? `分析以下内容，推荐最多5个相关标签：\n\n${analysisContent}`
            : `Analyze this content and suggest 5 relevant tags:\n\n${analysisContent}` }
        ],
        temperature: 0.3,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      console.error('[suggestTags] API error:', response.status, response.statusText);
      return [];
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.error('[suggestTags] Unexpected content-type:', contentType);
      return [];
    }

    const data = await response.json() as OpenAIResponse;
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonTags = parseJsonTags(text);
    if (jsonTags.length > 0) {
      return jsonTags.slice(0, 5);
    }

    return [];
  } catch (error) {
    console.error('[suggestTags] Error:', error);
    return [];
  }
}
