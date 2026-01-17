

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { X, Save, Server, Cpu, Key, Globe, Palette, Upload, Trash2, Check, Download, Plus, Languages, MessageSquare, ChevronDown, Wrench, AlertTriangle, Play, Terminal, Code2, Box, Keyboard, Command, Shield, Eye, EyeOff, FolderOpen, Tag, RefreshCw, Database, Trash, Zap } from 'lucide-react';
import { AIConfig, AppTheme, AppShortcut } from '../types';
import { translations, Language } from '../utils/translations';
import { generateAIResponse, VirtualMCPClient } from '../services/aiService';
import { mcpService } from '../src/services/mcpService';
import { DEFAULT_CONTEXT_CONFIG } from '../src/services/context/types';
import { memoryCleanupService, type CleanupStats, type CleanupReport } from '../src/services/context/memoryCleanupService';
import { memoryAutoUpgradeService, type MemoryAutoUpgradeConfig } from '../src/services/context/memoryAutoUpgrade';

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
  showToast?: (message: string, isError?: boolean) => void;
  onDataImported?: () => void; // Callback after successful backup import
  showConfirmDialog?: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: 'danger' | 'warning' | 'info',
    confirmText?: string,
    cancelText?: string
  ) => void;
}

type Tab = 'ai' | 'appearance' | 'prompts' | 'mcp' | 'keyboard' | 'security' | 'context';

