
import React, { forwardRef } from 'react';

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const Editor = forwardRef<HTMLTextAreaElement, EditorProps>(({ content, onChange, onUndo, onRedo }, ref) => {
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Check for Ctrl/Cmd
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo?.();
        } else {
          onUndo?.();
        }
      } else if (e.key === 'y') {
        e.preventDefault();
        onRedo?.();
      }
    }
  };

  return (
    <div className="h-full w-full bg-paper-100 dark:bg-cyber-800 relative group transition-colors duration-300">
      <textarea
        ref={ref}
        className="w-full h-full p-8 bg-transparent text-slate-800 dark:text-slate-300 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-0 custom-scrollbar selection:bg-cyan-200 dark:selection:bg-cyber-500/30 placeholder-slate-400 dark:placeholder-slate-600"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type some cool markdown here..."
        spellCheck={false}
      />
      <div className="absolute bottom-4 right-4 text-xs text-slate-500 font-mono pointer-events-none bg-white/80 dark:bg-cyber-900/80 px-2 py-1 rounded backdrop-blur-sm border border-slate-200 dark:border-white/5 transition-colors">
        {content.length} chars
      </div>
    </div>
  );
});

Editor.displayName = 'Editor';
