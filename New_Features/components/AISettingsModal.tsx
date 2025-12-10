
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { X, Save, Server, Cpu, Key, Globe, Palette, Upload, Trash2, Check, Download, Plus, Languages, MessageSquare, ChevronDown, Wrench, AlertTriangle, Play, Terminal, Code2, Box, Keyboard, Command, Shield, Database, Lock, RefreshCw, FileInput } from 'lucide-react';
import { AIConfig, AppTheme, AppShortcut, BackupFrequency } from '../types';
import { translations, Language } from '../utils/translations';
import { generateAIResponse, VirtualMCPClient } from '../services/aiService';
import { exportDatabaseToFile, importDatabaseFromFile } from '../services/dataService';

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
  shortcuts?: AppShortcut[];
  onUpdateShortcut?: (id: string, keys: string) => void;
  onResetShortcuts?: () => void;
  isLoginEnabled?: boolean;
  onToggleLogin?: (enabled: boolean) => void;
  initialTab?: 'ai' | 'appearance' | 'prompts' | 'mcp' | 'keyboard' | 'security';
}

type Tab = 'ai' | 'appearance' | 'prompts' | 'mcp' | 'keyboard' | 'security';

const RECOMMENDED_MODELS: Record<string, {id: string, name: string}[]> = {
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
  ]
};

const RECOMMENDED_EMBEDDING_MODELS: Record<string, {id: string, name: string}[]> = {
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

interface ThemedDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}

