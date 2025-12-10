
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Sparkles, Bot, X, Trash2, Archive, Maximize2, Minimize2, Mic, Wand2, Loader2 } from 'lucide-react';
import { ChatMessage, AIState } from '../types';
import ReactMarkdown from 'react-markdown';
import { translations, Language } from '../utils/translations';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onClearChat: () => void;
  onCompactChat?: () => void; // Optional for backward compatibility
  onEnhancePrompt?: (text: string) => Promise<string>;
  aiState: AIState;
  language?: Language;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  onClearChat,
  onCompactChat,
  onEnhancePrompt,
  aiState,
  language = 'en'
}) => {
  const [input, setInput] = useState('');
  const [isCompact, setIsCompact] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const t = translations[language];

  // Voice Integration
  const { isListening, toggle, isSupported } = useSpeechRecognition({
    onResult: (transcript, isFinal) => {
      // If final, append and add space. If interim, we might want to show it but 
      // for simplicity in this chat input, we'll just append final results to avoid jitter
      if (isFinal) {
         setInput(prev => {
             const spacer = prev.length > 0 && !prev.endsWith(' ') ? ' ' : '';
             return prev + spacer + transcript;
         });
      }
    },
    language: language === 'zh' ? 'zh-CN' : 'en-US'
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen, isCompact]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || aiState.isThinking || isEnhancing) return;
    onSendMessage(input);
    setInput('');
  };

  const handleEnhance = async () => {
      if (!input.trim() || !onEnhancePrompt) return;
      setIsEnhancing(true);
      try {
          const enhanced = await onEnhancePrompt(input);
          setInput(enhanced);
      } catch (e) {
          console.error("Enhance failed", e);
      } finally {
          setIsEnhancing(false);
      }
  };

  return (
    <div 
      className={`
        fixed inset-y-0 right-0 z-[60] w-80 sm:w-96 transform transition-transform duration-300 ease-in-out shadow-2xl
        bg-white/95 dark:bg-cyber-900/95 backdrop-blur-xl border-l border-paper-200 dark:border-cyber-700
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-paper-200 dark:border-cyber-700 shrink-0">
          <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
            <Sparkles size={18} className="text-violet-500" />
            <span>{t.aiCompanion}</span>
          </div>

          <div className="flex items-center gap-1">
             {/* Visual Compact Toggle */}
             <button
                onClick={() => setIsCompact(!isCompact)}
                className="p-2 rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors mr-1"
                title={isCompact ? "Switch to Standard View" : "Switch to Compact View"}
             >
                {isCompact ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
             </button>

             {/* Context Summary */}
             {onCompactChat && (
                <button
                   onClick={onCompactChat}
                   className={`p-2 rounded-md transition-colors mr-1 ${messages.length > 3 ? 'text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20' : 'text-slate-300 dark:text-slate-700 cursor-not-allowed'}`}
                   title={messages.length > 3 ? "Summarize History (Save Tokens)" : "Summarize History (Requires > 3 messages)"}
                   disabled={aiState.isThinking || messages.length <= 3}
                >
                   <Archive size={18} />
                </button>
             )}
            <button 
              onClick={onClearChat}
              className="p-2 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors mr-1"
              title={t.clearHistory}
            >
              <Trash2 size={18} />
            </button>
            <button 
              onClick={onClose}
              className="p-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-paper-100 dark:hover:bg-cyber-800 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className={`flex-1 overflow-y-auto p-4 custom-scrollbar ${isCompact ? 'space-y-2' : 'space-y-4'}`}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center space-y-2 opacity-60">
              <Bot size={48} />
              <p className="max-w-[80%]">{t.askMe}</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div 
                  className={`
                    rounded-full flex items-center justify-center shrink-0
                    ${isCompact ? 'w-6 h-6' : 'w-8 h-8'}
                    ${msg.role === 'user' 
                        ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400' 
                        : msg.role === 'system' 
                           ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                           : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'}
                  `}
                >
                  {msg.role === 'user' ? <User size={isCompact ? 12 : 16} /> : (msg.role === 'system' ? <Sparkles size={isCompact ? 12 : 16} /> : <Bot size={isCompact ? 12 : 16} />)}
                </div>
                <div 
                  className={`
                    max-w-[85%] rounded-2xl leading-relaxed
                    ${isCompact ? 'p-2 text-xs' : 'p-3 text-sm'}
                    ${msg.role === 'user' 
                      ? 'bg-cyan-50 dark:bg-cyber-800 text-slate-800 dark:text-slate-200 rounded-tr-none' 
                      : msg.role === 'system'
                        ? 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-slate-700 dark:text-slate-300 italic'
                        : 'bg-white dark:bg-cyber-800/50 border border-paper-200 dark:border-cyber-700 text-slate-700 dark:text-slate-300 rounded-tl-none'}
                  `}
                >
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))
          )}
          {aiState.isThinking && (
            <div className="flex gap-3">
              <div className={`rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0 ${isCompact ? 'w-6 h-6' : 'w-8 h-8'}`}>
                <Bot size={isCompact ? 12 : 16} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div className={`bg-white dark:bg-cyber-800/50 rounded-2xl rounded-tl-none border border-paper-200 dark:border-cyber-700 flex items-center gap-1 ${isCompact ? 'p-2' : 'p-3'}`}>
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className={`border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900/50 shrink-0 ${isCompact ? 'p-2' : 'p-4'}`}>
          <form onSubmit={handleSubmit} className="relative flex gap-2">
            
            <div className="flex flex-col gap-1">
                {/* Voice Input Button */}
                {isSupported && (
                <button
                    type="button"
                    onClick={toggle}
                    className={`p-3 rounded-xl transition-all flex items-center justify-center shrink-0 ${isListening ? 'bg-red-500 text-white animate-pulse shadow-red-500/50 shadow-lg' : 'bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-500 hover:text-cyan-500'}`}
                    title="Voice Input"
                >
                    <Mic size={18} />
                </button>
                )}
                
                {/* Enhance Prompt Button */}
                {onEnhancePrompt && (
                    <button
                        type="button"
                        onClick={handleEnhance}
                        disabled={!input.trim() || isEnhancing || aiState.isThinking}
                        className={`p-3 rounded-xl transition-all flex items-center justify-center shrink-0 ${isEnhancing ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-500' : 'bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-500 hover:text-violet-500 disabled:opacity-50'}`}
                        title="Enhance Prompt with AI"
                    >
                        {isEnhancing ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
                    </button>
                )}
            </div>

            <div className="relative flex-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={aiState.isThinking || isEnhancing}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                    }
                }}
                placeholder={isListening ? "Listening..." : (isEnhancing ? "Enhancing your prompt..." : t.typeMessage)}
                className={`w-full pl-4 pr-16 rounded-xl bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 transition-all shadow-sm resize-none custom-scrollbar ${isCompact ? 'py-2 text-sm h-10' : 'py-3 h-24'}`}
              />
              <button
                type="submit"
                disabled={!input.trim() || aiState.isThinking || isEnhancing}
                className="absolute right-2 bottom-2 p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
              >
                <Send size={16} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};