
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Download, X, FileJson, Image as ImageIcon, ChevronDown } from 'lucide-react';
import { GraphData, Theme } from '../types';
import Tooltip from './Tooltip';
import { useKnowledgeGraphSimulation, type SelectedNode } from './KnowledgeGraph/useKnowledgeGraphSimulation';
import { translations, Language } from '../utils/translations';

interface KnowledgeGraphProps {
  data: GraphData;
  theme: Theme;
  onNodeClick?: (nodeId: string) => void;
  language?: Language;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = React.memo(({ data, theme, onNodeClick, language = 'en' }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [focusedNodeIndex, setFocusedNodeIndex] = useState<number>(-1);
  const t = translations[language];
  const {
    handleZoom,
    handleReset,
    highlightNodeAtIndex,
    selectNodeByIndex,
    clearHighlights,
  } = useKnowledgeGraphSimulation({
    data,
    theme,
    svgRef,
    containerRef,
    onNodeSelect: setSelectedNode,
    onClearSelection: () => setSelectedNode(null),
    onNodeClick,
  });

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!data?.nodes?.length) return;

    const nodeCount = data.nodes.length;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        setFocusedNodeIndex(prev => {
          const next = prev < nodeCount - 1 ? prev + 1 : 0;
          highlightNodeAtIndex(next, true);
          return next;
        });
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        setFocusedNodeIndex(prev => {
          const next = prev > 0 ? prev - 1 : nodeCount - 1;
          highlightNodeAtIndex(next, true);
          return next;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedNodeIndex >= 0 && focusedNodeIndex < nodeCount) {
          selectNodeByIndex(focusedNodeIndex);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setSelectedNode(null);
        setFocusedNodeIndex(-1);
        clearHighlights();
        break;
      case '+':
      case '=':
        e.preventDefault();
        handleZoom(1.3);
        break;
      case '-':
        e.preventDefault();
        handleZoom(0.7);
        break;
      case '0':
        e.preventDefault();
        handleReset();
        break;
    }
  }, [data, focusedNodeIndex, highlightNodeAtIndex, selectNodeByIndex, clearHighlights, handleZoom, handleReset]);

