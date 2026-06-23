import {
  type SilverSpecResult,
  type SilverSpecEntry,
  type SilverStage,
  analyzeSilverSpec,
} from "./silver-spec-analyzer";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GeneratedModule {
  id: string;
  stage: SilverStage;
  title: string;
  description: string;
  code: string;
  lineCount: number;
  dependencies: string[];
  unityCatalogObjects: string[];
}

export interface SilverCodegenResult {
  modules: GeneratedModule[];
  entryPoint: string;
  configModule: string;
  summary: CodegenSummary;
}

export interface CodegenSummary {
  totalModules: number;
  totalLines: number;
  stagesCovered: number;
  unityCatalogTables: string[];
  deltaOperations: string[];
  errorHandlingPatterns: string[];
}

// ── Stage labels for code modules ──────────────────────────────────────────

export const STAGE_MODULE_LABELS: Record<SilverStage, string> = {
  "schema-validation": "Schema Validation",
  "standardization": "Type Standardization & Null Checks",
  "deduplication": "Deduplication Engine",
  "data-quality": "Data Quality Gate",
  "lookup-enrichment": "Lookup Enrichment",
  "audit-logging": "Audit Logging Framework",
  "incremental-processing": "Incremental Processing & Delta Merge",
};

export const STAGE_MODULE_ICONS: Record<SilverStage, string> = {
  "schema-validation": "🔍",
  "standardization": "🔧",
  "deduplication": "⊘",
  "data-quality": "✅",
  "lookup-enrichment": "🔗",
  "audit-logging": "📋",
  "incremental-processing": "⟳",
};

// ── Main entry point ───────────────────────────────────────────────────────

