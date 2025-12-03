
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, FileText, Hash, Calendar, ArrowRight, Loader2, Sparkles, BrainCircuit, X } from 'lucide-react';
import { MarkdownFile, SearchResult, AIConfig } from '../types';
import { performGlobalSearch } from '../services/searchService';
import { generateSummary } from '../services/aiService';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: MarkdownFile[];
  onNavigate: (fileId: string) => void;
  aiConfig: AIConfig;
  semanticSearch: (query: string, config: AIConfig) => Promise<SearchResult[]>;
  relatedFilesProvider: (fileId: string) => string[];
}

export const SearchModal: React.FC<SearchModalProps> = ({ 
  isOpen, onClose, files, onNavigate, aiConfig, semanticSearch, relatedFilesProvider 
}) => {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'instant' | 'semantic'>('instant');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Results State
  const [instantResults, setInstantResults] = useState<SearchResult[]>([]);
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  
  // Preview State
  const [previewSummary, setPreviewSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
       setTimeout(() => inputRef.current?.focus(), 50);
       setQuery('');
       setInstantResults([]);
       setSemanticResults([]);
       setPreviewSummary(null);
    }
  }, [isOpen]);

  // Handle Instant Search
  useEffect(() => {
    if (activeTab === 'instant') {
        if (!query.trim()) {
            setInstantResults([]);
            return;
        }
        const results = performGlobalSearch(files, query);
        setInstantResults(results);
        setSelectedIndex(0);
    }
  }, [query, files, activeTab]);

  // Handle Semantic Search
  const triggerSemanticSearch = async () => {
     if (!query.trim()) return;
     setActiveTab('semantic');
     setIsSearchingAI(true);
     try {
         const results = await semanticSearch(query, aiConfig);
         setSemanticResults(results);
         setSelectedIndex(0);
     } catch (e) {
         console.error(e);
     } finally {
         setIsSearchingAI(false);
     }
  };

  const activeResults = activeTab === 'instant' ? instantResults : semanticResults;
  const selectedFile = activeResults[selectedIndex] ? files.find(f => f.id === activeResults[selectedIndex].fileId) : null;
  const relatedFileIds = selectedFile ? relatedFilesProvider(selectedFile.id) : [];

  // Generate Summary on Selection Change (Debounced)
  useEffect(() => {
      if (!selectedFile) {
          setPreviewSummary(null);
          return;
      }
      
      // If file already has a summary property, use it (optimization)
      if (selectedFile.summary) {
          setPreviewSummary(selectedFile.summary);
          return;
      }

      const timer = setTimeout(async () => {
          setIsGeneratingSummary(true);
          try {
              const summary = await generateSummary(selectedFile.content, aiConfig);
              setPreviewSummary(summary);
              // Cache it
              selectedFile.summary = summary; 
          } catch {
              setPreviewSummary("Failed to generate summary.");
          } finally {
              setIsGeneratingSummary(false);
          }
      }, 800); // 800ms delay to prevent thrashing

      return () => clearTimeout(timer);
  }, [selectedFile?.id]);

  // Keyboard Navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, activeResults.length - 1));
          // Scroll into view
          const el = resultsRef.current?.children[selectedIndex + 1] as HTMLElement;
          el?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          const el = resultsRef.current?.children[selectedIndex - 1] as HTMLElement;
          el?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
          e.preventDefault();
          if (activeResults[selectedIndex]) {
              onNavigate(activeResults[selectedIndex].fileId);
              onClose();
          } else if (activeTab === 'instant' && query) {
              triggerSemanticSearch(); // Enter on empty list triggers AI
          }
      } else if (e.key === 'Escape') {
          onClose();
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4">
        <div className="w-full max-w-4xl bg-white dark:bg-cyber-900 rounded-xl shadow-2xl border border-paper-200 dark:border-cyber-700 overflow-hidden flex flex-col max-h-[80vh] animate-scaleIn">
            {/* Input Header */}
            <div className="p-4 border-b border-paper-200 dark:border-cyber-700 flex items-center gap-3 bg-white dark:bg-cyber-800">
                <Search className="text-slate-400" />
                <input 
                    ref={inputRef}
                    type="text" 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 bg-transparent text-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
                    placeholder="Search files, tags, or ask a question..."
                />
                <div className="flex gap-2 text-xs">
                     <button 
                        onClick={() => setActiveTab('instant')}
                        className={`px-3 py-1 rounded-full transition-colors ${activeTab === 'instant' ? 'bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300' : 'text-slate-500 hover:bg-paper-100 dark:hover:bg-cyber-700'}`}
                     >
                         Instant
                     </button>
                     <button 
                        onClick={triggerSemanticSearch}
                        className={`flex items-center gap-1 px-3 py-1 rounded-full transition-colors ${activeTab === 'semantic' ? 'bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300' : 'text-slate-500 hover:bg-paper-100 dark:hover:bg-cyber-700'}`}
                     >
                         <Sparkles size={12} /> Semantic
                     </button>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>

            {/* Main Content: Split View */}
            <div className="flex-1 flex overflow-hidden h-[600px]">
                {/* Results List */}
                <div className="w-1/2 border-r border-paper-200 dark:border-cyber-700 overflow-y-auto custom-scrollbar p-2" ref={resultsRef}>
                    {activeTab === 'semantic' && isSearchingAI && (
                         <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                             <Loader2 size={32} className="animate-spin mb-2 text-violet-500" />
                             <p>Thinking...</p>
                         </div>
                    )}
                    
                    {activeResults.length === 0 && !isSearchingAI && (
                        <div className="text-center py-10 text-slate-400">
                            <Search size={48} className="mx-auto mb-2 opacity-20" />
                            <p>No results found.</p>
                            {activeTab === 'instant' && query && (
                                <button onClick={triggerSemanticSearch} className="mt-2 text-violet-500 hover:underline text-sm">
                                    Try Semantic Search?
                                </button>
                            )}
                        </div>
                    )}

                    {activeResults.map((result, idx) => (
                        <div 
                            key={result.fileId}
                            onClick={() => { onNavigate(result.fileId); onClose(); }}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            className={`
                                p-3 rounded-lg cursor-pointer transition-all mb-1
                                ${selectedIndex === idx 
                                    ? 'bg-cyan-50 dark:bg-cyan-900/20 border-l-4 border-cyan-500' 
                                    : 'hover:bg-paper-100 dark:hover:bg-cyber-800 border-l-4 border-transparent'}
                            `}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className={`font-semibold text-sm truncate ${selectedIndex === idx ? 'text-cyan-900 dark:text-cyan-100' : 'text-slate-700 dark:text-slate-300'}`}>
                                    {result.fileName}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                    {Math.round(result.score * 100)}%
                                </span>
                            </div>
                            
                            {/* Matches Snippet */}
                            {result.matches.length > 0 && (
                                <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
                                    {result.matches[0].text}
                                </div>
                            )}

                            {/* Tags */}
                            {result.tags && result.tags.length > 0 && (
                                <div className="flex gap-1 mt-2 flex-wrap">
                                    {result.tags.slice(0, 3).map(tag => (
                                        <span key={tag} className="text-[10px] bg-paper-200 dark:bg-cyber-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Preview Panel */}
                <div className="w-1/2 bg-paper-50 dark:bg-cyber-900/50 p-6 overflow-y-auto custom-scrollbar">
                    {selectedFile ? (
                        <div className="space-y-6 animate-fadeIn">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-2">
                                    <FileText className="text-cyan-500" />
                                    {selectedFile.name}
                                </h2>
                                <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                                    <span className="flex items-center gap-1"><Calendar size={12}/> {new Date(selectedFile.lastModified).toLocaleDateString()}</span>
                                    <span className="font-mono">{selectedFile.path}</span>
                                </div>
                            </div>

                            {/* AI Summary Section */}
                            <div className="bg-white dark:bg-cyber-800 p-4 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm relative overflow-hidden group">
                                <h3 className="text-xs font-bold text-violet-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <Sparkles size={12} /> AI Summary
                                </h3>
                                {isGeneratingSummary ? (
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                        <Loader2 size={14} className="animate-spin" /> Generating insight...
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                        {previewSummary || "No summary available."}
                                    </p>
                                )}
                            </div>

                            {/* Related Files Discovery */}
                            {relatedFileIds.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <BrainCircuit size={14} /> Related Notes
                                    </h3>
                                    <div className="space-y-2">
                                        {relatedFileIds.map(id => {
                                            const relFile = files.find(f => f.id === id);
                                            if (!relFile) return null;
                                            return (
                                                <div 
                                                    key={id} 
                                                    onClick={() => { onNavigate(id); onClose(); }}
                                                    className="flex items-center justify-between p-2 rounded bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 hover:border-cyan-500 cursor-pointer group"
                                                >
                                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{relFile.name}</span>
                                                    <ArrowRight size={14} className="text-slate-400 group-hover:text-cyan-500 -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Raw Content Preview (Truncated) */}
                            <div className="opacity-50 hover:opacity-100 transition-opacity">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Content Snippet</h3>
                                <pre className="text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                                    {selectedFile.content.substring(0, 500)}...
                                </pre>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                            <FileText size={64} className="mb-4" />
                            <p>Select a file to preview</p>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Footer Legend */}
            <div className="p-3 bg-paper-50 dark:bg-cyber-800 border-t border-paper-200 dark:border-cyber-700 text-[10px] text-slate-500 flex gap-4 justify-end">
                <span className="flex items-center gap-1"><kbd className="bg-paper-200 dark:bg-cyber-700 px-1 rounded">↓</kbd> <kbd className="bg-paper-200 dark:bg-cyber-700 px-1 rounded">↑</kbd> Navigate</span>
                <span className="flex items-center gap-1"><kbd className="bg-paper-200 dark:bg-cyber-700 px-1 rounded">Enter</kbd> Open</span>
                <span className="flex items-center gap-1"><kbd className="bg-paper-200 dark:bg-cyber-700 px-1 rounded">Esc</kbd> Close</span>
            </div>
        </div>
    </div>
  );
};