const RECOMMENDED_MODELS: Record<string, { id: string, name: string }[]> = {
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

const RECOMMENDED_EMBEDDING_MODELS: Record<string, { id: string, name: string }[]> = {
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
  showToast,
  onDataImported,
  showConfirmDialog
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('ai');
  const [tempConfig, setTempConfig] = useState<AIConfig>(config);

  // 🔧 修复: 辅助函数，安全更新 contextEngine
  const updateContextEngine = (updates: any) => {
    setTempConfig({
      ...tempConfig,
      contextEngine: {
        ...(tempConfig.contextEngine || {}),
        ...updates
      }
    });
  };

  // Test State
  const [testTool, setTestTool] = useState<string | null>(null); // Name of tool being tested
  const [testPrompt, setTestPrompt] = useState<string>('');
  const [testLog, setTestLog] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  // Keyboard Recording State
  const [recordingId, setRecordingId] = useState<string | null>(null);

  // Backup State
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordAction, setPasswordAction] = useState<'export' | 'import' | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isProcessingBackup, setIsProcessingBackup] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [selectedBackupFile, setSelectedBackupFile] = useState<{ filePath: string; fileName: string; fileSize: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // State for real MCP tools from Electron
  const [realMcpTools, setRealMcpTools] = useState<Array<{ name: string; description: string }>>([]);
  const [isLoadingMcpTools, setIsLoadingMcpTools] = useState(false);

  React.useEffect(() => {
    if (isOpen) setTempConfig(config);
  }, [isOpen, config]);

  // Load real MCP tools from Electron when modal opens
  useEffect(() => {
    const loadRealTools = async () => {
      if (!isOpen) return;

      if (mcpService.isAvailable()) {
        setIsLoadingMcpTools(true);
        try {
          const tools = await mcpService.getTools();
          setRealMcpTools(tools.map(t => ({ name: t.name, description: t.description })));
        } catch (error) {
          console.error('Failed to load MCP tools:', error);
        } finally {
          setIsLoadingMcpTools(false);
        }
      }
    };

    loadRealTools();
  }, [isOpen]);

  // Derived state for MCP parsing (config servers only, not actual tools)
  const { activeServers, parseError } = useMemo(() => {
    if (!tempConfig.mcpTools || tempConfig.mcpTools.trim() === '[]') {
      return { activeServers: [], parseError: null };
    }
    try {
      const json = JSON.parse(tempConfig.mcpTools);
      const servers = json.mcpServers ? Object.keys(json.mcpServers) : [];
      return { activeServers: servers, parseError: null };
    } catch (e: any) {
      return { activeServers: [], parseError: e.message };
    }
  }, [tempConfig.mcpTools]);

  // Use real tools if available, otherwise empty
  const parsedTools = realMcpTools;

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
          showToast?.('Invalid Theme: Missing name, type ("light"|"dark"), or colors object.', true);
          return;
        }

        const newTheme: AppTheme = {
          ...json,
          id: json.id || `custom-${Date.now()}`,
          isCustom: true
        };
        onImportTheme(newTheme);
      } catch (err) {
        showToast?.('Failed to parse JSON file. Please ensure it is valid JSON.', true);
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

  // Backup Handlers
  const handleExportBackup = () => {
    setPasswordAction('export');
    setBackupPassword('');
    setBackupError(null);
    setShowPasswordDialog(true);
  };

  const handleImportBackup = async () => {
    // Step 1: First select file
    if (!window.electronAPI?.backup?.selectFile) {
      setBackupError('Backup feature is only available in Electron mode');
      return;
    }

    try {
      const result = await window.electronAPI.backup.selectFile();
      if (result.canceled || !result.success) {
        return; // User canceled or error
      }

      // Store file info and show password dialog
      setSelectedBackupFile({
        filePath: result.filePath!,
        fileName: result.fileName!,
        fileSize: result.fileSize!
      });
      setPasswordAction('import');
      setBackupPassword('');
      setBackupError(null);
      setShowPasswordDialog(true);
    } catch (error: any) {
      showToast?.(error.message || 'Failed to select file', true);
    }
  };

  const handlePasswordConfirm = async () => {
    if (!backupPassword.trim()) {
      setBackupError(t.backup.enterPassword);
      return;
    }

    setIsProcessingBackup(true);
    setBackupError(null);

    try {
      if (window.electronAPI?.backup) {
        if (passwordAction === 'export') {
          const result = await window.electronAPI.backup.export(backupPassword);
          if (result.success) {
            // Update last backup time
            setTempConfig({
              ...tempConfig,
              backup: {
                ...tempConfig.backup,
                frequency: tempConfig.backup?.frequency || 'never',
                lastBackup: Date.now()
              }
            });
            setShowPasswordDialog(false);
            showToast?.(t.backup.exportSuccess, false);
          } else {
            setBackupError(result.error || 'Export failed');
          }
        } else if (passwordAction === 'import') {
          // Use pre-selected file path if available
          const result = await window.electronAPI.backup.import(backupPassword, selectedBackupFile?.filePath);
          if (result.success) {
            setShowPasswordDialog(false);
            setSelectedBackupFile(null);
            showToast?.(t.backup.importSuccess, false);
            // Call the callback to reload data instead of page refresh
            if (onDataImported) {
              onDataImported();
            }
          } else {
            setBackupError(result.error || t.backup.invalidPassword);
          }
        }
      } else {
        setBackupError('Backup feature is only available in Electron mode');
      }
    } catch (error: any) {
      setBackupError(error.message || 'An error occurred');
    } finally {
      setIsProcessingBackup(false);
    }
  };

  const formatLastBackupDate = (timestamp?: number): string => {
    if (!timestamp) return t.backup.neverBackedUp;
    const date = new Date(timestamp);
    return date.toLocaleString(currentUiLang === 'zh' ? 'zh-CN' : 'en-US');
  };

  const currentModels = RECOMMENDED_MODELS[tempConfig.provider] || [];
  // Use embeddingProvider if set, otherwise fallback to main provider
  const effectiveEmbeddingProvider = tempConfig.embeddingProvider || tempConfig.provider;
  const currentEmbeddingModels = RECOMMENDED_EMBEDDING_MODELS[effectiveEmbeddingProvider] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="w-full max-w-4xl bg-white dark:bg-cyber-900 rounded-xl shadow-2xl border border-paper-200 dark:border-cyber-700 overflow-hidden transform transition-all scale-100 flex flex-col h-[85vh]">

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
              onClick={() => setActiveTab('security')}
              className={`text-sm font-bold flex items-center gap-2 pb-1 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'security' ? 'text-amber-600 dark:text-amber-400 border-amber-500' : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              <Shield size={18} />
              {t.backup.title || "Backup"}
            </button>
            <button
              onClick={() => setActiveTab('context')}
              className={`text-sm font-bold flex items-center gap-2 pb-1 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'context' ? 'text-blue-600 dark:text-blue-400 border-blue-500' : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              <Cpu size={18} />
              Context
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
                  {['gemini', 'ollama', 'openai', 'anthropic'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTempConfig({ ...tempConfig, provider: p as any })}
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
                      {t.enableWebSearch || "Enable Google Search"}
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
                    {t.enableStreaming || "Enable Streaming Response"}
                  </label>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 ml-7">
                  {t.streamingHint || "Show AI response as it's being generated in real-time."} <br />
                  <span className="text-amber-500 font-medium">⚠️ {t.streamingRecommend || "Recommended: Disable streaming for better tool calling stability and real-time UI feedback."}</span>
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
                    {t.enableTagSuggestion || "Enable AI Tag Suggestion"}
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
                    {t.autoSuggestTags || "Auto-suggest tags when creating notes"}
                  </label>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 ml-7">
                  {t.tagSuggestionHint || "Uses AI to analyze content and suggest relevant tags automatically."}
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

              {/* Embedding Model Selection - Independent Provider */}
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
                  {['gemini', 'ollama', 'openai'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTempConfig({ ...tempConfig, embeddingProvider: p as any })}
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
                  <Box size={16} /> Discovered Tools ({isLoadingMcpTools ? '...' : parsedTools.length})
                </h3>

                {isLoadingMcpTools ? (
                  <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-paper-200 dark:border-cyber-700 rounded-xl p-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-2"></div>
                    <p className="text-xs text-slate-400">Loading MCP tools...</p>
                  </div>
                ) : parsedTools.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-paper-200 dark:border-cyber-700 rounded-xl p-8 text-center">
                    <Code2 className="text-slate-300 dark:text-slate-600 mb-2" size={32} />
                    <p className="text-xs text-slate-400">No tools found.<br />Configure servers on the left.</p>
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
                        {/* Full description - no line clamp */}
                        <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
                          {tool.description || "No description provided."}
                        </p>
                        {/* Parameters with descriptions */}
                        {(() => {
                          const schema = tool.parameters?.properties || tool.inputSchema?.properties || {};
                          const required = tool.parameters?.required || tool.inputSchema?.required || [];
                          const props = Object.entries(schema);
                          if (props.length === 0) return null;
                          return (
                            <div className="mt-2 pt-2 border-t border-paper-100 dark:border-cyber-700/50 space-y-1">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">Parameters:</span>
                              {props.map(([prop, schema]: [string, any]) => (
                                <div key={prop} className="flex items-start gap-2 text-[10px]">
                                  <span className={`font-mono px-1 py-0.5 rounded border ${required.includes(prop) ? 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 border-paper-200 dark:border-cyber-600'}`}>
                                    {prop}{required.includes(prop) && '*'}
                                  </span>
                                  <span className="text-slate-400">
                                    ({schema.type || 'any'})
                                    {schema.description && <span className="ml-1 text-slate-500">- {schema.description}</span>}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
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

          {/* Security / Backup Tab */}
          {activeTab === 'security' && (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div className="bg-[rgb(var(--bg-panel))] p-4 rounded-xl border border-[rgb(var(--border-main))] shadow-sm">
                <h3 className="text-base font-bold text-[rgb(var(--text-primary))] mb-2 flex items-center gap-2 font-[var(--font-header)]">
                  <Shield size={20} className="text-amber-500" />
                  {currentUiLang === 'zh' ? '安全与备份' : 'Security & Backup'}
                </h3>
                <p className="text-sm text-[rgb(var(--text-secondary))] font-[var(--font-primary)]">
                  {currentUiLang === 'zh' ? '管理应用安全和数据备份设置' : 'Manage app security and data backup settings'}
                </p>
              </div>

              {/* Login Protection (Electron only) */}
              {window.electronAPI && (
                <div className="bg-[rgb(var(--bg-panel))] p-5 rounded-xl border border-[rgb(var(--border-main))] space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-[rgb(var(--text-primary))] mb-3 font-[var(--font-header)]">
                      {currentUiLang === 'zh' ? '登录保护' : 'Login Protection'}
                    </h4>
                    <div className="flex items-center justify-between p-4 bg-[rgb(var(--bg-element))] rounded-lg border border-[rgb(var(--border-main))]">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Shield size={16} className="text-[rgb(var(--primary-500))]" />
                          <span className="text-sm font-medium text-[rgb(var(--text-primary))] font-[var(--font-primary)]">
                            {currentUiLang === 'zh' ? '启用登录保护' : 'Enable Login Protection'}
                          </span>
                        </div>
                        <p className="text-xs text-[rgb(var(--text-secondary))] font-[var(--font-primary)]">
                          {currentUiLang === 'zh'
                            ? '启用后,应用启动时需要输入密码。仅在Electron桌面应用中可用。'
                            : 'Require password on app startup. Only available in Electron desktop app.'}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer ml-4">
                        <input
                          type="checkbox"
                          checked={!!tempConfig.security?.enableLoginProtection}
                          onChange={(e) => setTempConfig({
                            ...tempConfig,
                            security: {
                              ...tempConfig.security,
                              enableLoginProtection: e.target.checked
                            }
                          })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-[rgb(var(--neutral-300))] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[rgba(var(--primary-500)/0.3)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[rgb(var(--border-main))] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[rgb(var(--primary-500))]"></div>
                      </label>
                    </div>
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-xs text-blue-700 dark:text-blue-300 font-[var(--font-primary)]">
                        <strong>{currentUiLang === 'zh' ? '注意' : 'Note'}:</strong> {currentUiLang === 'zh'
                          ? '首次启用时,系统会要求您创建用户名和密码。请妥善保管您的密码,遗失后无法找回。'
                          : 'On first enable, you will be prompted to create a username and password. Keep your password safe - it cannot be recovered if lost.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Backup Frequency */}
              <div className="bg-[rgb(var(--bg-panel))] p-5 rounded-xl border border-[rgb(var(--border-main))] space-y-4">
                <div>
                  <label className="block text-sm font-bold text-[rgb(var(--text-primary))] mb-3 font-[var(--font-header)]">
                    {t.backup.frequency}
                  </label>
                  <div className="grid grid-cols-4 gap-3">
                    {(['never', 'daily', 'weekly', 'monthly'] as const).map((freq) => (
                      <button
                        key={freq}
                        type="button"
                        onClick={() => setTempConfig({
                          ...tempConfig,
                          backup: {
                            ...tempConfig.backup,
                            frequency: freq,
                            lastBackup: tempConfig.backup?.lastBackup || 0
                          }
                        })}
                        className={`py-2.5 px-3 rounded-lg border transition-all text-sm font-medium font-[var(--font-primary)] ${(tempConfig.backup?.frequency || 'never') === freq
                            ? 'bg-[rgba(var(--primary-500)/0.1)] border-[rgb(var(--primary-500))] text-[rgb(var(--primary-500))] ring-1 ring-[rgb(var(--primary-500))]'
                            : 'bg-[rgb(var(--bg-element))] border-[rgb(var(--border-main))] text-[rgb(var(--text-primary))] hover:border-[rgb(var(--primary-500))]'
                          }`}
                      >
                        {t.backup[freq]}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-[rgb(var(--text-secondary))] mt-3 flex items-center gap-2 font-[var(--font-primary)]">
                    <span className="font-semibold">{t.backup.lastBackup}:</span>
                    <span>{formatLastBackupDate(tempConfig.backup?.lastBackup)}</span>
                  </p>
                </div>
              </div>

              {/* Manual Backup Actions */}
              <div className="bg-[rgb(var(--bg-panel))] p-5 rounded-xl border border-[rgb(var(--border-main))] space-y-4">
                <h4 className="text-sm font-bold text-[rgb(var(--text-primary))] font-[var(--font-header)]">
                  {currentUiLang === 'zh' ? '手动备份操作' : 'Manual Backup Operations'}
                </h4>
                <div className="flex gap-4">
                  <button
                    onClick={handleExportBackup}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-[rgb(var(--primary-500))] to-[rgb(var(--primary-600))] hover:opacity-90 text-white rounded-lg shadow-md transition-all hover:shadow-[rgba(var(--primary-500)/0.25)] font-medium font-[var(--font-primary)]"
                  >
                    <Download size={18} />
                    {t.backup.export}
                  </button>
                  <button
                    onClick={handleImportBackup}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-[rgb(var(--secondary-500))] to-[rgb(var(--primary-500))] hover:opacity-90 text-white rounded-lg shadow-md transition-all hover:shadow-[rgba(var(--secondary-500)/0.25)] font-medium font-[var(--font-primary)]"
                  >
                    <Upload size={18} />
                    {t.backup.import}
                  </button>
                </div>

                {/* Open Data Directory Button */}
                <button
                  onClick={async () => {
                    const memoriesDir = (window as any).electronAPI?.paths?.userData + '/.memories';
                    if (memoriesDir) {
                      await (window as any).electronAPI?.file?.openPath(memoriesDir);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[rgb(var(--bg-element))] hover:bg-[rgb(var(--border-main))] text-[rgb(var(--text-primary))] rounded-lg transition-colors font-medium font-[var(--font-primary)]"
                >
                  <FolderOpen size={16} />
                  {t.backup.openDataDirectory}
                </button>
              </div>

              {/* Warning Notice */}
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1 font-[var(--font-header)]">
                      {currentUiLang === 'zh' ? '重要提示' : 'Important Notice'}
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 font-[var(--font-primary)]">
                      {t.backup.importWarning}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Context Engineering Tab */}
          {activeTab === 'context' && (
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
                            if (showConfirmDialog) {
                              showConfirmDialog(
                                t.deleteTheme,
                                `Delete theme "${theme.name}"?`,
                                () => onDeleteTheme(theme.id),
                                'danger',
                                'Delete',
                                'Cancel'
                              );
                            } else {
                              // Fallback to native confirm if showConfirmDialog not provided
                              if (confirm(`Delete theme "${theme.name}"?`)) onDeleteTheme(theme.id);
                            }
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
        {activeTab === 'ai' || activeTab === 'prompts' || activeTab === 'mcp' || activeTab === 'keyboard' || activeTab === 'security' || activeTab === 'context' ? (
          <div className="p-4 border-t border-paper-200 dark:border-cyber-700 flex justify-end gap-3 bg-paper-50 dark:bg-cyber-800/50 flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-paper-200 dark:hover:bg-cyber-700">{activeTab === 'context' ? t.close : t.cancel}</button>
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

      {/* Password Dialog Modal */}
      {showPasswordDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[rgb(var(--bg-main))] rounded-xl shadow-2xl border border-[rgb(var(--border-main))] overflow-hidden transform transition-all scale-100">
            {/* Dialog Header */}
            <div className="p-5 border-b border-[rgb(var(--border-main))] bg-gradient-to-r from-[rgb(var(--primary-500))] to-[rgb(var(--secondary-500))]">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 font-[var(--font-header)]">
                <Shield size={20} />
                {passwordAction === 'export' ? t.backup.export : t.backup.import}
              </h3>
              <p className="text-sm text-white/90 mt-1 font-[var(--font-primary)]">
                {t.backup.enterPassword}
              </p>
            </div>

            {/* Dialog Content */}
            <div className="p-6 space-y-4">
              {/* Show selected file info for import */}
              {passwordAction === 'import' && selectedBackupFile && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1 font-[var(--font-header)]">
                    {currentUiLang === 'zh' ? '已选择文件' : 'Selected File'}
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-mono truncate">
                    {selectedBackupFile.fileName}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-[var(--font-primary)]">
                    {(selectedBackupFile.fileSize / 1024).toFixed(1)} KB
                  </p>
                </div>
              )}

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isProcessingBackup) handlePasswordConfirm();
                    if (e.key === 'Escape') setShowPasswordDialog(false);
                  }}
                  className="w-full px-4 py-3 pr-12 rounded-lg bg-[rgb(var(--bg-element))] border border-[rgb(var(--border-main))] text-[rgb(var(--text-primary))] focus:outline-none focus:ring-2 focus:ring-amber-500 font-[var(--font-primary)]"
                  placeholder={currentUiLang === 'zh' ? '输入密码...' : 'Enter password...'}
                  autoFocus
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] transition-colors"
                  type="button"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <p className="text-xs text-[rgb(var(--text-secondary))] font-[var(--font-primary)]">
                {t.backup.passwordHint}
              </p>

              {backupError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2 font-[var(--font-primary)]">
                    <AlertTriangle size={16} />
                    {backupError}
                  </p>
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="p-4 border-t border-[rgb(var(--border-main))] flex justify-end gap-3 bg-[rgb(var(--bg-panel))]">
              <button
                onClick={() => { setShowPasswordDialog(false); setSelectedBackupFile(null); }}
                disabled={isProcessingBackup}
                className="px-4 py-2 rounded-lg text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-element))] disabled:opacity-50 transition-colors font-[var(--font-primary)]"
              >
                {t.cancel}
              </button>
              <button
                onClick={handlePasswordConfirm}
                disabled={isProcessingBackup || !backupPassword.trim()}
                className="px-6 py-2 bg-gradient-to-r from-[rgb(var(--primary-500))] to-[rgb(var(--secondary-500))] hover:opacity-90 text-white rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium font-[var(--font-primary)]"
              >
                {isProcessingBackup ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span>
                    {currentUiLang === 'zh' ? '处理中...' : 'Processing...'}
                  </span>
                ) : (
                  t.save
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Memory Statistics Section Component
interface MemoryStatsSectionProps {
  currentUiLang: 'zh' | 'en';
  showToast?: (message: string, isError?: boolean) => void;
}

const MemoryStatsSection: React.FC<MemoryStatsSectionProps> = ({ currentUiLang, showToast }) => {
  const [stats, setStats] = useState<CleanupStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [lastCleanup, setLastCleanup] = useState<string | null>(null);

  const t = currentUiLang === 'zh' ? {
    refresh: '刷新',
    runCleanup: '运行清理',
    cleaning: '清理中...',
    midTermSessions: '会话摘要',
    promotedSessions: '已升级会话',
    persistentFiles: '持久记忆文件',
    expiredCount: '过期数量',
    danglingCount: '悬挂升级',
    orphanedCount: '孤立向量',
    totalMemories: '总记忆数',
    cleanupSuccess: '清理完成：删除了 {count} 个过期记忆',
    cleanupError: '清理失败：{error}',
    noData: '暂无数据',
    sqliteLabel: 'SQLite',
    memoriesLabel: '.memories/',
  } : {
    refresh: 'Refresh',
    runCleanup: 'Run Cleanup',
    cleaning: 'Cleaning...',
    midTermSessions: 'Session Summaries',
    promotedSessions: 'Promoted Sessions',
    persistentFiles: 'Persistent Files',
    expiredCount: 'Expired',
    danglingCount: 'Dangling Upgrades',
    orphanedCount: 'Orphaned Vectors',
    totalMemories: 'Total Memories',
    cleanupSuccess: 'Cleanup completed: {count} expired memories removed',
    cleanupError: 'Cleanup failed: {error}',
    noData: 'No data',
    sqliteLabel: 'SQLite',
    memoriesLabel: '.memories/',
  };

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await memoryCleanupService.getCleanupStats();
      setStats(result);
    } catch (error) {
      console.error('[MemoryStatsSection] Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCleanup = useCallback(async () => {
    setCleaning(true);
    try {
      const result = await memoryCleanupService.runCleanup();
      if (result.errors.length === 0) {
        setLastCleanup(new Date().toLocaleString());
        showToast?.(t.cleanupSuccess.replace('{count}', String(result.expiredMidTerm)), false);
        await fetchStats();
      } else {
        showToast?.(t.cleanupError.replace('{error}', result.errors.join(', ')), true);
      }
    } catch (error) {
      showToast?.(t.cleanupError.replace('{error}', String(error)), true);
    } finally {
      setCleaning(false);
    }
  }, [fetchStats, showToast, t]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="space-y-4">
      {/* Stats Grid - 3+2 布局 */}
      <div className="space-y-3">
        {/* 第一行：主要统计 (3列) */}
        <div className="grid grid-cols-3 gap-3">
          {/* 会话摘要 (原中期记忆) */}
          <div className="bg-[rgb(var(--bg-element))] p-3 rounded-lg">
            <div className="text-xs text-[rgb(var(--text-secondary))]">{t.midTermSessions}</div>
            <div className="text-lg font-bold text-[rgb(var(--text-primary))]">
              {loading ? '...' : stats?.totalMidTerm || 0}
            </div>
            <div className="text-[10px] text-[rgb(var(--text-secondary))] opacity-60">
              {t.sqliteLabel}
            </div>
          </div>
          
          {/* 已升级会话 (原长期记忆) */}
          <div className="bg-[rgb(var(--bg-element))] p-3 rounded-lg">
            <div className="text-xs text-[rgb(var(--text-secondary))]">{t.promotedSessions}</div>
            <div className="text-lg font-bold text-[rgb(var(--text-primary))]">
              {loading ? '...' : stats?.totalLongTerm || 0}
            </div>
            <div className="text-[10px] text-[rgb(var(--text-secondary))] opacity-60">
              {t.sqliteLabel}
            </div>
          </div>
          
          {/* 🆕 持久记忆文件 */}
          <div className="bg-[rgb(var(--bg-element))] p-3 rounded-lg border-l-2 border-green-500">
            <div className="text-xs text-[rgb(var(--text-secondary))]">{t.persistentFiles}</div>
            <div className="text-lg font-bold text-green-500">
              {loading ? '...' : stats?.persistentFiles || 0}
            </div>
            <div className="text-[10px] text-[rgb(var(--text-secondary))] opacity-60">
              {t.memoriesLabel}
            </div>
          </div>
        </div>
        
        {/* 第二行：清理相关 (2列) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[rgb(var(--bg-element))] p-3 rounded-lg">
            <div className="text-xs text-[rgb(var(--text-secondary))]">{t.expiredCount}</div>
            <div className="text-lg font-bold text-orange-500">
              {loading ? '...' : stats?.expiredCount || 0}
            </div>
          </div>
          <div className="bg-[rgb(var(--bg-element))] p-3 rounded-lg">
            <div className="text-xs text-[rgb(var(--text-secondary))]">{t.danglingCount}</div>
            <div className="text-lg font-bold text-yellow-500">
              {loading ? '...' : stats?.danglingCount || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[rgb(var(--bg-element))] border border-[rgb(var(--border-main))] rounded-lg text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--border-main))] disabled:opacity-50 transition-colors text-sm"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t.refresh}
        </button>
        <button
          onClick={handleCleanup}
          disabled={cleaning}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50 transition-colors text-sm"
        >
          {cleaning ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              {t.cleaning}
            </span>
          ) : (
            <>
              <Trash size={14} />
              {t.runCleanup}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// Auto Upgrade Settings Section Component
interface AutoUpgradeSettingsSectionProps {
  currentUiLang: 'zh' | 'en';
}

const AutoUpgradeSettingsSection: React.FC<AutoUpgradeSettingsSectionProps> = ({ currentUiLang }) => {
  const [config, setConfig] = useState<MemoryAutoUpgradeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const t = currentUiLang === 'zh' ? {
    upgradeThreshold: '升级阈值（天数）',
    upgradeThresholdDesc: '中期记忆多少天未访问后升级为长期记忆',
    minAccessCount: '最小访问次数',
    minAccessCountDesc: '至少被访问多少次才会考虑升级',
    enableAutoUpgrade: '启用自动升级',
    enableAutoUpgradeDesc: '自动将符合条件的中期记忆升级为长期记忆',
    days: '天',
    times: '次',
    loading: '加载中...',
  } : {
    upgradeThreshold: 'Upgrade Threshold (Days)',
    upgradeThresholdDesc: 'Days of no access before upgrading mid-term to long-term memory',
    minAccessCount: 'Min Access Count',
    minAccessCountDesc: 'Minimum access count before considering upgrade',
    enableAutoUpgrade: 'Enable Auto Upgrade',
    enableAutoUpgradeDesc: 'Automatically upgrade eligible mid-term memories to long-term',
    days: 'days',
    times: 'times',
    loading: 'Loading...',
  };

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await memoryAutoUpgradeService.getConfig();
        setConfig(cfg);
      } catch (error) {
        console.error('[AutoUpgradeSettingsSection] Failed to load config:', error);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  const updateConfig = useCallback(async (updates: Partial<MemoryAutoUpgradeConfig>) => {
    if (!config) return;
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    try {
      await memoryAutoUpgradeService.updateConfig(newConfig);
    } catch (error) {
      console.error('[AutoUpgradeSettingsSection] Failed to update config:', error);
    }
  }, [config]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4 text-[rgb(var(--text-secondary))]">
        {t.loading}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Enable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-[rgb(var(--text-primary))]">{t.enableAutoUpgrade}</div>
          <div className="text-xs text-[rgb(var(--text-secondary))]">{t.enableAutoUpgradeDesc}</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config?.enabled ?? false}
            onChange={(e) => updateConfig({ enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[rgb(var(--neutral-300))] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[rgba(var(--primary-500)/0.3)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[rgb(var(--border-main))] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[rgb(var(--primary-500))]"></div>
        </label>
      </div>

      {/* Upgrade Threshold */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--text-primary))] mb-2">
          {t.upgradeThreshold}
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="7"
            max="90"
            step="1"
            value={config?.daysThreshold || 30}
            onChange={(e) => updateConfig({ daysThreshold: parseInt(e.target.value) })}
            className="flex-1 h-2 bg-[rgb(var(--bg-element))] rounded-lg appearance-none cursor-pointer accent-[rgb(var(--primary-500))]"
          />
          <span className="text-sm font-medium text-[rgb(var(--primary-500))] min-w-[3ch]">
            {config?.daysThreshold || 30}
          </span>
          <span className="text-xs text-[rgb(var(--text-secondary))]">{t.days}</span>
        </div>
        <p className="text-xs text-[rgb(var(--text-secondary))] mt-1">{t.upgradeThresholdDesc}</p>
      </div>

      {/* Min Access Count */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--text-primary))] mb-2">
          {t.minAccessCount}
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={config?.minAccessCount || 3}
            onChange={(e) => updateConfig({ minAccessCount: parseInt(e.target.value) })}
            className="flex-1 h-2 bg-[rgb(var(--bg-element))] rounded-lg appearance-none cursor-pointer accent-[rgb(var(--primary-500))]"
          />
          <span className="text-sm font-medium text-[rgb(var(--primary-500))] min-w-[2ch]">
            {config?.minAccessCount || 3}
          </span>
          <span className="text-xs text-[rgb(var(--text-secondary))]">{t.times}</span>
        </div>
        <p className="text-xs text-[rgb(var(--text-secondary))] mt-1">{t.minAccessCountDesc}</p>
      </div>
    </div>
  );
};