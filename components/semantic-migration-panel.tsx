"use client";

import { useState, useMemo } from "react";
import {
  analyzeSemanticMigration,
  type SemanticMigrationReport,
  type MigrationRisk,
  type ArchitectureRecommendation,
  type ValidationSpec,
  type TransformationSpec,
  type ExecutionNode,
  type MigrationPhase,
  type RiskSeverity,
  PHASE_LABELS,
  ARCH_LABELS,
} from "@/lib/semantic-migration-analyzer";

interface Props {
  open: boolean;
  onClose: () => void;
  sourceCode: string;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

type TabId = "overview" | "risks" | "architecture" | "transforms" | "validations" | "graph";

const SEV_COLORS: Record<RiskSeverity, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#3b82f6", info: "#64748b",
};

const PHASE_COLORS: Record<MigrationPhase, string> = {
  assessment: "#8b5cf6", bronze: "#a16207", silver: "#94a3b8", gold: "#f59e0b",
  orchestration: "#3b82f6", validation: "#10b981", cutover: "#ef4444",
};

const STATUS_ICONS: Record<string, string> = {
  complete: "✓", partial: "◐", pending: "○", blocked: "✕",
};

export default function SemanticMigrationPanel({ open, onClose, sourceCode, outputCode, direction }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const report = useMemo<SemanticMigrationReport | null>(() => {
    if (!open || !sourceCode) return null;
    try {
      return analyzeSemanticMigration(sourceCode, outputCode, direction);
    } catch {
      return null;
    }
  }, [open, sourceCode, outputCode, direction]);

  if (!open) return null;

  const downloadReport = () => {
    if (!report) return;
    const s = report.migrationSummary;
    const lines = [
      "# Semantic Migration Report",
      `Direction: ${direction}`,
      `Overall Confidence: ${Math.round(report.overallConfidence * 100)}%`,
      `Total Steps: ${s.totalSteps}`,
      "",
      "## Summary",
      `- Business Logic Preserved: ${s.preservedBusinessLogic}`,
      `- Dependencies Preserved: ${s.preservedDependencies}`,
      `- Parallelism Preserved: ${s.preservedParallelism}`,
      `- Error Handling Preserved: ${s.preservedErrorHandling}`,
      `- Validations Generated: ${s.preservedValidations}`,
      `- Monitoring Preserved: ${s.preservedMonitoring}`,
      `- Modernized Transforms: ${s.modernizedTransforms}`,
      `- Platform Deps Removed: ${s.removedPlatformDeps}`,
      `- Cloud-Native Recs: ${s.generatedCloudNative}`,
      `- Auto-Resolvable Risks: ${s.autoResolvableRisks}`,
      `- Manual Review Required: ${s.manualReviewRequired}`,
      "",
      "## Phase Status",
      ...Object.entries(s.byPhase).map(
        ([phase, ps]) => `- ${ps.label}: ${ps.status} (${Math.round(ps.confidence * 100)}% confidence, ${ps.risks} risks, ${ps.itemCount} items)`
      ),
      "",
      "## Migration Risks",
      ...report.risks.map(
        (r) => `- [${r.severity.toUpperCase()}] ${r.title}: ${r.description}\n  Mitigation: ${r.mitigation}`
      ),
      "",
      "## Architecture Recommendations",
      ...report.architectureRecommendations.map(
        (a) => `- [${a.category}] ${a.title}: ${a.description}`
      ),
      "",
      "## Validation Specifications",
      ...report.validationSpecs.map(
        (v) => `- [${v.phase}/${v.type}] ${v.name}: ${v.description} (auto: ${v.autoEnforceable})`
      ),
      "",
      "## Warnings",
      ...s.warnings.map((w) => `- ${w}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `semantic_migration_report_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confColor = (c: number) => c >= 0.8 ? "#10b981" : c >= 0.6 ? "#f59e0b" : "#ef4444";

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Migration Report" },
    { id: "risks", label: "Risks", count: report?.risks.length },
    { id: "architecture", label: "Architecture", count: report?.architectureRecommendations.length },
    { id: "transforms", label: "Transforms", count: report?.transformationSpecs.length },
    { id: "validations", label: "Validations", count: report?.validationSpecs.length },
    { id: "graph", label: "Execution Graph", count: report?.executionGraph.length },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "96vw", maxWidth: 1500, height: "92vh", background: "#0f1117", borderRadius: 16, border: "1px solid #1e293b", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "20px 28px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #8b5cf6, #3b82f6, #10b981)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🧠</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: "#f1f5f9" }}>Semantic Migration Engine</h2>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Assess → Transform → Orchestrate → Validate → Cutover</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {report && (
              <>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, background: `${confColor(report.overallConfidence)}18`, color: confColor(report.overallConfidence), border: `1px solid ${confColor(report.overallConfidence)}40` }}>
                  {Math.round(report.overallConfidence * 100)}% Confidence
                </div>
                <button onClick={downloadReport} style={{ padding: "6px 14px", borderRadius: 8, background: "linear-gradient(135deg, #8b5cf6, #3b82f6)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Export Full Report</button>
              </>
            )}
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: "#1e293b", color: "#94a3b8", border: "none", cursor: "pointer", fontSize: 18 }}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, padding: "0 28px", borderBottom: "1px solid #1e293b", background: "#0a0d14", overflowX: "auto" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: "12px 18px", background: "transparent", border: "none",
              borderBottom: activeTab === t.id ? "2px solid #8b5cf6" : "2px solid transparent",
              color: activeTab === t.id ? "#a78bfa" : "#64748b",
              cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
            }}>
              {t.label}
              {t.count !== undefined && <span style={{ padding: "1px 7px", borderRadius: 10, background: activeTab === t.id ? "#8b5cf618" : "#1e293b", fontSize: 11 }}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
          {!report ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: 60, fontSize: 14 }}>Paste source workflow code and run migration to analyze</div>
          ) : activeTab === "overview" ? (
            <OverviewTab report={report} />
          ) : activeTab === "risks" ? (
            <RisksTab risks={report.risks} />
          ) : activeTab === "architecture" ? (
            <ArchTab recs={report.architectureRecommendations} />
          ) : activeTab === "transforms" ? (
            <TransformTab specs={report.transformationSpecs} />
          ) : activeTab === "validations" ? (
            <ValidationsTab specs={report.validationSpecs} />
          ) : (
            <GraphTab nodes={report.executionGraph} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewTab({ report }: { report: SemanticMigrationReport }) {
  const s = report.migrationSummary;

  const kpis = [
    { label: "Business Logic", value: s.preservedBusinessLogic, icon: "🏢", color: "#8b5cf6" },
    { label: "Dependencies", value: s.preservedDependencies, icon: "🔗", color: "#3b82f6" },
    { label: "Parallelism", value: s.preservedParallelism, icon: "⚡", color: "#f59e0b" },
    { label: "Error Handling", value: s.preservedErrorHandling, icon: "🛡", color: "#10b981" },
    { label: "Validations", value: s.preservedValidations, icon: "✓", color: "#06b6d4" },
    { label: "Monitoring", value: s.preservedMonitoring, icon: "📡", color: "#f97316" },
    { label: "Transforms", value: s.modernizedTransforms, icon: "🔄", color: "#ec4899" },
    { label: "Deps Removed", value: s.removedPlatformDeps, icon: "🧹", color: "#ef4444" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ padding: 16, borderRadius: 12, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>{k.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Overall confidence + risk summary */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 200px", padding: 24, borderRadius: 12, background: "#131620", border: "1px solid #1e293b", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <svg width={130} height={130} viewBox="0 0 130 130">
            <circle cx={65} cy={65} r={56} fill="none" stroke="#1e293b" strokeWidth={8} />
            <circle cx={65} cy={65} r={56} fill="none" stroke={report.overallConfidence >= 0.8 ? "#10b981" : report.overallConfidence >= 0.6 ? "#f59e0b" : "#ef4444"} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${report.overallConfidence * 352} 352`} transform="rotate(-90 65 65)" />
            <text x={65} y={60} textAnchor="middle" fill="#f1f5f9" fontSize={28} fontWeight={800}>{Math.round(report.overallConfidence * 100)}</text>
            <text x={65} y={78} textAnchor="middle" fill="#64748b" fontSize={11}>confidence</text>
          </svg>
          <div style={{ marginTop: 12, display: "flex", gap: 12, fontSize: 12 }}>
            <span style={{ color: "#10b981" }}>Auto: {s.autoResolvableRisks}</span>
            <span style={{ color: "#f59e0b" }}>Manual: {s.manualReviewRequired}</span>
          </div>
        </div>

        {/* Phase pipeline */}
        <div style={{ flex: 1, padding: 20, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 16 }}>Migration Pipeline</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(s.byPhase).map(([phase, ps]) => (
              <div key={phase} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 20, textAlign: "center", fontSize: 14, color: ps.status === "complete" ? "#10b981" : ps.status === "partial" ? "#f59e0b" : ps.status === "blocked" ? "#ef4444" : "#475569" }}>
                  {STATUS_ICONS[ps.status]}
                </span>
                <span style={{ width: 110, fontSize: 12, color: PHASE_COLORS[phase as MigrationPhase], fontWeight: 600 }}>{ps.label}</span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#1e293b", overflow: "hidden" }}>
                  <div style={{ width: `${ps.confidence * 100}%`, height: "100%", borderRadius: 3, background: PHASE_COLORS[phase as MigrationPhase], transition: "width 0.5s" }} />
                </div>
                <span style={{ fontSize: 11, color: "#94a3b8", width: 36, textAlign: "right" }}>{Math.round(ps.confidence * 100)}%</span>
                <span style={{ fontSize: 10, color: "#64748b", width: 50, textAlign: "right" }}>{ps.itemCount} items</span>
                {ps.risks > 0 && (
                  <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#ef444418", color: "#ef4444" }}>{ps.risks} risk{ps.risks > 1 ? "s" : ""}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Risk severity distribution */}
      <div style={{ padding: 20, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Risk Distribution</div>
        <div style={{ display: "flex", gap: 16 }}>
          {(["critical", "high", "medium", "low"] as RiskSeverity[]).map((sev) => {
            const count = report.risks.filter((r) => r.severity === sev).length;
            return (
              <div key={sev} style={{ flex: 1, padding: 14, borderRadius: 10, background: `${SEV_COLORS[sev]}08`, border: `1px solid ${SEV_COLORS[sev]}20`, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: SEV_COLORS[sev] }}>{count}</div>
                <div style={{ fontSize: 11, color: "#64748b", textTransform: "capitalize" }}>{sev}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Warnings */}
      {s.warnings.length > 0 && (
        <div style={{ padding: 16, borderRadius: 12, background: "#f59e0b08", border: "1px solid #f59e0b30" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b", marginBottom: 8 }}>Warnings ({s.warnings.length})</div>
          <div style={{ maxHeight: 200, overflow: "auto" }}>
            {s.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 12, color: w.startsWith("CRITICAL") ? "#ef4444" : "#fbbf24", marginBottom: 4, paddingLeft: 16, position: "relative" }}>
                <span style={{ position: "absolute", left: 0 }}>{w.startsWith("CRITICAL") ? "🔴" : "⚠"}</span> {w}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Risks ───────────────────────────────────────────────────────────────────

function RisksTab({ risks }: { risks: MigrationRisk[] }) {
  const [filterSev, setFilterSev] = useState<RiskSeverity | "all">("all");
  const filtered = filterSev === "all" ? risks : risks.filter((r) => r.severity === filterSev);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {(["all", "critical", "high", "medium", "low"] as const).map((s) => (
          <button key={s} onClick={() => setFilterSev(s)} style={{
            padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: filterSev === s ? (s === "all" ? "#8b5cf618" : `${SEV_COLORS[s]}18`) : "transparent",
            border: `1px solid ${filterSev === s ? (s === "all" ? "#8b5cf6" : SEV_COLORS[s]) : "#1e293b"}`,
            color: filterSev === s ? (s === "all" ? "#a78bfa" : SEV_COLORS[s]) : "#64748b",
            textTransform: "capitalize",
          }}>{s} {s !== "all" && `(${risks.filter((r) => r.severity === s).length})`}</button>
        ))}
      </div>

      {filtered.map((r) => (
        <div key={r.id} style={{ padding: 18, borderRadius: 12, background: "#131620", border: `1px solid ${SEV_COLORS[r.severity]}20` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${SEV_COLORS[r.severity]}18`, color: SEV_COLORS[r.severity], textTransform: "uppercase" }}>{r.severity}</span>
            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${PHASE_COLORS[r.phase]}18`, color: PHASE_COLORS[r.phase] }}>{PHASE_LABELS[r.phase]}</span>
            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "#1e293b", color: "#94a3b8" }}>{ARCH_LABELS[r.category]}</span>
            {r.autoResolvable && <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#10b98118", color: "#10b981" }}>Auto-Resolvable</span>}
            <span style={{ fontSize: 11, color: "#475569", marginLeft: "auto" }}>{r.id}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>{r.title}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10, lineHeight: 1.5 }}>{r.description}</div>
          <div style={{ padding: 12, borderRadius: 8, background: "#0f1117", borderLeft: `3px solid ${SEV_COLORS[r.severity]}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>Mitigation</div>
            <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.5 }}>{r.mitigation}</div>
          </div>
          {r.affectedComponents.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {r.affectedComponents.slice(0, 8).map((c, i) => (
                <span key={i} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, background: "#1e293b", color: "#94a3b8", fontFamily: "monospace" }}>{c.slice(0, 40)}</span>
              ))}
              {r.affectedComponents.length > 8 && <span style={{ fontSize: 10, color: "#475569" }}>+{r.affectedComponents.length - 8} more</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Architecture ────────────────────────────────────────────────────────────

function ArchTab({ recs }: { recs: ArchitectureRecommendation[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const effortColors: Record<string, string> = {
    trivial: "#10b981", small: "#3b82f6", medium: "#f59e0b", large: "#f97316", epic: "#ef4444",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {recs.map((r) => (
        <div key={r.id} style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
          <div onClick={() => setExpanded(expanded === r.id ? null : r.id)} style={{ padding: 18, cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#8b5cf612", border: "1px solid #8b5cf630", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#a78bfa", flexShrink: 0 }}>
              {r.priority}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{r.title}</span>
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "#1e293b", color: "#94a3b8" }}>{ARCH_LABELS[r.category]}</span>
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{r.description}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${effortColors[r.effort]}18`, color: effortColors[r.effort], textTransform: "capitalize" }}>Effort: {r.effort}</span>
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: r.impact === "critical" ? "#ef444418" : r.impact === "high" ? "#f5790018" : "#3b82f618", color: r.impact === "critical" ? "#ef4444" : r.impact === "high" ? "#f97316" : "#3b82f6", textTransform: "capitalize" }}>Impact: {r.impact}</span>
              </div>
            </div>
            <span style={{ color: "#475569", fontSize: 18, transform: expanded === r.id ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
          </div>
          {expanded === r.id && (
            <div style={{ padding: "0 18px 18px", borderTop: "1px solid #1e293b" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginTop: 12, marginBottom: 6 }}>Target Pattern</div>
              <div style={{ fontSize: 12, color: "#a78bfa", fontFamily: "monospace", marginBottom: 12 }}>{r.targetPattern}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Implementation</div>
              <pre style={{ padding: 14, borderRadius: 8, background: "#0a0d14", border: "1px solid #1e293b", fontSize: 11, color: "#e2e8f0", overflow: "auto", margin: 0, lineHeight: 1.6, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{r.codeSnippet}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Transforms ──────────────────────────────────────────────────────────────

function TransformTab({ specs }: { specs: TransformationSpec[] }) {
  const [filterLayer, setFilterLayer] = useState<"all" | "silver" | "gold">("all");
  const filtered = filterLayer === "all" ? specs : specs.filter((s) => s.layer === filterLayer);

  const layerColors: Record<string, string> = { bronze: "#a16207", silver: "#94a3b8", gold: "#f59e0b" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {(["all", "silver", "gold"] as const).map((l) => (
          <button key={l} onClick={() => setFilterLayer(l)} style={{
            padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: filterLayer === l ? (l === "all" ? "#8b5cf618" : `${layerColors[l]}18`) : "transparent",
            border: `1px solid ${filterLayer === l ? (l === "all" ? "#8b5cf6" : layerColors[l]) : "#1e293b"}`,
            color: filterLayer === l ? (l === "all" ? "#a78bfa" : layerColors[l]) : "#64748b",
            textTransform: "capitalize",
          }}>{l} {l !== "all" && `(${specs.filter((s) => s.layer === l).length})`}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: "#475569", padding: 40, fontSize: 13 }}>No transformation specs detected for this filter</div>
      ) : filtered.map((spec, i) => (
        <div key={i} style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${layerColors[spec.layer]}18`, color: layerColors[spec.layer], textTransform: "uppercase" }}>{spec.layer}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "#1e293b", color: "#94a3b8" }}>{spec.language}</span>
              {spec.reusable && <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#10b98118", color: "#10b981" }}>Reusable</span>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>{spec.name}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>{spec.intent}</div>
            {(spec.inputSchema.length > 0 || spec.outputSchema.length > 0) && (
              <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                {spec.inputSchema.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>INPUT</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {spec.inputSchema.slice(0, 6).map((f, j) => (
                        <span key={j} style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, background: "#1e293b", color: "#94a3b8", fontFamily: "monospace" }}>{f}</span>
                      ))}
                    </div>
                  </div>
                )}
                {spec.outputSchema.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>OUTPUT</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {spec.outputSchema.slice(0, 6).map((f, j) => (
                        <span key={j} style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, background: "#10b98110", color: "#10b981", fontFamily: "monospace" }}>{f}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <pre style={{ padding: 14, margin: 0, background: "#0a0d14", borderTop: "1px solid #1e293b", fontSize: 11, color: "#e2e8f0", overflow: "auto", lineHeight: 1.5, fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 250 }}>{spec.code}</pre>
        </div>
      ))}
    </div>
  );
}

// ─── Validations ─────────────────────────────────────────────────────────────

function ValidationsTab({ specs }: { specs: ValidationSpec[] }) {
  const [filterPhase, setFilterPhase] = useState<MigrationPhase | "all">("all");
  const filtered = filterPhase === "all" ? specs : specs.filter((s) => s.phase === filterPhase);
  const usedPhases = [...new Set(specs.map((s) => s.phase))] as MigrationPhase[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => setFilterPhase("all")} style={{
          padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
          background: filterPhase === "all" ? "#8b5cf618" : "transparent",
          border: `1px solid ${filterPhase === "all" ? "#8b5cf6" : "#1e293b"}`,
          color: filterPhase === "all" ? "#a78bfa" : "#64748b",
        }}>All ({specs.length})</button>
        {usedPhases.map((p) => (
          <button key={p} onClick={() => setFilterPhase(p)} style={{
            padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: filterPhase === p ? `${PHASE_COLORS[p]}18` : "transparent",
            border: `1px solid ${filterPhase === p ? PHASE_COLORS[p] : "#1e293b"}`,
            color: filterPhase === p ? PHASE_COLORS[p] : "#64748b",
          }}>{PHASE_LABELS[p]}</button>
        ))}
      </div>

      {filtered.map((v) => (
        <div key={v.id} style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${SEV_COLORS[v.severity]}18`, color: SEV_COLORS[v.severity], textTransform: "uppercase" }}>{v.severity}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${PHASE_COLORS[v.phase]}18`, color: PHASE_COLORS[v.phase] }}>{PHASE_LABELS[v.phase]}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "#1e293b", color: "#94a3b8", textTransform: "capitalize" }}>{v.type}</span>
              {v.autoEnforceable ? (
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#10b98118", color: "#10b981" }}>Auto-Enforce</span>
              ) : (
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#f59e0b18", color: "#f59e0b" }}>Manual</span>
              )}
              <span style={{ fontSize: 11, color: "#475569", marginLeft: "auto" }}>{v.id}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>{v.name}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{v.description}</div>
          </div>
          <pre style={{ padding: 14, margin: 0, background: "#0a0d14", borderTop: "1px solid #1e293b", fontSize: 11, color: "#e2e8f0", overflow: "auto", lineHeight: 1.5, fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 200 }}>{v.checkCode}</pre>
        </div>
      ))}
    </div>
  );
}

