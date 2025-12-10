
import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Theme } from '../types';
import { ZoomIn, ZoomOut, Maximize, AlertTriangle, Download } from 'lucide-react';
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
  const [scale, setScale] = useState(1.0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const t = translations[language];

  useEffect(() => {
    // Configuration for "Vibrant Dark Bubble" Look (matching user image)
    // We force a dark base because the specific requested image style is dark.
    
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'loose',
      fontFamily: '"Inter", "Segoe UI", sans-serif', 
      flowchart: { htmlLabels: true },
      mindmap: {
        useMaxWidth: false,
        padding: 70, // Padding to prevent overlap
      },
      themeVariables: {
        primaryColor: '#ea580c', // Orange Root
        primaryTextColor: '#ffffff',
        lineColor: '#475569', // Slate-600 lines
        
        // These will be overridden by CSS, but setting defaults helps
        mainBkg: '#1e293b', 
        nodeBorder: '#475569',
        fontFamily: '"Inter", "Segoe UI", sans-serif',
        fontSize: '14px',
      }
    });
  }, [theme]);

  useEffect(() => {
    const renderChart = async () => {
      if (!containerRef.current || !content) return;
      setError(null);
      
      try {
        // Wait for fonts to be ready to ensure Mermaid calculates text width correctly
        await document.fonts.ready;

        // Sanitize: Remove wikilink brackets that might have slipped through AI generation
        // Mermaid mindmap syntax often breaks on [[ ]]
        const sanitizedContent = content.replace(/\[\[([^\]]+)\]\]/g, '$1');

        const id = `mermaid-${Date.now()}`;
        // Attempt to render
        const { svg: generatedSvg } = await mermaid.render(id, sanitizedContent);
        
        // Cleanup SVG attributes that restrict sizing
        const cleanSvg = generatedSvg
          .replace(/max-width:[^;]+;/g, '')
          .replace(/height:[^;]+;/g, '')
          .replace(/style="[^"]*"/, 'style="overflow: visible;"');

        setSvg(cleanSvg);
        // Reset view on new content
        setScale(1.0);
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

  const handleDownload = () => {
    if (!containerRef.current) return;
    const svgEl = containerRef.current.querySelector('svg');
    if (!svgEl) return;

    // 1. Clone
    const clonedSvg = svgEl.cloneNode(true) as SVGElement;

    // 2. Inject Styles for Export (Self-contained) to match the UI
    const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.textContent = `
      text { font-family: 'Inter', sans-serif; font-weight: 600; text-anchor: middle; }
      
      /* Root Node (Orange) */
      .node-0 rect, .mindmap-node:first-child rect {
        fill: #ea580c !important; 
        stroke: #9a3412 !important;
        stroke-width: 4px !important;
        rx: 100px !important;
        ry: 100px !important;
      }
      .node-0 text, .mindmap-node:first-child text {
        fill: #ffffff !important;
        font-size: 22px !important;
        font-weight: 800 !important;
      }
      
      /* Base Child Style (Pills) */
      .mindmap-node rect {
        stroke-width: 0px !important;
        rx: 999px !important; /* Full capsule */
        ry: 999px !important;
        height: 40px !important;
      }
      .mindmap-node text {
        fill: #ffffff !important;
        font-size: 14px !important;
        font-weight: 600 !important;
      }

      /* Color Cycling for Branches (Matches Screen) */
      .mindmap-node:nth-of-type(5n+1) rect { fill: #15803d !important; } /* Green */
      .mindmap-node:nth-of-type(5n+2) rect { fill: #7e22ce !important; } /* Purple */
      .mindmap-node:nth-of-type(5n+3) rect { fill: #1d4ed8 !important; } /* Blue */
      .mindmap-node:nth-of-type(5n+4) rect { fill: #0f766e !important; } /* Teal */
      .mindmap-node:nth-of-type(5n+5) rect { fill: #ca8a04 !important; } /* Yellow */

      /* Lines */
      .edge-path path {
        stroke: #64748b !important;
        stroke-width: 2px !important;
        fill: none;
      }
    `;
    clonedSvg.prepend(styleEl);

    // 3. Add Background Rect for Export (Dark Blue)
    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgRect.setAttribute("width", "10000");
    bgRect.setAttribute("height", "10000");
    bgRect.setAttribute("x", "-5000");
    bgRect.setAttribute("y", "-5000");
    bgRect.setAttribute("fill", "#0f172a"); // Dark Slate Background
    if (clonedSvg.firstChild) clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);

    // 4. Serialize & Download
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(clonedSvg);
    
    if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    
    const url = "data:image/svg+xml;charset=utf-8,"+encodeURIComponent('<?xml version="1.0" standalone="no"?>\r\n' + source);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = "mindmap_zhangnote.svg";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  return (
    <div className="w-full h-full bg-[#0f172a] overflow-hidden relative group font-sans selection:bg-cyan-500/30">
      {/* Background Texture (Dark Grid) */}
      <div className="absolute inset-0 pointer-events-none opacity-20" 
           style={{ 
             backgroundImage: `linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)`, 
             backgroundSize: '40px 40px' 
           }}>
      </div>
      
      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,#020617_100%)] opacity-80"></div>

      {/* INJECTED CUSTOM CSS FOR NEON BUBBLE STYLE */}
      <style>{`
        /* --- NEON BUBBLE STYLE --- */
        
        /* 1. Root Node: Big Orange Circle */
        svg[id^="mermaid-"] .node-0 rect, svg[id^="mermaid-"] .mindmap-node:first-child rect {
          fill: #ea580c !important; /* Orange-600 */
          stroke: #fdba74 !important; /* Orange-300 ring */
          stroke-width: 4px !important;
          rx: 100px !important; 
          ry: 100px !important;
          filter: drop-shadow(0px 0px 20px rgba(234, 88, 12, 0.4));
        }
        svg[id^="mermaid-"] .node-0 text, svg[id^="mermaid-"] .mindmap-node:first-child text {
           fill: #ffffff !important;
           font-weight: 800 !important;
           font-size: 20px !important;
        }

        /* 2. Child Nodes: Color Cycle Pills */
        svg[id^="mermaid-"] .mindmap-node rect {
          rx: 999px !important; /* Capsule/Pill Shape */
          ry: 999px !important;
          stroke-width: 0px !important;
          filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.3));
          transition: all 0.3s ease;
        }
        
        svg[id^="mermaid-"] .mindmap-node text {
           fill: #ffffff !important;
           font-weight: 600 !important;
           font-size: 14px !important;
        }

        /* COLOR CYCLING: Green -> Purple -> Blue -> Teal -> Yellow */
        svg[id^="mermaid-"] .mindmap-node:nth-of-type(5n+1) rect { fill: #15803d !important; }
        svg[id^="mermaid-"] .mindmap-node:nth-of-type(5n+2) rect { fill: #7e22ce !important; }
        svg[id^="mermaid-"] .mindmap-node:nth-of-type(5n+3) rect { fill: #1d4ed8 !important; }
        svg[id^="mermaid-"] .mindmap-node:nth-of-type(5n+4) rect { fill: #0f766e !important; }
        svg[id^="mermaid-"] .mindmap-node:nth-of-type(5n+5) rect { fill: #ca8a04 !important; }

        /* Hover Effect: Brighten & Scale */
        svg[id^="mermaid-"] .mindmap-node:hover rect {
           filter: brightness(1.2) drop-shadow(0px 0px 10px rgba(255,255,255,0.3));
           transform: scale(1.05);
           cursor: pointer;
        }

        /* 3. Connectors: Subtle Slate */
        svg[id^="mermaid-"] .edge-path path {
          stroke: #64748b !important;
          stroke-width: 2px !important;
          stroke-opacity: 0.5;
        }
      `}</style>

      {/* Controls */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
        <button onClick={handleDownload} className="p-2 bg-slate-800 rounded-lg shadow-lg border border-slate-700 hover:bg-slate-700 text-slate-200 transition-colors" title="Download SVG">
            <Download size={20} />
        </button>
        <div className="h-px bg-slate-700 my-1"></div>
        <button onClick={() => setScale(s => Math.min(8, s + 0.2))} className="p-2 bg-slate-800 rounded-lg shadow-lg border border-slate-700 hover:bg-slate-700 text-slate-200"><ZoomIn size={20} /></button>
        <button onClick={() => { setScale(1.0); setPosition({x:0, y:0}); }} className="p-2 bg-slate-800 rounded-lg shadow-lg border border-slate-700 hover:bg-slate-700 text-slate-200"><Maximize size={20} /></button>
        <button onClick={() => setScale(s => Math.max(0.1, s - 0.2))} className="p-2 bg-slate-800 rounded-lg shadow-lg border border-slate-700 hover:bg-slate-700 text-slate-200"><ZoomOut size={20} /></button>
      </div>

      <div className="absolute top-4 left-4 z-20 px-3 py-1 bg-black/50 backdrop-blur rounded text-xs font-mono text-slate-400 pointer-events-none border border-white/5">
        {Math.round(scale * 100)}% • {t.dragToPan}
      </div>
      
      {/* Content */}
      {error ? (
        <div className="flex flex-col items-center justify-center h-full text-red-500 p-8 text-center animate-fadeIn z-10 relative">
            <AlertTriangle size={48} className="mb-4" />
            <h3 className="font-bold text-lg">{t.mindMapError}</h3>
            <p className="opacity-80 mt-2 mb-4 text-sm max-w-md bg-red-900/20 p-2 rounded font-mono">{error}</p>
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
                className={`mermaid-container [&>svg]:overflow-visible`}
            />
        </div>
      )}
    </div>
  );
};
