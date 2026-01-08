import React, { useState, useEffect } from 'react';
import { X, Brain, Sparkles, Tag, Lightbulb, CheckCircle, AlertCircle, Edit3, Eye } from 'lucide-react';
import type { MemoryCandidate } from '../types';
import { translations, Language } from '../utils/translations';

interface CompactMemoryPromptProps {
  isOpen: boolean;
  candidate: MemoryCandidate | null;
  language: Language;
  onSave: (editedSummary: string, autoInject: boolean, markImportant: boolean) => Promise<void>;
  onSkip: () => void;
  onClose: () => void;
}

export const CompactMemoryPrompt: React.FC<CompactMemoryPromptProps> = ({
  isOpen,
  candidate,
  language,
  onSave,
  onSkip,
  onClose
}) => {
  const [editedSummary, setEditedSummary] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [autoInject, setAutoInject] = useState(true);
  const [markImportant, setMarkImportant] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const t = translations[language].compactMemory;

  useEffect(() => {
    if (candidate) {
      setEditedSummary(candidate.summary);
      setIsEditing(false);
      setAutoInject(true);
      setMarkImportant(candidate.score >= 4);
    }
  }, [candidate]);

  if (!isOpen || !candidate) return null;

  const isHighValue = candidate.score >= 3;
  const headerGradient = isHighValue
    ? 'from-orange-500 to-amber-500'
    : 'from-violet-500 to-purple-500';

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editedSummary, autoInject, markImportant);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    onSkip();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-white dark:bg-cyber-800 rounded-xl shadow-2xl m-4 flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header with Gradient */}
        <div className={`flex items-center justify-between px-4 py-3 bg-gradient-to-r ${headerGradient} rounded-t-xl`}>
          <div className="flex items-center gap-2">
            <Brain size={20} className="text-white" />
            <div>
              <h2 className="text-white font-semibold text-sm">{t.title}</h2>
              <p className="text-white/80 text-xs">
                {isHighValue ? t.subtitle : t.lowValueSubtitle}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Quality Badge */}
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              isHighValue 
                ? 'bg-white/20 text-white' 
                : 'bg-white/20 text-white/90'
            }`}>
              {isHighValue ? <Sparkles size={12} /> : <AlertCircle size={12} />}
              {isHighValue ? t.highValue : t.lowValue}
            </span>
            
            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="px-4 py-2 bg-paper-100/50 dark:bg-cyber-900/50 border-b border-paper-200 dark:border-cyber-700 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            {t.messageCount.replace('{count}', String(candidate.messageCount))}
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            {t.qualityScore}: <span className={isHighValue ? 'text-orange-500' : 'text-violet-500'}>{candidate.score}/6</span>
          </span>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          
          {/* Topics */}
          {candidate.topics.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Tag size={14} className="text-violet-500" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.topics}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {candidate.topics.map((topic, index) => (
                  <span 
                    key={index}
                    className="text-xs px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-full"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Decisions */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle size={14} className="text-emerald-500" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.decisions}</span>
            </div>
            {candidate.decisions.length > 0 ? (
              <ul className="space-y-1">
                {candidate.decisions.slice(0, 3).map((decision, index) => (
                  <li key={index} className="text-xs text-slate-600 dark:text-slate-400 pl-3 border-l-2 border-emerald-300 dark:border-emerald-700">
                    {decision}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400 italic">{t.noDecisions}</p>
            )}
          </div>

          {/* Key Findings */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb size={14} className="text-amber-500" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.keyFindings}</span>
            </div>
            {candidate.keyFindings.length > 0 ? (
              <ul className="space-y-1">
                {candidate.keyFindings.slice(0, 3).map((finding, index) => (
                  <li key={index} className="text-xs text-slate-600 dark:text-slate-400 pl-3 border-l-2 border-amber-300 dark:border-amber-700">
                    {finding}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400 italic">{t.noFindings}</p>
            )}
          </div>

          {/* Summary - Editable */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Brain size={14} className="text-blue-500" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.summary}</span>
              </div>
              <div className="flex items-center gap-1 bg-paper-200/50 dark:bg-cyber-700 rounded-lg p-0.5">
                <button
                  onClick={() => setIsEditing(false)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
                    !isEditing 
                      ? 'bg-white dark:bg-cyber-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <Eye size={10} />
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
                    isEditing 
                      ? 'bg-white dark:bg-cyber-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <Edit3 size={10} />
                </button>
              </div>
            </div>
            {isEditing ? (
              <textarea
                value={editedSummary}
                onChange={(e) => setEditedSummary(e.target.value)}
                placeholder={t.editSummary}
                className="w-full min-h-[100px] p-3 text-xs bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded-lg focus:outline-none focus:border-blue-500 resize-none text-slate-700 dark:text-slate-300"
              />
            ) : (
              <div className="p-3 bg-paper-100 dark:bg-cyber-900 rounded-lg text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-[120px] overflow-y-auto">
                {editedSummary}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="space-y-2 pt-2 border-t border-paper-200 dark:border-cyber-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoInject}
                onChange={(e) => setAutoInject(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-cyber-600 text-violet-500 focus:ring-violet-500"
              />
              <span className="text-xs text-slate-600 dark:text-slate-400">{t.autoInject}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={markImportant}
                onChange={(e) => setMarkImportant(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-cyber-600 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-xs text-slate-600 dark:text-slate-400">{t.markImportant}</span>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-paper-200 dark:border-cyber-700 bg-paper-50/50 dark:bg-cyber-900/50 rounded-b-xl">
          <button
            onClick={handleSkip}
            disabled={isSaving}
            className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            {t.skipAndCompact}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs text-white rounded-lg transition-colors disabled:opacity-50 ${
              isHighValue 
                ? 'bg-orange-500 hover:bg-orange-600' 
                : 'bg-violet-500 hover:bg-violet-600'
            }`}
          >
            {isSaving ? (
              <>
                <div className="w-3 h-3 border border-white/50 border-t-white rounded-full animate-spin" />
                {t.saving}
              </>
            ) : (
              <>
                <Brain size={14} />
                {t.saveMemory}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompactMemoryPrompt;