// ─── Execution Graph ─────────────────────────────────────────────────────────

function GraphTab({ nodes }: { nodes: ExecutionNode[] }) {
  if (nodes.length === 0) {
    return <div style={{ textAlign: "center", color: "#475569", padding: 60, fontSize: 13 }}>No execution graph nodes detected</div>;
  }

  const typeColors: Record<string, string> = {
    action: "#3b82f6", decision: "#f59e0b", parallel: "#8b5cf6",
    wait: "#64748b", sync: "#ef4444", transform: "#10b981",
  };

  const layers = [...new Set(nodes.map((n) => n.layer))];
  const byLayer = new Map<string, ExecutionNode[]>();
  for (const n of nodes) {
    if (!byLayer.has(n.layer)) byLayer.set(n.layer, []);
    byLayer.get(n.layer)!.push(n);
  }

  const nodeWidth = 180;
  const nodeHeight = 40;
  const layerGap = 60;
  const nodeGap = 14;

  let totalY = 40;
  const layerOffsets: Record<string, number> = {};
  for (const layer of layers) {
    layerOffsets[layer] = totalY;
    totalY += (byLayer.get(layer)?.length ?? 0) * (nodeHeight + nodeGap) + layerGap;
  }

  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const layer of layers) {
    const layerNodes = byLayer.get(layer) ?? [];
    const startX = 200;
    let y = layerOffsets[layer];
    for (const n of layerNodes) {
      nodePositions.set(n.id, { x: startX, y });
      y += nodeHeight + nodeGap;
    }
  }

  const svgHeight = totalY + 40;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {Object.entries(typeColors).map(([type, color]) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
            <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "capitalize" }}>{type} ({nodes.filter((n) => n.type === type).length})</span>
          </div>
        ))}
      </div>

      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "auto", padding: 20 }}>
        <svg width={Math.max(600, nodeWidth + 280)} height={svgHeight} style={{ display: "block" }}>
          {/* Edges */}
          {nodes.filter((n) => n.dependencies.length > 0).map((n) => {
            const to = nodePositions.get(n.id);
            return n.dependencies.map((depId) => {
              const fromNode = nodes.find((nn) => nn.id === depId || nn.name === depId);
              const from = fromNode ? nodePositions.get(fromNode.id) : null;
              if (!from || !to) return null;
              return (
                <line key={`${depId}-${n.id}`} x1={from.x + nodeWidth / 2} y1={from.y + nodeHeight} x2={to.x + nodeWidth / 2} y2={to.y} stroke="#475569" strokeWidth={1.5} markerEnd="url(#arrowhead)" />
              );
            });
          })}
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#475569" />
            </marker>
          </defs>

          {/* Layer labels */}
          {layers.map((layer) => (
            <text key={`label-${layer}`} x={10} y={layerOffsets[layer] + 18} fill={PHASE_COLORS[layer as MigrationPhase] ?? "#64748b"} fontSize={11} fontWeight={700}>
              {PHASE_LABELS[layer as MigrationPhase] ?? layer}
            </text>
          ))}

          {/* Nodes */}
          {nodes.map((n) => {
            const pos = nodePositions.get(n.id);
            if (!pos) return null;
            return (
              <g key={n.id}>
                <rect x={pos.x} y={pos.y} width={nodeWidth} height={nodeHeight} rx={8} fill={`${typeColors[n.type]}12`} stroke={typeColors[n.type]} strokeWidth={1.5} />
                <text x={pos.x + 12} y={pos.y + 16} fill={typeColors[n.type]} fontSize={10} fontWeight={700}>{n.type.toUpperCase()}</text>
                <text x={pos.x + 12} y={pos.y + 30} fill="#e2e8f0" fontSize={11}>{n.name.slice(0, 22)}</text>
                {n.parallelGroup && (
                  <text x={pos.x + nodeWidth - 8} y={pos.y + 14} fill="#8b5cf6" fontSize={9} textAnchor="end">‖</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
