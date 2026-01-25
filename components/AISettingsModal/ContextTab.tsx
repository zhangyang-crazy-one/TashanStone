import React from 'react';
import { Cpu, Database, Zap } from 'lucide-react';
import type { AIConfig } from '../../types';
import { DEFAULT_CONTEXT_CONFIG } from '../../src/services/context/types';
import { AutoUpgradeSettingsSection } from './AutoUpgradeSettingsSection';
import { MemoryStatsSection } from './MemoryStatsSection';

interface ContextTabProps {
  currentUiLang: 'zh' | 'en';
  tempConfig: AIConfig;
  updateContextEngine: (updates: ContextEngineUpdates) => void;
  showToast?: (message: string, isError?: boolean) => void;
}

type ContextEngineUpdates = Partial<NonNullable<AIConfig['contextEngine']>>;

export const ContextTab: React.FC<ContextTabProps> = ({
  currentUiLang,
  tempConfig,
  updateContextEngine,
  showToast
}) => (
  <div className="space-y-6 max-w-2xl mx-auto">
    <div className="bg-[rgb(var(--bg-panel))] p-4 rounded-xl border border-[rgb(var(--border-main))] shadow-sm">
      <h3 className="text-base font-bold text-[rgb(var(--text-primary))] mb-2 flex items-center gap-2 font-[var(--font-header)]">
        <Cpu size={20} className="text-blue-500" />
        {currentUiLang === 'zh' ? '上下文工程' : 'Context Engineering'}
      </h3>
      <p className="text-sm text-[rgb(var(--text-secondary))] font-[var(--font-primary)]">
        {currentUiLang === 'zh'
          ? '管理 AI 对话上下文优化设置，包括 Token 预算、压缩阈值和检查点'
          : 'Manage AI conversation context optimization settings including token budgets, compression thresholds, and checkpoints'}
      </p>
    </div>

    {/* Context Engine Toggle */}
    <div className="bg-[rgb(var(--bg-panel))] p-5 rounded-xl border border-[rgb(var(--border-main))] space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-[rgb(var(--text-primary))] font-[var(--font-header)]">
            {currentUiLang === 'zh' ? '启用上下文工程' : 'Enable Context Engineering'}
          </h4>
          <p className="text-xs text-[rgb(var(--text-secondary))] mt-1">
            {currentUiLang === 'zh'
              ? '自动管理对话上下文，防止 Token 超限'
              : 'Automatically manage conversation context to prevent token limits'}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={!!tempConfig.contextEngine?.enabled}
            onChange={(e) => updateContextEngine({ enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[rgb(var(--neutral-300))] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[rgba(var(--primary-500)/0.3)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[rgb(var(--border-main))] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[rgb(var(--primary-500))]"></div>
        </label>
      </div>
    </div>

    {/* Context Engine Settings */}
    {tempConfig.contextEngine?.enabled && (
      <>
        {/* Max Tokens */}
        <div className="bg-[rgb(var(--bg-panel))] p-5 rounded-xl border border-[rgb(var(--border-main))] space-y-4">
          <div>
            <label className="block text-sm font-bold text-[rgb(var(--text-primary))] mb-3 font-[var(--font-header)]">
              {currentUiLang === 'zh' ? '最大 Token 限制' : 'Max Token Limit'}
            </label>
            <div className="space-y-2">
              <input
                type="range"
                min="50000"
                max="2000000"
                step="10000"
                value={tempConfig.contextEngine?.maxTokens || DEFAULT_CONTEXT_CONFIG.max_tokens}
                onChange={(e) => updateContextEngine({ maxTokens: parseInt(e.target.value) })}
                className="w-full h-2 bg-[rgb(var(--bg-element))] rounded-lg appearance-none cursor-pointer accent-[rgb(var(--primary-500))]"
              />
              <div className="flex justify-between text-xs text-[rgb(var(--text-secondary))]">
                <span>50K</span>
                <span className="font-medium text-[rgb(var(--primary-500))]">
                  {((tempConfig.contextEngine?.maxTokens || DEFAULT_CONTEXT_CONFIG.max_tokens) / 1000).toFixed(0)}K
                </span>
                <span>2000K</span>
              </div>
            </div>
          </div>
        </div>

        {/* Model Limits */}
        <div className="bg-[rgb(var(--bg-panel))] p-5 rounded-xl border border-[rgb(var(--border-main))] space-y-4">
          <h4 className="text-sm font-bold text-[rgb(var(--text-primary))] font-[var(--font-header)]">
            Model Limits
          </h4>
          <p className="text-xs text-[rgb(var(--text-secondary))]">
            Configure context window and output limits for specific models (e.g., MiniMax-M2.1: 200K input, 64K output)
          </p>

          <div className="grid grid-cols-2 gap-4">
            {/* Model Context Limit */}
            <div>
              <label className="block text-xs text-[rgb(var(--text-secondary))] mb-2">
                Model Context Limit
              </label>
              <input
                type="number"
                min="1000"
                max="1000000"
                step="1000"
                value={tempConfig.contextEngine?.modelContextLimit || ''}
                onChange={(e) => updateContextEngine({ modelContextLimit: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="200000"
                className="w-full px-3 py-2 bg-[rgb(var(--bg-element))] border border-[rgb(var(--border-main))] rounded-lg text-[rgb(var(--text-primary))] text-sm focus:outline-none focus:border-[rgb(var(--primary-500))]"
              />
            </div>

            {/* Model Output Limit */}
            <div>
              <label className="block text-xs text-[rgb(var(--text-secondary))] mb-2">
                Model Output Limit
              </label>
              <input
                type="number"
                min="1000"
                max="1000000"
                step="1000"
                value={tempConfig.contextEngine?.modelOutputLimit || ''}
                onChange={(e) => updateContextEngine({ modelOutputLimit: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="64000"
                className="w-full px-3 py-2 bg-[rgb(var(--bg-element))] border border-[rgb(var(--border-main))] rounded-lg text-[rgb(var(--text-primary))] text-sm focus:outline-none focus:border-[rgb(var(--primary-500))]"
              />
            </div>
          </div>
        </div>

        {/* Thresholds */}
        <div className="bg-[rgb(var(--bg-panel))] p-5 rounded-xl border border-[rgb(var(--border-main))] space-y-4">
          <h4 className="text-sm font-bold text-[rgb(var(--text-primary))] font-[var(--font-header)]">
            {currentUiLang === 'zh' ? '压缩触发阈值' : 'Compression Thresholds'}
          </h4>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[rgb(var(--text-secondary))]">{currentUiLang === 'zh' ? 'Prune 阈值' : 'Prune Threshold'}</span>
                <span className="text-blue-400 font-medium">{Math.round((tempConfig.contextEngine?.pruneThreshold || 0.70) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="0.8"
                step="0.05"
                value={tempConfig.contextEngine?.pruneThreshold || 0.70}
                onChange={(e) => updateContextEngine({ pruneThreshold: parseFloat(e.target.value) })}
                className="w-full h-2 bg-[rgb(var(--bg-element))] rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <p className="text-xs text-[rgb(var(--text-secondary))] mt-1">
                {currentUiLang === 'zh' ? '触发工具输出裁剪的 Token 使用率' : 'Token usage to trigger tool output pruning'}
              </p>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[rgb(var(--text-secondary))]">{currentUiLang === 'zh' ? 'Compact 阈值' : 'Compact Threshold'}</span>
                <span className="text-purple-400 font-medium">{Math.round((tempConfig.contextEngine?.compactThreshold || 0.85) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.7"
                max="0.95"
                step="0.05"
                value={tempConfig.contextEngine?.compactThreshold || 0.85}
                onChange={(e) => updateContextEngine({ compactThreshold: parseFloat(e.target.value) })}
                className="w-full h-2 bg-[rgb(var(--bg-element))] rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <p className="text-xs text-[rgb(var(--text-secondary))] mt-1">
                {currentUiLang === 'zh' ? '触发 LLM 摘要生成的 Token 使用率' : 'Token usage to trigger LLM summary generation'}
              </p>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[rgb(var(--text-secondary))]">{currentUiLang === 'zh' ? 'Truncate 阈值' : 'Truncate Threshold'}</span>
                <span className="text-orange-400 font-medium">{Math.round((tempConfig.contextEngine?.truncateThreshold || 0.95) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.85"
                max="1.0"
                step="0.02"
                value={tempConfig.contextEngine?.truncateThreshold || 0.95}
                onChange={(e) => updateContextEngine({ truncateThreshold: parseFloat(e.target.value) })}
                className="w-full h-2 bg-[rgb(var(--bg-element))] rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <p className="text-xs text-[rgb(var(--text-secondary))] mt-1">
                {currentUiLang === 'zh' ? '触发强制截断的 Token 使用率' : 'Token usage to trigger forced truncation'}
              </p>
            </div>
          </div>
        </div>

        {/* Checkpoint Interval */}
        <div className="bg-[rgb(var(--bg-panel))] p-5 rounded-xl border border-[rgb(var(--border-main))] space-y-4">
          <div>
            <label className="block text-sm font-bold text-[rgb(var(--text-primary))] mb-3 font-[var(--font-header)]">
              {currentUiLang === 'zh' ? '自动检查点间隔' : 'Auto Checkpoint Interval'}
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="5"
                max="100"
                value={tempConfig.contextEngine?.checkpointInterval || 20}
                onChange={(e) => updateContextEngine({ checkpointInterval: parseInt(e.target.value) || 20 })}
                className="w-20 px-3 py-2 bg-[rgb(var(--bg-element))] border border-[rgb(var(--border-main))] rounded-lg text-[rgb(var(--text-primary))] text-center focus:outline-none focus:border-[rgb(var(--primary-500))]"
              />
              <span className="text-sm text-[rgb(var(--text-secondary))]">
                {currentUiLang === 'zh' ? '条消息后自动创建检查点' : 'messages between auto checkpoints'}
              </span>
            </div>
          </div>
        </div>

        {/* Messages to Keep */}
        <div className="bg-[rgb(var(--bg-panel))] p-5 rounded-xl border border-[rgb(var(--border-main))] space-y-4">
          <div>
            <label className="block text-sm font-bold text-[rgb(var(--text-primary))] mb-3 font-[var(--font-header)]">
              {currentUiLang === 'zh' ? '保留消息数量' : 'Messages to Keep'}
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="1"
                max="20"
                value={tempConfig.contextEngine?.messagesToKeep || 3}
                onChange={(e) => updateContextEngine({ messagesToKeep: parseInt(e.target.value) || 3 })}
                className="w-20 px-3 py-2 bg-[rgb(var(--bg-element))] border border-[rgb(var(--border-main))] rounded-lg text-[rgb(var(--text-primary))] text-center focus:outline-none focus:border-[rgb(var(--primary-500))]"
              />
              <span className="text-sm text-[rgb(var(--text-secondary))]">
                {currentUiLang === 'zh' ? '条最近消息（压缩时保留）' : 'recent messages to keep during compression'}
              </span>
            </div>
          </div>
        </div>
      </>
    )}

    {/* Memory System Management */}
    <div className="bg-[rgb(var(--bg-panel))] p-5 rounded-xl border border-[rgb(var(--border-main))] space-y-4">
      <h4 className="text-sm font-bold text-[rgb(var(--text-primary))] flex items-center gap-2 font-[var(--font-header)]">
        <Database size={18} className="text-green-500" />
        {currentUiLang === 'zh' ? '记忆系统管理' : 'Memory System Management'}
      </h4>
      <p className="text-xs text-[rgb(var(--text-secondary))]">
        {currentUiLang === 'zh'
          ? '管理 AI 长期记忆、清理过期记忆和自动升级设置'
          : 'Manage AI long-term memory, cleanup expired memories, and auto-upgrade settings'}
      </p>

      {/* Memory Stats */}
      <MemoryStatsSection currentUiLang={currentUiLang} showToast={showToast} />
    </div>

    {/* Auto Upgrade Settings */}
    <div className="bg-[rgb(var(--bg-panel))] p-5 rounded-xl border border-[rgb(var(--border-main))] space-y-4">
      <h4 className="text-sm font-bold text-[rgb(var(--text-primary))] flex items-center gap-2 font-[var(--font-header)]">
        <Zap size={18} className="text-yellow-500" />
        {currentUiLang === 'zh' ? '自动升级设置' : 'Auto Upgrade Settings'}
      </h4>
      <p className="text-xs text-[rgb(var(--text-secondary))]">
        {currentUiLang === 'zh'
          ? '配置中期记忆自动升级为长期记忆的规则'
          : 'Configure automatic upgrade rules for mid-term to long-term memory'}
      </p>

      <AutoUpgradeSettingsSection currentUiLang={currentUiLang} />
    </div>
  </div>
);
