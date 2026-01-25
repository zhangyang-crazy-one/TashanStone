import React from 'react';
import { AlertTriangle, Download, FolderOpen, Shield, Upload } from 'lucide-react';
import type { AIConfig } from '../../types';

type TranslationDictionary = typeof import('../../utils/translations').translations.en;

interface SecurityTabProps {
  currentUiLang: 'zh' | 'en';
  t: TranslationDictionary;
  tempConfig: AIConfig;
  setTempConfig: React.Dispatch<React.SetStateAction<AIConfig>>;
  formatLastBackupDate: (timestamp?: number) => string;
  handleExportBackup: () => void;
  handleImportBackup: () => void;
}

export const SecurityTab: React.FC<SecurityTabProps> = ({
  currentUiLang,
  t,
  tempConfig,
  setTempConfig,
  formatLastBackupDate,
  handleExportBackup,
  handleImportBackup
}) => (
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
);
