import React, { useState, useRef, useMemo } from 'react';
import { X, Save, Server, Cpu, Key, Globe, Palette, Upload, Trash2, Check, Download, Plus, Languages, MessageSquare, ChevronDown, Wrench, AlertTriangle, Play, Terminal, Code2, Box, Keyboard, Command, Shield } from 'lucide-react';
import { AIConfig, AppTheme, AppShortcut } from '../types';
import { translations, Language } from '../utils/translations';
import { generateAIResponse, VirtualMCPClient } from '../services/aiService';

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
  onToggleLogin
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('ai');
  const [tempConfig, setTempConfig] = useState<AIConfig>(config);
  
  // Test State
  const [testTool, setTestTool] = useState<string | null>(null); // Name of tool being tested
  const [testPrompt, setTestPrompt] = useState<string>('');
  const [testLog, setTestLog] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  // Keyboard Recording State
  const [recordingId, setRecordingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  React.useEffect(() => {
    if (isOpen) setTempConfig(config);
  }, [isOpen, config]);

  // Derived state for MCP parsing
  const { parsedTools, activeServers, parseError } = useMemo(() => {
    if (!tempConfig.mcpTools || tempConfig.mcpTools.trim() === '[]') {
      return { parsedTools: [], activeServers: [], parseError: null };
    }
    try {
      // Use the Virtual Client to analyze the config without actually launching
      const client = new VirtualMCPClient(tempConfig.mcpTools);
      // We simulate a connection to get list of potential tools
      // This is a synchronous check for UI purposes
      const tools = client.getTools(); // This assumes client is constructed with defaults if possible
      
      const json = JSON.parse(tempConfig.mcpTools);
      const servers = json.mcpServers ? Object.keys(json.mcpServers) : [];

      return { 
          parsedTools: tools.map(t => t), // Use VirtualClient's discovered tools
          activeServers: servers,
          parseError: null
      };
    } catch (e: any) {
      return { parsedTools: [], activeServers: [], parseError: e.message };
    }
  }, [tempConfig.mcpTools]);

  if (!isOpen) return null;

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

  const handleInsertTemplate = () => {
    const template = `{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}`;
    setTempConfig({ ...tempConfig, mcpTools: template });
  };

  const runToolTest = async () => {
    if (!testPrompt.trim() || !testTool) return;
    setIsTesting(true);
    setTestLog([`> Sending prompt: "${testPrompt}"...`]);

    try {
      const mockToolCallback = async (name: string, args: any) => {
        setTestLog(prev => [...prev, `\n✅ Tool '${name}' triggered!`, `📦 Arguments:\n${JSON.stringify(args, null, 2)}`]);
        return { success: true, message: "Test execution simulated." };
      };

      await generateAIResponse(
        testPrompt,
        tempConfig,
        `You are testing a tool named '${testTool}'. Trigger it if the user asks.`,
        false,
        [], 
        mockToolCallback
      );

      setTestLog(prev => [...prev, `\n> Test complete.`]);
    } catch (error: any) {
      setTestLog(prev => [...prev, `\n❌ Error: ${error.message}`]);
    } finally {
      setIsTesting(false);
    }
  };

  const handleKeyDownRecord = (e: React.KeyboardEvent, shortcutId: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Ignore standalone modifier keys
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.metaKey) parts.push('Cmd'); // macOS
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    
    // Clean key name (e.g. " " -> "Space", capitalized single letters)
    let key = e.key;
    if (key === ' ') key = 'Space';
    if (key.length === 1) key = key.toUpperCase();
    
    parts.push(key);
    
    const combo = parts.join('+');
    if (onUpdateShortcut) onUpdateShortcut(shortcutId, combo);
    setRecordingId(null);
  };

  const currentModels = RECOMMENDED_MODELS[tempConfig.provider] || [];
  const currentEmbeddingModels = RECOMMENDED_EMBEDDING_MODELS[tempConfig.provider] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-white dark:bg-cyber-900 rounded-xl shadow-2xl border border-paper-200 dark:border-cyber-700 overflow-hidden transform transition-all scale-100 flex flex-col h-[85vh]">
        
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
              onClick={() => setActiveTab('security')}
              className={`text-sm font-bold flex items-center gap-2 pb-1 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'security' ? 'text-cyan-600 dark:text-cyan-400 border-cyan-500' : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}
             >
                <Shield size={18} />
                Security
             </button>
             <button
              onClick={() => setActiveTab('keyboard')}
              className={`text-sm font-bold flex items-center gap-2 pb-1 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'keyboard' ? 'text-cyan-600 dark:text-cyan-400 border-cyan-500' : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}
             >
                <Keyboard size={18} />
                {t.keyboardShortcuts || "Shortcuts"}
             </button>
             <button
              onClick={() => setActiveTab('mcp')}
              className={`text-sm font-bold flex items-center gap-2 pb-1 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'mcp' ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500' : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}
             >
                <Wrench size={18} />
                MCP / Tools
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
            <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl mx-auto">
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
              
              {tempConfig.provider === 'gemini' && (
                <div className="space-y-2 animate-fadeIn p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                    <div className="flex items-center gap-3">
                        <input 
                            type="checkbox" 
                            id="webSearch"
                            checked={!!tempConfig.enableWebSearch}
                            onChange={(e) => setTempConfig({...tempConfig, enableWebSearch: e.target.checked})}
                            className="w-4 h-4 text-cyan-600 rounded border-gray-300 focus:ring-cyan-500 cursor-pointer"
                        />
                        <label htmlFor="webSearch" className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer">
                           <Globe size={16} className="text-blue-500" />
                           {t.enableWebSearch || "Enable Google Search"}
                        </label>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 ml-7">
                       Uses Google Search to ground answers. <br/>
                       <span className="text-amber-500 font-bold">Note:</span> Disables file editing tools when active.
                    </p>
                </div>
              )}

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
                  placeholder={currentModels.length > 0 ? "Or type custom model ID..." : "e.g. gemini-2.5-flash"}
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

               {/* Embedding Model Selection */}
               <div className="space-y-2 animate-fadeIn">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Embedding Model (RAG)
                </label>
                {currentEmbeddingModels.length > 0 && (
                  <div className="relative">
                    <select
                      onChange={(e) => { if (e.target.value) setTempConfig({ ...tempConfig, embeddingModel: e.target.value }); }}
                      value={currentEmbeddingModels.some(m => m.id === tempConfig.embeddingModel) ? tempConfig.embeddingModel : ''}
                      className="w-full mb-2 px-3 py-2 pl-3 pr-8 rounded-lg bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Select a recommended embedding model...</option>
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
          )}
          
          {/* Keyboard Shortcuts Tab */}
          {activeTab === 'keyboard' && (
             <div className="space-y-6 max-w-2xl mx-auto">
                 <div className="bg-white dark:bg-cyber-800 p-4 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex justify-between items-center">
                   <div>
                       <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{t.keyboardShortcuts}</h3>
                       <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Click a key combination to record a new one.
                       </p>
                   </div>
                   <button 
                      onClick={onResetShortcuts}
                      className="text-xs px-3 py-1.5 rounded-lg border border-paper-300 dark:border-cyber-600 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-600 dark:text-slate-300 transition-colors"
                   >
                       {t.resetDefaults || "Reset Defaults"}
                   </button>
                 </div>

                 <div className="space-y-2">
                     {shortcuts.map((shortcut) => (
                         <div 
                             key={shortcut.id} 
                             className="flex items-center justify-between p-3 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded-lg group hover:border-cyan-500/50 transition-colors"
                         >
                             <div className="flex items-center gap-3">
                                 <Command size={16} className="text-slate-400" />
                                 <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                     {shortcut.label}
                                 </span>
                             </div>
                             
                             <button
                                 onClick={() => setRecordingId(shortcut.id)}
                                 onKeyDown={(e) => handleKeyDownRecord(e, shortcut.id)}
                                 className={`
                                    min-w-[100px] px-3 py-1.5 rounded-md text-xs font-mono font-bold text-center transition-all
                                    ${recordingId === shortcut.id 
                                        ? 'bg-red-500 text-white animate-pulse ring-2 ring-red-300' 
                                        : 'bg-paper-100 dark:bg-cyber-900 text-slate-600 dark:text-slate-400 group-hover:bg-paper-200 dark:group-hover:bg-cyber-700'}
                                 `}
                             >
                                 {recordingId === shortcut.id ? (t.pressKeys || "Press keys...") : shortcut.keys}
                             </button>
                         </div>
                     ))}
                 </div>
             </div>
          )}

           {/* MCP / Tools Tab */}
           {activeTab === 'mcp' && (
             <div className="h-full flex flex-col lg:flex-row gap-6">
                {/* Left: Editor */}
                <div className="flex-1 flex flex-col min-h-[400px]">
                   <div className="bg-white dark:bg-cyber-800 p-4 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm mb-4 shrink-0 flex justify-between items-center">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                         Configure MCP Servers to inject tools dynamically.
                      </p>
                      <button
                        onClick={handleInsertTemplate}
                        className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-paper-100 dark:bg-cyber-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors border border-paper-200 dark:border-cyber-600"
                      >
                        <Code2 size={14} /> Insert Template
                      </button>
                   </div>
                   
                   <div className="flex-1 relative">
                       <label className="absolute top-0 right-0 p-2 text-[10px] font-mono text-slate-400 bg-paper-100 dark:bg-cyber-900/50 rounded-bl-lg border-l border-b border-paper-200 dark:border-cyber-700">JSON</label>
                       <textarea
                          value={tempConfig.mcpTools || '[]'}
                          onChange={(e) => setTempConfig({ 
                             ...tempConfig, 
                             mcpTools: e.target.value 
                          })}
                          className={`w-full h-full min-h-[300px] px-4 py-3 rounded-lg bg-white dark:bg-cyber-800 border text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-mono resize-none leading-relaxed custom-scrollbar ${parseError ? 'border-red-400 dark:border-red-600' : 'border-paper-200 dark:border-cyber-600'}`}
                          placeholder={`{\n  "mcpServers": {\n    "chrome-devtools": {\n      "command": "npx",\n      "args": ["-y", "chrome-devtools-mcp@latest"]\n    }\n  }\n}`}
                          spellCheck={false}
                       />
                   </div>
                   {parseError && (
                      <div className="mt-2 text-red-500 text-xs flex items-center gap-1">
                          <AlertTriangle size={12} /> {parseError}
                      </div>
                   )}
                </div>

                {/* Right: Visualization & Test */}
                <div className="w-full lg:w-96 flex flex-col gap-4 overflow-y-auto pr-1">
                   {activeServers.length > 0 && (
                      <div className="mb-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                         <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1.5">
                            <Server size={12} /> Active Virtual Servers
                         </h4>
                         <div className="flex flex-wrap gap-1.5">
                            {activeServers.map(s => (
                               <span key={s} className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 text-[10px] font-mono border border-emerald-200 dark:border-emerald-700/50">
                                  {s}
                               </span>
                            ))}
                         </div>
                      </div>
                   )}

                   <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                       <Box size={16} /> Discovered Tools ({parsedTools.length})
                   </h3>

                   {parsedTools.length === 0 ? (
                       <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-paper-200 dark:border-cyber-700 rounded-xl p-8 text-center">
                           <Code2 className="text-slate-300 dark:text-slate-600 mb-2" size={32} />
                           <p className="text-xs text-slate-400">No tools found.<br/>Configure servers on the left.</p>
                       </div>
                   ) : (
                       <div className="space-y-3">
                           {parsedTools.map((tool: any, idx: number) => (
                               <div key={idx} className="bg-white dark:bg-cyber-800 rounded-lg border border-paper-200 dark:border-cyber-700 p-3 shadow-sm hover:border-emerald-500/50 transition-colors">
                                   <div className="flex justify-between items-start mb-2">
                                       <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-mono font-bold">
                                                {tool.name}
                                            </span>
                                       </div>
                                       <button 
                                           onClick={() => { setTestTool(tool.name); setTestPrompt(`Use ${tool.name} to...`); setTestLog([]); }}
                                           className="p-1.5 rounded-md bg-paper-100 dark:bg-cyber-700 hover:bg-emerald-500 hover:text-white text-slate-500 transition-all"
                                           title="Test this tool"
                                       >
                                           <Play size={12} fill="currentColor" />
                                       </button>
                                   </div>
                                   <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                                       {tool.description || "No description provided."}
                                   </p>
                                   <div className="mt-2 pt-2 border-t border-paper-100 dark:border-cyber-700/50 flex gap-2 overflow-x-auto no-scrollbar">
                                        {Object.keys(tool.parameters?.properties || tool.inputSchema?.properties || {}).map(prop => (
                                            <span key={prop} className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded border border-paper-200 dark:border-cyber-600">
                                                {prop}
                                            </span>
                                        ))}
                                   </div>
                               </div>
                           ))}
                       </div>
                   )}

                   {/* Test Playground Area */}
                   {testTool && (
                       <div className="mt-auto border-t-2 border-paper-200 dark:border-cyber-700 pt-4 animate-slideUp">
                           <div className="flex justify-between items-center mb-2">
                               <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                   <Terminal size={14} /> Test: {testTool}
                               </h4>
                               <button onClick={() => setTestTool(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                           </div>
                           
                           <div className="flex gap-2 mb-2">
                               <input 
                                  type="text" 
                                  value={testPrompt}
                                  onChange={(e) => setTestPrompt(e.target.value)}
                                  className="flex-1 px-2 py-1.5 rounded bg-white dark:bg-cyber-900 border border-paper-300 dark:border-cyber-600 text-xs text-slate-800 dark:text-slate-200"
                                  placeholder="Enter prompt to trigger tool..."
                               />
                               <button 
                                  onClick={runToolTest}
                                  disabled={isTesting}
                                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-xs font-bold disabled:opacity-50"
                               >
                                  {isTesting ? '...' : 'Run'}
                               </button>
                           </div>

                           <div className="bg-slate-900 rounded-lg p-3 h-32 overflow-y-auto custom-scrollbar font-mono text-[10px] leading-relaxed">
                               {testLog.length === 0 ? (
                                   <span className="text-slate-500 italic">Output log...</span>
                               ) : (
                                   testLog.map((line, i) => (
                                       <div key={i} className={line.startsWith('❌') ? 'text-red-400' : line.includes('✅') ? 'text-emerald-400' : 'text-slate-300'}>
                                           {line}
                                       </div>
                                   ))
                               )}
                           </div>
                       </div>
                   )}
                </div>
             </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
             <div className="space-y-6 max-w-2xl mx-auto">
                 <div className="bg-white dark:bg-cyber-800 p-4 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm">
                     <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                         <Shield size={18} className="text-cyan-500" />
                         Security Configuration
                     </h3>
                     <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                         Manage access control and authentication settings.
                     </p>
                 </div>

                 <div className="flex items-center justify-between p-4 bg-white dark:bg-cyber-800 rounded-lg border border-paper-200 dark:border-cyber-700">
                     <div>
                         <div className="font-medium text-slate-700 dark:text-slate-300">Login Interface</div>
                         <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                             Require authentication (Operator ID & Code) when launching the application.
                         </div>
                     </div>
                     
                     {/* Toggle Switch */}
                     <button
                         onClick={() => onToggleLogin?.(!isLoginEnabled)}
                         className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 ${
                             isLoginEnabled ? 'bg-cyan-500' : 'bg-slate-200 dark:bg-slate-700'
                         }`}
                     >
                         <span
                             className={`${
                                 isLoginEnabled ? 'translate-x-6' : 'translate-x-1'
                             } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                         />
                     </button>
                 </div>
             </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-6 max-w-3xl mx-auto">
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
        {activeTab === 'ai' || activeTab === 'prompts' || activeTab === 'mcp' || activeTab === 'keyboard' || activeTab === 'security' ? (
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