"use client";

import { useState, useMemo } from "react";
import {
  type TransformationPatternResult,
  type TransformationCategory,
  type DetectedTransformation,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  analyzeTransformationPatterns,
} from "@/lib/transformation-pattern-analyzer";

interface Props {
  open: boolean;
  onClose: () => void;
  sourceCode: string;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

type TabId = "summary" | "catalog" | "matrix" | "details";

export default function TransformationPatternPanel({ open, onClose, sourceCode, outputCode, direction }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [filterCat, setFilterCat] = useState<TransformationCategory | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const result = useMemo<TransformationPatternResult | null>(() => {
    if (!sourceCode.trim()) return null;
    return analyzeTransformationPatterns(sourceCode, outputCode, direction);
  }, [sourceCode, outputCode, direction]);

  if (!open) return null;

  const copyJson = (t: DetectedTransformation) => {
    const obj = {
      transformation_name: t.transformation_name,
      category: t.category,
      purpose: t.purpose,
      source_columns: t.source_columns,
      target_columns: t.target_columns,
      confidence: t.confidence,
    };
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const copyAll = () => {
    if (!result) return;
    const output = result.transformations.map((t) => ({
      transformation_name: t.transformation_name,
      category: t.category,
      purpose: t.purpose,
      source_columns: t.source_columns,
      target_columns: t.target_columns,
      confidence: t.confidence,
    }));
    navigator.clipboard.writeText(JSON.stringify(output, null, 2));
    setCopiedId("all");
    setTimeout(() => setCopiedId(null), 1500);
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "summary", label: "Summary" },
    { id: "catalog", label: "Pattern Catalog", count: result?.transformations.length },
    { id: "matrix", label: "Category Matrix" },
    { id: "details", label: "JSON Output" },
  ];

  const confidenceColor = (c: number) =>
    c >= 85 ? "#10b981" : c >= 70 ? "#f59e0b" : "#ef4444";

  const complexityColor = (c: string) =>
    c === "enterprise" ? "#ef4444" : c === "complex" ? "#f59e0b" : c === "moderate" ? "#3b82f6" : "#10b981";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "94vw", maxWidth: 1400, height: "90vh", background: "#0f1117", borderRadius: 16, border: "1px solid #1e293b", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "20px 28px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #06b6d4, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🔍</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Transformation Pattern Analyzer</h2>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                Source Glue analysis → Pattern classification → Structured metadata
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {result && (
              <>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${complexityColor(result.overallComplexity)}18`, color: complexityColor(result.overallComplexity), border: `1px solid ${complexityColor(result.overallComplexity)}40`, textTransform: "uppercase" }}>
                  {result.overallComplexity}
                </div>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, background: `${confidenceColor(result.summary.avgConfidence)}18`, color: confidenceColor(result.summary.avgConfidence), border: `1px solid ${confidenceColor(result.summary.avgConfidence)}40` }}>
                  Avg Confidence: {result.summary.avgConfidence}%
                </div>
                <button onClick={copyAll} style={{ padding: "6px 14px", borderRadius: 8, background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
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
                color: activeTab === t.id ? "#06b6d4" : "#64748b",
                border: "none",
                borderBottom: activeTab === t.id ? "2px solid #06b6d4" : "2px solid transparent",
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
                <span style={{ padding: "1px 7px", borderRadius: 10, background: activeTab === t.id ? "#06b6d418" : "#1e293b", fontSize: 11 }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
          {!result ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: 60, fontSize: 14 }}>
              Paste source Glue/ETL code to analyze transformation patterns
            </div>
          ) : activeTab === "summary" ? (
            <SummaryTab result={result} />
          ) : activeTab === "catalog" ? (
            <CatalogTab
              transformations={result.transformations}
              filterCat={filterCat}
              onFilter={setFilterCat}
              expandedId={expandedId}
              onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
              copiedId={copiedId}
              onCopy={copyJson}
            />
          ) : activeTab === "matrix" ? (
            <MatrixTab result={result} />
          ) : (
            <JsonOutputTab transformations={result.transformations} copiedId={copiedId} onCopyAll={copyAll} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUMMARY TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function SummaryTab({ result }: { result: TransformationPatternResult }) {
  const maxCount = Math.max(...Object.values(result.categoryBreakdown), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {[
          { label: "Patterns Detected", value: result.summary.totalDetected, color: "#3b82f6" },
          { label: "High Confidence", value: result.summary.highConfidenceCount, color: "#10b981" },
          { label: "Categories Found", value: result.summary.categoriesFound, color: "#8b5cf6" },
          { label: "Avg Confidence", value: `${result.summary.avgConfidence}%`, color: "#f59e0b" },
          { label: "Complexity", value: result.overallComplexity, color: result.overallComplexity === "enterprise" ? "#ef4444" : "#06b6d4" },
        ].map((s, i) => (
          <div key={i} style={{ padding: 16, borderRadius: 12, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Category breakdown bars */}
      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Category Distribution</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(Object.entries(result.categoryBreakdown) as [TransformationCategory, number][])
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{CATEGORY_ICONS[cat]}</span>
                <span style={{ width: 180, fontSize: 12, fontWeight: 600, color: count > 0 ? CATEGORY_COLORS[cat] : "#475569" }}>
                  {CATEGORY_LABELS[cat]}
                </span>
                <div style={{ flex: 1, height: 20, background: "#1e293b", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{
                    width: `${(count / maxCount) * 100}%`,
                    height: "100%",
                    background: count > 0 ? `${CATEGORY_COLORS[cat]}` : "transparent",
                    borderRadius: 6,
                    transition: "width 0.4s ease",
                    opacity: 0.7,
                  }} />
                </div>
                <span style={{ width: 28, fontSize: 13, fontWeight: 700, color: count > 0 ? "#f1f5f9" : "#475569", textAlign: "right" }}>
                  {count}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Dominant category highlight */}
      <div style={{ borderRadius: 12, background: "#131620", border: `1px solid ${CATEGORY_COLORS[result.summary.dominantCategory]}30`, padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: `${CATEGORY_COLORS[result.summary.dominantCategory]}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
          {CATEGORY_ICONS[result.summary.dominantCategory]}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Dominant Pattern</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: CATEGORY_COLORS[result.summary.dominantCategory] }}>
            {CATEGORY_LABELS[result.summary.dominantCategory]}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            {result.categoryBreakdown[result.summary.dominantCategory]} pattern(s) detected in this category
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
   CATALOG TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function CatalogTab({
  transformations,
  filterCat,
  onFilter,
  expandedId,
  onToggle,
  copiedId,
  onCopy,
}: {
  transformations: DetectedTransformation[];
  filterCat: TransformationCategory | "all";
  onFilter: (c: TransformationCategory | "all") => void;
  expandedId: string | null;
  onToggle: (id: string) => void;
  copiedId: string | null;
  onCopy: (t: DetectedTransformation) => void;
}) {
  const filtered = filterCat === "all" ? transformations : transformations.filter((t) => t.category === filterCat);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Filter chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button
          onClick={() => onFilter("all")}
          style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
            background: filterCat === "all" ? "#06b6d418" : "#1e293b",
            color: filterCat === "all" ? "#06b6d4" : "#64748b",
          }}
        >All ({transformations.length})</button>
        {(Object.keys(CATEGORY_LABELS) as TransformationCategory[]).map((cat) => {
          const count = transformations.filter((t) => t.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => onFilter(cat)}
              style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
                background: filterCat === cat ? `${CATEGORY_COLORS[cat]}18` : "#1e293b",
                color: filterCat === cat ? CATEGORY_COLORS[cat] : "#64748b",
              }}
            >{CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]} ({count})</button>
          );
        })}
      </div>

      {/* Cards */}
      {filtered.map((t) => {
        const isExpanded = expandedId === t.id;
        return (
          <div key={t.id} style={{ borderRadius: 12, background: "#131620", border: `1px solid ${CATEGORY_COLORS[t.category]}25`, overflow: "hidden" }}>
            <div
              onClick={() => onToggle(t.id)}
              style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: isExpanded ? "1px solid #1e293b" : "none" }}
            >
              <span style={{ fontSize: 16 }}>{CATEGORY_ICONS[t.category]}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${CATEGORY_COLORS[t.category]}18`, color: CATEGORY_COLORS[t.category] }}>
                {CATEGORY_LABELS[t.category]}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", flex: 1 }}>{t.transformation_name}</span>
              <div style={{ width: 50, height: 6, borderRadius: 3, background: "#1e293b", overflow: "hidden" }}>
                <div style={{ width: `${t.confidence}%`, height: "100%", background: confidenceBarColor(t.confidence), borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: confidenceBarColor(t.confidence), width: 36, textAlign: "right" }}>{t.confidence}%</span>
              <button
                onClick={(e) => { e.stopPropagation(); onCopy(t); }}
                style={{ padding: "3px 10px", borderRadius: 6, background: "#1e293b", color: copiedId === t.id ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
              >{copiedId === t.id ? "Copied!" : "JSON"}</button>
              <span style={{ fontSize: 12, color: "#475569", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
            </div>

            {isExpanded && (
              <div style={{ padding: "12px 20px 16px" }}>
                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, marginBottom: 12 }}>{t.purpose}</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Source Columns</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {t.source_columns.length > 0 ? t.source_columns.map((c, i) => (
                        <span key={i} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "#1e293b", color: "#60a5fa", fontFamily: "monospace" }}>{c}</span>
                      )) : <span style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>Inferred from context</span>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Target Columns</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {t.target_columns.length > 0 ? t.target_columns.map((c, i) => (
                        <span key={i} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "#1e293b", color: "#10b981", fontFamily: "monospace" }}>{c}</span>
                      )) : <span style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>Same as source / derived</span>}
                    </div>
                  </div>
                </div>

                {t.source_snippet && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Source Snippet</div>
                    <pre style={{ margin: 0, padding: "8px 12px", borderRadius: 8, background: "#0a0d14", fontSize: 11, color: "#a5b4fc", fontFamily: "monospace", whiteSpace: "pre-wrap", overflow: "auto" }}>
                      {t.source_snippet}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontSize: 13 }}>No patterns found for this category</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MATRIX TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function MatrixTab({ result }: { result: TransformationPatternResult }) {
  const categories = Object.keys(CATEGORY_LABELS) as TransformationCategory[];
  const confidenceBuckets = ["90-100", "80-89", "70-79", "60-69", "<60"];

  const getCount = (cat: TransformationCategory, bucket: string) => {
    return result.transformations.filter((t) => {
      if (t.category !== cat) return false;
      const c = t.confidence;
      switch (bucket) {
        case "90-100": return c >= 90;
        case "80-89": return c >= 80 && c < 90;
        case "70-79": return c >= 70 && c < 80;
        case "60-69": return c >= 60 && c < 70;
        case "<60": return c < 60;
        default: return false;
      }
    }).length;
  };

  return (
    <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1e293b" }}>
            <th style={{ padding: "12px 16px", textAlign: "left", color: "#64748b", fontWeight: 700, fontSize: 11, minWidth: 200 }}>Category</th>
            <th style={{ padding: "12px 16px", textAlign: "center", color: "#64748b", fontWeight: 700, fontSize: 11 }}>Total</th>
            {confidenceBuckets.map((b) => (
              <th key={b} style={{ padding: "12px 16px", textAlign: "center", color: "#64748b", fontWeight: 700, fontSize: 11 }}>{b}%</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => {
            const total = result.categoryBreakdown[cat];
            return (
              <tr key={cat} style={{ borderBottom: "1px solid #1e293b10" }}>
                <td style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{CATEGORY_ICONS[cat]}</span>
                  <span style={{ fontWeight: 600, color: total > 0 ? CATEGORY_COLORS[cat] : "#475569" }}>{CATEGORY_LABELS[cat]}</span>
                </td>
                <td style={{ padding: "10px 16px", textAlign: "center", fontWeight: 800, color: total > 0 ? "#f1f5f9" : "#475569" }}>{total}</td>
                {confidenceBuckets.map((b) => {
                  const count = getCount(cat, b);
                  return (
                    <td key={b} style={{ padding: "10px 16px", textAlign: "center" }}>
                      {count > 0 ? (
                        <span style={{
                          display: "inline-block", width: 28, height: 28, lineHeight: "28px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                          background: `${CATEGORY_COLORS[cat]}18`, color: CATEGORY_COLORS[cat],
                        }}>{count}</span>
                      ) : (
                        <span style={{ color: "#27303d" }}>-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   JSON OUTPUT TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function JsonOutputTab({
  transformations,
  copiedId,
  onCopyAll,
}: { transformations: DetectedTransformation[]; copiedId: string | null; onCopyAll: () => void }) {
  const output = transformations.map((t) => ({
    transformation_name: t.transformation_name,
    category: t.category,
    purpose: t.purpose,
    source_columns: t.source_columns,
    target_columns: t.target_columns,
    confidence: t.confidence,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>
          {transformations.length} transformation pattern(s) — structured metadata only, no generated code
        </div>
        <button onClick={onCopyAll} style={{ padding: "6px 16px", borderRadius: 8, background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
          {copiedId === "all" ? "Copied!" : "Copy All JSON"}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: 20, borderRadius: 12, background: "#0a0d14", border: "1px solid #1e293b",
        fontSize: 12, lineHeight: 1.6, color: "#a5b4fc", fontFamily: "monospace", whiteSpace: "pre-wrap", overflow: "auto", maxHeight: "65vh",
      }}>
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  );
}

function confidenceBarColor(c: number): string {
  return c >= 85 ? "#10b981" : c >= 70 ? "#f59e0b" : "#ef4444";
}
