"use client";

import { useState, useMemo } from "react";
import {
  TransformCategory,
  CATEGORY_LABELS,
  GeneratedTransform,
  ValidationRule,
  MetadataDefinition,
  type ProductionSilverResult,
  type ErrorHandlingSpec,
  type PerformanceRec,
  type SchemaDriftCheck,
  type CrossLayerDQContract,
  analyzeProductionSilver,
} from "@/lib/silver-layer-analyzer";

interface Props {
  open: boolean;
  onClose: () => void;
  sourceCode: string;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

const CAT_COLORS: Record<TransformCategory, string> = {
  "schema-standardization": "#3b82f6",
  "data-cleansing": "#10b981",
  "type-conversion": "#f59e0b",
  "deduplication": "#8b5cf6",
  "data-enrichment": "#06b6d4",
  "pii-masking": "#ef4444",
  "data-quality-validation": "#f97316",
  "business-rule": "#ec4899",
};

const CAT_ICONS: Record<TransformCategory, string> = {
  "schema-standardization": "⊞",
  "data-cleansing": "✦",
  "type-conversion": "⇄",
  "deduplication": "⊘",
  "data-enrichment": "⊕",
  "pii-masking": "🛡",
  "data-quality-validation": "✓",
  "business-rule": "⚙",
};

type TabId = "summary" | "transforms" | "validation" | "metadata" | "pipeline" | "audit" | "errors" | "performance" | "crosslayer";

export default function SilverLayerPanel({
  open,
  onClose,
  sourceCode,
  outputCode,
  direction,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [expandedTransform, setExpandedTransform] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<TransformCategory | "all">("all");

  const result = useMemo<ProductionSilverResult | null>(() => {
    if (!open || !sourceCode) return null;
    try {
      return analyzeProductionSilver(sourceCode, outputCode, direction);
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
    const allCode = result.transforms
      .map((t) => `# ═══ ${t.name} ═══\n# ${t.description}\n# Category: ${CATEGORY_LABELS[t.category]}\n# Reusable: ${t.reusable}\n\n${t.code}`)
      .join("\n\n\n");
    const blob = new Blob([allCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `silver_transforms_${Date.now()}.py`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "summary", label: "Summary" },
    { id: "transforms", label: "Transforms", count: result?.transforms.length },
    { id: "pipeline", label: "Production Pipeline" },
    { id: "audit", label: "Audit & Incremental" },
    { id: "errors", label: "Error Handling", count: result?.errorHandling.length },
    { id: "performance", label: "Performance", count: result?.performanceRecs.length },
    { id: "validation", label: "Validation", count: result?.validationRules.length },
    { id: "metadata", label: "Metadata", count: result?.metadata.length },
    { id: "crosslayer", label: "Cross-Layer DQ", count: result?.crossLayerDQ.length },
  ];

  const confidenceColor = (c: number) =>
    c >= 0.8 ? "#10b981" : c >= 0.6 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "92vw", maxWidth: 1300, height: "88vh", background: "#0f1117", borderRadius: 16, border: "1px solid #1e293b", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "20px 28px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>◈</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Silver Layer Transformer</h2>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                Intent extraction → Cloud-native code generation → Validation rules
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {result && (
              <>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, background: `${confidenceColor(result.overallConfidence)}18`, color: confidenceColor(result.overallConfidence), border: `1px solid ${confidenceColor(result.overallConfidence)}40` }}>
                  Confidence: {Math.round(result.overallConfidence * 100)}%
                </div>
                <button onClick={downloadAll} style={{ padding: "6px 14px", borderRadius: 8, background: "#6366f1", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  Download All
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
                color: activeTab === t.id ? "#818cf8" : "#64748b",
                border: "none",
                borderBottom: activeTab === t.id ? "2px solid #818cf8" : "2px solid transparent",
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
                <span style={{ padding: "1px 7px", borderRadius: 10, background: activeTab === t.id ? "#818cf820" : "#1e293b", fontSize: 11 }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
          {!result ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: 60, fontSize: 14 }}>
              Paste source workflow code to analyze Silver layer transformations
            </div>
          ) : activeTab === "summary" ? (
            <SummaryTab result={result} />
          ) : activeTab === "transforms" ? (
            <TransformsTab
              transforms={result.transforms}
              expanded={expandedTransform}
              onToggle={(id) => setExpandedTransform(expandedTransform === id ? null : id)}
              copiedId={copiedId}
              onCopy={copyCode}
              filterCat={filterCat}
              onFilter={setFilterCat}
            />
          ) : activeTab === "pipeline" ? (
            <PipelineTab code={result.productionPipeline} incrementalConfig={result.incrementalConfig} onCopy={copyCode} copiedId={copiedId} />
          ) : activeTab === "audit" ? (
            <AuditTab auditFramework={result.auditFramework} incrementalConfig={result.incrementalConfig} schemaDriftChecks={result.schemaDriftChecks} onCopy={copyCode} copiedId={copiedId} />
          ) : activeTab === "errors" ? (
            <ErrorsTab specs={result.errorHandling} onCopy={copyCode} copiedId={copiedId} />
          ) : activeTab === "performance" ? (
            <PerformanceTab recs={result.performanceRecs} onCopy={copyCode} copiedId={copiedId} />
          ) : activeTab === "validation" ? (
            <ValidationTab rules={result.validationRules} />
          ) : activeTab === "crosslayer" ? (
            <CrossLayerDQTab contracts={result.crossLayerDQ} onCopy={copyCode} copiedId={copiedId} />
          ) : (
            <MetadataTab metadata={result.metadata} />
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryTab({ result }: { result: ProductionSilverResult }) {
  const { summary, overallConfidence } = result;

  const statCards = [
    { label: "Total Intents", value: summary.totalIntents, color: "#818cf8" },
    { label: "Platform-Specific", value: summary.platformSpecificCount, color: "#f59e0b" },
    { label: "Cloud-Native Transforms", value: summary.cloudNativeCount, color: "#10b981" },
    { label: "Reusable Modules", value: summary.reusableTransformCount, color: "#06b6d4" },
    { label: "PII Fields", value: summary.piiFieldsDetected, color: "#ef4444" },
    { label: "Quality Rules", value: summary.qualityRulesGenerated, color: "#f97316" },
  ];

  const categories = Object.entries(summary.byCategory).filter(([, c]) => c > 0) as [TransformCategory, number][];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
        {statCards.map((s) => (
          <div key={s.label} style={{ padding: 18, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Confidence ring */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 200px", padding: 24, borderRadius: 12, background: "#131620", border: "1px solid #1e293b", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <svg width={120} height={120} viewBox="0 0 120 120">
            <circle cx={60} cy={60} r={52} fill="none" stroke="#1e293b" strokeWidth={8} />
            <circle
              cx={60} cy={60} r={52} fill="none"
              stroke={overallConfidence >= 0.8 ? "#10b981" : overallConfidence >= 0.6 ? "#f59e0b" : "#ef4444"}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={`${overallConfidence * 327} 327`}
              transform="rotate(-90 60 60)"
            />
            <text x={60} y={55} textAnchor="middle" fill="#f1f5f9" fontSize={24} fontWeight={800}>{Math.round(overallConfidence * 100)}</text>
            <text x={60} y={72} textAnchor="middle" fill="#64748b" fontSize={11}>confidence</text>
          </svg>
        </div>

        {/* Category breakdown */}
        <div style={{ flex: 1, padding: 20, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Category Breakdown</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {categories.map(([cat, count]) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{CAT_ICONS[cat]}</span>
                <span style={{ flex: 1, fontSize: 13, color: "#e2e8f0" }}>{CATEGORY_LABELS[cat]}</span>
                <div style={{ width: 120, height: 6, borderRadius: 3, background: "#1e293b", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min((count / summary.totalIntents) * 100, 100)}%`, height: "100%", borderRadius: 3, background: CAT_COLORS[cat] }} />
                </div>
                <span style={{ fontSize: 12, color: CAT_COLORS[cat], fontWeight: 600, width: 28, textAlign: "right" }}>{count}</span>
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

      {/* Intent list */}
      <div style={{ padding: 20, borderRadius: 12, background: "#131620", border: "1px solid #1e293b" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Extracted Intents</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflow: "auto" }}>
          {result.intents.map((intent) => (
            <div key={intent.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "#0f1117" }}>
              <span style={{ fontSize: 14 }}>{CAT_ICONS[intent.category]}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${CAT_COLORS[intent.category]}20`, color: CAT_COLORS[intent.category] }}>
                {CATEGORY_LABELS[intent.category]}
              </span>
              <span style={{ flex: 1, fontSize: 13, color: "#e2e8f0" }}>{intent.description}</span>
              <span style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: intent.severity === "critical" ? "#ef444420" : intent.severity === "high" ? "#f59e0b20" : "#64748b20",
                color: intent.severity === "critical" ? "#ef4444" : intent.severity === "high" ? "#f59e0b" : "#94a3b8",
              }}>
                {intent.severity}
              </span>
              <span style={{ fontSize: 12, color: "#64748b" }}>{Math.round(intent.confidence * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TransformsTab({
  transforms,
  expanded,
  onToggle,
  copiedId,
  onCopy,
  filterCat,
  onFilter,
}: {
  transforms: GeneratedTransform[];
  expanded: string | null;
  onToggle: (id: string) => void;
  copiedId: string | null;
  onCopy: (code: string, id: string) => void;
  filterCat: TransformCategory | "all";
  onFilter: (c: TransformCategory | "all") => void;
}) {
  const filtered = filterCat === "all" ? transforms : transforms.filter((t) => t.category === filterCat);
  const usedCats = [...new Set(transforms.map((t) => t.category))] as TransformCategory[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filter bar */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          onClick={() => onFilter("all")}
          style={{
            padding: "5px 12px", borderRadius: 6, border: "1px solid", fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: filterCat === "all" ? "#818cf820" : "transparent",
            borderColor: filterCat === "all" ? "#818cf8" : "#1e293b",
            color: filterCat === "all" ? "#818cf8" : "#64748b",
          }}
        >All ({transforms.length})</button>
        {usedCats.map((cat) => (
          <button
            key={cat}
            onClick={() => onFilter(cat)}
            style={{
              padding: "5px 12px", borderRadius: 6, border: "1px solid", fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: filterCat === cat ? `${CAT_COLORS[cat]}18` : "transparent",
              borderColor: filterCat === cat ? CAT_COLORS[cat] : "#1e293b",
              color: filterCat === cat ? CAT_COLORS[cat] : "#64748b",
            }}
          >{CAT_ICONS[cat]} {CATEGORY_LABELS[cat]}</button>
        ))}
      </div>

      {/* Transform cards */}
      {filtered.map((t) => (
        <div key={t.id} style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
          <div
            onClick={() => onToggle(t.id)}
            style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "background 0.15s" }}
          >
            <span style={{ fontSize: 16, transform: expanded === t.id ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s" }}>▶</span>
            <span style={{ fontSize: 16 }}>{CAT_ICONS[t.category]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", fontFamily: "monospace" }}>{t.name}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{t.description}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {t.reusable && (
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#10b98118", color: "#10b981" }}>Reusable</span>
              )}
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "#818cf818", color: "#818cf8" }}>{t.language}</span>
            </div>
          </div>
          {expanded === t.id && (
            <div style={{ borderTop: "1px solid #1e293b" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 16px 0", gap: 8 }}>
                <button
                  onClick={() => onCopy(t.code, t.id)}
                  style={{ padding: "4px 12px", borderRadius: 6, background: "#1e293b", color: copiedId === t.id ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                >
                  {copiedId === t.id ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre style={{ margin: 0, padding: "12px 20px 20px", fontSize: 12, lineHeight: 1.6, color: "#a5b4fc", overflow: "auto", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
                {t.code}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ValidationTab({ rules }: { rules: ValidationRule[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 8 }}>
        {[
          { label: "Error Rules", count: rules.filter((r) => r.severity === "error").length, color: "#ef4444" },
          { label: "Warning Rules", count: rules.filter((r) => r.severity === "warning").length, color: "#f59e0b" },
          { label: "Auto-Fixable", count: rules.filter((r) => r.autoFix).length, color: "#10b981" },
        ].map((s) => (
          <div key={s.label} style={{ padding: 16, borderRadius: 10, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {rules.map((rule) => (
        <div key={rule.id} style={{ padding: 16, borderRadius: 10, background: "#131620", border: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{
              padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: rule.severity === "error" ? "#ef444420" : rule.severity === "warning" ? "#f59e0b20" : "#3b82f620",
              color: rule.severity === "error" ? "#ef4444" : rule.severity === "warning" ? "#f59e0b" : "#3b82f6",
            }}>{rule.severity.toUpperCase()}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", fontFamily: "monospace" }}>{rule.name}</span>
            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, background: `${CAT_COLORS[rule.category]}18`, color: CAT_COLORS[rule.category] }}>
              {CATEGORY_LABELS[rule.category]}
            </span>
            {rule.autoFix && (
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#10b98118", color: "#10b981" }}>Auto-fix</span>
            )}
          </div>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#cbd5e1" }}>{rule.description}</p>
          <code style={{ fontSize: 12, color: "#818cf8", fontFamily: "monospace" }}>{rule.expression}</code>
          {rule.fixCode && (
            <pre style={{ margin: "8px 0 0", padding: 10, borderRadius: 6, background: "#0a0d14", fontSize: 11, color: "#a5b4fc", fontFamily: "monospace" }}>{rule.fixCode}</pre>
          )}
        </div>
      ))}
    </div>
  );
}

function MetadataTab({ metadata }: { metadata: MetadataDefinition[] }) {
  const piiColors: Record<string, string> = { none: "#64748b", direct: "#ef4444", quasi: "#f59e0b", sensitive: "#f97316" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12 }}>
        {[
          { label: "Total Fields", value: metadata.length, color: "#818cf8" },
          { label: "Direct PII", value: metadata.filter((m) => m.piiClassification === "direct").length, color: "#ef4444" },
          { label: "Quasi PII", value: metadata.filter((m) => m.piiClassification === "quasi").length, color: "#f59e0b" },
          { label: "Sensitive", value: metadata.filter((m) => m.piiClassification === "sensitive").length, color: "#f97316" },
        ].map((s) => (
          <div key={s.label} style={{ flex: 1, padding: 14, borderRadius: 10, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["Field", "Source Type", "Target Type", "Nullable", "PII", "Transforms", "Quality Rules"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metadata.map((m) => (
              <tr key={m.fieldName} style={{ borderBottom: "1px solid #1e293b10" }}>
                <td style={{ padding: "10px 14px", color: "#f1f5f9", fontFamily: "monospace", fontWeight: 600 }}>{m.fieldName}</td>
                <td style={{ padding: "10px 14px", color: "#94a3b8", fontFamily: "monospace" }}>{m.sourceType}</td>
                <td style={{ padding: "10px 14px", color: "#818cf8", fontFamily: "monospace" }}>{m.targetType}</td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ color: m.nullable ? "#64748b" : "#ef4444", fontWeight: 600 }}>{m.nullable ? "yes" : "NO"}</span>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${piiColors[m.piiClassification]}18`, color: piiColors[m.piiClassification] }}>
                    {m.piiClassification}
                  </span>
                </td>
                <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 12 }}>{m.transformations.length}</td>
                <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 12 }}>{m.qualityRules.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Production Pipeline Tab ──────────────────────────────────────────────────

function PipelineTab({ code, incrementalConfig, onCopy, copiedId }: {
  code: string;
  incrementalConfig: ProductionSilverResult["incrementalConfig"];
  onCopy: (code: string, id: string) => void;
  copiedId: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1, padding: 16, borderRadius: 10, background: "#131620", border: "1px solid #1e293b" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Strategy</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#818cf8", textTransform: "uppercase" }}>{incrementalConfig.strategy}</div>
        </div>
        <div style={{ flex: 1, padding: 16, borderRadius: 10, background: "#131620", border: "1px solid #1e293b" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Merge Keys</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#10b981", fontFamily: "monospace" }}>{incrementalConfig.mergeKeys.join(", ")}</div>
        </div>
        <div style={{ flex: 1, padding: 16, borderRadius: 10, background: "#131620", border: "1px solid #1e293b" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Watermark</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b", fontFamily: "monospace" }}>{incrementalConfig.watermarkColumn}</div>
        </div>
      </div>

      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#10b98118", color: "#10b981" }}>Production-Ready</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Complete Silver Pipeline</span>
          </div>
          <button onClick={() => onCopy(code, "pipeline")} style={{ padding: "4px 12px", borderRadius: 6, background: "#1e293b", color: copiedId === "pipeline" ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            {copiedId === "pipeline" ? "Copied!" : "Copy All"}
          </button>
        </div>
        <pre style={{ margin: 0, padding: "16px 20px", fontSize: 11, lineHeight: 1.6, color: "#a5b4fc", overflow: "auto", maxHeight: 600, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "pre-wrap" }}>{code}</pre>
      </div>
    </div>
  );
}

// ── Audit & Incremental Tab ──────────────────────────────────────────────────

function AuditTab({ auditFramework, incrementalConfig, schemaDriftChecks, onCopy, copiedId }: {
  auditFramework: ProductionSilverResult["auditFramework"];
  incrementalConfig: ProductionSilverResult["incrementalConfig"];
  schemaDriftChecks: SchemaDriftCheck[];
  onCopy: (code: string, id: string) => void;
  copiedId: string | null;
}) {
  const [section, setSection] = useState<"audit" | "incremental" | "drift">("audit");

  const sections = [
    { id: "audit" as const, label: "Audit Framework", icon: "📊" },
    { id: "incremental" as const, label: "Incremental / Delta Merge", icon: "⇄" },
    { id: "drift" as const, label: "Schema Drift Detection", icon: "🔍", count: schemaDriftChecks.length },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {sections.map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{
            padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: section === s.id ? "#818cf818" : "#131620",
            border: `1px solid ${section === s.id ? "#818cf8" : "#1e293b"}`,
            color: section === s.id ? "#818cf8" : "#64748b",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {s.icon} {s.label}
            {s.count !== undefined && <span style={{ padding: "1px 6px", borderRadius: 8, background: "#1e293b", fontSize: 10 }}>{s.count}</span>}
          </button>
        ))}
      </div>

      {section === "audit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {Object.entries(auditFramework.metrics).map(([key, val]) => (
              <div key={key} style={{ padding: 14, borderRadius: 10, background: "#131620", border: "1px solid #1e293b" }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}</div>
                <div style={{ fontSize: 12, color: "#818cf8", fontFamily: "monospace" }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Audit Framework Implementation</span>
              <button onClick={() => onCopy(auditFramework.code, "audit")} style={{ padding: "4px 12px", borderRadius: 6, background: "#1e293b", color: copiedId === "audit" ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {copiedId === "audit" ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre style={{ margin: 0, padding: "14px 20px", fontSize: 11, lineHeight: 1.6, color: "#a5b4fc", overflow: "auto", maxHeight: 500, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{auditFramework.code}</pre>
          </div>
        </div>
      )}

      {section === "incremental" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: 16, borderRadius: 10, background: "#131620", border: "1px solid #1e293b" }}>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{incrementalConfig.description}</div>
          </div>
          <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#f59e0b18", color: "#f59e0b", textTransform: "uppercase" }}>{incrementalConfig.strategy}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Incremental Processing</span>
              </div>
              <button onClick={() => onCopy(incrementalConfig.code, "incr")} style={{ padding: "4px 12px", borderRadius: 6, background: "#1e293b", color: copiedId === "incr" ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {copiedId === "incr" ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre style={{ margin: 0, padding: "14px 20px", fontSize: 11, lineHeight: 1.6, color: "#a5b4fc", overflow: "auto", maxHeight: 500, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{incrementalConfig.code}</pre>
          </div>
        </div>
      )}

      {section === "drift" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {schemaDriftChecks.map((check) => (
            <div key={check.id} style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: check.severity === "error" ? "#ef444418" : check.severity === "warning" ? "#f59e0b18" : "#3b82f618", color: check.severity === "error" ? "#ef4444" : check.severity === "warning" ? "#f59e0b" : "#3b82f6" }}>{check.severity.toUpperCase()}</span>
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "#1e293b", color: "#94a3b8" }}>{check.checkType}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{check.name}</span>
                <button onClick={() => onCopy(check.code, check.id)} style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 6, background: "#1e293b", color: copiedId === check.id ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  {copiedId === check.id ? "Copied!" : "Copy"}
                </button>
              </div>
              <div style={{ padding: "0 20px 10px", fontSize: 12, color: "#94a3b8" }}>{check.description}</div>
              <pre style={{ margin: 0, padding: "12px 20px", fontSize: 11, lineHeight: 1.5, color: "#a5b4fc", overflow: "auto", maxHeight: 300, fontFamily: "monospace", whiteSpace: "pre-wrap", borderTop: "1px solid #1e293b" }}>{check.code}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Error Handling Tab ───────────────────────────────────────────────────────

function ErrorsTab({ specs, onCopy, copiedId }: {
  specs: ErrorHandlingSpec[];
  onCopy: (code: string, id: string) => void;
  copiedId: string | null;
}) {
  const typeColors: Record<string, string> = {
    quarantine: "#ef4444", "dead-letter": "#f97316", retry: "#f59e0b", "log-and-skip": "#3b82f6",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 4 }}>
        {specs.map((s) => (
          <div key={`stat-${s.id}`} style={{ padding: 14, borderRadius: 10, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: typeColors[s.type] || "#818cf8" }}>{s.type}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{s.name}</div>
            {s.retrySafe && <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: "#10b98118", color: "#10b981", marginTop: 4, display: "inline-block" }}>Retry-Safe</span>}
          </div>
        ))}
      </div>

      {specs.map((spec) => (
        <div key={spec.id} style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #1e293b" }}>
            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${typeColors[spec.type] || "#818cf8"}18`, color: typeColors[spec.type] || "#818cf8", textTransform: "uppercase" }}>{spec.type}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{spec.name}</span>
            {spec.retrySafe && <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#10b98118", color: "#10b981" }}>Retry-Safe</span>}
            <button onClick={() => onCopy(spec.code, spec.id)} style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 6, background: "#1e293b", color: copiedId === spec.id ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              {copiedId === spec.id ? "Copied!" : "Copy"}
            </button>
          </div>
          <div style={{ padding: "8px 20px", fontSize: 12, color: "#94a3b8" }}>{spec.description}</div>
          <pre style={{ margin: 0, padding: "12px 20px", fontSize: 11, lineHeight: 1.5, color: "#a5b4fc", overflow: "auto", maxHeight: 400, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{spec.code}</pre>
        </div>
      ))}
    </div>
  );
}

// ── Performance Tab ──────────────────────────────────────────────────────────

function PerformanceTab({ recs, onCopy, copiedId }: {
  recs: PerformanceRec[];
  onCopy: (code: string, id: string) => void;
  copiedId: string | null;
}) {
  const impactColors: Record<string, string> = { high: "#10b981", medium: "#f59e0b", low: "#3b82f6" };
  const typeIcons: Record<string, string> = {
    "broadcast-join": "📡", partitioning: "📂", "z-order": "⚡", caching: "💾", coalesce: "🔗", "adaptive-query": "🧠",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {(["high", "medium", "low"] as const).map((impact) => (
          <div key={impact} style={{ padding: 14, borderRadius: 10, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: impactColors[impact] }}>{recs.filter((r) => r.estimatedImpact === impact).length}</div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "capitalize" }}>{impact} Impact</div>
          </div>
        ))}
      </div>

      {recs.map((rec) => (
        <div key={rec.id} style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #1e293b" }}>
            <span style={{ fontSize: 16 }}>{typeIcons[rec.type] || "⚙"}</span>
            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "#1e293b", color: "#94a3b8" }}>{rec.type}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{rec.title}</span>
            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${impactColors[rec.estimatedImpact]}18`, color: impactColors[rec.estimatedImpact], marginLeft: "auto" }}>Impact: {rec.estimatedImpact}</span>
            <button onClick={() => onCopy(rec.code, rec.id)} style={{ padding: "4px 12px", borderRadius: 6, background: "#1e293b", color: copiedId === rec.id ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              {copiedId === rec.id ? "Copied!" : "Copy"}
            </button>
          </div>
          <div style={{ padding: "8px 20px", fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{rec.description}</div>
          <pre style={{ margin: 0, padding: "12px 20px", fontSize: 11, lineHeight: 1.5, color: "#a5b4fc", overflow: "auto", maxHeight: 350, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{rec.code}</pre>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Cross-Layer DQ Tab
   ═════════════════════════════════════════════════════════════════════════════ */

function CrossLayerDQTab({ contracts, onCopy, copiedId }: { contracts: CrossLayerDQContract[]; onCopy: (code: string, id: string) => void; copiedId: string | null }) {
  const checkTypeColors: Record<string, string> = {
    reconciliation: "#3b82f6",
    "circuit-breaker": "#ef4444",
    handshake: "#10b981",
    "pre-gold-gate": "#f59e0b",
  };
  const checkTypeIcons: Record<string, string> = {
    reconciliation: "⇌",
    "circuit-breaker": "⚡",
    handshake: "🤝",
    "pre-gold-gate": "🚧",
  };
  const sevColors: Record<string, string> = { critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {(["reconciliation", "circuit-breaker", "handshake", "pre-gold-gate"] as const).map((ct) => (
          <div key={ct} style={{ padding: 14, borderRadius: 10, background: "#131620", border: `1px solid ${checkTypeColors[ct]}30`, textAlign: "center" }}>
            <div style={{ fontSize: 22 }}>{checkTypeIcons[ct]}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: checkTypeColors[ct] }}>{contracts.filter((c) => c.checkType === ct).length}</div>
            <div style={{ fontSize: 10, color: "#64748b", textTransform: "capitalize" }}>{ct.replace(/-/g, " ")}</div>
          </div>
        ))}
      </div>

      {contracts.map((c) => (
        <div key={c.id} style={{ borderRadius: 12, background: "#131620", border: `1px solid ${checkTypeColors[c.checkType] || "#1e293b"}30`, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #1e293b" }}>
            <span style={{ fontSize: 16 }}>{checkTypeIcons[c.checkType] || "◆"}</span>
            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${checkTypeColors[c.checkType]}18`, color: checkTypeColors[c.checkType] }}>{c.checkType}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{c.name}</span>
            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${sevColors[c.severity]}18`, color: sevColors[c.severity], marginLeft: "auto" }}>{c.severity}</span>
            {c.blockDownstream && (
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#ef444418", color: "#ef4444" }}>Blocks Downstream</span>
            )}
            <button onClick={() => onCopy(c.code, c.id)} style={{ padding: "4px 12px", borderRadius: 6, background: "#1e293b", color: copiedId === c.id ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              {copiedId === c.id ? "Copied!" : "Copy"}
            </button>
          </div>
          <div style={{ padding: "8px 20px", fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{c.description}</div>
          <pre style={{ margin: 0, padding: "12px 20px", fontSize: 11, lineHeight: 1.5, color: "#a5b4fc", overflow: "auto", maxHeight: 400, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{c.code}</pre>
        </div>
      ))}
    </div>
  );
}
