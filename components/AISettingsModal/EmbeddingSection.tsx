import React from 'react';
import { ChevronDown, Globe, Key } from 'lucide-react';
import type { AIConfig } from '../../types';

interface EmbeddingSectionProps {
  tempConfig: AIConfig;
  setTempConfig: React.Dispatch<React.SetStateAction<AIConfig>>;
  currentEmbeddingModels: { id: string; name: string }[];
  effectiveEmbeddingProvider: string;
}

const EMBEDDING_PROVIDERS: AIConfig['provider'][] = ['gemini', 'ollama', 'openai'];

export const EmbeddingSection: React.FC<EmbeddingSectionProps> = ({
  tempConfig,
  setTempConfig,
  currentEmbeddingModels,
  effectiveEmbeddingProvider
}) => (
  <div className="space-y-3 animate-fadeIn p-4 bg-slate-50 dark:bg-cyber-800/50 rounded-xl border border-paper-200 dark:border-cyber-700">
    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
      Embedding Model (RAG)
    </label>
    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
      Can use a different provider than the main chat model.
    </p>

    {/* Embedding Provider Selection */}
    <div className="grid grid-cols-4 gap-2 mb-3">
      <button
        type="button"
        onClick={() => setTempConfig({ ...tempConfig, embeddingProvider: undefined })}
        className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-all ${!tempConfig.embeddingProvider
          ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300'
          : 'border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-800 text-slate-500'
          }`}
      >
        Same as Chat
      </button>
      {EMBEDDING_PROVIDERS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setTempConfig({ ...tempConfig, embeddingProvider: p })}
          className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-all capitalize ${tempConfig.embeddingProvider === p
            ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
            : 'border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-800 text-slate-500'
            }`}
        >
          {p}
        </button>
      ))}
    </div>

    {/* Embedding Model Dropdown */}
    {currentEmbeddingModels.length > 0 && (
      <div className="relative">
        <select
          onChange={(e) => { if (e.target.value) setTempConfig({ ...tempConfig, embeddingModel: e.target.value }); }}
          value={currentEmbeddingModels.some(m => m.id === tempConfig.embeddingModel) ? tempConfig.embeddingModel : ''}
          className="w-full mb-2 px-3 py-2 pl-3 pr-8 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 appearance-none cursor-pointer"
        >
          <option value="" disabled>Select embedding model ({effectiveEmbeddingProvider})...</option>
          {currentEmbeddingModels.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
          <option value="">Custom (Type below)</option>
        </select>
        <ChevronDown size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
      </div>
    )}
    <input
      type="text"
      value={tempConfig.embeddingModel || ''}
      onChange={(e) => setTempConfig({ ...tempConfig, embeddingModel: e.target.value })}
      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
      placeholder="e.g. text-embedding-004"
    />

    {/* Embedding Provider Specific Settings */}
    {tempConfig.embeddingProvider && tempConfig.embeddingProvider !== tempConfig.provider && (
      <div className="mt-3 pt-3 border-t border-paper-200 dark:border-cyber-700 space-y-2">
        {tempConfig.embeddingProvider !== 'gemini' && (
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
              <Globe size={12} /> Embedding API Endpoint
            </label>
            <input
              type="text"
              value={tempConfig.embeddingBaseUrl || ''}
              onChange={(e) => setTempConfig({ ...tempConfig, embeddingBaseUrl: e.target.value })}
              className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200 text-sm"
              placeholder={tempConfig.embeddingProvider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1'}
            />
          </div>
        )}
        {tempConfig.embeddingProvider === 'openai' && (
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
              <Key size={12} /> Embedding API Key
            </label>
            <input
              type="password"
              value={tempConfig.embeddingApiKey || ''}
              onChange={(e) => setTempConfig({ ...tempConfig, embeddingApiKey: e.target.value })}
              className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-sm"
              placeholder="sk-..."
            />
          </div>
        )}
      </div>
    )}
  </div>
);
