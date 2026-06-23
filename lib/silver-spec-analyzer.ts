import {
  type DetectedTransformation,
  type TransformationCategory,
  analyzeTransformationPatterns,
} from "./transformation-pattern-analyzer";

// ── Silver stage types ──────────────────────────────────────────────────────

export type SilverStage =
  | "schema-validation"
  | "standardization"
  | "deduplication"
  | "data-quality"
  | "lookup-enrichment"
  | "audit-logging"
  | "incremental-processing";

export interface SilverSpecEntry {
  id: string;
  silver_stage: SilverStage;
  operation: string;
  implementation_pattern: string;
  confidence: string;
  source_transformation_id: string;
  source_category: TransformationCategory;
  source_columns: string[];
  target_columns: string[];
}

export interface SilverSpecResult {
  specs: SilverSpecEntry[];
  stageBreakdown: Record<SilverStage, number>;
  summary: SilverSpecSummary;
  executionOrder: SilverStage[];
  pipelineStages: PipelineStage[];
}

export interface SilverSpecSummary {
  totalSpecs: number;
  stagesUsed: number;
  highConfidenceCount: number;
  avgConfidence: number;
  dominantStage: SilverStage;
  warnings: string[];
  unmappedTransformations: number;
}

export interface PipelineStage {
  order: number;
  stage: SilverStage;
  specCount: number;
  operations: string[];
  dependency: SilverStage | null;
}

export const STAGE_LABELS: Record<SilverStage, string> = {
  "schema-validation": "Schema Validation",
  "standardization": "Standardization",
  "deduplication": "Deduplication",
  "data-quality": "Data Quality",
  "lookup-enrichment": "Lookup Enrichment",
  "audit-logging": "Audit Logging",
  "incremental-processing": "Incremental Processing",
};

export const STAGE_COLORS: Record<SilverStage, string> = {
  "schema-validation": "#3b82f6",
  "standardization": "#10b981",
  "deduplication": "#8b5cf6",
  "data-quality": "#ef4444",
  "lookup-enrichment": "#f59e0b",
  "audit-logging": "#06b6d4",
  "incremental-processing": "#ec4899",
};

export const STAGE_ICONS: Record<SilverStage, string> = {
  "schema-validation": "🔍",
  "standardization": "⊞",
  "deduplication": "⊘",
  "data-quality": "✓",
  "lookup-enrichment": "⋈",
  "audit-logging": "📋",
  "incremental-processing": "⟳",
};

const EXECUTION_ORDER: SilverStage[] = [
  "schema-validation",
  "standardization",
  "deduplication",
  "data-quality",
  "lookup-enrichment",
  "audit-logging",
  "incremental-processing",
];

// ── Category → Silver stage mapping ─────────────────────────────────────────

const CATEGORY_TO_STAGE: Record<TransformationCategory, SilverStage> = {
  "schema-standardization": "schema-validation",
  "type-conversion": "standardization",
  "data-cleansing": "standardization",
  "deduplication": "deduplication",
  "data-validation": "data-quality",
  "data-enrichment": "lookup-enrichment",
  "lookup-joins": "lookup-enrichment",
  "aggregations": "incremental-processing",
  "kpi-calculations": "incremental-processing",
  "business-rules": "data-quality",
  "reporting-logic": "incremental-processing",
};

// ── Implementation pattern mapping ──────────────────────────────────────────

