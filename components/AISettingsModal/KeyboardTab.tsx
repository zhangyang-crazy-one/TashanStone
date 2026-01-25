import React from 'react';
import { Command } from 'lucide-react';
import type { AppShortcut } from '../../types';

type TranslationDictionary = typeof import('../../utils/translations').translations.en;

interface KeyboardTabProps {
  t: TranslationDictionary;
  shortcuts: AppShortcut[];
  recordingId: string | null;
  setRecordingId: React.Dispatch<React.SetStateAction<string | null>>;
  handleKeyDownRecord: (event: React.KeyboardEvent, shortcutId: string) => void;
  onResetShortcuts?: () => void;
}

export const KeyboardTab: React.FC<KeyboardTabProps> = ({
  t,
  shortcuts,
  recordingId,
  setRecordingId,
  handleKeyDownRecord,
  onResetShortcuts
}) => (
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
);
