import React from 'react';

interface EditorStatusBarProps {
  characterCount: number;
}

export function EditorStatusBar({ characterCount }: EditorStatusBarProps) {
  return (
    <div className="absolute bottom-4 right-4 text-xs text-slate-500 font-mono pointer-events-none bg-white/80 dark:bg-cyber-900/80 px-2 py-1 rounded backdrop-blur-sm border border-slate-200 dark:border-white/5 transition-colors">
      {characterCount} chars
    </div>
  );
}
