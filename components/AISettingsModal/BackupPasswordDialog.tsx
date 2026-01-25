import React from 'react';
import { AlertTriangle, Eye, EyeOff, Shield } from 'lucide-react';

type TranslationDictionary = typeof import('../../utils/translations').translations.en;

interface BackupPasswordDialogProps {
  isOpen: boolean;
  passwordAction: 'export' | 'import' | null;
  t: TranslationDictionary;
  currentUiLang: 'zh' | 'en';
  selectedBackupFile: { filePath: string; fileName: string; fileSize: number } | null;
  backupPassword: string;
  setBackupPassword: React.Dispatch<React.SetStateAction<string>>;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  isProcessingBackup: boolean;
  backupError: string | null;
  onCancel: () => void;
  onDismiss: () => void;
  onConfirm: () => void;
}

export const BackupPasswordDialog: React.FC<BackupPasswordDialogProps> = ({
  isOpen,
  passwordAction,
  t,
  currentUiLang,
  selectedBackupFile,
  backupPassword,
  setBackupPassword,
  showPassword,
  setShowPassword,
  isProcessingBackup,
  backupError,
  onCancel,
  onDismiss,
  onConfirm
}) => {
  if (!isOpen) return null;

  return (
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
                if (e.key === 'Enter' && !isProcessingBackup) onConfirm();
                if (e.key === 'Escape') onDismiss();
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
            onClick={onCancel}
            disabled={isProcessingBackup}
            className="px-4 py-2 rounded-lg text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-element))] disabled:opacity-50 transition-colors font-[var(--font-primary)]"
          >
            {t.cancel}
          </button>
          <button
            onClick={onConfirm}
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
  );
};
