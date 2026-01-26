import type { AIConfig, MarkdownFile } from "../../types";
import { generateMCPToolGuide } from "./mcpToolGuide";
import { toolDistinctionGuide } from "../../src/services/context";

type ToolGuideLanguage = 'zh' | 'en';
type ToolDescriptorInput = { name?: string; description?: string };
type ToolDescriptor = { name: string; description?: string };

const resolveLanguage = (language?: string): ToolGuideLanguage => (language === 'zh' ? 'zh' : 'en');

export const buildRagPrompt = (params: {
  prompt: string;
  config: AIConfig;
  contextFiles?: MarkdownFile[];
  retrievedContext?: string;
}): string => {
  const { prompt, config, contextFiles = [], retrievedContext } = params;

  if (retrievedContext) {
    return `You are answering based on the provided Knowledge Base.\n\nrelevant_context:\n${retrievedContext}\n\nuser_query: ${prompt}`;
  }

  if (contextFiles.length > 0) {
    const charLimit = config.provider === 'gemini' ? 2000000 : 30000;
    const contextStr = contextFiles.map(f => `--- File: ${f.name} ---\n${f.content}`).join('\n\n');
    const truncatedContext = contextStr.substring(0, charLimit);
    return `Context from user knowledge base:\n${truncatedContext}\n\nUser Query: ${prompt}`;
  }

  return prompt;
};

export const buildLanguageInstruction = (language?: string): string => (
  language === 'zh'
    ? " IMPORTANT: Respond in Chinese (Simplified) for all content, explanations, and labels."
    : ""
);

export const normalizeMcpTools = (tools: ToolDescriptorInput[]): ToolDescriptor[] => (
  tools
    .filter((tool): tool is ToolDescriptor => typeof tool.name === 'string' && tool.name.trim().length > 0)
    .map(tool => ({ name: tool.name, description: tool.description }))
);

export const buildMcpToolDescriptions = (tools: ToolDescriptor[]): string => (
  tools.length > 0
    ? tools.map(t => `- **${t.name}**: ${t.description}`).join('\n')
    : ''
);

export const buildMcpToolGuide = (tools: ToolDescriptor[], language?: string): string => (
  generateMCPToolGuide(
    tools.map(t => ({ name: t.name, description: t.description || '', inputSchema: {} })),
    resolveLanguage(language)
  )
);

export const buildMcpPromptAddition = (params: {
  toolCount: number;
  toolDescriptions: string;
  toolGuide: string;
  mode: 'streaming' | 'nonStreaming';
  useNativeStreamingTools?: boolean;
}): string => {
  const { toolCount, toolDescriptions, toolGuide, mode, useNativeStreamingTools } = params;

  if (!toolDescriptions) {
    return '';
  }

  if (mode === 'nonStreaming') {
    return `\n\n## Your Available Tools\n\nYou are equipped with ${toolCount} external tools that you CAN and SHOULD use when appropriate. These tools are already connected and ready to use.\n\n**Available Tools:**\n${toolDescriptions}${toolGuide}\n\n**Important:**\n- You HAVE these tools - they are not hypothetical. When a task requires browser control, web navigation, or other tool capabilities, USE them.\n- Simply call the tool by name with the required parameters. The system will execute it and return results.\n- Do NOT say "I don't have access to..." for tools listed above - you DO have access.`;
  }

  if (useNativeStreamingTools) {
    return `\n\n## Your Available Tools\n\nYou are equipped with ${toolCount} external tools that you CAN and SHOULD use when appropriate. These tools are already connected and ready to use.\n\n**Available Tools:**\n${toolDescriptions}${toolGuide}\n\n**Important:** You HAVE these tools - they are not hypothetical. Do NOT say "I don't have access to..." for tools listed above.`;
  }

  return `\n\n## Your Available Tools\n\nYou are equipped with ${toolCount} external tools that you CAN and SHOULD use when appropriate. These tools are already connected and ready to use.\n\nWhen you need to use a tool, output a tool call in this exact JSON format:\n\`\`\`tool_call\n{"tool": "tool_name", "arguments": {...}}\n\`\`\`\n\n**Available Tools:**\n${toolDescriptions}${toolGuide}\n\n**Important:** You HAVE these tools - they are not hypothetical. Do NOT say "I don't have access to..." for tools listed above.`;
};

export const buildFinalSystemInstruction = (params: {
  systemInstruction?: string;
  mcpPromptAddition: string;
  language?: string;
}): string => {
  const { systemInstruction, mcpPromptAddition, language } = params;
  return (systemInstruction || "") +
    mcpPromptAddition +
    toolDistinctionGuide(resolveLanguage(language)) +
    buildLanguageInstruction(language);
};