const ThemedDropdown: React.FC<ThemedDropdownProps> = ({ value, onChange, options, placeholder, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selectedOption = options.find(o => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : (placeholder || "Select...");

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-paper-50 dark:bg-cyber-900 border border-paper-300 dark:border-cyber-600 rounded-lg text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all hover:border-cyan-500"
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown size={14} className={`transition-transform text-slate-400 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded-lg shadow-xl z-50 overflow-hidden animate-slideDown max-h-48 overflow-y-auto custom-scrollbar">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors truncate
                ${value === opt.value 
                  ? 'text-cyan-600 dark:text-cyan-400 font-bold bg-cyan-50/50 dark:bg-cyan-900/20' 
                  : 'text-slate-600 dark:text-slate-300 hover:bg-paper-100 dark:hover:bg-cyber-700 hover:text-cyan-600 dark:hover:text-cyan-400'}
              `}
              title={opt.label}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  language = 'en',
  shortcuts = [],
  onUpdateShortcut,
  onResetShortcuts,
  isLoginEnabled,
  onToggleLogin,
  initialTab = 'ai'
}) => {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [tempConfig, setTempConfig] = useState<AIConfig>(config);
  const t = translations[language];
  
  useEffect(() => {
      if (isOpen) {
          setActiveTab(initialTab);
          setTempConfig(config);
      }
  }, [isOpen, initialTab, config]);
  
  const [testTool, setTestTool] = useState<string | null>(null); 
  const [testPrompt, setTestPrompt] = useState<string>('');
  const [testLog, setTestLog] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  const [exportPassword, setExportPassword] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleChange = (key: keyof AIConfig, value: any) => {
    setTempConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleCustomPromptChange = (key: keyof NonNullable<AIConfig['customPrompts']>, value: string) => {
    setTempConfig(prev => ({
      ...prev,
      customPrompts: { ...prev.customPrompts, [key]: value }
    }));
  };

  const handleThemeImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const theme = JSON.parse(ev.target?.result as string);
          if (theme.colors && theme.name) {
            onImportTheme({ ...theme, id: `custom-${Date.now()}` });
          } else {
            alert("Invalid theme format");
          }
        } catch (err) { alert("Failed to parse theme file"); }
      };
      reader.readAsText(e.target.files[0]);
    }
  };

  const handleTestTool = async () => {
      setIsTesting(true);
      setTestLog(['Running test...']);
      try {
          const client = new VirtualMCPClient(tempConfig.mcpTools || '{}');
          // Dummy simulation for UI feedback
          await new Promise(resolve => setTimeout(resolve, 1000));
          setTestLog(prev => [...prev, 'MCP Client Initialized.', `Tools found: ${client.getTools().length}`]);
      } catch (e: any) {
          setTestLog(prev => [...prev, `Error: ${e.message}`]);
      } finally {
          setIsTesting(false);
      }
  };

  const handleShortcutKeyDown = (e: React.KeyboardEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      const keys = [];
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.metaKey) keys.push('Cmd');
      if (e.altKey) keys.push('Alt');
      if (e.shiftKey) keys.push('Shift');
      
      const key = e.key.toUpperCase();
      if (!['CONTROL', 'META', 'ALT', 'SHIFT'].includes(key)) {
          if (e.code === 'Space') keys.push('Space');
          else keys.push(key);
      }

      if (keys.length > 0 && !['CONTROL', 'META', 'ALT', 'SHIFT'].includes(key)) {
          const combo = keys.join('+');
          
          // Check conflict
          const conflict = shortcuts.find(s => s.keys === combo && s.id !== id);
          if (conflict) {
              setConflictWarning(`Conflict with "${conflict.label}"`);
          } else {
              setConflictWarning(null);
              if (onUpdateShortcut) onUpdateShortcut(id, combo);
              setRecordingId(null);
          }
      }
  };

  const handleExport = async () => {
      if (!exportPassword) {
          alert("Please set a password for the backup.");
          return;
      }
      setIsExporting(true);
      try {
          const success = await exportDatabaseToFile(exportPassword);
          if (success) alert("Export successful!");
      } catch (e: any) {
          alert(`Export failed: ${e.message}`);
      } finally {
          setIsExporting(false);
      }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0]) return;
      if (!importPassword) {
          alert("Please enter the password to decrypt this backup.");
          // Reset input to allow retry
          if (importInputRef.current) importInputRef.current.value = '';
          return;
      }
      setIsImporting(true);
      try {
          const success = await importDatabaseFromFile(e.target.files[0], importPassword);
          if (success) {
              alert("Import successful! Reloading...");
              window.location.reload();
          }
      } catch (e: any) {
          alert(`Import failed: ${e.message}`);
      } finally {
          setIsImporting(false);
          // Important: Reset the input so the same file can be selected again if retry is needed
          if (importInputRef.current) importInputRef.current.value = '';
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-white dark:bg-cyber-900 rounded-xl shadow-2xl border border-paper-200 dark:border-cyber-700 overflow-hidden flex flex-col max-h-[90vh] animate-scaleIn">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Wrench className="text-cyan-500" /> {t.settings}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-paper-100 dark:hover:bg-cyber-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Layout */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Sidebar Tabs */}
          <div className="w-48 border-r border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800/50 flex flex-col gap-1 p-2 shrink-0 overflow-y-auto">
            {[
              { id: 'ai', label: t.aiConfig, icon: Cpu },
              { id: 'appearance', label: t.appearance, icon: Palette },
              { id: 'prompts', label: t.prompts, icon: MessageSquare },
              { id: 'mcp', label: t.mcpTools, icon: Box },
              { id: 'keyboard', label: t.keyboardShortcuts, icon: Keyboard },
              { id: 'security', label: t.security, icon: Shield },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                  ${activeTab === tab.id 
                    ? 'bg-white dark:bg-cyber-700 text-cyan-600 dark:text-cyan-400 shadow-sm border border-paper-200 dark:border-cyber-600' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-paper-200 dark:hover:bg-cyber-700/50 hover:text-slate-900 dark:hover:text-slate-200'}
                `}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-cyber-900 custom-scrollbar">
            
            {activeTab === 'ai' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t.languageMode}</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={() => handleChange('language', 'en')}
                            className={`flex items-center justify-center gap-2 py-2 rounded border transition-all ${tempConfig.language === 'en' ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-500 text-cyan-700 dark:text-cyan-400' : 'border-paper-200 dark:border-cyber-600 text-slate-600 dark:text-slate-400'}`}
                        >
                            English
                        </button>
                        <button 
                            onClick={() => handleChange('language', 'zh')}
                            className={`flex items-center justify-center gap-2 py-2 rounded border transition-all ${tempConfig.language === 'zh' ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-500 text-cyan-700 dark:text-cyan-400' : 'border-paper-200 dark:border-cyber-600 text-slate-600 dark:text-slate-400'}`}
                        >
                            中文
                        </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t.provider}</label>
                    <ThemedDropdown 
                        value={tempConfig.provider} 
                        onChange={(v) => handleChange('provider', v)}
                        options={[
                            { value: 'gemini', label: 'Google Gemini' },
                            { value: 'openai', label: 'OpenAI Compatible' },
                            { value: 'ollama', label: 'Ollama (Local)' }
                        ]}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">{t.apiKey}</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="password"
                      value={tempConfig.apiKey || ''}
                      onChange={(e) => handleChange('apiKey', e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-shadow"
                      placeholder={tempConfig.provider === 'ollama' ? 'Optional for Ollama' : 'sk-...'}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">{t.modelName}</label>
                        <ThemedDropdown 
                            value={tempConfig.model} 
                            onChange={(v) => handleChange('model', v)}
                            options={RECOMMENDED_MODELS[tempConfig.provider] ? 
                                [...RECOMMENDED_MODELS[tempConfig.provider].map(m => ({ value: m.id, label: m.name })), { value: 'custom', label: 'Custom...' }] 
                                : []}
                        />
                        {/* Custom Model Input if not in list */}
                        {!RECOMMENDED_MODELS[tempConfig.provider].some(m => m.id === tempConfig.model) && (
                             <input
                                type="text"
                                value={tempConfig.model}
                                onChange={(e) => handleChange('model', e.target.value)}
                                className="w-full px-3 py-2 mt-2 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg text-sm"
                                placeholder="Enter custom model ID"
                             />
                        )}
                    </div>
                    
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Embedding Model (RAG)</label>
                        <ThemedDropdown 
                            value={tempConfig.embeddingModel || ''} 
                            onChange={(v) => handleChange('embeddingModel', v)}
                            options={RECOMMENDED_EMBEDDING_MODELS[tempConfig.provider] ? 
                                [...RECOMMENDED_EMBEDDING_MODELS[tempConfig.provider].map(m => ({ value: m.id, label: m.name })), { value: 'custom', label: 'Custom...' }] 
                                : []}
                        />
                    </div>
                </div>

                {tempConfig.provider !== 'gemini' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Base URL</label>
                    <div className="relative">
                      <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        value={tempConfig.baseUrl || ''}
                        onChange={(e) => handleChange('baseUrl', e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-shadow"
                        placeholder={tempConfig.provider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1'}
                      />
                    </div>
                  </div>
                )}
                
                {tempConfig.provider === 'gemini' && (
                    <div className="flex items-center gap-3 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-100 dark:border-cyan-800/30">
                        <input 
                            type="checkbox" 
                            id="webSearch"
                            checked={tempConfig.enableWebSearch} 
                            onChange={(e) => handleChange('enableWebSearch', e.target.checked)}
                            className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500 border-gray-300"
                        />
                        <label htmlFor="webSearch" className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                            <Globe size={16} /> {t.enableWebSearch}
                        </label>
                    </div>
                )}
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {themes.map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => onSelectTheme(theme.id)}
                      className={`
                        relative group p-4 rounded-xl border-2 text-left transition-all duration-200 overflow-hidden
                        ${activeThemeId === theme.id 
                          ? 'border-cyan-500 ring-2 ring-cyan-500/20' 
                          : 'border-paper-200 dark:border-cyber-700 hover:border-cyan-400'}
                      `}
                      style={{ background: `rgb(${theme.colors['--bg-main']})` }}
                    >
                      <div className="relative z-10 flex flex-col h-full">
                        <div className="flex items-center justify-between mb-3">
                           <span style={{ color: `rgb(${theme.colors['--text-primary']})` }} className="font-bold text-sm">{theme.name}</span>
                           {activeThemeId === theme.id && <Check size={16} className="text-cyan-500" />}
                        </div>
                        
                        {/* Preview UI Elements */}
                        <div className="space-y-2 opacity-80">
                            <div className="h-2 w-1/2 rounded-full" style={{ background: `rgb(${theme.colors['--primary-500']})` }}></div>
                            <div className="h-2 w-3/4 rounded-full" style={{ background: `rgb(${theme.colors['--text-secondary']})` }}></div>
                        </div>

                        {theme.isCustom && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDeleteTheme(theme.id); }}
                                className="absolute bottom-0 right-0 p-1.5 bg-red-500 text-white rounded-tl-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete Theme"
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                      </div>
                    </button>
                  ))}
                  
                  {/* Import Card */}
                  <label className="cursor-pointer flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-paper-300 dark:border-cyber-600 hover:border-cyan-500 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition-all text-slate-400 hover:text-cyan-600">
                      <Upload size={24} className="mb-2" />
                      <span className="text-xs font-bold uppercase tracking-wider">{t.importTheme}</span>
                      <input type="file" className="hidden" accept=".json" onChange={handleThemeImport} />
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'prompts' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <Terminal size={14} /> {t.polish} Prompt
                  </label>
                  <textarea
                    value={tempConfig.customPrompts?.polish}
                    onChange={(e) => handleCustomPromptChange('polish', e.target.value)}
                    className="w-full h-24 p-3 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg text-sm font-mono text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y"
                  />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <Terminal size={14} /> {t.expand} Prompt
                  </label>
                  <textarea
                    value={tempConfig.customPrompts?.expand}
                    onChange={(e) => handleCustomPromptChange('expand', e.target.value)}
                    className="w-full h-24 p-3 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg text-sm font-mono text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y"
                  />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <Terminal size={14} /> {t.enhancePrompt} Prompt
                  </label>
                  <textarea
                    value={tempConfig.customPrompts?.enhance}
                    onChange={(e) => handleCustomPromptChange('enhance', e.target.value)}
                    className="w-full h-24 p-3 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg text-sm font-mono text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y"
                  />
                </div>
              </div>
            )}

            {activeTab === 'mcp' && (
                <div className="space-y-6 animate-fadeIn h-full flex flex-col">
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg flex gap-3 text-sm text-amber-800 dark:text-amber-200">
                        <AlertTriangle className="shrink-0" size={20} />
                        <div>
                            <p className="font-bold mb-1">Experimental Feature</p>
                            <p>Model Context Protocol (MCP) allows the AI to interact with external tools. Configure your MCP servers JSON below.</p>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <Code2 size={14} /> MCP Configuration (JSON)
                            </label>
                            <button onClick={handleTestTool} disabled={isTesting} className="text-xs bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 px-2 py-1 rounded hover:bg-cyan-200 transition-colors flex items-center gap-1">
                                <Play size={12} /> Test Config
                            </button>
                        </div>
                        <textarea 
                            value={tempConfig.mcpTools || ''}
                            onChange={(e) => handleChange('mcpTools', e.target.value)}
                            className="flex-1 p-3 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-none"
                            placeholder='{ "mcpServers": { ... } }'
                        />
                    </div>

                    {testLog.length > 0 && (
                        <div className="h-32 bg-black text-green-400 p-3 rounded-lg font-mono text-xs overflow-y-auto">
                            {testLog.map((line, i) => <div key={i}>{line}</div>)}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'keyboard' && (
                <div className="space-y-6 animate-fadeIn">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{t.shortcutManager}</h3>
                        <button onClick={onResetShortcuts} className="text-xs text-red-500 hover:underline">{t.resetDefaults}</button>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        {shortcuts.map(sc => (
                            <div key={sc.id} className="flex items-center justify-between p-3 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded-lg group">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{sc.label}</span>
                                
                                <button 
                                    onClick={() => setRecordingId(sc.id)}
                                    className={`
                                        min-w-[80px] px-3 py-1.5 rounded text-xs font-mono font-bold transition-all border
                                        ${recordingId === sc.id 
                                            ? 'bg-red-500 text-white border-red-500 animate-pulse' 
                                            : 'bg-white dark:bg-cyber-900 text-slate-600 dark:text-slate-400 border-paper-300 dark:border-cyber-600 hover:border-cyan-500'}
                                    `}
                                    onKeyDown={(e) => recordingId === sc.id && handleShortcutKeyDown(e, sc.id)}
                                >
                                    {recordingId === sc.id ? t.pressKeys : sc.keys}
                                </button>
                            </div>
                        ))}
                    </div>
                    {conflictWarning && (
                        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-bold animate-bounce">
                            {conflictWarning}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'security' && (
                <div className="space-y-8 animate-fadeIn">
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-700 dark:text-slate-200 border-b border-paper-200 dark:border-cyber-700 pb-2">{t.accessControl}</h3>
                        <div className="flex items-center justify-between p-4 bg-paper-50 dark:bg-cyber-800 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${isLoginEnabled ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-500'}`}>
                                    <Lock size={20} />
                                </div>
                                <div>
                                    <div className="font-bold text-slate-800 dark:text-slate-100">{t.requireLogin}</div>
                                    <div className="text-xs text-slate-500">Protect app with a password on startup</div>
                                </div>
                            </div>
                            <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full border-2 border-transparent">
                                <input 
                                    type="checkbox" 
                                    checked={isLoginEnabled} 
                                    onChange={(e) => onToggleLogin?.(e.target.checked)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <div className={`block w-full h-full rounded-full transition-colors ${isLoginEnabled ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                                <div className={`absolute left-0 top-0 w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out ${isLoginEnabled ? 'translate-x-6' : 'translate-x-0.5 mt-0.5'}`}></div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-700 dark:text-slate-200 border-b border-paper-200 dark:border-cyber-700 pb-2">{t.databaseMgmt}</h3>
                        
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.backupFreq}</label>
                            <div className="flex gap-2">
                                {['never', 'daily', 'weekly', 'monthly'].map((freq) => (
                                    <button
                                        key={freq}
                                        onClick={() => handleChange('backup', { ...tempConfig.backup, frequency: freq as BackupFrequency })}
                                        className={`px-3 py-1.5 rounded text-sm capitalize transition-colors ${tempConfig.backup?.frequency === freq ? 'bg-cyan-500 text-white' : 'bg-paper-100 dark:bg-cyber-800 text-slate-600 dark:text-slate-400'}`}
                                    >
                                        {freq}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Export */}
                            <div className="p-4 bg-paper-50 dark:bg-cyber-800 rounded-xl border border-paper-200 dark:border-cyber-700">
                                <h4 className="font-bold text-sm text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><Download size={16}/> {t.exportDb}</h4>
                                <div className="space-y-3">
                                    <input 
                                        type="password" 
                                        placeholder="Set Encryption Password"
                                        value={exportPassword}
                                        onChange={e => setExportPassword(e.target.value)}
                                        className="w-full px-3 py-2 bg-white dark:bg-cyber-900 border border-paper-300 dark:border-cyber-600 rounded text-sm"
                                    />
                                    <button 
                                        onClick={handleExport}
                                        disabled={isExporting || !exportPassword}
                                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 font-bold rounded text-sm transition-colors disabled:opacity-50"
                                    >
                                        {isExporting ? 'Exporting...' : 'Export Backup'}
                                    </button>
                                </div>
                            </div>

                            {/* Import */}
                            <div className="p-4 bg-paper-50 dark:bg-cyber-800 rounded-xl border border-paper-200 dark:border-cyber-700">
                                <h4 className="font-bold text-sm text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><Upload size={16}/> {t.importDb}</h4>
                                <div className="space-y-3">
                                    <input 
                                        type="password" 
                                        placeholder="Enter Decryption Password"
                                        value={importPassword}
                                        onChange={e => setImportPassword(e.target.value)}
                                        className="w-full px-3 py-2 bg-white dark:bg-cyber-900 border border-paper-300 dark:border-cyber-600 rounded text-sm"
                                    />
                                    <label className={`w-full py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded text-sm transition-colors text-center cursor-pointer block ${(!importPassword || isImporting) ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {isImporting ? 'Importing...' : 'Restore Backup'}
                                        <input type="file" className="hidden" accept=".db" onChange={handleImport} ref={importInputRef} disabled={!importPassword || isImporting} />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-paper-50 dark:bg-cyber-800 border-t border-paper-200 dark:border-cyber-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-paper-200 dark:hover:bg-cyber-700 rounded-lg text-sm font-medium transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={() => { onSave(tempConfig); onClose(); }}
            className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-600 hover:to-violet-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-cyan-500/20 transition-all transform hover:scale-105"
          >
            {t.save}
          </button>
        </div>

      </div>
    </div>
  );
};
