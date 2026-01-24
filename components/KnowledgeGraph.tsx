
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { ZoomIn, ZoomOut, RotateCcw, Download, X, FileJson, Image, ChevronDown } from 'lucide-react';
import { GraphData, Theme } from '../types';
import Tooltip from './Tooltip';
import { translations, Language } from '../utils/translations';

interface KnowledgeGraphProps {
  data: GraphData;
  theme: Theme;
  onNodeClick?: (nodeId: string) => void;
  language?: Language;
}

interface SelectedNode {
  id: string;
  label: string;
  group: number;
  val: number;
  connections: { label: string; type: 'source' | 'target' }[];
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = React.memo(({ data, theme, onNodeClick, language = 'en' }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [focusedNodeIndex, setFocusedNodeIndex] = useState<number>(-1);
  const t = translations[language];

  // CRITICAL FIX: Use ref for callback to avoid restarting simulation when parent re-renders (e.g. toast notification)
  const onNodeClickRef = useRef(onNodeClick);

  // Keep ref in sync with prop
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

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
  }, [data, focusedNodeIndex]);

  // Helper to highlight node at index (simplified version)
  const highlightNodeAtIndex = (index: number, highlight: boolean) => {
    if (!svgRef.current || !data?.nodes?.[index]) return;
    // Note: Full D3 highlight implementation would require storing refs to D3 selections
    // For now, we just track the focused index visually
  };

  // Helper to select node by index
  const selectNodeByIndex = (index: number) => {
    if (!data?.nodes?.[index]) return;
    const node = data.nodes[index];

    // Find connections
    const connections: { label: string; type: 'source' | 'target' }[] = [];
    data.links.forEach((l: any) => {
      const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
      const targetId = typeof l.target === 'object' ? l.target.id : l.target;
      if (sourceId === node.id) {
        const targetNode = data.nodes.find((n: any) => n.id === targetId);
        if (targetNode) connections.push({ label: (targetNode as any).label, type: 'target' });
      }
      if (targetId === node.id) {
        const sourceNode = data.nodes.find((n: any) => n.id === sourceId);
        if (sourceNode) connections.push({ label: (sourceNode as any).label, type: 'source' });
      }
    });

    setSelectedNode({
      id: node.id,
      label: node.label,
      group: node.group,
      val: node.val || 1,
      connections
    });

    if (onNodeClickRef.current) onNodeClickRef.current(node.id);
  };

  // Clear all highlights
  const clearHighlights = () => {
    // Reset any D3 highlights here
  };

