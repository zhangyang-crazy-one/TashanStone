

import React, { useState, useRef, useEffect, useMemo, forwardRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Check, Copy, FileCode, AlertTriangle, ZoomIn, ZoomOut, Maximize, WrapText, Play, ChevronDown, ChevronRight, CheckSquare, Square, PieChart } from 'lucide-react';
import mermaid from 'mermaid';
import { preprocessWikiLinks } from '../services/knowledgeService';
import { WikiLink } from './WikiLink';
import { MarkdownFile } from '../types';

// --- Types ---
interface PreviewProps {
  content: string;
  files?: MarkdownFile[]; // For linking context
  onNavigate?: (id: string) => void;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

// --- Utils ---
const extractText = (children: React.ReactNode): string => {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (typeof children === 'object' && children !== null && 'props' in children) {
    return extractText((children as any).props.children);
  }
  return '';
};

// --- Sub-Components ---

const MermaidRenderer = ({ code, isDark }: { code: string, isDark: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const render = async () => {
      if (!code) return;
      try {
        setError(null);
        const style = getComputedStyle(document.documentElement);
        const getVar = (name: string) => {
           const val = style.getPropertyValue(name).trim();
           return val ? `rgb(${val.split(' ').join(', ')})` : '';
        };
        const primary = getVar('--primary-500') || (isDark ? '#06b6d4' : '#0891b2');
        const line = getVar('--neutral-500') || (isDark ? '#94a3b8' : '#475569');
        const bg = 'transparent'; 

        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          fontFamily: 'JetBrains Mono, monospace',
          themeVariables: {
             darkMode: isDark,
             background: bg,
             primaryColor: primary,
             lineColor: line,
             textColor: getVar('--text-primary'),
             mainBkg: bg,
             nodeBorder: primary
          }
        });

        const id = `mermaid-embed-${Math.random().toString(36).substr(2, 9)}`;
        const { svg: generatedSvg } = await mermaid.render(id, code);
        setSvg(generatedSvg);
      } catch (err: any) {
        console.error("Mermaid Render Error:", err);
        setError(err.message || "Syntax Error");
      }
    };
    render();
  }, [code, isDark]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setPosition(p => ({ x: p.x + dx, y: p.y + dy }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseUp = () => { isDragging.current = false; };
  const handleReset = () => { setScale(1.0); setPosition({ x: 0, y: 0 }); };

  if (error) {
    return (
      <div className="my-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 text-sm font-mono flex gap-3 items-start">
        <AlertTriangle className="shrink-0 mt-0.5" size={16} />
        <div>
          <div className="font-bold mb-1">Mermaid Error</div>
          <div className="whitespace-pre-wrap opacity-80">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-6 relative group border border-paper-200 dark:border-cyber-700 rounded-xl overflow-hidden bg-paper-100 dark:bg-cyber-800 h-[400px]">
      <div 
        className="w-full h-full cursor-grab active:cursor-grabbing flex items-center justify-center overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        ref={containerRef}
      >
        <div 
          style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, transition: isDragging.current ? 'none' : 'transform 0.1s' }}
          dangerouslySetInnerHTML={{ __html: svg }}
          className="pointer-events-none"
        />
      </div>
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button onClick={() => setScale(s => Math.min(5, s + 0.2))} className="p-1.5 bg-white dark:bg-cyber-700 rounded shadow hover:bg-paper-100 dark:hover:bg-cyber-600"><ZoomIn size={16} /></button>
        <button onClick={handleReset} className="p-1.5 bg-white dark:bg-cyber-700 rounded shadow hover:bg-paper-100 dark:hover:bg-cyber-600"><Maximize size={16} /></button>
        <button onClick={() => setScale(s => Math.max(0.2, s - 0.2))} className="p-1.5 bg-white dark:bg-cyber-700 rounded shadow hover:bg-paper-100 dark:hover:bg-cyber-600"><ZoomOut size={16} /></button>
      </div>
    </div>
  );
};

