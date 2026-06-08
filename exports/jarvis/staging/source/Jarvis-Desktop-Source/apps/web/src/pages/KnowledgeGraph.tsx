import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useKnowledgeGraph, type JarvisGraphNode, type JarvisGraphEdge } from "@/hooks/useJarvisApi";
import { Network, Database, Cpu, Search, Layers, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function KnowledgeGraph() {
  const { data, isLoading, isError } = useKnowledgeGraph();
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  const nodes = data?.nodes || [];
  const edges = data?.edges || [];

  const graphData = useMemo(() => {
    if (!nodes.length) return { nodes: [], edges: [] };

    // Simple radial layout computation
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const radius = Math.min(cx, cy) * 0.7;

    const positionedNodes = nodes.map((node, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI;
      // Center node if it's highly connected (mock logic: first node is center)
      const isCenter = i === 0 && nodes.length > 5;
      return {
        ...node,
        x: isCenter ? cx : cx + radius * Math.cos(angle),
        y: isCenter ? cy : cy + radius * Math.sin(angle),
      };
    });

    const positionedEdges = edges.map((edge) => {
      const sourceNode = positionedNodes.find(n => n.id === edge.source.id);
      const targetNode = positionedNodes.find(n => n.id === edge.target.id);
      return {
        ...edge,
        x1: sourceNode?.x || 0,
        y1: sourceNode?.y || 0,
        x2: targetNode?.x || 0,
        y2: targetNode?.y || 0,
      };
    }).filter(e => e.x1 && e.y1 && e.x2 && e.y2);

    return { nodes: positionedNodes, edges: positionedEdges };
  }, [nodes, edges, dimensions]);

  const getNodeColor = (type: string) => {
    switch (type) {
      case 'memory': return 'var(--color-primary)';
      case 'asset': return 'var(--color-chart-2)';
      case 'category': return 'var(--color-chart-3)';
      case 'decision': return 'var(--color-chart-4)';
      case 'task': return 'var(--color-chart-5)';
      default: return 'var(--color-primary)';
    }
  };

  const filteredNodes = useMemo(() => {
    if (!search) return graphData.nodes;
    return graphData.nodes.filter(n => n.label.toLowerCase().includes(search.toLowerCase()));
  }, [graphData.nodes, search]);

  const activeNodeIds = new Set(filteredNodes.map(n => n.id));

  return (
    <div className="flex flex-col h-full max-w-[1600px] mx-auto gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Network className="w-6 h-6 text-primary" />
            Neural Knowledge Graph
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visualizing systemic relationships and contextual memory
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search nodes..." 
            className="pl-8 bg-card/50 border-border/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 bg-card/10 border border-border/50 rounded-xl overflow-hidden relative" ref={containerRef}>
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 text-muted-foreground">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm uppercase tracking-widest font-mono">Synthesizing Network...</span>
          </div>
        ) : !nodes.length ? (
          <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 text-muted-foreground text-center">
            <Database className="w-12 h-12 opacity-20" />
            <div className="space-y-1">
              <h3 className="text-lg font-medium text-foreground">Graph Empty</h3>
              <p className="text-sm max-w-sm">
                The intelligence network has not formed any contextual relationships yet. 
                Nodes will appear as knowledge assets and memories are aggregated.
              </p>
            </div>
          </div>
        ) : (
          <svg className="w-full h-full">
            <defs>
              <radialGradient id="node-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Edges */}
            {graphData.edges.map((edge) => {
              const isActive = activeNodeIds.has(edge.source.id) && activeNodeIds.has(edge.target.id);
              const isHovered = hoveredNode === edge.source.id || hoveredNode === edge.target.id;
              
              if (!isActive && !isHovered && search) return null;

              return (
                <motion.line
                  key={edge.id}
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                  stroke={isHovered ? "var(--color-primary)" : "var(--color-border)"}
                  strokeWidth={isHovered ? 2 : 1}
                  strokeOpacity={isHovered ? 0.8 : 0.3}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isActive ? 1 : 0.1 }}
                  transition={{ duration: 0.5 }}
                />
              );
            })}

            {/* Nodes */}
            {graphData.nodes.map((node) => {
              const isActive = activeNodeIds.has(node.id);
              if (!isActive && search) return null;
              
              const isHovered = hoveredNode === node.id;
              const color = getNodeColor(node.type);

              return (
                <motion.g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 20 }}
                  className="cursor-pointer"
                >
                  <circle
                    r={isHovered ? 24 : 16}
                    fill={color}
                    style={{ color }}
                    fillOpacity="0.1"
                    stroke={color}
                    strokeWidth={isHovered ? 2 : 1}
                  />
                  <circle
                    r={isHovered ? 6 : 4}
                    fill={color}
                  />
                  
                  {isHovered && (
                    <g transform="translate(15, -15)">
                      <rect x="0" y="0" width="120" height="40" rx="4" fill="var(--color-card)" stroke="var(--color-border)" />
                      <text x="8" y="16" fill="var(--color-foreground)" fontSize="10" fontWeight="bold" fontFamily="monospace">
                        {node.label.length > 15 ? node.label.substring(0, 15) + '...' : node.label}
                      </text>
                      <text x="8" y="30" fill="var(--color-muted-foreground)" fontSize="8" fontFamily="monospace" className="uppercase">
                        TYPE: {node.type}
                      </text>
                    </g>
                  )}
                </motion.g>
              );
            })}
          </svg>
        )}
        
        {/* Legend Overlay */}
        {nodes.length > 0 && (
          <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-md border border-border/50 rounded-lg p-3 shadow-xl">
            <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Entity Topology</h4>
            <div className="space-y-1.5">
              {['memory', 'asset', 'category', 'decision', 'task'].map(type => (
                <div key={type} className="flex items-center gap-2 text-xs font-mono">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getNodeColor(type) }} />
                  <span className="capitalize">{type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
