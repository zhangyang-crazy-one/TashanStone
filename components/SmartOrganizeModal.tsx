import React, { useState } from 'react';
import { X, Sparkles, BarChart2, Tag, FolderTree, Link2, Check, ChevronRight, Star, Lightbulb, FileText, Loader2 } from 'lucide-react';
import { MarkdownFile, AIConfig } from '../types';
import { extractTags } from '../src/types/wiki';
import { analyzeDocument, suggestTagsByAI, OrganizeAnalysisResult } from '../src/services/organize/organizeService';
import { translations } from '../utils/translations';
import { Language } from '../utils/translations';

interface SmartOrganizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: MarkdownFile;
  aiConfig: AIConfig;
  onUpdateFile: (fileId: string, updates: Partial<MarkdownFile>) => void;
  onApplySuggestions: (fileId: string, suggestions: OrganizeSuggestions) => void;
  allFiles?: MarkdownFile[];
  language?: Language;
}

interface OrganizeSuggestions {
  importance: number;
  keyConcepts: string[];
  suggestedTags: string[];
  suggestedFolder: string;
  relatedFiles: string[];
  suggestedTheme?: string;
}

export const SmartOrganizeModal: React.FC<SmartOrganizeModalProps> = ({
  isOpen,
  onClose,
  file,
  aiConfig,
  onUpdateFile,
  onApplySuggestions,
  allFiles = [],
  language = 'en'
}) => {
  const t = translations[language];
  const [activeTab, setActiveTab] = useState<'analyze' | 'tags' | 'classify' | 'links'>('analyze');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<OrganizeSuggestions>({
    importance: file.importance || 5,
    keyConcepts: file.keyConcepts || [],
    suggestedTags: [],
    suggestedFolder: '',
    relatedFiles: []
  });
  const [applied, setApplied] = useState(false);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setSuggestions(prev => ({ ...prev, keyConcepts: [] }));

    try {
      const result = await analyzeDocument({
        content: file.content,
        fileName: file.name,
        allFiles: allFiles.filter(f => f.id !== file.id)
      }, aiConfig);

      setSuggestions(prev => ({
        ...prev,
        importance: result.importance,
        keyConcepts: result.keyConcepts,
        suggestedFolder: result.suggestedFolder,
        relatedFiles: result.relatedFiles,
        suggestedTheme: result.suggestedTheme
      }));
    } catch (error) {
      console.error('Analysis failed:', error);
      const tags = extractTags(file.content);
      const importance = Math.min(10, Math.max(1, Math.round((file.content.length / 1000 + file.content.split('\n').length / 50) * 2)));
      setSuggestions(prev => ({
        ...prev,
        importance,
        suggestedTags: tags.slice(0, 5)
      }));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateTags = async () => {
    const existingTags = extractTags(file.content);
    const tags = await suggestTagsByAI(file.content, aiConfig, existingTags);
    setSuggestions(prev => ({
      ...prev,
      suggestedTags: [...new Set([...prev.suggestedTags, ...tags])]
    }));
  };

  const handleApply = () => {
    onApplySuggestions(file.id, suggestions);
    onUpdateFile(file.id, {
      importance: suggestions.importance,
      keyConcepts: suggestions.keyConcepts
    });
    setApplied(true);
  };

  const getRelatedFileNames = () => {
    return suggestions.relatedFiles.map(id => {
      const f = allFiles.find(file => file.id === id);
      return f?.name || id;
    });
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'analyze', label: 'Analyze', icon: BarChart2 },
    { id: 'tags', label: 'Tags', icon: Tag },
    { id: 'classify', label: 'Classify', icon: FolderTree },
    { id: 'links', label: 'Links', icon: Link2 }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white dark:bg-cyber-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-slideDown">
        <div className="flex items-center justify-between px-6 py-4 border-b border-paper-200 dark:border-cyber-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Lightbulb size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Smart Organize</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{file.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-paper-100 dark:hover:bg-cyber-700 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="flex border-b border-paper-200 dark:border-cyber-700">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-2 ${
                activeTab === tab.id
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'analyze' && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="px-6 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
                >
                  {isAnalyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {isAnalyzing ? 'Analyzing...' : 'Analyze Document'}
                </button>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  AI will analyze content and provide insights
                </p>
              </div>

              {isAnalyzing && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Loader2 size={16} className="animate-spin text-amber-500" />
                    <span className="text-sm text-slate-500">Analyzing content structure...</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Loader2 size={16} className="animate-spin text-amber-500" />
                    <span className="text-sm text-slate-500">Extracting key concepts...</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Loader2 size={16} className="animate-spin text-amber-500" />
                    <span className="text-sm text-slate-500">Finding related files...</span>
                  </div>
                </div>
              )}

              {!isAnalyzing && suggestions.keyConcepts.length > 0 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Importance Score
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={suggestions.importance}
                        onChange={(e) => setSuggestions({ ...suggestions, importance: parseInt(e.target.value) })}
                        className="flex-1 accent-amber-500"
                      />
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <button
                            key={n}
                            onClick={() => setSuggestions({ ...suggestions, importance: n })}
                            className={`w-6 h-6 rounded flex items-center justify-center text-xs font-medium transition-colors ${
                              n <= suggestions.importance
                                ? 'bg-amber-500 text-white'
                                : 'bg-paper-200 dark:bg-cyber-700 text-slate-400'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>Low</span>
                      <span>High</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Key Concepts
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.keyConcepts.map((concept, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-sm"
                        >
                          {concept}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tags' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Suggested Tags
                </label>
                <button
                  onClick={handleGenerateTags}
                  className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <Sparkles size={12} /> AI Suggest
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.suggestedTags.length > 0 ? (
                  suggestions.suggestedTags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-sm flex items-center gap-1"
                    >
                      <Tag size={12} />
                      {tag}
                      <button
                        onClick={() => setSuggestions({
                          ...suggestions,
                          suggestedTags: suggestions.suggestedTags.filter((_, idx) => idx !== i)
                        })}
                        className="ml-1 hover:text-red-500"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Click "AI Suggest" to get tag recommendations</p>
                )}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-paper-200 dark:border-cyber-700">
                <span className="text-xs text-slate-400">
                  Existing tags in file:
                </span>
                <div className="flex flex-wrap gap-1">
                  {extractTags(file.content).slice(0, 5).map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 bg-paper-200 dark:bg-cyber-700 rounded text-xs text-slate-500">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'classify' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Suggested Folder
                </label>
                <div className="flex items-center gap-2 p-3 bg-paper-100 dark:bg-cyber-900 rounded-lg">
                  <FolderTree size={16} className="text-slate-400" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {suggestions.suggestedFolder || 'Run analysis to get suggestions'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['Notes', 'Project', 'Research', 'Documentation', 'Journal', 'Archive'].map(folder => (
                  <button
                    key={folder}
                    onClick={() => setSuggestions({ ...suggestions, suggestedFolder: folder })}
                    className={`px-3 py-2 text-xs rounded-lg transition-colors ${
                      suggestions.suggestedFolder === folder
                        ? 'bg-amber-500 text-white'
                        : 'bg-paper-100 dark:bg-cyber-700 text-slate-600 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                    }`}
                  >
                    {folder}
                  </button>
                ))}
              </div>

              {suggestions.suggestedTheme && (
                <div className="pt-4 border-t border-paper-200 dark:border-cyber-700">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Suggested Theme
                  </label>
                  <div className="flex items-center gap-2 p-3 bg-cyan-50 dark:bg-cyber-900/50 rounded-lg">
                    <div className={`w-8 h-8 rounded-lg ${
                      suggestions.suggestedTheme === 'Cyber' ? 'bg-cyber-500' :
                      suggestions.suggestedTheme === 'Paper' ? 'bg-amber-100' :
                      suggestions.suggestedTheme === 'Business' ? 'bg-slate-700' :
                      suggestions.suggestedTheme === 'Light' ? 'bg-blue-400' :
                      'bg-gradient-to-br from-cyber-500 to-purple-500'
                    }`} />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {suggestions.suggestedTheme} Theme
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {['Cyber', 'Paper', 'Business', 'Light', 'Gradient'].map(theme => (
                      <button
                        key={theme}
                        onClick={() => setSuggestions({ ...suggestions, suggestedTheme: theme })}
                        className={`px-3 py-2 text-xs rounded-lg transition-colors ${
                          suggestions.suggestedTheme === theme
                            ? 'bg-cyan-500 text-white'
                            : 'bg-paper-100 dark:bg-cyber-700 text-slate-600 dark:text-slate-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/30'
                        }`}
                      >
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'links' && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Related Files
              </label>
              {suggestions.relatedFiles.length > 0 ? (
                <div className="space-y-2">
                  {getRelatedFileNames().map((name, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 bg-paper-100 dark:bg-cyber-900 rounded-lg"
                    >
                      <FileText size={14} className="text-slate-400" />
                      <span className="text-sm text-slate-700 dark:text-slate-300">{name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <Link2 size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Run analysis to find related files</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900/50 rounded-b-xl flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {applied ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check size={14} /> {t.applySuggestion}
              </span>
            ) : (
              t.reviewAndApply
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={handleApply}
              disabled={applied}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Sparkles size={14} />
              {t.applySuggestion}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartOrganizeModal;
