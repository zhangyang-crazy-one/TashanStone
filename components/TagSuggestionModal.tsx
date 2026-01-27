import React, { useState, useEffect } from 'react';
import { X, Sparkles, Tag, Plus, Loader2 } from 'lucide-react';
import { suggestTags } from '../services/aiService';
import { AIConfig } from '../types';
import { translations } from '../utils/translations';
import { Language } from '../utils/translations';
import { Button } from './ui/Button';

interface TagSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  aiConfig: AIConfig;
  existingTags: string[];
  onApplyTags: (tags: string[]) => void;
  onShowToast?: (message: string, isError?: boolean) => void;
  language?: Language;
}

export const TagSuggestionModal: React.FC<TagSuggestionModalProps> = ({
  isOpen,
  onClose,
  content,
  aiConfig,
  existingTags,
  onApplyTags,
  onShowToast,
  language = 'en'
}) => {
  const t = translations[language];
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && content) {
      generateSuggestions();
    }
  }, [isOpen, content]);

  const generateSuggestions = async () => {
    setIsLoading(true);
    setError(null);
    setSuggestedTags([]);
    setSelectedTags([]);

    try {
      const tags = await suggestTags(content, aiConfig);
      const filteredTags = tags.filter(tag => !existingTags.includes(tag));
      setSuggestedTags(filteredTags);
      
      if (filteredTags.length === 0) {
        setError(t.noNewTags);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate tag suggestions');
      onShowToast?.(t.aiTagSuggestions + ' ' + (err instanceof Error ? err.message : 'failed'), true);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleApply = () => {
    onApplyTags(selectedTags);
    onShowToast?.(t.applyTags.replace('{count}', String(selectedTags.length)), false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white dark:bg-cyber-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-cyan-500" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">
              {t.tagSuggestionTitle}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-paper-200 dark:hover:bg-cyber-700 transition-colors"
          >
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 size={32} className="animate-spin text-cyan-500" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t.analyzingContent}
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="text-amber-500 text-sm text-center">{error}</div>
              <Button
                onClick={generateSuggestions}
                size="sm"
                className="bg-cyan-500 hover:bg-cyan-600"
              >
                {t.retry}
              </Button>
            </div>
          ) : suggestedTags.length > 0 ? (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                {t.selectTagsToAdd}
              </p>
              
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                {suggestedTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all ${
                      selectedTags.includes(tag)
                        ? 'bg-cyan-500 text-white'
                        : 'bg-paper-100 dark:bg-cyber-700 text-slate-700 dark:text-slate-300 hover:bg-cyan-100 dark:hover:bg-cyber-600'
                    }`}
                  >
                    <Tag size={12} />
                    {tag}
                    {selectedTags.includes(tag) && (
                      <Plus size={12} className="transform rotate-45" />
                    )}
                  </button>
                ))}
              </div>

              {existingTags.length > 0 && (
                <div className="mt-4 pt-3 border-t border-paper-200 dark:border-cyber-700">
                  <p className="text-xs text-slate-500 mb-2">
                    {t.existingTags}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {existingTags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-slate-100 dark:bg-cyber-700 rounded-full text-xs text-slate-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-slate-500">
              {t.aiTagSuggestions}
            </div>
          )}
        </div>

        {/* Footer */}
        {suggestedTags.length > 0 && !isLoading && (
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900">
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
              className="text-slate-600 dark:text-slate-300 hover:bg-paper-200 dark:hover:bg-cyber-700"
            >
              {t.cancel}
            </Button>
            <Button
              onClick={handleApply}
              disabled={selectedTags.length === 0}
              size="sm"
              leftIcon={<Plus size={14} />}
              className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50"
            >
              {t.applyTags.replace('{count}', String(selectedTags.length))}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TagSuggestionModal;
