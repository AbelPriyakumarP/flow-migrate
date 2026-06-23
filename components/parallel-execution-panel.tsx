"use client";

import { useState, useMemo, useCallback } from "react";
import {
  analyzeParallelExecution,
  type ParallelAnalysisResult,
  type ParallelConstruct,
  type DependencyEdge,
  type ExecutionMode,
  type ParallelPatternType,
} from "@/lib/parallel-analyzer";

interface ParallelExecutionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sourceCode: string;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

const PATTERN_LABELS: Record<ParallelPatternType, { label: string; color: string }> = {
  "map-state": { label: "Map State", color: "#8b5cf6" },
  "parallel-state": { label: "Parallel State", color: "#6366f1" },
  "concurrent-branches": { label: "Concurrent Branches", color: "#0ea5e9" },
  "fan-out-fan-in": { label: "Fan-Out / Fan-In", color: "#22d3ee" },
  "distributed-processing": { label: "Distributed Processing", color: "#10b981" },
  "foreach-parallel": { label: "Foreach Parallel", color: "#f59e0b" },
  "scope-parallel": { label: "Scope Parallel", color: "#ec4899" },
  "nested-parallel": { label: "Nested Parallel", color: "#ef4444" },
};

const MODE_CONFIG: Record<ExecutionMode, { label: string; color: string; icon: string }> = {
  "truly-parallel": { label: "Truly Parallel", color: "var(--success)", icon: "⟶⟶" },
  "dependency-bound": { label: "Dependency-Bound", color: "var(--warning)", icon: "⟶|" },
  "sequential": { label: "Sequential", color: "var(--error)", icon: "→" },
  "conditional": { label: "Conditional", color: "var(--accent)", icon: "?→" },
};

type ActiveTab = "graph" | "source-model" | "target-model" | "constructs";

