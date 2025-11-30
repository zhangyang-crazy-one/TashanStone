
import React, { useState, useRef } from 'react';
import { X, Save, Server, Cpu, Key, Globe, Palette, Upload, Trash2, Check, Download, Plus, Languages, MessageSquare, ChevronDown } from 'lucide-react';
import { AIConfig, AppTheme } from '../types';
import { translations, Language } from '../utils/translations';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIConfig;
  onSave: (config: AIConfig) => void;
  themes: AppTheme[];
  activeThemeId: string;
  onSelectTheme: (themeId: string) => void;
  onImportTheme: (theme: AppTheme) => void;
  onDeleteTheme: (themeId: string) => void;
  language?: Language;
}

type Tab = 'ai' | 'appearance' | 'prompts';

const RECOMMENDED_MODELS: Record<string, {id: string, name: string}[]> = {
  gemini: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Latest & Fast)' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Complex Reasoning)' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Balanced)' },
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
  ]
};

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
  themes,
  activeThemeId,
  onSelectTheme,
  onImportTheme,
  onDeleteTheme,
  language = 'en'
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('ai');
  const [tempConfig, setTempConfig] = useState<AIConfig>(config);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Update internal state when prop changes (opening modal)
  React.useEffect(() => {
    if (isOpen) setTempConfig(config);
  }, [isOpen, config]);

  if (!isOpen) return null;

  // Use the TEMPORARY language selection for translation lookup inside the modal
  // This allows the user to see the UI change language instantly when clicking options
  const currentUiLang: Language = tempConfig.language === 'zh' ? 'zh' : 'en';
  const t = translations[currentUiLang];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(tempConfig);
    onClose();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const json = JSON.parse(content);
        
        if (!json.name || !json.type || !json.colors) {
          alert('Invalid Theme: Missing name, type ("light"|"dark"), or colors object.');
          return;
        }

        const requiredColors = ['--bg-main', '--text-primary', '--primary-500'];
        const missing = requiredColors.filter(c => !json.colors[c]);
        
        if (missing.length > 0) {
           alert(`Invalid Theme: Missing color variables: ${missing.join(', ')}`);
           return;
        }

        const newTheme: AppTheme = {
          ...json,
          id: json.id || `custom-${Date.now()}`,
          isCustom: true
        };
        onImportTheme(newTheme);
      } catch (err) {
        alert('Failed to parse JSON file. Please ensure it is valid JSON.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const currentModels = RECOMMENDED_MODELS[tempConfig.provider] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-cyber-900 rounded-xl shadow-2xl border border-paper-200 dark:border-cyber-700 overflow-hidden transform transition-all scale-100 flex flex-col h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800/50 flex-shrink-0">
          <div className="flex gap-4 overflow-x-auto no-scrollbar">
             <button
              onClick={() => setActiveTab('ai')}
              className={`text-sm font-bold flex items-center gap-2 pb-1 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'ai' ? 'text-cyan-600 dark:text-cyan-400 border-cyan-500' : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}
             >
                <Cpu size={18} />
                {t.aiConfig}
             </button>
             <button
              onClick={() => setActiveTab('prompts')}
              className={`text-sm font-bold flex items-center gap-2 pb-1 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'prompts' ? 'text-cyan-600 dark:text-cyan-400 border-cyan-500' : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}
             >
                <MessageSquare size={18} />
                {t.prompts || "Prompts"}
             </button>
             <button
              onClick={() => setActiveTab('appearance')}
              className={`text-sm font-bold flex items-center gap-2 pb-1 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'appearance' ? 'text-violet-600 dark:text-violet-400 border-violet-500' : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}
             >
                <Palette size={18} />
                {t.appearance}
             </button>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-paper-50 dark:bg-cyber-900">
          
          {/* AI Settings Tab */}
          {activeTab === 'ai' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                   <Languages size={16} />
                   {t.languageMode}
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTempConfig({ ...tempConfig, language: 'en' })}
                      className={`py-2 px-4 rounded-lg border transition-all text-sm font-medium ${
                        tempConfig.language === 'en'
                          ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-500 text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-500'
                          : 'bg-white dark:bg-cyber-800 border-paper-200 dark:border-cyber-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      onClick={() => setTempConfig({ ...tempConfig, language: 'zh' })}
                      className={`py-2 px-4 rounded-lg border transition-all text-sm font-medium ${
                        tempConfig.language === 'zh'
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
                <div className="grid grid-cols-3 gap-2">
                  {['gemini', 'ollama', 'openai'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTempConfig({ ...tempConfig, provider: p as any })}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all capitalize ${
                        tempConfig.provider === p
                          ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-500'
                          : 'border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="font-semibold text-sm">{p}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t.modelName}
                </label>
                
                {/* Model Selection Dropdown */}
                {currentModels.length > 0 && (
                  <div className="relative">
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                           setTempConfig({ ...tempConfig, model: e.target.value });
                        }
                      }}
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
                  placeholder={currentModels.length > 0 ? "Or type custom model ID..." : "e.g. gemini-2.5-flash"}
                />
              </div>

              {(tempConfig.provider !== 'gemini') && (
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
            </form>
          )}

          {/* Prompts Tab */}
          {activeTab === 'prompts' && (
             <div className="space-y-6">
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
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-cyber-800 p-4 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">{t.customThemes}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Import themes in JSON format.
                    </p>
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg shadow-md transition-all hover:shadow-violet-500/25"
                  >
                     <Upload size={16} />
                     <span>{t.importTheme}</span>
                  </button>
                  <input 
                     type="file" 
                     accept=".json" 
                     ref={fileInputRef} 
                     className="hidden" 
                     onChange={handleFileUpload}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider">{t.availableThemes}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {themes.map(theme => (
                    <div 
                      key={theme.id}
                      onClick={() => onSelectTheme(theme.id)}
                      className={`
                        relative group cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 flex items-center gap-4
                        ${activeThemeId === theme.id 
                          ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/10 shadow-lg shadow-cyan-500/10' 
                          : 'border-paper-200 dark:border-cyber-700 hover:border-cyan-300 dark:hover:border-cyber-500 bg-white dark:bg-cyber-800'}
                      `}
                    >
                      <div className="w-12 h-12 rounded-full shadow-inner flex overflow-hidden border border-black/10 shrink-0 transform transition-transform group-hover:scale-105">
                         <div className="w-1/2 h-full" style={{ background: `rgb(${theme.colors['--bg-main']})` }}></div>
                         <div className="w-1/2 h-full" style={{ background: `rgb(${theme.colors['--primary-500']})` }}></div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                           <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{theme.name}</span>
                           {activeThemeId === theme.id && <Check size={16} className="text-cyan-500 shrink-0" />}
                        </div>
                        <span className="text-xs text-slate-500 capitalize">{theme.type === 'dark' ? t.darkMode : t.lightMode}</span>
                      </div>

                      {theme.isCustom && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete theme "${theme.name}"?`)) onDeleteTheme(theme.id);
                          }}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title={t.deleteTheme}
                        >
                           <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === 'ai' || activeTab === 'prompts' ? (
          <div className="p-4 border-t border-paper-200 dark:border-cyber-700 flex justify-end gap-3 bg-paper-50 dark:bg-cyber-800/50 flex-shrink-0">
             <button onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-paper-200 dark:hover:bg-cyber-700">{t.cancel}</button>
             <button onClick={handleSubmit} className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 text-white rounded-lg shadow-lg hover:shadow-cyan-500/25">
               <Save size={18} /> {t.save}
             </button>
          </div>
        ) : (
          <div className="p-4 border-t border-paper-200 dark:border-cyber-700 flex justify-end bg-paper-50 dark:bg-cyber-800/50">
             <button onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-paper-200 dark:hover:bg-cyber-700">{t.close}</button>
          </div>
        )}
      </div>
    </div>
  );
};
