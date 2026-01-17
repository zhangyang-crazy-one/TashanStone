/**
 * Context Configuration Utilities
 * 
 * 统一获取上下文配置的工具函数
 * 确保所有地方都从同一个配置源读取
 */

import { DEFAULT_CONTEXT_CONFIG, ContextConfig } from './types';
import { AIConfig } from '../../../types';

/**
 * 获取模型上下文限制
 * 优先级：
 * 1. config.contextEngine.modelContextLimit (用户配置)
 * 2. config.contextEngine.maxTokens (旧版配置)
 * 3. DEFAULT_CONTEXT_CONFIG.max_tokens (默认)
 */
export function getContextLimit(config: AIConfig): number {
  return config.contextEngine?.modelContextLimit ?? 
         config.contextEngine?.maxTokens ?? 
         DEFAULT_CONTEXT_CONFIG.max_tokens;
}

/**
 * 获取输出 Token 限制
 * 优先级：
 * 1. config.contextEngine.modelOutputLimit (用户配置)
 * 2. DEFAULT_CONTEXT_CONFIG.reserved_output_tokens (默认)
 */
export function getOutputLimit(config: AIConfig): number {
  return config.contextEngine?.modelOutputLimit ?? 
         DEFAULT_CONTEXT_CONFIG.reserved_output_tokens;
}

/**
 * 获取压缩阈值 (prune)
 */
export function getPruneThreshold(config: AIConfig): number {
  return config.contextEngine?.pruneThreshold ?? 
         DEFAULT_CONTEXT_CONFIG.prune_threshold;
}

/**
 * 获取压缩阈值 (compact)
 */
export function getCompactThreshold(config: AIConfig): number {
  return config.contextEngine?.compactThreshold ?? 
         DEFAULT_CONTEXT_CONFIG.compact_threshold;
}

/**
 * 获取截断阈值 (truncate)
 */
export function getTruncateThreshold(config: AIConfig): number {
  return config.contextEngine?.truncateThreshold ?? 
         DEFAULT_CONTEXT_CONFIG.truncate_threshold;
}

/**
 * 获取保留消息数
 */
export function getMessagesToKeep(config: AIConfig): number {
  return config.contextEngine?.messagesToKeep ?? 
         DEFAULT_CONTEXT_CONFIG.messages_to_keep;
}

/**
 * 获取检查点间隔
 */
export function getCheckpointInterval(config: AIConfig): number {
  return config.contextEngine?.checkpointInterval ?? 
         DEFAULT_CONTEXT_CONFIG.checkpoint_interval;
}

/**
 * 获取完整的 ContextConfig
 * 将用户配置与默认配置合并
 */
export function getContextConfig(config: AIConfig): ContextConfig {
  return {
    ...DEFAULT_CONTEXT_CONFIG,
    max_tokens: getContextLimit(config),
    reserved_output_tokens: getOutputLimit(config),
    compact_threshold: getCompactThreshold(config),
    prune_threshold: getPruneThreshold(config),
    truncate_threshold: getTruncateThreshold(config),
    messages_to_keep: getMessagesToKeep(config),
    checkpoint_interval: getCheckpointInterval(config),
    // buffer_percentage 不通过 UI 配置，使用默认值
    buffer_percentage: DEFAULT_CONTEXT_CONFIG.buffer_percentage,
  };
}

/**
 * 检查上下文引擎是否启用
 */
export function isContextEngineEnabled(config: AIConfig): boolean {
  return config.contextEngine?.enabled ?? false;
}
