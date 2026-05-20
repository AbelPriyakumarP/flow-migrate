"use client";

import { useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeProps,
  type Node,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  parseAWSStepFunctions,
  parseAzureLogicApps,
  applyComparisonStatus,
  type WorkflowNode,
} from "@/lib/workflow-graph";
import type { ComparisonResult, StepMapping } from "@/lib/comparison";

// ─── Props ──────────────────────────────────────────────────────

interface WorkflowGraphViewProps {
  sourceCode: string;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
  comparison: ComparisonResult | null;
}

// ─── Type Icons ──────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  Task: "⚡", Choice: "◇", Parallel: "⫽", Map: "⊞", Pass: "→",
  Wait: "⏳", Succeed: "✓", Fail: "✗",
  Function: "ƒ", Http: "↗", ApiConnection: "⌁", If: "◇",
  Switch: "⇋", Scope: "▣", Foreach: "∀", Select: "⊡",
  Compose: "⊕", Terminate: "■", Request: "▶", Trigger: "▶",
  Start: "●", End: "◉",
};

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Task: { bg: "#eef2ff", border: "#818cf8", text: "#4338ca" },
  Choice: { bg: "#fdf4ff", border: "#c084fc", text: "#7e22ce" },
  Parallel: { bg: "#f0fdf4", border: "#86efac", text: "#15803d" },
  Map: { bg: "#ecfeff", border: "#67e8f9", text: "#0e7490" },
  Pass: { bg: "#f8fafc", border: "#cbd5e1", text: "#475569" },
  Wait: { bg: "#fffbeb", border: "#fcd34d", text: "#a16207" },
  Succeed: { bg: "#ecfdf5", border: "#6ee7b7", text: "#047857" },
  Fail: { bg: "#fef2f2", border: "#fca5a5", text: "#b91c1c" },
  Function: { bg: "#eef2ff", border: "#818cf8", text: "#4338ca" },
  Http: { bg: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" },
  ApiConnection: { bg: "#f0f9ff", border: "#7dd3fc", text: "#0369a1" },
  If: { bg: "#fdf4ff", border: "#c084fc", text: "#7e22ce" },
  Switch: { bg: "#fdf4ff", border: "#d8b4fe", text: "#7e22ce" },
  Scope: { bg: "#f8fafc", border: "#94a3b8", text: "#334155" },
  Foreach: { bg: "#ecfeff", border: "#67e8f9", text: "#0e7490" },
  Select: { bg: "#ecfeff", border: "#22d3ee", text: "#0e7490" },
  Compose: { bg: "#f5f3ff", border: "#a78bfa", text: "#6d28d9" },
  Terminate: { bg: "#fef2f2", border: "#fca5a5", text: "#b91c1c" },
  Request: { bg: "#f0fdf4", border: "#86efac", text: "#15803d" },
  Trigger: { bg: "#f0fdf4", border: "#86efac", text: "#15803d" },
};

const STATUS_RING: Record<string, string> = {
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
};

// ─── Custom Workflow Node ────────────────────────────────────────

