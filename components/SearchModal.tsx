import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, FileText, Clock, Tag, ChevronRight, Sparkles, ArrowRight, ArrowLeft, CircleArrowRight, ArrowUp, ArrowDown } from 'lucide-react';
import { MarkdownFile, SearchResult } from '../types';
import { instantSearch, parseSearchQuery, highlightMatch } from '../src/services/search/searchService';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: MarkdownFile[];
  onSelectFile: (fileId: string) => void;
  onSearch?: (query: string, mode: 'instant' | 'semantic') => Promise<SearchResult[]>;
}

type SearchMode = 'instant' | 'semantic';

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  files,
  onSelectFile,
  onSearch
}) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('instant');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (query.trim() || mode === 'instant') {
      performSearch();
    } else {
      setResults([]);
    }
  }, [query, mode, files]);

  const performSearch = useCallback(async () => {
    if (mode === 'instant') {
      const instantResults = instantSearch(files, query, { maxResults: 20 });
      setResults(instantResults);
      setSelectedIndex(0);
    } else if (onSearch && query.trim()) {
      setIsSearching(true);
      try {
        const semantic = await onSearch(query, 'semantic');
        setSemanticResults(semantic);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Semantic search failed:', error);
      } finally {
        setIsSearching(false);
      }
    }
  }, [query, mode, files, onSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const currentResults = mode === 'instant' ? results : semanticResults;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, currentResults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (currentResults[selectedIndex]) {
          handleSelectFile(currentResults[selectedIndex].fileId);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [results, semanticResults, selectedIndex, mode, onClose]);

  const handleSelectFile = (fileId: string) => {
    onSelectFile(fileId);
    onClose();
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  const displayResults = mode === 'instant' ? results : semanticResults;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-[10vh] backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-cyber-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[70vh] flex flex-col overflow-hidden animate-slideDown">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-paper-200 dark:border-cyber-700">
          <Search size={20} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files... (tag:name type:file after:2025-01)"
            className="flex-1 bg-transparent text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none text-lg"
          />
          {query && (
            <button onClick={clearSearch} className="p-1 hover:bg-paper-100 dark:hover:bg-cyber-700 rounded transition-colors">
              <X size={18} className="text-slate-400" />
            </button>
          )}
          <div className="flex items-center gap-1 bg-paper-100 dark:bg-cyber-900 rounded-lg p-1">
            <button
              onClick={() => setMode('instant')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                mode === 'instant'
                  ? 'bg-white dark:bg-cyber-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Instant
            </button>
            <button
              onClick={() => setMode('semantic')}
              disabled={!query.trim()}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors flex items-center gap-1 ${
                mode === 'semantic'
                  ? 'bg-white dark:bg-cyber-700 text-violet-600 dark:text-violet-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50'
              }`}
            >
              <Sparkles size={14} />
              AI
            </button>
          </div>
        </div>

        <div className="px-4 py-2 bg-paper-50 dark:bg-cyber-900/50 border-b border-paper-200 dark:border-cyber-700 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>Filters:</span>
          <code className="px-1.5 py-0.5 bg-paper-200 dark:bg-cyber-800 rounded">tag:name</code>
          <code className="px-1.5 py-0.5 bg-paper-200 dark:bg-cyber-800 rounded">type:file</code>
          <code className="px-1.5 py-0.5 bg-paper-200 dark:bg-cyber-800 rounded">ext:md</code>
          <code className="px-1.5 py-0.5 bg-paper-200 dark:bg-cyber-800 rounded">after:2025-01</code>
          <code className="px-1.5 py-0.5 bg-paper-200 dark:bg-cyber-800 rounded">before:2025-12</code>
        </div>

        <div ref={resultsRef} className="flex-1 overflow-y-auto">
          {isSearching ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                <Sparkles size={20} className="animate-spin text-violet-500" />
                <span>Searching with AI...</span>
              </div>
            </div>
          ) : displayResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
              <Search size={48} className="mb-4 opacity-50" />
              {query.trim() ? (
                <p>No files found</p>
              ) : (
                <p>Type to search files...</p>
              )}
            </div>
          ) : (
            <div className="py-2">
              {displayResults.map((result, index) => (
                <button
                  key={result.fileId}
                  onClick={() => handleSelectFile(result.fileId)}
                  className={`w-full px-4 py-3 flex items-start gap-3 text-left transition-colors ${
                    index === selectedIndex
                      ? 'bg-cyan-50 dark:bg-cyan-900/20 border-l-2 border-cyan-500'
                      : 'hover:bg-paper-100 dark:hover:bg-cyber-800 border-l-2 border-transparent'
                  }`}
                >
                  <div className="p-2 bg-paper-200 dark:bg-cyber-700 rounded-lg shrink-0">
                    <FileText size={18} className="text-slate-500 dark:text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        <span dangerouslySetInnerHTML={{ __html: highlightMatch(result.fileName, query) }} />
                      </span>
                      {result.tags.length > 0 && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Tag size={12} className="text-emerald-500" />
                          <span className="text-[10px] text-slate-400">{result.tags.length}</span>
                        </div>
                      )}
                    </div>
                    {result.matches.some(m => m.type === 'content') && (
                      <div className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                        {result.matches.filter(m => m.type === 'content').slice(0, 1).map((match, i) => (
                          <span
                            key={i}
                            dangerouslySetInnerHTML={{
                              __html: highlightMatch(match.text, query)
                            }}
                          />
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <Clock size={12} />
                      <span>{new Date(result.lastModified).toLocaleDateString()}</span>
                      {result.path !== result.fileName && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[200px]">{result.path}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {index === selectedIndex && (
                    <ChevronRight size={16} className="text-cyan-500 shrink-0 mt-1" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900/50 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <ArrowUp size={12} /> <ArrowDown size={12} /> Navigate
            </span>
            <span className="flex items-center gap-1">
              <CircleArrowRight size={12} /> Open
            </span>
            <span className="flex items-center gap-1">
              <X size={12} /> Close
            </span>
          </div>
          <span>
            {displayResults.length} results
            {mode === 'semantic' && ` • AI powered`}
          </span>
        </div>
      </div>

      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
};

export default SearchModal;
