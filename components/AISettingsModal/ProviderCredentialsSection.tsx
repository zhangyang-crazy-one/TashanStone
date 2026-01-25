import React from 'react';
import { Globe, Key } from 'lucide-react';
import type { AIConfig } from '../../types';

type TranslationLabels = {
  apiEndpoint: string;
  apiKey: string;
};

interface ProviderCredentialsSectionProps {
  tempConfig: AIConfig;
  setTempConfig: React.Dispatch<React.SetStateAction<AIConfig>>;
  t: TranslationLabels;
}

export const ProviderCredentialsSection: React.FC<ProviderCredentialsSectionProps> = ({
  tempConfig,
  setTempConfig,
  t
}) => (
  <>
    {(tempConfig.provider !== 'gemini' && tempConfig.provider !== 'anthropic') && (
      <div className="space-y-2 animate-fadeIn">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Globe size={14} />
          {t.apiEndpoint}
        </label>
        <input
          type="text"
          value={tempConfig.baseUrl}
          onChange={(e) => setTempConfig({ ...tempConfig, baseUrl: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200"
          placeholder="http://localhost:11434"
        />
      </div>
    )}
    {tempConfig.provider === 'openai' && (
      <div className="space-y-2 animate-fadeIn">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Key size={14} />
          {t.apiKey}
        </label>
        <input
          type="password"
          value={tempConfig.apiKey || ''}
          onChange={(e) => setTempConfig({ ...tempConfig, apiKey: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600"
          placeholder="sk-..."
        />
      </div>
    )}

    {/* Anthropic Configuration */}
    {tempConfig.provider === 'anthropic' && (
      <div className="space-y-3 animate-fadeIn p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Globe size={14} />
            API Base URL
          </label>
          <input
            type="text"
            value={tempConfig.baseUrl || ''}
            onChange={(e) => setTempConfig({ ...tempConfig, baseUrl: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600"
            placeholder="https://api.anthropic.com or https://api.minimaxi.com/anthropic"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            支持官方 API 或兼容接口（如 MiniMaxi）
          </p>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Key size={14} />
            {t.apiKey}
          </label>
          <input
            type="password"
            value={tempConfig.apiKey || ''}
            onChange={(e) => setTempConfig({ ...tempConfig, apiKey: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600"
            placeholder="x-api-key..."
          />
        </div>
      </div>
    )}
  </>
);
