
import React, { useState, useEffect } from 'react';
import { MarkdownFile, AIConfig } from '../types';
import { Sparkles, Tag, FolderInput, Link2, Star, Check, X, Loader2, ArrowRight, AlertTriangle, Settings } from 'lucide-react';
import { suggestTags, suggestCategory, assessImportance } from '../services/aiService';
import { translations, Language } from '../utils/translations';

interface SmartOrganizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: MarkdownFile;
  allFiles: MarkdownFile[];
  aiConfig: AIConfig;
  onApplyTags: (tags: string[]) => void;
  onMoveFile: (path: string) => void;
  onInsertLink: (targetFile: string) => void;
  onUpdateMetadata: (importance: number, keyConcepts: string[]) => void;
  findRelatedFiles: (fileId: string) => string[];
  onOpenSettings?: () => void;
}

export const SmartOrganizeModal: React.FC<SmartOrganizeModalProps> = ({
  isOpen,
  onClose,
  file,
  allFiles,
  aiConfig,
  onApplyTags,
  onMoveFile,
  onInsertLink,
  onUpdateMetadata,
  findRelatedFiles,
  onOpenSettings
}) => {
  const [activeTab, setActiveTab] = useState<'analysis' | 'tags' | 'category' | 'links'>('analysis');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Analysis State
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [suggestedPath, setSuggestedPath] = useState<string>('');
  const [relatedFileIds, setRelatedFileIds] = useState<string[]>([]);
  const [importanceScore, setImportanceScore] = useState<number>(0);
  const [keyConcepts, setKeyConcepts] = useState<string[]>([]);

  const t = translations[aiConfig.language as Language || 'en'];

  useEffect(() => {
    if (isOpen && file) {
      runAnalysis();
    }
  }, [isOpen, file.id]);

  const runAnalysis = async () => {
    setError(null);

    if (aiConfig.provider === 'gemini' && !aiConfig.apiKey) {
        setError("API Key is required for Gemini models. Please configure it in Settings.");
        return;
    }

    setIsAnalyzing(true);
    try {
      const [tags, path, assessment] = await Promise.all([
        suggestTags(file.content, aiConfig),
        suggestCategory(file.content, aiConfig),
        assessImportance(file.content, aiConfig)
      ]);

      setSuggestedTags(tags);
      setSuggestedPath(path);
      setImportanceScore(assessment.score);
      setKeyConcepts(assessment.keyConcepts);
      
      const related = findRelatedFiles(file.id);
      setRelatedFileIds(related);

    } catch (e: any) {
      console.error("Smart Analysis Failed", e);
      setError(e.message || "Failed to analyze content. Please check your AI settings and connection.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyTags = () => {
    onApplyTags(suggestedTags);
    setSuggestedTags([]); // Clear to indicate done
  };

  const handleApplyMove = () => {
    onMoveFile(suggestedPath);
  };

  const handleApplyAssessment = () => {
    onUpdateMetadata(importanceScore, keyConcepts);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-cyber-900 rounded-xl shadow-2xl border border-paper-200 dark:border-cyber-700 overflow-hidden flex flex-col max-h-[85vh] animate-scaleIn">
        
        {/* Header */}
        <div className="p-4 border-b border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 font-bold text-lg">
            <Sparkles className="animate-pulse" />
            {t.smartOrganize}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          
          {/* Sidebar Tabs */}
          <div className="w-48 bg-paper-50 dark:bg-cyber-800 border-r border-paper-200 dark:border-cyber-700 p-2 flex flex-col gap-1">
            <button 
              onClick={() => setActiveTab('analysis')}
              className={`p-2 rounded-lg text-sm font-medium text-left flex items-center gap-2 ${activeTab === 'analysis' ? 'bg-white dark:bg-cyber-700 text-cyan-600 dark:text-cyan-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-paper-100 dark:hover:bg-cyber-700/50'}`}
            >
              <Star size={16} /> {t.analysis}
            </button>
            <button 
              onClick={() => setActiveTab('tags')}
              className={`p-2 rounded-lg text-sm font-medium text-left flex items-center gap-2 ${activeTab === 'tags' ? 'bg-white dark:bg-cyber-700 text-cyan-600 dark:text-cyan-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-paper-100 dark:hover:bg-cyber-700/50'}`}
            >
              <Tag size={16} /> {t.autoTag}
            </button>
            <button 
              onClick={() => setActiveTab('category')}
              className={`p-2 rounded-lg text-sm font-medium text-left flex items-center gap-2 ${activeTab === 'category' ? 'bg-white dark:bg-cyber-700 text-cyan-600 dark:text-cyan-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-paper-100 dark:hover:bg-cyber-700/50'}`}
            >
              <FolderInput size={16} /> {t.categorize}
            </button>
            <button 
              onClick={() => setActiveTab('links')}
              className={`p-2 rounded-lg text-sm font-medium text-left flex items-center gap-2 ${activeTab === 'links' ? 'bg-white dark:bg-cyber-700 text-cyan-600 dark:text-cyan-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-paper-100 dark:hover:bg-cyber-700/50'}`}
            >
              <Link2 size={16} /> {t.smartLinks}
            </button>
          </div>

          {/* Tab Panels */}
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-white dark:bg-cyber-900">
            {error ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full text-red-500 mb-4">
                        <AlertTriangle size={32} />
                    </div>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 mb-2">{t.analysisFailed}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xs">
                        {error}
                    </p>
                    <div className="flex gap-3">
                        {onOpenSettings && (
                            <button 
                                onClick={onOpenSettings}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-cyber-800 hover:bg-slate-200 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
                            >
                                <Settings size={16} /> Settings
                            </button>
                        )}
                        <button 
                            onClick={runAnalysis}
                            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-cyan-500/30"
                        >
                            {t.retry}
                        </button>
                    </div>
                </div>
            ) : isAnalyzing ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                <Loader2 size={32} className="animate-spin text-cyan-500" />
                <p>{t.analyzing}</p>
              </div>
            ) : (
              <>
                {activeTab === 'analysis' && (
                  <div className="space-y-6">
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
                      <h3 className="text-sm font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        {t.importanceScore}
                      </h3>
                      <div className="flex items-center gap-4">
                        <div className="text-4xl font-black text-slate-700 dark:text-slate-200">{importanceScore}<span className="text-lg text-slate-400">/10</span></div>
                        <div className="flex-1 h-3 bg-paper-200 dark:bg-cyber-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${importanceScore > 7 ? 'bg-red-500' : importanceScore > 4 ? 'bg-amber-500' : 'bg-green-500'}`}
                            style={{ width: `${importanceScore * 10}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">{t.keyConcepts}</h3>
                      <div className="flex flex-wrap gap-2">
                        {keyConcepts.map(concept => (
                          <div key={concept} className="px-3 py-1 bg-paper-100 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded-lg text-sm text-slate-600 dark:text-slate-300">
                            {concept}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-paper-200 dark:border-cyber-700">
                       <button 
                          onClick={handleApplyAssessment}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 dark:bg-white dark:hover:bg-paper-200 text-white dark:text-slate-900 rounded-lg text-sm font-bold transition-colors w-full"
                       >
                          {t.saveMetadata}
                       </button>
                    </div>
                  </div>
                )}

                {activeTab === 'tags' && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap gap-2">
                      {suggestedTags.length > 0 ? suggestedTags.map(tag => (
                        <div key={tag} className="flex items-center gap-2 px-3 py-1.5 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 rounded-full text-sm">
                          <Tag size={14} /> {tag}
                          <button onClick={() => setSuggestedTags(prev => prev.filter(t => t !== tag))} className="hover:text-red-500"><X size={14}/></button>
                        </div>
                      )) : (
                        <div className="text-sm text-slate-400 italic">No new tags suggested.</div>
                      )}
                    </div>

                    <div className="pt-4">
                       <button 
                          onClick={handleApplyTags}
                          disabled={suggestedTags.length === 0}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-bold transition-colors w-full disabled:opacity-50"
                       >
                          <Check size={16} /> {t.appendTags}
                       </button>
                    </div>
                  </div>
                )}

                {activeTab === 'category' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4">
                        <div className="p-4 bg-paper-100 dark:bg-cyber-800 rounded-lg border border-paper-200 dark:border-cyber-700">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">{t.currentLocation}</span>
                            <div className="font-mono text-sm text-slate-700 dark:text-slate-300 break-all">
                                {file.path || file.name}
                            </div>
                        </div>
                        
                        <div className="flex justify-center">
                            <ArrowRight className="text-slate-300 dark:text-slate-600 transform rotate-90 md:rotate-0" />
                        </div>

                        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-200 dark:border-emerald-800">
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block mb-1">{t.suggestedLocation}</span>
                            <div className="font-mono text-sm text-emerald-800 dark:text-emerald-200 break-all">
                                {suggestedPath ? `${suggestedPath}/${file.name}.md` : 'No change suggested'}
                            </div>
                        </div>
                    </div>

                    <div className="pt-4">
                       <button 
                          onClick={handleApplyMove}
                          disabled={!suggestedPath}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition-colors w-full disabled:opacity-50"
                       >
                          <FolderInput size={16} /> {t.moveFile}
                       </button>
                    </div>
                  </div>
                )}

                {activeTab === 'links' && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        {t.foundRelated} ({relatedFileIds.length})
                    </p>
                    
                    <div className="space-y-2">
                        {relatedFileIds.map(id => {
                            const relatedFile = allFiles.find(f => f.id === id);
                            if (!relatedFile) return null;
                            return (
                                <div key={id} className="flex items-center justify-between p-3 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded-lg group hover:border-violet-400 transition-colors">
                                    <div>
                                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{relatedFile.name}</div>
                                        <div className="text-xs text-slate-400 font-mono">{relatedFile.path}</div>
                                    </div>
                                    <button 
                                        onClick={() => onInsertLink(relatedFile.name)}
                                        className="p-2 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
                                        title={t.insertLink}
                                    >
                                        <Link2 size={16} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
