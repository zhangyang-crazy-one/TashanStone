import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, FileText, ArrowLeft, ArrowDown, ArrowUp, X, Link2 } from 'lucide-react';
import type { MarkdownFile, LinkInsertResult } from '../types';

interface LinkInsertModalProps {
  isOpen: boolean;
  mode: 'wikilink' | 'blockref' | 'quick_link';
  files: MarkdownFile[];
  currentFileId?: string;
  onInsert: (result: LinkInsertResult) => void;
  onClose: () => void;
  selectedText?: string;
}

export const LinkInsertModal: React.FC<LinkInsertModalProps> = ({
  isOpen,
  mode,
  files,
  currentFileId,
  onInsert,
  onClose,
  selectedText = ''
}) => {
  const [step, setStep] = useState<'file' | 'line'>('file');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<MarkdownFile | null>(null);
  const [selectedLineStart, setSelectedLineStart] = useState<number>(1);
  const [selectedLineEnd, setSelectedLineEnd] = useState<number | null>(null);
  const [alias, setAlias] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lineSelectionMode, setLineSelectionMode] = useState<'start' | 'end'>('start');

  const inputRef = useRef<HTMLInputElement>(null);
  const aliasInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter files based on search query
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) {
      // Show all files except current file
      return files.filter(f => f.id !== currentFileId).slice(0, 20);
    }
    const query = searchQuery.toLowerCase();
    return files
      .filter(f => f.id !== currentFileId && f.name.toLowerCase().includes(query))
      .slice(0, 20);
  }, [files, searchQuery, currentFileId]);

  // Reset selected index when filtered files change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      // Reset state when closed
      setStep('file');
      setSearchQuery('');
      setSelectedFile(null);
      setSelectedLineStart(1);
      setSelectedLineEnd(null);
      setAlias('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Auto-select alias from selected text in quick_link mode
  useEffect(() => {
    if (mode === 'quick_link' && selectedText) {
      setAlias(selectedText);
    }
  }, [mode, selectedText]);

  // Handle file selection
  const handleFileSelect = useCallback((file: MarkdownFile) => {
    console.log('[LinkInsertModal] handleFileSelect called:', file.name, 'mode:', mode);
    setSelectedFile(file);
    if (mode === 'blockref') {
      setStep('line');
      setSelectedLineStart(1);
      setSelectedLineEnd(null);
      setLineSelectionMode('start');
      // Focus line input after step change
      setTimeout(() => {
        aliasInputRef.current?.focus();
      }, 50);
    } else {
      // For wikilink and quick_link, insert directly
      const fileName = file.name.replace(/\.md$/, '');
      console.log('[LinkInsertModal] Direct insert for wikilink/quick_link:', fileName);
      onInsert({
        type: mode,
        fileName,
        fileId: file.id,
        alias: alias.trim() || undefined,
        startLine: undefined,
        endLine: undefined,
        selectedText
      });
      onClose();
    }
  }, [mode, alias, selectedText, onInsert, onClose]);

  // Handle line click
  const handleLineClick = useCallback((lineNumber: number) => {
    if (lineSelectionMode === 'start') {
      setSelectedLineStart(lineNumber);
      setSelectedLineEnd(lineNumber);
      setLineSelectionMode('end');
    } else {
      if (lineNumber >= selectedLineStart) {
        setSelectedLineEnd(lineNumber);
      } else {
        // If clicked above start, reset
        setSelectedLineStart(lineNumber);
        setSelectedLineEnd(lineNumber);
        setLineSelectionMode('start');
      }
    }
  }, [selectedLineStart, lineSelectionMode]);

  // Handle insert
  const handleInsert = useCallback((file: MarkdownFile) => {
    if (!file) {
      console.log('[LinkInsertModal] handleInsert: no file selected');
      return;
    }

    const fileName = file.name.replace(/\.md$/, '');
    let aliasText = alias.trim();

    console.log('[LinkInsertModal] handleInsert:', { fileName, mode, alias: aliasText, startLine: selectedLineStart, endLine: selectedLineEnd });

    onInsert({
      type: mode,
      fileName,
      fileId: file.id,
      alias: aliasText || undefined,
      startLine: selectedLineStart,
      endLine: selectedLineEnd || undefined,
      selectedText
    });
    onClose();
  }, [mode, alias, selectedLineStart, selectedLineEnd, selectedText, onInsert, onClose]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredFiles.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        console.log('[LinkInsertModal] Enter pressed, step:', step, 'selectedIndex:', selectedIndex, 'file:', filteredFiles[selectedIndex]?.name);
        if (step === 'file' && filteredFiles[selectedIndex]) {
          handleFileSelect(filteredFiles[selectedIndex]);
        } else if (step === 'line' && selectedFile) {
          handleInsert(selectedFile);
        }
        break;
      case 'Escape':
        e.preventDefault();
        if (step === 'line') {
          setStep('file');
          setSelectedLineStart(1);
          setSelectedLineEnd(null);
          setLineSelectionMode('start');
        } else {
          onClose();
        }
        break;
      case 'Backspace':
        if (step === 'line' && !alias && lineSelectionMode === 'end') {
          setLineSelectionMode('start');
          setSelectedLineEnd(null);
        }
        break;
    }
  }, [step, filteredFiles, selectedIndex, selectedFile, handleFileSelect, handleInsert, lineSelectionMode, onClose]);

  // Get line count for selected file
  const lineCount = useMemo(() => {
    if (!selectedFile) return 0;
    return selectedFile.content.split('\n').length;
  }, [selectedFile]);

  // Get lines to display (virtual scrolling for large files)
  const displayLines = useMemo(() => {
    if (!selectedFile) return [];
    const lines = selectedFile.content.split('\n');
    // Show first 100 lines to avoid performance issues
    return lines.slice(0, 100).map((line, idx) => ({
      number: idx + 1,
      content: line || ' '
    }));
  }, [selectedFile]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={containerRef}
        className="w-[500px] max-h-[80vh] bg-white dark:bg-cyber-900 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            {step === 'line' && (
              <button
                onClick={() => {
                  setStep('file');
                  setSelectedLineStart(1);
                  setSelectedLineEnd(null);
                  setLineSelectionMode('start');
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                <ArrowLeft size={18} className="text-gray-500" />
              </button>
            )}
            <Link2 size={18} className="text-cyan-500" />
            <span className="font-medium text-gray-900 dark:text-white">
              {mode === 'wikilink' && '插入 WikiLink'}
              {mode === 'blockref' && '插入块引用'}
              {mode === 'quick_link' && '快速链接'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {step === 'file' ? (
            <>
              {/* Search Input */}
              <div className="relative mb-3">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索文件..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg focus:ring-2 focus:ring-cyan-500 text-gray-900 dark:text-white placeholder-gray-400"
                  onKeyDown={handleKeyDown}
                />
              </div>

              {/* File List */}
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {filteredFiles.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    未找到匹配的文件
                  </div>
                ) : (
                  filteredFiles.map((file, index) => (
                    <div
                      key={file.id}
                      onClick={() => handleFileSelect(file)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${index === selectedIndex
                        ? 'bg-cyan-100 dark:bg-cyan-900/30'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                    >
                      <FileText size={18} className="text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-gray-900 dark:text-white font-medium">
                          {file.name}
                        </div>
                        {file.path && (
                          <div className="text-xs text-gray-400 truncate">
                            {file.path}
                          </div>
                        )}
                      </div>
                      {index === selectedIndex && (
                        <span className="text-xs text-cyan-500">Enter</span>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Quick Link Hint */}
              {mode === 'quick_link' && selectedText && (
                <div className="mt-3 px-3 py-2 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
                  <div className="text-xs text-cyan-600 dark:text-cyan-400">
                    选中文本: "{selectedText.slice(0, 30)}{selectedText.length > 30 ? '...' : ''}"
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Selected File Info */}
              <div className="mb-3 flex items-center gap-2 px-2 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <FileText size={16} className="text-cyan-500" />
                <span className="text-gray-900 dark:text-white font-medium truncate">
                  {selectedFile?.name}
                </span>
              </div>

              {/* Line Selection */}
              <div className="mb-3">
                <div className="flex items-center gap-4 mb-2">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">
                      {lineSelectionMode === 'start' ? '起始行' : '结束行'}
                    </label>
                    <input
                      ref={aliasInputRef}
                      type="number"
                      min={1}
                      max={lineCount}
                      value={lineSelectionMode === 'start' ? selectedLineStart : (selectedLineEnd || selectedLineStart)}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 1;
                        if (lineSelectionMode === 'start') {
                          setSelectedLineStart(Math.max(1, Math.min(value, lineCount)));
                          setSelectedLineEnd(Math.max(value, selectedLineEnd || value));
                        } else {
                          setSelectedLineEnd(Math.max(selectedLineStart, Math.min(value, lineCount)));
                        }
                      }}
                      className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg focus:ring-2 focus:ring-cyan-500 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="text-xs text-gray-400 pt-6">
                    / {lineCount} 行
                  </div>
                </div>

                {/* Line Selection Hint */}
                <div className="text-xs text-gray-500 mb-2">
                  {lineSelectionMode === 'start'
                    ? '点击下方行号设置起始行，或直接输入数字'
                    : '点击下方行号设置结束行，或按 Backspace 重新选择'}
                </div>

                {/* Line Display */}
                <div className="max-h-[250px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  {displayLines.map(({ number, content }) => (
                    <div
                      key={number}
                      onClick={() => handleLineClick(number)}
                      className={`flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-cyan-50 dark:hover:bg-cyan-900/20 ${number >= selectedLineStart && number <= (selectedLineEnd || selectedLineStart)
                        ? 'bg-yellow-100 dark:bg-yellow-900/20'
                        : ''
                        }`}
                    >
                      <span className="text-gray-400 w-8 text-right text-xs select-none">
                        {number}
                      </span>
                      <span className="flex-1 truncate text-gray-700 dark:text-gray-300 text-sm font-mono">
                        {content}
                      </span>
                    </div>
                  ))}
                  {lineCount > 100 && (
                    <div className="px-2 py-1 text-xs text-gray-400 text-center">
                      ... 还有 {lineCount - 100} 行未显示
                    </div>
                  )}
                </div>
              </div>

              {/* Alias Input (optional) */}
              {mode !== 'blockref' && (
                <div>
                  <input
                    type="text"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="别名（可选）"
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg focus:ring-2 focus:ring-cyan-500 text-gray-900 dark:text-white placeholder-gray-400"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleInsert(selectedFile!);
                      }
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="text-xs text-gray-400">
            {step === 'file' ? (
              <>
                <span className="inline-flex items-center gap-1 mr-3">
                  <ArrowUp size={12} /> <ArrowDown size={12} /> 导航
                </span>
                <span>Enter 选择</span>
              </>
            ) : (
              <>
                <span>Esc 返回</span>
                <span className="mx-2">•</span>
                <span>Enter 插入</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (step === 'line') {
                  setStep('file');
                  setSelectedLineStart(1);
                  setSelectedLineEnd(null);
                  setLineSelectionMode('start');
                } else {
                  onClose();
                }
              }}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={() => handleInsert(selectedFile!)}
              disabled={!selectedFile}
              className="px-4 py-1.5 text-sm bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              插入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LinkInsertModal;