  // Attach keyboard event listener
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown as any);
      container.setAttribute('tabindex', '0');
      container.setAttribute('role', 'application');
      container.setAttribute('aria-label', 'Knowledge graph. Use arrow keys to navigate between nodes, Enter to select, Escape to deselect, +/- to zoom, 0 to reset.');
      return () => container.removeEventListener('keydown', handleKeyDown as any);
    }
  }, [handleKeyDown]);

  // Use CSS Variables for Theme Support
  const isDark = theme === 'dark';

  // Get computed color values
  const getColor = (cssVar: string, fallback: string): string => {
    if (typeof document === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    if (value && value.includes(' ')) {
      // Convert space-separated RGB to comma-separated
      return `rgb(${value.split(' ').join(', ')})`;
    }
    return value || fallback;
  };

  useEffect(() => {
    // Safety check for data
    if (!data || !data.nodes || data.nodes.length === 0 || !svgRef.current || !containerRef.current) {
        if (svgRef.current) d3.select(svgRef.current).selectAll("*").remove();
        return;
    }

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Deep clone data to avoid D3 mutation issues
    const nodes = data.nodes.map(d => ({ ...d }));
    const links = data.links.map(d => ({ ...d }));

    // Get theme colors
    const primaryColor = getColor('--primary-500', '#06b6d4');
    const secondaryColor = getColor('--secondary-500', '#8b5cf6');
    const textColor = getColor('--text-primary', isDark ? '#f8fafc' : '#1e293b');
    const neutralColor = getColor('--neutral-500', '#64748b');
    const bgPanelColor = getColor('--bg-panel', isDark ? '#1e293b' : '#f1f5f9');

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Create a container group for zoom/pan
    const g = svg.append("g");

    // Setup Force Simulation
    // Optimization: Increased alphaDecay to 0.05 to make the graph settle faster
    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((d: any) => (d.val || 5) * 3 + 20).iterations(2))
      .alphaDecay(0.05);

    // --- RENDER ELEMENTS ---

    // Define Arrowhead
    svg.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", neutralColor)
      .style("opacity", 0.6);

    // Links
    const link = g.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", neutralColor)
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", 1.5);

    // Node Groups
    const node = g.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
      );

    // Node Circles with glow effect
    node.append("circle")
      .attr("class", "node-glow")
      .attr("r", (d: any) => 12 + Math.sqrt(d.val || 1) * 3)
      .attr("fill", (d: any) => d.group === 1 ? secondaryColor : primaryColor)
      .attr("opacity", 0.3)
      .attr("filter", "blur(4px)");

    // Main Node Circles
    node.append("circle")
      .attr("class", "node-circle")
      .attr("r", (d: any) => 8 + Math.sqrt(d.val || 1) * 3)
      .attr("fill", (d: any) => d.group === 1 ? secondaryColor : primaryColor)
      .attr("stroke", bgPanelColor)
      .attr("stroke-width", 2)
      .attr("fill-opacity", 0.9);

    // Node Labels
    node.append("text")
      .text((d: any) => d.label)
      .attr("x", 14)
      .attr("y", 4)
      .style("font-family", "Inter, sans-serif")
      .style("font-size", "11px")
      .style("font-weight", "600")
      .style("fill", textColor)
      .style("pointer-events", "none")
      .style("text-shadow", isDark ? "0 1px 4px rgba(0,0,0,0.9)" : "0 1px 4px rgba(255,255,255,0.9)")
      .style("opacity", 0)
      .transition().duration(800).style("opacity", 1);

    // Highlight connected nodes on hover
    const highlightConnections = (d: any, highlight: boolean) => {
      const connectedNodeIds = new Set<string>();
      connectedNodeIds.add(d.id);

      links.forEach((l: any) => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        if (sourceId === d.id) connectedNodeIds.add(targetId);
        if (targetId === d.id) connectedNodeIds.add(sourceId);
      });

      // Update link opacity
      link.attr("stroke-opacity", (l: any) => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        if (!highlight) return 0.4;
        return (sourceId === d.id || targetId === d.id) ? 1 : 0.1;
      }).attr("stroke-width", (l: any) => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        if (!highlight) return 1.5;
        return (sourceId === d.id || targetId === d.id) ? 3 : 1;
      });

      // Update node opacity
      node.select(".node-circle")
        .attr("fill-opacity", (n: any) => {
          if (!highlight) return 0.9;
          return connectedNodeIds.has(n.id) ? 1 : 0.3;
        });

      node.select(".node-glow")
        .attr("opacity", (n: any) => {
          if (!highlight) return 0.3;
          return connectedNodeIds.has(n.id) ? 0.5 : 0.1;
        });

      node.select("text")
        .style("opacity", (n: any) => {
          if (!highlight) return 1;
          return connectedNodeIds.has(n.id) ? 1 : 0.3;
        });
    };

    // Hover interactions
    node.on("mouseenter", (event, d: any) => {
      highlightConnections(d, true);
    }).on("mouseleave", (event, d: any) => {
      highlightConnections(d, false);
    });

    // Click interaction - show node details
    node.on("click", (event, d: any) => {
      event.stopPropagation();

      // Find connections
      const connections: { label: string; type: 'source' | 'target' }[] = [];
      links.forEach((l: any) => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        if (sourceId === d.id) {
          const targetNode = nodes.find((n: any) => n.id === targetId);
          if (targetNode) connections.push({ label: (targetNode as any).label, type: 'target' });
        }
        if (targetId === d.id) {
          const sourceNode = nodes.find((n: any) => n.id === sourceId);
          if (sourceNode) connections.push({ label: (sourceNode as any).label, type: 'source' });
        }
      });

      setSelectedNode({
        id: d.id,
        label: d.label,
        group: d.group,
        val: d.val || 1,
        connections
      });

      // Keep highlight on selected node
      highlightConnections(d, true);

      // Safe invocation via ref prevents useEffect re-trigger logic
      if (onNodeClickRef.current) onNodeClickRef.current(d.id);
    });

    // Click on background to deselect
    svg.on("click", () => {
      setSelectedNode(null);
    });

    node.append("title").text((d: any) => d.label);

    // Tick Update
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [data, theme, isDark]); // onNodeClick REMOVED from dependency array

  const handleZoom = (factor: number) => {
    if (svgRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(d3.zoom<SVGSVGElement, unknown>().scaleBy, factor);
    }
  };

  const handleReset = () => {
    if (svgRef.current && containerRef.current) {
        d3.select(svgRef.current).transition().duration(750).call(d3.zoom<SVGSVGElement, unknown>().transform, d3.zoomIdentity);
    }
  };

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
    
    const img = new (window.Image || (window as any).HTMLImageElement)();
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
        source: (l.source as any)?.id || l.source,
        target: (l.target as any)?.id || l.target,
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
                <Image size={16} className="text-cyan-500" />
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