function resolveImplementationPattern(t: DetectedTransformation, stage: SilverStage): string {
  const name = t.transformation_name.toLowerCase();
  const cat = t.category;

  // Schema Validation patterns
  if (stage === "schema-validation") {
    if (/struct|schema\s+def/i.test(name)) return "StructType enforcement with schema-on-read validation — reject rows that fail schema cast";
    if (/rename|alias/i.test(name)) return "Column rename map applied via .withColumnRenamed() chain — enforced at DataFrame creation";
    if (/select|project/i.test(name)) return "Explicit column projection via .select() — drops undeclared columns before downstream processing";
    if (/drop/i.test(name)) return "Column exclusion via .drop() — removes PII or staging-only fields from Silver output";
    if (/flatten|nested/i.test(name)) return "Nested struct/array flattening with explode() + getField() — normalizes hierarchical Bronze data";
    return "Schema enforcement via StructType validation — non-conforming rows quarantined to error table";
  }

  // Standardization patterns
  if (stage === "standardization") {
    if (/cast/i.test(name)) return "Type casting via .cast() with try_cast fallback — failed casts logged to _silver_quarantine";
    if (/timestamp|date/i.test(name)) return "Timestamp normalization via to_timestamp() with configurable format — timezone standardized to UTC";
    if (/boolean/i.test(name)) return "Boolean flag derivation via when().otherwise() — maps categorical values to true/false flags";
    if (/null/i.test(name)) return "Null imputation via coalesce() / fillna() with domain-specific defaults — null rate logged to audit";
    if (/trim|whitespace/i.test(name)) return "Whitespace normalization via trim() + regexp_replace() — applied to all STRING columns";
    if (/case\s*normal/i.test(name)) return "Case standardization via lower()/upper() — ensures consistent matching across joins";
    if (/regex|pattern.*cleans/i.test(name)) return "Pattern-based cleansing via regexp_replace() — strips invalid characters per column spec";
    if (/invalid|filter/i.test(name)) return "Invalid record quarantine via .filter() predicate — rejected rows written to _silver_quarantine with reason";
    return "Data standardization via column-level transformation — ensures uniform format across Silver tables";
  }

  // Deduplication patterns
  if (stage === "deduplication") {
    if (/window|row_number/i.test(name)) return "Window-based dedup via ROW_NUMBER() OVER (PARTITION BY key ORDER BY ts DESC) WHERE rn=1 — keeps latest per key";
    if (/first.*value|last.*value/i.test(name)) return "Group-level dedup via first()/last() aggregation — collapses duplicate keys to single record";
    if (/dropdup|distinct/i.test(name)) return "Exact-match dedup via .dropDuplicates(keys) — removes byte-identical rows on composite key";
    return "Key-based deduplication with configurable strategy (latest-wins / first-wins / merge)";
  }

  // Data Quality patterns
  if (stage === "data-quality") {
    if (/null\s*constraint/i.test(name)) return "NOT NULL enforcement via .isNotNull() filter — violations counted and logged to _dq_metrics";
    if (/range|boundary/i.test(name)) return "Range validation via BETWEEN / comparison operators — out-of-range values flagged with severity level";
    if (/pattern|format|regex/i.test(name)) return "Format validation via rlike() regex — validates email, phone, postal code patterns per column spec";
    if (/referential/i.test(name)) return "Referential integrity via anti-join against lookup tables — orphan records quarantined";
    if (/hard.*gate|assert/i.test(name)) return "Pipeline circuit-breaker via assert / raise — halts execution if critical DQ threshold breached";
    if (/multi.*branch|business/i.test(cat)) return "Business rule validation via multi-condition CASE chain — flags rule violations per row";
    if (/status|categor|tier/i.test(name)) return "Value domain validation — ensures status/category values match allowed set from reference table";
    if (/threshold|cap/i.test(name)) return "Threshold enforcement — applies business-defined caps/floors with violation logging";
    if (/compliance|sla/i.test(name)) return "Compliance rule check — validates regulatory constraints (GDPR/PCI/HIPAA) with audit trail";
    return "Data quality check with configurable severity (info / warning / critical) and quarantine routing";
  }

  // Lookup Enrichment patterns
  if (stage === "lookup-enrichment") {
    if (/broadcast/i.test(name)) return "Broadcast hash join for small lookup tables (<100MB) — avoids shuffle, enriches in-memory";
    if (/map.*side|dictionary/i.test(name)) return "Map-side lookup via collectAsMap() broadcast variable — zero-shuffle enrichment for static references";
    if (/join.*(\w+)/i.test(name)) return "Shuffle join against reference/dimension table — enriches Silver records with lookup attributes";
    if (/derived|withcolumn/i.test(name)) return "Computed column enrichment via withColumn() — derives new attributes from existing Silver fields";
    if (/case.*when|conditional/i.test(name)) return "Conditional enrichment via CASE/WHEN — maps source values to enriched categories/buckets";
    if (/udf/i.test(name)) return "UDF-based enrichment — applies custom Python/Scala function for domain-specific derivation";
    if (/temporal|year|month/i.test(name)) return "Temporal feature extraction — derives year/month/day/hour/quarter from timestamp for time-series analysis";
    if (/concat/i.test(name)) return "Composite key construction via concat_ws() — builds surrogate/business keys from multiple source columns";
    return "Lookup enrichment via join or derived computation — adds reference attributes to Silver records";
  }

  // Audit Logging patterns
  if (stage === "audit-logging") {
    return "Audit trail insertion — records row-level lineage with source_file, ingest_timestamp, processing_run_id, dq_score";
  }

  // Incremental Processing patterns
  if (stage === "incremental-processing") {
    if (/group.*by|aggregat/i.test(name)) return "Incremental aggregation via MERGE INTO — re-computes affected partitions only using watermark column";
    if (/sum|avg|count|max|min/i.test(name)) return "Aggregate function recomputation — SUM/AVG/COUNT applied incrementally on new micro-batch data";
    if (/rollup|cube|grouping/i.test(name)) return "Multi-level rollup via Delta MERGE — maintains hierarchy aggregates with incremental refresh";
    if (/window.*function|over.*partition/i.test(name)) return "Window function recomputation — recalculates running totals/ranks on affected partitions only";
    if (/financial|revenue|kpi/i.test(name)) return "KPI pre-aggregation at Silver level — partial aggregates stored for fast Gold layer rollup";
    if (/percentile|p95|p99/i.test(name)) return "Percentile pre-computation via PERCENTILE_APPROX — stores t-digest sketches for downstream KPI assembly";
    if (/rate|ratio|growth/i.test(name)) return "Rate metric pre-computation — calculates numerator/denominator separately for accurate incremental rollup";
    if (/period.*over|lag|lead/i.test(name)) return "Lag/lead pre-computation — stores prior-period values at Silver grain for Gold period-over-period KPIs";
    if (/view|materialized/i.test(name)) return "View registration via CREATE OR REPLACE VIEW — publishes Silver output for downstream consumers";
    if (/pivot/i.test(name)) return "Pivot pre-computation — stores long-format data at Silver; pivot applied at Gold for reporting flexibility";
    if (/output.*sink|write|save/i.test(name)) return "Delta table write via .write.format('delta').mode('merge') — append or upsert to Silver target";
    if (/partition/i.test(name)) return "Partition-aligned write via .partitionBy() — ensures partition pruning efficiency for downstream queries";
    if (/optimize|zorder/i.test(name)) return "Post-write OPTIMIZE + ZORDER — compacts small files and clusters by query-hot columns";
    if (/dashboard|bi|power_?bi/i.test(name)) return "BI-optimized output staging — structures Silver output for efficient DirectQuery/Import by BI tools";
    return "Incremental processing via Delta Lake MERGE with watermark-based change detection";
  }

  return "Standard Silver layer transformation — applied in pipeline execution order";
}

