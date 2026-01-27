import React from 'react';
import { FolderOpen, Code2, List } from 'lucide-react';

import type { SidebarTab } from './sidebarTypes';

interface SidebarTabsProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  t: {
    explorer: string;
    snippets?: string;
  };
}

export const SidebarTabs: React.FC<SidebarTabsProps> = ({ activeTab, onTabChange, t }) => {
  return (
    <div className="h-14 flex items-center px-2 border-b border-paper-200 dark:border-cyber-700 shrink-0 gap-1 pt-2">
      <button
        onClick={() => onTabChange('files')}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-t-lg text-xs font-medium transition-colors border-b-2 cursor-pointer ${activeTab === 'files' ? 'border-cyan-500 text-cyan-700 dark:text-cyan-400 bg-white/50 dark:bg-cyber-900/50' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
      >
        <FolderOpen size={14} /> {t.explorer}
      </button>
      <button
        onClick={() => onTabChange('snippets')}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-t-lg text-xs font-medium transition-colors border-b-2 cursor-pointer ${activeTab === 'snippets' ? 'border-amber-500 text-amber-700 dark:text-amber-400 bg-white/50 dark:bg-cyber-900/50' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
      >
        <Code2 size={14} /> {t.snippets}
      </button>
      <button
        onClick={() => onTabChange('outline')}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-t-lg text-xs font-medium transition-colors border-b-2 cursor-pointer ${activeTab === 'outline' ? 'border-violet-500 text-violet-700 dark:text-violet-400 bg-white/50 dark:bg-cyber-900/50' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
      >
        <List size={14} /> Outline
      </button>
    </div>
  );
};
