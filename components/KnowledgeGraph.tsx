
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GraphData, Theme } from '../types';
import { ZoomIn, ZoomOut, RotateCcw, Share2, Grid, Circle, Network, ArrowDownCircle, MousePointer2 } from 'lucide-react';

interface KnowledgeGraphProps {
  data: GraphData;
  theme: Theme;
  onNodeClick?: (nodeId: string) => void;
}

type LayoutMode = 'force' | 'circular' | 'grid' | 'hierarchical';

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ data, theme, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<d3.SimulationNodeDatum, undefined> | null>(null);
  
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force');
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const [focusedNode, setFocusedNode] = useState<string | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Use CSS Variables for Theme Support
  const isDark = theme === 'dark';

  const onNodeClickRef = useRef(onNodeClick);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);

  useEffect(() => {
    if (!data || !data.nodes || data.nodes.length === 0 || !svgRef.current || !containerRef.current) {
        if (svgRef.current) d3.select(svgRef.current).selectAll("*").remove();
        return;
    }

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Data clone
    const nodes: any[] = data.nodes.map(d => ({ ...d }));
    const links: any[] = data.links.map(d => ({ ...d }));

    // Neighbor Map for Highlighting
    const linkedByIndex: Record<string, boolean> = {};
    links.forEach(d => {
        linkedByIndex[`${d.source}|${d.target}`] = true;
        linkedByIndex[`${d.target}|${d.source}`] = true;
    });

    const isConnected = (a: string, b: string) => {
        return linkedByIndex[`${a}|${b}`] || a === b;
    };

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Container Group
    const g = svg.append("g");
    
    // Zoom Handler
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    // --- Layout Logic ---
    if (layoutMode === 'force') {
        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id((d: any) => d.id).distance(120))
            .force("charge", d3.forceManyBody().strength(-400))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collide", d3.forceCollide().radius((d: any) => (d.val || 5) * 3 + 15))
            .alphaDecay(0.02);
        
        simulationRef.current = simulation;
    } else {
        // Static Layouts
        if (layoutMode === 'circular') {
            const radius = Math.min(width, height) / 2 - 100;
            const angleStep = (2 * Math.PI) / nodes.length;
            
            nodes.sort((a, b) => (a.group || 0) - (b.group || 0));

            nodes.forEach((node, i) => {
                node.x = width / 2 + radius * Math.cos(i * angleStep);
                node.y = height / 2 + radius * Math.sin(i * angleStep);
            });
        } else if (layoutMode === 'grid') {
            const cols = Math.ceil(Math.sqrt(nodes.length));
            const cellWidth = (width - 100) / cols;
            const cellHeight = (height - 100) / cols;
            
            nodes.forEach((node, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                node.x = 50 + col * cellWidth;
                node.y = 50 + row * cellHeight;
            });
        } else if (layoutMode === 'hierarchical') {
            // Robust Hierarchical Layout (Handling Disconnected Components & Cycles)
            const adj: Record<string, string[]> = {};
            const revAdj: Record<string, string[]> = {};
            
            nodes.forEach(n => { adj[n.id] = []; revAdj[n.id] = []; });
            links.forEach(l => {
                const s = typeof l.source === 'object' ? l.source.id : l.source;
                const t = typeof l.target === 'object' ? l.target.id : l.target;
                if (adj[s]) adj[s].push(t);
                if (revAdj[t]) revAdj[t].push(s);
            });

            const visited = new Set<string>();
            const levels: Record<string, number> = {};
            let maxOverallLevel = 0;

            // Helper to process a component
            const processComponent = (rootId: string) => {
                const queue: {id: string, level: number}[] = [{id: rootId, level: 0}];
                
                while (queue.length > 0) {
                    const { id, level } = queue.shift()!;
                    if (visited.has(id)) continue;
                    visited.add(id);
                    levels[id] = level;
                    if (level > maxOverallLevel) maxOverallLevel = level;

                    if (adj[id]) {
                        adj[id].forEach(targetId => {
                            if (!visited.has(targetId)) queue.push({ id: targetId, level: level + 1 });
                        });
                    }
                }
            };

            // 1. Prioritize nodes with no incoming edges (Roots)
            nodes.forEach(n => {
                if (!visited.has(n.id) && revAdj[n.id].length === 0) {
                    processComponent(n.id);
                }
            });

            // 2. Handle Cycles/Remaining Components (Pick arbitrary unvisited)
            nodes.forEach(n => {
                if (!visited.has(n.id)) {
                    processComponent(n.id);
                }
            });

            // Position by level
            const levelNodes: Record<number, any[]> = {};
            nodes.forEach(n => {
                const l = levels[n.id] !== undefined ? levels[n.id] : 0;
                if (!levelNodes[l]) levelNodes[l] = [];
                levelNodes[l].push(n);
            });

            const levelHeight = (height - 100) / (maxOverallLevel + 1 || 1);

            Object.entries(levelNodes).forEach(([lvl, ns]) => {
                const level = Number(lvl);
                const slotWidth = (width - 100) / (ns.length + 1);
                ns.forEach((n, i) => {
                    n.x = 50 + slotWidth * (i + 1);
                    n.y = 50 + level * levelHeight;
                });
            });
        }
    }

    // --- RENDER ---
    
    // Arrowhead
    svg.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 28) // Offset to not overlap with node
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "rgb(var(--neutral-500))")
      .style("opacity", 0.6);

    const link = g.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "rgb(var(--neutral-500))")
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrowhead)");

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

    node.append("circle")
      .attr("r", (d: any) => 6 + Math.sqrt(d.val || 1) * 3)
      .attr("fill", (d: any) => d.group === 1 ? "rgb(var(--secondary-500))" : "rgb(var(--primary-500))")
      .attr("stroke", "rgb(var(--bg-panel))")
      .attr("stroke-width", 2);

    node.append("text")
      .text((d: any) => d.label)
      .attr("x", 14)
      .attr("y", 4)
      .style("font-family", "Inter, sans-serif")
      .style("font-size", "11px")
      .style("font-weight", "600")
      .style("fill", "rgb(var(--text-primary))")
      .style("pointer-events", "none")
      .style("text-shadow", isDark ? "0 1px 4px rgba(0,0,0,0.9)" : "0 1px 4px rgba(255,255,255,0.9)");

    // Interaction Functions
    const updateHighlight = (hoverId: string | null, focusId: string | null) => {
        if (!hoverId && !focusId) {
            node.transition().duration(200).style("opacity", 1);
            link.transition().duration(200).style("stroke-opacity", 0.4);
            return;
        }

        const primaryId = hoverId || focusId;

        node.transition().duration(200).style("opacity", (o: any) => {
            return isConnected(primaryId!, o.id) ? 1 : 0.1;
        });

        link.transition().duration(200)
            .style("stroke-opacity", (o: any) => (o.source.id === primaryId || o.target.id === primaryId) ? 1 : 0.05)
            .style("stroke", (o: any) => (o.source.id === primaryId || o.target.id === primaryId) ? "rgb(var(--primary-500))" : "rgb(var(--neutral-500))");
    };

    // Hover Interaction
    node.on("mouseover", (event, d: any) => {
        if (!focusedNode) {
            setHighlightedNode(d.id);
            updateHighlight(d.id, null);
        }
    }).on("mouseout", () => {
        if (!focusedNode) {
            setHighlightedNode(null);
            updateHighlight(null, null);
        }
    });

    // Click / Double Click
    node.on("click", (event, d: any) => {
        // Prevent drag click propagation issues
        if (event.defaultPrevented) return;
        if (onNodeClickRef.current) onNodeClickRef.current(d.id);
    });

    node.on("dblclick", (event, d: any) => {
        if (focusedNode === d.id) {
            setFocusedNode(null);
            updateHighlight(null, null);
        } else {
            setFocusedNode(d.id);
            updateHighlight(null, d.id);
        }
        event.stopPropagation();
    });

    svg.on("dblclick", () => {
        setFocusedNode(null);
        updateHighlight(null, null);
    });

    // Update positions
    if (layoutMode === 'force') {
        simulationRef.current?.on("tick", () => {
            link
                .attr("x1", (d: any) => d.source.x)
                .attr("y1", (d: any) => d.source.y)
                .attr("x2", (d: any) => d.target.x)
                .attr("y2", (d: any) => d.target.y);

            node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
        });
    } else {
        // Static layout update
        link
            .attr("x1", (d: any) => {
                const s = nodes.find(n => n.id === d.source);
                return s ? s.x : 0;
            })
            .attr("y1", (d: any) => {
                const s = nodes.find(n => n.id === d.source);
                return s ? s.y : 0;
            })
            .attr("x2", (d: any) => {
                const t = nodes.find(n => n.id === d.target);
                return t ? t.x : 0;
            })
            .attr("y2", (d: any) => {
                const t = nodes.find(n => n.id === d.target);
                return t ? t.y : 0;
            });

        node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    }

    function dragstarted(event: any, d: any) {
      if (layoutMode !== 'force') return;
      if (!event.active) simulationRef.current?.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      if (layoutMode !== 'force') return;
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (layoutMode !== 'force') return;
      if (!event.active) simulationRef.current?.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    
    return () => {
      simulationRef.current?.stop();
    };
  }, [data, theme, layoutMode, focusedNode]);

  // --- CONTROLS ---

  const handleZoom = (factor: number) => {
    if (svgRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(d3.zoom<SVGSVGElement, unknown>().scaleBy, factor);
    }
  };

  const handleReset = () => {
    if (svgRef.current) {
        d3.select(svgRef.current).transition().duration(750).call(d3.zoom<SVGSVGElement, unknown>().transform, d3.zoomIdentity);
        setFocusedNode(null);
    }
  };

  const prepareExportSVG = (): string | null => {
    if (!svgRef.current || !containerRef.current) return null;
    
    // 1. Clone the SVG
    const svgEl = svgRef.current;
    const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement;
    
    // 2. Dimensions
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    clonedSvg.setAttribute("width", width.toString());
    clonedSvg.setAttribute("height", height.toString());
    clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    
    // 3. Inject Computed CSS Variables for correct coloring
    const computedStyle = getComputedStyle(document.documentElement);
    const vars = [
        '--bg-main', '--bg-panel', '--bg-element', '--border-main',
        '--text-primary', '--text-secondary', 
        '--primary-500', '--primary-600', '--secondary-500',
        '--neutral-500', '--neutral-600'
    ];
    
    let cssVariables = ':root {';
    vars.forEach(v => {
        const val = computedStyle.getPropertyValue(v).trim();
        // Handle RGB tuples (Tailwind) by wrapping in rgb() if needed for fallback
        // But better to just pass the raw variable value as is, D3 nodes use "rgb(var(...))"
        cssVariables += `${v}: ${val};`;
    });
    cssVariables += '}';
    
    const style = document.createElement('style');
    style.textContent = `
      ${cssVariables}
      text { font-family: 'Inter', sans-serif; }
    `;
    clonedSvg.prepend(style);
    
    // 4. Add Background Rect manually
    // Extract bg color value
    const bgVal = computedStyle.getPropertyValue('--bg-main').trim();
    const bgFill = bgVal.includes(' ') ? `rgb(${bgVal})` : bgVal; // Convert 'R G B' to 'rgb(R G B)' which is valid CSS4 but safe to wrap
    
    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgRect.setAttribute("width", "100%");
    bgRect.setAttribute("height", "100%");
    bgRect.setAttribute("fill", bgFill);
    if (clonedSvg.firstChild) clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);
    else clonedSvg.appendChild(bgRect);

    // 5. Serialize
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(clonedSvg);
    
    // Ensure Namespaces
    if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if(!source.match(/^<svg[^>]+xmlns:xlink/)){
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }

    return '<?xml version="1.0" standalone="no"?>\r\n' + source;
  };

  const handleExport = async (format: 'svg' | 'png' | 'pdf') => {
    setIsExportMenuOpen(false); // Close menu
    const source = prepareExportSVG();
    if (!source) return;

    if (format === 'svg') {
        const url = "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(source);
        const link = document.createElement("a");
        link.href = url;
        link.download = `graph_${Date.now()}.svg`;
        link.click();
    } else {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(source)));
        
        img.onerror = (e) => {
            console.error("SVG Load Error", e);
            alert("Failed to render graph image. The graph might be too complex or contain unsupported styles.");
        };

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = containerRef.current!.clientWidth;
            canvas.height = containerRef.current!.clientHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            // Draw
            ctx.drawImage(img, 0, 0);
            
            if (format === 'png') {
                const url = canvas.toDataURL("image/png");
                const link = document.createElement("a");
                link.href = url;
                link.download = `graph_${Date.now()}.png`;
                link.click();
            } else if (format === 'pdf') {
                 // Check for jsPDF in window (loaded via CDN)
                 // @ts-ignore
                 const jspdfLib = window.jspdf;
                 if (jspdfLib && jspdfLib.jsPDF) {
                     const pdf = new jspdfLib.jsPDF({
                         orientation: canvas.width > canvas.height ? 'l' : 'p',
                         unit: 'px',
                         format: [canvas.width, canvas.height]
                     });
                     pdf.addImage(canvas.toDataURL("image/png"), 'PNG', 0, 0, canvas.width, canvas.height);
                     pdf.save(`graph_${Date.now()}.pdf`);
                 } else {
                     alert("PDF library (jsPDF) not loaded. Please ensure you are online and reload.");
                 }
            }
        };
    }
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
      
      {/* HUD Info */}
      <div className="absolute top-4 left-4 flex flex-col gap-2">
           <div className="bg-white/80 dark:bg-cyber-800/80 backdrop-blur rounded-lg border border-paper-200 dark:border-cyber-700 p-1 flex gap-1 shadow-sm">
                <button 
                    onClick={() => setLayoutMode('force')}
                    className={`p-1.5 rounded transition-colors ${layoutMode === 'force' ? 'bg-cyan-100 dark:bg-cyan-900 text-cyan-600 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                    title="Force Directed"
                >
                    <Network size={16} />
                </button>
                <button 
                    onClick={() => setLayoutMode('hierarchical')}
                    className={`p-1.5 rounded transition-colors ${layoutMode === 'hierarchical' ? 'bg-cyan-100 dark:bg-cyan-900 text-cyan-600 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                    title="Hierarchical Tree"
                >
                    <ArrowDownCircle size={16} />
                </button>
                <button 
                    onClick={() => setLayoutMode('circular')}
                    className={`p-1.5 rounded transition-colors ${layoutMode === 'circular' ? 'bg-cyan-100 dark:bg-cyan-900 text-cyan-600 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                    title="Circular Layout"
                >
                    <Circle size={16} />
                </button>
                <button 
                    onClick={() => setLayoutMode('grid')}
                    className={`p-1.5 rounded transition-colors ${layoutMode === 'grid' ? 'bg-cyan-100 dark:bg-cyan-900 text-cyan-600 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                    title="Grid Layout"
                >
                    <Grid size={16} />
                </button>
           </div>
           
           <div className="p-3 bg-white/80 dark:bg-cyber-800/80 backdrop-blur rounded-lg border border-paper-200 dark:border-cyber-700 text-xs shadow-sm pointer-events-none transition-all">
                <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full bg-cyan-500 border border-white/20"></span>
                    <span className="text-slate-600 dark:text-slate-300">{data.nodes.length} Nodes</span>
                </div>
                {(highlightedNode || focusedNode) && (
                     <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 font-bold text-cyan-600 dark:text-cyan-400 animate-fadeIn">
                         ID: {highlightedNode || focusedNode}
                     </div>
                )}
                {focusedNode && (
                    <div className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
                        <MousePointer2 size={10} /> Focus Mode Active
                    </div>
                )}
            </div>
      </div>

      {/* Action Controls */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-10 opacity-90 hover:opacity-100 transition-opacity">
        {/* Export Menu */}
        <div className="relative">
            {isExportMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded-lg shadow-xl p-1 flex flex-col gap-1 min-w-[80px] animate-slideUp">
                    <button onClick={() => handleExport('png')} className="px-3 py-1.5 text-xs hover:bg-paper-100 dark:hover:bg-cyber-700 rounded text-left text-slate-700 dark:text-slate-200 font-medium">PNG</button>
                    <button onClick={() => handleExport('svg')} className="px-3 py-1.5 text-xs hover:bg-paper-100 dark:hover:bg-cyber-700 rounded text-left text-slate-700 dark:text-slate-200 font-medium">SVG</button>
                    <button onClick={() => handleExport('pdf')} className="px-3 py-1.5 text-xs hover:bg-paper-100 dark:hover:bg-cyber-700 rounded text-left text-slate-700 dark:text-slate-200 font-medium">PDF</button>
                </div>
            )}
            <button 
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className={`w-full p-2 rounded-lg shadow-lg border transition-colors ${isExportMenuOpen ? 'bg-cyan-500 border-cyan-500 text-white' : 'bg-white dark:bg-cyber-800 border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200'}`}
                title="Export Graph"
            >
                <Share2 size={20} />
            </button>
        </div>

        <div className="h-px bg-paper-300 dark:bg-cyber-600 my-1"></div>
        
        <button onClick={() => handleZoom(1.3)} className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 transition-colors" title="Zoom In">
            <ZoomIn size={20} />
        </button>
        <button onClick={handleReset} className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 transition-colors" title="Reset View">
            <RotateCcw size={20} />
        </button>
        <button onClick={() => handleZoom(0.7)} className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 transition-colors" title="Zoom Out">
            <ZoomOut size={20} />
        </button>
      </div>
    </div>
  );
};