// ── Confidence mapping ──────────────────────────────────────────────────────

function mapConfidence(sourceConfidence: number, stage: SilverStage, cat: TransformationCategory): string {
  const directMap = CATEGORY_TO_STAGE[cat] === stage;
  const boost = directMap ? 0 : -8;
  const adjusted = Math.min(100, Math.max(40, sourceConfidence + boost));

  if (adjusted >= 90) return "high";
  if (adjusted >= 75) return "medium-high";
  if (adjusted >= 60) return "medium";
  return "low";
}

// ── Synthetic audit/incremental specs ───────────────────────────────────────

function generateSyntheticSpecs(
  existingSpecs: SilverSpecEntry[],
  hasDedup: boolean,
  hasDQ: boolean,
  nextId: { value: number }
): SilverSpecEntry[] {
  const synthetic: SilverSpecEntry[] = [];

  const hasAudit = existingSpecs.some((s) => s.silver_stage === "audit-logging");
  if (!hasAudit) {
    synthetic.push({
      id: `ss-${nextId.value++}`,
      silver_stage: "audit-logging",
      operation: "Row-Level Audit Trail",
      implementation_pattern: "Inject _audit_timestamp, _source_file, _processing_run_id, _dq_pass columns on every Silver write — enables full lineage traceability",
      confidence: "high",
      source_transformation_id: "synthetic",
      source_category: "reporting-logic",
      source_columns: [],
      target_columns: ["_audit_timestamp", "_source_file", "_processing_run_id", "_dq_pass"],
    });

    synthetic.push({
      id: `ss-${nextId.value++}`,
      silver_stage: "audit-logging",
      operation: "DQ Metrics Logging",
      implementation_pattern: "Write per-batch data quality metrics (null_count, duplicate_count, validation_failures, quarantine_count) to _silver_dq_metrics table for monitoring",
      confidence: "high",
      source_transformation_id: "synthetic",
      source_category: "data-validation",
      source_columns: [],
      target_columns: ["batch_id", "null_count", "dup_count", "validation_failures", "quarantine_count", "processed_at"],
    });

    synthetic.push({
      id: `ss-${nextId.value++}`,
      silver_stage: "audit-logging",
      operation: "Schema Change Detection Log",
      implementation_pattern: "Compare incoming Bronze schema against registered Silver schema — log additions/removals/type-changes to _silver_schema_drift table",
      confidence: "medium-high",
      source_transformation_id: "synthetic",
      source_category: "schema-standardization",
      source_columns: [],
      target_columns: ["table_name", "column_name", "change_type", "old_type", "new_type", "detected_at"],
    });
  }

  const hasIncremental = existingSpecs.some((s) => s.silver_stage === "incremental-processing");
  if (!hasIncremental) {
    synthetic.push({
      id: `ss-${nextId.value++}`,
      silver_stage: "incremental-processing",
      operation: "Delta MERGE Upsert",
      implementation_pattern: "MERGE INTO silver_target USING bronze_batch ON key_match WHEN MATCHED THEN UPDATE WHEN NOT MATCHED THEN INSERT — processes only new/changed rows",
      confidence: "high",
      source_transformation_id: "synthetic",
      source_category: "reporting-logic",
      source_columns: [],
      target_columns: [],
    });

    synthetic.push({
      id: `ss-${nextId.value++}`,
      silver_stage: "incremental-processing",
      operation: "Watermark-Based Change Detection",
      implementation_pattern: "Track high-watermark (_max_processed_timestamp) per source table — SELECT only WHERE modified_at > watermark for incremental extraction",
      confidence: "high",
      source_transformation_id: "synthetic",
      source_category: "reporting-logic",
      source_columns: ["modified_at"],
      target_columns: ["_watermark_value", "_batch_id"],
    });
  }

  if (!hasDedup) {
    synthetic.push({
      id: `ss-${nextId.value++}`,
      silver_stage: "deduplication",
      operation: "Implicit Dedup via MERGE Key",
      implementation_pattern: "Delta MERGE ON clause serves as implicit dedup — last-write-wins for matching keys eliminates duplicates during upsert",
      confidence: "medium",
      source_transformation_id: "synthetic",
      source_category: "deduplication",
      source_columns: [],
      target_columns: [],
    });
  }

  if (!hasDQ) {
    synthetic.push({
      id: `ss-${nextId.value++}`,
      silver_stage: "data-quality",
      operation: "Baseline Null-Rate Check",
      implementation_pattern: "Count nulls per required column per batch — if null_rate > 5% flag as WARNING, if > 20% route batch to quarantine",
      confidence: "medium",
      source_transformation_id: "synthetic",
      source_category: "data-validation",
      source_columns: [],
      target_columns: [],
    });
  }

  return synthetic;
}

