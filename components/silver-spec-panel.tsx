"use client";

import { useState, useMemo } from "react";
import {
  type SilverSpecResult,
  type SilverStage,
  type SilverSpecEntry,
  STAGE_LABELS,
  STAGE_COLORS,
  STAGE_ICONS,
  analyzeSilverSpec,
} from "@/lib/silver-spec-analyzer";

interface Props {
  open: boolean;
  onClose: () => void;
  sourceCode: string;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
}

type TabId = "summary" | "specs" | "pipeline" | "json";

export default function SilverSpecPanel({ open, onClose, sourceCode, outputCode, direction }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [filterStage, setFilterStage] = useState<SilverStage | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const result = useMemo<SilverSpecResult | null>(() => {
    if (!sourceCode.trim()) return null;
    return analyzeSilverSpec(sourceCode, outputCode, direction);
  }, [sourceCode, outputCode, direction]);

  if (!open) return null;

  const copyJson = (entry: SilverSpecEntry) => {
    const obj = {
      silver_stage: entry.silver_stage,
      operation: entry.operation,
      implementation_pattern: entry.implementation_pattern,
      confidence: entry.confidence,
    };
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const copyAll = () => {
    if (!result) return;
    const output = result.specs.map((s) => ({
      silver_stage: s.silver_stage,
      operation: s.operation,
      implementation_pattern: s.implementation_pattern,
      confidence: s.confidence,
    }));
    navigator.clipboard.writeText(JSON.stringify(output, null, 2));
    setCopiedId("all");
    setTimeout(() => setCopiedId(null), 1500);
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "summary", label: "Summary" },
    { id: "specs", label: "Silver Specs", count: result?.specs.length },
    { id: "pipeline", label: "Execution Pipeline" },
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
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>◇</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Silver Layer Specification</h2>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                Transformation metadata → Silver stage classification → Implementation patterns
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {result && (
              <>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "#8b5cf618", color: "#8b5cf6", border: "1px solid #8b5cf640" }}>
                  {result.summary.stagesUsed}/7 Stages
                </div>
                <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, background: "#10b98118", color: "#10b981", border: "1px solid #10b98140" }}>
                  {result.summary.highConfidenceCount} High Confidence
                </div>
                <button onClick={copyAll} style={{ padding: "6px 14px", borderRadius: 8, background: "#8b5cf6", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
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
                color: activeTab === t.id ? "#8b5cf6" : "#64748b",
                border: "none",
                borderBottom: activeTab === t.id ? "2px solid #8b5cf6" : "2px solid transparent",
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
                <span style={{ padding: "1px 7px", borderRadius: 10, background: activeTab === t.id ? "#8b5cf618" : "#1e293b", fontSize: 11 }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
          {!result ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: 60, fontSize: 14 }}>
              Paste source Glue/ETL code to generate Silver layer specifications
            </div>
          ) : activeTab === "summary" ? (
            <SummaryTab result={result} />
          ) : activeTab === "specs" ? (
            <SpecsTab
              specs={result.specs}
              filterStage={filterStage}
              onFilter={setFilterStage}
              expandedId={expandedId}
              onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
              copiedId={copiedId}
              onCopy={copyJson}
              confColor={confColor}
            />
          ) : activeTab === "pipeline" ? (
            <PipelineTab result={result} />
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

function SummaryTab({ result }: { result: SilverSpecResult }) {
  const maxCount = Math.max(...Object.values(result.stageBreakdown), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {[
          { label: "Total Specs", value: result.summary.totalSpecs, color: "#8b5cf6" },
          { label: "Stages Used", value: `${result.summary.stagesUsed}/7`, color: "#3b82f6" },
          { label: "High Confidence", value: result.summary.highConfidenceCount, color: "#10b981" },
          { label: "Avg Confidence", value: `${result.summary.avgConfidence}%`, color: "#f59e0b" },
          { label: "Pipeline Steps", value: result.pipelineStages.length, color: "#06b6d4" },
        ].map((s, i) => (
          <div key={i} style={{ padding: 16, borderRadius: 12, background: "#131620", border: "1px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Stage breakdown */}
      <div style={{ borderRadius: 12, background: "#131620", border: "1px solid #1e293b", padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Silver Stage Distribution</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(Object.entries(result.stageBreakdown) as [SilverStage, number][]).map(([stage, count]) => (
            <div key={stage} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{STAGE_ICONS[stage]}</span>
              <span style={{ width: 180, fontSize: 12, fontWeight: 600, color: count > 0 ? STAGE_COLORS[stage] : "#475569" }}>
                {STAGE_LABELS[stage]}
              </span>
              <div style={{ flex: 1, height: 22, background: "#1e293b", borderRadius: 6, overflow: "hidden" }}>
                <div style={{
                  width: `${(count / maxCount) * 100}%`,
                  height: "100%",
                  background: count > 0 ? STAGE_COLORS[stage] : "transparent",
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

      {/* Dominant stage */}
      <div style={{ borderRadius: 12, background: "#131620", border: `1px solid ${STAGE_COLORS[result.summary.dominantStage]}30`, padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: `${STAGE_COLORS[result.summary.dominantStage]}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
          {STAGE_ICONS[result.summary.dominantStage]}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Dominant Stage</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: STAGE_COLORS[result.summary.dominantStage] }}>
            {STAGE_LABELS[result.summary.dominantStage]}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            {result.stageBreakdown[result.summary.dominantStage]} specification(s) mapped to this stage
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
   SPECS TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function SpecsTab({
  specs,
  filterStage,
  onFilter,
  expandedId,
  onToggle,
  copiedId,
  onCopy,
  confColor,
}: {
  specs: SilverSpecEntry[];
  filterStage: SilverStage | "all";
  onFilter: (s: SilverStage | "all") => void;
  expandedId: string | null;
  onToggle: (id: string) => void;
  copiedId: string | null;
  onCopy: (s: SilverSpecEntry) => void;
  confColor: (c: string) => string;
}) {
  const filtered = filterStage === "all" ? specs : specs.filter((s) => s.silver_stage === filterStage);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Filter chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button
          onClick={() => onFilter("all")}
          style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
            background: filterStage === "all" ? "#8b5cf618" : "#1e293b",
            color: filterStage === "all" ? "#8b5cf6" : "#64748b",
          }}
        >All ({specs.length})</button>
        {(Object.keys(STAGE_LABELS) as SilverStage[]).map((stage) => {
          const count = specs.filter((s) => s.silver_stage === stage).length;
          if (count === 0) return null;
          return (
            <button
              key={stage}
              onClick={() => onFilter(stage)}
              style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
                background: filterStage === stage ? `${STAGE_COLORS[stage]}18` : "#1e293b",
                color: filterStage === stage ? STAGE_COLORS[stage] : "#64748b",
              }}
            >{STAGE_ICONS[stage]} {STAGE_LABELS[stage]} ({count})</button>
          );
        })}
      </div>

      {/* Spec cards */}
      {filtered.map((s) => {
        const isExpanded = expandedId === s.id;
        const isSynthetic = s.source_transformation_id === "synthetic";
        return (
          <div key={s.id} style={{ borderRadius: 12, background: "#131620", border: `1px solid ${STAGE_COLORS[s.silver_stage]}25`, overflow: "hidden" }}>
            <div
              onClick={() => onToggle(s.id)}
              style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: isExpanded ? "1px solid #1e293b" : "none" }}
            >
              <span style={{ fontSize: 16 }}>{STAGE_ICONS[s.silver_stage]}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${STAGE_COLORS[s.silver_stage]}18`, color: STAGE_COLORS[s.silver_stage] }}>
                {STAGE_LABELS[s.silver_stage]}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", flex: 1 }}>{s.operation}</span>
              {isSynthetic && (
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: "#06b6d418", color: "#06b6d4", textTransform: "uppercase", letterSpacing: 0.5 }}>Auto-Generated</span>
              )}
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${confColor(s.confidence)}18`, color: confColor(s.confidence) }}>
                {s.confidence}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onCopy(s); }}
                style={{ padding: "3px 10px", borderRadius: 6, background: "#1e293b", color: copiedId === s.id ? "#10b981" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
              >{copiedId === s.id ? "Copied!" : "JSON"}</button>
              <span style={{ fontSize: 12, color: "#475569", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
            </div>

            {isExpanded && (
              <div style={{ padding: "12px 20px 16px" }}>
                {/* Implementation pattern */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Implementation Pattern</div>
                  <div style={{ padding: "10px 14px", borderRadius: 8, background: "#0a0d14", border: "1px solid #1e293b", fontSize: 12, color: "#a5b4fc", lineHeight: 1.7 }}>
                    {s.implementation_pattern}
                  </div>
                </div>

                {/* Columns */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Source Columns</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {s.source_columns.length > 0 ? s.source_columns.map((c, i) => (
                        <span key={i} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "#1e293b", color: "#60a5fa", fontFamily: "monospace" }}>{c}</span>
                      )) : <span style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>Inferred from context</span>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Target Columns</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {s.target_columns.length > 0 ? s.target_columns.map((c, i) => (
                        <span key={i} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "#1e293b", color: "#10b981", fontFamily: "monospace" }}>{c}</span>
                      )) : <span style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>Same as source / derived</span>}
                    </div>
                  </div>
                </div>

                {/* Metadata row */}
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#64748b" }}>
                  <span>Source category: <span style={{ color: "#94a3b8", fontWeight: 600 }}>{s.source_category}</span></span>
                  <span>Source ID: <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>{s.source_transformation_id}</span></span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontSize: 13 }}>No specs found for this stage</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PIPELINE TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function PipelineTab({ result }: { result: SilverSpecResult }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {result.pipelineStages.map((ps, idx) => (
        <div key={ps.stage}>
          {/* Connector */}
          {idx > 0 && (
            <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
              <div style={{ width: 2, height: 28, background: "linear-gradient(180deg, #1e293b, #8b5cf640, #1e293b)" }} />
            </div>
          )}

          {/* Stage card */}
          <div style={{ borderRadius: 14, background: "#131620", border: `1px solid ${STAGE_COLORS[ps.stage]}30`, padding: 20, position: "relative" }}>
            {/* Step number badge */}
            <div style={{
              position: "absolute", top: -10, left: 20,
              width: 24, height: 24, borderRadius: 12,
              background: STAGE_COLORS[ps.stage], color: "#fff",
              fontSize: 12, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{ps.order}</div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginTop: 4 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: `${STAGE_COLORS[ps.stage]}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
                {STAGE_ICONS[ps.stage]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: STAGE_COLORS[ps.stage] }}>{STAGE_LABELS[ps.stage]}</span>
                  <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "#1e293b", color: "#94a3b8" }}>
                    {ps.specCount} spec{ps.specCount !== 1 ? "s" : ""}
                  </span>
                  {ps.dependency && (
                    <span style={{ fontSize: 10, color: "#475569" }}>
                      depends on: <span style={{ color: STAGE_COLORS[ps.dependency] }}>{STAGE_LABELS[ps.dependency]}</span>
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ps.operations.map((op, i) => (
                    <span key={i} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${STAGE_COLORS[ps.stage]}10`, color: `${STAGE_COLORS[ps.stage]}cc`, border: `1px solid ${STAGE_COLORS[ps.stage]}20` }}>
                      {op}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      {result.pipelineStages.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#64748b", fontSize: 14 }}>No pipeline stages generated — paste source code to analyze</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   JSON OUTPUT TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function JsonOutputTab({ specs, copiedId, onCopyAll }: { specs: SilverSpecEntry[]; copiedId: string | null; onCopyAll: () => void }) {
  const output = specs.map((s) => ({
    silver_stage: s.silver_stage,
    operation: s.operation,
    implementation_pattern: s.implementation_pattern,
    confidence: s.confidence,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>
          {specs.length} Silver layer specification(s) — metadata only, no generated code
        </div>
        <button onClick={onCopyAll} style={{ padding: "6px 16px", borderRadius: 8, background: "#8b5cf6", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
          {copiedId === "all" ? "Copied!" : "Copy All JSON"}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: 20, borderRadius: 12, background: "#0a0d14", border: "1px solid #1e293b",
        fontSize: 12, lineHeight: 1.6, color: "#c4b5fd", fontFamily: "monospace", whiteSpace: "pre-wrap", overflow: "auto", maxHeight: "65vh",
      }}>
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  );
}
