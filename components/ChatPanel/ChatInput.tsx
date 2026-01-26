import React from 'react';
import { Loader2, Mic, MicOff, Send } from 'lucide-react';
import type { AIState } from '../../types';
import Tooltip from '../Tooltip';
import type { Language } from '../../utils/translations';

type TranslationDictionary = typeof import('../../utils/translations').translations.en;

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  aiState: AIState;
  language: Language;
  t: TranslationDictionary;
  isSupported: boolean;
  isProcessing: boolean;
  isListening: boolean;
  onToggleListening: () => void;
  interimTranscript: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  onInputChange,
  onSubmit,
  aiState,
  language,
  t,
  isSupported,
  isProcessing,
  isListening,
  onToggleListening,
  interimTranscript
}) => (
  <div className="p-4 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900/50">
    <form onSubmit={onSubmit} className="relative space-y-2 w-full">
      <div className="relative flex items-center gap-2 w-full min-w-0">
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          disabled={aiState.isThinking}
          placeholder={t.typeMessage}
          className="flex-1 min-w-0 pl-4 pr-4 py-3 rounded-xl bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 transition-all shadow-sm"
        />

        {/* Voice Input Button */}
        {isSupported && (
          <Tooltip
            content={
              isProcessing
                ? (language === 'zh' ? '正在转录...' : 'Processing...')
                : isListening
                  ? (t.voice?.stopRecording || 'Stop Recording')
                  : (t.voice?.startRecording || 'Start Recording')
            }
          >
            <button
              type="button"
              onClick={onToggleListening}
              disabled={aiState.isThinking || isProcessing}
              className={`p-3 rounded-xl transition-all shrink-0 ${isProcessing
                ? 'bg-amber-500 text-white animate-pulse shadow-lg shadow-amber-500/50'
                : isListening
                  ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50'
                  : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300 disabled:opacity-50'
                }`}
              aria-label={
                isProcessing
                  ? (language === 'zh' ? '正在转录...' : 'Processing...')
                  : isListening
                    ? (t.voice?.stopRecording || 'Stop Recording')
                    : (t.voice?.startRecording || 'Start Recording')
              }
            >
              {isProcessing ? <Loader2 size={20} className="animate-spin" /> : isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          </Tooltip>
        )}

        {/* Send Button */}
        <button
          type="submit"
          disabled={!input.trim() || aiState.isThinking}
          className="p-3 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan-500/25 transition-all shrink-0"
        >
          <Send size={20} />
        </button>
      </div>

      {/* Real-time Transcript Display */}
      {interimTranscript && (
        <div className="text-sm text-neutral-400 dark:text-neutral-500 italic px-3 py-1 flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          <span>{interimTranscript}...</span>
        </div>
      )}

      {/* Listening Indicator */}
      {isListening && !interimTranscript && (
        <div className="text-sm text-neutral-400 dark:text-neutral-500 italic px-3 py-1 flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          <span>{t.voice?.listening || (language === 'zh' ? '正在录音...' : 'Recording...')}</span>
        </div>
      )}

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="text-sm text-amber-500 dark:text-amber-400 italic px-3 py-1 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          <span>{language === 'zh' ? '正在转录...' : 'Transcribing...'}</span>
        </div>
      )}
    </form>
  </div>
);