// ── Main entry point ────────────────────────────────────────────────────────

export function analyzeSilverSpec(
  sourceCode: string,
  outputCode: string,
  direction: "aws-to-azure" | "azure-to-aws"
): SilverSpecResult {
  const patternResult = analyzeTransformationPatterns(sourceCode, outputCode, direction);
  const specs: SilverSpecEntry[] = [];
  const nextId = { value: 1 };

  for (const t of patternResult.transformations) {
    const stage = CATEGORY_TO_STAGE[t.category];
    const operation = deriveOperation(t, stage);
    const pattern = resolveImplementationPattern(t, stage);
    const confidence = mapConfidence(t.confidence, stage, t.category);

    specs.push({
      id: `ss-${nextId.value++}`,
      silver_stage: stage,
      operation,
      implementation_pattern: pattern,
      confidence,
      source_transformation_id: t.id,
      source_category: t.category,
      source_columns: t.source_columns,
      target_columns: t.target_columns,
    });
  }

  const hasDedup = specs.some((s) => s.silver_stage === "deduplication");
  const hasDQ = specs.some((s) => s.silver_stage === "data-quality");
  const synthetic = generateSyntheticSpecs(specs, hasDedup, hasDQ, nextId);
  specs.push(...synthetic);

  const stageBreakdown = {} as Record<SilverStage, number>;
  for (const stage of EXECUTION_ORDER) {
    stageBreakdown[stage] = specs.filter((s) => s.silver_stage === stage).length;
  }

  const stagesUsed = Object.values(stageBreakdown).filter((c) => c > 0).length;
  const highConf = specs.filter((s) => s.confidence === "high").length;
  const confMap: Record<string, number> = { high: 95, "medium-high": 82, medium: 68, low: 50 };
  const avgConf = specs.length > 0 ? Math.round(specs.reduce((s, sp) => s + (confMap[sp.confidence] || 70), 0) / specs.length) : 0;
  const dominantStage = (Object.entries(stageBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || "standardization") as SilverStage;

  const warnings: string[] = [];
  if (stagesUsed < 4) warnings.push(`Only ${stagesUsed}/7 Silver stages populated — review if source covers all required transformations`);
  if (!stageBreakdown["schema-validation"]) warnings.push("No schema validation detected — Silver layer should enforce strict schema from Bronze input");
  if (!stageBreakdown["data-quality"] || stageBreakdown["data-quality"] <= 1) warnings.push("Minimal data quality checks — production Silver needs null-rate, range, referential, and freshness validations");
  if (synthetic.length > 3) warnings.push(`${synthetic.length} specifications were auto-generated — verify these match your actual pipeline requirements`);

  const pipelineStages: PipelineStage[] = EXECUTION_ORDER
    .filter((stage) => stageBreakdown[stage] > 0)
    .map((stage, idx, arr) => ({
      order: idx + 1,
      stage,
      specCount: stageBreakdown[stage],
      operations: specs.filter((s) => s.silver_stage === stage).map((s) => s.operation),
      dependency: idx > 0 ? arr[idx - 1] : null,
    }));

  return {
    specs,
    stageBreakdown,
    summary: {
      totalSpecs: specs.length,
      stagesUsed,
      highConfidenceCount: highConf,
      avgConfidence: avgConf,
      dominantStage,
      warnings,
      unmappedTransformations: 0,
    },
    executionOrder: EXECUTION_ORDER.filter((s) => stageBreakdown[s] > 0),
    pipelineStages,
  };
}

// ── Operation name derivation ───────────────────────────────────────────────

function deriveOperation(t: DetectedTransformation, stage: SilverStage): string {
  const name = t.transformation_name;

  switch (stage) {
    case "schema-validation":
      if (/struct|schema/i.test(name)) return "Schema Enforcement";
      if (/rename|alias/i.test(name)) return "Column Rename Mapping";
      if (/select|project/i.test(name)) return "Column Projection";
      if (/drop/i.test(name)) return "Column Exclusion";
      if (/flatten|nested/i.test(name)) return "Nested Struct Flattening";
      return "Schema Validation";

    case "standardization":
      if (/cast/i.test(name)) return "Type Casting";
      if (/timestamp|date/i.test(name)) return "Timestamp Normalization";
      if (/boolean/i.test(name)) return "Boolean Flag Standardization";
      if (/null/i.test(name)) return "Null Imputation";
      if (/trim/i.test(name)) return "Whitespace Normalization";
      if (/case\s*normal/i.test(name)) return "Case Standardization";
      if (/regex|pattern/i.test(name)) return "Pattern Cleansing";
      if (/invalid|filter/i.test(name)) return "Invalid Record Quarantine";
      return "Data Standardization";

    case "deduplication":
      if (/window|row_number/i.test(name)) return "Window-Based Dedup (Latest Wins)";
      if (/first|last/i.test(name)) return "Group Collapse Dedup";
      return "Key-Based Deduplication";

    case "data-quality":
      if (/null/i.test(name)) return "NOT NULL Enforcement";
      if (/range|boundary/i.test(name)) return "Range Validation";
      if (/pattern|format|regex/i.test(name)) return "Format Validation";
      if (/referential/i.test(name)) return "Referential Integrity Check";
      if (/gate|assert/i.test(name)) return "Pipeline Circuit Breaker";
      if (/status|categor/i.test(name)) return "Domain Value Validation";
      if (/threshold|cap/i.test(name)) return "Threshold Enforcement";
      if (/compliance|sla/i.test(name)) return "Compliance Rule Check";
      if (/multi.*branch|business/i.test(name)) return "Business Rule Validation";
      return "Data Quality Check";

    case "lookup-enrichment":
      if (/broadcast/i.test(name)) return "Broadcast Lookup Join";
      if (/map.*side|dictionary/i.test(name)) return "Map-Side Lookup";
      if (/join/i.test(name)) return "Reference Table Join";
      if (/derived|withcolumn/i.test(name)) return "Computed Column Derivation";
      if (/case.*when|conditional/i.test(name)) return "Conditional Enrichment";
      if (/udf/i.test(name)) return "UDF Enrichment";
      if (/temporal|year|month/i.test(name)) return "Temporal Feature Extraction";
      if (/concat/i.test(name)) return "Composite Key Construction";
      return "Lookup Enrichment";

    case "audit-logging":
      return "Audit Trail Insertion";

    case "incremental-processing":
      if (/group|aggregat/i.test(name)) return "Incremental Aggregation";
      if (/sum|avg|count|max|min/i.test(name)) return "Aggregate Pre-Computation";
      if (/rollup|cube/i.test(name)) return "Multi-Level Rollup";
      if (/window.*function/i.test(name)) return "Window Recomputation";
      if (/revenue|financial|kpi/i.test(name)) return "KPI Pre-Aggregation";
      if (/percentile/i.test(name)) return "Percentile Pre-Computation";
      if (/rate|ratio/i.test(name)) return "Rate Metric Pre-Computation";
      if (/lag|lead|period/i.test(name)) return "Period-Over-Period Setup";
      if (/view|materialized/i.test(name)) return "View Registration";
      if (/pivot/i.test(name)) return "Pivot Pre-Computation";
      if (/write|save|output/i.test(name)) return "Delta Table Write";
      if (/partition/i.test(name)) return "Partition-Aligned Write";
      if (/optimize|zorder/i.test(name)) return "Post-Write Optimization";
      if (/dashboard|bi/i.test(name)) return "BI Output Staging";
      return "Incremental Processing";

    default:
      return t.transformation_name;
  }
}
