import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useKnowledgeGraph, type JarvisGraphNode, type JarvisGraphEdge } from "@/hooks/useJarvisApi";
import { Network, Database, RefreshCw, Search, ZoomIn, ZoomOut, Crosshair } from "lucide-react";
import { Input } from "@/components/ui/input";

// --- Types & Constants ---
interface SimNode extends JarvisGraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const TYPE_CONFIG: Record<string, { color: string; radius: number }> = {
  memory: { color: "var(--color-primary)", radius: 16 },
  asset: { color: "var(--color-chart-2)", radius: 12 },
  category: { color: "var(--color-chart-3)", radius: 20 },
  decision: { color: "var(--color-chart-4)", radius: 14 },
  task: { color: "var(--color-chart-5)", radius: 12 },
};

const DEFAULT_CONFIG = { color: "var(--color-primary)", radius: 12 };

export default function KnowledgeGraph() {
  const { data, isLoading } = useKnowledgeGraph();
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  
  // Pan & Zoom state
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Simulation state refs
  const simNodesRef = useRef<Map<string, SimNode>>(new Map());
  const rafRef = useRef<number>(0);
  const [renderedNodes, setRenderedNodes] = useState<SimNode[]>([]);

  const nodes = data?.nodes || [];
  const edges = data?.edges || [];

  // Handle Resize
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

  // Initialize nodes for simulation
  useEffect(() => {
    const currentSimNodes = simNodesRef.current;
    const newSimNodes = new Map<string, SimNode>();
    
    nodes.forEach((node) => {
      const existing = currentSimNodes.get(node.id);
      const conf = TYPE_CONFIG[node.type] || DEFAULT_CONFIG;
      if (existing) {
        newSimNodes.set(node.id, { ...existing, ...node, radius: conf.radius });
      } else {
        // Spawn near center
        const cx = dimensions.width / 2;
        const cy = dimensions.height / 2;
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 100;
        newSimNodes.set(node.id, {
          ...node,
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          vx: 0,
          vy: 0,
          radius: conf.radius,
        });
      }
    });
    
    simNodesRef.current = newSimNodes;
  }, [nodes, dimensions]);

  // Force Directed Simulation Loop
  useEffect(() => {
    if (!nodes.length) return;

    let alpha = 1;
    const alphaDecay = 0.02;
    const alphaMin = 0.001;

    const tick = () => {
      const nodeMap = simNodesRef.current;
      const simNodesList = Array.from(nodeMap.values());
      const k = alpha * 0.1;
      const centerForce = 0.05 * alpha;
      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;

      // 1. Repulsion (Coulomb's Law-ish)
      for (let i = 0; i < simNodesList.length; i++) {
        for (let j = i + 1; j < simNodesList.length; j++) {
          const a = simNodesList[i];
          const b = simNodesList[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          if (dx === 0 && dy === 0) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq);
          const minDistance = a.radius + b.radius + 20;
          
          if (dist < minDistance * 3) {
            const force = (minDistance * minDistance) / distSq * k * 0.5;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }
      }

      // 2. Attraction along edges (Hooke's Law)
      edges.forEach((edge) => {
        const source = nodeMap.get(edge.source.id);
        const target = nodeMap.get(edge.target.id);
        if (source && target) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const desiredDist = source.radius + target.radius + 80;
          const force = (dist - desiredDist) * k * 0.05;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          source.vx += fx;
          source.vy += fy;
          target.vx -= fx;
          target.vy -= fy;
        }
      });

      // 3. Center Gravity & Velocity Update
      simNodesList.forEach((n) => {
        n.vx += (cx - n.x) * centerForce;
        n.vy += (cy - n.y) * centerForce;
        
        n.vx *= 0.85; // friction
        n.vy *= 0.85;
        
        n.x += n.vx;
        n.y += n.vy;
      });

      setRenderedNodes([...simNodesList]);

      alpha *= (1 - alphaDecay);
      if (alpha > alphaMin) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    alpha = 1; // Restart heat when data changes
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [nodes, edges, dimensions]);

  // Handle Pan & Zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const scaleAdjust = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(prev => {
      const newScale = Math.min(Math.max(prev.scale * scaleAdjust, 0.2), 5);
      return { ...prev, scale: newScale };
    });
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target instanceof SVGElement && e.target.tagName !== 'circle') {
      isDragging.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setTransform(prev => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy
    }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const resetView = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  const zoomIn = () => setTransform(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 5) }));
  const zoomOut = () => setTransform(prev => ({ ...prev, scale: Math.max(prev.scale * 0.8, 0.2) }));

  const filteredNodes = useMemo(() => {
    if (!search) return renderedNodes;
    return renderedNodes.filter(n => n.label.toLowerCase().includes(search.toLowerCase()));
  }, [renderedNodes, search]);

  const activeNodeIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes]);

  // Derived edges based on rendered node positions
  const renderedEdges = useMemo(() => {
    const nodeMap = new Map(renderedNodes.map(n => [n.id, n]));
    return edges.map(edge => {
      const s = nodeMap.get(edge.source.id);
      const t = nodeMap.get(edge.target.id);
      if (!s || !t) return null;
      return { ...edge, x1: s.x, y1: s.y, x2: t.x, y2: t.y };
    }).filter(Boolean) as (JarvisGraphEdge & { x1: number, y1: number, x2: number, y2: number })[];
  }, [edges, renderedNodes]);

  // Active / Hover state logic
  const focusNodeId = hoveredNode || selectedNode;
  const connectedNodeIds = useMemo(() => {
    if (!focusNodeId) return new Set<string>();
    const set = new Set<string>([focusNodeId]);
    edges.forEach(e => {
      if (e.source.id === focusNodeId) set.add(e.target.id);
      if (e.target.id === focusNodeId) set.add(e.source.id);
    });
    return set;
  }, [focusNodeId, edges]);

  return (
    <div className="flex flex-col h-full max-w-[1600px] mx-auto gap-6 pb-6 px-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Network className="w-6 h-6 text-primary" />
            Neural Knowledge Graph
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            The mind of Jarvis. Visualizing systemic relationships and contextual memory.
          </p>
        </div>
        <div className="relative w-full sm:w-80 shadow-lg shadow-primary/5">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search constellation..." 
            className="pl-9 bg-card/60 border-border/60 focus:border-primary/50 transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 bg-card/20 backdrop-blur-sm border border-border/40 rounded-xl overflow-hidden relative shadow-2xl" ref={containerRef}>
        
        {/* Graph Controls */}
        <div className="absolute right-4 bottom-4 z-10 flex flex-col gap-2">
          <button onClick={resetView} className="p-2 bg-card/80 border border-border/50 rounded-md text-muted-foreground hover:text-primary transition-colors backdrop-blur-md" title="Recenter">
            <Crosshair className="w-4 h-4" />
          </button>
          <button onClick={zoomIn} className="p-2 bg-card/80 border border-border/50 rounded-md text-muted-foreground hover:text-primary transition-colors backdrop-blur-md" title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={zoomOut} className="p-2 bg-card/80 border border-border/50 rounded-md text-muted-foreground hover:text-primary transition-colors backdrop-blur-md" title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 text-muted-foreground">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm uppercase tracking-widest font-mono text-primary/80">Synthesizing Network</span>
            <p className="text-xs opacity-50">Mapping neural pathways...</p>
          </div>
        ) : !nodes.length ? (
          <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 text-muted-foreground text-center">
            <Database className="w-12 h-12 opacity-20" />
            <div className="space-y-1">
              <h3 className="text-lg font-medium text-foreground">Constellation Empty</h3>
              <p className="text-sm max-w-sm">
                The intelligence network has not formed any contextual relationships yet. 
                Nodes will materialize as memories are formed.
              </p>
            </div>
          </div>
        ) : (
          <div 
            className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <svg 
              className="w-full h-full"
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            >
              <defs>
                <radialGradient id="node-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </radialGradient>
                <filter id="blur">
                  <feGaussianBlur stdDeviation="2" />
                </filter>
              </defs>

              <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
                {/* Edges Layer */}
                <g>
                  {renderedEdges.map((edge) => {
                    const isSearchResult = activeNodeIds.has(edge.source.id) && activeNodeIds.has(edge.target.id);
                    if (!isSearchResult && search) return null;

                    const isConnected = focusNodeId && (edge.source.id === focusNodeId || edge.target.id === focusNodeId);
                    const opacity = focusNodeId 
                      ? (isConnected ? 0.7 : 0.05) 
                      : 0.15;
                    
                    const strokeColor = isConnected ? "var(--color-primary)" : "var(--color-border)";
                    const strokeWidth = isConnected ? 1.5 : 1;

                    return (
                      <line
                        key={edge.id}
                        x1={edge.x1}
                        y1={edge.y1}
                        x2={edge.x2}
                        y2={edge.y2}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeOpacity={opacity}
                        className="transition-all duration-300"
                      />
                    );
                  })}
                </g>

                {/* Nodes Layer */}
                <g>
                  {renderedNodes.map((node) => {
                    const isSearchResult = activeNodeIds.has(node.id);
                    if (!isSearchResult && search) return null;
                    
                    const conf = TYPE_CONFIG[node.type] || DEFAULT_CONFIG;
                    const isFocused = node.id === focusNodeId;
                    const isConnected = focusNodeId && connectedNodeIds.has(node.id);
                    
                    const opacity = focusNodeId 
                      ? (isFocused || isConnected ? 1 : 0.1) 
                      : 1;

                    return (
                      <motion.g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        onMouseEnter={() => setHoveredNode(node.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                        onClick={() => setSelectedNode(node.id === selectedNode ? null : node.id)}
                        className={isFocused || !focusNodeId ? "cursor-pointer" : "cursor-default"}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity, scale: isFocused ? 1.2 : 1 }}
                        transition={{ type: "spring" as const, stiffness: 300, damping: 20 }}
                      >
                        {/* Glow Effect */}
                        {(isFocused || isConnected) && (
                          <circle
                            r={node.radius * 2.5}
                            fill={conf.color}
                            style={{ color: conf.color }}
                            fillOpacity="0.15"
                            filter="url(#blur)"
                            className="pointer-events-none"
                          />
                        )}

                        {/* Outer Ring */}
                        <circle
                          r={node.radius + (isFocused ? 4 : 0)}
                          fill={conf.color}
                          style={{ color: conf.color }}
                          fillOpacity={isFocused ? "0.2" : "0.05"}
                          stroke={conf.color}
                          strokeWidth={isFocused ? 2 : 1}
                          strokeOpacity={isFocused || isConnected ? 0.8 : 0.3}
                          className="transition-all duration-300"
                        />
                        
                        {/* Core */}
                        <circle
                          r={node.radius * 0.4}
                          fill={conf.color}
                          className="transition-all duration-300"
                        />
                        
                        {/* Label */}
                        <AnimatePresence>
                          {(isFocused || (!focusNodeId && node.radius > 14)) && (
                            <motion.g 
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              className="pointer-events-none"
                            >
                              <text 
                                y={node.radius + 14} 
                                textAnchor="middle" 
                                fill="var(--color-foreground)" 
                                fontSize={isFocused ? "11px" : "9px"} 
                                fontWeight={isFocused ? "bold" : "normal"}
                                fontFamily="monospace"
                                className="drop-shadow-md"
                              >
                                {node.label.length > 20 ? node.label.substring(0, 20) + '...' : node.label}
                              </text>
                            </motion.g>
                          )}
                        </AnimatePresence>
                      </motion.g>
                    );
                  })}
                </g>
              </g>
            </svg>
          </div>
        )}
        
        {/* Info Panel Overlay */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute top-4 right-4 w-72 bg-card/90 backdrop-blur-xl border border-border/60 rounded-lg p-5 shadow-2xl shadow-black/50"
            >
              {(() => {
                const node = renderedNodes.find(n => n.id === selectedNode);
                if (!node) return null;
                const conf = TYPE_CONFIG[node.type] || DEFAULT_CONFIG;
                return (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: conf.color, color: conf.color }} />
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{node.type}</span>
                        </div>
                        <h3 className="text-base font-semibold leading-tight">{node.label}</h3>
                      </div>
                      <button 
                        onClick={() => setSelectedNode(null)}
                        className="text-muted-foreground hover:text-foreground text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div className="space-y-2 pt-2 border-t border-border/30">
                      <div className="text-xs text-muted-foreground font-mono grid grid-cols-[60px_1fr] gap-2">
                        <span className="opacity-50">ID</span>
                        <span className="truncate">{node.id}</span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono grid grid-cols-[60px_1fr] gap-2">
                        <span className="opacity-50">CONNECTIONS</span>
                        <span>{connectedNodeIds.size - 1}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Legend Overlay */}
        {nodes.length > 0 && (
          <div className="absolute bottom-4 left-4 bg-card/40 backdrop-blur-md border border-border/40 rounded-lg p-4 shadow-xl select-none pointer-events-none">
            <h4 className="text-[10px] uppercase tracking-[0.2em] text-primary/70 font-semibold mb-3">Topology Legend</h4>
            <div className="space-y-2">
              {Object.entries(TYPE_CONFIG).map(([type, conf]) => (
                <div key={type} className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                  <div 
                    className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor]" 
                    style={{ backgroundColor: conf.color, color: conf.color }} 
                  />
                  <span className="capitalize tracking-wider">{type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
