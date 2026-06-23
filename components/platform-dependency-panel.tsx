"use client";

import { useState, useMemo } from "react";
import {
  DependencyReport,
  DependencyCategory,
  CATEGORY_LABELS,
  PlatformDependency,
  MigrationPlanEntry,
  analyzePlatformDependencies,
} from "@/lib/platform-dependency-analyzer";

interface Props {
  open: boolean;
  onClose: () => void;
  sourceCode: string;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

const CAT_COLORS: Record<DependencyCategory, string> = {
  "service-name": "#3b82f6",
  "storage-reference": "#10b981",
  "catalog-reference": "#8b5cf6",
  "monitoring-reference": "#f59e0b",
  "notification-reference": "#f97316",
  "dashboard-reference": "#06b6d4",
};

const CAT_ICONS: Record<DependencyCategory, string> = {
  "service-name": "⚙",
  "storage-reference": "💾",
  "catalog-reference": "📚",
  "monitoring-reference": "📡",
  "notification-reference": "🔔",
  "dashboard-reference": "📊",
};

type TabId = "report" | "plan" | "details";

export default function PlatformDependencyPanel({ open, onClose, sourceCode, outputCode, direction }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("report");
  const [filterCat, setFilterCat] = useState<DependencyCategory | "all">("all");

  const result = useMemo<DependencyReport | null>(() => {
    if (!open || !sourceCode) return null;
    try {
      return analyzePlatformDependencies(sourceCode, outputCode, direction);
    } catch {
      return null;
    }
  }, [open, sourceCode, outputCode, direction]);

  if (!open) return null;

  const downloadReport = () => {
    if (!result) return;
    const lines = [
      "# Platform Dependency Migration Report",
      `Direction: ${direction}`,
      `Total Dependencies: ${result.summary.totalDependencies}`,
      `Auto-Replaceable: ${result.summary.autoReplaceableCount}`,
      `Manual Review: ${result.summary.manualReviewCount}`,
      `Confidence: ${Math.round(result.overallConfidence * 100)}%`,
      "",
      "## Dependencies",
      ...result.dependencies.map((d) =>
        `- [${d.category}] ${d.original} → ${d.replacement} (${Math.round(d.confidence * 100)}%) — ${d.reasoning}`
      ),
      "",
      "## Migration Plan",
      ...result.migrationPlan.map((p) =>
        `${p.step}. [${p.risk}] ${p.action} — ${p.notes}`
      ),
      "",
      "## Warnings",
      ...result.summary.warnings.map((w) => `- ${w}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dependency_report_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confColor = (c: number) => c >= 0.8 ? "#10b981" : c >= 0.6 ? "#f59e0b" : "#ef4444";

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "report", label: "Migration Report" },
    { id: "plan", label: "Migration Plan", count: result?.migrationPlan.length },
    { id: "details", label: "All Dependencies", count: result?.dependencies.length },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "94vw", maxWidth: 1400, height: "90vh", background: "#0f1117", borderRadius: 16, border: "1px solid #1e293b", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "20px 28px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: "linear-gradient(135deg, #ef4444, #f97316)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⇄</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Platform Dependency Analyzer</h2>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Detect → Replace → Validate — zero placeholders</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {result && (
              <>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, background: `${confColor(result.overallConfidence)}18`, color: confColor(result.overallConfidence), border: `1px solid ${confColor(result.overallConfidence)}40` }}>
                  Confidence: {Math.round(result.overallConfidence * 100)}%
                </div>
                <button onClick={downloadReport} style={{ padding: "6px 14px", borderRadius: 8, background: "#ef4444", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Export Report</button>
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
              borderBottom: activeTab === t.id ? "2px solid #ef4444" : "2px solid transparent",
              color: activeTab === t.id ? "#f87171" : "#64748b",
              cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            }}>
              {t.label}
              {t.count !== undefined && <span style={{ padding: "1px 7px", borderRadius: 10, background: activeTab === t.id ? "#ef444418" : "#1e293b", fontSize: 11 }}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
          {!result ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: 60, fontSize: 14 }}>Paste source workflow code to analyze platform dependencies</div>
          ) : activeTab === "report" ? (
            <ReportTab result={result} />
          ) : activeTab === "plan" ? (
            <PlanTab plan={result.migrationPlan} />
          ) : (
            <DetailsTab deps={result.dependencies} filterCat={filterCat} onFilter={setFilterCat} />
          )}
        </div>
      </div>
    </div>
  );
}

function ReportTab({ result }: { result: DependencyReport }) {
  const { summary, overallConfidence } = result;

  const stats = [
    { label: "Total Dependencies", value: summary.totalDependencies, color: "#f87171" },
    { label: "Auto-Replaceable", value: summary.autoReplaceableCount, color: "#10b981" },
    { label: "Manual Review", value: summary.manualReviewCount, color: "#f59e0b" },
    { label: "High Confidence", value: summary.highConfidenceCount, color: "#3b82f6" },
  ];

  const categories = Object.entries(summary.byCategory).filter(([, c]) => c > 0) as [DependencyCategory, number][];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ padding: 18, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 200px", padding: 24, borderRadius: 12, background: "#131620", border: "1px solid #1e293b", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <svg width={120} height={120} viewBox="0 0 120 120">
            <circle cx={60} cy={60} r={52} fill="none" stroke="#1e293b" strokeWidth={8} />
            <circle cx={60} cy={60} r={52} fill="none" stroke={overallConfidence >= 0.8 ? "#10b981" : overallConfidence >= 0.6 ? "#f59e0b" : "#ef4444"} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${overallConfidence * 327} 327`} transform="rotate(-90 60 60)" />
            <text x={60} y={55} textAnchor="middle" fill="#f1f5f9" fontSize={24} fontWeight={800}>{Math.round(overallConfidence * 100)}</text>
            <text x={60} y={72} textAnchor="middle" fill="#64748b" fontSize={11}>confidence</text>
          </svg>
        </div>

        <div style={{ flex: 1, padding: 20, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Dependency Categories</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {categories.map(([cat, count]) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, width: 24, textAlign: "center" }}>{CAT_ICONS[cat]}</span>
                <span style={{ flex: 1, fontSize: 13, color: "#e2e8f0" }}>{CATEGORY_LABELS[cat]}</span>
                <div style={{ width: 120, height: 6, borderRadius: 3, background: "#1e293b", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min((count / summary.totalDependencies) * 100, 100)}%`, height: "100%", borderRadius: 3, background: CAT_COLORS[cat] }} />
                </div>
                <span style={{ fontSize: 12, color: CAT_COLORS[cat], fontWeight: 600, width: 28, textAlign: "right" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Auto vs Manual pie */}
      <div style={{ padding: 20, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Replacement Coverage</div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: "100%", height: 12, borderRadius: 6, background: "#1e293b", overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${(summary.autoReplaceableCount / Math.max(summary.totalDependencies, 1)) * 100}%`, height: "100%", background: "#10b981", transition: "width 0.5s" }} />
            <div style={{ width: `${(summary.manualReviewCount / Math.max(summary.totalDependencies, 1)) * 100}%`, height: "100%", background: "#f59e0b" }} />
          </div>
          <div style={{ display: "flex", gap: 16, whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 12, color: "#10b981" }}>Auto: {summary.autoReplaceableCount}</span>
            <span style={{ fontSize: 12, color: "#f59e0b" }}>Manual: {summary.manualReviewCount}</span>
          </div>
        </div>
      </div>

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

      {/* Top replacements preview */}
      <div style={{ padding: 20, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Key Replacements</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflow: "auto" }}>
          {result.dependencies.slice(0, 20).map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, background: "#0f1117" }}>
              <span style={{ fontSize: 14 }}>{CAT_ICONS[d.category]}</span>
              <span style={{ fontSize: 12, color: "#f87171", fontFamily: "monospace", minWidth: 140, textDecoration: "line-through", opacity: 0.7 }}>{d.original.slice(0, 22)}</span>
              <span style={{ color: "#475569", fontSize: 14 }}>→</span>
              <span style={{ fontSize: 12, color: "#10b981", fontFamily: "monospace", flex: 1 }}>{d.replacement}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: d.autoReplaceable ? "#10b98118" : "#f59e0b18", color: d.autoReplaceable ? "#10b981" : "#f59e0b" }}>
                {d.autoReplaceable ? "Auto" : "Manual"}
              </span>
              <span style={{ fontSize: 11, color: "#64748b", minWidth: 36, textAlign: "right" }}>{Math.round(d.confidence * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanTab({ plan }: { plan: MigrationPlanEntry[] }) {
  const riskColors = { low: "#10b981", medium: "#f59e0b", high: "#ef4444" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 8 }}>
        {(["low", "medium", "high"] as const).map((risk) => (
          <div key={risk} style={{ padding: 14, borderRadius: 10, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: riskColors[risk] }}>{plan.filter((p) => p.risk === risk).length}</div>
            <div style={{ fontSize: 12, color: "#64748b", textTransform: "capitalize" }}>{risk} Risk Steps</div>
          </div>
        ))}
      </div>

      {plan.map((p) => (
        <div key={p.step} style={{ padding: 16, borderRadius: 12, background: "#131620", border: "1px solid #1e293b", display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${riskColors[p.risk]}12`, border: `1px solid ${riskColors[p.risk]}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: riskColors[p.risk], flexShrink: 0 }}>
            {p.step}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13 }}>{CAT_ICONS[p.category]}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${CAT_COLORS[p.category]}18`, color: CAT_COLORS[p.category] }}>{CATEGORY_LABELS[p.category]}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${riskColors[p.risk]}18`, color: riskColors[p.risk] }}>{p.risk}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "#f87171", fontFamily: "monospace", textDecoration: "line-through", opacity: 0.7 }}>{p.from}</span>
              <span style={{ color: "#475569", fontSize: 16 }}>→</span>
              <span style={{ fontSize: 13, color: "#10b981", fontFamily: "monospace", fontWeight: 600 }}>{p.to}</span>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{p.notes}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailsTab({
  deps, filterCat, onFilter,
}: {
  deps: PlatformDependency[];
  filterCat: DependencyCategory | "all";
  onFilter: (c: DependencyCategory | "all") => void;
}) {
  const filtered = filterCat === "all" ? deps : deps.filter((d) => d.category === filterCat);
  const usedCats = [...new Set(deps.map((d) => d.category))] as DependencyCategory[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => onFilter("all")} style={{
          padding: "5px 12px", borderRadius: 6, border: "1px solid", fontSize: 12, fontWeight: 600, cursor: "pointer",
          background: filterCat === "all" ? "#ef444418" : "transparent",
          borderColor: filterCat === "all" ? "#ef4444" : "#1e293b",
          color: filterCat === "all" ? "#f87171" : "#64748b",
        }}>All ({deps.length})</button>
        {usedCats.map((cat) => (
          <button key={cat} onClick={() => onFilter(cat)} style={{
            padding: "5px 12px", borderRadius: 6, border: "1px solid", fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: filterCat === cat ? `${CAT_COLORS[cat]}18` : "transparent",
            borderColor: filterCat === cat ? CAT_COLORS[cat] : "#1e293b",
            color: filterCat === cat ? CAT_COLORS[cat] : "#64748b",
          }}>{CAT_ICONS[cat]} {CATEGORY_LABELS[cat]}</button>
        ))}
      </div>

      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["Category", "Original", "Replacement", "Confidence", "Status", "Location"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} style={{ borderBottom: "1px solid #1e293b08" }}>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${CAT_COLORS[d.category]}18`, color: CAT_COLORS[d.category] }}>
                    {CAT_ICONS[d.category]} {CATEGORY_LABELS[d.category]}
                  </span>
                </td>
                <td style={{ padding: "10px 14px", color: "#f87171", fontFamily: "monospace", textDecoration: "line-through", opacity: 0.7, fontSize: 11 }}>{d.original}</td>
                <td style={{ padding: "10px 14px", color: "#10b981", fontFamily: "monospace", fontWeight: 600, fontSize: 11 }}>{d.replacement}</td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 40, height: 4, borderRadius: 2, background: "#1e293b", overflow: "hidden" }}>
                      <div style={{ width: `${d.confidence * 100}%`, height: "100%", background: d.confidence >= 0.9 ? "#10b981" : d.confidence >= 0.8 ? "#f59e0b" : "#ef4444" }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{Math.round(d.confidence * 100)}%</span>
                  </div>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: d.autoReplaceable ? "#10b98118" : "#f59e0b18", color: d.autoReplaceable ? "#10b981" : "#f59e0b" }}>
                    {d.autoReplaceable ? "Auto" : "Manual"}
                  </span>
                </td>
                <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
