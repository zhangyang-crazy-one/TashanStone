
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GraphData, Theme } from '../types';
import { ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-react';

interface KnowledgeGraphProps {
  data: GraphData;
  theme: Theme;
  onNodeClick?: (nodeId: string) => void;
}

// Helper: Convert graph (nodes/links) to hierarchy (tree)
// Finds the most connected node as root and builds a tree using BFS
const graphToHierarchy = (nodes: any[], links: any[]) => {
  if (!nodes || nodes.length === 0) return null;

  // 1. Build Adjacency List
  const adjacency: Record<string, string[]> = {};
  const degrees: Record<string, number> = {};

  nodes.forEach(n => {
    adjacency[n.id] = [];
    degrees[n.id] = 0;
  });

  links.forEach(l => {
    // Handle both object ref (if d3 processed before) and string id
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;

    if (adjacency[src]) { adjacency[src].push(tgt); degrees[src]++; }
    if (adjacency[tgt]) { adjacency[tgt].push(src); degrees[tgt]++; }
  });

  // 2. Find Root (Node with Max Degree)
  let rootId = nodes[0]?.id;
  let maxDegree = -1;
  for (const id in degrees) {
    if (degrees[id] > maxDegree) {
      maxDegree = degrees[id];
      rootId = id;
    }
  }

  // 3. BFS Construction
  const visited = new Set<string>();
  
  const build = (id: string): any => {
    visited.add(id);
    
    // Sort children by name for consistent layout
    const childrenIds = (adjacency[id] || [])
        .filter(nid => !visited.has(nid))
        .sort();

    const children = childrenIds.map(build);
    
    const nodeData = nodes.find(n => n.id === id);

    return {
      name: nodeData?.label || id,
      id: id,
      children: children.length > 0 ? children : null,
      _children: null, // For toggle state
      group: nodeData?.group,
      val: nodeData?.val
    };
  };

  return build(rootId);
};

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ data, theme, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hierarchyData, setHierarchyData] = useState<any>(null);

  // Colors
  const isDark = theme === 'dark';
  const nodeFill = isDark ? '#1e293b' : '#ffffff';
  const nodeStroke = isDark ? '#06b6d4' : '#0891b2'; // Cyan
  const textFill = isDark ? '#e2e8f0' : '#334155';
  const linkStroke = isDark ? '#475569' : '#cbd5e1';

  // Transform data on mount or data change
  useEffect(() => {
    if (data && data.nodes.length > 0) {
      const tree = graphToHierarchy(data.nodes, data.links);
      setHierarchyData(tree);
    }
  }, [data]);

  useEffect(() => {
    if (!hierarchyData || !svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous

    const g = svg.append("g");

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);
    
    // Center initial view
    svg.call(zoom.transform, d3.zoomIdentity.translate(100, height / 2).scale(0.8));

    // Tree Layout
    // nodeSize: [height, width] - determines spacing
    const treeLayout = d3.tree().nodeSize([40, 200]);

    // Root Hierarchy
    const root = d3.hierarchy(hierarchyData);
    
    // Collapse function (optional: collapse deeper levels initially if graph is huge)
    // root.children?.forEach(collapse); 

    // Initialize position
    (root as any).x0 = height / 2;
    (root as any).y0 = 0;

    // Update Function
    const update = (source: any) => {
      // Assign coordinates
      const treeData = treeLayout(root);
      const nodes = treeData.descendants();
      const links = treeData.links();

      // Normalize for fixed depth
      nodes.forEach((d: any) => { d.y = d.depth * 250; });

      // --- NODES ---
      const node = g.selectAll<SVGGElement, any>("g.node")
        .data(nodes, (d: any) => d.id || (d.id = ++i));

      // Enter
      const nodeEnter = node.enter().append("g")
        .attr("class", "node")
        .attr("transform", (d) => `translate(${source.y0},${source.x0})`)
        .on("click", click)
        .style("cursor", "pointer");

      let i = 0;

      // Node Shape (Pill/Rect)
      nodeEnter.append("rect")
        .attr("rx", 6)
        .attr("ry", 6)
        .attr("width", 0) // animate in
        .attr("height", 30)
        .attr("y", -15)
        .attr("x", 0) // Centered logic handled in update
        .style("fill", nodeFill)
        .style("stroke", (d: any) => d.data.group === 1 ? '#8b5cf6' : nodeStroke) // Violet for root/groups, else Cyan
        .style("stroke-width", 2);

      // Label
      nodeEnter.append("text")
        .attr("dy", ".35em")
        .attr("x", 10)
        .attr("text-anchor", "start")
        .text((d: any) => d.data.name)
        .style("fill-opacity", 0)
        .style("fill", textFill)
        .style("font-size", "12px")
        .style("font-family", "Inter, sans-serif")
        .style("font-weight", "500")
        .style("pointer-events", "none")
        .style("text-shadow", isDark ? "0 1px 3px rgba(0,0,0,0.8)" : "none");

      // Update positions
      const nodeUpdate = nodeEnter.merge(node);

      // Transition to new position
      nodeUpdate.transition().duration(500)
        .attr("transform", (d: any) => `translate(${d.y},${d.x})`);

      // Update styling based on children state
      nodeUpdate.select("rect")
        .attr("width", (d: any) => (d.data.name.length * 8) + 20) // Dynamic width approx
        .style("fill", (d: any) => d._children ? (isDark ? '#0f172a' : '#f1f5f9') : nodeFill) // Darker if collapsed
        .style("stroke", (d: any) => d._children ? '#f472b6' : (d.data.group === 1 ? '#8b5cf6' : nodeStroke)); // Pink if collapsed

      nodeUpdate.select("text")
        .style("fill-opacity", 1);

      // Exit
      const nodeExit = node.exit().transition().duration(500)
        .attr("transform", (d) => `translate(${source.y},${source.x})`)
        .remove();

      nodeExit.select("rect").attr("width", 0);
      nodeExit.select("text").style("fill-opacity", 0);


      // --- LINKS ---
      const link = g.selectAll<SVGPathElement, any>("path.link")
        .data(links, (d: any) => d.target.id);

      // Enter
      const linkEnter = link.enter().insert("path", "g")
        .attr("class", "link")
        .attr("d", (d) => {
          const o = { x: source.x0, y: source.y0 };
          return diagonal(o, o);
        })
        .style("fill", "none")
        .style("stroke", linkStroke)
        .style("stroke-width", 1.5)
        .style("opacity", 0.6);

      // Update
      const linkUpdate = linkEnter.merge(link);

      linkUpdate.transition().duration(500)
        .attr("d", (d) => diagonal(d.source, d.target));

      // Exit
      link.exit().transition().duration(500)
        .attr("d", (d) => {
          const o = { x: source.x, y: source.y };
          return diagonal(o, o);
        })
        .remove();

      // Store positions for transition
      nodes.forEach((d: any) => {
        d.x0 = d.x;
        d.y0 = d.y;
      });

      function click(event: any, d: any) {
        if (d.children) {
          d._children = d.children;
          d.children = null;
        } else {
          d.children = d._children;
          d._children = null;
        }
        update(d);
        if (onNodeClick) onNodeClick(d.data.id);
      }
    };

    // Helper for Bezier Curves
    const diagonal = (s: any, d: any) => {
      return `M ${s.y} ${s.x}
              C ${(s.y + d.y) / 2} ${s.x},
                ${(s.y + d.y) / 2} ${d.x},
                ${d.y} ${d.x}`;
    };

    // Initial render
    update(root);

  }, [hierarchyData, theme, onNodeClick]);

  const handleZoom = (factor: number) => {
    if (svgRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(d3.zoom<SVGSVGElement, unknown>().scaleBy, factor);
    }
  };

  const handleReset = () => {
    if (svgRef.current && containerRef.current) {
        const height = containerRef.current.clientHeight;
        const transform = d3.zoomIdentity.translate(100, height/2).scale(0.8);
        d3.select(svgRef.current).transition().duration(750).call(d3.zoom<SVGSVGElement, unknown>().transform, transform);
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full relative bg-paper-50 dark:bg-cyber-900 overflow-hidden select-none">
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ 
             backgroundImage: `radial-gradient(${isDark ? '#475569' : '#94a3b8'} 1px, transparent 1px)`, 
             backgroundSize: '20px 20px' 
           }}>
      </div>

      <svg ref={svgRef} className="w-full h-full cursor-move" />
      
      {/* Legend / Info */}
      <div className="absolute top-4 left-4 p-3 bg-white/80 dark:bg-cyber-800/80 backdrop-blur rounded-lg border border-paper-200 dark:border-cyber-700 text-xs shadow-sm pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded bg-cyan-500"></span>
              <span className="text-slate-600 dark:text-slate-300">Topic Node</span>
          </div>
          <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-violet-500"></span>
              <span className="text-slate-600 dark:text-slate-300">Root / Group</span>
          </div>
          <div className="mt-2 text-[10px] text-slate-400">
             Click nodes to expand/collapse.
          </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-10">
        <button onClick={() => handleZoom(1.2)} className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 transition-colors" title="Zoom In">
            <ZoomIn size={20} />
        </button>
        <button onClick={handleReset} className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 transition-colors" title="Reset View">
            <RotateCcw size={20} />
        </button>
        <button onClick={() => handleZoom(0.8)} className="p-2 bg-white dark:bg-cyber-800 rounded-lg shadow-lg border border-paper-200 dark:border-cyber-700 hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 transition-colors" title="Zoom Out">
            <ZoomOut size={20} />
        </button>
      </div>
    </div>
  );
};