const EnhancedCodeBlock = ({ children, className, inline, ...props }: any) => {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [executionResult, setExecutionResult] = useState<string | null>(null);

  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : 'text';
  const isMermaid = language === 'mermaid';
  const isJS = language === 'javascript' || language === 'js';
  const isDark = document.documentElement.classList.contains('dark');

  if (inline) {
    return (
      <code className={`${className} bg-paper-200 dark:bg-cyber-800 px-1.5 py-0.5 rounded text-sm text-cyan-700 dark:text-cyan-400 font-mono`} {...props}>
        {children}
      </code>
    );
  }

  if (isMermaid) {
    const codeText = extractText(children);
    return <MermaidRenderer code={codeText} isDark={isDark} />;
  }

  const handleCopy = async () => {
    const text = extractText(children);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { console.error(err); }
  };
  
  const handleRunCode = () => {
      const code = extractText(children);
      setExecutionResult(null);
      try {
          // Simple sandbox eval
          // Capture logs
          let logs: string[] = [];
          const mockConsole = {
              log: (...args: any[]) => logs.push(args.join(' ')),
              error: (...args: any[]) => logs.push('[Error] ' + args.join(' ')),
              warn: (...args: any[]) => logs.push('[Warn] ' + args.join(' '))
          };
          
          const run = new Function('console', `
            try {
                ${code}
            } catch(e) {
                console.error(e);
            }
          `);
          
          run(mockConsole);
          setExecutionResult(logs.length > 0 ? logs.join('\n') : "Executed successfully (No output)");
      } catch (e: any) {
          setExecutionResult(`Runtime Error: ${e.message}`);
      }
  };

  return (
    <div className="my-6 rounded-xl border border-paper-200 dark:border-cyber-700 bg-[#282c34] overflow-hidden shadow-lg group transition-all">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#21252b] border-b border-white/5 select-none" onDoubleClick={() => setIsCollapsed(!isCollapsed)}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
          </div>
          <button onClick={() => setIsCollapsed(!isCollapsed)} className="flex items-center gap-2 hover:text-white transition-colors">
              {isCollapsed ? <ChevronRight size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
                {language}
              </span>
          </button>
        </div>
        <div className="flex items-center gap-2">
           {isJS && !isCollapsed && (
             <button
                onClick={handleRunCode}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all mr-2"
                title="Run JavaScript"
             >
                <Play size={12} fill="currentColor" /> Run
             </button>
           )}
          <button
             onClick={() => setShowLineNumbers(!showLineNumbers)}
             className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${showLineNumbers ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
             #
          </button>
          <button
            onClick={() => setWrap(!wrap)}
            className={`p-1.5 rounded-md transition-all ${wrap ? 'bg-white/10 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            title="Toggle Word Wrap"
          >
            <WrapText size={14} />
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-slate-500 hover:text-white hover:bg-white/10 transition-all"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      
      {!isCollapsed && (
          <>
            <div className={`relative flex ${wrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto'}`}>
                {showLineNumbers && (
                    <div className="py-4 pr-2 pl-3 text-right text-slate-600 bg-[#21252b] border-r border-white/5 select-none text-sm font-mono leading-relaxed min-w-[3rem]">
                        {extractText(children).split('\n').map((_, i) => (
                            <div key={i}>{i + 1}</div>
                        ))}
                    </div>
                )}
                <pre className={`!m-0 !p-4 !bg-transparent text-sm font-mono leading-relaxed text-gray-300 flex-1 ${wrap ? '!whitespace-pre-wrap' : ''}`} {...props}>
                  <code className={className || 'language-text'} style={{ textShadow: 'none' }}>
                    {children}
                  </code>
                </pre>
            </div>
            {executionResult && (
                <div className="border-t border-white/10 bg-[#1e2227] p-3 text-xs font-mono">
                    <div className="flex justify-between mb-1">
                        <span className="text-emerald-500 font-bold">Output:</span>
                        <button onClick={() => setExecutionResult(null)} className="text-slate-500 hover:text-white"><Check size={12}/></button>
                    </div>
                    <pre className="text-slate-300 whitespace-pre-wrap">{executionResult}</pre>
                </div>
            )}
          </>
      )}
    </div>
  );
};


export const Preview = forwardRef<HTMLDivElement, PreviewProps>(({ content, onScroll, files = [], onNavigate }, ref) => {
  const [renderHtml, setRenderHtml] = useState(false);
  const hasHtml = useMemo(() => /<[a-z]+(\s+[^>]*)?\/?>/i.test(content) || /<\/[a-z]+>/i.test(content), [content]);

  // Preprocess content to handle [[WikiLinks]]
  const processedContent = useMemo(() => preprocessWikiLinks(content), [content]);

  // Task Statistics
  const taskStats = useMemo(() => {
     const total = (content.match(/- \[[x ]\]/g) || []).length;
     const completed = (content.match(/- \[x\]/g) || []).length;
     return total > 0 ? { total, completed, percent: Math.round((completed / total) * 100) } : null;
  }, [content]);

  return (
    <div className="h-full w-full bg-paper-50 dark:bg-cyber-900 relative flex flex-col transition-colors duration-300">
      
      {/* Controls Overlay */}
      <div className="absolute top-4 right-6 z-20 flex flex-col gap-2 animate-fadeIn items-end">
          {hasHtml && (
             <div className="flex items-center gap-2 bg-white/90 dark:bg-cyber-800/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm border border-paper-200 dark:border-cyber-700">
                 <FileCode size={14} className="text-cyan-600 dark:text-cyan-400" />
                 <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-2 select-none">
                    Render HTML
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
          
          {/* Task Progress Bar */}
          {taskStats && (
              <div className="bg-white/90 dark:bg-cyber-800/90 backdrop-blur p-3 rounded-xl shadow-sm border border-paper-200 dark:border-cyber-700 w-48">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                      <span className="flex items-center gap-1"><CheckSquare size={12} className="text-emerald-500"/> Tasks</span>
                      <span>{taskStats.completed}/{taskStats.total}</span>
                  </div>
                  <div className="w-full h-2 bg-paper-200 dark:bg-cyber-900 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-400 to-cyan-500 transition-all duration-500"
                        style={{ width: `${taskStats.percent}%` }}
                      ></div>
                  </div>
              </div>
          )}
      </div>

      <div 
        ref={ref} 
        onScroll={onScroll} 
        className="flex-1 overflow-y-auto p-8 custom-scrollbar"
      >
        <div className="prose prose-lg max-w-none dark:prose-invert">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm, remarkMath]} 
            rehypePlugins={[rehypeHighlight, rehypeKatex, ...(renderHtml ? [rehypeRaw] : [])]}
            urlTransform={(value: string) => value} // Enable data URIs for images
            components={{
              pre: ({children}) => <>{children}</>,
              code: EnhancedCodeBlock,
              // Intercept links to render WikiLink if query param exists
              a: ({ href, children, ...props }) => {
                if (href?.startsWith('?wiki=')) {
                  return (
                    <WikiLink href={href} files={files} onNavigate={onNavigate || (() => {})}>
                       {children}
                    </WikiLink>
                  );
                }
                return <a href={href} {...props}>{children}</a>;
              }
            }}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
});

Preview.displayName = 'Preview';
