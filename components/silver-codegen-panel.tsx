"use client";

import { useState, useMemo } from "react";
import {
  type SilverCodegenResult,
  type GeneratedModule,
  STAGE_MODULE_LABELS,
  STAGE_MODULE_ICONS,
  generateSilverCode,
} from "@/lib/silver-codegen";
import { STAGE_COLORS, type SilverStage } from "@/lib/silver-spec-analyzer";

interface Props {
  open: boolean;
  onClose: () => void;
  sourceCode: string;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

type TabId = "overview" | "modules" | "orchestrator" | "config" | "catalog";

export default function SilverCodegenPanel({ open, onClose, sourceCode, outputCode, direction }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const result = useMemo<SilverCodegenResult | null>(() => {
    if (!sourceCode.trim()) return null;
    return generateSilverCode(sourceCode, outputCode, direction);
  }, [sourceCode, outputCode, direction]);

  if (!open) return null;

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const copyAllModules = () => {
    if (!result) return;
    const all = [
      `# ══ silver_config.py ══\n${result.configModule}`,
      ...result.modules.map((m) => `# ══ ${m.id}.py ══\n${m.code}`),
      `# ══ silver_orchestrator.py ══\n${result.entryPoint}`,
    ].join("\n\n");
    copyCode(all, "all");
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "modules", label: "PySpark Modules", count: result?.modules.length },
    { id: "orchestrator", label: "Orchestrator" },
    { id: "config", label: "Config" },
    { id: "catalog", label: "Unity Catalog", count: result?.summary.unityCatalogTables.length },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "96vw", maxWidth: 1500, height: "92vh", background: "#0f1117", borderRadius: 16, border: "1px solid #1e293b", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "20px 28px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⚙️</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Silver Layer Code Generator</h2>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                Production PySpark — Unity Catalog · Delta Lake · Error Handling · Audit Framework
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {result && (
              <>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "#3b82f618", color: "#3b82f6", border: "1px solid #3b82f640" }}>
                  {result.summary.totalModules} Modules
                </div>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "#8b5cf618", color: "#8b5cf6", border: "1px solid #8b5cf640" }}>
                  {result.summary.totalLines} Lines
                </div>
                <button onClick={copyAllModules} style={{ padding: "6px 14px", borderRadius: 8, background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
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
                color: activeTab === t.id ? "#3b82f6" : "#64748b",
                borderBottom: activeTab === t.id ? "2px solid #3b82f6" : "2px solid transparent",
                cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
              }}
            >
              {t.label}
              {t.count !== undefined && (
                <span style={{ padding: "1px 7px", borderRadius: 10, background: activeTab === t.id ? "#3b82f618" : "#1e293b", fontSize: 11 }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
          {!result ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: 60, fontSize: 14 }}>
              Paste source Glue/ETL code to generate Silver layer PySpark modules
            </div>
          ) : activeTab === "overview" ? (
            <OverviewTab result={result} onCopy={copyCode} copiedId={copiedId} />
          ) : activeTab === "modules" ? (
            <ModulesTab result={result} expandedModule={expandedModule} onToggle={(id) => setExpandedModule(expandedModule === id ? null : id)} onCopy={copyCode} copiedId={copiedId} />
          ) : activeTab === "orchestrator" ? (
            <CodeTab title="Silver Pipeline Orchestrator" subtitle="Entry point — run_silver_pipeline()" code={result.entryPoint} id="orchestrator" onCopy={copyCode} copiedId={copiedId} />
          ) : activeTab === "config" ? (
            <CodeTab title="Silver Configuration" subtitle="SilverConfig dataclass — centralized settings" code={result.configModule} id="config" onCopy={copyCode} copiedId={copiedId} />
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

function OverviewTab({ result, onCopy, copiedId }: { result: SilverCodegenResult; onCopy: (c: string, id: string) => void; copiedId: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {[
          { label: "PySpark Modules", value: result.summary.totalModules, color: "#3b82f6" },
          { label: "Total Lines", value: result.summary.totalLines, color: "#8b5cf6" },
          { label: "Stages Covered", value: `${result.summary.stagesCovered}/7`, color: "#10b981" },
          { label: "Unity Catalog Tables", value: result.summary.unityCatalogTables.length, color: "#f59e0b" },
          { label: "Delta Operations", value: result.summary.deltaOperations.length, color: "#ef4444" },
        ].map((s, i) => (
          <div key={i} style={{ padding: 16, borderRadius: 12, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Pipeline flow */}
      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Pipeline Execution Flow</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {result.modules.map((m, i) => {
            const color = STAGE_COLORS[m.stage] || "#64748b";
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color }}>{i + 1}</div>
                <span style={{ fontSize: 16 }}>{STAGE_MODULE_ICONS[m.stage]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{m.description}</div>
                </div>
                <div style={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>{m.lineCount} lines</div>
                <button
                  onClick={() => onCopy(m.code, m.id)}
                  style={{ padding: "4px 12px", borderRadius: 6, background: "#1e293b", color: copiedId === m.id ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                >{copiedId === m.id ? "Copied!" : "Copy"}</button>
                {i < result.modules.length - 1 && (
                  <div style={{ position: "absolute", left: 44, top: "100%", width: 2, height: 8, background: "#1e293b" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Delta operations */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Delta Lake Operations</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {result.summary.deltaOperations.map((op, i) => (
              <span key={i} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#ef444418", color: "#ef4444", fontFamily: "monospace" }}>{op}</span>
            ))}
          </div>
        </div>
        <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Error Handling Patterns</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {result.summary.errorHandlingPatterns.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#94a3b8" }}>
                <span style={{ color: "#10b981" }}>✓</span> {p}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODULES TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function ModulesTab({
  result,
  expandedModule,
  onToggle,
  onCopy,
  copiedId,
}: {
  result: SilverCodegenResult;
  expandedModule: string | null;
  onToggle: (id: string) => void;
  onCopy: (c: string, id: string) => void;
  copiedId: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {result.modules.map((m, i) => {
        const isExpanded = expandedModule === m.id;
        const color = STAGE_COLORS[m.stage] || "#64748b";

        return (
          <div key={m.id} style={{ borderRadius: 12, background: "#131620", border: `1px solid ${color}25`, overflow: "hidden" }}>
            {/* Header */}
            <div
              onClick={() => onToggle(m.id)}
              style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderBottom: isExpanded ? "1px solid #1e293b" : "none" }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 6, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color }}>{i + 1}</div>
              <span style={{ fontSize: 16 }}>{STAGE_MODULE_ICONS[m.stage]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color }}>{m.title}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{m.description}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>{m.lineCount} lines</span>
                {m.unityCatalogObjects.length > 0 && (
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#f59e0b18", color: "#f59e0b" }}>
                    {m.unityCatalogObjects.length} tables
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onCopy(m.code, m.id); }}
                  style={{ padding: "4px 14px", borderRadius: 6, background: color, color: "#fff", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700 }}
                >{copiedId === m.id ? "Copied!" : "Copy Code"}</button>
                <span style={{ fontSize: 12, color: "#475569", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
              </div>
            </div>

            {/* Code block */}
            {isExpanded && (
              <div style={{ position: "relative" }}>
                {/* Dependencies */}
                <div style={{ padding: "8px 20px", background: "#0a0d14", borderBottom: "1px solid #1e293b", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>deps:</span>
                  {m.dependencies.map((d, j) => (
                    <span key={j} style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, background: "#1e293b", color: "#94a3b8", fontFamily: "monospace" }}>{d}</span>
                  ))}
                </div>
                {/* Unity Catalog objects */}
                {m.unityCatalogObjects.length > 0 && (
                  <div style={{ padding: "8px 20px", background: "#0a0d14", borderBottom: "1px solid #1e293b", display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>catalog:</span>
                    {m.unityCatalogObjects.map((t, j) => (
                      <span key={j} style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, background: "#f59e0b10", color: "#f59e0b", fontFamily: "monospace" }}>{t}</span>
                    ))}
                  </div>
                )}
                <pre style={{
                  margin: 0, padding: 20, fontSize: 12, lineHeight: 1.6, color: "#e2e8f0",
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
   CODE TAB (Orchestrator / Config)
   ═══════════════════════════════════════════════════════════════════════════ */

function CodeTab({
  title,
  subtitle,
  code,
  id,
  onCopy,
  copiedId,
}: {
  title: string;
  subtitle: string;
  code: string;
  id: string;
  onCopy: (c: string, id: string) => void;
  copiedId: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{title}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#475569", fontFamily: "monospace", padding: "4px 8px" }}>{code.split("\n").length} lines</span>
          <button
            onClick={() => onCopy(code, id)}
            style={{ padding: "6px 16px", borderRadius: 8, background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
          >{copiedId === id ? "Copied!" : "Copy Code"}</button>
        </div>
      </div>
      <pre style={{
        margin: 0, padding: 20, borderRadius: 12, background: "#080a10", border: "1px solid #1e293b",
        fontSize: 12, lineHeight: 1.6, color: "#e2e8f0",
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
        whiteSpace: "pre", overflow: "auto", maxHeight: "75vh",
      }}>
        {code}
      </pre>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   UNITY CATALOG TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function CatalogTab({ result }: { result: SilverCodegenResult }) {
  const tableColors: Record<string, string> = {
    silver: "#3b82f6",
    quarantine: "#ef4444",
    audit: "#f59e0b",
    dq_metrics: "#10b981",
    _watermarks: "#8b5cf6",
    reference: "#06b6d4",
  };

  const getColor = (table: string) => {
    for (const [key, color] of Object.entries(tableColors)) {
      if (table.includes(key)) return color;
    }
    return "#64748b";
  };

  const getType = (table: string) => {
    if (table.includes("quarantine")) return "Error Routing";
    if (table.includes("audit")) return "Audit Trail";
    if (table.includes("dq_metrics")) return "DQ Metrics";
    if (table.includes("_watermarks")) return "Watermark Tracking";
    if (table.includes("reference") || table.includes("dim_")) return "Reference/Lookup";
    return "Silver Table";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Unity Catalog Objects</h3>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#64748b" }}>
          All tables are registered in Unity Catalog with Delta Lake format, auto-optimize, and change data feed enabled.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {result.summary.unityCatalogTables.map((table, i) => {
            const color = getColor(table);
            const type = getType(table);
            return (
              <div key={i} style={{ padding: 16, borderRadius: 10, background: "#0a0d14", border: `1px solid ${color}25` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${color}18`, color }}>{type}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", fontFamily: "monospace" }}>{table}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
                  Format: Delta · Auto-optimize: ON · CDF: enabled
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delta operations */}
      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Delta Lake Features Used</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { feature: "MERGE INTO", desc: "SCD Type 1 upsert with matched update + not-matched insert", color: "#3b82f6" },
            { feature: "Z-ORDER BY", desc: "Data skipping optimization on key columns for fast queries", color: "#8b5cf6" },
            { feature: "OPTIMIZE", desc: "Bin-packing compaction to reduce small files and improve read performance", color: "#10b981" },
            { feature: "VACUUM", desc: "Remove old file versions beyond retention period (7 days default)", color: "#ef4444" },
            { feature: "Change Data Feed", desc: "Enabled for downstream consumers to track row-level changes", color: "#f59e0b" },
            { feature: "Auto-Optimize", desc: "Automatic write optimization and auto-compaction on every write", color: "#06b6d4" },
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