function WorkflowNodeComponent({ data }: NodeProps<WorkflowNode>) {
  const colors = TYPE_COLORS[data.type] || TYPE_COLORS.Task;
  const icon = TYPE_ICONS[data.type] || "•";
  const statusColor = data.status ? STATUS_RING[data.status] : undefined;

  return (
    <div className="group relative">
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-slate-300 !border-slate-400 !-top-1" />

      {/* Status glow ring */}
      {statusColor && (
        <div
          className="absolute -inset-1 rounded-xl opacity-30 animate-pulse"
          style={{ boxShadow: `0 0 12px 2px ${statusColor}` }}
        />
      )}

      <div
        className="relative flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 shadow-md transition-all hover:shadow-lg cursor-pointer min-w-[140px] max-w-[220px]"
        style={{
          backgroundColor: colors.bg,
          border: `2px solid ${statusColor || colors.border}`,
        }}
      >
        {/* Type icon badge */}
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-xs font-bold"
          style={{ backgroundColor: colors.border + "30", color: colors.text }}
        >
          {icon}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[11px] font-semibold leading-tight"
            style={{ color: colors.text }}
            title={data.label}
          >
            {data.label}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[9px] font-medium opacity-60" style={{ color: colors.text }}>
              {data.type}
            </span>
            {data.resource && (
              <span className="text-[8px] truncate opacity-50 max-w-[80px]" style={{ color: colors.text }} title={data.resource}>
                · {data.resource}
              </span>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
          {data.hasRetry && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-[8px] text-blue-600" title="Has retry policy">
              ↻
            </span>
          )}
          {data.hasCatch && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-100 text-[8px] text-orange-600" title="Has error catch">
              ⚡
            </span>
          )}
          {data.needsManualConfig && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-100 text-[8px] text-violet-700 font-bold" title="Needs manual config">
              !
            </span>
          )}
          {data.children && data.children > 0 && (
            <span className="text-[8px] font-semibold opacity-50" style={{ color: colors.text }}>
              +{data.children}
            </span>
          )}
        </div>
      </div>

      {/* Status indicator dot */}
      {data.status && (
        <div
          className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm flex items-center justify-center"
          style={{ backgroundColor: STATUS_RING[data.status] }}
        >
          <span className="text-[7px] text-white font-bold">
            {data.status === "green" ? "✓" : data.status === "amber" ? "!" : "✗"}
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-slate-300 !border-slate-400 !-bottom-1" />
    </div>
  );
}

// ─── Terminal Node (Start / End) ─────────────────────────────────

function TerminalNodeComponent({ data }: NodeProps<WorkflowNode>) {
  const isStart = data.isStart;

  return (
    <div className="relative">
      {!isStart && (
        <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-slate-300 !border-slate-400 !-top-1" />
      )}

      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full shadow-md text-white text-sm font-bold ${
          isStart
            ? "bg-gradient-to-br from-emerald-400 to-emerald-600"
            : "bg-gradient-to-br from-slate-400 to-slate-600"
        }`}
      >
        {isStart ? "▶" : "■"}
      </div>

      {isStart && (
        <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-slate-300 !border-slate-400 !-bottom-1" />
      )}
    </div>
  );
}

// ─── Node Types ──────────────────────────────────────────────────

const nodeTypes = {
  workflowNode: WorkflowNodeComponent,
  terminalNode: TerminalNodeComponent,
};

// ─── Auto Layout ─────────────────────────────────────────────────

function autoLayout(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  if (nodes.length === 0) return nodes;

  // Build adjacency
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    outEdges.set(node.id, []);
  }

  for (const edge of edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    outEdges.get(edge.source)?.push(edge.target);
  }

  // BFS layering
  const layers: string[][] = [];
  const nodeLayer = new Map<string, number>();
  const queue: string[] = [];

  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  while (queue.length > 0) {
    const currentLayer: string[] = [];
    const nextQueue: string[] = [];

    for (const id of queue) {
      if (nodeLayer.has(id)) continue;
      currentLayer.push(id);
      nodeLayer.set(id, layers.length);
    }

    if (currentLayer.length > 0) {
      layers.push(currentLayer);
    }

    for (const id of currentLayer) {
      for (const target of outEdges.get(id) || []) {
        const newDeg = (inDegree.get(target) || 1) - 1;
        inDegree.set(target, newDeg);
        if (newDeg <= 0 && !nodeLayer.has(target)) {
          nextQueue.push(target);
        }
      }
    }

    queue.length = 0;
    queue.push(...nextQueue);

    // Safety: prevent infinite loop
    if (layers.length > nodes.length) break;
  }

  // Place any remaining unplaced nodes
  const unplaced = nodes.filter(n => !nodeLayer.has(n.id));
  if (unplaced.length > 0) {
    layers.push(unplaced.map(n => n.id));
  }

  // Position
  const Y_GAP = 110;
  const X_GAP = 260;

  return nodes.map(node => {
    const layer = nodeLayer.get(node.id) ?? layers.length - 1;
    const layerNodes = layers[layer] || [node.id];
    const indexInLayer = layerNodes.indexOf(node.id);
    const layerWidth = layerNodes.length * X_GAP;
    const startX = (500 - layerWidth) / 2;

    return {
      ...node,
      position: {
        x: startX + indexInLayer * X_GAP + X_GAP / 2,
        y: layer * Y_GAP + 20,
      },
    };
  });
}

// ─── Mapping Connector Lines ─────────────────────────────────────

interface MappingLine {
  sourceStep: string;
  targetStep: string;
  status: "green" | "amber" | "red";
}

// ─── Single Graph Panel ──────────────────────────────────────────

type WorkflowEdge = import("@xyflow/react").Edge;

function GraphPanel({
  title,
  platformColor,
  platformLabel,
  nodes: initialNodes,
  edges: initialEdges,
}: {
  title: string;
  platformColor: string;
  platformLabel: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}) {
  const layoutNodes = useMemo(() => autoLayout(initialNodes, initialEdges), [initialNodes, initialEdges]);
  const [nodes, , onNodesChange] = useNodesState(layoutNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  if (initialNodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8">
        <p className="text-sm text-slate-400">No workflow to visualize</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col rounded-xl border border-[var(--card-border)] bg-white shadow-sm overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center gap-2 border-b border-[var(--card-border)] px-4 py-2.5 bg-gradient-to-r from-slate-50 to-white">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: platformColor }} />
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
          style={{ backgroundColor: platformColor }}
        >
          {platformLabel}
        </span>
        <span className="text-[10px] text-slate-400">{initialNodes.filter(n => n.type === "workflowNode").length} steps</span>
      </div>

      {/* Graph */}
      <div style={{ width: "100%", height: 550 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
        >
          <Background color="#e2e8f0" gap={20} size={1} />
          <Controls
            showInteractive={false}
            className="!bg-white !border-slate-200 !shadow-sm !rounded-lg"
          />
          <MiniMap
            nodeColor={(node: Node) => {
              const data = node.data as WorkflowNode["data"];
              if (data.status === "green") return "#10b981";
              if (data.status === "amber") return "#f59e0b";
              if (data.status === "red") return "#ef4444";
              const colors = TYPE_COLORS[data.type];
              return colors?.border || "#94a3b8";
            }}
            maskColor="rgba(0,0,0,0.08)"
            className="!bg-slate-50 !border-slate-200 !rounded-lg !shadow-sm"
            pannable
            zoomable
          />
        </ReactFlow>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

export default function WorkflowGraphView({
  sourceCode,
  outputCode,
  direction,
  comparison,
}: WorkflowGraphViewProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const { sourceGraph, targetGraph, mappingLines } = useMemo(() => {
    let sourceGraph = { nodes: [] as WorkflowNode[], edges: [] as WorkflowEdge[] };
    let targetGraph = { nodes: [] as WorkflowNode[], edges: [] as WorkflowEdge[] };
    const mappingLines: MappingLine[] = [];

    try {
      const sourceJson = JSON.parse(sourceCode);
      const targetJson = JSON.parse(outputCode);

      if (direction === "aws-to-azure") {
        sourceGraph = parseAWSStepFunctions(sourceJson);
        targetGraph = parseAzureLogicApps(targetJson);
      } else {
        sourceGraph = parseAzureLogicApps(sourceJson);
        targetGraph = parseAWSStepFunctions(targetJson);
      }

      // Apply comparison status
      if (comparison) {
        sourceGraph = applyComparisonStatus(sourceGraph, comparison.mappings, "source");
        targetGraph = applyComparisonStatus(targetGraph, comparison.mappings, "target");

        for (const m of comparison.mappings) {
          if (m.targetStep) {
            mappingLines.push({
              sourceStep: m.sourceStep,
              targetStep: m.targetStep,
              status: m.status,
            });
          }
        }
      }
    } catch {
      // Parse error — show empty graphs
    }

    return { sourceGraph, targetGraph, mappingLines };
  }, [sourceCode, outputCode, direction, comparison]);

  if (!sourceCode.trim() || !outputCode.trim()) return null;

  const sourcePlatform = direction === "aws-to-azure" ? { color: "#ff9900", label: "AWS" } : { color: "#0078d4", label: "Azure" };
  const targetPlatform = direction === "aws-to-azure" ? { color: "#0078d4", label: "Azure" } : { color: "#ff9900", label: "AWS" };

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-white shadow-sm overflow-hidden animate-fadeIn">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between border-b border-[var(--card-border)] bg-gradient-to-r from-slate-50 to-white px-5 py-3.5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(124,58,237)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="3" />
              <line x1="12" y1="8" x2="12" y2="14" />
              <circle cx="6" cy="19" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="12" y1="14" x2="6" y2="16" />
              <line x1="12" y1="14" x2="18" y2="16" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-slate-800">Visual Workflow Graph</h3>
            <p className="text-[11px] text-slate-500">
              Interactive flow visualization — {sourcePlatform.label} → {targetPlatform.label}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Step counts */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: sourcePlatform.color }}>
              {sourceGraph.nodes.filter(n => n.type === "workflowNode").length} steps
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: targetPlatform.color }}>
              {targetGraph.nodes.filter(n => n.type === "workflowNode").length} steps
            </span>
          </div>

          {/* Expand icon */}
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"
            className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Graph Content */}
      {isExpanded && (
        <div className="p-4">
          {/* Legend */}
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-4 py-2 border border-slate-100">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Legend</span>
            {[
              { icon: "⚡", label: "Task", color: "#818cf8" },
              { icon: "◇", label: "Branch", color: "#c084fc" },
              { icon: "⫽", label: "Parallel", color: "#86efac" },
              { icon: "↻", label: "Retry", color: "#60a5fa" },
              { icon: "⚡", label: "Catch", color: "#fb923c" },
            ].map(item => (
              <span key={item.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="flex h-4 w-4 items-center justify-center rounded text-[8px]" style={{ backgroundColor: item.color + "25", color: item.color }}>{item.icon}</span>
                {item.label}
              </span>
            ))}
            <span className="mx-1 h-3 w-px bg-slate-300" />
            {comparison && (
              <>
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Exact
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Review
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Gap
                </span>
              </>
            )}
          </div>

          {/* Dual Graph */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <GraphPanel
              title="Source Workflow"
              platformColor={sourcePlatform.color}
              platformLabel={sourcePlatform.label}
              nodes={sourceGraph.nodes}
              edges={sourceGraph.edges}
            />
            <GraphPanel
              title="Migrated Workflow"
              platformColor={targetPlatform.color}
              platformLabel={targetPlatform.label}
              nodes={targetGraph.nodes}
              edges={targetGraph.edges}
            />
          </div>

          {/* Mapping Summary Table */}
          {mappingLines.length > 0 && (
            <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-100">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Step Mapping Summary
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {mappingLines.map(line => (
                  <div key={line.sourceStep} className="flex items-center gap-3 px-4 py-1.5">
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: STATUS_RING[line.status] }}
                    />
                    <span className="text-[11px] font-medium text-slate-600 min-w-0 flex-1 truncate">
                      {line.sourceStep}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2">
                      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                    </svg>
                    <span className="text-[11px] font-medium text-slate-600 min-w-0 flex-1 truncate">
                      {line.targetStep}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
