import type { AIConfig, ChatMessage, ToolCall, ToolEventCallback } from '@/types';
import { platformFetch } from '@/src/services/ai/platformFetch';
import { getToolCallAdapter } from '@/services/toolCallAdapters';
import type { IMCPClient } from '@/services/ai/mcpClients';
import type { AnthropicToolDefinition } from '@/services/ai/toolDefinitions';
import { buildAnthropicToolsForPrompt } from '@/services/ai/toolDefinitions';
import type { ToolCallback } from '@/services/ai/providerTypes';
import type { ApiMessage, ContextConfig, MessageRole } from '@/src/services/context';
import { createContextManager } from '@/src/services/context';

export const callAnthropic = async (
  prompt: string,
  config: AIConfig,
  systemInstruction?: string,
  jsonMode: boolean = false,
  toolsCallback?: ToolCallback,
  mcpClient?: IMCPClient,
  conversationHistory?: ChatMessage[],
  toolEventCallback?: ToolEventCallback
): Promise<string> => {
  const baseUrl = config.baseUrl || 'https://api.anthropic.com';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/messages`;

  // 获取模型限制 - 优先使用用户配置
  const MODEL = config.model || 'claude-3-5-sonnet';
  const MODEL_LIMIT = config.contextEngine?.modelContextLimit ?? 200000;

  // 🔧 修复: 当 modelOutputLimit 未设置时，自动从 modelContextLimit 计算
  // 通常 max_tokens 约为 context window 的 5-10%
  const MAX_OUTPUT_TOKENS = config.contextEngine?.modelOutputLimit ??
                            Math.floor(MODEL_LIMIT * 0.08) ?? 4096;

  const RESERVED_BUFFER = 1000;
  const MAX_INPUT_TOKENS = MODEL_LIMIT - MAX_OUTPUT_TOKENS - RESERVED_BUFFER;

  // 调试日志
  console.log('[Anthropic] 配置生效:', {
    modelContextLimit: config.contextEngine?.modelContextLimit,
    modelOutputLimit: config.contextEngine?.modelOutputLimit,
    calculatedMaxTokens: MAX_OUTPUT_TOKENS,
    MODEL
  });

  const estimateTokens = (text: string): number => {
    return Math.ceil(text.length / 3);
  };

  const toApiMessage = (msg: ChatMessage): ApiMessage => ({
    id: msg.id || `msg-${Date.now()}-${Math.random()}`,
    role: msg.role as MessageRole,
    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    timestamp: msg.timestamp || Date.now(),
  });

  // 从用户配置创建 contextConfig
  const contextConfig: ContextConfig = {
    max_tokens: MODEL_LIMIT,
    reserved_output_tokens: MAX_OUTPUT_TOKENS,
    compact_threshold: config.contextEngine?.compactThreshold ?? 0.85,
    prune_threshold: config.contextEngine?.pruneThreshold ?? 0.70,
    truncate_threshold: config.contextEngine?.truncateThreshold ?? 0.90,
    messages_to_keep: config.contextEngine?.messagesToKeep ?? 3,
    buffer_percentage: 0.10,
    checkpoint_interval: config.contextEngine?.checkpointInterval ?? 20,
  };

  const sessionId = `anthropic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const contextManager = createContextManager(sessionId, contextConfig);

  if (conversationHistory && conversationHistory.length > 0) {
    const apiMessages = conversationHistory.map(toApiMessage);
    contextManager.addMessages(apiMessages);
  }

  // 🔧 修复: 传递 pendingPrompt 以便 context manager 正确计算预算
  const manageResult = await contextManager.manageContext(systemInstruction || '', undefined, prompt);
  const { messages: managedMessages, usage, action, saved_tokens } = manageResult;

  if (saved_tokens && saved_tokens > 0) {
    console.log(`[ContextManager] ${action} saved ~${saved_tokens} tokens`);
  }

  /**
   * 构建符合 Anthropic API 要求的消息数组
   * 规则：
   * 1. system 角色不能在 messages 中（使用顶层 system 参数）
   * 2. 消息必须严格交替：user -> assistant -> user -> assistant...
   * 3. 第一条消息必须是 user
   * 4. tool 角色需要转换为 user 角色的 tool_result，并合并到上一个 user 消息
   */
  const buildApiMessages = (msgs: ApiMessage[]): any[] => {
    // 1. 过滤掉 system 消息
    const filtered = msgs.filter(msg => msg.role !== 'system');

    // 🔧 修复: 确保至少有一条消息，避免空数组发送到 API
    if (filtered.length === 0) {
      console.warn('[Anthropic] buildApiMessages: 所有消息都是 system 角色，返回占位消息');
      return [{ role: 'user', content: '[对话开始]' }];
    }

    const result: any[] = [];
    let lastRole: string | null = null;

    for (const msg of filtered) {
      let role = msg.role;
      let content = msg.content;

      // tool 角色转换为 user（工具调用结果）
      if (role === 'tool') {
        role = 'user';
        // 如果上一条也是 user，合并内容
        if (lastRole === 'user' && result.length > 0) {
          const lastMsg = result[result.length - 1];
          lastMsg.content = lastMsg.content + '\n\n[Tool Result]:\n' + content;
          continue;
        }
      }

      // 检查是否会产生连续相同角色
      if (role === lastRole) {
        // 合并连续相同角色的消息
        if (result.length > 0) {
          const lastMsg = result[result.length - 1];
          lastMsg.content = lastMsg.content + '\n\n' + content;
          continue;
        }
      }

      // 确保第一条消息是 user
      if (result.length === 0 && role === 'assistant') {
        // 插入一个占位 user 消息
        result.push({ role: 'user', content: '[继续之前的对话]' });
      }

      result.push({ role, content });
      lastRole = role;
    }

    // 最终验证：确保消息交替
    const validated: any[] = [];
    for (let i = 0; i < result.length; i++) {
      const msg = result[i];
      if (i === 0) {
        // 第一条必须是 user
        if (msg.role !== 'user') {
          validated.push({ role: 'user', content: '[对话开始]' });
        }
        validated.push(msg);
      } else {
        const lastValidated = validated[validated.length - 1];
        if (msg.role === lastValidated.role) {
          // 合并连续相同角色
          lastValidated.content = lastValidated.content + '\n\n' + msg.content;
        } else {
          validated.push(msg);
        }
      }
    }

    return validated;
  };

  let messagesToSend = buildApiMessages(managedMessages);

  // 🔧 修复: Context manager 现在已经包含 pendingPrompt，所以不再需要二次截断
  // 但保留验证日志以确保一切正常
  const finalCheck = estimateTokens(
    JSON.stringify(messagesToSend) + (systemInstruction || '') + prompt
  );

  if (finalCheck > MAX_INPUT_TOKENS) {
    console.warn(`[Anthropic] 警告: 即使经过 context manager 处理，总 tokens (${finalCheck}) 仍超过限制 (${MAX_INPUT_TOKENS})`);
    console.warn(`[Anthropic] 这可能是因为消息中包含了大量工具输出或长内容`);
    // 不再进行二次截断，因为 context manager 应该已经处理过了
    // 如果仍然超出，可能是配置问题或消息内容异常
  } else {
    console.log(`[Anthropic] ContextManager 处理完成: ${(usage.percentage * 100).toFixed(1)}% (${usage.total}/${usage.limit} tokens)`);
  }

  // 检查最后一条消息是否是 assistant，如果是则直接添加 user 消息
  // 如果是 user，则需要确保不会产生连续 user
  if (messagesToSend.length > 0) {
    const lastMsg = messagesToSend[messagesToSend.length - 1];
    if (lastMsg.role === 'user') {
      // 合并到最后一条 user 消息
      lastMsg.content = lastMsg.content + '\n\n' + prompt;
    } else {
      messagesToSend.push({ role: 'user', content: prompt });
    }
  } else {
    messagesToSend.push({ role: 'user', content: prompt });
  }

  // Build tools array for Anthropic format
  let tools: AnthropicToolDefinition[] | undefined = undefined;
  if (toolsCallback && !jsonMode) {
    const userQuery = prompt || messagesToSend[messagesToSend.length - 1]?.content || '';
    tools = buildAnthropicToolsForPrompt(userQuery, mcpClient);
  }
  const toolAdapter = getToolCallAdapter('anthropic');

  // 发送前验证消息格式
  const validateMessages = (msgs: any[]): { valid: boolean; error?: string } => {
    if (!msgs || msgs.length === 0) {
      return { valid: false, error: '消息数组为空' };
    }

    // 检查第一条消息必须是 user
    if (msgs[0].role !== 'user') {
      return { valid: false, error: `第一条消息必须是 user，当前是 ${msgs[0].role}` };
    }

    // 检查消息交替
    for (let i = 1; i < msgs.length; i++) {
      if (msgs[i].role === msgs[i - 1].role) {
        return {
          valid: false,
          error: `消息 ${i} 和 ${i - 1} 角色相同 (${msgs[i].role})，违反交替规则`
        };
      }
      // 检查角色有效性
      if (!['user', 'assistant'].includes(msgs[i].role)) {
        return {
          valid: false,
          error: `消息 ${i} 角色无效: ${msgs[i].role}，只允许 user 或 assistant`
        };
      }
    }

    return { valid: true };
  };

  // 验证并修复消息
  const validation = validateMessages(messagesToSend);
  if (!validation.valid) {
    console.warn(`[Anthropic] 消息验证失败: ${validation.error}`);
    console.warn('[Anthropic] 当前消息结构:', messagesToSend.map((m, i) => `${i}: ${m.role}`).join(' -> '));

    // 尝试修复：重新构建干净的消息数组
    const fixedMessages: any[] = [];
    for (const msg of messagesToSend) {
      if (!['user', 'assistant'].includes(msg.role)) continue;

      if (fixedMessages.length === 0) {
        if (msg.role === 'user') {
          fixedMessages.push(msg);
        } else {
          fixedMessages.push({ role: 'user', content: '[对话开始]' });
          fixedMessages.push(msg);
        }
      } else {
        const lastRole = fixedMessages[fixedMessages.length - 1].role;
        if (msg.role === lastRole) {
          // 合并相同角色
          fixedMessages[fixedMessages.length - 1].content += '\n\n' + msg.content;
        } else {
          fixedMessages.push(msg);
        }
      }
    }

    if (fixedMessages.length === 0) {
      fixedMessages.push({ role: 'user', content: prompt });
    }

    messagesToSend = fixedMessages;
    console.log('[Anthropic] 消息已修复，新结构:', messagesToSend.map((m, i) => `${i}: ${m.role}`).join(' -> '));
  }

  // 调试日志
  console.log('[Anthropic] 准备发送请求:');
  console.log('[Anthropic]   - 消息数量:', messagesToSend.length);
  console.log('[Anthropic]   - 消息角色序列:', messagesToSend.map(m => m.role).join(' -> '));
  console.log('[Anthropic]   - 工具数量:', tools?.length || 0);

  let iterations = 0;
  const TOTAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes total timeout
  const SINGLE_ROUND_TIMEOUT_MS = 60 * 1000; // 60 seconds per round
  const startTime = Date.now();

  try {
    while (true) {
      // Check total timeout
      if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
        console.log('[Anthropic] Total timeout reached after', iterations, 'iterations');
        return "Total timeout reached (10 minutes).";
      }

      // 🔧 诊断日志：输出完整的请求体信息
      const systemTokenCount = systemInstruction ? estimateTokens(systemInstruction) : 0;
      const messagesTokenCount = estimateTokens(JSON.stringify(messagesToSend));
      let finalSystemInstruction = systemInstruction;
      let finalMessagesToSend = [...messagesToSend];
      let totalTokens = systemTokenCount + messagesTokenCount + MAX_OUTPUT_TOKENS;

      console.log('[Anthropic] 请求诊断:');
      console.log('  - 模型:', config.model);
      console.log('  - 模型限制 (MODEL_LIMIT):', MODEL_LIMIT);
      console.log('  - 输出限制 (max_tokens):', MAX_OUTPUT_TOKENS);
      console.log('  - system 消息长度:', systemInstruction?.length || 0, '字符');
      console.log('  - system 消息 tokens:', systemTokenCount);
      console.log('  - messages 数量:', messagesToSend.length);
      console.log('  - messages tokens:', messagesTokenCount);
      console.log('  - 预估总 tokens:', totalTokens);
      console.log('  - 是否超过限制:', totalTokens > MODEL_LIMIT ? '是' : '否');

      // 🔧 修复：如果总 tokens 超过限制，进行截断
      if (totalTokens > MODEL_LIMIT) {
        console.warn('[Anthropic] 上下文过长，尝试截断...');

        // 计算可用于 system 和 messages 的空间
        const reservedForOutput = MAX_OUTPUT_TOKENS + 500; // 输出 + 缓冲
        const availableForContent = MODEL_LIMIT - reservedForOutput;

        if (availableForContent > 0) {
          // 优先保留 messages，system 可截断
          const maxSystemTokens = Math.floor(availableForContent * 0.3); // system 最多 30%
          const maxMessageTokens = availableForContent - maxSystemTokens;

          // 截断 system 消息
          if (systemTokenCount > maxSystemTokens) {
            const maxSystemChars = maxSystemTokens * 3;
            finalSystemInstruction = systemInstruction.slice(0, maxSystemChars) + '\n\n...[系统消息已截断]';
            console.warn('[Anthropic] system 消息截断:', systemTokenCount, '->', maxSystemTokens, 'tokens');
          }

          // 如果 messages 仍然过长，从后向前截断
          let currentMessageTokens = 0;
          const truncatedMessages: any[] = [];
          for (let i = finalMessagesToSend.length - 1; i >= 0; i--) {
            const msg = finalMessagesToSend[i];
            const msgTokens = estimateTokens(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));

            if (currentMessageTokens + msgTokens <= maxMessageTokens) {
              truncatedMessages.unshift(msg);
              currentMessageTokens += msgTokens;
            } else if (truncatedMessages.length === 0) {
              // 第一条消息就超出限制，强制截断
              const truncatedContent = typeof msg.content === 'string'
                ? msg.content.slice(0, maxMessageTokens * 3) + '...[截断]'
                : JSON.stringify(msg.content).slice(0, maxMessageTokens * 3) + '...[截断]';
              truncatedMessages.unshift({ ...msg, content: truncatedContent });
              currentMessageTokens = maxMessageTokens;
              break;
            } else {
              break; // 空间已满
            }
          }
          finalMessagesToSend = truncatedMessages;
          console.log('[Anthropic] 消息截断后保留:', finalMessagesToSend.length, '条');
        }

        // 重新计算
        totalTokens = estimateTokens(finalSystemInstruction || '') + estimateTokens(JSON.stringify(finalMessagesToSend)) + MAX_OUTPUT_TOKENS;
        console.log('[Anthropic] 截断后总 tokens:', totalTokens, '(限制:', MODEL_LIMIT, ')');
      }

      // 检查是否是 MiniMax 模型
      const isMiniMax = (config.model || '').toLowerCase().includes('minimax');

      const requestBody: any = {
        model: config.model || 'claude-sonnet-4-20250514',
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: finalMessagesToSend
      };

      // MiniMax 可能需要 OpenAI 兼容格式（将 system 移入 messages）
      if (isMiniMax && finalSystemInstruction) {
        console.log('[Anthropic] 使用 MiniMax 兼容格式 (system 移入 messages)');
        requestBody.messages = [
          { role: 'system', content: finalSystemInstruction },
          ...finalMessagesToSend
        ];
      } else if (finalSystemInstruction) {
        requestBody.system = finalSystemInstruction;
      }

      if (tools && tools.length > 0) {
        requestBody.tools = tools;
      }

      // Add timeout to fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SINGLE_ROUND_TIMEOUT_MS);

      try {
        const response = await platformFetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey || '',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error?.message || response.statusText;

          // 详细错误日志
          console.error('[Anthropic] API 错误:', response.status, errorMessage);
          console.error('[Anthropic] 请求体预览:', {
            model: requestBody.model,
            max_tokens: requestBody.max_tokens,
            messages_count: requestBody.messages?.length,
            messages_roles: requestBody.messages?.map((m: any) => m.role),
            has_system: !!requestBody.system,
            tools_count: requestBody.tools?.length
          });

          if (response.status === 400 && errorMessage.includes('context window exceeds limit')) {
            throw new Error(`上下文窗口超出限制 (${MODEL_LIMIT} tokens)。请尝试清除对话历史或减少消息长度。当前消息可能过长。`);
          }

          if (response.status === 400 && errorMessage.includes('invalid chat setting')) {
            throw new Error(`消息格式错误: ${errorMessage}。当前消息序列: ${messagesToSend.map(m => m.role).join(' -> ')}`);
          }

          throw new Error(`Anthropic API Error: ${response.status} ${errorMessage}`);
        }

        const data = await response.json();
        const toolCalls = toolAdapter.parseResponse(data);
        const textBlocks = data.content?.filter((block: any) => block.type === 'text') || [];

        // Check for [TASK_COMPLETE] signal in text response
        const responseText = textBlocks.map((b: any) => b.text).join('');
        if (responseText.includes('[TASK_COMPLETE]')) {
          console.log('[Anthropic] Task complete signal detected after', iterations, 'iterations');
          return responseText.replace(/\[TASK_COMPLETE\]/g, '').trim();
        }

        if (toolCalls.length > 0 && toolsCallback) {
          // Add assistant message with tool use to history
          messagesToSend.push({
            role: 'assistant',
            content: data.content
          });

          // Execute tools and build tool results
          const toolResults: any[] = [];
          for (const toolCall of toolCalls) {
            const runningCall: ToolCall = {
              ...toolCall,
              status: 'running',
              startTime: Date.now()
            };
            toolEventCallback?.(runningCall);

            try {
              const result = await toolsCallback(toolCall.name, toolCall.args);
              const completedCall: ToolCall = {
                ...runningCall,
                status: 'success',
                result,
                endTime: Date.now()
              };
              toolEventCallback?.(completedCall);

              const toolResultMessage = toolAdapter.formatResult(toolCall, result);
              if (typeof toolResultMessage === 'object' && toolResultMessage !== null) {
                const messageRecord = toolResultMessage as Record<string, unknown>;
                const contentBlocks = messageRecord.content;
                if (Array.isArray(contentBlocks)) {
                  toolResults.push(...contentBlocks);
                } else {
                  toolResults.push(toolResultMessage);
                }
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              toolEventCallback?.({
                ...runningCall,
                status: 'error',
                error: errorMessage,
                endTime: Date.now()
              });
              throw error;
            }
          }

          // Add tool results as user message
          messagesToSend.push({
            role: 'user',
            content: toolResults
          });

          iterations++;
          // Continue loop
        } else {
          // Extract text from response
          return responseText;
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.log('[Anthropic] Single round timeout after', iterations, 'iterations');
          return "Single round timeout (60 seconds).";
        }
        throw fetchError;
      }
    }
  } catch (error: any) {
    const errorMsg = error.message || String(error);

    if (errorMsg.includes('context window exceeds limit') || errorMsg.includes('上下文窗口')) {
      console.warn('[Anthropic] 触发紧急截断重试');

      try {
        const emergencyMessages = conversationHistory?.slice(-2) || [];

        // 🔧 修复: 确保 emergencyMessages 不为空
        if (emergencyMessages.length === 0) {
          console.warn('[Anthropic] 紧急重试: conversationHistory 为空，添加占位消息');
          emergencyMessages.push({
            id: `emergency-${Date.now()}`,
            role: 'user',
            content: '[对话继续]',
            timestamp: Date.now(),
          });
        }

        const emergencyApiMessages = emergencyMessages.map(toApiMessage);

        const emergencyContextManager = createContextManager(`emergency-${sessionId}`, contextConfig);
        emergencyContextManager.addMessages(emergencyApiMessages);

        const { messages: managedEmergencyMessages } = await emergencyContextManager.manageContext(systemInstruction || '');
        let emergencyMessagesToSend = buildApiMessages(managedEmergencyMessages);

        // 🔧 修复: 确保 emergencyMessagesToSend 不为空
        if (emergencyMessagesToSend.length === 0) {
          console.warn('[Anthropic] 紧急重试: buildApiMessages 返回空数组，使用占位消息');
          emergencyMessagesToSend = [{ role: 'user', content: '[对话继续]' }];
        }

        emergencyMessagesToSend.push({ role: 'user', content: prompt });

        const response = await platformFetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey || '',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            messages: emergencyMessagesToSend,
            system: systemInstruction,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`[紧急重试] Anthropic API Error: ${response.status} ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const textBlocks = data.content?.filter((block: any) => block.type === 'text') || [];
        return textBlocks.map((b: any) => b.text).join('');
      } catch (retryError: any) {
        throw new Error(`上下文窗口超出限制且紧急重试失败: ${retryError.message}`);
      }
    }

    throw new Error(`Anthropic API Error: ${errorMsg}`);
  }
};
