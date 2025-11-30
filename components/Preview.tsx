
import React, { useState, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Check, Copy, FileCode } from 'lucide-react';

interface PreviewProps {
  content: string;
}

const PreBlock = ({ children, node, ...props }: any) => {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (preRef.current) {
      const text = preRef.current.textContent;
      if (text) {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          console.error("Failed to copy:", err);
        }
      }
    }
  };

  return (
    <div className="relative group my-6">
      <pre 
        ref={preRef} 
        {...props} 
        className="!my-0"
      >
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 p-1.5 rounded-md bg-paper-100 dark:bg-cyber-800 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 border border-paper-200 dark:border-cyber-600 opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-sm z-10"
        title="Copy code"
      >
        {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
      </button>
    </div>
  );
};

export const Preview: React.FC<PreviewProps> = ({ content }) => {
  const [renderHtml, setRenderHtml] = useState(false);

  // Simple heuristic to detect if the content contains HTML tags
  const hasHtml = useMemo(() => {
    // Matches standard opening tags <tag ...> or self-closing <tag ... /> or closing tags </tag>
    return /<[a-z]+(\s+[^>]*)?\/?>/i.test(content) || /<\/[a-z]+>/i.test(content);
  }, [content]);

  return (
    <div className="h-full w-full bg-paper-50 dark:bg-cyber-900 relative flex flex-col transition-colors duration-300">
      
      {/* HTML Toggle Header - Only shown if HTML is detected */}
      {hasHtml && (
         <div className="absolute top-4 right-6 z-20 flex items-center gap-2 bg-white/80 dark:bg-cyber-800/80 backdrop-blur px-3 py-1.5 rounded-full shadow-sm border border-paper-200 dark:border-cyber-700">
             <FileCode size={14} className="text-cyan-600 dark:text-cyan-400" />
             <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-2 select-none">
                Render HTML in App
                <div className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ${renderHtml ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                    <div className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${renderHtml ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </div>
                <input 
                  type="checkbox" 
                  checked={renderHtml} 
                  onChange={(e) => setRenderHtml(e.target.checked)} 
                  className="hidden"
                />
             </label>
         </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        {/* 
          The 'prose' class triggers the Tailwind Typography plugin.
          Colors are handled via CSS variables configured in index.html.
        */}
        <div className="prose prose-lg max-w-none">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm, remarkMath]} 
            rehypePlugins={[
              // Render raw HTML if enabled - put before highlight so embedded code blocks work if possible,
              // though typically highlight runs on code blocks parsed by remark.
              ...(renderHtml ? [rehypeRaw] : []),
              rehypeHighlight, 
              rehypeKatex
            ]}
            components={{
              pre: PreBlock
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};