export default function ParallelExecutionPanel({ isOpen, onClose, sourceCode, outputCode, direction }: ParallelExecutionPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("graph");
  const [selectedConstruct, setSelectedConstruct] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ParallelAnalysisResult | null>(null);

  const handleAnalyze = useCallback(() => {
    setAnalyzing(true);
    setSelectedConstruct(null);
    setTimeout(() => {
      const analysis = analyzeParallelExecution(sourceCode, outputCode, direction);
      setResult(analysis);
      setAnalyzing(false);
    }, 800);
  }, [sourceCode, outputCode, direction]);

  const selectedData = useMemo(() => {
    if (!result || !selectedConstruct) return null;
    return result.constructs.find((c) => c.id === selectedConstruct) || null;
  }, [result, selectedConstruct]);

  const confidenceColor = (score: number) =>
    score >= 85 ? "var(--success)" : score >= 65 ? "var(--warning)" : "var(--error)";

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={onClose} />
      <div className="fixed inset-4 sm:inset-6 z-50 flex flex-col rounded-2xl overflow-hidden" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-elevated)" }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" />
                <path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" />
              </svg>
            </div>
            <div>
              <h2 className="text-[16px] font-bold" style={{ color: "var(--text-bright)" }}>Parallel Execution Analysis</h2>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {result ? `${result.constructs.length} parallel construct(s) detected — ${result.overallConfidence}% confidence` : "Analyze concurrency patterns and dependency graphs"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result && (
              <div className="flex items-center gap-2 mr-3">
                <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Confidence</span>
                <div className="flex items-center gap-1.5 rounded-full px-3 py-1" style={{ background: `${confidenceColor(result.overallConfidence)}15`, border: `1px solid ${confidenceColor(result.overallConfidence)}30` }}>
                  <div className="h-2 w-2 rounded-full" style={{ background: confidenceColor(result.overallConfidence) }} />
                  <span className="text-[12px] font-bold" style={{ color: confidenceColor(result.overallConfidence) }}>{result.overallConfidence}%</span>
                </div>
              </div>
            )}
            <button onClick={handleAnalyze} disabled={!sourceCode || !outputCode || analyzing} className="flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-bold transition-all disabled:opacity-40" style={{ background: "var(--accent-gradient)", color: "white" }}>
              {analyzing ? (
                <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Analyzing...</>
              ) : (
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg> {result ? "Re-analyze" : "Analyze"}</>
              )}
            </button>
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[var(--hover-bg)] transition-colors" style={{ color: "var(--text-muted)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
            </button>
          </div>
        </div>

        {!result ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" />
                <path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" />
              </svg>
            </div>
            <p className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Analyze parallel execution</p>
            <p className="text-[12px] text-center max-w-md" style={{ color: "var(--text-muted)" }}>
              Detects Map states, Parallel states, concurrent branches, fan-out/fan-in patterns, and distributed processing steps.
              Compares source and target concurrency models with confidence scoring.
            </p>
          </div>
        ) : (
          <>
            {/* Tab Bar */}
            <div className="shrink-0 flex items-center gap-1 border-b px-6 py-1" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-card)" }}>
              {([
                { id: "graph" as ActiveTab, label: "Execution Graph", count: result.dependencyGraph.length },
                { id: "source-model" as ActiveTab, label: `Source (${result.sourceConcurrencyModel.platform.toUpperCase()})`, count: result.sourceConcurrencyModel.constructs.length },
                { id: "target-model" as ActiveTab, label: `Target (${result.targetConcurrencyModel.platform.toUpperCase()})`, count: result.targetConcurrencyModel.constructs.length },
                { id: "constructs" as ActiveTab, label: "All Constructs", count: result.constructs.length },
              ]).map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all" style={{ background: activeTab === tab.id ? "var(--accent-bg)" : "transparent", color: activeTab === tab.id ? "var(--accent)" : "var(--text-muted)", border: activeTab === tab.id ? "1px solid var(--border-primary)" : "1px solid transparent" }}>
                  {tab.label}
                  <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: activeTab === tab.id ? `var(--accent)` : "var(--border-subtle)", color: activeTab === tab.id ? "white" : "var(--text-muted)" }}>{tab.count}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Main Content */}
              <div className="flex-1 overflow-y-auto p-5">

                {/* Graph Tab */}
                {activeTab === "graph" && (
                  <div className="space-y-4">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-4 gap-3">
                      <StatCard label="Parallel Paths" value={result.sourceConcurrencyModel.totalParallelPaths} color="var(--accent)" />
                      <StatCard label="Max Depth" value={result.sourceConcurrencyModel.maxParallelDepth} color="var(--success)" />
                      <StatCard label="Est. Speedup" value={`${result.sourceConcurrencyModel.estimatedSpeedup}x`} color="#8b5cf6" />
                      <StatCard label="Confidence" value={`${result.overallConfidence}%`} color={confidenceColor(result.overallConfidence)} />
                    </div>

                    {/* Dependency Graph Visualization */}
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
                      <div className="px-5 py-3 flex items-center justify-between" style={{ background: "var(--bg-card)" }}>
                        <span className="text-[11px] font-bold" style={{ color: "var(--text-primary)" }}>Dependency Graph</span>
                        <div className="flex items-center gap-3">
                          {(["parallel", "sequential", "fan-out", "fan-in", "conditional"] as const).map((type) => {
                            const count = result.dependencyGraph.filter((e) => e.type === type).length;
                            if (count === 0) return null;
                            const colors: Record<string, string> = { parallel: "#6366f1", sequential: "var(--text-muted)", "fan-out": "#10b981", "fan-in": "#22d3ee", conditional: "#f59e0b" };
                            return (
                              <div key={type} className="flex items-center gap-1">
                                <div className="h-2 w-6 rounded-full" style={{ background: colors[type] }} />
                                <span className="text-[9px] font-semibold capitalize" style={{ color: "var(--text-muted)" }}>{type} ({count})</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="p-5 space-y-1.5" style={{ background: "var(--editor-bg)" }}>
                        {result.dependencyGraph.length === 0 ? (
                          <p className="text-[12px] text-center py-8" style={{ color: "var(--text-muted)" }}>No dependency edges — workflow is fully sequential</p>
                        ) : (
                          result.dependencyGraph.map((edge, i) => (
                            <GraphEdge key={i} edge={edge} />
                          ))
                        )}
                      </div>
                    </div>

                    {/* Summary & Warnings */}
                    {result.summary.length > 0 && (
                      <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)" }}>Analysis Summary</span>
                        {result.summary.map((s, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <div className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--success)" }} />
                            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{s}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {result.warnings.length > 0 && (
                      <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--warning-bg)", border: "1px solid rgba(251,191,36,0.15)" }}>
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--warning)" }}>Warnings</span>
                        {result.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" className="shrink-0 mt-0.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" /></svg>
                            <p className="text-[11px]" style={{ color: "var(--warning)" }}>{w}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Source Model Tab */}
                {activeTab === "source-model" && (
                  <ConcurrencyModelView model={result.sourceConcurrencyModel} label="Source" />
                )}

                {/* Target Model Tab */}
                {activeTab === "target-model" && (
                  <ConcurrencyModelView model={result.targetConcurrencyModel} label="Target" />
                )}

                {/* All Constructs Tab */}
                {activeTab === "constructs" && (
                  <div className="space-y-3">
                    {result.constructs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <p className="text-[14px] font-semibold" style={{ color: "var(--text-muted)" }}>No parallel constructs detected</p>
                        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>The workflow appears to be fully sequential</p>
                      </div>
                    ) : (
                      result.constructs.map((c) => (
                        <ConstructCard key={c.id} construct={c} isSelected={selectedConstruct === c.id} onClick={() => setSelectedConstruct(selectedConstruct === c.id ? null : c.id)} />
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Detail Sidebar */}
              {selectedData && (
                <div className="w-80 shrink-0 border-l overflow-y-auto p-5 space-y-4" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold" style={{ color: "var(--text-bright)" }}>{selectedData.name}</span>
                    <button onClick={() => setSelectedConstruct(null)} className="flex h-6 w-6 items-center justify-center rounded-lg hover:bg-[var(--hover-bg)]" style={{ color: "var(--text-muted)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: `${PATTERN_LABELS[selectedData.patternType].color}15`, color: PATTERN_LABELS[selectedData.patternType].color }}>{PATTERN_LABELS[selectedData.patternType].label}</span>
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: `${MODE_CONFIG[selectedData.executionMode].color}15`, color: MODE_CONFIG[selectedData.executionMode].color }}>{MODE_CONFIG[selectedData.executionMode].label}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat label="Max Concurrency" value={selectedData.maxConcurrency === -1 ? "∞" : String(selectedData.maxConcurrency)} />
                    <MiniStat label="Branches" value={String(selectedData.branches.length)} />
                    <MiniStat label="Depth" value={String(selectedData.depth)} />
                    <MiniStat label="Confidence" value={`${selectedData.confidenceScore}%`} />
                  </div>

                  {/* Branches */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)" }}>Branches</span>
                    {selectedData.branches.map((b, i) => (
                      <div key={i} className="rounded-lg px-3 py-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold" style={{ color: "var(--text-primary)" }}>{b.name}</span>
                          <span className="text-[9px] rounded px-1.5 py-0.5" style={{ background: b.estimatedDuration === "slow" ? "var(--danger-bg)" : b.estimatedDuration === "medium" ? "var(--warning-bg)" : "var(--success-bg)", color: b.estimatedDuration === "slow" ? "var(--error)" : b.estimatedDuration === "medium" ? "var(--warning)" : "var(--success)" }}>{b.estimatedDuration}</span>
                        </div>
                        <p className="text-[9px] mt-1" style={{ color: "var(--text-muted)" }}>{b.actionCount} action(s) {b.hasSideEffects ? "• has side effects" : ""}</p>
                      </div>
                    ))}
                  </div>

                  {/* Dependencies */}
                  {selectedData.dependencies.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)" }}>Depends On</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedData.dependencies.map((d) => (
                          <span key={d} className="rounded px-2 py-0.5 text-[9px] font-mono" style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>{d}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {selectedData.notes.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)" }}>Analysis Notes</span>
                      {selectedData.notes.map((n, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                          <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{n}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
      <span className="text-[22px] font-bold block" style={{ color }}>{value}</span>
      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
      <span className="text-[14px] font-bold block" style={{ color: "var(--text-bright)" }}>{value}</span>
      <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

function GraphEdge({ edge }: { edge: DependencyEdge }) {
  const colors: Record<string, string> = {
    parallel: "#6366f1", sequential: "var(--text-muted)",
    "fan-out": "#10b981", "fan-in": "#22d3ee", conditional: "#f59e0b",
  };
  const arrows: Record<string, string> = {
    parallel: "═══", sequential: "───", "fan-out": "──╦", "fan-in": "╩──", conditional: "─?─",
  };

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-1.5 font-mono text-[10px]" style={{ background: `${colors[edge.type]}06` }}>
      <span className="font-bold truncate w-32 text-right" style={{ color: "var(--text-primary)" }}>{edge.from}</span>
      <span className="w-12 text-center font-bold" style={{ color: colors[edge.type] }}>{arrows[edge.type]}</span>
      <span className="font-bold truncate w-32" style={{ color: "var(--text-primary)" }}>{edge.to}</span>
      <span className="ml-auto rounded px-1.5 py-0.5 text-[8px] font-bold capitalize" style={{ background: `${colors[edge.type]}15`, color: colors[edge.type] }}>{edge.type}</span>
    </div>
  );
}

function ConstructCard({ construct, isSelected, onClick }: { construct: ParallelConstruct; isSelected: boolean; onClick: () => void }) {
  const pattern = PATTERN_LABELS[construct.patternType];
  const mode = MODE_CONFIG[construct.executionMode];

  return (
    <button onClick={onClick} className="w-full text-left rounded-xl p-4 transition-all" style={{ background: isSelected ? "var(--accent-bg)" : "var(--bg-card)", border: `1px solid ${isSelected ? "var(--border-primary)" : "var(--border-subtle)"}` }}>
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${pattern.color}15` }}>
          <div className="h-3 w-3 rounded-full" style={{ background: pattern.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold truncate" style={{ color: "var(--text-bright)" }}>{construct.name}</span>
            <span className="rounded-full px-2 py-0.5 text-[8px] font-bold shrink-0" style={{ background: `${pattern.color}15`, color: pattern.color }}>{pattern.label}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-semibold" style={{ color: mode.color }}>{mode.label}</span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>•</span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {construct.maxConcurrency === -1 ? "Unlimited" : `Max ${construct.maxConcurrency}`} concurrency
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>•</span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{construct.branches.length} branch(es)</span>
          </div>
        </div>
        <div className="flex flex-col items-center shrink-0">
          <span className="text-[14px] font-bold" style={{ color: construct.confidenceScore >= 85 ? "var(--success)" : construct.confidenceScore >= 65 ? "var(--warning)" : "var(--error)" }}>{construct.confidenceScore}%</span>
          <span className="text-[8px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Confidence</span>
        </div>
      </div>
    </button>
  );
}

function ConcurrencyModelView({ model, label }: { model: ReturnType<typeof analyzeParallelExecution>["sourceConcurrencyModel"]; label: string }) {
  return (
    <div className="space-y-4">
      {/* Platform Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Platform" value={model.platform.toUpperCase()} color="var(--accent)" />
        <StatCard label="Max Concurrency" value={model.globalMaxConcurrency} color="var(--success)" />
        <StatCard label="Parallel Paths" value={model.totalParallelPaths} color="#8b5cf6" />
        <StatCard label="Est. Speedup" value={`${model.estimatedSpeedup}x`} color="#f59e0b" />
      </div>

      {/* Construct Concurrency Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
        <div className="px-5 py-3" style={{ background: "var(--bg-card)" }}>
          <span className="text-[11px] font-bold" style={{ color: "var(--text-primary)" }}>{label} Concurrency Configuration</span>
        </div>

        {model.constructs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No parallel constructs in {label.toLowerCase()} workflow</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {/* Table Header */}
            <div className="grid grid-cols-5 gap-3 px-5 py-2" style={{ background: "var(--bg-surface)" }}>
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Construct</span>
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Type</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-center" style={{ color: "var(--text-muted)" }}>Max</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-center" style={{ color: "var(--text-muted)" }}>Configured</span>
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Recommendation</span>
            </div>

            {model.constructs.map((c) => (
              <div key={c.constructId} className="grid grid-cols-5 gap-3 px-5 py-3 items-center" style={{ borderColor: "var(--border-subtle)" }}>
                <span className="text-[11px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{c.name}</span>
                <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{c.concurrencyType}</span>
                <span className="text-[11px] font-bold text-center" style={{ color: "var(--text-bright)" }}>{c.maxConcurrency === -1 ? "∞" : c.maxConcurrency}</span>
                <div className="text-center">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{
                    background: c.configuredValue === "unlimited" ? "rgba(251,113,133,0.08)" : c.configuredValue === "default" ? "var(--warning-bg)" : "var(--success-bg)",
                    color: c.configuredValue === "unlimited" ? "var(--error)" : c.configuredValue === "default" ? "var(--warning)" : "var(--success)",
                  }}>
                    {c.configuredValue === "unlimited" ? "∞" : c.configuredValue === "default" ? "default" : c.configuredValue}
                  </span>
                </div>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{c.recommendation}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
