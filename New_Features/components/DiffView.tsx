import React, { useState, useEffect } from 'react';
import * as Diff from 'diff';
import { translations, Language } from '../utils/translations';
import { X, Check, Columns, FileDiff, ArrowRight, Save, Undo, ArrowLeft } from 'lucide-react';

interface DiffViewProps {
  originalContent: string;
  modifiedContent: string;
  originalName: string;
  modifiedName: string;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
  language?: Language;
  isEditable?: boolean;
  onUpdateModified?: (value: string) => void;
  onUpdateOriginal?: (value: string) => void;
}

export const DiffView: React.FC<DiffViewProps> = ({
  originalContent,
  modifiedContent,
  originalName,
  modifiedName,
  onAccept,
  onReject,
  onClose,
  language = 'en',
  isEditable = false,
  onUpdateModified,
  onUpdateOriginal
}) => {
  const [mode, setMode] = useState<'unified' | 'split'>('split');
  const [diffParts, setDiffParts] = useState<Diff.Change[]>([]);
  const t = translations[language];

  // --- Editable State ---
  // When editing, we track the raw text content of both sides
  const [liveOriginal, setLiveOriginal] = useState(originalContent);
  const [liveModified, setLiveModified] = useState(modifiedContent);

  useEffect(() => {
    // Update internal state if props change (e.g. initial load or external update)
    setLiveOriginal(originalContent);
    setLiveModified(modifiedContent);
  }, [originalContent, modifiedContent]);

  useEffect(() => {
    // Calculate Diff
    // For large files, this should ideally be in a worker, but for notes it's fine.
    // We use diffLines for better readability in code/markdown
    const diff = Diff.diffLines(liveOriginal, liveModified);
    setDiffParts(diff);
  }, [liveOriginal, liveModified]);

  const handleOriginalChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setLiveOriginal(val);
      onUpdateOriginal?.(val);
  };

  const handleModifiedChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setLiveModified(val);
      onUpdateModified?.(val);
  };

  const handleMergeToModified = (part: Diff.Change) => {
      // Logic to copy original content into modified (reverting a deletion or accepting an original part)
      // This is complex with simple textareas. For now, simple manual edit is better.
      // We'll leave this for future enhancement or simple full overwrite.
  };

  const renderUnified = () => {
    return (
      <div className="flex-1 overflow-auto bg-white dark:bg-cyber-900 p-4 font-mono text-sm leading-6">
        {diffParts.map((part, index) => {
          let bgClass = '';
          let textClass = 'text-slate-700 dark:text-slate-300';
          let prefix = '  ';

          if (part.added) {
            bgClass = 'bg-green-100 dark:bg-green-900/30';
            textClass = 'text-green-800 dark:text-green-300';
            prefix = '+ ';
          } else if (part.removed) {
            bgClass = 'bg-red-100 dark:bg-red-900/30';
            textClass = 'text-red-800 dark:text-red-300 line-through opacity-70';
            prefix = '- ';
          } else {
             textClass = 'text-slate-500 dark:text-slate-500 opacity-80';
          }

          return (
            <div key={index} className={`${bgClass} whitespace-pre-wrap break-all ${textClass}`}>
              <span className="select-none opacity-50 mr-2">{prefix}</span>
              {part.value}
            </div>
          );
        })}
      </div>
    );
  };

  const renderSplit = () => {
    if (isEditable) {
        return (
            <div className="flex-1 flex overflow-hidden">
                {/* Original Pane */}
                <div className="flex-1 flex flex-col border-r border-paper-200 dark:border-cyber-700">
                    <div className="bg-paper-50 dark:bg-cyber-800 p-2 text-xs font-bold text-slate-500 text-center uppercase tracking-wider flex justify-between items-center px-4">
                        <span>{originalName}</span>
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 rounded">Read-Only / Ref</span>
                    </div>
                    <textarea 
                        className="flex-1 p-4 bg-paper-50 dark:bg-cyber-900/50 resize-none outline-none font-mono text-sm leading-6 text-slate-600 dark:text-slate-400"
                        value={liveOriginal}
                        onChange={handleOriginalChange}
                        spellCheck={false}
                    />
                </div>

                {/* Modified Pane */}
                <div className="flex-1 flex flex-col">
                    <div className="bg-paper-50 dark:bg-cyber-800 p-2 text-xs font-bold text-slate-500 text-center uppercase tracking-wider flex justify-between items-center px-4">
                        <span>{modifiedName}</span>
                        <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-1.5 rounded">Editable</span>
                    </div>
                    <textarea 
                        className="flex-1 p-4 bg-white dark:bg-cyber-900 resize-none outline-none font-mono text-sm leading-6 text-slate-800 dark:text-slate-200"
                        value={liveModified}
                        onChange={handleModifiedChange}
                        spellCheck={false}
                    />
                </div>
            </div>
        );
    }

    // Read-only Split View with diff coloring
    return (
      <div className="flex-1 flex overflow-hidden font-mono text-sm leading-6">
        {/* Left: Original (Deletions highlighted) */}
        <div className="flex-1 overflow-auto border-r border-paper-200 dark:border-cyber-700 bg-paper-50/50 dark:bg-cyber-900/50 p-4 custom-scrollbar">
           {diffParts.map((part, index) => {
               if (part.added) return null; // Don't show additions on original side
               
               const style = part.removed 
                 ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' 
                 : 'text-slate-500 dark:text-slate-500';
               
               return (
                   <span key={index} className={`${style} whitespace-pre-wrap`}>
                       {part.value}
                   </span>
               );
           })}
        </div>

        {/* Right: Modified (Additions highlighted) */}
        <div className="flex-1 overflow-auto bg-white dark:bg-cyber-900 p-4 custom-scrollbar">
           {diffParts.map((part, index) => {
               if (part.removed) return null; // Don't show removals on modified side
               
               const style = part.added 
                 ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' 
                 : 'text-slate-800 dark:text-slate-300';
               
               return (
                   <span key={index} className={`${style} whitespace-pre-wrap`}>
                       {part.value}
                   </span>
               );
           })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-paper-50 dark:bg-cyber-900 relative z-40">
      {/* Header */}
      <div className="h-14 border-b border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-800 flex items-center justify-between px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-bold text-lg">
                <FileDiff className="text-amber-500" />
                {t.diffView}
            </div>
            
            {!isEditable && (
                <div className="flex bg-paper-100 dark:bg-cyber-900 rounded-lg p-1 border border-paper-200 dark:border-cyber-600">
                    <button 
                        onClick={() => setMode('split')}
                        className={`p-1.5 rounded flex items-center gap-2 text-xs font-bold transition-colors ${mode === 'split' ? 'bg-white dark:bg-cyber-700 shadow text-cyan-600 dark:text-cyan-400' : 'text-slate-500'}`}
                    >
                        <Columns size={14} /> {t.splitDiff}
                    </button>
                    <button 
                        onClick={() => setMode('unified')}
                        className={`p-1.5 rounded flex items-center gap-2 text-xs font-bold transition-colors ${mode === 'unified' ? 'bg-white dark:bg-cyber-700 shadow text-cyan-600 dark:text-cyan-400' : 'text-slate-500'}`}
                    >
                        <ArrowRight size={14} /> {t.unifiedDiff}
                    </button>
                </div>
            )}
            
            {isEditable && (
                <span className="text-xs text-slate-400 border border-amber-500/30 bg-amber-50 dark:bg-amber-900/10 px-2 py-1 rounded text-amber-600 dark:text-amber-400 font-bold animate-pulse">
                    Editing Mode Active
                </span>
            )}
        </div>

        <div className="flex items-center gap-3">
            <button 
                onClick={onReject}
                className="px-4 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-bold text-sm flex items-center gap-2 transition-all"
            >
                <X size={16} /> {t.rejectChanges}
            </button>
            <button 
                onClick={onAccept}
                className="px-6 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all transform hover:scale-105"
            >
                <Check size={16} /> {t.acceptChanges}
            </button>
        </div>
      </div>

      {/* Diff Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
          {mode === 'unified' ? renderUnified() : renderSplit()}
      </div>
      
      {/* Legend Footer */}
      <div className="h-8 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800 flex items-center px-6 gap-6 text-[10px] text-slate-500 uppercase font-bold tracking-wider shrink-0">
          <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-red-100 dark:bg-red-900/50 border border-red-300 rounded"></span> Removed / Original
          </div>
          <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-green-100 dark:bg-green-900/50 border border-green-300 rounded"></span> Added / Modified
          </div>
          {isEditable && (
              <div className="ml-auto text-cyan-600 dark:text-cyan-400">
                  Tip: You can edit the right pane directly before accepting.
              </div>
          )}
      </div>
    </div>
  );
};
