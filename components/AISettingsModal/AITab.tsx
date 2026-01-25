import React from 'react';
import { ChevronDown, Globe, Languages, MessageSquare, Tag } from 'lucide-react';
import type { AIConfig } from '../../types';
import { EmbeddingSection } from './EmbeddingSection';
import { ProviderCredentialsSection } from './ProviderCredentialsSection';
import { translations, type Language } from '../../utils/translations';

interface AITabProps {
  currentUiLang: Language;
  tempConfig: AIConfig;
  setTempConfig: React.Dispatch<React.SetStateAction<AIConfig>>;
  onSubmit: (event: React.FormEvent) => void;
}

const RECOMMENDED_MODELS: Record<string, { id: string; name: string }[]> = {
  gemini: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (General Purpose)' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro Preview (Complex Reasoning)' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o (Omni)' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
  ],
  ollama: [
    { id: 'llama3', name: 'Llama 3 (Meta)' },
    { id: 'mistral', name: 'Mistral' },
    { id: 'gemma', name: 'Gemma (Google)' },
    { id: 'qwen2', name: 'Qwen 2' },
    { id: 'deepseek-coder', name: 'DeepSeek Coder' },
    { id: 'codellama', name: 'Code Llama' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (Latest)' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Fast)' },
  ]
};