  // Attach keyboard event listener
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);
      container.addEventListener('keydown', onKeyDown);
      container.setAttribute('tabindex', '0');
      container.setAttribute('role', 'application');
      container.setAttribute('aria-label', 'Knowledge graph. Use arrow keys to navigate between nodes, Enter to select, Escape to deselect, +/- to zoom, 0 to reset.');
      return () => container.removeEventListener('keydown', onKeyDown);
    }
  }, [handleKeyDown]);

  const handleDownload = () => {
    if (!svgRef.current || !containerRef.current) return;
    
    const svgEl = svgRef.current;
    // Deep clone to prevent modifying the live graph
    const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    clonedSvg.setAttribute("width", width.toString());
    clonedSvg.setAttribute("height", height.toString());
    clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    
    // Inject Computed Theme Colors so download looks correct standalone
    const computedStyle = getComputedStyle(document.documentElement);
    const vars = [
        '--bg-main', '--bg-panel', '--bg-element', '--border-main',
        '--text-primary', '--text-secondary', 
        '--primary-500', '--primary-600', '--secondary-500',
        '--neutral-500', '--neutral-600'
    ];
    
    let cssVariables = ':root {';
    vars.forEach(v => {
        cssVariables += `${v}: ${computedStyle.getPropertyValue(v)};`;
    });
    cssVariables += '}';
    
    const style = document.createElement('style');
    style.textContent = `
      ${cssVariables}
      text { font-family: 'Inter', sans-serif; }
    `;
    clonedSvg.prepend(style);
    
    // FIX: Add Background Rectangle so transparency doesn't look broken in viewers
    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgRect.setAttribute("width", "100%");
    bgRect.setAttribute("height", "100%");
    bgRect.setAttribute("fill", computedStyle.getPropertyValue('--bg-main'));
    
    if (clonedSvg.firstChild) {
        clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);
    } else {
        clonedSvg.appendChild(bgRect);
    }

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(clonedSvg);
    
    // Add Namespace if missing (common browser issue)
    if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    
    // Prepend XML declaration
    source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
    
    const url = "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(source);
    const link = document.createElement("a");
    link.href = url;
    link.download = `knowledge_graph_${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPNG = async () => {
    if (!svgRef.current || !containerRef.current) return;
    
    const svgEl = svgRef.current;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-main') || '#f1f5f9';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        
        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `knowledge_graph_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
    setShowExportMenu(false);
  };

  const handleExportJSON = () => {
    const exportData = {
      nodes: data.nodes.map(n => ({
        id: n.id,
        label: n.label,
        group: n.group,
        value: n.val
      })),
      links: data.links.map(l => ({
        source: l.source,
        target: l.target,
        relationship: l.relationship
      })),
      exportedAt: new Date().toISOString(),
      totalNodes: data.nodes.length,
      totalLinks: data.links.length
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `knowledge_graph_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  return (
    <div ref={containerRef} className="w-full h-full relative bg-paper-50 dark:bg-cyber-900 overflow-hidden select-none group">
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-10 pointer-events-none"
           style={{
             backgroundImage: `radial-gradient(rgb(var(--neutral-600)) 1px, transparent 1px)`,
             backgroundSize: '20px 20px'
           }}>
      </div>

      <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Legend */}
      <div className="absolute top-4 left-4 p-3 bg-white/80 dark:bg-cyber-800/80 backdrop-blur rounded-lg border border-paper-200 dark:border-cyber-700 text-xs shadow-sm pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-full bg-cyan-500 border border-white/20"></span>
              <span className="text-slate-600 dark:text-slate-300">Entity</span>
          </div>
          <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-violet-500 border border-white/20"></span>
              <span className="text-slate-600 dark:text-slate-300">Core Concept</span>
          </div>
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div className="absolute top-4 right-20 w-64 p-4 bg-white/95 dark:bg-cyber-800/95 backdrop-blur rounded-lg border border-paper-200 dark:border-cyber-700 shadow-lg z-20">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: selectedNode.group === 1 ? '#8b5cf6' : '#06b6d4' }}
              />
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                {selectedNode.label}
              </h3>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="p-1 hover:bg-slate-100 dark:hover:bg-cyber-700 rounded transition-colors"
            >
              <X size={14} className="text-slate-500" />
            </button>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-cyber-700">
              {selectedNode.group === 1 ? 'Core Concept' : 'Entity'}
            </span>
            <span className="ml-2">Weight: {selectedNode.val}</span>
          </div>

          {selectedNode.connections.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
                Connections ({selectedNode.connections.length})
              </h4>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {selectedNode.connections.map((conn, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${conn.type === 'source' ? 'bg-green-400' : 'bg-blue-400'}`} />
                    <span className="truncate">{conn.label}</span>
                    <span className="text-slate-400 dark:text-slate-500 text-[10px]">
                      {conn.type === 'source' ? '← from' : '→ to'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedNode.connections.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">
              No direct connections
            </p>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-10 opacity-60 group-hover:opacity-100 transition-opacity">
        {/* Export Menu */}
        <div className="relative">
          <Tooltip content={t.tooltips?.exportGraph || "Export Graph"}>
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1"
              aria-label={t.tooltips?.exportGraph || "Export Graph"}
            >
              <Download size={20} />
              <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
          </Tooltip>
          
          {showExportMenu && (
            <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 overflow-hidden min-w-40">
              <button
                onClick={handleDownload}
                className="w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 flex items-center gap-2 text-slate-700 dark:text-slate-200"
              >
                <FileJson size={16} className="text-violet-500" />
                Export SVG
              </button>
              <button
                onClick={handleDownloadPNG}
                className="w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 flex items-center gap-2 text-slate-700 dark:text-slate-200"
              >
                <ImageIcon size={16} className="text-cyan-500" />
                Export PNG
              </button>
              <button
                onClick={handleExportJSON}
                className="w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 flex items-center gap-2 text-slate-700 dark:text-slate-200"
              >
                <FileJson size={16} className="text-emerald-500" />
                Export JSON
              </button>
            </div>
          )}
        </div>
        
        <div className="h-px bg-paper-300 dark:bg-cyber-600 my-1"></div>
        <Tooltip content={t.tooltips?.zoomIn || "Zoom In"}>
          <button
            onClick={() => handleZoom(1.3)}
            className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 transition-colors"
            aria-label={t.tooltips?.zoomIn || "Zoom In"}
          >
            <ZoomIn size={20} />
          </button>
        </Tooltip>
        <Tooltip content={t.tooltips?.resetView || "Reset View"}>
          <button
            onClick={handleReset}
            className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 transition-colors"
            aria-label={t.tooltips?.resetView || "Reset View"}
          >
            <RotateCcw size={20} />
          </button>
        </Tooltip>
        <Tooltip content={t.tooltips?.zoomOut || "Zoom Out"}>
          <button
            onClick={() => handleZoom(0.7)}
            className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 transition-colors"
            aria-label={t.tooltips?.zoomOut || "Zoom Out"}
          >
            <ZoomOut size={20} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
});
