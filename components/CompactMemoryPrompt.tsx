import React, { useState, useEffect } from 'react';
import { X, Brain, Sparkles, Tag, Lightbulb, CheckCircle, Edit3, Eye, MessageSquare, Activity, ChevronRight } from 'lucide-react';
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

  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !candidate) return null;

  const isHighValue = candidate.score >= 3;

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
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-cyber-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col animate-slideDown ring-1 ring-slate-900/5 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-paper-200 dark:border-cyber-700 bg-white/50 dark:bg-cyber-800/50 backdrop-blur-xl">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 dark:from-violet-900/40 dark:to-fuchsia-900/40 shadow-inner">
              <Brain size={24} className="text-violet-600 dark:text-violet-400 drop-shadow-sm" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 tracking-tight">{t.title}</h2>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                  isHighValue
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                    : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                }`}>
                  {isHighValue ? <Sparkles size={10} /> : <Activity size={10} />}
                  {isHighValue ? t.highValue : t.lowValue}
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug max-w-sm">
                {isHighValue ? t.subtitle : t.lowValueSubtitle}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="group p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all duration-200"
          >
            <X size={20} className="text-slate-400 group-hover:text-red-500 transition-colors" />
          </button>
        </div>

        {/* Stats Bar */}
        <div className="px-6 py-3 bg-slate-50/80 dark:bg-cyber-900/30 border-b border-paper-200 dark:border-cyber-700 flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <MessageSquare size={14} className="text-slate-400" />
            <span>{t.messageCount.replace('{count}', String(candidate.messageCount))}</span>
          </div>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <Activity size={14} className={
              candidate.score >= 4 ? 'text-emerald-500' : candidate.score >= 2 ? 'text-amber-500' : 'text-slate-400'
            } />
            <span>
              {t.qualityScore}: <span className={`font-bold ${
                candidate.score >= 4 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'
              }`}>{candidate.score}/6</span>
            </span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
          
          {/* Topics */}
          {candidate.topics.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Tag size={14} className="text-violet-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t.topics}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {candidate.topics.map((topic, index) => (
                  <span
                    key={index}
                    className="text-xs px-3 py-1.5 bg-white dark:bg-cyber-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg shadow-sm hover:border-violet-300 dark:hover:border-violet-600 hover:text-violet-600 dark:hover:text-violet-400 hover:shadow-md transition-all duration-200 cursor-default select-none flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Decisions */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={14} className="text-emerald-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t.decisions}</span>
            </div>
            {candidate.decisions.length > 0 ? (
              <ul className="space-y-2">
                {candidate.decisions.slice(0, 3).map((decision, index) => (
                  <li key={index} className="group flex items-start gap-3 p-3 rounded-xl bg-slate-50/50 dark:bg-cyber-900/20 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 border border-transparent hover:border-emerald-100 dark:hover:border-emerald-800 transition-all duration-200">
                    <CheckCircle size={16} className="mt-0.5 text-emerald-500/70 group-hover:text-emerald-500 transition-colors shrink-0" />
                    <span className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed group-hover:text-slate-900 dark:group-hover:text-slate-100">
                      {decision}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400 italic bg-slate-50 dark:bg-cyber-900/30 rounded-lg">
                <span>{t.noDecisions}</span>
              </div>
            )}
          </div>

          {/* Key Findings */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={14} className="text-amber-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t.keyFindings}</span>
            </div>
            {candidate.keyFindings.length > 0 ? (
              <ul className="space-y-2">
                {candidate.keyFindings.slice(0, 3).map((finding, index) => (
                  <li key={index} className="group flex items-start gap-3 p-3 rounded-xl bg-slate-50/50 dark:bg-cyber-900/20 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 border border-transparent hover:border-amber-100 dark:hover:border-amber-800 transition-all duration-200">
                    <Lightbulb size={16} className="mt-0.5 text-amber-500/70 group-hover:text-amber-500 transition-colors shrink-0" />
                    <span className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed group-hover:text-slate-900 dark:group-hover:text-slate-100">
                      {finding}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400 italic bg-slate-50 dark:bg-cyber-900/30 rounded-lg">
                <span>{t.noFindings}</span>
              </div>
            )}
          </div>

          {/* Summary - Editable */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain size={15} className="text-violet-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t.summary}</span>
              </div>
              <div className="flex rounded-lg border border-paper-200 dark:border-cyber-700 overflow-hidden">
                <button
                  onClick={() => setIsEditing(false)}
                  className={`px-4 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    !isEditing
                      ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                      : 'bg-white dark:bg-cyber-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-cyber-700'
                  }`}
                >
                  <Eye size={12} />
                  <span>View</span>
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className={`px-4 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 border-l border-paper-200 dark:border-cyber-700 ${
                    isEditing
                      ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                      : 'bg-white dark:bg-cyber-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-cyber-700'
                  }`}
                >
                  <Edit3 size={12} />
                  <span>Edit</span>
                </button>
              </div>
            </div>
            {isEditing ? (
              <textarea
                value={editedSummary}
                onChange={(e) => setEditedSummary(e.target.value)}
                placeholder={t.editSummary}
                className="w-full min-h-[120px] p-4 text-sm leading-relaxed bg-white dark:bg-cyber-900 border border-slate-200 dark:border-cyber-600 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all resize-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400 shadow-inner"
              />
            ) : (
              <div className="p-4 bg-slate-50 dark:bg-cyber-900/30 rounded-xl border border-slate-100 dark:border-cyber-700 text-sm leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap max-h-[160px] overflow-y-auto custom-scrollbar">
                {editedSummary}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="space-y-2 pt-3 border-t border-paper-200 dark:border-cyber-700/50">
            <label className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors group">
              <input
                type="checkbox"
                checked={autoInject}
                onChange={(e) => setAutoInject(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 dark:border-cyber-600 text-violet-600 dark:text-violet-500 focus:ring-violet-500 accent-violet-600"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">{t.autoInject}</span>
            </label>
            <label className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors group">
              <input
                type="checkbox"
                checked={markImportant}
                onChange={(e) => setMarkImportant(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 dark:border-cyber-600 text-amber-500 focus:ring-amber-500 accent-amber-500"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">{t.markImportant}</span>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-5 border-t border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-800 rounded-b-xl">
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <button
              onClick={handleSkip}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-cyber-700 transition-all font-medium text-sm border border-transparent hover:border-slate-200 dark:hover:border-cyber-600"
            >
              {t.skipAndCompact}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="group relative overflow-hidden px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all duration-200 font-medium text-sm flex items-center gap-2 transform active:scale-95"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  <span>{t.saving}</span>
                </>
              ) : (
                <>
                  <Brain size={16} className="group-hover:scale-110 transition-transform" />
                  <span>{t.saveMemory}</span>
                  <ChevronRight size={14} className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompactMemoryPrompt;
