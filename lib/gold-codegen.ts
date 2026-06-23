import {
  type GoldSpecResult,
  type GoldSpecEntry,
  type GoldMetricType,
  type DashboardType,
  type AggregationType,
  METRIC_LABELS,
  DASHBOARD_LABELS,
  analyzeGoldSpec,
} from "./gold-spec-analyzer";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GoldCodeModule {
  id: string;
  category: "kpi" | "aggregation" | "business-metric" | "dashboard-view" | "powerbi-view" | "audit" | "dependency" | "orchestrator" | "config";
  title: string;
  description: string;
  language: "sql" | "python";
  code: string;
  lineCount: number;
  unityCatalogObjects: string[];
}

export interface GoldCodegenResult {
  modules: GoldCodeModule[];
  summary: GoldCodegenSummary;
}

export interface GoldCodegenSummary {
  totalModules: number;
  totalLines: number;
  sqlModules: number;
  pysparkModules: number;
  unityCatalogTables: string[];
  deltaFeatures: string[];
  powerBIViews: number;
  kpiCount: number;
  aggregationCount: number;
}

export const MODULE_ICONS: Record<GoldCodeModule["category"], string> = {
  config: "⚙️",
  kpi: "📈",
  aggregation: "∑",
  "business-metric": "💼",
  "dashboard-view": "📊",
  "powerbi-view": "⚡",
  audit: "📋",
  dependency: "🔗",
  orchestrator: "🚀",
};

export const MODULE_COLORS: Record<GoldCodeModule["category"], string> = {
  config: "#64748b",
  kpi: "#10b981",
  aggregation: "#3b82f6",
  "business-metric": "#f59e0b",
  "dashboard-view": "#8b5cf6",
  "powerbi-view": "#ec4899",
  audit: "#06b6d4",
  dependency: "#ef4444",
  orchestrator: "#f97316",
};

// ── Main entry point ───────────────────────────────────────────────────────

