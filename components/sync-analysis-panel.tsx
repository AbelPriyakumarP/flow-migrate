"use client";

import { useState, useMemo } from "react";
import {
  SyncAnalysisResult,
  SyncPatternType,
  PATTERN_LABELS,
  SyncStrategy,
  PollingRequirement,
  CompletionValidation,
  analyzeSynchronization,
} from "@/lib/sync-analyzer";

interface Props {
  open: boolean;
  onClose: () => void;
  sourceCode: string;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

const PAT_COLORS: Record<SyncPatternType, string> = {
  "synchronous-job": "#3b82f6",
  "long-running-job": "#f59e0b",
  "polling-pattern": "#8b5cf6",
  "completion-check": "#10b981",
  "wait-state": "#06b6d4",
  "barrier-sync": "#ef4444",
  "callback-wait": "#f97316",
  "timeout-guard": "#ec4899",
};

const PAT_ICONS: Record<SyncPatternType, string> = {
  "synchronous-job": "⏳",
  "long-running-job": "⏱",
  "polling-pattern": "🔄",
  "completion-check": "✓",
  "wait-state": "⏸",
  "barrier-sync": "⫘",
  "callback-wait": "📞",
  "timeout-guard": "⏰",
};

type TabId = "summary" | "strategies" | "polling" | "validation";

export default function SyncAnalysisPanel({ open, onClose, sourceCode, outputCode, direction }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const result = useMemo<SyncAnalysisResult | null>(() => {
    if (!open || !sourceCode) return null;
    try {
      return analyzeSynchronization(sourceCode, outputCode, direction);
    } catch {
      return null;
    }
  }, [open, sourceCode, outputCode, direction]);

  if (!open) return null;

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadAll = () => {
    if (!result) return;
    const all = result.strategies
      .map((s) => `// ═══ ${s.name} ═══\n// Source: ${s.sourcePattern}\n// Target: ${s.targetPattern}\n// Risk: ${s.riskLevel}\n// Preserves semantics: ${s.preservesSemantics}\n\n${s.targetCode}`)
      .join("\n\n\n");
    const blob = new Blob([all], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sync_strategies_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "summary", label: "Summary" },
    { id: "strategies", label: "Strategies", count: result?.strategies.length },
    { id: "polling", label: "Polling", count: result?.pollingRequirements.length },
    { id: "validation", label: "Validation", count: result?.completionValidations.length },
  ];

  const confColor = (c: number) => c >= 0.8 ? "#10b981" : c >= 0.6 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "94vw", maxWidth: 1400, height: "90vh", background: "#0f1117", borderRadius: 16, border: "1px solid #1e293b", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "20px 28px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⏳</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Synchronization Analyzer</h2>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Completion semantics → Polling → Barriers → Execution order</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {result && (
              <>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, background: `${confColor(result.overallConfidence)}18`, color: confColor(result.overallConfidence), border: `1px solid ${confColor(result.overallConfidence)}40` }}>
                  Confidence: {Math.round(result.overallConfidence * 100)}%
                </div>
                <button onClick={downloadAll} style={{ padding: "6px 14px", borderRadius: 8, background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Download All</button>
              </>
            )}
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: "#1e293b", color: "#94a3b8", border: "none", cursor: "pointer", fontSize: 18 }}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, padding: "0 28px", borderBottom: "1px solid #1e293b", background: "#0a0d14" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: "12px 20px", background: "transparent", border: "none",
              borderBottom: activeTab === t.id ? "2px solid #3b82f6" : "2px solid transparent",
              color: activeTab === t.id ? "#60a5fa" : "#64748b",
              cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
            }}>
              {t.label}
              {t.count !== undefined && <span style={{ padding: "1px 7px", borderRadius: 10, background: activeTab === t.id ? "#3b82f618" : "#1e293b", fontSize: 11 }}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
          {!result ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: 60, fontSize: 14 }}>Paste source workflow code to analyze synchronization patterns</div>
          ) : activeTab === "summary" ? (
            <SummaryTab result={result} />
          ) : activeTab === "strategies" ? (
            <StrategiesTab strategies={result.strategies} expanded={expandedStrategy} onToggle={(id) => setExpandedStrategy(expandedStrategy === id ? null : id)} copiedId={copiedId} onCopy={copyCode} />
          ) : activeTab === "polling" ? (
            <PollingTab requirements={result.pollingRequirements} />
          ) : (
            <ValidationTab validations={result.completionValidations} />
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryTab({ result }: { result: SyncAnalysisResult }) {
  const { summary, overallConfidence, executionOrder } = result;

  const stats = [
    { label: "Sync Constructs", value: summary.totalConstructs, color: "#3b82f6" },
    { label: "Synchronous", value: summary.synchronousCount, color: "#10b981" },
    { label: "Long-Running", value: summary.longRunningCount, color: "#f59e0b" },
    { label: "Polling Required", value: summary.pollingRequired, color: "#8b5cf6" },
    { label: "Barrier Points", value: summary.barrierPoints, color: "#ef4444" },
    { label: "Chain Depth", value: summary.maxChainDepth, color: "#06b6d4" },
  ];

  const categories = Object.entries(summary.byPattern).filter(([, c]) => c > 0) as [SyncPatternType, number][];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ padding: 18, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* Confidence ring */}
        <div style={{ flex: "0 0 200px", padding: 24, borderRadius: 12, background: "#131620", border: "1px solid #1e293b", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <svg width={120} height={120} viewBox="0 0 120 120">
            <circle cx={60} cy={60} r={52} fill="none" stroke="#1e293b" strokeWidth={8} />
            <circle cx={60} cy={60} r={52} fill="none" stroke={overallConfidence >= 0.8 ? "#10b981" : overallConfidence >= 0.6 ? "#f59e0b" : "#ef4444"} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${overallConfidence * 327} 327`} transform="rotate(-90 60 60)" />
            <text x={60} y={55} textAnchor="middle" fill="#f1f5f9" fontSize={24} fontWeight={800}>{Math.round(overallConfidence * 100)}</text>
            <text x={60} y={72} textAnchor="middle" fill="#64748b" fontSize={11}>confidence</text>
          </svg>
        </div>

        {/* Pattern breakdown */}
        <div style={{ flex: 1, padding: 20, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Pattern Breakdown</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {categories.map(([pat, count]) => (
              <div key={pat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, width: 24, textAlign: "center" }}>{PAT_ICONS[pat]}</span>
                <span style={{ flex: 1, fontSize: 13, color: "#e2e8f0" }}>{PATTERN_LABELS[pat]}</span>
                <div style={{ width: 120, height: 6, borderRadius: 3, background: "#1e293b", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min((count / summary.totalConstructs) * 100, 100)}%`, height: "100%", borderRadius: 3, background: PAT_COLORS[pat] }} />
                </div>
                <span style={{ fontSize: 12, color: PAT_COLORS[pat], fontWeight: 600, width: 28, textAlign: "right" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {summary.warnings.length > 0 && (
        <div style={{ padding: 16, borderRadius: 12, background: "#f59e0b08", border: "1px solid #f59e0b30" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b", marginBottom: 8 }}>Warnings</div>
          {summary.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 13, color: "#fbbf24", marginBottom: 4, paddingLeft: 16, position: "relative" }}>
              <span style={{ position: "absolute", left: 0 }}>⚠</span> {w}
            </div>
          ))}
        </div>
      )}

      {/* Execution order */}
      {executionOrder.length > 0 && (
        <div style={{ padding: 20, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Execution Order</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {executionOrder.map((name, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ padding: "6px 14px", borderRadius: 8, background: "#3b82f612", border: "1px solid #3b82f630", fontSize: 12, fontWeight: 600, color: "#60a5fa", fontFamily: "monospace" }}>
                  {i + 1}. {name}
                </div>
                {i < executionOrder.length - 1 && (
                  <span style={{ color: "#475569", fontSize: 16 }}>→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Construct details */}
      <div style={{ padding: 20, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Sync Constructs</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflow: "auto" }}>
          {result.constructs.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "#0f1117" }}>
              <span style={{ fontSize: 15 }}>{PAT_ICONS[c.patternType]}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${PAT_COLORS[c.patternType]}20`, color: PAT_COLORS[c.patternType] }}>{PATTERN_LABELS[c.patternType]}</span>
              <span style={{ flex: 1, fontSize: 13, color: "#e2e8f0", fontFamily: "monospace" }}>{c.name}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: c.estimatedDuration === "unbounded" ? "#ef444420" : c.estimatedDuration === "long" ? "#f59e0b20" : "#64748b20", color: c.estimatedDuration === "unbounded" ? "#ef4444" : c.estimatedDuration === "long" ? "#f59e0b" : "#94a3b8" }}>{c.estimatedDuration}</span>
              {c.timeoutSeconds && <span style={{ fontSize: 11, color: "#64748b" }}>{c.timeoutSeconds}s</span>}
              <span style={{ fontSize: 12, color: "#64748b" }}>{Math.round(c.confidence * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StrategiesTab({
  strategies, expanded, onToggle, copiedId, onCopy,
}: {
  strategies: SyncStrategy[];
  expanded: string | null;
  onToggle: (id: string) => void;
  copiedId: string | null;
  onCopy: (code: string, id: string) => void;
}) {
  const riskColors = { low: "#10b981", medium: "#f59e0b", high: "#ef4444" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 8 }}>
        {(["low", "medium", "high"] as const).map((risk) => (
          <div key={risk} style={{ padding: 14, borderRadius: 10, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: riskColors[risk] }}>{strategies.filter((s) => s.riskLevel === risk).length}</div>
            <div style={{ fontSize: 12, color: "#64748b", textTransform: "capitalize" }}>{risk} Risk</div>
          </div>
        ))}
      </div>

      {strategies.map((s) => (
        <div key={s.constructId} style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
          <div onClick={() => onToggle(s.constructId)} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 16, transform: expanded === s.constructId ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s" }}>▶</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", fontFamily: "monospace" }}>{s.name}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{s.sourcePattern} → {s.targetPattern}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {s.preservesSemantics && <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#10b98118", color: "#10b981" }}>Preserved</span>}
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${riskColors[s.riskLevel]}18`, color: riskColors[s.riskLevel] }}>{s.riskLevel} risk</span>
            </div>
          </div>

          {expanded === s.constructId && (
            <div style={{ borderTop: "1px solid #1e293b" }}>
              <div style={{ padding: "12px 20px", fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 }}>{s.explanation}</div>
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 16px 0", gap: 8 }}>
                <button onClick={() => onCopy(s.targetCode, s.constructId)} style={{ padding: "4px 12px", borderRadius: 6, background: "#1e293b", color: copiedId === s.constructId ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  {copiedId === s.constructId ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre style={{ margin: 0, padding: "12px 20px 20px", fontSize: 12, lineHeight: 1.6, color: "#60a5fa", overflow: "auto", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
                {s.targetCode}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PollingTab({ requirements }: { requirements: PollingRequirement[] }) {
  const backoffColors = { fixed: "#3b82f6", linear: "#f59e0b", exponential: "#8b5cf6" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 8 }}>
        {(["fixed", "linear", "exponential"] as const).map((b) => (
          <div key={b} style={{ padding: 14, borderRadius: 10, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: backoffColors[b] }}>{requirements.filter((r) => r.backoffStrategy === b).length}</div>
            <div style={{ fontSize: 12, color: "#64748b", textTransform: "capitalize" }}>{b} Backoff</div>
          </div>
        ))}
      </div>

      {requirements.map((r) => (
        <div key={r.id} style={{ padding: 18, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 15 }}>🔄</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", fontFamily: "monospace" }}>{r.actionName}</span>
            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${backoffColors[r.backoffStrategy]}18`, color: backoffColors[r.backoffStrategy] }}>{r.backoffStrategy}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
            {[
              { label: "Interval", value: `${r.intervalSeconds}s` },
              { label: "Max Attempts", value: r.maxAttempts },
              { label: "Timeout", value: `${r.timeoutSeconds}s` },
              { label: "Method", value: r.method },
            ].map((item) => (
              <div key={item.label} style={{ padding: "8px 12px", borderRadius: 8, background: "#0f1117" }}>
                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", fontFamily: "monospace" }}>{item.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, marginBottom: 10 }}>
            <div><span style={{ color: "#64748b" }}>Success: </span><span style={{ color: "#10b981", fontFamily: "monospace" }}>{r.successCondition}</span></div>
            <div><span style={{ color: "#64748b" }}>Failure: </span><span style={{ color: "#ef4444", fontFamily: "monospace" }}>{r.failureCondition}</span></div>
          </div>
          <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace" }}>{r.endpoint}</div>
        </div>
      ))}

      {requirements.length === 0 && (
        <div style={{ textAlign: "center", color: "#64748b", padding: 40, fontSize: 14 }}>No polling requirements detected — all operations complete synchronously or via callbacks</div>
      )}
    </div>
  );
}

function ValidationTab({ validations }: { validations: CompletionValidation[] }) {
  const sevColors = { critical: "#ef4444", warning: "#f59e0b", info: "#3b82f6" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 8 }}>
        {[
          { label: "Critical", count: validations.filter((v) => v.severity === "critical").length, color: "#ef4444" },
          { label: "Warning", count: validations.filter((v) => v.severity === "warning").length, color: "#f59e0b" },
          { label: "Auto-Enforce", count: validations.filter((v) => v.autoEnforce).length, color: "#10b981" },
        ].map((s) => (
          <div key={s.label} style={{ padding: 14, borderRadius: 10, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {validations.map((v) => (
        <div key={v.id} style={{ padding: 16, borderRadius: 10, background: "#131620", border: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${sevColors[v.severity]}20`, color: sevColors[v.severity] }}>{v.severity.toUpperCase()}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", fontFamily: "monospace" }}>{v.name}</span>
            {v.autoEnforce && <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#10b98118", color: "#10b981" }}>Auto-enforce</span>}
          </div>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#cbd5e1" }}>{v.description}</p>
          <code style={{ fontSize: 12, color: "#818cf8", fontFamily: "monospace" }}>{v.expression}</code>
          {v.enforcementCode && (
            <pre style={{ margin: "8px 0 0", padding: 10, borderRadius: 6, background: "#0a0d14", fontSize: 11, color: "#60a5fa", fontFamily: "monospace" }}>{v.enforcementCode}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