const RECOMMENDED_EMBEDDING_MODELS: Record<string, { id: string; name: string }[]> = {
  gemini: [
    { id: 'text-embedding-004', name: 'Text Embedding 004' },
  ],
  openai: [
    { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small' },
    { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large' },
    { id: 'text-embedding-ada-002', name: 'Ada 002 (Legacy)' },
  ],
  ollama: [
    { id: 'nomic-embed-text', name: 'Nomic Embed Text' },
    { id: 'mxbai-embed-large', name: 'MxBai Embed Large' },
    { id: 'all-minilm', name: 'All MiniLM' },
    { id: 'llama3', name: 'Llama 3 (Use Chat Model)' },
  ]
};

const PROVIDERS: AIConfig['provider'][] = ['gemini', 'ollama', 'openai', 'anthropic'];

export const AITab: React.FC<AITabProps> = ({
  currentUiLang,
  tempConfig,
  setTempConfig,
  onSubmit
}) => {
  const t = translations[currentUiLang];
  const currentModels = RECOMMENDED_MODELS[tempConfig.provider] || [];
  const effectiveEmbeddingProvider = tempConfig.embeddingProvider || tempConfig.provider;
  const currentEmbeddingModels = RECOMMENDED_EMBEDDING_MODELS[effectiveEmbeddingProvider] || [];

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-2xl mx-auto">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Languages size={16} />
          {t.languageMode}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTempConfig({ ...tempConfig, language: 'en' })}
            className={`py-2 px-4 rounded-lg border transition-all text-sm font-medium ${tempConfig.language === 'en'
              ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-500 text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-500'
              : 'bg-white dark:bg-cyber-800 border-paper-200 dark:border-cyber-700 text-slate-600 dark:text-slate-400'
              }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setTempConfig({ ...tempConfig, language: 'zh' })}
            className={`py-2 px-4 rounded-lg border transition-all text-sm font-medium ${tempConfig.language === 'zh'
              ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-500 text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-500'
              : 'bg-white dark:bg-cyber-800 border-paper-200 dark:border-cyber-700 text-slate-600 dark:text-slate-400'
              }`}
          >
            中文 (Chinese)
          </button>
        </div>
      </div>
      <div className="h-px bg-paper-200 dark:bg-cyber-700 my-4" />
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {t.provider}
        </label>
        <div className="grid grid-cols-4 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setTempConfig({ ...tempConfig, provider: p })}
              className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all capitalize ${tempConfig.provider === p
                ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-500'
                : 'border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-800 text-slate-600 dark:text-slate-400'
                }`}
            >
              <span className="font-semibold text-sm">{p}</span>
            </button>
          ))}
        </div>
      </div>

      {tempConfig.provider === 'gemini' && (
        <div className="space-y-2 animate-fadeIn p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="webSearch"
              checked={!!tempConfig.enableWebSearch}
              onChange={(e) => setTempConfig({ ...tempConfig, enableWebSearch: e.target.checked })}
              className="w-4 h-4 text-cyan-600 rounded border-gray-300 focus:ring-cyan-500 cursor-pointer"
            />
            <label htmlFor="webSearch" className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer">
              <Globe size={16} className="text-blue-500" />
              {t.enableWebSearch || 'Enable Google Search'}
            </label>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 ml-7">
            Uses Google Search to ground answers. <br />
            <span className="text-amber-500 font-bold">Note:</span> Disables file editing tools when active.
          </p>
        </div>
      )}

      {/* Streaming Response Toggle */}
      <div className="space-y-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="enableStreaming"
            checked={!!tempConfig.enableStreaming}
            onChange={(e) => setTempConfig({ ...tempConfig, enableStreaming: e.target.checked })}
            className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer"
          />
          <label htmlFor="enableStreaming" className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer">
            <MessageSquare size={16} className="text-purple-500" />
            {t.enableStreaming || 'Enable Streaming Response'}
          </label>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 ml-7">
          {t.streamingHint || "Show AI response as it's being generated in real-time."} <br />
          <span className="text-amber-500 font-medium">⚠️ {t.streamingRecommend || 'Recommended: Disable streaming for better tool calling stability and real-time UI feedback.'}</span>
        </p>
      </div>

      {/* Tag Suggestion Toggle */}
      <div className="space-y-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-800">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="tagSuggestionEnabled"
            checked={!!tempConfig.tagSuggestion?.enabled}
            onChange={(e) => setTempConfig({
              ...tempConfig,
              tagSuggestion: {
                ...tempConfig.tagSuggestion,
                enabled: e.target.checked,
                autoSuggest: tempConfig.tagSuggestion?.autoSuggest ?? false
              }
            })}
            className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 cursor-pointer"
          />
          <label htmlFor="tagSuggestionEnabled" className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer">
            <Tag size={16} className="text-emerald-500" />
            {t.enableTagSuggestion || 'Enable AI Tag Suggestion'}
          </label>
        </div>
        <div className="flex items-center gap-3 ml-7">
          <input
            type="checkbox"
            id="tagSuggestionAuto"
            checked={!!tempConfig.tagSuggestion?.autoSuggest}
            onChange={(e) => setTempConfig({
              ...tempConfig,
              tagSuggestion: {
                ...tempConfig.tagSuggestion,
                enabled: tempConfig.tagSuggestion?.enabled ?? true,
                autoSuggest: e.target.checked
              }
            })}
            className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 cursor-pointer"
            disabled={!tempConfig.tagSuggestion?.enabled}
          />
          <label htmlFor="tagSuggestionAuto" className={`text-sm flex items-center gap-2 cursor-pointer ${!tempConfig.tagSuggestion?.enabled ? 'text-slate-400' : 'text-slate-600 dark:text-slate-400'}`}>
            {t.autoSuggestTags || 'Auto-suggest tags when creating notes'}
          </label>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 ml-7">
          {t.tagSuggestionHint || 'Uses AI to analyze content and suggest relevant tags automatically.'}
        </p>
      </div>

      {/* Chat Model Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {t.modelName} (Chat)
        </label>
        {currentModels.length > 0 && (
          <div className="relative">
            <select
              onChange={(e) => { if (e.target.value) setTempConfig({ ...tempConfig, model: e.target.value }); }}
              value={currentModels.some(m => m.id === tempConfig.model) ? tempConfig.model : ''}
              className="w-full mb-2 px-3 py-2 pl-3 pr-8 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 appearance-none cursor-pointer"
            >
              <option value="" disabled>Select a recommended model...</option>
              {currentModels.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
              <option value="">Custom (Type below)</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
          </div>
        )}
        <input
          type="text"
          value={tempConfig.model}
          onChange={(e) => setTempConfig({ ...tempConfig, model: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          placeholder={currentModels.length > 0 ? 'Or type custom model ID...' : 'e.g. gemini-2.5-flash'}
        />
      </div>

      {/* Compaction Model Selection */}
      <div className="space-y-2 animate-fadeIn">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Compaction Model (Optional)
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Used when compressing chat history. Defaults to main model if empty.
        </p>
        <input
          type="text"
          value={tempConfig.compactModel || ''}
          onChange={(e) => setTempConfig({ ...tempConfig, compactModel: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          placeholder="e.g. gemini-2.5-flash"
        />
      </div>

      {/* Embedding Model Selection - Independent Provider */}
      <EmbeddingSection
        tempConfig={tempConfig}
        setTempConfig={setTempConfig}
        currentEmbeddingModels={currentEmbeddingModels}
        effectiveEmbeddingProvider={effectiveEmbeddingProvider}
      />

      <ProviderCredentialsSection tempConfig={tempConfig} setTempConfig={setTempConfig} t={t} />
    </form>
  );
};