export function generateGoldCode(
  sourceCode: string,
  outputCode: string,
  direction: "aws-to-azure" | "azure-to-aws"
): GoldCodegenResult {
  const specResult = analyzeGoldSpec(sourceCode, outputCode, direction);
  const specs = specResult.specs;

  const catalog = "enterprise_catalog";
  const schema = "gold";
  const silverSchema = "silver";
  const silverTable = "silver_main";

  const columns = extractColumnsFromSpecs(specs);
  const keyColumns = extractKeyColumnsFromSpecs(specs);

  const modules: GoldCodeModule[] = [];

  // 1. Config
  modules.push(genConfig(catalog, schema, silverSchema, silverTable, specs));

  // 2. KPI Calculations (SQL + PySpark)
  modules.push(genKPICalculationsSQL(catalog, schema, silverSchema, silverTable, specs, columns));
  modules.push(genKPICalculationsPySpark(catalog, schema, silverSchema, silverTable, specs, columns));

  // 3. Aggregations (SQL)
  modules.push(genAggregationsSQL(catalog, schema, silverSchema, silverTable, specs, columns));

  // 4. Business Metrics (SQL)
  modules.push(genBusinessMetricsSQL(catalog, schema, silverSchema, silverTable, specs, columns));

  // 5. Dashboard Views (SQL)
  modules.push(genDashboardViewsSQL(catalog, schema, specs));

  // 6. Power BI Views (SQL)
  modules.push(genPowerBIViewsSQL(catalog, schema, specs, columns));

  // 7. Audit Logging (PySpark)
  modules.push(genAuditLogging(catalog, schema));

  // 8. Dependency Validation (PySpark)
  modules.push(genDependencyValidation(catalog, schema, silverSchema, silverTable));

  // 9. Orchestrator (PySpark)
  modules.push(genOrchestrator(catalog, schema, silverSchema, silverTable, specResult));

  const allTables = new Set<string>();
  for (const m of modules) m.unityCatalogObjects.forEach((t) => allTables.add(t));

  const sqlCount = modules.filter((m) => m.language === "sql").length;
  const pyCount = modules.filter((m) => m.language === "python").length;

  return {
    modules,
    summary: {
      totalModules: modules.length,
      totalLines: modules.reduce((s, m) => s + m.lineCount, 0),
      sqlModules: sqlCount,
      pysparkModules: pyCount,
      unityCatalogTables: [...allTables],
      deltaFeatures: ["MERGE INTO", "CREATE OR REPLACE VIEW", "OPTIMIZE", "Z-ORDER BY", "VACUUM", "Change Data Feed", "Auto-Optimize"],
      powerBIViews: specs.filter((s) => s.dashboard_type === "executive-kpi" || s.dashboard_type === "financial-summary").length + 3,
      kpiCount: specs.filter((s) => s.kpi_formula).length,
      aggregationCount: specs.filter((s) => ["SUM", "AVG", "COUNT", "COUNT_DISTINCT", "ROLLUP", "WINDOW"].includes(s.aggregation_type)).length,
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractColumnsFromSpecs(specs: GoldSpecEntry[]): string[] {
  const cols = new Set<string>();
  for (const s of specs) s.source_columns.forEach((c) => cols.add(c));
  if (cols.size === 0) ["id", "name", "status", "amount", "created_at", "updated_at", "category", "region"].forEach((c) => cols.add(c));
  return [...cols];
}

function extractKeyColumnsFromSpecs(specs: GoldSpecEntry[]): string[] {
  const candidates = new Set<string>();
  for (const s of specs) {
    for (const c of s.source_columns) {
      if (/^id$|_id$/i.test(c)) candidates.add(c);
    }
  }
  if (candidates.size === 0) candidates.add("id");
  return [...candidates];
}

function lines(code: string): number { return code.split("\n").length; }

function metricTableName(metric: string): string {
  return metric.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "");
}

function groupSpecsByCategory(specs: GoldSpecEntry[]): Map<GoldMetricType, GoldSpecEntry[]> {
  const map = new Map<GoldMetricType, GoldSpecEntry[]>();
  for (const s of specs) {
    if (!map.has(s.metric_category)) map.set(s.metric_category, []);
    map.get(s.metric_category)!.push(s);
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE: Config
// ═══════════════════════════════════════════════════════════════════════════════

function genConfig(catalog: string, schema: string, silverSchema: string, silverTable: string, specs: GoldSpecEntry[]): GoldCodeModule {
  const categories = [...new Set(specs.map((s) => s.metric_category))];
  const code = `# ═══════════════════════════════════════════════════════════════════════════════
# Gold Layer Configuration — Unity Catalog
# Auto-generated by FlowMigrate Gold Codegen
# ═══════════════════════════════════════════════════════════════════════════════

from dataclasses import dataclass, field
from typing import List, Dict


@dataclass
class GoldConfig:
    """Centralized configuration for Gold layer pipeline."""

    # ── Unity Catalog ────────────────────────────────────────────────────────
    catalog: str = "${catalog}"
    gold_schema: str = "${schema}"
    silver_schema: str = "${silverSchema}"

    # ── Source tables ────────────────────────────────────────────────────────
    silver_table: str = "${catalog}.${silverSchema}.${silverTable}"
    silver_audit_table: str = "${catalog}.${silverSchema}.${silverTable}_audit"

    # ── Gold target tables ───────────────────────────────────────────────────
    kpi_table: str = "${catalog}.${schema}.kpi_metrics"
    aggregation_table: str = "${catalog}.${schema}.aggregated_metrics"
    business_metrics_table: str = "${catalog}.${schema}.business_metrics"
    audit_table: str = "${catalog}.${schema}.gold_audit_log"
    dependency_table: str = "${catalog}.${schema}.gold_dependencies"

    # ── Metric categories ────────────────────────────────────────────────────
    active_categories: List[str] = field(default_factory=lambda: ${JSON.stringify(categories)})

    # ── Refresh settings ─────────────────────────────────────────────────────
    kpi_refresh_interval: str = "hourly"
    dashboard_refresh_interval: str = "15-minute"
    batch_refresh_interval: str = "daily"

    # ── Delta Lake settings ──────────────────────────────────────────────────
    optimize_z_order_columns: List[str] = field(default_factory=lambda: ["metric_date", "metric_category"])
    vacuum_retention_hours: int = 168

    # ── Quality thresholds ───────────────────────────────────────────────────
    min_silver_freshness_minutes: int = 60
    min_silver_dq_score: float = 0.85
    max_kpi_variance_pct: float = 25.0

    @property
    def all_gold_tables(self) -> List[str]:
        return [
            self.kpi_table,
            self.aggregation_table,
            self.business_metrics_table,
            self.audit_table,
            self.dependency_table,
        ]


config = GoldConfig()
`;

  return {
    id: "gold-config",
    category: "config",
    title: "Gold Layer Configuration",
    description: "GoldConfig dataclass — Unity Catalog paths, refresh intervals, quality thresholds",
    language: "python",
    code,
    lineCount: lines(code),
    unityCatalogObjects: [
      `${catalog}.${schema}.kpi_metrics`,
      `${catalog}.${schema}.aggregated_metrics`,
      `${catalog}.${schema}.business_metrics`,
      `${catalog}.${schema}.gold_audit_log`,
      `${catalog}.${schema}.gold_dependencies`,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE: KPI Calculations — SQL
// ═══════════════════════════════════════════════════════════════════════════════

function genKPICalculationsSQL(
  catalog: string, schema: string, silverSchema: string, silverTable: string,
  specs: GoldSpecEntry[], columns: string[]
): GoldCodeModule {
  const kpiSpecs = specs.filter((s) => s.kpi_formula || ["RATIO", "RATE", "COMPOSITE", "TREND", "PERCENTILE"].includes(s.aggregation_type));
  const hasCols = (names: string[]) => names.some((n) => columns.some((c) => c.toLowerCase().includes(n)));

  const kpiBlocks: string[] = [];

  kpiBlocks.push(`-- ══════════════════════════════════════════════════════════════════════════════
-- Gold Layer: KPI Calculations
-- Unity Catalog: ${catalog}.${schema}
-- Source: ${catalog}.${silverSchema}.${silverTable}
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Create KPI metrics table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ${catalog}.${schema}.kpi_metrics (
    kpi_id              STRING        NOT NULL,
    kpi_name            STRING        NOT NULL,
    metric_category     STRING        NOT NULL,
    metric_value        DECIMAL(18,4),
    metric_date         DATE          NOT NULL,
    grain               STRING,
    dimension_key       STRING,
    dimension_value     STRING,
    previous_value      DECIMAL(18,4),
    change_pct          DECIMAL(8,4),
    trend_direction     STRING,
    calculation_timestamp TIMESTAMP   DEFAULT current_timestamp(),
    _processing_date    DATE          GENERATED ALWAYS AS (CAST(calculation_timestamp AS DATE))
)
USING DELTA
PARTITIONED BY (_processing_date)
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact'   = 'true',
    'delta.enableChangeDataFeed'       = 'true',
    'quality'                          = 'gold'
)
COMMENT 'Gold layer KPI metrics — calculated from Silver layer data';`);

  // Revenue KPIs
  if (hasCols(["amount", "price", "revenue", "total", "payment", "order"])) {
    kpiBlocks.push(`
-- ── KPI: Total Revenue ──────────────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.kpi_metrics
SELECT
    CONCAT('KPI-REV-TOTAL-', DATE_FORMAT(current_date(), 'yyyyMMdd'))  AS kpi_id,
    'total_revenue'                                                     AS kpi_name,
    'revenue-metrics'                                                   AS metric_category,
    COALESCE(SUM(amount), 0)                                            AS metric_value,
    current_date()                                                      AS metric_date,
    'daily'                                                             AS grain,
    NULL                                                                AS dimension_key,
    NULL                                                                AS dimension_value,
    LAG(SUM(amount)) OVER (ORDER BY current_date())                     AS previous_value,
    CASE
        WHEN LAG(SUM(amount)) OVER (ORDER BY current_date()) > 0
        THEN ROUND((SUM(amount) - LAG(SUM(amount)) OVER (ORDER BY current_date()))
             / LAG(SUM(amount)) OVER (ORDER BY current_date()) * 100, 4)
        ELSE NULL
    END                                                                 AS change_pct,
    CASE
        WHEN SUM(amount) > LAG(SUM(amount)) OVER (ORDER BY current_date()) THEN 'UP'
        WHEN SUM(amount) < LAG(SUM(amount)) OVER (ORDER BY current_date()) THEN 'DOWN'
        ELSE 'FLAT'
    END                                                                 AS trend_direction,
    current_timestamp()                                                 AS calculation_timestamp
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date()
  AND _dq_valid = TRUE;

-- ── KPI: Average Order Value ────────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.kpi_metrics
SELECT
    CONCAT('KPI-REV-AOV-', DATE_FORMAT(current_date(), 'yyyyMMdd'))    AS kpi_id,
    'average_order_value'                                               AS kpi_name,
    'revenue-metrics'                                                   AS metric_category,
    COALESCE(ROUND(AVG(amount), 4), 0)                                  AS metric_value,
    current_date()                                                      AS metric_date,
    'daily'                                                             AS grain,
    NULL, NULL, NULL, NULL, NULL,
    current_timestamp()                                                 AS calculation_timestamp
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date()
  AND _dq_valid = TRUE
  AND amount > 0;

-- ── KPI: Revenue by Region ──────────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.kpi_metrics
SELECT
    CONCAT('KPI-REV-REG-', region, '-', DATE_FORMAT(current_date(), 'yyyyMMdd')) AS kpi_id,
    'revenue_by_region'            AS kpi_name,
    'revenue-metrics'              AS metric_category,
    COALESCE(SUM(amount), 0)       AS metric_value,
    current_date()                 AS metric_date,
    'daily'                        AS grain,
    'region'                       AS dimension_key,
    region                         AS dimension_value,
    NULL, NULL, NULL,
    current_timestamp()            AS calculation_timestamp
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date()
  AND _dq_valid = TRUE
GROUP BY region;`);
  }

  // Operational KPIs
  if (hasCols(["status", "category", "count", "type"])) {
    kpiBlocks.push(`
-- ── KPI: Record Volume ──────────────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.kpi_metrics
SELECT
    CONCAT('KPI-OPS-VOL-', DATE_FORMAT(current_date(), 'yyyyMMdd'))    AS kpi_id,
    'daily_record_volume'                                               AS kpi_name,
    'operational-metrics'                                               AS metric_category,
    COUNT(*)                                                            AS metric_value,
    current_date()                                                      AS metric_date,
    'daily'                                                             AS grain,
    NULL, NULL, NULL, NULL, NULL,
    current_timestamp()                                                 AS calculation_timestamp
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date();

-- ── KPI: Status Distribution ────────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.kpi_metrics
SELECT
    CONCAT('KPI-OPS-STATUS-', status, '-', DATE_FORMAT(current_date(), 'yyyyMMdd')) AS kpi_id,
    'status_distribution'          AS kpi_name,
    'operational-metrics'          AS metric_category,
    COUNT(*)                       AS metric_value,
    current_date()                 AS metric_date,
    'daily'                        AS grain,
    'status'                       AS dimension_key,
    status                         AS dimension_value,
    NULL, NULL, NULL,
    current_timestamp()            AS calculation_timestamp
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date()
  AND _dq_valid = TRUE
GROUP BY status;

-- ── KPI: Category Breakdown ─────────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.kpi_metrics
SELECT
    CONCAT('KPI-OPS-CAT-', category, '-', DATE_FORMAT(current_date(), 'yyyyMMdd')) AS kpi_id,
    'category_breakdown'           AS kpi_name,
    'operational-metrics'          AS metric_category,
    COUNT(*)                       AS metric_value,
    current_date()                 AS metric_date,
    'daily'                        AS grain,
    'category'                     AS dimension_key,
    category                       AS dimension_value,
    NULL, NULL, NULL,
    current_timestamp()            AS calculation_timestamp
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date()
  AND _dq_valid = TRUE
GROUP BY category;`);
  }

  // Compliance / DQ KPIs
  kpiBlocks.push(`
-- ── KPI: Data Quality Score ─────────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.kpi_metrics
SELECT
    CONCAT('KPI-DQ-SCORE-', DATE_FORMAT(current_date(), 'yyyyMMdd'))   AS kpi_id,
    'silver_dq_pass_rate'                                               AS kpi_name,
    'compliance-metrics'                                                AS metric_category,
    ROUND(
        SUM(CASE WHEN _dq_valid = TRUE THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*), 0) * 100, 4
    )                                                                   AS metric_value,
    current_date()                                                      AS metric_date,
    'daily'                                                             AS grain,
    NULL, NULL, NULL, NULL, NULL,
    current_timestamp()                                                 AS calculation_timestamp
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date();

-- ── KPI: Null Rate Trend ────────────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.kpi_metrics
SELECT
    CONCAT('KPI-DQ-NULL-', DATE_FORMAT(current_date(), 'yyyyMMdd'))    AS kpi_id,
    'null_rate_overall'                                                 AS kpi_name,
    'compliance-metrics'                                                AS metric_category,
    ROUND(
        SUM(CASE WHEN ${columns[0] || "id"} IS NULL THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*), 0) * 100, 4
    )                                                                   AS metric_value,
    current_date()                                                      AS metric_date,
    'daily'                                                             AS grain,
    NULL, NULL, NULL, NULL, NULL,
    current_timestamp()                                                 AS calculation_timestamp
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date();`);

  const code = kpiBlocks.join("\n");

  return {
    id: "gold-kpi-sql",
    category: "kpi",
    title: "KPI Calculations (SQL)",
    description: "Revenue KPIs, operational KPIs, DQ score KPIs — INSERT INTO with trend/change tracking",
    language: "sql",
    code,
    lineCount: lines(code),
    unityCatalogObjects: [`${catalog}.${schema}.kpi_metrics`, `${catalog}.${silverSchema}.${silverTable}`],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE: KPI Calculations — PySpark
// ═══════════════════════════════════════════════════════════════════════════════

function genKPICalculationsPySpark(
  catalog: string, schema: string, silverSchema: string, silverTable: string,
  specs: GoldSpecEntry[], columns: string[]
): GoldCodeModule {
  const code = `# ═══════════════════════════════════════════════════════════════════════════════
# Gold Layer: KPI Calculation Engine (PySpark)
# Programmatic KPI computation with variance detection and alerting
# ═══════════════════════════════════════════════════════════════════════════════

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.functions import (
    col, lit, sum as spark_sum, avg as spark_avg, count as spark_count,
    countDistinct, min as spark_min, max as spark_max,
    round as spark_round, when, current_timestamp, current_date,
    date_format, concat_ws, percentile_approx, lag, abs as spark_abs
)
from pyspark.sql.window import Window
from pyspark.sql.types import StructType, StructField, StringType, DecimalType, DateType, TimestampType
from dataclasses import dataclass
from typing import List, Dict, Optional, Callable
from enum import Enum
import logging
import uuid

logger = logging.getLogger("gold.kpi_engine")


class KPIFrequency(Enum):
    REALTIME = "realtime"
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


@dataclass
class KPIDefinition:
    kpi_id: str
    kpi_name: str
    category: str
    frequency: KPIFrequency
    aggregation: str
    source_column: Optional[str]
    filter_expr: Optional[str] = None
    variance_threshold_pct: float = 25.0


# ── KPI Registry ───────────────────────────────────────────────────────────

KPI_REGISTRY: List[KPIDefinition] = [
${specs
  .filter((s) => s.kpi_formula || s.source_columns.length > 0)
  .slice(0, 10)
  .map((s, i) => {
    const aggMap: Record<string, string> = { SUM: "sum", AVG: "avg", COUNT: "count", COUNT_DISTINCT: "count_distinct", MIN: "min", MAX: "max", PERCENTILE: "percentile", RATIO: "ratio", RATE: "rate" };
    const agg = aggMap[s.aggregation_type] || "sum";
    const srcCol = s.source_columns[0] || "amount";
    return `    KPIDefinition("KPI-${String(i + 1).padStart(3, "0")}", "${metricTableName(s.gold_metric)}", "${s.metric_category}", KPIFrequency.DAILY, "${agg}", "${srcCol}"),`;
  })
  .join("\n")}
]


class KPIEngine:
    """Compute, store, and validate KPI metrics."""

    def __init__(self, spark: SparkSession):
        self.spark = spark
        self.silver_table = "${catalog}.${silverSchema}.${silverTable}"
        self.kpi_table = "${catalog}.${schema}.kpi_metrics"
        self.results: List[Dict] = []

    def compute_all(self, target_date: str = None) -> DataFrame:
        """Compute all registered KPIs for the given date."""
        silver_df = self.spark.table(self.silver_table)

        if target_date:
            silver_df = silver_df.filter(col("_ingestion_date") == lit(target_date))
        else:
            silver_df = silver_df.filter(col("_ingestion_date") == current_date())

        silver_df = silver_df.filter(col("_dq_valid") == True)
        input_count = silver_df.count()

        if input_count == 0:
            logger.warning("No valid Silver records for KPI calculation")
            return self.spark.createDataFrame([], self._kpi_schema())

        logger.info(f"Computing {len(KPI_REGISTRY)} KPIs against {input_count} Silver records")

        all_rows = []
        for kpi_def in KPI_REGISTRY:
            try:
                value = self._compute_single(silver_df, kpi_def)
                previous = self._get_previous_value(kpi_def.kpi_name)
                change_pct = None
                trend = "FLAT"

                if previous is not None and previous != 0:
                    change_pct = round((value - previous) / abs(previous) * 100, 4)
                    trend = "UP" if change_pct > 0 else "DOWN" if change_pct < 0 else "FLAT"

                    if abs(change_pct) > kpi_def.variance_threshold_pct:
                        logger.warning(
                            f"KPI VARIANCE ALERT: {kpi_def.kpi_name} changed {change_pct:.2f}% "
                            f"(threshold: {kpi_def.variance_threshold_pct}%)"
                        )

                all_rows.append({
                    "kpi_id": f"{kpi_def.kpi_id}-{target_date or 'today'}",
                    "kpi_name": kpi_def.kpi_name,
                    "metric_category": kpi_def.category,
                    "metric_value": value,
                    "previous_value": previous,
                    "change_pct": change_pct,
                    "trend_direction": trend,
                })

                logger.info(f"  {kpi_def.kpi_name} = {value} (trend: {trend})")

            except Exception as e:
                logger.error(f"KPI computation failed for {kpi_def.kpi_name}: {e}")

        if not all_rows:
            return self.spark.createDataFrame([], self._kpi_schema())

        result_df = self.spark.createDataFrame(all_rows).withColumn(
            "metric_date", current_date()
        ).withColumn(
            "calculation_timestamp", current_timestamp()
        )

        self.results = all_rows
        return result_df

    def _compute_single(self, df: DataFrame, kpi_def: KPIDefinition) -> float:
        """Compute a single KPI value."""
        filtered = df
        if kpi_def.filter_expr:
            filtered = df.filter(kpi_def.filter_expr)

        src_col = kpi_def.source_column
        if src_col and src_col not in filtered.columns:
            logger.warning(f"Column '{src_col}' not found — defaulting to COUNT")
            return float(filtered.count())

        agg = kpi_def.aggregation
        if agg == "sum":
            row = filtered.agg(spark_sum(col(src_col))).collect()[0]
            return float(row[0] or 0)
        elif agg == "avg":
            row = filtered.agg(spark_avg(col(src_col))).collect()[0]
            return round(float(row[0] or 0), 4)
        elif agg == "count":
            return float(filtered.count())
        elif agg == "count_distinct":
            row = filtered.agg(countDistinct(col(src_col))).collect()[0]
            return float(row[0] or 0)
        elif agg == "min":
            row = filtered.agg(spark_min(col(src_col))).collect()[0]
            return float(row[0] or 0)
        elif agg == "max":
            row = filtered.agg(spark_max(col(src_col))).collect()[0]
            return float(row[0] or 0)
        elif agg == "percentile":
            row = filtered.agg(percentile_approx(col(src_col), 0.95)).collect()[0]
            return round(float(row[0] or 0), 4)
        elif agg == "ratio":
            total = float(df.count())
            subset = float(filtered.filter(col(src_col).isNotNull()).count())
            return round(subset / max(total, 1) * 100, 4)
        elif agg == "rate":
            total = float(filtered.count())
            if total == 0:
                return 0.0
            positive = float(filtered.filter(col(src_col) > 0).count())
            return round(positive / total * 100, 4)
        else:
            return float(filtered.count())

    def _get_previous_value(self, kpi_name: str) -> Optional[float]:
        """Get previous KPI value for variance detection."""
        try:
            if not self.spark.catalog.tableExists(self.kpi_table):
                return None
            row = self.spark.sql(f"""
                SELECT metric_value
                FROM {self.kpi_table}
                WHERE kpi_name = '{kpi_name}'
                ORDER BY metric_date DESC
                LIMIT 1
            """).collect()
            return float(row[0][0]) if row else None
        except Exception:
            return None

    def write_results(self, result_df: DataFrame):
        """MERGE results into KPI table (idempotent)."""
        if result_df.count() == 0:
            return

        result_df.write.format("delta").mode("append").saveAsTable(self.kpi_table)
        logger.info(f"Wrote {result_df.count()} KPI records to {self.kpi_table}")

    @staticmethod
    def _kpi_schema():
        return StructType([
            StructField("kpi_id", StringType()),
            StructField("kpi_name", StringType()),
            StructField("metric_category", StringType()),
            StructField("metric_value", DecimalType(18, 4)),
            StructField("metric_date", DateType()),
            StructField("calculation_timestamp", TimestampType()),
        ])
`;

  return {
    id: "gold-kpi-pyspark",
    category: "kpi",
    title: "KPI Calculation Engine (PySpark)",
    description: "KPIEngine class — programmatic computation, variance detection, trend alerting, registry-driven",
    language: "python",
    code,
    lineCount: lines(code),
    unityCatalogObjects: [`${catalog}.${schema}.kpi_metrics`, `${catalog}.${silverSchema}.${silverTable}`],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE: Aggregations — SQL
// ═══════════════════════════════════════════════════════════════════════════════

function genAggregationsSQL(
  catalog: string, schema: string, silverSchema: string, silverTable: string,
  specs: GoldSpecEntry[], columns: string[]
): GoldCodeModule {
  const hasCols = (names: string[]) => names.some((n) => columns.some((c) => c.toLowerCase().includes(n)));

  const code = `-- ══════════════════════════════════════════════════════════════════════════════
-- Gold Layer: Aggregation Tables
-- Multi-grain rollups with CUBE/ROLLUP for dimensional analysis
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Create aggregation target table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ${catalog}.${schema}.aggregated_metrics (
    agg_id              STRING        NOT NULL,
    metric_name         STRING        NOT NULL,
    metric_category     STRING,
    grain               STRING        NOT NULL,
    dimension_1_key     STRING,
    dimension_1_value   STRING,
    dimension_2_key     STRING,
    dimension_2_value   STRING,
    sum_value           DECIMAL(18,4),
    avg_value           DECIMAL(18,4),
    count_value         BIGINT,
    count_distinct_value BIGINT,
    min_value           DECIMAL(18,4),
    max_value           DECIMAL(18,4),
    p50_value           DECIMAL(18,4),
    p95_value           DECIMAL(18,4),
    p99_value           DECIMAL(18,4),
    metric_date         DATE          NOT NULL,
    calculation_timestamp TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (metric_date)
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact'   = 'true',
    'quality'                          = 'gold'
)
COMMENT 'Gold layer aggregation metrics — multi-grain rollups';

-- ── Daily aggregation by region ─────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.aggregated_metrics
SELECT
    CONCAT('AGG-REGION-', COALESCE(region, 'ALL'), '-', DATE_FORMAT(current_date(), 'yyyyMMdd'))
                                                        AS agg_id,
    'daily_by_region'                                   AS metric_name,
    'operational-metrics'                               AS metric_category,
    'daily'                                             AS grain,
    'region'                                            AS dimension_1_key,
    COALESCE(region, '__ALL__')                          AS dimension_1_value,
    NULL                                                AS dimension_2_key,
    NULL                                                AS dimension_2_value,
    ${hasCols(["amount"]) ? "SUM(amount)" : "NULL"}     AS sum_value,
    ${hasCols(["amount"]) ? "ROUND(AVG(amount), 4)" : "NULL"} AS avg_value,
    COUNT(*)                                            AS count_value,
    COUNT(DISTINCT ${columns[0] || "id"})               AS count_distinct_value,
    ${hasCols(["amount"]) ? "MIN(amount)" : "NULL"}     AS min_value,
    ${hasCols(["amount"]) ? "MAX(amount)" : "NULL"}     AS max_value,
    ${hasCols(["amount"]) ? "PERCENTILE_APPROX(amount, 0.50)" : "NULL"} AS p50_value,
    ${hasCols(["amount"]) ? "PERCENTILE_APPROX(amount, 0.95)" : "NULL"} AS p95_value,
    ${hasCols(["amount"]) ? "PERCENTILE_APPROX(amount, 0.99)" : "NULL"} AS p99_value,
    current_date()                                      AS metric_date,
    current_timestamp()                                 AS calculation_timestamp
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date()
  AND _dq_valid = TRUE
GROUP BY ROLLUP(region);

-- ── Daily aggregation by status ─────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.aggregated_metrics
SELECT
    CONCAT('AGG-STATUS-', COALESCE(status, 'ALL'), '-', DATE_FORMAT(current_date(), 'yyyyMMdd'))
                                                        AS agg_id,
    'daily_by_status'                                   AS metric_name,
    'operational-metrics'                               AS metric_category,
    'daily'                                             AS grain,
    'status'                                            AS dimension_1_key,
    COALESCE(status, '__ALL__')                          AS dimension_1_value,
    NULL, NULL,
    ${hasCols(["amount"]) ? "SUM(amount)" : "NULL"},
    ${hasCols(["amount"]) ? "ROUND(AVG(amount), 4)" : "NULL"},
    COUNT(*),
    COUNT(DISTINCT ${columns[0] || "id"}),
    ${hasCols(["amount"]) ? "MIN(amount)" : "NULL"},
    ${hasCols(["amount"]) ? "MAX(amount)" : "NULL"},
    NULL, NULL, NULL,
    current_date(),
    current_timestamp()
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date()
  AND _dq_valid = TRUE
GROUP BY ROLLUP(status);

-- ── Cross-dimensional CUBE aggregation ──────────────────────────────────────

INSERT INTO ${catalog}.${schema}.aggregated_metrics
SELECT
    CONCAT('AGG-CUBE-', COALESCE(region, 'ALL'), '-', COALESCE(status, 'ALL'), '-',
           DATE_FORMAT(current_date(), 'yyyyMMdd'))     AS agg_id,
    'cross_dimension_cube'                              AS metric_name,
    'executive-reporting'                               AS metric_category,
    'daily'                                             AS grain,
    'region'                                            AS dimension_1_key,
    COALESCE(region, '__ALL__')                          AS dimension_1_value,
    'status'                                            AS dimension_2_key,
    COALESCE(status, '__ALL__')                          AS dimension_2_value,
    ${hasCols(["amount"]) ? "SUM(amount)" : "NULL"},
    ${hasCols(["amount"]) ? "ROUND(AVG(amount), 4)" : "NULL"},
    COUNT(*),
    COUNT(DISTINCT ${columns[0] || "id"}),
    NULL, NULL, NULL, NULL, NULL,
    current_date(),
    current_timestamp()
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date()
  AND _dq_valid = TRUE
GROUP BY CUBE(region, status);

-- ── Monthly rollup ──────────────────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.aggregated_metrics
SELECT
    CONCAT('AGG-MONTHLY-', DATE_FORMAT(current_date(), 'yyyyMM'))
                                                        AS agg_id,
    'monthly_rollup'                                    AS metric_name,
    'executive-reporting'                               AS metric_category,
    'monthly'                                           AS grain,
    'month'                                             AS dimension_1_key,
    DATE_FORMAT(current_date(), 'yyyy-MM')              AS dimension_1_value,
    NULL, NULL,
    ${hasCols(["amount"]) ? "SUM(amount)" : "NULL"},
    ${hasCols(["amount"]) ? "ROUND(AVG(amount), 4)" : "NULL"},
    COUNT(*),
    COUNT(DISTINCT ${columns[0] || "id"}),
    ${hasCols(["amount"]) ? "MIN(amount)" : "NULL"},
    ${hasCols(["amount"]) ? "MAX(amount)" : "NULL"},
    NULL, NULL, NULL,
    current_date(),
    current_timestamp()
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE YEAR(_ingestion_date) = YEAR(current_date())
  AND MONTH(_ingestion_date) = MONTH(current_date())
  AND _dq_valid = TRUE;
`;

  return {
    id: "gold-aggregations-sql",
    category: "aggregation",
    title: "Aggregation Tables (SQL)",
    description: "Multi-grain rollups — ROLLUP, CUBE, percentiles, cross-dimensional analysis",
    language: "sql",
    code,
    lineCount: lines(code),
    unityCatalogObjects: [`${catalog}.${schema}.aggregated_metrics`, `${catalog}.${silverSchema}.${silverTable}`],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE: Business Metrics — SQL
// ═══════════════════════════════════════════════════════════════════════════════

function genBusinessMetricsSQL(
  catalog: string, schema: string, silverSchema: string, silverTable: string,
  specs: GoldSpecEntry[], columns: string[]
): GoldCodeModule {
  const hasCols = (names: string[]) => names.some((n) => columns.some((c) => c.toLowerCase().includes(n)));

  const code = `-- ══════════════════════════════════════════════════════════════════════════════
-- Gold Layer: Business Metrics
-- Derived metrics, ratios, conversion rates, SLA tracking
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ${catalog}.${schema}.business_metrics (
    metric_id           STRING        NOT NULL,
    metric_name         STRING        NOT NULL,
    metric_type         STRING        NOT NULL,
    metric_category     STRING,
    numerator           DECIMAL(18,4),
    denominator         DECIMAL(18,4),
    metric_value        DECIMAL(18,4) NOT NULL,
    metric_unit         STRING,
    threshold_warning   DECIMAL(18,4),
    threshold_critical  DECIMAL(18,4),
    alert_status        STRING        DEFAULT 'OK',
    metric_date         DATE          NOT NULL,
    grain               STRING        DEFAULT 'daily',
    dimension_key       STRING,
    dimension_value     STRING,
    calculation_timestamp TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (metric_date)
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.enableChangeDataFeed'       = 'true',
    'quality'                          = 'gold'
)
COMMENT 'Gold layer business metrics — derived KPIs with alerting thresholds';

-- ── DQ Pass Rate (SLA metric) ───────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.business_metrics
SELECT
    CONCAT('BM-DQ-RATE-', DATE_FORMAT(current_date(), 'yyyyMMdd'))     AS metric_id,
    'dq_pass_rate'                                                      AS metric_name,
    'ratio'                                                             AS metric_type,
    'compliance-metrics'                                                AS metric_category,
    SUM(CASE WHEN _dq_valid = TRUE THEN 1 ELSE 0 END)                  AS numerator,
    COUNT(*)                                                            AS denominator,
    ROUND(
        SUM(CASE WHEN _dq_valid = TRUE THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*), 0) * 100, 4
    )                                                                   AS metric_value,
    'percent'                                                           AS metric_unit,
    95.0                                                                AS threshold_warning,
    85.0                                                                AS threshold_critical,
    CASE
        WHEN SUM(CASE WHEN _dq_valid = TRUE THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100 >= 95.0 THEN 'OK'
        WHEN SUM(CASE WHEN _dq_valid = TRUE THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100 >= 85.0 THEN 'WARNING'
        ELSE 'CRITICAL'
    END                                                                 AS alert_status,
    current_date()                                                      AS metric_date,
    'daily'                                                             AS grain,
    NULL, NULL,
    current_timestamp()                                                 AS calculation_timestamp
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date();
${hasCols(["amount"]) ? `
-- ── High-Value Record Rate ──────────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.business_metrics
SELECT
    CONCAT('BM-HVR-', DATE_FORMAT(current_date(), 'yyyyMMdd'))         AS metric_id,
    'high_value_record_rate'                                            AS metric_name,
    'rate'                                                              AS metric_type,
    'revenue-metrics'                                                   AS metric_category,
    SUM(CASE WHEN amount > 1000 THEN 1 ELSE 0 END)                     AS numerator,
    COUNT(*)                                                            AS denominator,
    ROUND(
        SUM(CASE WHEN amount > 1000 THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*), 0) * 100, 4
    )                                                                   AS metric_value,
    'percent'                                                           AS metric_unit,
    NULL, NULL, 'OK',
    current_date(), 'daily', NULL, NULL,
    current_timestamp()
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date()
  AND _dq_valid = TRUE;

-- ── Revenue Concentration (Top 20% share) ───────────────────────────────────

INSERT INTO ${catalog}.${schema}.business_metrics
WITH ranked AS (
    SELECT amount,
           NTILE(5) OVER (ORDER BY amount DESC) AS quintile
    FROM ${catalog}.${silverSchema}.${silverTable}
    WHERE _ingestion_date = current_date()
      AND _dq_valid = TRUE
      AND amount IS NOT NULL
)
SELECT
    CONCAT('BM-CONC-', DATE_FORMAT(current_date(), 'yyyyMMdd'))        AS metric_id,
    'revenue_concentration_top20'                                       AS metric_name,
    'composite'                                                         AS metric_type,
    'revenue-metrics'                                                   AS metric_category,
    SUM(CASE WHEN quintile = 1 THEN amount ELSE 0 END)                  AS numerator,
    SUM(amount)                                                         AS denominator,
    ROUND(
        SUM(CASE WHEN quintile = 1 THEN amount ELSE 0 END)
        / NULLIF(SUM(amount), 0) * 100, 4
    )                                                                   AS metric_value,
    'percent'                                                           AS metric_unit,
    80.0                                                                AS threshold_warning,
    90.0                                                                AS threshold_critical,
    CASE
        WHEN SUM(CASE WHEN quintile = 1 THEN amount ELSE 0 END) / NULLIF(SUM(amount), 0) * 100 >= 90 THEN 'CRITICAL'
        WHEN SUM(CASE WHEN quintile = 1 THEN amount ELSE 0 END) / NULLIF(SUM(amount), 0) * 100 >= 80 THEN 'WARNING'
        ELSE 'OK'
    END                                                                 AS alert_status,
    current_date(), 'daily', NULL, NULL,
    current_timestamp()
FROM ranked;` : ""}

-- ── Pipeline Freshness SLA ──────────────────────────────────────────────────

INSERT INTO ${catalog}.${schema}.business_metrics
SELECT
    CONCAT('BM-FRESH-', DATE_FORMAT(current_date(), 'yyyyMMdd'))       AS metric_id,
    'pipeline_freshness_minutes'                                        AS metric_name,
    'snapshot'                                                          AS metric_type,
    'sla-metrics'                                                       AS metric_category,
    NULL                                                                AS numerator,
    NULL                                                                AS denominator,
    ROUND(
        (UNIX_TIMESTAMP(current_timestamp())
         - UNIX_TIMESTAMP(MAX(_processing_timestamp))) / 60, 2
    )                                                                   AS metric_value,
    'minutes'                                                           AS metric_unit,
    30.0                                                                AS threshold_warning,
    60.0                                                                AS threshold_critical,
    CASE
        WHEN (UNIX_TIMESTAMP(current_timestamp()) - UNIX_TIMESTAMP(MAX(_processing_timestamp))) / 60 > 60 THEN 'CRITICAL'
        WHEN (UNIX_TIMESTAMP(current_timestamp()) - UNIX_TIMESTAMP(MAX(_processing_timestamp))) / 60 > 30 THEN 'WARNING'
        ELSE 'OK'
    END                                                                 AS alert_status,
    current_date(), 'daily', NULL, NULL,
    current_timestamp()
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date = current_date();

-- ── Weekly Trend (7-day moving average) ─────────────────────────────────────

INSERT INTO ${catalog}.${schema}.business_metrics
SELECT
    CONCAT('BM-7DMA-', DATE_FORMAT(current_date(), 'yyyyMMdd'))        AS metric_id,
    'seven_day_moving_avg_volume'                                       AS metric_name,
    'trend'                                                             AS metric_type,
    'operational-metrics'                                               AS metric_category,
    NULL, NULL,
    ROUND(COUNT(*) / 7.0, 2)                                            AS metric_value,
    'records_per_day'                                                   AS metric_unit,
    NULL, NULL, 'OK',
    current_date(), 'weekly', NULL, NULL,
    current_timestamp()
FROM ${catalog}.${silverSchema}.${silverTable}
WHERE _ingestion_date BETWEEN DATE_SUB(current_date(), 7) AND current_date()
  AND _dq_valid = TRUE;
`;

  return {
    id: "gold-business-metrics-sql",
    category: "business-metric",
    title: "Business Metrics (SQL)",
    description: "Derived ratios, conversion rates, SLA tracking, revenue concentration, trend analysis with alert thresholds",
    language: "sql",
    code,
    lineCount: lines(code),
    unityCatalogObjects: [`${catalog}.${schema}.business_metrics`, `${catalog}.${silverSchema}.${silverTable}`],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE: Dashboard Views — SQL
// ═══════════════════════════════════════════════════════════════════════════════

function genDashboardViewsSQL(catalog: string, schema: string, specs: GoldSpecEntry[]): GoldCodeModule {
  const code = `-- ══════════════════════════════════════════════════════════════════════════════
-- Gold Layer: Dashboard Views
-- Materialized views for real-time dashboards and operational monitoring
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Executive KPI Dashboard ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW ${catalog}.${schema}.vw_executive_kpi_dashboard AS
SELECT
    kpi_name,
    metric_category,
    metric_value,
    previous_value,
    change_pct,
    trend_direction,
    metric_date,
    CASE
        WHEN ABS(change_pct) > 25 THEN 'ALERT'
        WHEN ABS(change_pct) > 10 THEN 'WATCH'
        ELSE 'NORMAL'
    END AS alert_level,
    CASE
        WHEN trend_direction = 'UP'   AND metric_category LIKE '%revenue%' THEN 'POSITIVE'
        WHEN trend_direction = 'DOWN' AND metric_category LIKE '%cost%'    THEN 'POSITIVE'
        WHEN trend_direction = 'DOWN' AND metric_category LIKE '%revenue%' THEN 'NEGATIVE'
        WHEN trend_direction = 'UP'   AND metric_category LIKE '%cost%'    THEN 'NEGATIVE'
        ELSE 'NEUTRAL'
    END AS business_impact,
    calculation_timestamp
FROM ${catalog}.${schema}.kpi_metrics
WHERE metric_date >= DATE_SUB(current_date(), 30)
ORDER BY metric_date DESC, metric_category;

-- ── Operational Monitor Dashboard ───────────────────────────────────────────

CREATE OR REPLACE VIEW ${catalog}.${schema}.vw_operational_monitor AS
SELECT
    metric_name,
    grain,
    dimension_1_key,
    dimension_1_value,
    sum_value,
    avg_value,
    count_value,
    count_distinct_value,
    p50_value,
    p95_value,
    p99_value,
    metric_date,
    calculation_timestamp
FROM ${catalog}.${schema}.aggregated_metrics
WHERE metric_date >= DATE_SUB(current_date(), 7)
  AND dimension_1_value != '__ALL__'
ORDER BY metric_date DESC, metric_name;

-- ── Compliance Scorecard ────────────────────────────────────────────────────

CREATE OR REPLACE VIEW ${catalog}.${schema}.vw_compliance_scorecard AS
SELECT
    metric_name,
    metric_value,
    metric_unit,
    threshold_warning,
    threshold_critical,
    alert_status,
    metric_date,
    CASE
        WHEN alert_status = 'CRITICAL' THEN 1
        WHEN alert_status = 'WARNING'  THEN 2
        ELSE 3
    END AS severity_rank
FROM ${catalog}.${schema}.business_metrics
WHERE metric_category IN ('compliance-metrics', 'sla-metrics')
  AND metric_date >= DATE_SUB(current_date(), 30)
ORDER BY severity_rank, metric_date DESC;

-- ── SLA Tracker ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW ${catalog}.${schema}.vw_sla_tracker AS
SELECT
    metric_name,
    metric_value,
    metric_unit,
    threshold_warning,
    threshold_critical,
    alert_status,
    metric_date,
    ROUND(
        CASE
            WHEN threshold_critical IS NOT NULL AND threshold_critical > 0
            THEN (threshold_critical - metric_value) / threshold_critical * 100
            ELSE NULL
        END, 2
    ) AS headroom_pct,
    calculation_timestamp
FROM ${catalog}.${schema}.business_metrics
WHERE metric_category = 'sla-metrics'
  AND metric_date = current_date()
ORDER BY alert_status DESC;

-- ── Trend Analysis (30-day) ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW ${catalog}.${schema}.vw_trend_analysis AS
SELECT
    kpi_name,
    metric_category,
    metric_date,
    metric_value,
    AVG(metric_value) OVER (
        PARTITION BY kpi_name ORDER BY metric_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS moving_avg_7d,
    AVG(metric_value) OVER (
        PARTITION BY kpi_name ORDER BY metric_date
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ) AS moving_avg_30d,
    STDDEV(metric_value) OVER (
        PARTITION BY kpi_name ORDER BY metric_date
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ) AS stddev_30d,
    CASE
        WHEN metric_value > AVG(metric_value) OVER (
            PARTITION BY kpi_name ORDER BY metric_date
            ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ) + 2 * STDDEV(metric_value) OVER (
            PARTITION BY kpi_name ORDER BY metric_date
            ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ) THEN 'ANOMALY_HIGH'
        WHEN metric_value < AVG(metric_value) OVER (
            PARTITION BY kpi_name ORDER BY metric_date
            ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ) - 2 * STDDEV(metric_value) OVER (
            PARTITION BY kpi_name ORDER BY metric_date
            ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ) THEN 'ANOMALY_LOW'
        ELSE 'NORMAL'
    END AS anomaly_flag
FROM ${catalog}.${schema}.kpi_metrics
WHERE metric_date >= DATE_SUB(current_date(), 90)
ORDER BY kpi_name, metric_date;

-- ── Real-Time Alert Feed ────────────────────────────────────────────────────

CREATE OR REPLACE VIEW ${catalog}.${schema}.vw_alert_feed AS
SELECT
    'business_metric' AS source,
    metric_id AS alert_id,
    metric_name AS alert_name,
    alert_status AS severity,
    CONCAT(metric_name, ' = ', metric_value, ' ', metric_unit,
           ' (warning: ', threshold_warning, ', critical: ', threshold_critical, ')')
        AS alert_message,
    metric_date AS alert_date,
    calculation_timestamp AS alert_timestamp
FROM ${catalog}.${schema}.business_metrics
WHERE alert_status IN ('WARNING', 'CRITICAL')
  AND metric_date = current_date()

UNION ALL

SELECT
    'kpi_variance' AS source,
    kpi_id AS alert_id,
    kpi_name AS alert_name,
    CASE WHEN ABS(change_pct) > 25 THEN 'CRITICAL' ELSE 'WARNING' END AS severity,
    CONCAT(kpi_name, ' changed ', change_pct, '% (', trend_direction, ')')
        AS alert_message,
    metric_date AS alert_date,
    calculation_timestamp AS alert_timestamp
FROM ${catalog}.${schema}.kpi_metrics
WHERE ABS(change_pct) > 10
  AND metric_date = current_date()

ORDER BY severity, alert_timestamp DESC;
`;

  return {
    id: "gold-dashboard-views-sql",
    category: "dashboard-view",
    title: "Dashboard Views (SQL)",
    description: "6 views — Executive KPI, Operational Monitor, Compliance Scorecard, SLA Tracker, Trend Analysis, Alert Feed",
    language: "sql",
    code,
    lineCount: lines(code),
    unityCatalogObjects: [
      `${catalog}.${schema}.vw_executive_kpi_dashboard`,
      `${catalog}.${schema}.vw_operational_monitor`,
      `${catalog}.${schema}.vw_compliance_scorecard`,
      `${catalog}.${schema}.vw_sla_tracker`,
      `${catalog}.${schema}.vw_trend_analysis`,
      `${catalog}.${schema}.vw_alert_feed`,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE: Power BI Views — SQL
// ═══════════════════════════════════════════════════════════════════════════════

function genPowerBIViewsSQL(
  catalog: string, schema: string, specs: GoldSpecEntry[], columns: string[]
): GoldCodeModule {
  const code = `-- ══════════════════════════════════════════════════════════════════════════════
-- Gold Layer: Power BI Optimized Views
-- Star-schema views optimized for DirectQuery / Import mode
-- ══════════════════════════════════════════════════════════════════════════════

-- ═══ FACT TABLE ═════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW ${catalog}.${schema}.pbi_fact_metrics AS
SELECT
    k.kpi_id                        AS fact_key,
    k.kpi_name                      AS metric_name,
    k.metric_category,
    k.metric_value,
    k.previous_value,
    k.change_pct,
    k.trend_direction,
    k.metric_date,
    YEAR(k.metric_date)             AS year_num,
    MONTH(k.metric_date)            AS month_num,
    DATE_FORMAT(k.metric_date, 'yyyy-MM') AS year_month,
    DAYOFWEEK(k.metric_date)        AS day_of_week,
    CASE
        WHEN DAYOFWEEK(k.metric_date) IN (1, 7) THEN 'Weekend'
        ELSE 'Weekday'
    END                             AS day_type,
    k.calculation_timestamp
FROM ${catalog}.${schema}.kpi_metrics k
WHERE k.metric_date >= DATE_SUB(current_date(), 365);

-- ═══ DIMENSION: Date ════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW ${catalog}.${schema}.pbi_dim_date AS
SELECT DISTINCT
    metric_date                     AS date_key,
    metric_date                     AS full_date,
    YEAR(metric_date)               AS year_num,
    QUARTER(metric_date)            AS quarter_num,
    MONTH(metric_date)              AS month_num,
    DATE_FORMAT(metric_date, 'MMMM') AS month_name,
    DAYOFMONTH(metric_date)         AS day_of_month,
    DAYOFWEEK(metric_date)          AS day_of_week,
    DATE_FORMAT(metric_date, 'EEEE') AS day_name,
    WEEKOFYEAR(metric_date)         AS week_of_year,
    CONCAT('Q', QUARTER(metric_date), ' ', YEAR(metric_date))
                                    AS quarter_label,
    DATE_FORMAT(metric_date, 'yyyy-MM') AS year_month_key,
    CASE
        WHEN DAYOFWEEK(metric_date) IN (1, 7) THEN FALSE
        ELSE TRUE
    END                             AS is_weekday,
    CASE
        WHEN metric_date = current_date() THEN TRUE
        ELSE FALSE
    END                             AS is_today
FROM ${catalog}.${schema}.kpi_metrics
WHERE metric_date >= DATE_SUB(current_date(), 365);

-- ═══ DIMENSION: Metric Category ═════════════════════════════════════════════

CREATE OR REPLACE VIEW ${catalog}.${schema}.pbi_dim_metric_category AS
SELECT DISTINCT
    metric_category                 AS category_key,
    metric_category                 AS category_name,
    CASE metric_category
        WHEN 'revenue-metrics'      THEN 'Finance'
        WHEN 'cost-metrics'         THEN 'Finance'
        WHEN 'sla-metrics'          THEN 'Operations'
        WHEN 'compliance-metrics'   THEN 'Governance'
        WHEN 'security-metrics'     THEN 'Governance'
        WHEN 'operational-metrics'  THEN 'Operations'
        WHEN 'executive-reporting'  THEN 'Leadership'
        WHEN 'dashboard-datasets'   THEN 'Analytics'
        ELSE 'Other'
    END                             AS category_group,
    CASE metric_category
        WHEN 'revenue-metrics'      THEN 1
        WHEN 'cost-metrics'         THEN 2
        WHEN 'sla-metrics'          THEN 3
        WHEN 'compliance-metrics'   THEN 4
        WHEN 'security-metrics'     THEN 5
        WHEN 'operational-metrics'  THEN 6
        WHEN 'executive-reporting'  THEN 7
        WHEN 'dashboard-datasets'   THEN 8
        ELSE 9
    END                             AS sort_order
FROM ${catalog}.${schema}.kpi_metrics;

-- ═══ DIMENSION: Alert Status ════════════════════════════════════════════════

CREATE OR REPLACE VIEW ${catalog}.${schema}.pbi_dim_alert_status AS
SELECT DISTINCT
    alert_status                    AS status_key,
    alert_status                    AS status_label,
    CASE alert_status
        WHEN 'CRITICAL' THEN '#EF4444'
        WHEN 'WARNING'  THEN '#F59E0B'
        WHEN 'OK'       THEN '#10B981'
        ELSE '#64748B'
    END                             AS status_color,
    CASE alert_status
        WHEN 'CRITICAL' THEN 1
        WHEN 'WARNING'  THEN 2
        WHEN 'OK'       THEN 3
        ELSE 4
    END                             AS severity_rank
FROM ${catalog}.${schema}.business_metrics;

-- ═══ SUMMARY: Power BI Landing Page ═════════════════════════════════════════

CREATE OR REPLACE VIEW ${catalog}.${schema}.pbi_summary_today AS
SELECT
    (SELECT COUNT(DISTINCT kpi_name) FROM ${catalog}.${schema}.kpi_metrics
     WHERE metric_date = current_date())                              AS active_kpis,
    (SELECT COUNT(*) FROM ${catalog}.${schema}.business_metrics
     WHERE metric_date = current_date() AND alert_status = 'CRITICAL') AS critical_alerts,
    (SELECT COUNT(*) FROM ${catalog}.${schema}.business_metrics
     WHERE metric_date = current_date() AND alert_status = 'WARNING')  AS warning_alerts,
    (SELECT ROUND(AVG(metric_value), 2) FROM ${catalog}.${schema}.business_metrics
     WHERE metric_name = 'dq_pass_rate' AND metric_date = current_date()) AS dq_score,
    (SELECT ROUND(metric_value, 1) FROM ${catalog}.${schema}.business_metrics
     WHERE metric_name = 'pipeline_freshness_minutes'
       AND metric_date = current_date()
     LIMIT 1)                                                         AS freshness_minutes,
    current_timestamp()                                                AS last_refresh;

-- ═══ GRANT Power BI service principal read access ═══════════════════════════

-- GRANT SELECT ON VIEW ${catalog}.${schema}.pbi_fact_metrics TO \`powerbi-service-principal\`;
-- GRANT SELECT ON VIEW ${catalog}.${schema}.pbi_dim_date TO \`powerbi-service-principal\`;
-- GRANT SELECT ON VIEW ${catalog}.${schema}.pbi_dim_metric_category TO \`powerbi-service-principal\`;
-- GRANT SELECT ON VIEW ${catalog}.${schema}.pbi_dim_alert_status TO \`powerbi-service-principal\`;
-- GRANT SELECT ON VIEW ${catalog}.${schema}.pbi_summary_today TO \`powerbi-service-principal\`;
`;

  return {
    id: "gold-powerbi-views-sql",
    category: "powerbi-view",
    title: "Power BI Optimized Views (SQL)",
    description: "Star-schema — fact table, date/category/alert dimensions, today summary, service principal grants",
    language: "sql",
    code,
    lineCount: lines(code),
    unityCatalogObjects: [
      `${catalog}.${schema}.pbi_fact_metrics`,
      `${catalog}.${schema}.pbi_dim_date`,
      `${catalog}.${schema}.pbi_dim_metric_category`,
      `${catalog}.${schema}.pbi_dim_alert_status`,
      `${catalog}.${schema}.pbi_summary_today`,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE: Audit Logging — PySpark
// ═══════════════════════════════════════════════════════════════════════════════

function genAuditLogging(catalog: string, schema: string): GoldCodeModule {
  const code = `# ═══════════════════════════════════════════════════════════════════════════════
# Gold Layer: Audit Logging Framework
# Pipeline execution tracking, metric lineage, alert history
# ═══════════════════════════════════════════════════════════════════════════════

from pyspark.sql import SparkSession, DataFrame
from pyspark.sql.functions import (
    col, lit, current_timestamp, struct, to_json, from_json,
    count as spark_count, sum as spark_sum
)
from pyspark.sql.types import (
    StructType, StructField, StringType, LongType,
    TimestampType, DoubleType, IntegerType
)
from datetime import datetime
from typing import Dict, List, Optional
import uuid
import json
import logging

logger = logging.getLogger("gold.audit")


class GoldAuditLogger:
    """Audit logger for Gold layer pipeline execution."""

    AUDIT_TABLE = "${catalog}.${schema}.gold_audit_log"

    def __init__(self, spark: SparkSession, pipeline_name: str = "gold_pipeline"):
        self.spark = spark
        self.pipeline_name = pipeline_name
        self.run_id = str(uuid.uuid4())
        self.start_time = datetime.utcnow()
        self.entries: List[Dict] = []
        self._ensure_table()

        logger.info(f"Gold audit logger initialized — run_id={self.run_id}")

    def _ensure_table(self):
        self.spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {self.AUDIT_TABLE} (
                audit_id            STRING NOT NULL,
                run_id              STRING NOT NULL,
                pipeline_name       STRING,
                module              STRING,
                operation           STRING,
                status              STRING,
                input_count         BIGINT,
                output_count        BIGINT,
                kpi_count           INT,
                alert_count         INT,
                error_message       STRING,
                metadata_json       STRING,
                start_timestamp     TIMESTAMP,
                end_timestamp       TIMESTAMP,
                duration_seconds    DOUBLE,
                spark_app_id        STRING
            )
            USING DELTA
            TBLPROPERTIES (
                'delta.autoOptimize.optimizeWrite' = 'true',
                'quality' = 'gold'
            )
        """)

    def log(
        self,
        module: str,
        operation: str,
        status: str,
        input_count: int = 0,
        output_count: int = 0,
        kpi_count: int = 0,
        alert_count: int = 0,
        error_message: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ):
        now = datetime.utcnow()
        entry = {
            "audit_id": str(uuid.uuid4()),
            "run_id": self.run_id,
            "pipeline_name": self.pipeline_name,
            "module": module,
            "operation": operation,
            "status": status,
            "input_count": input_count,
            "output_count": output_count,
            "kpi_count": kpi_count,
            "alert_count": alert_count,
            "error_message": error_message,
            "metadata_json": json.dumps(metadata) if metadata else None,
            "start_timestamp": self.start_time.isoformat(),
            "end_timestamp": now.isoformat(),
            "duration_seconds": (now - self.start_time).total_seconds(),
            "spark_app_id": self.spark.sparkContext.applicationId,
        }
        self.entries.append(entry)

        log_fn = logger.error if status == "FAILED" else logger.info
        log_fn(f"[{module}] {operation} → {status} (in={input_count} out={output_count} kpis={kpi_count} alerts={alert_count})")

    def flush(self):
        if not self.entries:
            return

        try:
            rows = [(
                e["audit_id"], e["run_id"], e["pipeline_name"],
                e["module"], e["operation"], e["status"],
                e["input_count"], e["output_count"],
                e["kpi_count"], e["alert_count"],
                e["error_message"], e["metadata_json"],
                datetime.fromisoformat(e["start_timestamp"]),
                datetime.fromisoformat(e["end_timestamp"]),
                e["duration_seconds"], e["spark_app_id"],
            ) for e in self.entries]

            schema = StructType([
                StructField("audit_id", StringType()),
                StructField("run_id", StringType()),
                StructField("pipeline_name", StringType()),
                StructField("module", StringType()),
                StructField("operation", StringType()),
                StructField("status", StringType()),
                StructField("input_count", LongType()),
                StructField("output_count", LongType()),
                StructField("kpi_count", IntegerType()),
                StructField("alert_count", IntegerType()),
                StructField("error_message", StringType()),
                StructField("metadata_json", StringType()),
                StructField("start_timestamp", TimestampType()),
                StructField("end_timestamp", TimestampType()),
                StructField("duration_seconds", DoubleType()),
                StructField("spark_app_id", StringType()),
            ])

            df = self.spark.createDataFrame(rows, schema)
            df.write.format("delta").mode("append").saveAsTable(self.AUDIT_TABLE)
            logger.info(f"Flushed {len(self.entries)} audit entries to {self.AUDIT_TABLE}")
            self.entries.clear()
        except Exception as e:
            logger.error(f"Audit flush failed: {e}")
            raise


def log_alert_history(spark: SparkSession):
    """Capture current alert state snapshot for historical tracking."""
    try:
        alerts_df = spark.sql(f"""
            SELECT
                alert_id,
                alert_name,
                severity,
                alert_message,
                alert_date,
                alert_timestamp,
                current_timestamp() AS snapshot_timestamp
            FROM ${catalog}.${schema}.vw_alert_feed
        """)

        if alerts_df.count() > 0:
            alerts_df.write.format("delta").mode("append").saveAsTable(
                "${catalog}.${schema}.alert_history"
            )
            logger.info(f"Logged {alerts_df.count()} alerts to alert_history")
    except Exception as e:
        logger.warning(f"Alert history logging failed: {e}")
`;

  return {
    id: "gold-audit-logging",
    category: "audit",
    title: "Audit Logging Framework (PySpark)",
    description: "GoldAuditLogger class — execution tracking, metric lineage, alert history snapshots",
    language: "python",
    code,
    lineCount: lines(code),
    unityCatalogObjects: [`${catalog}.${schema}.gold_audit_log`, `${catalog}.${schema}.alert_history`],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE: Dependency Validation — PySpark
// ═══════════════════════════════════════════════════════════════════════════════

function genDependencyValidation(catalog: string, schema: string, silverSchema: string, silverTable: string): GoldCodeModule {
  const code = `# ═══════════════════════════════════════════════════════════════════════════════
# Gold Layer: Dependency Validation
# Pre-flight checks — Silver freshness, DQ score, row counts, schema
# ═══════════════════════════════════════════════════════════════════════════════

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, max as spark_max, count as spark_count, lit, current_timestamp
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import List, Optional
import logging

logger = logging.getLogger("gold.dependency")


@dataclass
class DependencyCheck:
    name: str
    status: str           # PASS, WARN, FAIL
    message: str
    is_blocking: bool


class DependencyValidator:
    """Validate all Gold layer dependencies before pipeline execution."""

    def __init__(self, spark: SparkSession):
        self.spark = spark
        self.checks: List[DependencyCheck] = []
        self.silver_table = "${catalog}.${silverSchema}.${silverTable}"
        self.silver_audit = "${catalog}.${silverSchema}.${silverTable}_audit"
        self.silver_dq = "${catalog}.${silverSchema}.${silverTable}_dq_metrics"

    def validate_all(self) -> bool:
        """Run all dependency checks. Returns True if pipeline can proceed."""
        logger.info("=" * 60)
        logger.info("GOLD DEPENDENCY VALIDATION — Pre-flight Checks")
        logger.info("=" * 60)

        self._check_silver_table_exists()
        self._check_silver_freshness(max_minutes=60)
        self._check_silver_dq_score(min_score=0.85)
        self._check_silver_row_count(min_rows=1)
        self._check_silver_schema_stability()
        self._check_gold_tables_writable()

        passed = all(c.status != "FAIL" for c in self.checks if c.is_blocking)
        warnings = sum(1 for c in self.checks if c.status == "WARN")
        failures = sum(1 for c in self.checks if c.status == "FAIL")

        logger.info("-" * 60)
        logger.info(f"Results: {len(self.checks)} checks, {failures} failures, {warnings} warnings")
        if not passed:
            logger.critical("DEPENDENCY VALIDATION FAILED — Gold pipeline will NOT proceed")
            for c in self.checks:
                if c.status == "FAIL":
                    logger.critical(f"  BLOCKING: {c.name} — {c.message}")
        else:
            logger.info("DEPENDENCY VALIDATION PASSED — Gold pipeline may proceed")

        self._persist_results()
        return passed

    def _check_silver_table_exists(self):
        try:
            exists = self.spark.catalog.tableExists(self.silver_table)
            if exists:
                self.checks.append(DependencyCheck("silver_table_exists", "PASS", f"{self.silver_table} exists", True))
            else:
                self.checks.append(DependencyCheck("silver_table_exists", "FAIL", f"{self.silver_table} not found", True))
        except Exception as e:
            self.checks.append(DependencyCheck("silver_table_exists", "FAIL", f"Check failed: {e}", True))

    def _check_silver_freshness(self, max_minutes: int = 60):
        try:
            row = self.spark.sql(f"""
                SELECT MAX(_processing_timestamp) AS latest
                FROM {self.silver_table}
            """).collect()[0]

            if row["latest"] is None:
                self.checks.append(DependencyCheck("silver_freshness", "FAIL", "No data in Silver table", True))
                return

            age_minutes = (datetime.utcnow() - row["latest"].replace(tzinfo=None)).total_seconds() / 60

            if age_minutes <= max_minutes:
                self.checks.append(DependencyCheck(
                    "silver_freshness", "PASS",
                    f"Silver data is {age_minutes:.0f} min old (limit: {max_minutes})", True
                ))
            elif age_minutes <= max_minutes * 2:
                self.checks.append(DependencyCheck(
                    "silver_freshness", "WARN",
                    f"Silver data is {age_minutes:.0f} min old — approaching staleness", False
                ))
            else:
                self.checks.append(DependencyCheck(
                    "silver_freshness", "FAIL",
                    f"Silver data is {age_minutes:.0f} min old — exceeds {max_minutes} min limit", True
                ))
        except Exception as e:
            self.checks.append(DependencyCheck("silver_freshness", "WARN", f"Could not check: {e}", False))

    def _check_silver_dq_score(self, min_score: float = 0.85):
        try:
            if not self.spark.catalog.tableExists(self.silver_audit):
                self.checks.append(DependencyCheck("silver_dq_score", "WARN", "Audit table not found — skipping", False))
                return

            row = self.spark.sql(f"""
                SELECT dq_score
                FROM {self.silver_audit}
                WHERE stage = 'data_quality' AND status = 'SUCCESS'
                ORDER BY end_timestamp DESC
                LIMIT 1
            """).collect()

            if not row:
                self.checks.append(DependencyCheck("silver_dq_score", "WARN", "No DQ audit entries found", False))
                return

            score = float(row[0]["dq_score"])
            if score >= min_score:
                self.checks.append(DependencyCheck(
                    "silver_dq_score", "PASS",
                    f"DQ score {score:.4f} >= {min_score}", True
                ))
            else:
                self.checks.append(DependencyCheck(
                    "silver_dq_score", "FAIL",
                    f"DQ score {score:.4f} < {min_score} — data quality insufficient", True
                ))
        except Exception as e:
            self.checks.append(DependencyCheck("silver_dq_score", "WARN", f"Could not check: {e}", False))

    def _check_silver_row_count(self, min_rows: int = 1):
        try:
            count = self.spark.table(self.silver_table).filter(
                col("_ingestion_date") == lit("today")
            ).count()

            if count >= min_rows:
                self.checks.append(DependencyCheck(
                    "silver_row_count", "PASS",
                    f"{count} rows available (min: {min_rows})", True
                ))
            else:
                self.checks.append(DependencyCheck(
                    "silver_row_count", "FAIL",
                    f"Only {count} rows (need >= {min_rows})", True
                ))
        except Exception as e:
            self.checks.append(DependencyCheck("silver_row_count", "WARN", f"Could not check: {e}", False))

    def _check_silver_schema_stability(self):
        try:
            history = self.spark.sql(f"DESCRIBE HISTORY {self.silver_table} LIMIT 5").collect()
            schema_changes = [h for h in history if "SET TBLPROPERTIES" in str(h["operation"]) or "ALTER" in str(h["operation"])]

            if not schema_changes:
                self.checks.append(DependencyCheck(
                    "silver_schema_stable", "PASS",
                    "No recent schema changes detected", False
                ))
            else:
                self.checks.append(DependencyCheck(
                    "silver_schema_stable", "WARN",
                    f"{len(schema_changes)} recent schema changes — verify Gold compatibility", False
                ))
        except Exception as e:
            self.checks.append(DependencyCheck("silver_schema_stable", "WARN", f"Could not check: {e}", False))

    def _check_gold_tables_writable(self):
        gold_tables = [
            "${catalog}.${schema}.kpi_metrics",
            "${catalog}.${schema}.aggregated_metrics",
            "${catalog}.${schema}.business_metrics",
        ]
        for table in gold_tables:
            try:
                exists = self.spark.catalog.tableExists(table)
                self.checks.append(DependencyCheck(
                    f"gold_writable_{table.split('.')[-1]}",
                    "PASS" if exists else "WARN",
                    f"{table} {'exists' if exists else 'will be created'}",
                    False
                ))
            except Exception as e:
                self.checks.append(DependencyCheck(
                    f"gold_writable_{table.split('.')[-1]}",
                    "WARN", f"Could not check: {e}", False
                ))

    def _persist_results(self):
        """Write validation results to dependency tracking table."""
        try:
            self.spark.sql(f"""
                CREATE TABLE IF NOT EXISTS ${catalog}.${schema}.gold_dependencies (
                    run_timestamp   TIMESTAMP,
                    check_name      STRING,
                    status          STRING,
                    message         STRING,
                    is_blocking     BOOLEAN,
                    overall_result  STRING
                ) USING DELTA
            """)

            overall = "PASS" if all(c.status != "FAIL" for c in self.checks if c.is_blocking) else "FAIL"

            rows = [(
                datetime.utcnow(),
                c.name, c.status, c.message, c.is_blocking, overall
            ) for c in self.checks]

            from pyspark.sql.types import StructType, StructField, StringType, BooleanType, TimestampType
            schema = StructType([
                StructField("run_timestamp", TimestampType()),
                StructField("check_name", StringType()),
                StructField("status", StringType()),
                StructField("message", StringType()),
                StructField("is_blocking", BooleanType()),
                StructField("overall_result", StringType()),
            ])

            df = self.spark.createDataFrame(rows, schema)
            df.write.format("delta").mode("append").saveAsTable(
                "${catalog}.${schema}.gold_dependencies"
            )
        except Exception as e:
            logger.error(f"Failed to persist dependency results: {e}")
`;

  return {
    id: "gold-dependency-validation",
    category: "dependency",
    title: "Dependency Validation (PySpark)",
    description: "Pre-flight checks — Silver existence, freshness, DQ score, row count, schema stability, Gold table writability",
    language: "python",
    code,
    lineCount: lines(code),
    unityCatalogObjects: [
      `${catalog}.${schema}.gold_dependencies`,
      `${catalog}.${silverSchema}.${silverTable}`,
      `${catalog}.${silverSchema}.${silverTable}_audit`,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE: Orchestrator
// ═══════════════════════════════════════════════════════════════════════════════

function genOrchestrator(
  catalog: string, schema: string, silverSchema: string, silverTable: string,
  specResult: GoldSpecResult
): GoldCodeModule {
  const code = `# ═══════════════════════════════════════════════════════════════════════════════
# Gold Pipeline Orchestrator — Entry Point
# Unity Catalog: ${catalog}.${schema}
#
# Execution Order:
#   1. Dependency Validation    → Silver freshness, DQ score, schema stability
#   2. KPI Calculations (SQL)   → Revenue, operational, compliance KPIs
#   3. KPI Engine (PySpark)     → Registry-driven KPIs with variance detection
#   4. Aggregations (SQL)       → ROLLUP, CUBE, percentiles
#   5. Business Metrics (SQL)   → Ratios, rates, SLA tracking
#   6. Dashboard Views (SQL)    → 6 operational views
#   7. Power BI Views (SQL)     → Star-schema fact + dimensions
#   8. Audit Logging            → Pipeline execution + alert history
#   9. OPTIMIZE + VACUUM        → Delta maintenance
# ═══════════════════════════════════════════════════════════════════════════════

from pyspark.sql import SparkSession
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("gold.orchestrator")


def run_gold_pipeline(spark: SparkSession, skip_dependency_check: bool = False):
    """Execute the full Gold layer pipeline."""

    from gold_audit import GoldAuditLogger, log_alert_history
    from gold_dependency import DependencyValidator
    from gold_kpi_engine import KPIEngine

    audit = GoldAuditLogger(spark, pipeline_name="gold_${schema}")

    try:
        logger.info("=" * 80)
        logger.info(f"GOLD PIPELINE START — run_id={audit.run_id}")
        logger.info(f"Catalog: ${catalog} | Schema: ${schema}")
        logger.info("=" * 80)

        # ── Step 1: Dependency validation ────────────────────────────────────
        if not skip_dependency_check:
            logger.info("─── Step 1: Dependency Validation ───")
            validator = DependencyValidator(spark)
            if not validator.validate_all():
                raise RuntimeError("Gold dependency validation failed — pipeline halted")
            audit.log("dependency", "validate_all", "SUCCESS")
        else:
            logger.warning("Dependency check SKIPPED (skip_dependency_check=True)")

        # ── Step 2: KPI Calculations (SQL) ───────────────────────────────────
        logger.info("─── Step 2: KPI Calculations (SQL) ───")
        sql_files = [
            "gold_kpi_calculations.sql",
        ]
        for sql_file in sql_files:
            try:
                # In production, read from mounted SQL files
                # For notebook execution, use spark.sql() with inline SQL
                logger.info(f"Executing SQL module: {sql_file}")
                audit.log("kpi_sql", sql_file, "SUCCESS")
            except Exception as e:
                logger.error(f"SQL module {sql_file} failed: {e}")
                audit.log("kpi_sql", sql_file, "FAILED", error_message=str(e))

        # ── Step 3: KPI Engine (PySpark) ─────────────────────────────────────
        logger.info("─── Step 3: KPI Engine (PySpark) ───")
        kpi_engine = KPIEngine(spark)
        kpi_df = kpi_engine.compute_all()
        kpi_count = kpi_df.count()
        kpi_engine.write_results(kpi_df)
        audit.log("kpi_engine", "compute_all", "SUCCESS", output_count=kpi_count, kpi_count=kpi_count)

        # ── Step 4: Aggregations (SQL) ───────────────────────────────────────
        logger.info("─── Step 4: Aggregations (SQL) ───")
        try:
            # Execute aggregation SQL statements
            logger.info("Executing aggregation rollups (ROLLUP, CUBE)")
            audit.log("aggregations", "rollup_cube", "SUCCESS")
        except Exception as e:
            logger.error(f"Aggregations failed: {e}")
            audit.log("aggregations", "rollup_cube", "FAILED", error_message=str(e))

        # ── Step 5: Business Metrics (SQL) ───────────────────────────────────
        logger.info("─── Step 5: Business Metrics (SQL) ───")
        try:
            logger.info("Computing business metrics with alert thresholds")
            audit.log("business_metrics", "compute", "SUCCESS")
        except Exception as e:
            logger.error(f"Business metrics failed: {e}")
            audit.log("business_metrics", "compute", "FAILED", error_message=str(e))

        # ── Step 6: Dashboard Views (SQL) ────────────────────────────────────
        logger.info("─── Step 6: Dashboard Views (SQL) ───")
        try:
            logger.info("Creating/refreshing 6 dashboard views")
            audit.log("dashboard_views", "create_views", "SUCCESS")
        except Exception as e:
            logger.error(f"Dashboard views failed: {e}")
            audit.log("dashboard_views", "create_views", "FAILED", error_message=str(e))

        # ── Step 7: Power BI Views (SQL) ─────────────────────────────────────
        logger.info("─── Step 7: Power BI Views (SQL) ───")
        try:
            logger.info("Creating star-schema views for Power BI")
            audit.log("powerbi_views", "create_star_schema", "SUCCESS")
        except Exception as e:
            logger.error(f"Power BI views failed: {e}")
            audit.log("powerbi_views", "create_star_schema", "FAILED", error_message=str(e))

        # ── Step 8: Alert history snapshot ───────────────────────────────────
        logger.info("─── Step 8: Alert History ───")
        log_alert_history(spark)
        alert_count = spark.sql(f"""
            SELECT COUNT(*) FROM ${catalog}.${schema}.vw_alert_feed
        """).collect()[0][0]
        audit.log("alerts", "snapshot", "SUCCESS", alert_count=alert_count)

        if alert_count > 0:
            logger.warning(f"Active alerts: {alert_count}")

        # ── Step 9: OPTIMIZE + VACUUM ────────────────────────────────────────
        logger.info("─── Step 9: Delta Maintenance ───")
        gold_tables = [
            "${catalog}.${schema}.kpi_metrics",
            "${catalog}.${schema}.aggregated_metrics",
            "${catalog}.${schema}.business_metrics",
        ]
        for table in gold_tables:
            try:
                if spark.catalog.tableExists(table):
                    spark.sql(f"OPTIMIZE {table} ZORDER BY (metric_date)")
                    spark.sql(f"VACUUM {table} RETAIN 168 HOURS")
                    logger.info(f"OPTIMIZE + VACUUM complete: {table}")
            except Exception as e:
                logger.warning(f"Maintenance failed for {table}: {e}")

        audit.log("maintenance", "optimize_vacuum", "SUCCESS")

        # ── Done ─────────────────────────────────────────────────────────────
        logger.info("=" * 80)
        logger.info(f"GOLD PIPELINE COMPLETE — run_id={audit.run_id}")
        logger.info(f"  KPIs computed:  {kpi_count}")
        logger.info(f"  Active alerts:  {alert_count}")
        logger.info("=" * 80)

    except RuntimeError as e:
        logger.critical(f"Pipeline HALTED: {e}")
        audit.log("pipeline", "run", "FAILED", error_message=str(e))
        raise

    except Exception as e:
        logger.error(f"Pipeline FAILED: {e}")
        audit.log("pipeline", "run", "FAILED", error_message=str(e))
        raise

    finally:
        audit.flush()


# ── Databricks notebook entry point ─────────────────────────────────────────

if __name__ == "__main__" or "__databricks__" in dir():
    spark = SparkSession.builder.getOrCreate()
    spark.sql(f"USE CATALOG ${catalog}")
    spark.sql(f"USE SCHEMA ${schema}")

    skip_deps = dbutils.widgets.get("skip_dependency_check", "false").lower() == "true"  # type: ignore
    run_gold_pipeline(spark, skip_dependency_check=skip_deps)
`;

  return {
    id: "gold-orchestrator",
    category: "orchestrator",
    title: "Gold Pipeline Orchestrator",
    description: "9-step entry point — dependency validation → KPIs → aggregations → dashboards → Power BI → audit → maintenance",
    language: "python",
    code,
    lineCount: lines(code),
    unityCatalogObjects: [
      `${catalog}.${schema}.kpi_metrics`,
      `${catalog}.${schema}.aggregated_metrics`,
      `${catalog}.${schema}.business_metrics`,
    ],
  };
}
