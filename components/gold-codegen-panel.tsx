"use client";

import { useState, useMemo } from "react";
import {
  type GoldCodegenResult,
  type GoldCodeModule,
  MODULE_ICONS,
  MODULE_COLORS,
  generateGoldCode,
} from "@/lib/gold-codegen";

interface Props {
  open: boolean;
  onClose: () => void;
  sourceCode: string;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

type TabId = "overview" | "sql" | "pyspark" | "powerbi" | "catalog";

export default function GoldCodegenPanel({ open, onClose, sourceCode, outputCode, direction }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const result = useMemo<GoldCodegenResult | null>(() => {
    if (!sourceCode.trim()) return null;
    return generateGoldCode(sourceCode, outputCode, direction);
  }, [sourceCode, outputCode, direction]);

  if (!open) return null;

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const copyAll = () => {
    if (!result) return;
    const all = result.modules.map((m) => `-- ══ ${m.title} (${m.language.toUpperCase()}) ══\n${m.code}`).join("\n\n");
    copyCode(all, "all");
  };

  const sqlModules = result?.modules.filter((m) => m.language === "sql") || [];
  const pyModules = result?.modules.filter((m) => m.language === "python") || [];
  const pbiModules = result?.modules.filter((m) => m.category === "powerbi-view") || [];

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "sql", label: "SQL Modules", count: sqlModules.length },
    { id: "pyspark", label: "PySpark Modules", count: pyModules.length },
    { id: "powerbi", label: "Power BI" },
    { id: "catalog", label: "Unity Catalog", count: result?.summary.unityCatalogTables.length },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "96vw", maxWidth: 1500, height: "92vh", background: "#0f1117", borderRadius: 16, border: "1px solid #1e293b", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "20px 28px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #f59e0b, #ef4444)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏆</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Gold Layer Code Generator</h2>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                Production SQL + PySpark — KPIs · Aggregations · Dashboards · Power BI · Audit
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {result && (
              <>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "#f59e0b18", color: "#f59e0b", border: "1px solid #f59e0b40" }}>
                  {result.summary.sqlModules} SQL
                </div>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "#3b82f618", color: "#3b82f6", border: "1px solid #3b82f640" }}>
                  {result.summary.pysparkModules} PySpark
                </div>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "#8b5cf618", color: "#8b5cf6", border: "1px solid #8b5cf640" }}>
                  {result.summary.totalLines} Lines
                </div>
                <button onClick={copyAll} style={{ padding: "6px 14px", borderRadius: 8, background: "#f59e0b", color: "#000", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                  {copiedId === "all" ? "Copied!" : "Export All"}
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
                padding: "12px 20px", background: "transparent", border: "none",
                color: activeTab === t.id ? "#f59e0b" : "#64748b",
                borderBottom: activeTab === t.id ? "2px solid #f59e0b" : "2px solid transparent",
                cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
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
              Paste source Glue/ETL code to generate Gold layer SQL and PySpark
            </div>
          ) : activeTab === "overview" ? (
            <OverviewTab result={result} onCopy={copyCode} copiedId={copiedId} />
          ) : activeTab === "sql" ? (
            <ModuleListTab modules={sqlModules} expandedModule={expandedModule} onToggle={(id) => setExpandedModule(expandedModule === id ? null : id)} onCopy={copyCode} copiedId={copiedId} />
          ) : activeTab === "pyspark" ? (
            <ModuleListTab modules={pyModules} expandedModule={expandedModule} onToggle={(id) => setExpandedModule(expandedModule === id ? null : id)} onCopy={copyCode} copiedId={copiedId} />
          ) : activeTab === "powerbi" ? (
            <PowerBITab modules={pbiModules} result={result} onCopy={copyCode} copiedId={copiedId} />
          ) : (
            <CatalogTab result={result} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OVERVIEW TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function OverviewTab({ result, onCopy, copiedId }: { result: GoldCodegenResult; onCopy: (c: string, id: string) => void; copiedId: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        {[
          { label: "Total Modules", value: result.summary.totalModules, color: "#f59e0b" },
          { label: "Total Lines", value: result.summary.totalLines, color: "#8b5cf6" },
          { label: "SQL Modules", value: result.summary.sqlModules, color: "#10b981" },
          { label: "PySpark Modules", value: result.summary.pysparkModules, color: "#3b82f6" },
          { label: "KPIs Generated", value: result.summary.kpiCount, color: "#ec4899" },
          { label: "Power BI Views", value: result.summary.powerBIViews, color: "#f97316" },
        ].map((s, i) => (
          <div key={i} style={{ padding: 16, borderRadius: 12, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Pipeline flow */}
      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Gold Pipeline Execution Flow</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {result.modules.map((m, i) => {
            const color = MODULE_COLORS[m.category];
            const langBadge = m.language === "sql" ? { bg: "#10b98118", color: "#10b981", label: "SQL" } : { bg: "#3b82f618", color: "#3b82f6", label: "PySpark" };
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color }}>{i + 1}</div>
                <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{MODULE_ICONS[m.category]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{m.description}</div>
                </div>
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: langBadge.bg, color: langBadge.color }}>{langBadge.label}</span>
                <div style={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>{m.lineCount} lines</div>
                <button
                  onClick={() => onCopy(m.code, m.id)}
                  style={{ padding: "4px 12px", borderRadius: 6, background: "#1e293b", color: copiedId === m.id ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                >{copiedId === m.id ? "Copied!" : "Copy"}</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delta features + tables side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Delta Lake Features</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {result.summary.deltaFeatures.map((f, i) => (
              <span key={i} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#ef444418", color: "#ef4444", fontFamily: "monospace" }}>{f}</span>
            ))}
          </div>
        </div>
        <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Generated Outputs</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { label: "KPI Metric Tables", count: 1, color: "#10b981" },
              { label: "Aggregation Tables", count: 1, color: "#3b82f6" },
              { label: "Business Metric Tables", count: 1, color: "#f59e0b" },
              { label: "Dashboard Views", count: 6, color: "#8b5cf6" },
              { label: "Power BI Star-Schema Views", count: 5, color: "#ec4899" },
              { label: "Audit / Dependency Tables", count: 3, color: "#06b6d4" },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#94a3b8" }}>{item.label}</span>
                <span style={{ fontWeight: 800, color: item.color }}>{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE LIST TAB (SQL / PySpark)
   ═══════════════════════════════════════════════════════════════════════════ */

function ModuleListTab({
  modules,
  expandedModule,
  onToggle,
  onCopy,
  copiedId,
}: {
  modules: GoldCodeModule[];
  expandedModule: string | null;
  onToggle: (id: string) => void;
  onCopy: (c: string, id: string) => void;
  copiedId: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {modules.map((m, i) => {
        const isExpanded = expandedModule === m.id;
        const color = MODULE_COLORS[m.category];

        return (
          <div key={m.id} style={{ borderRadius: 12, background: "#131620", border: `1px solid ${color}25`, overflow: "hidden" }}>
            <div
              onClick={() => onToggle(m.id)}
              style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderBottom: isExpanded ? "1px solid #1e293b" : "none" }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 6, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{MODULE_ICONS[m.category]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color }}>{m.title}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{m.description}</div>
              </div>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: m.language === "sql" ? "#10b98118" : "#3b82f618", color: m.language === "sql" ? "#10b981" : "#3b82f6" }}>{m.language.toUpperCase()}</span>
              <span style={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>{m.lineCount} lines</span>
              {m.unityCatalogObjects.length > 0 && (
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#f59e0b18", color: "#f59e0b" }}>{m.unityCatalogObjects.length} tables</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onCopy(m.code, m.id); }}
                style={{ padding: "4px 14px", borderRadius: 6, background: color, color: "#fff", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700 }}
              >{copiedId === m.id ? "Copied!" : "Copy Code"}</button>
              <span style={{ fontSize: 12, color: "#475569", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
            </div>

            {isExpanded && (
              <div>
                {m.unityCatalogObjects.length > 0 && (
                  <div style={{ padding: "8px 20px", background: "#0a0d14", borderBottom: "1px solid #1e293b", display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>catalog:</span>
                    {m.unityCatalogObjects.map((t, j) => (
                      <span key={j} style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, background: "#f59e0b10", color: "#f59e0b", fontFamily: "monospace" }}>{t}</span>
                    ))}
                  </div>
                )}
                <pre style={{
                  margin: 0, padding: 20, fontSize: 12, lineHeight: 1.6, color: m.language === "sql" ? "#a5f3fc" : "#e2e8f0",
                  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                  whiteSpace: "pre", overflow: "auto", maxHeight: "60vh", background: "#080a10",
                }}>
                  {m.code}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   POWER BI TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function PowerBITab({ modules, result, onCopy, copiedId }: { modules: GoldCodeModule[]; result: GoldCodegenResult; onCopy: (c: string, id: string) => void; copiedId: string | null }) {
  const pbiModule = modules[0];
  const views = [
    { name: "pbi_fact_metrics", type: "Fact Table", desc: "KPI metrics with date/category dimensions, trend direction, year/month breakdowns", color: "#ec4899" },
    { name: "pbi_dim_date", type: "Dimension", desc: "Date dimension — year, quarter, month, week, day name, weekday flag, is_today", color: "#8b5cf6" },
    { name: "pbi_dim_metric_category", type: "Dimension", desc: "Metric category dimension — Finance, Operations, Governance, Leadership groups", color: "#3b82f6" },
    { name: "pbi_dim_alert_status", type: "Dimension", desc: "Alert status dimension — OK/WARNING/CRITICAL with hex colors and severity rank", color: "#f59e0b" },
    { name: "pbi_summary_today", type: "Summary", desc: "Landing page KPIs — active KPIs, critical/warning alerts, DQ score, freshness", color: "#10b981" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Star schema diagram */}
      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #ec489930", padding: 20 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#ec4899" }}>Star Schema for Power BI</h3>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#64748b" }}>
          DirectQuery / Import-ready views with fact + dimension separation, pre-computed date attributes, and landing page summary.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {views.map((v) => (
            <div key={v.name} style={{ padding: 14, borderRadius: 10, background: "#0a0d14", border: `1px solid ${v.color}25` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: `${v.color}18`, color: v.color, textTransform: "uppercase", letterSpacing: 0.5 }}>{v.type}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9", fontFamily: "monospace", marginBottom: 6 }}>{v.name}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>{v.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Code */}
      {pbiModule && (
        <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1e293b" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#ec4899" }}>Power BI Views SQL</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{pbiModule.lineCount} lines — CREATE OR REPLACE VIEW statements</div>
            </div>
            <button
              onClick={() => onCopy(pbiModule.code, pbiModule.id)}
              style={{ padding: "6px 16px", borderRadius: 8, background: "#ec4899", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
            >{copiedId === pbiModule.id ? "Copied!" : "Copy SQL"}</button>
          </div>
          <pre style={{
            margin: 0, padding: 20, fontSize: 12, lineHeight: 1.6, color: "#a5f3fc",
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            whiteSpace: "pre", overflow: "auto", maxHeight: "55vh", background: "#080a10",
          }}>
            {pbiModule.code}
          </pre>
        </div>
      )}

      {/* Connection instructions */}
      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Power BI Connection Setup</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { step: "1", title: "Get Data → Databricks", desc: "Select Azure Databricks connector, enter workspace URL and HTTP path from cluster config", color: "#3b82f6" },
            { step: "2", title: "Service Principal Auth", desc: "Use App Registration client ID + secret. GRANT SELECT on all pbi_* views to the service principal", color: "#f59e0b" },
            { step: "3", title: "Import Star Schema", desc: "Import pbi_fact_metrics + all pbi_dim_* views. Set relationships on shared keys (metric_date, metric_category, alert_status)", color: "#10b981" },
          ].map((s) => (
            <div key={s.step} style={{ padding: 14, borderRadius: 10, background: "#0a0d14", border: `1px solid ${s.color}20` }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: s.color, marginBottom: 8 }}>{s.step}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   UNITY CATALOG TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function CatalogTab({ result }: { result: GoldCodegenResult }) {
  const getTypeColor = (table: string) => {
    if (table.includes("vw_") || table.includes("pbi_")) return { color: "#8b5cf6", type: "VIEW" };
    if (table.includes("audit") || table.includes("alert_history")) return { color: "#06b6d4", type: "AUDIT" };
    if (table.includes("depend")) return { color: "#ef4444", type: "DEPENDENCY" };
    if (table.includes("kpi")) return { color: "#10b981", type: "KPI TABLE" };
    if (table.includes("aggregat")) return { color: "#3b82f6", type: "AGG TABLE" };
    if (table.includes("business")) return { color: "#f59e0b", type: "METRIC TABLE" };
    if (table.includes("silver")) return { color: "#94a3b8", type: "SOURCE (SILVER)" };
    return { color: "#64748b", type: "TABLE" };
  };

  const tables = result.summary.unityCatalogTables;
  const goldTables = tables.filter((t) => t.includes(".gold."));
  const views = tables.filter((t) => t.includes("vw_") || t.includes("pbi_"));
  const silverRefs = tables.filter((t) => t.includes(".silver."));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Gold Tables", value: goldTables.length - views.length, color: "#f59e0b" },
          { label: "Gold Views", value: views.length, color: "#8b5cf6" },
          { label: "Silver References", value: silverRefs.length, color: "#94a3b8" },
          { label: "Total Objects", value: tables.length, color: "#f1f5f9" },
        ].map((s, i) => (
          <div key={i} style={{ padding: 16, borderRadius: 12, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table list */}
      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>All Unity Catalog Objects</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {tables.map((table, i) => {
            const { color, type } = getTypeColor(table);
            return (
              <div key={i} style={{ padding: 14, borderRadius: 10, background: "#0a0d14", border: `1px solid ${color}20` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: `${color}18`, color, textTransform: "uppercase", letterSpacing: 0.5 }}>{type}</span>
                  <span style={{ fontSize: 10, color: "#475569" }}>DELTA</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9", fontFamily: "monospace" }}>{table}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delta features */}
      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Delta Lake Features</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { feature: "MERGE INTO", desc: "Idempotent KPI writes — upsert on kpi_id + metric_date", color: "#3b82f6" },
            { feature: "CREATE OR REPLACE VIEW", desc: "Dashboard and Power BI views refreshed atomically", color: "#8b5cf6" },
            { feature: "OPTIMIZE + Z-ORDER", desc: "Compaction with data skipping on metric_date for fast queries", color: "#10b981" },
            { feature: "VACUUM", desc: "7-day retention cleanup to reclaim storage from old versions", color: "#ef4444" },
            { feature: "Change Data Feed", desc: "Row-level CDC for downstream consumers and audit tracking", color: "#f59e0b" },
            { feature: "Auto-Optimize", desc: "Automatic write optimization + auto-compaction on every write", color: "#06b6d4" },
          ].map((f, i) => (
            <div key={i} style={{ padding: 14, borderRadius: 10, background: "#0a0d14", border: `1px solid ${f.color}20` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: f.color, fontFamily: "monospace", marginBottom: 6 }}>{f.feature}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