export function generateSilverCode(
  sourceCode: string,
  outputCode: string,
  direction: "aws-to-azure" | "azure-to-aws"
): SilverCodegenResult {
  const specResult = analyzeSilverSpec(sourceCode, outputCode, direction);
  const specs = specResult.specs;

  const columns = extractColumns(specs);
  const keyColumns = extractKeyColumns(specs);
  const timestampCol = extractTimestampColumn(specs);
  const catalogName = "enterprise_catalog";
  const schemaName = "silver";
  const tableName = "silver_main";

  const modules: GeneratedModule[] = [];

  // 1. Config module (always generated)
  const configModule = generateConfigModule(catalogName, schemaName, tableName, columns, keyColumns, timestampCol);

  // 2. Schema Validation
  modules.push(generateSchemaValidation(specs, columns, catalogName, schemaName, tableName));

  // 3. Null Checks + Type Standardization
  modules.push(generateStandardization(specs, columns, catalogName, schemaName));

  // 4. Deduplication
  modules.push(generateDeduplication(specs, keyColumns, timestampCol, catalogName, schemaName, tableName));

  // 5. Data Quality Gate
  modules.push(generateDataQuality(specs, columns, catalogName, schemaName, tableName));

  // 6. Lookup Enrichment
  modules.push(generateLookupEnrichment(specs, catalogName, schemaName));

  // 7. Audit Logging
  modules.push(generateAuditLogging(catalogName, schemaName, tableName));

  // 8. Delta Merge + Incremental Processing
  modules.push(generateIncrementalProcessing(specs, keyColumns, timestampCol, catalogName, schemaName, tableName, columns));

  // 9. Entry-point orchestrator
  const entryPoint = generateEntryPoint(catalogName, schemaName, tableName, specResult);

  const allTables = new Set<string>();
  const allDeltaOps = new Set<string>();
  const allErrorPatterns = new Set<string>();
  for (const m of modules) {
    m.unityCatalogObjects.forEach((t) => allTables.add(t));
  }
  allDeltaOps.add("MERGE INTO");
  allDeltaOps.add("CREATE TABLE IF NOT EXISTS");
  allDeltaOps.add("OPTIMIZE");
  allDeltaOps.add("VACUUM");
  allDeltaOps.add("Z-ORDER BY");
  allErrorPatterns.add("try/except with quarantine routing");
  allErrorPatterns.add("Circuit-breaker threshold gate");
  allErrorPatterns.add("DQ score aggregation with fail-fast");
  allErrorPatterns.add("Structured error logging to audit table");

  return {
    modules,
    entryPoint,
    configModule,
    summary: {
      totalModules: modules.length,
      totalLines: modules.reduce((s, m) => s + m.lineCount, 0) + entryPoint.split("\n").length + configModule.split("\n").length,
      stagesCovered: new Set(modules.map((m) => m.stage)).size,
      unityCatalogTables: [...allTables],
      deltaOperations: [...allDeltaOps],
      errorHandlingPatterns: [...allErrorPatterns],
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractColumns(specs: SilverSpecEntry[]): string[] {
  const cols = new Set<string>();
  for (const s of specs) {
    s.source_columns.forEach((c) => cols.add(c));
    s.target_columns.forEach((c) => cols.add(c));
  }
  if (cols.size === 0) {
    ["id", "name", "status", "amount", "created_at", "updated_at", "category", "region"].forEach((c) => cols.add(c));
  }
  return [...cols];
}

function extractKeyColumns(specs: SilverSpecEntry[]): string[] {
  const candidates = new Set<string>();
  for (const s of specs) {
    if (s.silver_stage === "deduplication" && s.source_columns.length > 0) {
      s.source_columns.forEach((c) => candidates.add(c));
    }
  }
  if (candidates.size === 0) candidates.add("id");
  return [...candidates];
}

function extractTimestampColumn(specs: SilverSpecEntry[]): string {
  for (const s of specs) {
    for (const c of [...s.source_columns, ...s.target_columns]) {
      if (/timestamp|created_at|updated_at|event_time|ingested_at/i.test(c)) return c;
    }
  }
  return "updated_at";
}

function countLines(code: string): number {
  return code.split("\n").length;
}

// ── Config Module ──────────────────────────────────────────────────────────

function generateConfigModule(
  catalog: string,
  schema: string,
  table: string,
  columns: string[],
  keyColumns: string[],
  timestampCol: string
): string {
  return `# ═══════════════════════════════════════════════════════════════════════════════
# Silver Layer Configuration — Unity Catalog
# Auto-generated by FlowMigrate Silver Codegen
# ═══════════════════════════════════════════════════════════════════════════════

from dataclasses import dataclass, field
from typing import List, Dict, Optional
from datetime import datetime


@dataclass
class SilverConfig:
    """Centralized configuration for Silver layer pipeline."""

    # ── Unity Catalog ────────────────────────────────────────────────────────
    catalog: str = "${catalog}"
    schema: str = "${schema}"
    table: str = "${table}"

    # ── Key columns ──────────────────────────────────────────────────────────
    primary_keys: List[str] = field(default_factory=lambda: ${JSON.stringify(keyColumns)})
    timestamp_column: str = "${timestampCol}"
    partition_columns: List[str] = field(default_factory=lambda: ["_ingestion_date"])

    # ── Source columns ───────────────────────────────────────────────────────
    expected_columns: List[str] = field(default_factory=lambda: ${JSON.stringify(columns)})

    # ── Data quality thresholds ──────────────────────────────────────────────
    null_threshold: float = 0.05           # Max 5% nulls per column
    duplicate_threshold: float = 0.01       # Max 1% duplicates
    dq_score_minimum: float = 0.85          # Minimum DQ score to pass gate
    circuit_breaker_threshold: float = 0.20 # Halt if >20% rows fail any check

    # ── Delta Lake settings ──────────────────────────────────────────────────
    optimize_z_order_columns: List[str] = field(default_factory=lambda: ${JSON.stringify(keyColumns)})
    vacuum_retention_hours: int = 168       # 7 days
    checkpoint_interval: int = 10

    # ── Paths ────────────────────────────────────────────────────────────────
    @property
    def bronze_table(self) -> str:
        return f"{self.catalog}.bronze.{self.table}_raw"

    @property
    def silver_table(self) -> str:
        return f"{self.catalog}.{self.schema}.{self.table}"

    @property
    def quarantine_table(self) -> str:
        return f"{self.catalog}.{self.schema}.{self.table}_quarantine"

    @property
    def audit_table(self) -> str:
        return f"{self.catalog}.{self.schema}.{self.table}_audit"

    @property
    def dq_metrics_table(self) -> str:
        return f"{self.catalog}.{self.schema}.{self.table}_dq_metrics"

    @property
    def checkpoint_path(self) -> str:
        return f"/mnt/checkpoints/silver/{self.table}"


# Singleton config
config = SilverConfig()
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 1: Schema Validation
// ═══════════════════════════════════════════════════════════════════════════════

function generateSchemaValidation(
  specs: SilverSpecEntry[],
  columns: string[],
  catalog: string,
  schema: string,
  table: string
): GeneratedModule {
  const schemaSpecs = specs.filter((s) => s.silver_stage === "schema-validation");
  const colDefs = columns
    .map((c) => {
      if (/id$/i.test(c)) return `    StructField("${c}", StringType(), False)`;
      if (/amount|price|cost|total|revenue/i.test(c)) return `    StructField("${c}", DecimalType(18, 2), True)`;
      if (/count|quantity|num/i.test(c)) return `    StructField("${c}", LongType(), True)`;
      if (/timestamp|_at$|_time$|date/i.test(c)) return `    StructField("${c}", TimestampType(), True)`;
      if (/is_|has_|flag/i.test(c)) return `    StructField("${c}", BooleanType(), True)`;
      return `    StructField("${c}", StringType(), True)`;
    })
    .join(",\n");

  const code = `# ═══════════════════════════════════════════════════════════════════════════════
# Module 1: Schema Validation
# Unity Catalog: ${catalog}.${schema}.${table}
# ═══════════════════════════════════════════════════════════════════════════════

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType, LongType,
    DoubleType, DecimalType, TimestampType, BooleanType, DateType
)
from pyspark.sql.functions import col, lit, current_timestamp, input_file_name
from typing import Tuple
import logging

logger = logging.getLogger("silver.schema_validation")


# ── Expected Silver Schema ──────────────────────────────────────────────────

SILVER_SCHEMA = StructType([
${colDefs},
    StructField("_source_file", StringType(), True),
    StructField("_ingestion_timestamp", TimestampType(), True),
    StructField("_processing_timestamp", TimestampType(), True),
    StructField("_dq_valid", BooleanType(), True),
    StructField("_ingestion_date", DateType(), True),
])


def validate_schema(df: DataFrame, spark: SparkSession) -> Tuple[DataFrame, DataFrame]:
    """
    Validate incoming Bronze DataFrame against expected Silver schema.
    Returns (valid_df, rejected_df).
    """
    logger.info(f"Schema validation started — input columns: {df.columns}")
    expected_cols = {f.name for f in SILVER_SCHEMA.fields if not f.name.startswith("_")}
    incoming_cols = set(df.columns)

    missing = expected_cols - incoming_cols
    extra = incoming_cols - expected_cols

    if missing:
        logger.warning(f"Missing columns (will be added as NULL): {missing}")
    if extra:
        logger.info(f"Extra columns (will be dropped): {extra}")

    # Add missing columns as NULL with correct type
    result_df = df
    for field in SILVER_SCHEMA.fields:
        if field.name in missing:
            result_df = result_df.withColumn(field.name, lit(None).cast(field.dataType))

    # Drop unexpected columns
    keep_cols = [f.name for f in SILVER_SCHEMA.fields if f.name in incoming_cols or f.name in missing]
    result_df = result_df.select(*[c for c in keep_cols if c in result_df.columns])

    # Attempt schema cast — rows that fail go to quarantine
    valid_rows = []
    quarantine_rows = []

    try:
        cast_df = result_df
        for field in SILVER_SCHEMA.fields:
            if field.name in cast_df.columns and not field.name.startswith("_"):
                cast_df = cast_df.withColumn(
                    field.name,
                    col(field.name).cast(field.dataType)
                )

        # Add metadata columns
        cast_df = (
            cast_df
            .withColumn("_source_file", input_file_name())
            .withColumn("_ingestion_timestamp", current_timestamp())
            .withColumn("_processing_timestamp", current_timestamp())
            .withColumn("_dq_valid", lit(True))
            .withColumn("_ingestion_date", current_timestamp().cast(DateType()))
        )

        # Separate rows where key columns became NULL after cast (schema violation)
        key_not_null = col("${columns[0] || "id"}").isNotNull()
        valid_df = cast_df.filter(key_not_null)
        rejected_df = cast_df.filter(~key_not_null).withColumn("_dq_valid", lit(False))

        valid_count = valid_df.count()
        rejected_count = rejected_df.count()
        total = valid_count + rejected_count

        logger.info(
            f"Schema validation complete — "
            f"valid: {valid_count}/{total} ({valid_count/max(total,1)*100:.1f}%), "
            f"rejected: {rejected_count}/{total}"
        )

        return valid_df, rejected_df

    except Exception as e:
        logger.error(f"Schema validation failed: {str(e)}")
        raise RuntimeError(f"Silver schema validation error: {str(e)}") from e


def enforce_not_null_constraints(df: DataFrame) -> Tuple[DataFrame, DataFrame]:
    """Enforce NOT NULL constraints on key columns."""
    not_null_columns = [
        f.name for f in SILVER_SCHEMA.fields
        if not f.nullable and not f.name.startswith("_")
    ]

    if not not_null_columns:
        return df, df.limit(0)

    condition = col(not_null_columns[0]).isNotNull()
    for c in not_null_columns[1:]:
        condition = condition & col(c).isNotNull()

    valid_df = df.filter(condition)
    rejected_df = df.filter(~condition).withColumn(
        "_quarantine_reason", lit(f"NOT NULL violation on: {not_null_columns}")
    )

    return valid_df, rejected_df


def detect_schema_drift(df: DataFrame, spark: SparkSession) -> dict:
    """Detect schema drift between incoming data and expected Silver schema."""
    expected = {f.name: str(f.dataType) for f in SILVER_SCHEMA.fields if not f.name.startswith("_")}
    actual = {f.name: str(f.dataType) for f in df.schema.fields}

    drift_report = {
        "new_columns": [c for c in actual if c not in expected],
        "removed_columns": [c for c in expected if c not in actual],
        "type_changes": [
            {"column": c, "expected": expected[c], "actual": actual[c]}
            for c in expected if c in actual and expected[c] != actual[c]
        ],
        "has_drift": False,
    }
    drift_report["has_drift"] = bool(
        drift_report["new_columns"] or
        drift_report["removed_columns"] or
        drift_report["type_changes"]
    )

    if drift_report["has_drift"]:
        logger.warning(f"Schema drift detected: {drift_report}")

    return drift_report
`;

  return {
    id: "mod-schema-validation",
    stage: "schema-validation",
    title: "Schema Validation",
    description: "StructType enforcement, column projection, schema drift detection, NOT NULL constraints",
    code,
    lineCount: countLines(code),
    dependencies: ["pyspark.sql.types", "pyspark.sql.functions"],
    unityCatalogObjects: [`${catalog}.${schema}.${table}`, `${catalog}.${schema}.${table}_quarantine`],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 2: Null Checks + Type Standardization
// ═══════════════════════════════════════════════════════════════════════════════

function generateStandardization(
  specs: SilverSpecEntry[],
  columns: string[],
  catalog: string,
  schema: string
): GeneratedModule {
  const stringCols = columns.filter((c) => !/id$|amount|price|cost|total|count|quantity|num|timestamp|_at$|_time$|date|is_|has_|flag/i.test(c));
  const numericCols = columns.filter((c) => /amount|price|cost|total|count|quantity|num/i.test(c));
  const timestampCols = columns.filter((c) => /timestamp|_at$|_time$|date/i.test(c));

  const code = `# ═══════════════════════════════════════════════════════════════════════════════
# Module 2: Null Checks & Type Standardization
# ═══════════════════════════════════════════════════════════════════════════════

from pyspark.sql import DataFrame
from pyspark.sql.functions import (
    col, when, lit, trim, lower, upper, regexp_replace,
    to_timestamp, to_date, coalesce, count as spark_count,
    sum as spark_sum, round as spark_round, current_timestamp
)
from pyspark.sql.types import DecimalType, LongType, TimestampType, BooleanType
from typing import Dict, List, Tuple
import logging

logger = logging.getLogger("silver.standardization")


# ── Null-rate thresholds per column ─────────────────────────────────────────

NULL_THRESHOLDS: Dict[str, float] = {
${columns.map((c) => `    "${c}": 0.05,`).join("\n")}
}


def check_null_rates(df: DataFrame) -> Dict[str, float]:
    """
    Compute null rate per column.
    Returns dict of column → null_rate (0.0 to 1.0).
    """
    total = df.count()
    if total == 0:
        return {c: 0.0 for c in df.columns if not c.startswith("_")}

    null_counts = df.select([
        spark_sum(when(col(c).isNull(), 1).otherwise(0)).alias(c)
        for c in df.columns if not c.startswith("_")
    ]).collect()[0]

    rates = {}
    for c in df.columns:
        if c.startswith("_"):
            continue
        null_ct = null_counts[c] or 0
        rates[c] = null_ct / total

    breaches = {c: r for c, r in rates.items() if c in NULL_THRESHOLDS and r > NULL_THRESHOLDS[c]}
    if breaches:
        logger.warning(f"Null-rate threshold breaches: {breaches}")
    else:
        logger.info(f"Null-rate check passed — all columns within thresholds")

    return rates


def impute_nulls(df: DataFrame) -> DataFrame:
    """
    Apply domain-specific null imputation.
    - Strings  → 'UNKNOWN'
    - Numerics → 0
    - Timestamps → leave NULL (no synthetic dates)
    - Booleans → False
    """
    result = df

    # String columns
    string_cols = ${JSON.stringify(stringCols)}
    for c in string_cols:
        if c in result.columns:
            result = result.withColumn(c, coalesce(col(c), lit("UNKNOWN")))

    # Numeric columns
    numeric_cols = ${JSON.stringify(numericCols)}
    for c in numeric_cols:
        if c in result.columns:
            result = result.withColumn(c, coalesce(col(c), lit(0)))

    logger.info("Null imputation applied")
    return result


def standardize_types(df: DataFrame) -> DataFrame:
    """
    Apply type casting and format standardization.
    """
    result = df

    # ── Trim whitespace on all string columns ────────────────────────────────
    for c in ${JSON.stringify(stringCols)}:
        if c in result.columns:
            result = result.withColumn(c, trim(col(c)))
            result = result.withColumn(c, regexp_replace(col(c), r"\\s+", " "))

    # ── Normalize case for categorical/status columns ────────────────────────
    case_normalize_cols = [
        c for c in ${JSON.stringify(stringCols)}
        if any(k in c.lower() for k in ["status", "category", "type", "region", "tier"])
    ]
    for c in case_normalize_cols:
        if c in result.columns:
            result = result.withColumn(c, upper(trim(col(c))))

    # ── Cast numeric columns ─────────────────────────────────────────────────
    for c in ${JSON.stringify(numericCols)}:
        if c in result.columns:
            result = result.withColumn(c, col(c).cast(DecimalType(18, 2)))

    # ── Standardize timestamps to UTC ────────────────────────────────────────
    timestamp_cols = ${JSON.stringify(timestampCols)}
    for c in timestamp_cols:
        if c in result.columns:
            result = result.withColumn(c, to_timestamp(col(c)))

    # ── Boolean standardization ──────────────────────────────────────────────
    bool_pattern_cols = [c for c in result.columns if c.startswith("is_") or c.startswith("has_")]
    for c in bool_pattern_cols:
        result = result.withColumn(
            c,
            when(col(c).isin("true", "True", "TRUE", "1", "yes", "Yes", "Y"), lit(True))
            .when(col(c).isin("false", "False", "FALSE", "0", "no", "No", "N"), lit(False))
            .otherwise(col(c).cast(BooleanType()))
        )

    # ── Strip non-printable characters ───────────────────────────────────────
    for c in ${JSON.stringify(stringCols)}:
        if c in result.columns:
            result = result.withColumn(c, regexp_replace(col(c), r"[\\x00-\\x1f\\x7f]", ""))

    logger.info("Type standardization complete")
    return result


def run_standardization(df: DataFrame) -> Tuple[DataFrame, Dict[str, float]]:
    """Full standardization pipeline: null check → impute → type cast."""
    null_rates = check_null_rates(df)
    df_imputed = impute_nulls(df)
    df_standardized = standardize_types(df_imputed)
    return df_standardized, null_rates
`;

  return {
    id: "mod-standardization",
    stage: "standardization",
    title: "Null Checks & Type Standardization",
    description: "Null-rate monitoring, domain-specific imputation, type casting, whitespace normalization, boolean standardization",
    code,
    lineCount: countLines(code),
    dependencies: ["pyspark.sql.functions", "pyspark.sql.types"],
    unityCatalogObjects: [`${catalog}.${schema}.dq_metrics`],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 3: Deduplication Engine
// ═══════════════════════════════════════════════════════════════════════════════

function generateDeduplication(
  specs: SilverSpecEntry[],
  keyColumns: string[],
  timestampCol: string,
  catalog: string,
  schema: string,
  table: string
): GeneratedModule {
  const keyStr = keyColumns.map((k) => `"${k}"`).join(", ");

  const code = `# ═══════════════════════════════════════════════════════════════════════════════
# Module 3: Deduplication Engine
# Strategy: Window-based ROW_NUMBER — keeps latest record per composite key
# ═══════════════════════════════════════════════════════════════════════════════

from pyspark.sql import DataFrame
from pyspark.sql.functions import (
    col, row_number, lit, count as spark_count, current_timestamp
)
from pyspark.sql.window import Window
from typing import Tuple
import logging

logger = logging.getLogger("silver.deduplication")

# ── Dedup configuration ─────────────────────────────────────────────────────

DEDUP_KEYS = [${keyStr}]
ORDER_COLUMN = "${timestampCol}"
DUPLICATE_THRESHOLD = 0.01  # Alert if >1% duplicates


def deduplicate(df: DataFrame, strategy: str = "latest") -> Tuple[DataFrame, DataFrame]:
    """
    Remove duplicates based on composite key.

    Strategies:
      - 'latest': Keep the most recent record per key (default)
      - 'first':  Keep the earliest record per key
      - 'exact':  dropDuplicates on key columns only

    Returns (deduped_df, duplicate_df).
    """
    total_before = df.count()
    logger.info(f"Deduplication started — {total_before} rows, strategy='{strategy}', keys={DEDUP_KEYS}")

    if strategy == "exact":
        deduped = df.dropDuplicates(DEDUP_KEYS)
        dup_count = total_before - deduped.count()
        duplicates = df.subtract(deduped) if dup_count > 0 else df.limit(0)

    else:
        order_dir = col(ORDER_COLUMN).desc() if strategy == "latest" else col(ORDER_COLUMN).asc()

        window = Window.partitionBy(*[col(k) for k in DEDUP_KEYS]).orderBy(order_dir)

        ranked = df.withColumn("_dedup_rank", row_number().over(window))
        deduped = ranked.filter(col("_dedup_rank") == 1).drop("_dedup_rank")
        duplicates = ranked.filter(col("_dedup_rank") > 1).drop("_dedup_rank")
        dup_count = total_before - deduped.count()

    dup_rate = dup_count / max(total_before, 1)

    if dup_rate > DUPLICATE_THRESHOLD:
        logger.warning(
            f"Duplicate rate {dup_rate:.4f} exceeds threshold {DUPLICATE_THRESHOLD} — "
            f"{dup_count} duplicates removed from {total_before} rows"
        )
    else:
        logger.info(f"Deduplication complete — removed {dup_count} duplicates ({dup_rate:.4f} rate)")

    # Tag duplicates for audit
    duplicates = duplicates.withColumn(
        "_quarantine_reason", lit("duplicate_key")
    ).withColumn(
        "_quarantine_timestamp", current_timestamp()
    )

    return deduped, duplicates


def compute_duplicate_stats(df: DataFrame) -> dict:
    """Compute duplicate distribution statistics for monitoring."""
    dup_counts = (
        df.groupBy(*DEDUP_KEYS)
        .agg(spark_count("*").alias("occurrence_count"))
        .filter(col("occurrence_count") > 1)
    )

    if dup_counts.count() == 0:
        return {"total_duplicate_groups": 0, "max_occurrences": 0, "total_duplicate_rows": 0}

    stats = dup_counts.agg(
        spark_count("*").alias("total_groups"),
        spark_count("occurrence_count").alias("max_occ"),
    ).collect()[0]

    return {
        "total_duplicate_groups": stats["total_groups"],
        "max_occurrences": stats["max_occ"],
        "dedup_keys": DEDUP_KEYS,
    }
`;

  return {
    id: "mod-deduplication",
    stage: "deduplication",
    title: "Deduplication Engine",
    description: "Window-based ROW_NUMBER dedup, exact-match dedup, duplicate stats, threshold alerting",
    code,
    lineCount: countLines(code),
    dependencies: ["pyspark.sql.window", "pyspark.sql.functions"],
    unityCatalogObjects: [`${catalog}.${schema}.${table}`],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 4: Data Quality Gate
// ═══════════════════════════════════════════════════════════════════════════════

function generateDataQuality(
  specs: SilverSpecEntry[],
  columns: string[],
  catalog: string,
  schema: string,
  table: string
): GeneratedModule {
  const code = `# ═══════════════════════════════════════════════════════════════════════════════
# Module 4: Data Quality Gate
# Severity levels: INFO → WARNING → CRITICAL → CIRCUIT_BREAKER
# ═══════════════════════════════════════════════════════════════════════════════

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.functions import (
    col, when, lit, length, regexp_extract, current_timestamp,
    sum as spark_sum, count as spark_count, round as spark_round,
    struct, array, explode
)
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, TimestampType, IntegerType
from dataclasses import dataclass
from typing import List, Tuple, Dict
from enum import Enum
import logging

logger = logging.getLogger("silver.data_quality")


class DQSeverity(Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    CIRCUIT_BREAKER = "CIRCUIT_BREAKER"


@dataclass
class DQRule:
    rule_id: str
    column: str
    check_type: str
    expression: str
    severity: DQSeverity
    description: str


# ── DQ Rule catalog ─────────────────────────────────────────────────────────

DQ_RULES: List[DQRule] = [
${columns.slice(0, 8).map((c, i) => {
    if (/id$/i.test(c))
      return `    DQRule("DQ-${String(i + 1).padStart(3, "0")}", "${c}", "not_null", "col('${c}').isNotNull()", DQSeverity.CRITICAL, "${c} must not be NULL"),`;
    if (/amount|price|cost|total|revenue/i.test(c))
      return `    DQRule("DQ-${String(i + 1).padStart(3, "0")}", "${c}", "range", "col('${c}') >= 0", DQSeverity.WARNING, "${c} must be non-negative"),`;
    if (/status|category|type/i.test(c))
      return `    DQRule("DQ-${String(i + 1).padStart(3, "0")}", "${c}", "not_empty", "length(col('${c}')) > 0", DQSeverity.WARNING, "${c} must not be empty string"),`;
    if (/email/i.test(c))
      return `    DQRule("DQ-${String(i + 1).padStart(3, "0")}", "${c}", "pattern", "col('${c}').rlike(r'^[\\\\w.+-]+@[\\\\w-]+\\\\.[\\\\w.]+$')", DQSeverity.WARNING, "${c} must be valid email format"),`;
    return `    DQRule("DQ-${String(i + 1).padStart(3, "0")}", "${c}", "not_null", "col('${c}').isNotNull()", DQSeverity.INFO, "${c} null check"),`;
  }).join("\n")}
]

CIRCUIT_BREAKER_THRESHOLD = 0.20  # Halt pipeline if >20% rows fail critical checks
DQ_SCORE_MINIMUM = 0.85           # Minimum aggregate DQ score to proceed


def evaluate_dq_rules(df: DataFrame) -> Tuple[DataFrame, List[Dict]]:
    """
    Evaluate all DQ rules against the DataFrame.
    Returns (df_with_dq_flags, rule_results).
    """
    total = df.count()
    if total == 0:
        logger.warning("Empty DataFrame — skipping DQ evaluation")
        return df, []

    result_df = df
    rule_results = []
    critical_failures = 0

    for rule in DQ_RULES:
        if rule.column not in result_df.columns:
            logger.info(f"Skipping rule {rule.rule_id} — column '{rule.column}' not present")
            continue

        try:
            # Build check expression
            if rule.check_type == "not_null":
                check_expr = col(rule.column).isNotNull()
            elif rule.check_type == "not_empty":
                check_expr = (col(rule.column).isNotNull()) & (length(col(rule.column)) > 0)
            elif rule.check_type == "range":
                check_expr = col(rule.column) >= 0
            elif rule.check_type == "pattern":
                check_expr = col(rule.column).rlike(r"^[\\w.+-]+@[\\w-]+\\.[\\w.]+$")
            else:
                check_expr = col(rule.column).isNotNull()

            flag_col = f"_dq_{rule.rule_id.lower().replace('-', '_')}"
            result_df = result_df.withColumn(flag_col, when(check_expr, lit(True)).otherwise(lit(False)))

            pass_count = result_df.filter(col(flag_col) == True).count()
            fail_count = total - pass_count
            pass_rate = pass_count / total

            rule_results.append({
                "rule_id": rule.rule_id,
                "column": rule.column,
                "check_type": rule.check_type,
                "severity": rule.severity.value,
                "total_rows": total,
                "pass_count": pass_count,
                "fail_count": fail_count,
                "pass_rate": round(pass_rate, 4),
            })

            if rule.severity == DQSeverity.CRITICAL and fail_count > 0:
                critical_failures += fail_count

            log_fn = logger.warning if fail_count > 0 else logger.info
            log_fn(f"Rule {rule.rule_id} [{rule.severity.value}]: {pass_rate:.2%} pass rate ({fail_count} failures)")

        except Exception as e:
            logger.error(f"Rule {rule.rule_id} evaluation failed: {e}")
            rule_results.append({
                "rule_id": rule.rule_id,
                "column": rule.column,
                "error": str(e),
                "severity": rule.severity.value,
            })

    return result_df, rule_results


def compute_dq_score(rule_results: List[Dict]) -> float:
    """Compute aggregate DQ score (weighted by severity)."""
    weights = {"INFO": 0.5, "WARNING": 1.0, "CRITICAL": 2.0, "CIRCUIT_BREAKER": 5.0}
    total_weight = 0.0
    weighted_pass = 0.0

    for r in rule_results:
        if "error" in r:
            continue
        w = weights.get(r["severity"], 1.0)
        total_weight += w
        weighted_pass += w * r["pass_rate"]

    if total_weight == 0:
        return 1.0

    score = weighted_pass / total_weight
    logger.info(f"Aggregate DQ score: {score:.4f} (minimum: {DQ_SCORE_MINIMUM})")
    return round(score, 4)


def apply_dq_gate(
    df: DataFrame,
    rule_results: List[Dict],
    spark: SparkSession
) -> Tuple[DataFrame, DataFrame]:
    """
    Apply DQ gate: pass rows where all CRITICAL rules pass.
    Quarantine rows that fail any CRITICAL check.
    Circuit-breaker halts pipeline if failure rate exceeds threshold.
    """
    total = df.count()
    dq_score = compute_dq_score(rule_results)

    # Circuit breaker check
    critical_results = [r for r in rule_results if r.get("severity") == "CRITICAL" and "pass_rate" in r]
    for cr in critical_results:
        fail_rate = 1.0 - cr["pass_rate"]
        if fail_rate > CIRCUIT_BREAKER_THRESHOLD:
            msg = (
                f"CIRCUIT BREAKER TRIGGERED — Rule {cr['rule_id']} on column '{cr['column']}' "
                f"has {fail_rate:.2%} failure rate (threshold: {CIRCUIT_BREAKER_THRESHOLD:.2%}). "
                f"Pipeline halted to prevent bad data propagation."
            )
            logger.critical(msg)
            raise RuntimeError(msg)

    # DQ score gate
    if dq_score < DQ_SCORE_MINIMUM:
        logger.warning(
            f"DQ score {dq_score} below minimum {DQ_SCORE_MINIMUM} — "
            f"pipeline will continue with quarantine routing"
        )

    # Separate valid and quarantined rows
    critical_flag_cols = [
        f"_dq_{r['rule_id'].lower().replace('-', '_')}"
        for r in rule_results
        if r.get("severity") == "CRITICAL" and "error" not in r
    ]

    if critical_flag_cols:
        all_pass = col(critical_flag_cols[0])
        for fc in critical_flag_cols[1:]:
            all_pass = all_pass & col(fc)

        valid_df = df.filter(all_pass)
        quarantine_df = df.filter(~all_pass).withColumn(
            "_quarantine_reason", lit("dq_critical_failure")
        ).withColumn("_dq_score", lit(dq_score))
    else:
        valid_df = df
        quarantine_df = df.limit(0)

    # Drop DQ flag columns from output
    drop_cols = [c for c in valid_df.columns if c.startswith("_dq_DQ") or c.startswith("_dq_dq")]
    for c in drop_cols:
        valid_df = valid_df.drop(c)
        quarantine_df = quarantine_df.drop(c)

    logger.info(
        f"DQ gate complete — passed: {valid_df.count()}, quarantined: {quarantine_df.count()}, score: {dq_score}"
    )

    # Write DQ metrics
    try:
        metrics_data = [(
            r.get("rule_id", ""),
            r.get("column", ""),
            r.get("check_type", ""),
            r.get("severity", ""),
            r.get("pass_count", 0),
            r.get("fail_count", 0),
            float(r.get("pass_rate", 0.0)),
        ) for r in rule_results if "error" not in r]

        metrics_schema = StructType([
            StructField("rule_id", StringType()),
            StructField("column_name", StringType()),
            StructField("check_type", StringType()),
            StructField("severity", StringType()),
            StructField("pass_count", IntegerType()),
            StructField("fail_count", IntegerType()),
            StructField("pass_rate", DoubleType()),
        ])

        metrics_df = spark.createDataFrame(metrics_data, metrics_schema).withColumn(
            "_evaluation_timestamp", current_timestamp()
        )
        metrics_df.write.format("delta").mode("append").saveAsTable(
            "${catalog}.${schema}.${table}_dq_metrics"
        )
        logger.info("DQ metrics written to ${catalog}.${schema}.${table}_dq_metrics")
    except Exception as e:
        logger.error(f"Failed to write DQ metrics: {e}")

    return valid_df, quarantine_df
`;

  return {
    id: "mod-data-quality",
    stage: "data-quality",
    title: "Data Quality Gate",
    description: "Rule-based DQ engine with severity levels, circuit breaker, aggregate DQ score, quarantine routing",
    code,
    lineCount: countLines(code),
    dependencies: ["pyspark.sql.functions", "pyspark.sql.types"],
    unityCatalogObjects: [
      `${catalog}.${schema}.${table}`,
      `${catalog}.${schema}.${table}_quarantine`,
      `${catalog}.${schema}.${table}_dq_metrics`,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 5: Lookup Enrichment
// ═══════════════════════════════════════════════════════════════════════════════

function generateLookupEnrichment(
  specs: SilverSpecEntry[],
  catalog: string,
  schema: string
): GeneratedModule {
  const enrichSpecs = specs.filter((s) => s.silver_stage === "lookup-enrichment");
  const lookupExamples = enrichSpecs
    .filter((s) => s.source_columns.length > 0)
    .slice(0, 4);

  const code = `# ═══════════════════════════════════════════════════════════════════════════════
# Module 5: Lookup Enrichment
# Broadcast joins for small lookups, shuffle joins for large dimensions
# ═══════════════════════════════════════════════════════════════════════════════

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.functions import (
    col, broadcast, lit, when, coalesce, concat_ws,
    year, month, dayofmonth, hour, quarter, current_timestamp,
    date_format
)
from typing import Dict, List, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger("silver.lookup_enrichment")

BROADCAST_SIZE_THRESHOLD_MB = 100


@dataclass
class LookupConfig:
    lookup_table: str
    join_key_source: str
    join_key_lookup: str
    select_columns: List[str]
    join_type: str = "left"
    use_broadcast: bool = True
    default_values: Optional[Dict[str, str]] = None


# ── Lookup registry ─────────────────────────────────────────────────────────

LOOKUP_REGISTRY: List[LookupConfig] = [
    LookupConfig(
        lookup_table="${catalog}.reference.dim_region",
        join_key_source="region",
        join_key_lookup="region_code",
        select_columns=["region_name", "region_group", "timezone"],
        use_broadcast=True,
        default_values={"region_name": "UNKNOWN", "region_group": "UNASSIGNED"},
    ),
    LookupConfig(
        lookup_table="${catalog}.reference.dim_category",
        join_key_source="category",
        join_key_lookup="category_code",
        select_columns=["category_name", "category_group", "is_active"],
        use_broadcast=True,
        default_values={"category_name": "UNCATEGORIZED"},
    ),
    LookupConfig(
        lookup_table="${catalog}.reference.dim_status",
        join_key_source="status",
        join_key_lookup="status_code",
        select_columns=["status_label", "status_group", "is_terminal"],
        use_broadcast=True,
        default_values={"status_label": "UNKNOWN"},
    ),
]


def enrich_with_lookups(df: DataFrame, spark: SparkSession) -> DataFrame:
    """Apply all registered lookups to enrich the Silver DataFrame."""
    result = df
    enriched_count = 0

    for lookup in LOOKUP_REGISTRY:
        if lookup.join_key_source not in result.columns:
            logger.info(f"Skipping lookup '{lookup.lookup_table}' — source key '{lookup.join_key_source}' not in DataFrame")
            continue

        try:
            # Check if lookup table exists
            if not spark.catalog.tableExists(lookup.lookup_table):
                logger.warning(f"Lookup table '{lookup.lookup_table}' does not exist — skipping")
                if lookup.default_values:
                    for col_name, default_val in lookup.default_values.items():
                        result = result.withColumn(col_name, lit(default_val))
                continue

            lookup_df = spark.table(lookup.lookup_table)

            # Select only needed columns from lookup + join key
            lookup_cols = [lookup.join_key_lookup] + lookup.select_columns
            available_cols = [c for c in lookup_cols if c in lookup_df.columns]
            lookup_df = lookup_df.select(*available_cols)

            # Broadcast if small
            if lookup.use_broadcast:
                lookup_df = broadcast(lookup_df)
                logger.info(f"Broadcasting lookup: {lookup.lookup_table}")

            # Join
            result = result.join(
                lookup_df,
                result[lookup.join_key_source] == lookup_df[lookup.join_key_lookup],
                lookup.join_type,
            ).drop(lookup_df[lookup.join_key_lookup])

            # Apply defaults for NULL enrichment columns (left join misses)
            if lookup.default_values:
                for col_name, default_val in lookup.default_values.items():
                    if col_name in result.columns:
                        result = result.withColumn(
                            col_name, coalesce(col(col_name), lit(default_val))
                        )

            enriched_count += 1
            logger.info(f"Enriched with '{lookup.lookup_table}' on key '{lookup.join_key_source}'")

        except Exception as e:
            logger.error(f"Lookup enrichment failed for '{lookup.lookup_table}': {e}")
            # Apply defaults on failure so downstream schema is stable
            if lookup.default_values:
                for col_name, default_val in lookup.default_values.items():
                    if col_name not in result.columns:
                        result = result.withColumn(col_name, lit(default_val))

    logger.info(f"Lookup enrichment complete — {enriched_count}/{len(LOOKUP_REGISTRY)} lookups applied")
    return result


def add_temporal_features(df: DataFrame, timestamp_col: str) -> DataFrame:
    """Derive temporal features from timestamp column for downstream analysis."""
    if timestamp_col not in df.columns:
        logger.warning(f"Timestamp column '{timestamp_col}' not found — skipping temporal features")
        return df

    result = (
        df
        .withColumn("_year", year(col(timestamp_col)))
        .withColumn("_month", month(col(timestamp_col)))
        .withColumn("_day", dayofmonth(col(timestamp_col)))
        .withColumn("_hour", hour(col(timestamp_col)))
        .withColumn("_quarter", quarter(col(timestamp_col)))
        .withColumn("_year_month", date_format(col(timestamp_col), "yyyy-MM"))
    )

    logger.info(f"Temporal features derived from '{timestamp_col}'")
    return result


def build_composite_keys(df: DataFrame, key_configs: Dict[str, List[str]]) -> DataFrame:
    """Build composite/surrogate keys from multiple columns."""
    result = df
    for key_name, source_cols in key_configs.items():
        available = [c for c in source_cols if c in result.columns]
        if len(available) == len(source_cols):
            result = result.withColumn(key_name, concat_ws("__", *[col(c) for c in available]))
            logger.info(f"Composite key '{key_name}' built from {available}")
        else:
            logger.warning(f"Cannot build '{key_name}' — missing columns: {set(source_cols) - set(available)}")
    return result
`;

  return {
    id: "mod-lookup-enrichment",
    stage: "lookup-enrichment",
    title: "Lookup Enrichment",
    description: "Broadcast hash joins, shuffle joins, temporal feature extraction, composite key construction, default handling",
    code,
    lineCount: countLines(code),
    dependencies: ["pyspark.sql.functions"],
    unityCatalogObjects: [
      `${catalog}.reference.dim_region`,
      `${catalog}.reference.dim_category`,
      `${catalog}.reference.dim_status`,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 6: Audit Logging Framework
// ═══════════════════════════════════════════════════════════════════════════════

function generateAuditLogging(catalog: string, schema: string, table: string): GeneratedModule {
  const code = `# ═══════════════════════════════════════════════════════════════════════════════
# Module 6: Audit Logging Framework
# Row-level lineage + pipeline execution tracking + DQ metrics persistence
# ═══════════════════════════════════════════════════════════════════════════════

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.functions import (
    col, lit, current_timestamp, monotonically_increasing_id,
    input_file_name, count as spark_count, when, sum as spark_sum,
    struct, to_json
)
from pyspark.sql.types import (
    StructType, StructField, StringType, LongType,
    TimestampType, DoubleType, MapType
)
from datetime import datetime
from typing import Dict, List, Optional
import uuid
import logging

logger = logging.getLogger("silver.audit")


# ── Audit table schema ──────────────────────────────────────────────────────

AUDIT_SCHEMA = StructType([
    StructField("audit_id", StringType(), False),
    StructField("run_id", StringType(), False),
    StructField("pipeline_name", StringType(), False),
    StructField("stage", StringType(), False),
    StructField("status", StringType(), False),
    StructField("input_row_count", LongType(), True),
    StructField("output_row_count", LongType(), True),
    StructField("quarantine_row_count", LongType(), True),
    StructField("duplicate_row_count", LongType(), True),
    StructField("dq_score", DoubleType(), True),
    StructField("null_rates_json", StringType(), True),
    StructField("schema_drift_json", StringType(), True),
    StructField("error_message", StringType(), True),
    StructField("start_timestamp", TimestampType(), False),
    StructField("end_timestamp", TimestampType(), True),
    StructField("duration_seconds", DoubleType(), True),
    StructField("source_table", StringType(), True),
    StructField("target_table", StringType(), True),
    StructField("spark_application_id", StringType(), True),
])


class AuditLogger:
    """Pipeline audit logger — writes execution metadata to Unity Catalog audit table."""

    def __init__(self, spark: SparkSession, pipeline_name: str = "silver_pipeline"):
        self.spark = spark
        self.pipeline_name = pipeline_name
        self.run_id = str(uuid.uuid4())
        self.start_time = datetime.utcnow()
        self.stage_logs: List[Dict] = []
        self.audit_table = "${catalog}.${schema}.${table}_audit"
        logger.info(f"Audit logger initialized — run_id={self.run_id}")

    def _ensure_audit_table(self):
        """Create audit table if it doesn't exist."""
        self.spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {self.audit_table} (
                audit_id STRING NOT NULL,
                run_id STRING NOT NULL,
                pipeline_name STRING,
                stage STRING,
                status STRING,
                input_row_count BIGINT,
                output_row_count BIGINT,
                quarantine_row_count BIGINT,
                duplicate_row_count BIGINT,
                dq_score DOUBLE,
                null_rates_json STRING,
                schema_drift_json STRING,
                error_message STRING,
                start_timestamp TIMESTAMP,
                end_timestamp TIMESTAMP,
                duration_seconds DOUBLE,
                source_table STRING,
                target_table STRING,
                spark_application_id STRING
            )
            USING DELTA
            TBLPROPERTIES (
                'delta.autoOptimize.optimizeWrite' = 'true',
                'delta.autoOptimize.autoCompact' = 'true'
            )
        """)

    def log_stage(
        self,
        stage: str,
        status: str,
        input_count: int = 0,
        output_count: int = 0,
        quarantine_count: int = 0,
        duplicate_count: int = 0,
        dq_score: float = 1.0,
        null_rates: Optional[Dict] = None,
        schema_drift: Optional[Dict] = None,
        error_message: Optional[str] = None,
    ):
        """Log a single pipeline stage execution."""
        import json
        now = datetime.utcnow()
        duration = (now - self.start_time).total_seconds()

        entry = {
            "audit_id": str(uuid.uuid4()),
            "run_id": self.run_id,
            "pipeline_name": self.pipeline_name,
            "stage": stage,
            "status": status,
            "input_row_count": input_count,
            "output_row_count": output_count,
            "quarantine_row_count": quarantine_count,
            "duplicate_row_count": duplicate_count,
            "dq_score": dq_score,
            "null_rates_json": json.dumps(null_rates) if null_rates else None,
            "schema_drift_json": json.dumps(schema_drift) if schema_drift else None,
            "error_message": error_message,
            "start_timestamp": self.start_time.isoformat(),
            "end_timestamp": now.isoformat(),
            "duration_seconds": duration,
            "source_table": "${catalog}.bronze.${table}_raw",
            "target_table": "${catalog}.${schema}.${table}",
            "spark_application_id": self.spark.sparkContext.applicationId,
        }

        self.stage_logs.append(entry)
        level = logger.error if status == "FAILED" else logger.info
        level(f"Audit [{stage}] status={status} in={input_count} out={output_count} quarantine={quarantine_count} dq={dq_score:.4f}")

    def flush(self):
        """Write all staged audit entries to the audit table."""
        if not self.stage_logs:
            logger.warning("No audit entries to flush")
            return

        try:
            self._ensure_audit_table()
            import json

            rows = []
            for entry in self.stage_logs:
                rows.append((
                    entry["audit_id"],
                    entry["run_id"],
                    entry["pipeline_name"],
                    entry["stage"],
                    entry["status"],
                    entry["input_row_count"],
                    entry["output_row_count"],
                    entry["quarantine_row_count"],
                    entry["duplicate_row_count"],
                    entry["dq_score"],
                    entry["null_rates_json"],
                    entry["schema_drift_json"],
                    entry["error_message"],
                    datetime.fromisoformat(entry["start_timestamp"]),
                    datetime.fromisoformat(entry["end_timestamp"]),
                    entry["duration_seconds"],
                    entry["source_table"],
                    entry["target_table"],
                    entry["spark_application_id"],
                ))

            audit_df = self.spark.createDataFrame(rows, AUDIT_SCHEMA)
            audit_df.write.format("delta").mode("append").saveAsTable(self.audit_table)

            logger.info(f"Flushed {len(self.stage_logs)} audit entries to {self.audit_table}")
            self.stage_logs.clear()

        except Exception as e:
            logger.error(f"Audit flush failed: {e}")
            raise


def add_row_level_lineage(df: DataFrame) -> DataFrame:
    """Add row-level lineage columns to the Silver DataFrame."""
    return (
        df
        .withColumn("_row_id", monotonically_increasing_id())
        .withColumn("_source_file", input_file_name())
        .withColumn("_processing_timestamp", current_timestamp())
        .withColumn("_silver_version", lit("1.0"))
    )


def write_quarantine(
    quarantine_df: DataFrame,
    reason: str,
    spark: SparkSession
):
    """Write quarantined rows to the quarantine table."""
    if quarantine_df.count() == 0:
        logger.info(f"No rows to quarantine for reason: {reason}")
        return

    q_df = (
        quarantine_df
        .withColumn("_quarantine_reason", lit(reason))
        .withColumn("_quarantine_timestamp", current_timestamp())
    )

    try:
        q_df.write.format("delta").mode("append").saveAsTable(
            "${catalog}.${schema}.${table}_quarantine"
        )
        logger.info(f"Wrote {q_df.count()} rows to quarantine — reason: {reason}")
    except Exception as e:
        logger.error(f"Failed to write quarantine: {e}")
        raise
`;

  return {
    id: "mod-audit-logging",
    stage: "audit-logging",
    title: "Audit Logging Framework",
    description: "AuditLogger class, row-level lineage, quarantine writer, DQ metrics persistence, pipeline execution tracking",
    code,
    lineCount: countLines(code),
    dependencies: ["uuid", "datetime", "pyspark.sql.types"],
    unityCatalogObjects: [
      `${catalog}.${schema}.${table}_audit`,
      `${catalog}.${schema}.${table}_quarantine`,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 7: Delta Merge + Incremental Processing
// ═══════════════════════════════════════════════════════════════════════════════

function generateIncrementalProcessing(
  specs: SilverSpecEntry[],
  keyColumns: string[],
  timestampCol: string,
  catalog: string,
  schema: string,
  table: string,
  columns: string[]
): GeneratedModule {
  const keyStr = keyColumns.map((k) => `"${k}"`).join(", ");
  const mergeCondition = keyColumns.map((k) => `target.${k} = source.${k}`).join(" AND ");
  const updateCols = columns
    .filter((c) => !keyColumns.includes(c))
    .slice(0, 12)
    .map((c) => `            target.${c} = source.${c}`)
    .join(",\n");
  const insertCols = columns.slice(0, 15);

  const code = `# ═══════════════════════════════════════════════════════════════════════════════
# Module 7: Delta Merge & Incremental Processing
# MERGE INTO with SCD Type 1, watermark tracking, OPTIMIZE + VACUUM
# ═══════════════════════════════════════════════════════════════════════════════

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.functions import (
    col, lit, current_timestamp, max as spark_max,
    count as spark_count, when
)
from delta.tables import DeltaTable
from typing import Dict, Optional
import logging

logger = logging.getLogger("silver.incremental")


# ── Configuration ───────────────────────────────────────────────────────────

MERGE_KEYS = [${keyStr}]
TIMESTAMP_COL = "${timestampCol}"
TARGET_TABLE = "${catalog}.${schema}.${table}"
WATERMARK_TABLE = "${catalog}.${schema}._watermarks"
CHECKPOINT_PATH = "/mnt/checkpoints/silver/${table}"
VACUUM_RETENTION_HOURS = 168
Z_ORDER_COLUMNS = [${keyStr}]


def create_silver_table_if_not_exists(spark: SparkSession):
    """Create the Silver Delta table with Unity Catalog registration."""
    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {TARGET_TABLE} (
${columns.map((c) => {
    if (/id$/i.test(c)) return `            ${c} STRING NOT NULL`;
    if (/amount|price|cost|total|revenue/i.test(c)) return `            ${c} DECIMAL(18, 2)`;
    if (/count|quantity|num/i.test(c)) return `            ${c} BIGINT`;
    if (/timestamp|_at$|_time$/i.test(c)) return `            ${c} TIMESTAMP`;
    if (/is_|has_|flag/i.test(c)) return `            ${c} BOOLEAN`;
    return `            ${c} STRING`;
  }).join(",\n")},
            _source_file STRING,
            _ingestion_timestamp TIMESTAMP,
            _processing_timestamp TIMESTAMP,
            _dq_valid BOOLEAN DEFAULT TRUE,
            _ingestion_date DATE,
            _row_id BIGINT,
            _silver_version STRING DEFAULT '1.0'
        )
        USING DELTA
        PARTITIONED BY (_ingestion_date)
        TBLPROPERTIES (
            'delta.autoOptimize.optimizeWrite' = 'true',
            'delta.autoOptimize.autoCompact' = 'true',
            'delta.enableChangeDataFeed' = 'true',
            'delta.minReaderVersion' = '2',
            'delta.minWriterVersion' = '5',
            'delta.columnMapping.mode' = 'name',
            'quality' = 'silver'
        )
        COMMENT 'Silver layer table — cleaned, validated, deduplicated from Bronze'
    """)

    # Create watermark tracking table
    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {WATERMARK_TABLE} (
            table_name STRING NOT NULL,
            last_processed_timestamp TIMESTAMP,
            last_processed_id STRING,
            rows_processed BIGINT,
            updated_at TIMESTAMP
        )
        USING DELTA
    """)

    logger.info(f"Ensured Silver table exists: {TARGET_TABLE}")


def get_watermark(spark: SparkSession) -> Optional[str]:
    """Read the last-processed watermark for incremental loads."""
    try:
        if not spark.catalog.tableExists(WATERMARK_TABLE):
            return None

        result = spark.sql(f"""
            SELECT last_processed_timestamp
            FROM {WATERMARK_TABLE}
            WHERE table_name = '{TARGET_TABLE}'
            ORDER BY updated_at DESC
            LIMIT 1
        """).collect()

        if result:
            wm = str(result[0]["last_processed_timestamp"])
            logger.info(f"Watermark loaded: {wm}")
            return wm
        return None
    except Exception as e:
        logger.warning(f"Could not read watermark: {e}")
        return None


def update_watermark(spark: SparkSession, df: DataFrame, rows_processed: int):
    """Update the watermark after successful processing."""
    try:
        max_ts = df.agg(spark_max(col(TIMESTAMP_COL))).collect()[0][0]
        if max_ts is None:
            logger.warning("No timestamp found to update watermark")
            return

        spark.sql(f"""
            MERGE INTO {WATERMARK_TABLE} AS target
            USING (
                SELECT
                    '{TARGET_TABLE}' AS table_name,
                    TIMESTAMP '{max_ts}' AS last_processed_timestamp,
                    CAST(NULL AS STRING) AS last_processed_id,
                    CAST({rows_processed} AS BIGINT) AS rows_processed,
                    current_timestamp() AS updated_at
            ) AS source
            ON target.table_name = source.table_name
            WHEN MATCHED THEN UPDATE SET *
            WHEN NOT MATCHED THEN INSERT *
        """)

        logger.info(f"Watermark updated to {max_ts} ({rows_processed} rows)")
    except Exception as e:
        logger.error(f"Watermark update failed: {e}")


def read_incremental(spark: SparkSession, source_table: str) -> DataFrame:
    """Read only new/changed records from Bronze since last watermark."""
    watermark = get_watermark(spark)

    if watermark:
        logger.info(f"Incremental read from {source_table} — watermark: {watermark}")
        df = spark.table(source_table).filter(
            col(TIMESTAMP_COL) > lit(watermark)
        )
    else:
        logger.info(f"Full read from {source_table} — no watermark found (initial load)")
        df = spark.table(source_table)

    row_count = df.count()
    logger.info(f"Read {row_count} records from {source_table}")
    return df


def merge_into_silver(spark: SparkSession, source_df: DataFrame) -> Dict:
    """
    MERGE INTO Silver table using SCD Type 1 (overwrite on key match).
    New records are INSERTed, existing records are UPDATEd.
    """
    create_silver_table_if_not_exists(spark)

    source_count = source_df.count()
    if source_count == 0:
        logger.info("No records to merge — source DataFrame is empty")
        return {"inserted": 0, "updated": 0, "source_count": 0}

    # Prepare source with processing timestamp
    source_prepared = source_df.withColumn("_processing_timestamp", current_timestamp())

    try:
        target_table = DeltaTable.forName(spark, TARGET_TABLE)

        merge_result = (
            target_table.alias("target")
            .merge(
                source_prepared.alias("source"),
                "${mergeCondition}"
            )
            .whenMatchedUpdate(set={
${columns
  .filter((c) => !keyColumns.includes(c))
  .slice(0, 12)
  .map((c) => `                "${c}": col("source.${c}"),`)
  .join("\n")}
                "_processing_timestamp": current_timestamp(),
                "_dq_valid": col("source._dq_valid"),
            })
            .whenNotMatchedInsertAll()
            .execute()
        )

        # Count results from merge metrics
        history = spark.sql(f"""
            DESCRIBE HISTORY {TARGET_TABLE} LIMIT 1
        """).collect()

        metrics = {}
        if history:
            op_metrics = history[0]["operationMetrics"]
            if op_metrics:
                metrics = {
                    "inserted": int(op_metrics.get("numTargetRowsInserted", 0)),
                    "updated": int(op_metrics.get("numTargetRowsUpdated", 0)),
                    "source_count": source_count,
                }

        logger.info(
            f"MERGE complete — inserted: {metrics.get('inserted', '?')}, "
            f"updated: {metrics.get('updated', '?')}, source: {source_count}"
        )

        return metrics

    except Exception as e:
        logger.error(f"Delta MERGE failed: {e}")
        raise RuntimeError(f"Silver MERGE INTO failed: {e}") from e


def optimize_silver_table(spark: SparkSession):
    """Run OPTIMIZE with Z-ORDER and VACUUM on the Silver table."""
    try:
        z_order_cols = ", ".join(Z_ORDER_COLUMNS)
        logger.info(f"Running OPTIMIZE on {TARGET_TABLE} with Z-ORDER BY ({z_order_cols})")

        spark.sql(f"""
            OPTIMIZE {TARGET_TABLE}
            ZORDER BY ({z_order_cols})
        """)

        logger.info(f"Running VACUUM on {TARGET_TABLE} (retention: {VACUUM_RETENTION_HOURS}h)")
        spark.sql(f"""
            VACUUM {TARGET_TABLE}
            RETAIN {VACUUM_RETENTION_HOURS} HOURS
        """)

        logger.info("OPTIMIZE + VACUUM complete")

    except Exception as e:
        logger.error(f"OPTIMIZE/VACUUM failed: {e}")
`;

  return {
    id: "mod-incremental-processing",
    stage: "incremental-processing",
    title: "Delta Merge & Incremental Processing",
    description: "MERGE INTO SCD Type 1, watermark-based incremental reads, table creation with Unity Catalog, OPTIMIZE + VACUUM",
    code,
    lineCount: countLines(code),
    dependencies: ["delta.tables", "pyspark.sql.functions"],
    unityCatalogObjects: [
      `${catalog}.${schema}.${table}`,
      `${catalog}.${schema}._watermarks`,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Entry Point Orchestrator
// ═══════════════════════════════════════════════════════════════════════════════

function generateEntryPoint(
  catalog: string,
  schema: string,
  table: string,
  specResult: SilverSpecResult
): string {
  return `# ═══════════════════════════════════════════════════════════════════════════════
# Silver Pipeline Orchestrator — Entry Point
# Unity Catalog: ${catalog}.${schema}.${table}
#
# Execution Order:
#   1. Schema Validation   → enforce StructType, detect drift
#   2. Null Checks         → compute null rates, impute domain defaults
#   3. Type Standardization → cast types, normalize formats
#   4. Deduplication       → window-based ROW_NUMBER latest-wins
#   5. Data Quality Gate   → rule evaluation, circuit breaker, DQ score
#   6. Lookup Enrichment   → broadcast joins, temporal features
#   7. Audit Logging       → row-level lineage, pipeline metrics
#   8. Delta Merge         → MERGE INTO with SCD Type 1
#   9. OPTIMIZE + VACUUM   → Z-ORDER, compaction, retention cleanup
# ═══════════════════════════════════════════════════════════════════════════════

from pyspark.sql import SparkSession
import logging
import sys

# ── Module imports ───────────────────────────────────────────────────────────
from silver_config import config
from silver_schema_validation import validate_schema, enforce_not_null_constraints, detect_schema_drift
from silver_standardization import run_standardization
from silver_deduplication import deduplicate, compute_duplicate_stats
from silver_data_quality import evaluate_dq_rules, compute_dq_score, apply_dq_gate
from silver_lookup_enrichment import enrich_with_lookups, add_temporal_features
from silver_audit import AuditLogger, add_row_level_lineage, write_quarantine
from silver_incremental import (
    create_silver_table_if_not_exists,
    read_incremental,
    merge_into_silver,
    optimize_silver_table,
    update_watermark,
)

# ── Logging setup ───────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("silver.orchestrator")


def run_silver_pipeline(spark: SparkSession, full_refresh: bool = False):
    """
    Execute the full Silver layer pipeline.

    Args:
        spark: Active SparkSession with Unity Catalog configured
        full_refresh: If True, ignore watermark and reprocess all records
    """
    audit = AuditLogger(spark, pipeline_name="silver_${table}")
    all_quarantine = None

    try:
        logger.info("=" * 80)
        logger.info(f"SILVER PIPELINE START — run_id={audit.run_id}")
        logger.info(f"Target: {config.silver_table}")
        logger.info("=" * 80)

        # ── Step 0: Create tables ────────────────────────────────────────────
        create_silver_table_if_not_exists(spark)

        # ── Step 1: Read source (incremental or full) ────────────────────────
        if full_refresh:
            logger.info("FULL REFRESH mode — reading all records from Bronze")
            df = spark.table(config.bronze_table)
        else:
            df = read_incremental(spark, config.bronze_table)

        input_count = df.count()
        if input_count == 0:
            logger.info("No new records to process — pipeline complete")
            audit.log_stage("read", "SUCCESS", input_count=0, output_count=0)
            audit.flush()
            return

        logger.info(f"Read {input_count} records from Bronze")
        audit.log_stage("read", "SUCCESS", input_count=input_count, output_count=input_count)

        # ── Step 2: Schema Validation ────────────────────────────────────────
        logger.info("─── Stage 1: Schema Validation ───")
        drift_report = detect_schema_drift(df, spark)
        df_valid, df_schema_reject = validate_schema(df, spark)
        df_valid, df_null_reject = enforce_not_null_constraints(df_valid)

        schema_quarantine = df_schema_reject.unionByName(df_null_reject, allowMissingColumns=True)
        schema_q_count = schema_quarantine.count()

        audit.log_stage(
            "schema_validation", "SUCCESS",
            input_count=input_count,
            output_count=df_valid.count(),
            quarantine_count=schema_q_count,
            schema_drift=drift_report,
        )

        # ── Step 3: Null Checks & Type Standardization ──────────────────────
        logger.info("─── Stage 2: Null Checks & Type Standardization ───")
        df_standardized, null_rates = run_standardization(df_valid)

        audit.log_stage(
            "standardization", "SUCCESS",
            input_count=df_valid.count(),
            output_count=df_standardized.count(),
            null_rates=null_rates,
        )

        # ── Step 4: Deduplication ────────────────────────────────────────────
        logger.info("─── Stage 3: Deduplication ───")
        df_deduped, df_duplicates = deduplicate(df_standardized, strategy="latest")
        dup_count = df_duplicates.count()

        audit.log_stage(
            "deduplication", "SUCCESS",
            input_count=df_standardized.count(),
            output_count=df_deduped.count(),
            duplicate_count=dup_count,
        )

        # ── Step 5: Data Quality Gate ────────────────────────────────────────
        logger.info("─── Stage 4: Data Quality Gate ───")
        df_with_flags, rule_results = evaluate_dq_rules(df_deduped)
        dq_score = compute_dq_score(rule_results)
        df_passed, df_dq_quarantine = apply_dq_gate(df_with_flags, rule_results, spark)

        audit.log_stage(
            "data_quality", "SUCCESS",
            input_count=df_deduped.count(),
            output_count=df_passed.count(),
            quarantine_count=df_dq_quarantine.count(),
            dq_score=dq_score,
        )

        # ── Step 6: Lookup Enrichment ────────────────────────────────────────
        logger.info("─── Stage 5: Lookup Enrichment ───")
        df_enriched = enrich_with_lookups(df_passed, spark)
        df_enriched = add_temporal_features(df_enriched, config.timestamp_column)

        audit.log_stage(
            "lookup_enrichment", "SUCCESS",
            input_count=df_passed.count(),
            output_count=df_enriched.count(),
        )

        # ── Step 7: Row-level Lineage ────────────────────────────────────────
        logger.info("─── Stage 6: Audit Lineage ───")
        df_final = add_row_level_lineage(df_enriched)

        # ── Step 8: Delta MERGE ──────────────────────────────────────────────
        logger.info("─── Stage 7: Delta MERGE ───")
        merge_metrics = merge_into_silver(spark, df_final)

        audit.log_stage(
            "delta_merge", "SUCCESS",
            input_count=df_final.count(),
            output_count=merge_metrics.get("inserted", 0) + merge_metrics.get("updated", 0),
        )

        # ── Step 9: Write quarantine ─────────────────────────────────────────
        logger.info("─── Stage 8: Quarantine Flush ───")
        if schema_q_count > 0:
            write_quarantine(schema_quarantine, "schema_validation", spark)
        if dup_count > 0:
            write_quarantine(df_duplicates, "duplicate", spark)
        if df_dq_quarantine.count() > 0:
            write_quarantine(df_dq_quarantine, "dq_failure", spark)

        # ── Step 10: Update watermark ────────────────────────────────────────
        update_watermark(spark, df_final, df_final.count())

        # ── Step 11: OPTIMIZE + VACUUM ───────────────────────────────────────
        logger.info("─── Stage 9: OPTIMIZE + VACUUM ───")
        optimize_silver_table(spark)

        # ── Done ─────────────────────────────────────────────────────────────
        logger.info("=" * 80)
        logger.info(f"SILVER PIPELINE COMPLETE — run_id={audit.run_id}")
        logger.info(f"  Input:       {input_count}")
        logger.info(f"  Output:      {df_final.count()}")
        logger.info(f"  Quarantined: {schema_q_count + dup_count + df_dq_quarantine.count()}")
        logger.info(f"  DQ Score:    {dq_score}")
        logger.info(f"  Merged:      inserted={merge_metrics.get('inserted', 0)} updated={merge_metrics.get('updated', 0)}")
        logger.info("=" * 80)

    except RuntimeError as e:
        logger.critical(f"Pipeline HALTED: {e}")
        audit.log_stage("pipeline", "FAILED", error_message=str(e))
        raise

    except Exception as e:
        logger.error(f"Pipeline FAILED: {e}")
        audit.log_stage("pipeline", "FAILED", error_message=str(e))
        raise

    finally:
        audit.flush()


# ── Databricks notebook entry point ─────────────────────────────────────────

if __name__ == "__main__" or "__databricks__" in dir():
    spark = SparkSession.builder.getOrCreate()

    # Set Unity Catalog
    spark.sql(f"USE CATALOG ${catalog}")
    spark.sql(f"USE SCHEMA ${schema}")

    # Run pipeline
    full_refresh = dbutils.widgets.get("full_refresh", "false").lower() == "true"  # type: ignore
    run_silver_pipeline(spark, full_refresh=full_refresh)
`;
}
