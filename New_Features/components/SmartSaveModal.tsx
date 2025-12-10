import React, { useState, useEffect } from 'react';
import { Tag, Sparkles, X, Plus, Save, Loader2 } from 'lucide-react';
import { translations, Language } from '../utils/translations';

interface SmartSaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tags: string[]) => void;
  initialTags: string[];
  isAnalyzing: boolean;
  language?: Language;
}

export const SmartSaveModal: React.FC<SmartSaveModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialTags,
  isAnalyzing,
  language = 'en'
}) => {
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const t = translations[language];

  useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  const handleAddTag = () => {
    if (newTagInput.trim() && !tags.includes(newTagInput.trim())) {
      setTags([...tags, newTagInput.trim()]);
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-md bg-white dark:bg-cyber-900 rounded-xl shadow-2xl border border-paper-200 dark:border-cyber-700 overflow-hidden flex flex-col animate-scaleIn">
        
        {/* Header */}
        <div className="p-4 border-b border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 font-bold text-lg">
            <Sparkles className="animate-pulse" size={20} />
            {t.smartSaveTitle}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500 gap-3">
              <Loader2 size={32} className="animate-spin text-cyan-500" />
              <p>{t.analyzingTags}</p>
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Tag size={12} /> {t.suggestedTags}
                </h3>
                <div className="flex flex-wrap gap-2 min-h-[3rem]">
                  {tags.map(tag => (
                    <div key={tag} className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 rounded-full text-sm group">
                      <span>{tag}</span>
                      <button 
                        onClick={() => handleRemoveTag(tag)}
                        className="text-cyan-400 hover:text-red-500 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {tags.length === 0 && (
                    <p className="text-sm text-slate-400 italic">No tags suggested.</p>
                  )}
                </div>
              </div>

              <div className="relative">
                <input 
                  type="text" 
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.addTag}
                  className="w-full pl-3 pr-10 py-2 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <button 
                  onClick={handleAddTag}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-cyan-600 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-paper-200 dark:hover:bg-cyber-700 rounded-lg text-sm font-medium transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={() => onConfirm(tags)}
            disabled={isAnalyzing}
            className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-600 hover:to-violet-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={16} /> {t.confirmSave}
          </button>
        </div>

      </div>
    </div>
  );
};