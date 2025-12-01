import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Sparkles, Bot, X, Trash2, Minimize2 } from 'lucide-react';
import { ChatMessage, AIState } from '../types';
import ReactMarkdown from 'react-markdown';
import { translations, Language } from '../utils/translations';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onClearChat: () => void;
  onCompactChat?: () => void; // Optional for backward compatibility, though implemented in App
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
  aiState,
  language = 'en'
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const t = translations[language];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || aiState.isThinking) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div 
      className={`
        fixed inset-y-0 right-0 z-20 w-80 sm:w-96 transform transition-transform duration-300 ease-in-out shadow-2xl
        bg-white/95 dark:bg-cyber-900/95 backdrop-blur-xl border-l border-paper-200 dark:border-cyber-700
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-paper-200 dark:border-cyber-700">
          <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
            <Sparkles size={18} className="text-violet-500" />
            <span>{t.aiCompanion}</span>
          </div>
          <div className="flex items-center gap-1">
             {onCompactChat && (
                <button
                   onClick={onCompactChat}
                   className={`p-1 transition-colors mr-1 ${messages.length > 3 ? 'text-slate-400 hover:text-cyan-500' : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'}`}
                   title={messages.length > 3 ? "Compact Context (Summarize History)" : "Compact Context (Requires > 3 messages)"}
                   disabled={aiState.isThinking || messages.length <= 3}
                >
                   <Minimize2 size={18} />
                </button>
             )}
            <button 
              onClick={onClearChat}
              className="p-1 text-slate-400 hover:text-red-500 transition-colors mr-1"
              title={t.clearHistory}
            >
              <Trash2 size={18} />
            </button>
            <button 
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
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
                    w-8 h-8 rounded-full flex items-center justify-center shrink-0
                    ${msg.role === 'user' 
                        ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400' 
                        : msg.role === 'system' 
                           ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                           : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'}
                  `}
                >
                  {msg.role === 'user' ? <User size={16} /> : (msg.role === 'system' ? <Sparkles size={16} /> : <Bot size={16} />)}
                </div>
                <div 
                  className={`
                    max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed
                    ${msg.role === 'user' 
                      ? 'bg-cyan-50 dark:bg-cyber-800 text-slate-800 dark:text-slate-200 rounded-tr-none' 
                      : msg.role === 'system'
                        ? 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-slate-700 dark:text-slate-300 italic text-xs'
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
              <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                <Bot size={16} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div className="bg-white dark:bg-cyber-800/50 p-3 rounded-2xl rounded-tl-none border border-paper-200 dark:border-cyber-700 flex items-center gap-1">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900/50">
          <form onSubmit={handleSubmit} className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={aiState.isThinking}
              placeholder={t.typeMessage}
              className="w-full pl-4 pr-12 py-3 rounded-xl bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 transition-all shadow-sm"
            />
            <button
              type="submit"
              disabled={!input.trim() || aiState.isThinking}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};