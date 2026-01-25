import React from 'react';
import { Check, Trash2, Upload } from 'lucide-react';
import type { AppTheme } from '../../types';
import Tooltip from '../Tooltip';

type TranslationDictionary = typeof import('../../utils/translations').translations.en;

interface AppearanceTabProps {
  t: TranslationDictionary;
  themes: AppTheme[];
  activeThemeId: string;
  onSelectTheme: (themeId: string) => void;
  onDeleteTheme: (themeId: string) => void;
  showConfirmDialog?: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: 'danger' | 'warning' | 'info',
    confirmText?: string,
    cancelText?: string
  ) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const AppearanceTab: React.FC<AppearanceTabProps> = ({
  t,
  themes,
  activeThemeId,
  onSelectTheme,
  onDeleteTheme,
  showConfirmDialog,
  fileInputRef,
  handleFileUpload
}) => (
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
              <Tooltip content={t.deleteTheme}>
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
                  aria-label={t.deleteTheme}
                >
                  <Trash2 size={16} />
                </button>
              </Tooltip>
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);
