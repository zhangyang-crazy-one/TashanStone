import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Check, Copy, FileCode, Terminal, AlertTriangle, ZoomIn, ZoomOut, Maximize, WrapText, FileJson, ImageOff } from 'lucide-react';
import mermaid from 'mermaid';

// --- Types ---
interface PreviewProps {
  content: string;
}

// --- Utils ---
// Extract text from React children (handles cases where highlighting splits text into spans)
const extractText = (children: React.ReactNode): string => {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (typeof children === 'object' && children !== null && 'props' in children) {
    return extractText((children as any).props.children);
  }
  return '';
};

// --- Sub-Components ---

/**
 * MermaidRenderer: Handles rendering of embedded Mermaid diagrams
 * Includes Pan/Zoom and Error Handling
 */
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
        
        // Dynamic Theme Color Extraction
        const style = getComputedStyle(document.documentElement);
        // Helper to extract rgb values and format as needed
        const getVar = (name: string) => {
           const val = style.getPropertyValue(name).trim();
           // Tailwind vars in this project are like '11 17 33'. RGB() needs commas or spaces.
           return val ? `rgb(${val.split(' ').join(', ')})` : '';
        };
        
        // Fallback colors if vars missing (safety)
        const primary = getVar('--primary-500') || (isDark ? '#06b6d4' : '#0891b2');
        const line = getVar('--neutral-500') || (isDark ? '#94a3b8' : '#475569');
        const bg = 'transparent'; 

        // Configure Mermaid based on theme
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

  // Pan/Zoom Logic
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
      
      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button onClick={() => setScale(s => Math.min(5, s + 0.2))} className="p-1.5 bg-white dark:bg-cyber-700 rounded shadow hover:bg-paper-100 dark:hover:bg-cyber-600"><ZoomIn size={16} /></button>
        <button onClick={handleReset} className="p-1.5 bg-white dark:bg-cyber-700 rounded shadow hover:bg-paper-100 dark:hover:bg-cyber-600"><Maximize size={16} /></button>
        <button onClick={() => setScale(s => Math.max(0.2, s - 0.2))} className="p-1.5 bg-white dark:bg-cyber-700 rounded shadow hover:bg-paper-100 dark:hover:bg-cyber-600"><ZoomOut size={16} /></button>
      </div>
      <div className="absolute top-3 right-3 px-2 py-1 bg-white/80 dark:bg-black/50 backdrop-blur rounded text-[10px] font-bold text-slate-500 tracking-wider border border-black/5 dark:border-white/10">
        MERMAID
      </div>
    </div>
  );
};

/**
 * EnhancedCodeBlock: Renders code with Header, Copy button, and Wrap toggle
 */
const EnhancedCodeBlock = ({ children, className, inline, node, ...props }: any) => {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);

  // Detect Language
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : 'text';

  // Detect if Mermaid
  const isMermaid = language === 'mermaid';
  const isDark = document.documentElement.classList.contains('dark');

  // Better inline detection: if inline prop is true, or if there's no language class
  // and the code is simple text (not wrapped in pre by our override)
  const isInline = inline === true || (inline !== false && !className);

  // Handle Inline Code - return <code> element (valid inside <p>)
  if (isInline) {
    return (
      <code className={`${className || ''} bg-paper-200 dark:bg-cyber-800 px-1.5 py-0.5 rounded text-sm text-cyan-700 dark:text-cyan-400 font-mono`} {...props}>
        {children}
      </code>
    );
  }

  // Handle Mermaid Block
  if (isMermaid) {
    const codeText = extractText(children);
    return <MermaidRenderer code={codeText} isDark={isDark} />;
  }

  // Handle Standard Code Block
  const handleCopy = async () => {
    const text = extractText(children);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { console.error(err); }
  };

  return (
    <div className="my-6 rounded-xl border border-paper-200 dark:border-cyber-700 bg-[#282c34] overflow-hidden shadow-lg group">
      {/* Code Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#21252b] border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono ml-2 select-none">
            {language}
          </span>
        </div>
        <div className="flex items-center gap-2">
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
            <span className={copied ? 'text-emerald-400' : ''}>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Code Content */}
      <div className={`relative p-0 ${wrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto'}`}>
        <pre className={`!m-0 !p-4 !bg-transparent text-sm font-mono leading-relaxed text-gray-300 ${wrap ? '!whitespace-pre-wrap' : ''}`} {...props}>
          <code className={className || 'language-text'} style={{ textShadow: 'none' }}>
            {children}
          </code>
        </pre>
      </div>
    </div>
  );
};

/**
 * EnhancedImage: Handles image rendering with error fallback and loading state
 */
const EnhancedImage = ({ src, alt, ...props }: any) => {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Reset state when src changes
  useEffect(() => {
    setError(false);
    setLoading(true);
  }, [src]);

  if (error) {
    return (
      <div className="my-4 p-4 rounded-lg bg-slate-100 dark:bg-cyber-800 border border-slate-200 dark:border-cyber-700 flex items-center gap-3 text-slate-500 dark:text-slate-400">
        <ImageOff size={24} className="text-slate-400 dark:text-slate-500" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-300">Image failed to load</div>
          <div className="text-xs truncate opacity-70" title={src}>{alt || src}</div>
        </div>
      </div>
    );
  }

  return (
    <span className="block my-4 relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-cyber-800 rounded-lg animate-pulse">
          <span className="text-xs text-slate-400">Loading...</span>
        </div>
      )}
      <img
        src={src}
        alt={alt || ''}
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
        className={`max-w-full h-auto rounded-lg shadow-md border border-paper-200 dark:border-cyber-700 transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}
        {...props}
      />
      {alt && !loading && (
        <span className="block mt-2 text-center text-xs text-slate-500 dark:text-slate-400 italic">{alt}</span>
      )}
    </span>
  );
};


export const Preview: React.FC<PreviewProps> = ({ content }) => {
  const [renderHtml, setRenderHtml] = useState(false);

  // Simple heuristic to detect if the content contains HTML tags
  const hasHtml = useMemo(() => {
    return /<[a-z]+(\s+[^>]*)?\/?>/i.test(content) || /<\/[a-z]+>/i.test(content);
  }, [content]);

  return (
    <div className="h-full w-full bg-paper-50 dark:bg-cyber-900 relative flex flex-col transition-colors duration-300">
      
      {/* HTML Toggle Header - Only shown if HTML is detected */}
      {hasHtml && (
         <div className="absolute top-4 right-6 z-20 flex items-center gap-2 bg-white/90 dark:bg-cyber-800/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm border border-paper-200 dark:border-cyber-700 animate-fadeIn">
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

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="prose prose-lg max-w-none dark:prose-invert">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm, remarkMath]} 
            rehypePlugins={[
              // Use rehype-highlight for syntax coloring, but our component handles the wrapper UI
              rehypeHighlight, 
              rehypeKatex,
              ...(renderHtml ? [rehypeRaw] : [])
            ]}
            components={{
              // Override pre to simply pass through children, as our 'code' component handles the block wrapper
              pre: ({children}) => <>{children}</>,
              // Custom Code Block Handler
              code: EnhancedCodeBlock,
              // Custom Image Handler with error fallback
              img: EnhancedImage
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};
