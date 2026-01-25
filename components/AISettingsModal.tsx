import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Cpu, Keyboard, MessageSquare, Palette, Save, Server, Shield, Wrench, X } from 'lucide-react';
import { AIConfig, AppTheme, AppShortcut, JsonValue } from '../types';
import { generateAIResponse } from '../services/aiService';
import { mcpService } from '../src/services/mcpService';
import { AITab } from './AISettingsModal/AITab';
import { AppearanceTab } from './AISettingsModal/AppearanceTab';
import { BackupPasswordDialog } from './AISettingsModal/BackupPasswordDialog';
import { ContextTab } from './AISettingsModal/ContextTab';
import { KeyboardTab } from './AISettingsModal/KeyboardTab';
import { McpTab } from './AISettingsModal/McpTab';
import { PromptsTab } from './AISettingsModal/PromptsTab';
import { SecurityTab } from './AISettingsModal/SecurityTab';
import { translations, type Language } from '../utils/translations';

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
      const mockToolCallback = async (name: string, args: Record<string, JsonValue>) => {
        setTestLog(prev => [...prev, `\n✅ Tool '${name}' triggered!`, `📦 Arguments:\n${JSON.stringify(args, null, 2)}`]);
        return { success: true, message: "Test execution simulated." } as JsonValue;
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

  const handlePasswordDialogCancel = () => {
    setShowPasswordDialog(false);
    setSelectedBackupFile(null);
  };

  const handlePasswordDialogDismiss = () => {
    setShowPasswordDialog(false);
  };

  const formatLastBackupDate = (timestamp?: number): string => {
    if (!timestamp) return t.backup.neverBackedUp;
    const date = new Date(timestamp);
    return date.toLocaleString(currentUiLang === 'zh' ? 'zh-CN' : 'en-US');
  };

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
            <AITab
              currentUiLang={currentUiLang}
              tempConfig={tempConfig}
              setTempConfig={setTempConfig}
              onSubmit={handleSubmit}
            />
          )}

          {/* Prompts Tab */}
          {activeTab === 'prompts' && (
            <PromptsTab t={t} tempConfig={tempConfig} setTempConfig={setTempConfig} />
          )}

          {/* Keyboard Shortcuts Tab */}
          {activeTab === 'keyboard' && (
            <KeyboardTab
              t={t}
              shortcuts={shortcuts}
              recordingId={recordingId}
              setRecordingId={setRecordingId}
              handleKeyDownRecord={handleKeyDownRecord}
              onResetShortcuts={onResetShortcuts}
            />
          )}

          {/* MCP / Tools Tab */}
          {activeTab === 'mcp' && (
            <McpTab
              t={t}
              tempConfig={tempConfig}
              setTempConfig={setTempConfig}
              parseError={parseError}
              activeServers={activeServers}
              parsedTools={parsedTools}
              isLoadingMcpTools={isLoadingMcpTools}
              handleInsertTemplate={handleInsertTemplate}
              testTool={testTool}
              setTestTool={setTestTool}
              testPrompt={testPrompt}
              setTestPrompt={setTestPrompt}
              testLog={testLog}
              setTestLog={setTestLog}
              runToolTest={runToolTest}
              isTesting={isTesting}
            />
          )}

          {/* Security / Backup Tab */}
          {activeTab === 'security' && (
            <SecurityTab
              currentUiLang={currentUiLang}
              t={t}
              tempConfig={tempConfig}
              setTempConfig={setTempConfig}
              formatLastBackupDate={formatLastBackupDate}
              handleExportBackup={handleExportBackup}
              handleImportBackup={handleImportBackup}
            />
          )}

          {/* Context Engineering Tab */}
          {activeTab === 'context' && (
            <ContextTab
              currentUiLang={currentUiLang}
              tempConfig={tempConfig}
              updateContextEngine={updateContextEngine}
              showToast={showToast}
            />
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <AppearanceTab
              t={t}
              themes={themes}
              activeThemeId={activeThemeId}
              onSelectTheme={onSelectTheme}
              onDeleteTheme={onDeleteTheme}
              showConfirmDialog={showConfirmDialog}
              fileInputRef={fileInputRef}
              handleFileUpload={handleFileUpload}
            />
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

      <BackupPasswordDialog
        isOpen={showPasswordDialog}
        passwordAction={passwordAction}
        t={t}
        currentUiLang={currentUiLang}
        selectedBackupFile={selectedBackupFile}
        backupPassword={backupPassword}
        setBackupPassword={setBackupPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        isProcessingBackup={isProcessingBackup}
        backupError={backupError}
        onCancel={handlePasswordDialogCancel}
        onDismiss={handlePasswordDialogDismiss}
        onConfirm={handlePasswordConfirm}
      />
    </div>
  );
};
