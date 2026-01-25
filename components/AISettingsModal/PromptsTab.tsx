import React from 'react';
import type { AIConfig } from '../../types';

type TranslationDictionary = typeof import('../../utils/translations').translations.en;

interface PromptsTabProps {
  t: TranslationDictionary;
  tempConfig: AIConfig;
  setTempConfig: React.Dispatch<React.SetStateAction<AIConfig>>;
}

export const PromptsTab: React.FC<PromptsTabProps> = ({ t, tempConfig, setTempConfig }) => (
  <div className="space-y-6 max-w-3xl mx-auto">
    <div className="bg-white dark:bg-cyber-800 p-4 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Customize the system instructions sent to the AI for specific actions.
      </p>
    </div>
    <div className="space-y-3">
      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
        {t.polishPrompt || "Polish Prompt"}
      </label>
      <textarea
        value={tempConfig.customPrompts?.polish || ''}
        onChange={(e) => setTempConfig({
          ...tempConfig,
          customPrompts: { ...tempConfig.customPrompts, polish: e.target.value }
        })}
        className="w-full h-32 px-3 py-2 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
        placeholder="Enter system prompt for 'Polish' action..."
      />
    </div>
    <div className="space-y-3">
      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
        {t.expandPrompt || "Expand Prompt"}
      </label>
      <textarea
        value={tempConfig.customPrompts?.expand || ''}
        onChange={(e) => setTempConfig({
          ...tempConfig,
          customPrompts: { ...tempConfig.customPrompts, expand: e.target.value }
        })}
        className="w-full h-32 px-3 py-2 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
        placeholder="Enter system prompt for 'Expand' action..."
      />
    </div>
  </div>
);
