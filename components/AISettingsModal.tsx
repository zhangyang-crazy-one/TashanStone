
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
  
  // Sync tab on open
  useEffect(() => {
      if (isOpen) {
          setActiveTab(initialTab);
          setTempConfig(config);
      }
  }, [isOpen, initialTab, config]);
  
  // Test State
  const [testTool, setTestTool] = useState<string | null>(null); // Name of tool being tested
  const [testPrompt, setTestPrompt] = useState<string>('');
  const [testLog, setTestLog] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  // Keyboard Recording State
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Backup/Security State
  const [exportPassword, setExportPassword] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [showExportPass, setShowExportPass] = useState(false);
  const [showImportPass, setShowImportPass] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dbInputRef = useRef<HTMLInputElement>(null);

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
      const tools = client.getTools(); 
      
      const json = JSON.parse(tempConfig.mcpTools);
      const servers = json.mcpServers ? Object.keys(json.mcpServers) : [];

      return { 
          parsedTools: tools.map(t => t), 
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

  const handleDbExport = async () => {
      if (!exportPassword) {
          setBackupStatus("Error: Password required to encrypt backup.");
          return;
      }
      setIsExporting(true);
      setBackupStatus("Encrypting and exporting...");
      
      try {
          // This uses the updated dataService with fallback
          const success = await exportDatabaseToFile(exportPassword);
          if (success) {
              setBackupStatus("Export Successful!");
              const newConfig = { 
                  ...tempConfig, 
                  backup: { 
                      frequency: tempConfig.backup?.frequency || 'weekly', 
                      lastBackup: Date.now() 
                  } 
              };
              setTempConfig(newConfig);
              onSave(newConfig); // Persist immediately
              setExportPassword('');
              setShowExportPass(false);
          } else {
              setBackupStatus("Export cancelled.");
          }
      } catch (e: any) {
          console.error(e);
          setBackupStatus(`Export Failed: ${e.message}`);
      } finally {
          setIsExporting(false);
          // Clear status message after delay
          setTimeout(() => {
              setBackupStatus(prev => prev?.includes("Successful") ? null : prev);
          }, 3000);
      }
  };

  const handleDbImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!importPassword) {
          setBackupStatus("Error: Decryption password required.");
          if (dbInputRef.current) dbInputRef.current.value = '';
          return;
      }

      setIsImporting(true);
      try {
          await importDatabaseFromFile(file, importPassword);
          setBackupStatus("Import Successful! Reloading...");
          setTimeout(() => window.location.reload(), 1500);
      } catch (err: any) {
          setBackupStatus(`Import Failed: ${err.message}`);
          if (dbInputRef.current) dbInputRef.current.value = '';
      } finally {
          setIsImporting(false);
      }
  };

  // ... (Previous logic for shortcuts, MCP etc) ...
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

  const checkConflict = (combo: string, currentId: string) => {
      const existing = shortcuts?.find(s => s.keys.toUpperCase() === combo.toUpperCase() && s.id !== currentId);
      if (existing) return `Conflicts with "${existing.label}"`;
      
      const reserved = ['CTRL+W', 'CTRL+N', 'CTRL+T', 'CTRL+SHIFT+W', 'ALT+F4'];
      if (reserved.includes(combo.toUpperCase())) return "Warning: Browser reserved key";
      
      return null;
  };

  const handleKeyDownRecord = (e: React.KeyboardEvent, shortcutId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.metaKey) parts.push('Cmd');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    
    let key = e.key;
    if (key === ' ') key = 'Space';
    if (key.length === 1) key = key.toUpperCase();
    
    parts.push(key);
    
    const combo = parts.join('+');
    
    const conflict = checkConflict(combo, shortcutId);
    if (conflict) {
        setConflictWarning(conflict);
    } else {
        setConflictWarning(null);
    }

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
                        onClick={() => setTempConfig({...tempConfig, language: 'en'})}
                        className={`p-2 rounded-lg border text-sm font-medium transition-all ${tempConfig.language === 'en' ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-white dark:bg-cyber-800 border-paper-200 dark:border-cyber-600 text-slate-600 dark:text-slate-300 hover:border-cyan-500'}`}
                    >
                        English
                    </button>
                    <button
                        type="button"
                        onClick={() => setTempConfig({...tempConfig, language: 'zh'})}
                        className={`p-2 rounded-lg border text-sm font-medium transition-all ${tempConfig.language === 'zh' ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-white dark:bg-cyber-800 border-paper-200 dark:border-cyber-600 text-slate-600 dark:text-slate-300 hover:border-cyan-500'}`}
                    >
                        中文 (Simplified)
                    </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Server size={16} />
                  {t.provider}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['gemini', 'openai', 'ollama'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTempConfig({ ...tempConfig, provider: p, model: '' })} // Reset model on provider change
                      className={`p-2 rounded-lg border text-sm font-medium transition-all capitalize ${tempConfig.provider === p ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-white dark:bg-cyber-800 border-paper-200 dark:border-cyber-600 text-slate-600 dark:text-slate-300 hover:border-cyan-500'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {tempConfig.provider === 'gemini' && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200">
                      <strong>Gemini 2.5/3.0:</strong> Requires a valid API Key from Google AI Studio. Supports Thinking Budget and Search Grounding.
                  </div>
              )}

              {tempConfig.provider !== 'gemini' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                     <Globe size={16} />
                     {t.apiEndpoint}
                  </label>
                  <input
                    type="text"
                    value={tempConfig.baseUrl || ''}
                    onChange={(e) => setTempConfig({ ...tempConfig, baseUrl: e.target.value })}
                    placeholder={tempConfig.provider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1'}
                    className="w-full px-3 py-2 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 text-sm"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                   <Key size={16} />
                   {t.apiKey}
                </label>
                <input
                  type="password"
                  value={tempConfig.apiKey || ''}
                  onChange={(e) => setTempConfig({ ...tempConfig, apiKey: e.target.value })}
                  placeholder={tempConfig.provider === 'ollama' ? 'Optional for Ollama' : 'sk-...'}
                  className="w-full px-3 py-2 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                   <Cpu size={16} />
                   {t.modelName}
                </label>
                <div className="relative">
                    <input
                      type="text"
                      value={tempConfig.model}
                      onChange={(e) => setTempConfig({ ...tempConfig, model: e.target.value })}
                      placeholder="e.g. gpt-4, gemini-pro, llama2"
                      className="w-full px-3 py-2 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 text-sm"
                      list="recommended-models"
                    />
                    <datalist id="recommended-models">
                        {currentModels.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </datalist>
                </div>
                {tempConfig.provider === 'ollama' && (
                    <p className="text-xs text-slate-500">Make sure to <code>ollama pull &lt;model&gt;</code> first.</p>
                )}
              </div>

              <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Database size={16} />
                    Embedding Model (RAG)
                  </label>
                  <div className="relative">
                      <input
                        type="text"
                        value={tempConfig.embeddingModel || ''}
                        onChange={(e) => setTempConfig({ ...tempConfig, embeddingModel: e.target.value })}
                        placeholder="e.g. text-embedding-3-small"
                        className="w-full px-3 py-2 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 text-sm"
                        list="recommended-embedding-models"
                      />
                      <datalist id="recommended-embedding-models">
                          {currentEmbeddingModels.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                      </datalist>
                  </div>
                  <p className="text-xs text-slate-500">Used for "Chat with Files" and Knowledge Graph connections.</p>
              </div>

              {tempConfig.provider === 'gemini' && (
                  <div className="space-y-2 pt-2 border-t border-paper-200 dark:border-cyber-700">
                     <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={tempConfig.enableWebSearch || false} 
                                onChange={(e) => setTempConfig({...tempConfig, enableWebSearch: e.target.checked})}
                                className="sr-only peer" 
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-cyan-600"></div>
                            <span className="ml-3 text-sm font-medium text-slate-700 dark:text-slate-300">{t.enableWebSearch}</span>
                        </label>
                     </div>
                  </div>
              )}

              <div className="pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-paper-100 dark:hover:bg-cyber-800 transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-medium shadow-lg shadow-cyan-500/30 transition-all transform hover:scale-105"
                >
                  {t.save}
                </button>
              </div>
            </form>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="max-w-2xl mx-auto space-y-8 animate-fadeIn">
               
               {/* Login Config */}
               <div className="space-y-4 border-b border-paper-200 dark:border-cyber-700 pb-6">
                   <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                       <Lock size={20} className="text-yellow-500" />
                       Access Control
                   </h3>
                   
                   <div className="bg-white dark:bg-cyber-800 p-4 rounded-lg border border-paper-200 dark:border-cyber-700">
                       <div className="flex items-center justify-between">
                           <div>
                               <div className="font-medium text-slate-700 dark:text-slate-200">Require Login</div>
                               <div className="text-xs text-slate-500 dark:text-slate-400">Lock app with a password on startup</div>
                           </div>
                           <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={isLoginEnabled} 
                                    onChange={(e) => onToggleLogin && onToggleLogin(e.target.checked)}
                                    className="sr-only peer" 
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-yellow-500"></div>
                           </label>
                       </div>
                   </div>
               </div>

               {/* Database Backup Section */}
               <div className="space-y-4 border-b border-paper-200 dark:border-cyber-700 pb-6">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                       <Database size={20} className="text-emerald-500" />
                       Database Management
                   </h3>
                   
                   <div className="bg-white dark:bg-cyber-800 p-5 rounded-lg border border-paper-200 dark:border-cyber-700 space-y-4">
                        <div className="flex items-center justify-between">
                             <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Automatic Backup Frequency
                             </label>
                             <select 
                                value={tempConfig.backup?.frequency || 'weekly'}
                                onChange={(e) => setTempConfig({ 
                                    ...tempConfig, 
                                    backup: { ...(tempConfig.backup || { lastBackup: 0 }), frequency: e.target.value as BackupFrequency }
                                })}
                                className="bg-paper-50 dark:bg-cyber-900 border border-paper-300 dark:border-cyber-600 rounded-md text-sm px-3 py-1 text-slate-700 dark:text-slate-200 focus:outline-none"
                             >
                                 <option value="never">Never</option>
                                 <option value="daily">Daily</option>
                                 <option value="weekly">Weekly</option>
                                 <option value="monthly">Monthly</option>
                             </select>
                        </div>
                        
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                             Last Backup: {tempConfig.backup?.lastBackup ? new Date(tempConfig.backup.lastBackup).toLocaleString() : 'Never'}
                        </div>
                   </div>
               </div>

               {/* Import / Export */}
               <div className="space-y-4">
                   <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                       <RefreshCw size={20} className="text-cyan-500" />
                       Backup & Restore
                   </h3>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {/* Export */}
                       <div className="bg-white dark:bg-cyber-800 p-5 rounded-lg border border-paper-200 dark:border-cyber-700 flex flex-col gap-3">
                            <div className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                <Download size={16} /> Export Database
                            </div>
                            <p className="text-xs text-slate-500">Save all files, settings, and chat history to an encrypted .db file.</p>
                            
                            <div className="mt-auto pt-2">
                                {showExportPass ? (
                                    <div className="space-y-2 animate-fadeIn">
                                        <input 
                                            type="password" 
                                            placeholder="Set Encryption Password"
                                            value={exportPassword}
                                            onChange={(e) => setExportPassword(e.target.value)}
                                            className="w-full px-3 py-2 text-sm border border-paper-300 dark:border-cyber-600 rounded-md bg-paper-50 dark:bg-cyber-900 text-slate-800 dark:text-slate-200"
                                        />
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={handleDbExport}
                                                disabled={!exportPassword || isExporting}
                                                className="flex-1 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                {isExporting ? <RefreshCw className="animate-spin" size={14} /> : <Check size={14} />} Confirm
                                            </button>
                                            <button 
                                                onClick={() => setShowExportPass(false)}
                                                className="px-3 py-2 bg-paper-200 dark:bg-cyber-700 text-slate-600 dark:text-slate-300 rounded-md text-sm"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => setShowExportPass(true)}
                                        className="w-full px-3 py-2 bg-paper-100 dark:bg-cyber-700 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800/50 rounded-md text-sm font-bold transition-colors"
                                    >
                                        Export Backup
                                    </button>
                                )}
                            </div>
                       </div>

                       {/* Import */}
                       <div className="bg-white dark:bg-cyber-800 p-5 rounded-lg border border-paper-200 dark:border-cyber-700 flex flex-col gap-3">
                            <div className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                <Upload size={16} /> Import Database
                            </div>
                            <p className="text-xs text-slate-500">Restore from a previous backup file. Requires password.</p>
                            
                            <div className="mt-auto pt-2">
                                 {showImportPass ? (
                                    <div className="space-y-2 animate-fadeIn">
                                        <input 
                                            type="password" 
                                            placeholder="Enter Decryption Password"
                                            value={importPassword}
                                            onChange={(e) => setImportPassword(e.target.value)}
                                            className="w-full px-3 py-2 text-sm border border-paper-300 dark:border-cyber-600 rounded-md bg-paper-50 dark:bg-cyber-900 text-slate-800 dark:text-slate-200"
                                        />
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => dbInputRef.current?.click()}
                                                disabled={!importPassword || isImporting}
                                                className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                {isImporting ? <RefreshCw className="animate-spin" size={14} /> : <Upload size={14} />} Select File
                                            </button>
                                            <button 
                                                onClick={() => setShowImportPass(false)}
                                                className="px-3 py-2 bg-paper-200 dark:bg-cyber-700 text-slate-600 dark:text-slate-300 rounded-md text-sm"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => setShowImportPass(true)}
                                        className="w-full px-3 py-2 bg-paper-100 dark:bg-cyber-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 rounded-md text-sm font-bold transition-colors"
                                    >
                                        Import Backup
                                    </button>
                                )}
                            </div>
                            <input type="file" ref={dbInputRef} className="hidden" accept=".db" onChange={handleDbImport} />
                       </div>
                   </div>

                   {backupStatus && (
                       <div className={`p-3 rounded-lg text-sm text-center font-medium animate-fadeIn ${backupStatus.includes("Error") || backupStatus.includes("Failed") ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                           {backupStatus}
                       </div>
                   )}
               </div>

               <div className="pt-4 flex justify-end gap-2 border-t border-paper-200 dark:border-cyber-700">
                    <button
                        onClick={handleSubmit}
                        className="px-6 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-medium shadow-lg shadow-cyan-500/30 transition-all transform hover:scale-105"
                    >
                        Done
                    </button>
                </div>
            </div>
          )}

          {/* Prompts Tab */}
          {activeTab === 'prompts' && (
              <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">
                  {/* ... Existing prompt content ... */}
                  <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t.polishPrompt}
                      </label>
                      <textarea 
                          className="w-full h-32 px-3 py-2 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 text-sm resize-none"
                          value={tempConfig.customPrompts?.polish || ''}
                          onChange={e => setTempConfig({ ...tempConfig, customPrompts: { ...tempConfig.customPrompts, polish: e.target.value } })}
                          placeholder="Instructions for the 'Polish' feature..."
                      />
                  </div>
                  <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t.expandPrompt}
                      </label>
                      <textarea 
                          className="w-full h-32 px-3 py-2 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 text-sm resize-none"
                          value={tempConfig.customPrompts?.expand || ''}
                          onChange={e => setTempConfig({ ...tempConfig, customPrompts: { ...tempConfig.customPrompts, expand: e.target.value } })}
                          placeholder="Instructions for the 'Expand' feature..."
                      />
                  </div>
                   <div className="pt-4 flex justify-end gap-2">
                        <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-paper-100 dark:hover:bg-cyber-800 transition-colors"
                        >
                        {t.cancel}
                        </button>
                        <button
                        type="submit"
                        className="px-6 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-medium shadow-lg shadow-cyan-500/30 transition-all transform hover:scale-105"
                        >
                        {t.save}
                        </button>
                    </div>
              </form>
          )}

          {/* MCP / Tools Tab */}
          {activeTab === 'mcp' && (
            <div className="space-y-6 max-w-3xl mx-auto">
               <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                      <Wrench className="text-emerald-600 dark:text-emerald-400 mt-1" size={20} />
                      <div>
                          <h3 className="font-bold text-emerald-800 dark:text-emerald-300 text-sm">Model Context Protocol (MCP) Config</h3>
                          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                              Define custom tools and MCP servers here. The editor acts as an MCP Client. 
                              Use JSON format compatible with standard MCP server definitions.
                          </p>
                      </div>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="space-y-2">
                       <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex justify-between items-center">
                           <span>Configuration (JSON)</span>
                           <button onClick={handleInsertTemplate} className="text-xs text-cyan-500 hover:underline">Insert Template</button>
                       </label>
                       <textarea 
                           className="w-full h-80 font-mono text-xs p-3 bg-slate-900 text-slate-200 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                           value={tempConfig.mcpTools || ''}
                           onChange={e => setTempConfig({ ...tempConfig, mcpTools: e.target.value })}
                           spellCheck={false}
                       />
                       {parseError && (
                           <div className="text-xs text-red-500 flex items-center gap-1">
                               <AlertTriangle size={12} /> {parseError}
                           </div>
                       )}
                   </div>

                   <div className="space-y-4">
                        {/* Live Tool Test */}
                        <div className="bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded-lg p-3">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <Play size={12} /> Tool Simulator
                            </div>
                            <div className="space-y-2">
                                <select 
                                    className="w-full text-xs p-1.5 bg-paper-50 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded"
                                    onChange={(e) => setTestTool(e.target.value)}
                                    value={testTool || ''}
                                >
                                    <option value="">Select a tool to test...</option>
                                    {parsedTools.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                                </select>
                                <textarea 
                                    className="w-full h-16 text-xs p-2 bg-paper-50 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded resize-none focus:outline-none"
                                    placeholder="Enter a user prompt to trigger this tool..."
                                    value={testPrompt}
                                    onChange={e => setTestPrompt(e.target.value)}
                                />
                                <button 
                                    onClick={runToolTest}
                                    disabled={isTesting || !testTool}
                                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded disabled:opacity-50"
                                >
                                    {isTesting ? 'Running...' : 'Test Tool'}
                                </button>
                                
                                {testLog.length > 0 && (
                                    <div className="mt-2 p-2 bg-black rounded text-[10px] font-mono text-green-400 h-24 overflow-y-auto whitespace-pre-wrap">
                                        {testLog.map((l, i) => <div key={i}>{l}</div>)}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Active Tools List */}
                        <div className="bg-paper-50 dark:bg-cyber-900/50 p-3 rounded-lg border border-paper-200 dark:border-cyber-700">
                             <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Detected Tools</div>
                             {parsedTools.length === 0 ? (
                                 <div className="text-xs text-slate-400 italic">No tools defined.</div>
                             ) : (
                                 <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                                     {parsedTools.map(t => (
                                         <div key={t.name} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-cyber-800 p-1.5 rounded border border-paper-100 dark:border-cyber-600">
                                             <Code2 size={12} className="text-emerald-500" />
                                             <span className="font-mono font-bold">{t.name}</span>
                                             <span className="text-slate-400 truncate flex-1 ml-2">{t.description}</span>
                                         </div>
                                     ))}
                                 </div>
                             )}
                        </div>
                   </div>
               </div>

                <div className="pt-4 flex justify-end gap-2">
                    <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-paper-100 dark:hover:bg-cyber-800 transition-colors"
                    >
                    {t.cancel}
                    </button>
                    <button
                    type="button"
                    onClick={() => { onSave(tempConfig); onClose(); }}
                    className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-lg shadow-emerald-500/30 transition-all transform hover:scale-105"
                    >
                    Save Tools
                    </button>
                </div>
            </div>
          )}

          {/* Keyboard Shortcuts Tab */}
          {activeTab === 'keyboard' && (
              <div className="max-w-3xl mx-auto space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-paper-200 dark:border-cyber-700">
                      <div>
                          <h3 className="font-bold text-slate-800 dark:text-slate-100">{t.keyboardShortcuts}</h3>
                          <p className="text-xs text-slate-500">Click a shortcut field and press keys to rebind.</p>
                      </div>
                      <button 
                         onClick={onResetShortcuts}
                         className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded border border-red-200 dark:border-red-900/50"
                      >
                          {t.resetDefaults}
                      </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto custom-scrollbar p-1">
                      {shortcuts.map(sc => {
                          const isRecording = recordingId === sc.id;
                          return (
                              <div key={sc.id} className="flex items-center justify-between p-3 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded-lg">
                                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{sc.label}</span>
                                  <div className="relative">
                                      <input 
                                          type="text" 
                                          readOnly
                                          value={isRecording ? (t.pressKeys || "Press keys...") : sc.keys}
                                          onClick={() => setRecordingId(sc.id)}
                                          onKeyDown={(e) => handleKeyDownRecord(e, sc.id)}
                                          onBlur={() => { setRecordingId(null); setConflictWarning(null); }}
                                          className={`
                                              w-32 text-center text-xs font-mono py-1.5 px-2 rounded cursor-pointer border-2 transition-all outline-none
                                              ${isRecording 
                                                  ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 animate-pulse' 
                                                  : 'border-paper-200 dark:border-cyber-600 bg-paper-50 dark:bg-cyber-900 text-slate-600 dark:text-slate-400 hover:border-cyan-400'}
                                          `}
                                      />
                                      {isRecording && conflictWarning && (
                                          <div className="absolute top-full right-0 mt-2 z-10 bg-red-100 text-red-700 text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                                              {conflictWarning}
                                          </div>
                                      )}
                                  </div>
                              </div>
                          );
                      })}
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button
                      onClick={onClose}
                      className="px-6 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-medium shadow-lg shadow-cyan-500/30 transition-all transform hover:scale-105"
                    >
                      {t.save}
                    </button>
                  </div>
              </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-8 max-w-4xl mx-auto">
              {/* Existing Themes Grid */}
              <div className="space-y-4">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">{t.availableThemes}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {themes.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => onSelectTheme(theme.id)}
                        className={`
                          relative group rounded-xl p-3 border-2 transition-all text-left overflow-hidden
                          ${activeThemeId === theme.id 
                            ? 'border-cyan-500 shadow-lg shadow-cyan-500/20 scale-[1.02]' 
                            : 'border-paper-200 dark:border-cyber-700 hover:border-cyan-300 dark:hover:border-cyan-700'}
                        `}
                      >
                        <div 
                           className="h-20 w-full rounded-lg mb-3 relative shadow-inner"
                           style={{ backgroundColor: theme.colors['--bg-main'] }}
                        >
                           <div className="absolute top-2 left-2 w-8 h-8 rounded bg-[rgb(var(--primary-500))]" style={{ backgroundColor: theme.colors['--primary-500'] }}></div>
                           <div className="absolute bottom-2 right-2 w-16 h-4 rounded bg-[rgb(var(--bg-panel))]" style={{ backgroundColor: theme.colors['--bg-panel'] }}></div>
                           
                           {theme.isCustom && (
                             <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-bl-lg font-bold">CUSTOM</div>
                           )}
                        </div>
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{theme.name}</h3>
                                <p className="text-xs text-slate-500 capitalize">{theme.type} Mode</p>
                            </div>
                            {theme.isCustom && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onDeleteTheme(theme.id); }}
                                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-paper-100 dark:hover:bg-cyber-800 transition-colors"
                                    title={t.deleteTheme}
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                      </button>
                    ))}
                    
                    {/* Import Theme Button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-xl p-3 border-2 border-dashed border-paper-300 dark:border-cyber-600 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-cyan-500 hover:border-cyan-400 hover:bg-paper-50 dark:hover:bg-cyber-800/50 transition-all min-h-[140px]"
                    >
                      <Upload size={24} />
                      <span className="text-sm font-medium">{t.importTheme}</span>
                      <span className="text-[10px] opacity-70">(.json)</span>
                    </button>
                  </div>
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileUpload} />
              
              <div className="pt-4 flex justify-end">
                <button
                  onClick={onClose}
                  className="px-6 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-medium shadow-lg shadow-cyan-500/30 transition-all transform hover:scale-105"
                >
                  {t.close}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
