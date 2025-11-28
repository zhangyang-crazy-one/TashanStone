
import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Theme } from '../types';
import { ZoomIn, ZoomOut, Maximize, AlertTriangle } from 'lucide-react';
import { translations, Language } from '../utils/translations';

interface MindMapProps {
  content: string; // The Mermaid code
  theme: Theme;
  language?: Language;
}

export const MindMap: React.FC<MindMapProps> = ({ content, theme, language = 'en' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const t = translations[language];

  useEffect(() => {
    // Cyber/Neon Theme Configuration
    const isDark = theme === 'dark';
    
    // Vibrant Neon Palette
    const primaryColor = isDark ? '#22d3ee' : '#0891b2'; // Cyan-400 : Cyan-700
    const secondaryColor = isDark ? '#a78bfa' : '#7c3aed'; // Violet-400 : Violet-700
    const tertiaryColor = isDark ? '#34d399' : '#059669'; // Emerald-400 : Emerald-700
    const bgColor = isDark ? '#0f172a' : '#ffffff'; // Slate-900 : White
    const textColor = isDark ? '#f1f5f9' : '#1e293b'; // Slate-100 : Slate-800
    const lineColor = isDark ? '#475569' : '#94a3b8'; // Slate-600 : Slate-400

    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'loose',
      fontFamily: 'JetBrains Mono, monospace',
      flowchart: { htmlLabels: true },
      mindmap: {
        useMaxWidth: false,
        padding: 40, // More space
      },
      themeVariables: {
        primaryColor: primaryColor,
        primaryTextColor: textColor,
        primaryBorderColor: primaryColor,
        lineColor: lineColor,
        secondaryColor: secondaryColor,
        tertiaryColor: tertiaryColor,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '18px', // Larger font for readability
        
        // Specific MindMap Variables to enforce the look
        mindmapShapeBorderColor: primaryColor,
        mindmapBkgColor: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)',
        mainBkg: bgColor,
        nodeBorder: primaryColor,
        clusterBkg: 'rgba(255,255,255,0.05)',
      }
    });
  }, [theme]);

  useEffect(() => {
    const renderChart = async () => {
      if (!containerRef.current || !content) return;
      setError(null);
      
      try {
        const id = `mermaid-${Date.now()}`;
        // Attempt to render
        const { svg: generatedSvg } = await mermaid.render(id, content);
        
        // Style injection to fix sizing and add glow
        const cleanSvg = generatedSvg
          .replace(/max-width:[^;]+;/g, '')
          .replace(/height:[^;]+;/g, '')
          .replace(/style="[^"]*"/, 'style="overflow: visible;"');

        setSvg(cleanSvg);
        // Reset view on new content
        setScale(1.2);
        setPosition({ x: 0, y: 0 });
      } catch (e: any) {
        console.error("Mermaid Render Error", e);
        setError(e.message || "Invalid Syntax");
      }
    };
    
    renderChart();
  }, [content, theme]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
       e.preventDefault();
       const s = Math.exp(-e.deltaY * 0.001);
       setScale(prev => Math.min(Math.max(0.1, prev * s), 8));
    }
  };

  return (
    <div className="w-full h-full bg-paper-50 dark:bg-cyber-900 overflow-hidden relative group font-mono selection:bg-cyan-500/30">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ 
             backgroundImage: `linear-gradient(${theme === 'dark' ? '#334155' : '#cbd5e1'} 1px, transparent 1px), linear-gradient(90deg, ${theme === 'dark' ? '#334155' : '#cbd5e1'} 1px, transparent 1px)`, 
             backgroundSize: '40px 40px' 
           }}>
      </div>
      
      {/* Radial fade for background */}
      <div className="absolute inset-0 pointer-events-none bg-radial-fade"></div>

      {/* Controls */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setScale(s => Math.min(8, s + 0.2))} className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200"><ZoomIn size={20} /></button>
        <button onClick={() => { setScale(1.2); setPosition({x:0, y:0}); }} className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200"><Maximize size={20} /></button>
        <button onClick={() => setScale(s => Math.max(0.1, s - 0.2))} className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200"><ZoomOut size={20} /></button>
      </div>

      <div className="absolute top-4 left-4 z-20 px-3 py-1 bg-white/50 dark:bg-black/50 backdrop-blur rounded text-xs font-mono text-slate-500 pointer-events-none border border-black/5 dark:border-white/5">
        {Math.round(scale * 100)}% • {t.dragToPan}
      </div>
      
      {/* Content */}
      {error ? (
        <div className="flex flex-col items-center justify-center h-full text-red-500 p-8 text-center animate-fadeIn z-10 relative">
            <AlertTriangle size={48} className="mb-4" />
            <h3 className="font-bold text-lg">{t.mindMapError}</h3>
            <p className="opacity-80 mt-2 mb-4 text-sm max-w-md bg-red-50 dark:bg-red-900/20 p-2 rounded font-mono">{error}</p>
        </div>
      ) : (
        <div 
            ref={containerRef}
            className="w-full h-full cursor-grab active:cursor-grabbing flex items-center justify-center relative z-10"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
        >
            <div 
                style={{ 
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    transition: isDragging.current ? 'none' : 'transform 0.1s ease-out'
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
                className={`mermaid-container [&>svg]:overflow-visible [&_g.node]:transition-all [&_path]:stroke-[2px] ${theme === 'dark' ? '[&_path]:stroke-cyan-400 [&_rect]:stroke-cyan-500 [&_rect]:stroke-[2px]' : ''}`}
            />
        </div>
      )}
    </div>
  );
};
