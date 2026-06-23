"use client";

import { useState, useMemo } from "react";
import {
  type GoldSpecResult,
  type GoldMetricType,
  type GoldSpecEntry,
  METRIC_LABELS,
  METRIC_COLORS,
  METRIC_ICONS,
  DASHBOARD_LABELS,
  analyzeGoldSpec,
} from "@/lib/gold-spec-analyzer";

interface Props {
  open: boolean;
  onClose: () => void;
  sourceCode: string;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

type TabId = "summary" | "metrics" | "dashboards" | "json";

export default function GoldSpecPanel({ open, onClose, sourceCode, outputCode, direction }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [filterMetric, setFilterMetric] = useState<GoldMetricType | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const result = useMemo<GoldSpecResult | null>(() => {
    if (!sourceCode.trim()) return null;
    return analyzeGoldSpec(sourceCode, outputCode, direction);
  }, [sourceCode, outputCode, direction]);

  if (!open) return null;

  const copyJson = (entry: GoldSpecEntry) => {
    const obj = {
      gold_metric: entry.gold_metric,
      business_purpose: entry.business_purpose,
      aggregation_type: entry.aggregation_type,
      dashboard_type: entry.dashboard_type,
      confidence: entry.confidence,
    };
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const copyAll = () => {
    if (!result) return;
    const output = result.specs.map((s) => ({
      gold_metric: s.gold_metric,
      business_purpose: s.business_purpose,
      aggregation_type: s.aggregation_type,
      dashboard_type: s.dashboard_type,
      confidence: s.confidence,
    }));
    navigator.clipboard.writeText(JSON.stringify(output, null, 2));
    setCopiedId("all");
    setTimeout(() => setCopiedId(null), 1500);
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "summary", label: "Summary" },
    { id: "metrics", label: "Gold Metrics", count: result?.specs.length },
    { id: "dashboards", label: "Dashboard Catalog", count: result?.dashboardCatalog.length },
    { id: "json", label: "JSON Output" },
  ];

  const confColor = (c: string) => {
    switch (c) {
      case "high": return "#10b981";
      case "medium-high": return "#3b82f6";
      case "medium": return "#f59e0b";
      default: return "#ef4444";
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "94vw", maxWidth: 1400, height: "90vh", background: "#0f1117", borderRadius: 16, border: "1px solid #1e293b", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "20px 28px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #f59e0b, #ef4444)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏆</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Gold Layer Specification</h2>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                Transformation metadata → Metric classification → Dashboard mapping
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {result && (
              <>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "#f59e0b18", color: "#f59e0b", border: "1px solid #f59e0b40" }}>
                  {result.summary.categoriesUsed}/8 Categories
                </div>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "#10b98118", color: "#10b981", border: "1px solid #10b98140" }}>
                  {result.summary.dashboardTypesUsed} Dashboards
                </div>
                <button onClick={copyAll} style={{ padding: "6px 14px", borderRadius: 8, background: "#f59e0b", color: "#000", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                  {copiedId === "all" ? "Copied!" : "Export JSON"}
                </button>
              </>
            )}
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: "#1e293b", color: "#94a3b8", border: "none", cursor: "pointer", fontSize: 18 }}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, padding: "0 28px", borderBottom: "1px solid #1e293b", background: "#0a0d14" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "12px 20px",
                background: "transparent",
                color: activeTab === t.id ? "#f59e0b" : "#64748b",
                border: "none",
                borderBottom: activeTab === t.id ? "2px solid #f59e0b" : "2px solid transparent",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s",
              }}
            >
              {t.label}
              {t.count !== undefined && (
                <span style={{ padding: "1px 7px", borderRadius: 10, background: activeTab === t.id ? "#f59e0b18" : "#1e293b", fontSize: 11 }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
          {!result ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: 60, fontSize: 14 }}>
              Paste source Glue/ETL code to generate Gold layer specifications
            </div>
          ) : activeTab === "summary" ? (
            <SummaryTab result={result} />
          ) : activeTab === "metrics" ? (
            <MetricsTab
              specs={result.specs}
              filterMetric={filterMetric}
              onFilter={setFilterMetric}
              expandedId={expandedId}
              onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
              copiedId={copiedId}
              onCopy={copyJson}
              confColor={confColor}
            />
          ) : activeTab === "dashboards" ? (
            <DashboardTab catalog={result.dashboardCatalog} />
          ) : (
            <JsonOutputTab specs={result.specs} copiedId={copiedId} onCopyAll={copyAll} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUMMARY TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function SummaryTab({ result }: { result: GoldSpecResult }) {
  const maxCount = Math.max(...Object.values(result.metricBreakdown), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {[
          { label: "Total Metrics", value: result.summary.totalMetrics, color: "#f59e0b" },
          { label: "Categories", value: `${result.summary.categoriesUsed}/8`, color: "#3b82f6" },
          { label: "Dashboard Types", value: result.summary.dashboardTypesUsed, color: "#8b5cf6" },
          { label: "High Confidence", value: result.summary.highConfidenceCount, color: "#10b981" },
          { label: "Avg Confidence", value: `${result.summary.avgConfidence}%`, color: "#06b6d4" },
        ].map((s, i) => (
          <div key={i} style={{ padding: 16, borderRadius: 12, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Metric category breakdown */}
      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Gold Metric Distribution</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(Object.entries(result.metricBreakdown) as [GoldMetricType, number][])
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{METRIC_ICONS[cat]}</span>
                <span style={{ width: 170, fontSize: 12, fontWeight: 600, color: count > 0 ? METRIC_COLORS[cat] : "#475569" }}>
                  {METRIC_LABELS[cat]}
                </span>
                <div style={{ flex: 1, height: 22, background: "#1e293b", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{
                    width: `${(count / maxCount) * 100}%`,
                    height: "100%",
                    background: count > 0 ? METRIC_COLORS[cat] : "transparent",
                    borderRadius: 6,
                    opacity: 0.7,
                    transition: "width 0.4s ease",
                  }} />
                </div>
                <span style={{ width: 28, fontSize: 13, fontWeight: 700, color: count > 0 ? "#f1f5f9" : "#475569", textAlign: "right" }}>{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Dashboard type grid */}
      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Dashboard Type Coverage</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {result.dashboardCatalog.map((dc) => (
            <div key={dc.dashboard_type} style={{ padding: 14, borderRadius: 10, background: "#0a0d14", border: "1px solid #1e293b" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>{dc.label}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{dc.audience}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: "#f59e0b" }}>{dc.metrics.length}</span>
                <span style={{ fontSize: 10, color: "#475569" }}>{dc.refresh}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dominant category */}
      <div style={{ borderRadius: 12, background: "#131620", border: `1px solid ${METRIC_COLORS[result.summary.dominantCategory]}30`, padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: `${METRIC_COLORS[result.summary.dominantCategory]}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
          {METRIC_ICONS[result.summary.dominantCategory]}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Dominant Category</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: METRIC_COLORS[result.summary.dominantCategory] }}>
            {METRIC_LABELS[result.summary.dominantCategory]}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            {result.metricBreakdown[result.summary.dominantCategory]} metric(s) — {result.summary.syntheticCount} auto-generated for enterprise completeness
          </div>
        </div>
      </div>

      {/* Warnings */}
      {result.summary.warnings.length > 0 && (
        <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #f59e0b30", padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#f59e0b" }}>Warnings</h3>
          {result.summary.warnings.map((w, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", fontSize: 12, color: "#fbbf24", lineHeight: 1.6 }}>
              <span style={{ flexShrink: 0 }}>⚠</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   METRICS TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function MetricsTab({
  specs,
  filterMetric,
  onFilter,
  expandedId,
  onToggle,
  copiedId,
  onCopy,
  confColor,
}: {
  specs: GoldSpecEntry[];
  filterMetric: GoldMetricType | "all";
  onFilter: (m: GoldMetricType | "all") => void;
  expandedId: string | null;
  onToggle: (id: string) => void;
  copiedId: string | null;
  onCopy: (s: GoldSpecEntry) => void;
  confColor: (c: string) => string;
}) {
  const filtered = filterMetric === "all" ? specs : specs.filter((s) => s.metric_category === filterMetric);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Filter chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button
          onClick={() => onFilter("all")}
          style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
            background: filterMetric === "all" ? "#f59e0b18" : "#1e293b",
            color: filterMetric === "all" ? "#f59e0b" : "#64748b",
          }}
        >All ({specs.length})</button>
        {(Object.keys(METRIC_LABELS) as GoldMetricType[]).map((cat) => {
          const count = specs.filter((s) => s.metric_category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => onFilter(cat)}
              style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
                background: filterMetric === cat ? `${METRIC_COLORS[cat]}18` : "#1e293b",
                color: filterMetric === cat ? METRIC_COLORS[cat] : "#64748b",
              }}
            >{METRIC_ICONS[cat]} {METRIC_LABELS[cat]} ({count})</button>
          );
        })}
      </div>

      {/* Metric cards */}
      {filtered.map((s) => {
        const isExpanded = expandedId === s.id;
        const isSynthetic = s.source_transformation_id === "synthetic";
        return (
          <div key={s.id} style={{ borderRadius: 12, background: "#131620", border: `1px solid ${METRIC_COLORS[s.metric_category]}25`, overflow: "hidden" }}>
            <div
              onClick={() => onToggle(s.id)}
              style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: isExpanded ? "1px solid #1e293b" : "none" }}
            >
              <span style={{ fontSize: 16 }}>{METRIC_ICONS[s.metric_category]}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${METRIC_COLORS[s.metric_category]}18`, color: METRIC_COLORS[s.metric_category] }}>
                {METRIC_LABELS[s.metric_category]}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", flex: 1 }}>{s.gold_metric}</span>
              {isSynthetic && (
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: "#06b6d418", color: "#06b6d4", textTransform: "uppercase", letterSpacing: 0.5 }}>Auto</span>
              )}
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "#1e293b", color: "#94a3b8" }}>{s.aggregation_type}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${confColor(s.confidence)}18`, color: confColor(s.confidence) }}>{s.confidence}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onCopy(s); }}
                style={{ padding: "3px 10px", borderRadius: 6, background: "#1e293b", color: copiedId === s.id ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
              >{copiedId === s.id ? "Copied!" : "JSON"}</button>
              <span style={{ fontSize: 12, color: "#475569", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
            </div>

            {isExpanded && (
              <div style={{ padding: "12px 20px 16px" }}>
                {/* Business purpose */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Business Purpose</div>
                  <div style={{ padding: "10px 14px", borderRadius: 8, background: "#0a0d14", border: "1px solid #1e293b", fontSize: 12, color: "#e2e8f0", lineHeight: 1.7 }}>
                    {s.business_purpose}
                  </div>
                </div>

                {/* Metadata grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Aggregation</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>{s.aggregation_type}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Dashboard</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#a5b4fc" }}>{DASHBOARD_LABELS[s.dashboard_type]}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Grain</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>{s.grain}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Refresh</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>{s.refresh_frequency}</div>
                  </div>
                </div>

                {/* KPI formula if present */}
                {s.kpi_formula && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>KPI Formula</div>
                    <div style={{ padding: "8px 14px", borderRadius: 8, background: "#0a0d14", fontSize: 12, fontFamily: "monospace", color: "#fbbf24" }}>{s.kpi_formula}</div>
                  </div>
                )}

                {/* Source columns */}
                {s.source_columns.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Source Columns</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {s.source_columns.map((c, i) => (
                        <span key={i} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "#1e293b", color: "#60a5fa", fontFamily: "monospace" }}>{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer metadata */}
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#475569" }}>
                  <span>Source category: <span style={{ color: "#94a3b8", fontWeight: 600 }}>{s.source_category}</span></span>
                  <span>Source ID: <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>{s.source_transformation_id}</span></span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontSize: 13 }}>No metrics found for this category</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD CATALOG TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function DashboardTab({ catalog }: { catalog: { dashboard_type: string; label: string; metrics: string[]; refresh: string; audience: string }[] }) {
  const dashColors: Record<string, string> = {
    "executive-kpi": "#ec4899",
    "operational-monitor": "#06b6d4",
    "financial-summary": "#10b981",
    "compliance-scorecard": "#f59e0b",
    "security-posture": "#8b5cf6",
    "sla-tracker": "#3b82f6",
    "trend-analysis": "#f97316",
    "real-time-feed": "#ef4444",
    "self-service": "#6366f1",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {catalog.map((dc) => {
        const color = dashColors[dc.dashboard_type] || "#64748b";
        return (
          <div key={dc.dashboard_type} style={{ borderRadius: 14, background: "#131620", border: `1px solid ${color}30`, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #1e293b" }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color }}>
                📊
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color }}>{dc.label}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{dc.audience}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color }}>{dc.metrics.length}</div>
                <div style={{ fontSize: 10, color: "#475569" }}>metrics</div>
              </div>
              <div style={{ textAlign: "right", marginLeft: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8" }}>{dc.refresh}</div>
                <div style={{ fontSize: 10, color: "#475569" }}>refresh</div>
              </div>
            </div>
            <div style={{ padding: "12px 20px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {dc.metrics.map((m, i) => (
                <span key={i} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${color}10`, color: `${color}cc`, border: `1px solid ${color}20` }}>
                  {m}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {catalog.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#64748b", fontSize: 14 }}>No dashboards generated — paste source code to analyze</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   JSON OUTPUT TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function JsonOutputTab({ specs, copiedId, onCopyAll }: { specs: GoldSpecEntry[]; copiedId: string | null; onCopyAll: () => void }) {
  const output = specs.map((s) => ({
    gold_metric: s.gold_metric,
    business_purpose: s.business_purpose,
    aggregation_type: s.aggregation_type,
    dashboard_type: s.dashboard_type,
    confidence: s.confidence,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>
          {specs.length} Gold layer metric(s) — metadata only, no generated SQL
        </div>
        <button onClick={onCopyAll} style={{ padding: "6px 16px", borderRadius: 8, background: "#f59e0b", color: "#000", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
          {copiedId === "all" ? "Copied!" : "Copy All JSON"}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: 20, borderRadius: 12, background: "#0a0d14", border: "1px solid #1e293b",
        fontSize: 12, lineHeight: 1.6, color: "#fcd34d", fontFamily: "monospace", whiteSpace: "pre-wrap", overflow: "auto", maxHeight: "65vh",
      }}>
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  );
}
