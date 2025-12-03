import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MarkdownFile } from '../types';
import { Grid, List, Calendar, LayoutGrid, Tag, Folder, Search, Filter, SortAsc, FileText, ChevronDown, Check } from 'lucide-react';
import { extractTags } from '../services/knowledgeService';

interface LibraryViewProps {
  files: MarkdownFile[];
  onSelectFile: (id: string) => void;
  activeFileId: string;
}

type ViewType = 'list' | 'grid' | 'cards' | 'timeline';
type SortType = 'name' | 'date' | 'size';

// --- Custom Dropdown Component ---
interface DropdownOption {
  value: string;
  label: string;
}

const LibraryDropdown = ({ 
  label, 
  value, 
  options, 
  onChange, 
  icon 
}: { 
  label?: string, 
  value: string, 
  options: DropdownOption[], 
  onChange: (val: string) => void,
  icon?: React.ReactNode
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = options.find(o => o.value === value)?.label || value;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-cyan-500 dark:hover:border-cyan-500 transition-colors shadow-sm min-w-[120px] justify-between ${isOpen ? 'ring-2 ring-cyan-500/20 border-cyan-500' : ''}`}
      >
        <div className="flex items-center gap-2 truncate">
            {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
            <span className="truncate">{selectedLabel}</span>
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-cyber-800 rounded-xl shadow-xl border border-paper-200 dark:border-cyber-700 py-1 z-50 animate-slideDown overflow-hidden">
          {label && <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider bg-paper-50 dark:bg-cyber-900/50 border-b border-paper-100 dark:border-cyber-700/50">{label}</div>}
          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between group transition-colors
                  ${value === opt.value 
                    ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300' 
                    : 'text-slate-700 dark:text-slate-200 hover:bg-paper-100 dark:hover:bg-cyber-700'}
                `}
              >
                <span className="truncate">{opt.label}</span>
                {value === opt.value && <Check size={14} className="text-cyan-500 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const LibraryView: React.FC<LibraryViewProps> = ({ files, onSelectFile, activeFileId }) => {
  const [viewType, setViewType] = useState<ViewType>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortType, setSortType] = useState<SortType>('date');
  const [selectedTag, setSelectedTag] = useState<string>('');

  // --- Filtering & Sorting ---
  const filteredFiles = useMemo(() => {
    let result = files.filter(f => !f.name.endsWith('.keep'));

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        result = result.filter(f => f.name.toLowerCase().includes(q) || f.content.toLowerCase().includes(q));
    }

    if (selectedTag) {
        result = result.filter(f => extractTags(f.content).includes(selectedTag));
    }

    return result.sort((a, b) => {
        if (sortType === 'name') return a.name.localeCompare(b.name);
        if (sortType === 'size') return b.content.length - a.content.length;
        return b.lastModified - a.lastModified; // Default date desc
    });
  }, [files, searchQuery, sortType, selectedTag]);

  // Extract all unique tags for filter dropdown
  const allTags = useMemo(() => {
      const tags = new Set<string>();
      files.forEach(f => extractTags(f.content).forEach(t => tags.add(t)));
      return Array.from(tags).sort();
  }, [files]);

  return (
    <div className="w-full h-full bg-paper-50 dark:bg-cyber-900 flex flex-col overflow-hidden">
        {/* Header Bar */}
        <div className="h-16 border-b border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-800 flex items-center justify-between px-6 shrink-0 z-10">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold text-lg">
                    <Folder className="text-cyan-500" />
                    Library
                </div>
                <div className="h-6 w-px bg-paper-300 dark:bg-cyber-600 mx-2 hidden sm:block" />
                <div className="flex bg-paper-100 dark:bg-cyber-900 rounded-lg p-1 border border-paper-200 dark:border-cyber-600 hidden sm:flex">
                    <button onClick={() => setViewType('list')} className={`p-1.5 rounded ${viewType === 'list' ? 'bg-white dark:bg-cyber-700 shadow-sm text-cyan-600 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}><List size={16} /></button>
                    <button onClick={() => setViewType('cards')} className={`p-1.5 rounded ${viewType === 'cards' ? 'bg-white dark:bg-cyber-700 shadow-sm text-cyan-600 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}><LayoutGrid size={16} /></button>
                    <button onClick={() => setViewType('grid')} className={`p-1.5 rounded ${viewType === 'grid' ? 'bg-white dark:bg-cyber-700 shadow-sm text-cyan-600 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}><Grid size={16} /></button>
                    <button onClick={() => setViewType('timeline')} className={`p-1.5 rounded ${viewType === 'timeline' ? 'bg-white dark:bg-cyber-700 shadow-sm text-cyan-600 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}><Calendar size={16} /></button>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <div className="relative hidden md:block">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                        type="text" 
                        placeholder="Search library..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-1.5 rounded-full bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 w-48 transition-all focus:w-64"
                    />
                </div>
                
                {/* Filter / Sort Controls */}
                <div className="flex items-center gap-2">
                    <LibraryDropdown
                        value={sortType}
                        onChange={(val) => setSortType(val as SortType)}
                        label="Sort By"
                        options={[
                            { value: 'date', label: 'Date' },
                            { value: 'name', label: 'Name' },
                            { value: 'size', label: 'Size' }
                        ]}
                        icon={<SortAsc size={14} />}
                    />
                    
                    <LibraryDropdown
                        value={selectedTag}
                        onChange={setSelectedTag}
                        label="Filter Tags"
                        icon={<Tag size={14} />}
                        options={[
                            { value: '', label: 'All Tags' },
                            ...allTags.map(t => ({ value: t, label: t }))
                        ]}
                    />
                </div>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {viewType === 'list' && (
                <div className="bg-white dark:bg-cyber-800 rounded-lg border border-paper-200 dark:border-cyber-700 overflow-hidden">
                    {filteredFiles.map(file => (
                        <div 
                            key={file.id}
                            onClick={() => onSelectFile(file.id)}
                            className="flex items-center justify-between p-4 border-b border-paper-100 dark:border-cyber-700 last:border-0 hover:bg-paper-50 dark:hover:bg-cyber-700/50 cursor-pointer transition-colors group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-cyan-600 transition-colors">{file.name}</div>
                                    <div className="text-xs text-slate-500">{file.path}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="flex gap-1 hidden sm:flex">
                                    {extractTags(file.content).slice(0,3).map(tag => (
                                        <span key={tag} className="px-2 py-0.5 bg-paper-100 dark:bg-cyber-900 rounded-full text-xs text-slate-500 border border-paper-200 dark:border-cyber-600">{tag}</span>
                                    ))}
                                </div>
                                <div className="text-xs text-slate-400 font-mono w-24 text-right">
                                    {new Date(file.lastModified).toLocaleDateString()}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {(viewType === 'grid' || viewType === 'cards') && (
                <div className={`grid gap-6 ${viewType === 'grid' ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                    {filteredFiles.map(file => (
                        <div 
                            key={file.id}
                            onClick={() => onSelectFile(file.id)}
                            className="bg-white dark:bg-cyber-800 rounded-xl border border-paper-200 dark:border-cyber-700 hover:border-cyan-500 dark:hover:border-cyan-500 shadow-sm hover:shadow-lg transition-all cursor-pointer group flex flex-col overflow-hidden h-full"
                        >
                            {viewType === 'cards' && (
                                <div className="h-32 bg-paper-50 dark:bg-cyber-900/50 p-4 border-b border-paper-100 dark:border-cyber-700/50 relative overflow-hidden">
                                     <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-500 to-transparent"></div>
                                     <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-4 leading-relaxed font-mono">
                                         {file.content.substring(0, 200)}
                                     </p>
                                </div>
                            )}
                            <div className="p-4 flex-1 flex flex-col">
                                <div className="flex items-start justify-between mb-2">
                                     <div className="p-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-md">
                                        <FileText size={16} />
                                     </div>
                                     {viewType === 'grid' && (
                                         <span className="text-[10px] text-slate-400">{new Date(file.lastModified).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                     )}
                                </div>
                                <h3 className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-cyan-600 transition-colors truncate mb-1">
                                    {file.name}
                                </h3>
                                {viewType === 'cards' && (
                                    <div className="mt-auto pt-3 flex flex-wrap gap-1">
                                         {extractTags(file.content).slice(0,3).map(tag => (
                                            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-paper-100 dark:bg-cyber-900 text-slate-500 rounded border border-paper-200 dark:border-cyber-600">{tag}</span>
                                         ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            {viewType === 'timeline' && (
                <div className="relative border-l-2 border-paper-200 dark:border-cyber-700 ml-4 space-y-8 py-2">
                    {filteredFiles.map(file => (
                        <div key={file.id} className="relative pl-8 group cursor-pointer" onClick={() => onSelectFile(file.id)}>
                            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white dark:bg-cyber-800 border-2 border-slate-300 dark:border-cyber-500 group-hover:border-cyan-500 group-hover:bg-cyan-50 transition-colors"></div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 font-mono">
                                {new Date(file.lastModified).toLocaleString()}
                            </div>
                            <div className="bg-white dark:bg-cyber-800 p-4 rounded-lg border border-paper-200 dark:border-cyber-700 group-hover:shadow-md transition-all">
                                <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-1">{file.name}</h3>
                                <div className="flex gap-2">
                                     {extractTags(file.content).map(tag => (
                                        <span key={tag} className="text-xs text-cyan-600 dark:text-cyan-400">{tag}</span>
                                     ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
  );
};