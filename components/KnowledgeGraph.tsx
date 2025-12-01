
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { GraphData, Theme } from '../types';
import { ZoomIn, ZoomOut, RotateCcw, Download } from 'lucide-react';

interface KnowledgeGraphProps {
  data: GraphData;
  theme: Theme;
  onNodeClick?: (nodeId: string) => void;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = React.memo(({ data, theme, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // CRITICAL FIX: Use ref for callback to avoid restarting simulation when parent re-renders (e.g. toast notification)
  const onNodeClickRef = useRef(onNodeClick);

  // Keep ref in sync with prop
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  // Use CSS Variables for Theme Support
  const isDark = theme === 'dark';

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
      .attr("fill", "rgb(var(--neutral-500))")
      .style("opacity", 0.6);

    // Links
    const link = g.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "rgb(var(--neutral-500))")
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

    // Node Circles
    node.append("circle")
      .attr("r", (d: any) => 6 + Math.sqrt(d.val || 1) * 3)
      .attr("fill", (d: any) => d.group === 1 ? "rgb(var(--secondary-500))" : "rgb(var(--primary-500))")
      .attr("stroke", "rgb(var(--bg-panel))")
      .attr("stroke-width", 2)
      .attr("fill-opacity", 0.9)
      .transition().duration(500).attr("r", (d: any) => 8 + Math.sqrt(d.val || 1) * 3);

    // Node Labels
    node.append("text")
      .text((d: any) => d.label)
      .attr("x", 14)
      .attr("y", 4)
      .style("font-family", "Inter, sans-serif")
      .style("font-size", "11px")
      .style("font-weight", "600")
      .style("fill", "rgb(var(--text-primary))")
      .style("pointer-events", "none")
      .style("text-shadow", isDark ? "0 1px 4px rgba(0,0,0,0.9)" : "0 1px 4px rgba(255,255,255,0.9)")
      .style("opacity", 0)
      .transition().duration(800).style("opacity", 1);

    // Interaction
    node.on("click", (event, d: any) => {
        // Safe invocation via ref prevents useEffect re-trigger logic
        if (onNodeClickRef.current) onNodeClickRef.current(d.id);
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
  }, [data, theme]); // onNodeClick REMOVED from dependency array

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

      {/* Controls */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-10 opacity-60 group-hover:opacity-100 transition-opacity">
        <button onClick={handleDownload} className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 transition-colors" title="Download Graph">
            <Download size={20} />
        </button>
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
});
