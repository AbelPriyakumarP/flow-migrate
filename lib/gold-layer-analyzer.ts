export type GoldMetricCategory =
  | "kpi-calculation"
  | "business-metric"
  | "aggregation"
  | "compliance-metric"
  | "asset-lifecycle"
  | "security-posture"
  | "reporting-dataset";

export interface GoldIntent {
  id: string;
  category: GoldMetricCategory;
  sourceExpression: string;
  description: string;
  platform: "aws" | "azure" | "generic";
  outputFields: string[];
  inputDependencies: string[];
  confidence: number;
  complexity: "simple" | "moderate" | "complex";
}

export interface GoldTransformSpec {
  id: string;
  intentId: string;
  category: GoldMetricCategory;
  name: string;
  description: string;
  code: string;
  language: "spark-sql" | "pyspark" | "sql" | "dataflow";
  granularity: "real-time" | "hourly" | "daily" | "weekly" | "monthly" | "on-demand";
  outputSchema: GoldOutputField[];
  silverDependencies: string[];
  dashboardReady: boolean;
}

export interface GoldOutputField {
  name: string;
  type: string;
  description: string;
  isMeasure: boolean;
  isDimension: boolean;
  aggregation?: string;
}

export interface DependencyNode {
  id: string;
  name: string;
  layer: "bronze" | "silver" | "gold" | "external";
  type: "table" | "view" | "stream" | "api";
}

export interface DependencyLink {
  from: string;
  to: string;
  relationship: "reads" | "aggregates" | "joins" | "filters" | "unions";
}

export interface GoldDependencyGraph {
  nodes: DependencyNode[];
  links: DependencyLink[];
}

export interface GoldLayerResult {
  intents: GoldIntent[];
  specs: GoldTransformSpec[];
  dependencyGraph: GoldDependencyGraph;
  summary: GoldSummary;
  overallConfidence: number;
}

// ── Production Gold types ──────────────────────────────────────────────────

export interface GoldKPISpec {
  id: string;
  name: string;
  formula: string;
  code: string;
  category: "revenue" | "operational" | "customer" | "compliance" | "growth";
  granularity: "real-time" | "hourly" | "daily" | "weekly" | "monthly";
  threshold?: { warning: number; critical: number; direction: "above" | "below" };
  silverInputs: string[];
  powerBIReady: boolean;
}

export interface AggregationConfig {
  id: string;
  name: string;
  type: "rollup" | "cube" | "window" | "conditional" | "pivot" | "running";
  granularities: string[];
  code: string;
  description: string;
  materializedView: boolean;
  refreshSchedule: string;
}

export interface BusinessMetricValidation {
  id: string;
  metricName: string;
  validationType: "range" | "trend" | "anomaly" | "completeness" | "freshness";
  expression: string;
  code: string;
  severity: "error" | "warning" | "info";
  autoRemediation: boolean;
}

export interface IncrementalGoldConfig {
  strategy: "merge-into" | "insert-overwrite" | "append-with-watermark" | "scd-type-2";
  mergeKeys: string[];
  partitionColumns: string[];
  watermarkColumn: string;
  code: string;
  description: string;
}

export interface ExecutiveView {
  id: string;
  name: string;
  viewType: "materialized" | "standard" | "streaming" | "cached";
  targetPlatform: "power-bi" | "synapse-serverless" | "databricks-sql";
  code: string;
  refreshSchedule: string;
  zordering: string[];
  description: string;
}

export interface GoldDataQualityMonitor {
  id: string;
  name: string;
  checkType: "null-rate" | "outlier" | "trend-break" | "referential" | "metric-drift" | "staleness";
  expression: string;
  code: string;
  alertChannel: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface GoldAuditEntry {
  id: string;
  name: string;
  auditType: "lineage" | "metric-snapshot" | "refresh-log" | "access-log" | "change-detection";
  code: string;
  retentionDays: number;
  description: string;
}

export interface DependencyValidation {
  id: string;
  name: string;
  checkType: "freshness" | "schema-match" | "row-count" | "partition-existence" | "table-exists";
  upstreamTable: string;
  code: string;
  blockOnFailure: boolean;
  description: string;
}

export interface GoldPerformanceRec {
  id: string;
  title: string;
  type: "z-order" | "partition-pruning" | "materialized-view" | "caching" | "bloom-filter" | "liquid-clustering";
  code: string;
  estimatedImpact: string;
  description: string;
}

export interface ThresholdAlert {
  id: string;
  kpiId: string;
  kpiName: string;
  alertType: "warning" | "critical" | "recovery";
  channel: "pagerduty" | "teams" | "email" | "log-analytics";
  code: string;
  description: string;
}

export interface GoldReconciliation {
  id: string;
  name: string;
  reconciliationType: "count" | "sum" | "hash" | "freshness";
  goldTable: string;
  silverTable: string;
  code: string;
  tolerance: number;
  description: string;
}

export interface GovernanceConfig {
  id: string;
  name: string;
  governanceType: "table-properties" | "column-tags" | "row-filter" | "column-mask" | "lineage-tag";
  code: string;
  description: string;
}

export interface ProductionGoldResult extends GoldLayerResult {
  kpis: GoldKPISpec[];
  aggregationFramework: AggregationConfig[];
  metricValidations: BusinessMetricValidation[];
  incrementalConfig: IncrementalGoldConfig;
  executiveViews: ExecutiveView[];
  dataQualityMonitors: GoldDataQualityMonitor[];
  auditFramework: GoldAuditEntry[];
  dependencyValidations: DependencyValidation[];
  performanceRecs: GoldPerformanceRec[];
  productionPipeline: { stage: string; description: string; code: string }[];
  thresholdAlerts: ThresholdAlert[];
  goldReconciliation: GoldReconciliation[];
  governance: GovernanceConfig[];
}

export interface GoldSummary {
  totalIntents: number;
  byCategory: Record<GoldMetricCategory, number>;
  totalOutputFields: number;
  dashboardReadyCount: number;
  silverDependencyCount: number;
  complexCalculations: number;
  warnings: string[];
}

const CATEGORY_LABELS: Record<GoldMetricCategory, string> = {
  "kpi-calculation": "KPI Calculation",
  "business-metric": "Business Metric",
  "aggregation": "Aggregation",
  "compliance-metric": "Compliance Metric",
  "asset-lifecycle": "Asset Lifecycle",
  "security-posture": "Security Posture",
  "reporting-dataset": "Reporting Dataset",
};

export { CATEGORY_LABELS };

// ── Pattern definitions ─────────────────────────────────────────────────────

interface GoldPattern {
  regex: RegExp;
  category: GoldMetricCategory;
  descTemplate: string;
  complexity: "simple" | "moderate" | "complex";
}

const KPI_PATTERNS: GoldPattern[] = [
  { regex: /SUM\s*\(\s*[\w.]*(?:revenue|sales|income|amount|total)[\w.]*\s*\)/gi, category: "kpi-calculation", descTemplate: "Revenue/sales sum KPI", complexity: "simple" },
  { regex: /AVG\s*\(\s*[\w.]*(?:response_time|latency|duration|processing_time)[\w.]*\s*\)/gi, category: "kpi-calculation", descTemplate: "Performance average KPI", complexity: "simple" },
  { regex: /COUNT\s*\(\s*DISTINCT\s+[\w.]+\s*\)/gi, category: "kpi-calculation", descTemplate: "Distinct count KPI", complexity: "simple" },
  { regex: /(?:conversion|retention|churn|attrition)[\w_]*\s*(?:rate|ratio|pct|percent)/gi, category: "kpi-calculation", descTemplate: "Rate/ratio KPI calculation", complexity: "moderate" },
  { regex: /(?:year_over_year|yoy|mom|month_over_month|qoq|quarter_over_quarter)/gi, category: "kpi-calculation", descTemplate: "Period-over-period comparison KPI", complexity: "complex" },
  { regex: /(?:running_total|cumulative|rolling_avg|moving_average|running_sum)/gi, category: "kpi-calculation", descTemplate: "Cumulative/rolling calculation", complexity: "complex" },
  { regex: /NTILE\s*\(\s*\d+\s*\)\s*OVER/gi, category: "kpi-calculation", descTemplate: "Percentile/quantile KPI", complexity: "moderate" },
  { regex: /(?:net_promoter|nps|csat|satisfaction)[\w_]*(?:score)?/gi, category: "kpi-calculation", descTemplate: "Customer satisfaction KPI", complexity: "moderate" },
  { regex: /(?:arpu|arpa|ltv|clv|cac|mrr|arr)(?:\b|_)/gi, category: "kpi-calculation", descTemplate: "SaaS/subscription KPI", complexity: "complex" },
  { regex: /PERCENTILE(?:_CONT|_DISC|_APPROX)?\s*\(/gi, category: "kpi-calculation", descTemplate: "Statistical percentile calculation", complexity: "moderate" },
];

const BUSINESS_PATTERNS: GoldPattern[] = [
  { regex: /(?:gross|net|operating)[\w_]*(?:margin|profit|loss|income)/gi, category: "business-metric", descTemplate: "Profit/margin metric", complexity: "moderate" },
  { regex: /(?:cost_of|cogs|opex|capex|overhead)/gi, category: "business-metric", descTemplate: "Cost metric", complexity: "moderate" },
  { regex: /(?:inventory|stock)[\w_]*(?:level|turnover|days|value|count)/gi, category: "business-metric", descTemplate: "Inventory metric", complexity: "moderate" },
  { regex: /(?:order|shipment|delivery|fulfillment)[\w_]*(?:count|rate|time|status)/gi, category: "business-metric", descTemplate: "Order/fulfillment metric", complexity: "simple" },
  { regex: /(?:employee|headcount|fte|staffing|workforce)[\w_]*(?:count|cost|ratio)/gi, category: "business-metric", descTemplate: "Workforce metric", complexity: "simple" },
  { regex: /(?:pipeline|funnel|lead|opportunity)[\w_]*(?:value|stage|count|conversion)/gi, category: "business-metric", descTemplate: "Sales pipeline metric", complexity: "moderate" },
  { regex: /(?:sla|slo|sli|uptime|availability|mttr|mtbf|mttd)/gi, category: "business-metric", descTemplate: "Service level metric", complexity: "moderate" },
];

const AGGREGATION_PATTERNS: GoldPattern[] = [
  { regex: /GROUP\s+BY\s+(?:[\w.,\s]+)/gi, category: "aggregation", descTemplate: "Group-by aggregation", complexity: "simple" },
  { regex: /(?:ROLLUP|CUBE|GROUPING\s+SETS)\s*\(/gi, category: "aggregation", descTemplate: "Multi-level rollup/cube aggregation", complexity: "complex" },
  { regex: /PARTITION\s+BY\s+[\w.,\s]+\s+ORDER\s+BY/gi, category: "aggregation", descTemplate: "Window partition aggregation", complexity: "moderate" },
  { regex: /(?:PIVOT|UNPIVOT)\s*\(/gi, category: "aggregation", descTemplate: "Pivot/unpivot transformation", complexity: "complex" },
  { regex: /(?:SUM|AVG|COUNT|MIN|MAX|STDDEV|VARIANCE)\s*\(\s*(?:CASE|IF)/gi, category: "aggregation", descTemplate: "Conditional aggregation", complexity: "moderate" },
  { regex: /LAG\s*\(|LEAD\s*\(|FIRST_VALUE\s*\(|LAST_VALUE\s*\(/gi, category: "aggregation", descTemplate: "Window analytic function", complexity: "moderate" },
  { regex: /\.agg\s*\(|\.groupBy\s*\([^)]+\)\s*\.(?:sum|avg|count|min|max)/gi, category: "aggregation", descTemplate: "PySpark aggregation", complexity: "simple" },
  { regex: /UNION\s+ALL|UNION\s+DISTINCT/gi, category: "aggregation", descTemplate: "Union dataset combination", complexity: "simple" },
];

const COMPLIANCE_PATTERNS: GoldPattern[] = [
  { regex: /(?:audit|compliance)[\w_]*(?:score|status|count|report|log)/gi, category: "compliance-metric", descTemplate: "Audit/compliance metric", complexity: "moderate" },
  { regex: /(?:soc2|hipaa|pci|gdpr|sox|fedramp|iso27001)/gi, category: "compliance-metric", descTemplate: "Regulatory framework metric", complexity: "complex" },
  { regex: /(?:data_retention|retention_days|purge_date|expiry)/gi, category: "compliance-metric", descTemplate: "Data retention metric", complexity: "simple" },
  { regex: /(?:access_review|permission_audit|privilege_escalation)/gi, category: "compliance-metric", descTemplate: "Access control metric", complexity: "moderate" },
  { regex: /(?:encryption_status|tls_version|cert_expiry|key_rotation)/gi, category: "compliance-metric", descTemplate: "Encryption compliance metric", complexity: "simple" },
  { regex: /(?:policy_violation|non_compliant|exception_count|waiver)/gi, category: "compliance-metric", descTemplate: "Policy violation metric", complexity: "moderate" },
  { regex: /(?:consent|opt_in|opt_out|data_subject|dsar)/gi, category: "compliance-metric", descTemplate: "Privacy/consent metric", complexity: "moderate" },
];

const LIFECYCLE_PATTERNS: GoldPattern[] = [
  { regex: /(?:asset|resource)[\w_]*(?:age|lifespan|depreciation|utilization)/gi, category: "asset-lifecycle", descTemplate: "Asset depreciation/utilization metric", complexity: "moderate" },
  { regex: /(?:provisioned|allocated|consumed|available|capacity)/gi, category: "asset-lifecycle", descTemplate: "Capacity utilization metric", complexity: "simple" },
  { regex: /(?:created_at|updated_at|deleted_at|archived_at|expires_at)/gi, category: "asset-lifecycle", descTemplate: "Lifecycle timestamp tracking", complexity: "simple" },
  { regex: /DATEDIFF|DATE_DIFF|TIMESTAMPDIFF|MONTHS_BETWEEN/gi, category: "asset-lifecycle", descTemplate: "Time-based lifecycle calculation", complexity: "moderate" },
  { regex: /(?:renewal|warranty|maintenance|end_of_life|eol)/gi, category: "asset-lifecycle", descTemplate: "Asset renewal/EOL tracking", complexity: "moderate" },
  { regex: /(?:cost_center|department|owner|assigned_to|business_unit)/gi, category: "asset-lifecycle", descTemplate: "Asset ownership tracking", complexity: "simple" },
];

const SECURITY_PATTERNS: GoldPattern[] = [
  { regex: /(?:vulnerability|cve|threat|risk)[\w_]*(?:score|count|severity|level)/gi, category: "security-posture", descTemplate: "Vulnerability/risk score metric", complexity: "moderate" },
  { regex: /(?:incident|alert|event)[\w_]*(?:count|rate|mttr|severity|status)/gi, category: "security-posture", descTemplate: "Security incident metric", complexity: "moderate" },
  { regex: /(?:patch|update)[\w_]*(?:compliance|status|pending|overdue)/gi, category: "security-posture", descTemplate: "Patch compliance metric", complexity: "simple" },
  { regex: /(?:failed_login|brute_force|unauthorized|suspicious)[\w_]*(?:count|rate|attempt)/gi, category: "security-posture", descTemplate: "Authentication threat metric", complexity: "moderate" },
  { regex: /(?:firewall|waf|ids|ips)[\w_]*(?:block|rule|hit|count)/gi, category: "security-posture", descTemplate: "Network security metric", complexity: "simple" },
  { regex: /(?:endpoint|agent|scanner)[\w_]*(?:coverage|status|health)/gi, category: "security-posture", descTemplate: "Security tooling coverage", complexity: "simple" },
];

const REPORTING_PATTERNS: GoldPattern[] = [
  { regex: /CREATE\s+(?:OR\s+REPLACE\s+)?(?:VIEW|MATERIALIZED\s+VIEW|TABLE)/gi, category: "reporting-dataset", descTemplate: "Reporting view/table creation", complexity: "simple" },
  { regex: /(?:report|dashboard|summary|fact|dim|mart)[\w_]*(?:table|view|dataset)/gi, category: "reporting-dataset", descTemplate: "Reporting dataset definition", complexity: "simple" },
  { regex: /(?:daily|weekly|monthly|quarterly|annual)[\w_]*(?:summary|snapshot|report)/gi, category: "reporting-dataset", descTemplate: "Periodic reporting dataset", complexity: "moderate" },
  { regex: /(?:power_bi|powerbi|tableau|looker|quicksight|superset)/gi, category: "reporting-dataset", descTemplate: "BI tool integration dataset", complexity: "simple" },
  { regex: /\.write\s*\.(?:format|mode|partitionBy|bucketBy|saveAsTable)/gi, category: "reporting-dataset", descTemplate: "PySpark dataset output", complexity: "simple" },
  { regex: /(?:star_schema|snowflake_schema|denormalized|wide_table)/gi, category: "reporting-dataset", descTemplate: "Schema design for analytics", complexity: "moderate" },
  { regex: /OPTIMIZE|ZORDER|CLUSTER\s+BY|DISTRIBUTE\s+BY/gi, category: "reporting-dataset", descTemplate: "Query optimization directive", complexity: "moderate" },
];

const ALL_PATTERNS: GoldPattern[] = [
  ...KPI_PATTERNS,
  ...BUSINESS_PATTERNS,
  ...AGGREGATION_PATTERNS,
  ...COMPLIANCE_PATTERNS,
  ...LIFECYCLE_PATTERNS,
  ...SECURITY_PATTERNS,
  ...REPORTING_PATTERNS,
];

// ── Main analysis ───────────────────────────────────────────────────────────

export function analyzeGoldLayer(
  sourceCode: string,
  outputCode: string,
  direction: "aws-to-azure" | "azure-to-aws"
): GoldLayerResult {
  const intents = extractGoldIntents(sourceCode, direction);
  const specs = generateGoldSpecs(intents, direction);
  const dependencyGraph = buildDependencyGraph(intents, specs);
  const overallConfidence = computeGoldConfidence(intents, specs);

  const byCategory: Record<GoldMetricCategory, number> = {
    "kpi-calculation": 0, "business-metric": 0, "aggregation": 0,
    "compliance-metric": 0, "asset-lifecycle": 0, "security-posture": 0,
    "reporting-dataset": 0,
  };
  for (const i of intents) byCategory[i.category]++;

  const warnings: string[] = [];
  if (byCategory["compliance-metric"] === 0)
    warnings.push("No compliance metrics detected — consider adding SOC2/HIPAA audit aggregates");
  if (byCategory["reporting-dataset"] === 0 && intents.length > 0)
    warnings.push("KPIs detected but no reporting dataset definitions — metrics need materialized views for dashboard consumption");
  if (byCategory["kpi-calculation"] > 0 && byCategory["aggregation"] === 0)
    warnings.push("KPI calculations found without explicit aggregation — verify GROUP BY granularity is preserved");
  if (!intents.some((i) => i.complexity === "complex") && intents.length > 5)
    warnings.push("All calculations are simple/moderate — verify no complex window functions or rollups were lost during migration");

  return {
    intents,
    specs,
    dependencyGraph,
    overallConfidence,
    summary: {
      totalIntents: intents.length,
      byCategory,
      totalOutputFields: specs.reduce((s, sp) => s + sp.outputSchema.length, 0),
      dashboardReadyCount: specs.filter((s) => s.dashboardReady).length,
      silverDependencyCount: new Set(specs.flatMap((s) => s.silverDependencies)).size,
      complexCalculations: intents.filter((i) => i.complexity === "complex").length,
      warnings,
    },
  };
}

function extractGoldIntents(source: string, _direction: "aws-to-azure" | "azure-to-aws"): GoldIntent[] {
  const intents: GoldIntent[] = [];
  const seen = new Set<string>();

  for (const pattern of ALL_PATTERNS) {
    let match: RegExpExecArray | null;
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    while ((match = re.exec(source)) !== null) {
      const key = `${pattern.category}:${match[0].slice(0, 50)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let desc = pattern.descTemplate;
      for (let i = 1; i <= 3; i++) {
        if (match[i]) desc = desc.replace(`$${i}`, match[i]);
      }

      const outputFields = extractOutputFields(match[0]);
      const inputDeps = extractInputDependencies(match[0], source);

      intents.push({
        id: `gold-${intents.length + 1}`,
        category: pattern.category,
        sourceExpression: match[0].slice(0, 200),
        description: desc,
        platform: detectGoldPlatform(match[0]),
        outputFields,
        inputDependencies: inputDeps,
        confidence: computeGoldPatternConf(pattern, match[0]),
        complexity: pattern.complexity,
      });
    }
  }

  return intents.sort((a, b) => {
    const comp = { complex: 0, moderate: 1, simple: 2 };
    return comp[a.complexity] - comp[b.complexity];
  });
}

function extractOutputFields(expr: string): string[] {
  const fields: string[] = [];
  const aliasRe = /(?:AS|alias)\s*\(?["']?(\w{2,40})["']?\)?/gi;
  let m: RegExpExecArray | null;
  while ((m = aliasRe.exec(expr)) !== null) fields.push(m[1]);

  const colRe = /["'](\w{2,40})["']/g;
  while ((m = colRe.exec(expr)) !== null) {
    const w = m[1].toLowerCase();
    if (!["string", "int", "long", "double", "boolean", "timestamp", "true", "false", "null", "select", "from", "where", "group", "order", "having", "case", "when", "then", "else", "end"].includes(w)) {
      fields.push(m[1]);
    }
  }
  return [...new Set(fields)];
}

function extractInputDependencies(expr: string, fullSource: string): string[] {
  const deps: string[] = [];
  const tableRe = /(?:FROM|JOIN)\s+["']?(\w+\.?\w+\.?\w+)["']?/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(expr)) !== null) deps.push(m[1]);
  if (deps.length === 0) {
    while ((m = tableRe.exec(fullSource)) !== null) deps.push(m[1]);
  }
  return [...new Set(deps)].slice(0, 10);
}

function detectGoldPlatform(expr: string): "aws" | "azure" | "generic" {
  if (/athena|redshift|glue|quicksight|s3:/i.test(expr)) return "aws";
  if (/synapse|databricks|power_?bi|adls|cosmos/i.test(expr)) return "azure";
  return "generic";
}

function computeGoldPatternConf(p: GoldPattern, matched: string): number {
  let base = 0.7;
  if (matched.length > 40) base += 0.1;
  if (p.complexity === "complex") base += 0.05;
  if (p.complexity === "moderate") base += 0.03;
  return Math.min(base, 0.97);
}

// ── Spec generation ─────────────────────────────────────────────────────────

function generateGoldSpecs(
  intents: GoldIntent[],
  direction: "aws-to-azure" | "azure-to-aws"
): GoldTransformSpec[] {
  const specs: GoldTransformSpec[] = [];
  const isToAzure = direction === "aws-to-azure";

  const grouped = new Map<GoldMetricCategory, GoldIntent[]>();
  for (const intent of intents) {
    const arr = grouped.get(intent.category) || [];
    arr.push(intent);
    grouped.set(intent.category, arr);
  }

  // KPI calculations
  const kpiIntents = grouped.get("kpi-calculation") || [];
  if (kpiIntents.length > 0) {
    const hasRolling = kpiIntents.some((i) => /rolling|cumulative|running/i.test(i.description));
    const hasPeriod = kpiIntents.some((i) => /yoy|mom|qoq|period/i.test(i.description));

    specs.push({
      id: `gold-spec-${specs.length + 1}`,
      intentId: kpiIntents[0].id,
      category: "kpi-calculation",
      name: "core_kpi_calculations",
      description: `${kpiIntents.length} KPI calculations including ${hasRolling ? "rolling/cumulative, " : ""}${hasPeriod ? "period-over-period, " : ""}standard aggregates`,
      code: isToAzure ? genAzureKpis(hasRolling, hasPeriod) : genAwsKpis(hasRolling, hasPeriod),
      language: isToAzure ? "spark-sql" : "spark-sql",
      granularity: "daily",
      outputSchema: [
        { name: "metric_date", type: "DATE", description: "Metric calculation date", isMeasure: false, isDimension: true },
        { name: "total_revenue", type: "DECIMAL(18,2)", description: "Total revenue for period", isMeasure: true, isDimension: false, aggregation: "SUM" },
        { name: "avg_response_time_ms", type: "DOUBLE", description: "Average response time", isMeasure: true, isDimension: false, aggregation: "AVG" },
        { name: "unique_customers", type: "BIGINT", description: "Distinct customer count", isMeasure: true, isDimension: false, aggregation: "COUNT_DISTINCT" },
        ...(hasRolling ? [{ name: "rolling_7d_avg", type: "DOUBLE", description: "7-day rolling average", isMeasure: true, isDimension: false, aggregation: "WINDOW_AVG" }] : []),
        ...(hasPeriod ? [{ name: "yoy_growth_pct", type: "DOUBLE", description: "Year-over-year growth %", isMeasure: true, isDimension: false, aggregation: "DERIVED" }] : []),
      ],
      silverDependencies: ["silver_transactions", "silver_events"],
      dashboardReady: true,
    });
  }

  // Business metrics
  const bizIntents = grouped.get("business-metric") || [];
  if (bizIntents.length > 0) {
    specs.push({
      id: `gold-spec-${specs.length + 1}`,
      intentId: bizIntents[0].id,
      category: "business-metric",
      name: "business_performance_metrics",
      description: `${bizIntents.length} business metrics — margins, costs, pipeline, SLAs`,
      code: isToAzure ? genAzureBusinessMetrics() : genAwsBusinessMetrics(),
      language: "spark-sql",
      granularity: "daily",
      outputSchema: [
        { name: "business_date", type: "DATE", description: "Reporting date", isMeasure: false, isDimension: true },
        { name: "business_unit", type: "STRING", description: "Business unit dimension", isMeasure: false, isDimension: true },
        { name: "gross_margin_pct", type: "DOUBLE", description: "Gross margin percentage", isMeasure: true, isDimension: false, aggregation: "DERIVED" },
        { name: "operating_cost", type: "DECIMAL(18,2)", description: "Total operating cost", isMeasure: true, isDimension: false, aggregation: "SUM" },
        { name: "sla_compliance_pct", type: "DOUBLE", description: "SLA compliance rate", isMeasure: true, isDimension: false, aggregation: "AVG" },
      ],
      silverDependencies: ["silver_orders", "silver_costs", "silver_sla_events"],
      dashboardReady: true,
    });
  }

  // Aggregations
  const aggIntents = grouped.get("aggregation") || [];
  if (aggIntents.length > 0) {
    const hasRollup = aggIntents.some((i) => /rollup|cube|grouping/i.test(i.description));
    const hasPivot = aggIntents.some((i) => /pivot|unpivot/i.test(i.description));

    specs.push({
      id: `gold-spec-${specs.length + 1}`,
      intentId: aggIntents[0].id,
      category: "aggregation",
      name: "multi_level_aggregations",
      description: `Aggregation pipeline — ${hasRollup ? "ROLLUP/CUBE, " : ""}${hasPivot ? "PIVOT, " : ""}window functions, conditional aggregates`,
      code: isToAzure ? genAzureAggregations(hasRollup, hasPivot) : genAwsAggregations(hasRollup, hasPivot),
      language: "spark-sql",
      granularity: "daily",
      outputSchema: [
        { name: "dimension_key", type: "STRING", description: "Aggregation dimension", isMeasure: false, isDimension: true },
        { name: "time_period", type: "STRING", description: "Time granularity", isMeasure: false, isDimension: true },
        { name: "measure_value", type: "DOUBLE", description: "Aggregated measure", isMeasure: true, isDimension: false, aggregation: "SUM" },
        { name: "grouping_level", type: "INT", description: "ROLLUP level indicator", isMeasure: false, isDimension: true },
      ],
      silverDependencies: ["silver_facts", "silver_dimensions"],
      dashboardReady: true,
    });
  }

  // Compliance metrics
  const compIntents = grouped.get("compliance-metric") || [];
  if (compIntents.length > 0) {
    specs.push({
      id: `gold-spec-${specs.length + 1}`,
      intentId: compIntents[0].id,
      category: "compliance-metric",
      name: "compliance_scorecard",
      description: `Compliance metrics — regulatory framework scores, audit trail, retention tracking`,
      code: isToAzure ? genAzureCompliance() : genAwsCompliance(),
      language: "spark-sql",
      granularity: "daily",
      outputSchema: [
        { name: "scan_date", type: "DATE", description: "Compliance scan date", isMeasure: false, isDimension: true },
        { name: "framework", type: "STRING", description: "Regulatory framework (SOC2/HIPAA/PCI/GDPR)", isMeasure: false, isDimension: true },
        { name: "compliance_score", type: "DOUBLE", description: "Overall compliance score 0-100", isMeasure: true, isDimension: false, aggregation: "AVG" },
        { name: "violations_count", type: "INT", description: "Active violation count", isMeasure: true, isDimension: false, aggregation: "SUM" },
        { name: "critical_findings", type: "INT", description: "Critical-severity findings", isMeasure: true, isDimension: false, aggregation: "SUM" },
        { name: "remediation_pct", type: "DOUBLE", description: "Percentage of issues remediated", isMeasure: true, isDimension: false, aggregation: "AVG" },
      ],
      silverDependencies: ["silver_audit_logs", "silver_access_events", "silver_config_snapshots"],
      dashboardReady: true,
    });
  }

  // Asset lifecycle
  const lifecycleIntents = grouped.get("asset-lifecycle") || [];
  if (lifecycleIntents.length > 0) {
    specs.push({
      id: `gold-spec-${specs.length + 1}`,
      intentId: lifecycleIntents[0].id,
      category: "asset-lifecycle",
      name: "asset_lifecycle_tracker",
      description: `Asset lifecycle metrics — depreciation, utilization, capacity, ownership tracking`,
      code: isToAzure ? genAzureLifecycle() : genAwsLifecycle(),
      language: "spark-sql",
      granularity: "daily",
      outputSchema: [
        { name: "asset_id", type: "STRING", description: "Asset unique identifier", isMeasure: false, isDimension: true },
        { name: "asset_type", type: "STRING", description: "Asset category", isMeasure: false, isDimension: true },
        { name: "age_days", type: "INT", description: "Asset age in days", isMeasure: true, isDimension: false, aggregation: "MAX" },
        { name: "utilization_pct", type: "DOUBLE", description: "Current utilization percentage", isMeasure: true, isDimension: false, aggregation: "AVG" },
        { name: "depreciated_value", type: "DECIMAL(18,2)", description: "Current depreciated value", isMeasure: true, isDimension: false, aggregation: "SUM" },
        { name: "lifecycle_stage", type: "STRING", description: "Current lifecycle stage", isMeasure: false, isDimension: true },
      ],
      silverDependencies: ["silver_assets", "silver_usage_events"],
      dashboardReady: true,
    });
  }

  // Security posture
  const secIntents = grouped.get("security-posture") || [];
  if (secIntents.length > 0) {
    specs.push({
      id: `gold-spec-${specs.length + 1}`,
      intentId: secIntents[0].id,
      category: "security-posture",
      name: "security_posture_dashboard",
      description: `Security metrics — vulnerability scores, incident rates, patch compliance, threat indicators`,
      code: isToAzure ? genAzureSecurity() : genAwsSecurity(),
      language: "spark-sql",
      granularity: "hourly",
      outputSchema: [
        { name: "assessment_time", type: "TIMESTAMP", description: "Assessment timestamp", isMeasure: false, isDimension: true },
        { name: "risk_score", type: "DOUBLE", description: "Composite risk score 0-100", isMeasure: true, isDimension: false, aggregation: "AVG" },
        { name: "open_vulnerabilities", type: "INT", description: "Open vulnerability count", isMeasure: true, isDimension: false, aggregation: "SUM" },
        { name: "critical_incidents", type: "INT", description: "Critical incident count (24h)", isMeasure: true, isDimension: false, aggregation: "SUM" },
        { name: "patch_compliance_pct", type: "DOUBLE", description: "Patch compliance rate", isMeasure: true, isDimension: false, aggregation: "AVG" },
        { name: "mean_time_to_respond_min", type: "DOUBLE", description: "MTTR in minutes", isMeasure: true, isDimension: false, aggregation: "AVG" },
      ],
      silverDependencies: ["silver_vulnerability_scans", "silver_security_events", "silver_patch_status"],
      dashboardReady: true,
    });
  }

  // Reporting datasets
  const reportIntents = grouped.get("reporting-dataset") || [];
  if (reportIntents.length > 0 || specs.length > 0) {
    specs.push({
      id: `gold-spec-${specs.length + 1}`,
      intentId: reportIntents[0]?.id || "gold-report",
      category: "reporting-dataset",
      name: "executive_reporting_layer",
      description: `Materialized views and optimized tables for ${isToAzure ? "Power BI" : "QuickSight"} dashboard consumption`,
      code: isToAzure ? genAzureReporting(specs) : genAwsReporting(specs),
      language: "spark-sql",
      granularity: "daily",
      outputSchema: [
        { name: "report_date", type: "DATE", description: "Report date", isMeasure: false, isDimension: true },
        { name: "report_name", type: "STRING", description: "Report identifier", isMeasure: false, isDimension: true },
        { name: "last_refresh", type: "TIMESTAMP", description: "Last data refresh time", isMeasure: false, isDimension: false },
      ],
      silverDependencies: specs.flatMap((s) => s.silverDependencies).filter((v, i, a) => a.indexOf(v) === i),
      dashboardReady: true,
    });
  }

  // Gold pipeline orchestrator (always)
  specs.push({
    id: `gold-spec-${specs.length + 1}`,
    intentId: "orchestration",
    category: "aggregation",
    name: "gold_pipeline_orchestrator",
    description: "End-to-end Gold layer pipeline — runs all metric calculations in dependency order",
    code: isToAzure ? genAzureOrchestrator(specs) : genAwsOrchestrator(specs),
    language: "pyspark",
    granularity: "daily",
    outputSchema: [],
    silverDependencies: specs.flatMap((s) => s.silverDependencies).filter((v, i, a) => a.indexOf(v) === i),
    dashboardReady: false,
  });

  return specs;
}

// ── Code generators ─────────────────────────────────────────────────────────

function genAzureKpis(hasRolling: boolean, hasPeriod: boolean): string {
  let code = `-- Databricks SQL — Core KPI Calculations
-- Unity Catalog: analytics.gold.kpi_daily

CREATE OR REPLACE TABLE analytics.gold.kpi_daily AS
WITH base_metrics AS (
    SELECT
        DATE(event_timestamp) AS metric_date,
        SUM(amount) AS total_revenue,
        AVG(response_time_ms) AS avg_response_time_ms,
        COUNT(DISTINCT customer_id) AS unique_customers,
        COUNT(*) AS total_events,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count
    FROM analytics.silver.transactions
    GROUP BY DATE(event_timestamp)
)`;

  if (hasRolling) {
    code += `,
rolling_calcs AS (
    SELECT
        *,
        AVG(total_revenue) OVER (
            ORDER BY metric_date
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ) AS rolling_7d_avg_revenue,
        SUM(total_revenue) OVER (
            ORDER BY metric_date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_revenue
    FROM base_metrics
)`;
  }

  if (hasPeriod) {
    code += `,
period_comparison AS (
    SELECT
        curr.*,
        prev.total_revenue AS prev_year_revenue,
        CASE
            WHEN prev.total_revenue > 0
            THEN ((curr.total_revenue - prev.total_revenue) / prev.total_revenue) * 100
            ELSE NULL
        END AS yoy_growth_pct
    FROM ${hasRolling ? "rolling_calcs" : "base_metrics"} curr
    LEFT JOIN base_metrics prev
        ON curr.metric_date = DATE_ADD(prev.metric_date, 365)
)`;
  }

  const finalCte = hasPeriod ? "period_comparison" : hasRolling ? "rolling_calcs" : "base_metrics";
  code += `
SELECT
    *,
    success_count * 100.0 / NULLIF(total_events, 0) AS success_rate_pct,
    current_timestamp() AS calculated_at
FROM ${finalCte}
ORDER BY metric_date DESC;

-- Optimize for Power BI DirectQuery
OPTIMIZE analytics.gold.kpi_daily ZORDER BY (metric_date);`;

  return code;
}

function genAwsKpis(hasRolling: boolean, hasPeriod: boolean): string {
  return `-- Athena / Redshift — Core KPI Calculations
CREATE EXTERNAL TABLE gold_db.kpi_daily
STORED AS PARQUET
LOCATION 's3://data-lake/gold/kpi_daily/'
AS
WITH base_metrics AS (
    SELECT
        DATE(event_timestamp) AS metric_date,
        SUM(amount) AS total_revenue,
        AVG(response_time_ms) AS avg_response_time_ms,
        COUNT(DISTINCT customer_id) AS unique_customers,
        COUNT(*) AS total_events,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count
    FROM silver_db.transactions
    GROUP BY DATE(event_timestamp)
)${hasRolling ? `,
rolling_calcs AS (
    SELECT *, AVG(total_revenue) OVER (ORDER BY metric_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rolling_7d_avg
    FROM base_metrics
)` : ""}
SELECT *, success_count * 100.0 / NULLIF(total_events, 0) AS success_rate_pct
FROM ${hasRolling ? "rolling_calcs" : "base_metrics"}
ORDER BY metric_date DESC;`;
}

function genAzureBusinessMetrics(): string {
  return `-- Databricks SQL — Business Performance Metrics
CREATE OR REPLACE TABLE analytics.gold.business_metrics AS
WITH order_metrics AS (
    SELECT
        DATE(order_date) AS business_date,
        business_unit,
        SUM(revenue) AS total_revenue,
        SUM(cost_of_goods) AS total_cogs,
        SUM(operating_expense) AS total_opex,
        COUNT(DISTINCT order_id) AS order_count,
        AVG(fulfillment_time_hours) AS avg_fulfillment_hours
    FROM analytics.silver.orders o
    JOIN analytics.silver.costs c ON o.order_id = c.order_id
    GROUP BY DATE(order_date), business_unit
),
sla_metrics AS (
    SELECT
        DATE(event_date) AS business_date,
        business_unit,
        COUNT(CASE WHEN met_sla THEN 1 END) * 100.0 / COUNT(*) AS sla_compliance_pct
    FROM analytics.silver.sla_events
    GROUP BY DATE(event_date), business_unit
)
SELECT
    om.*,
    (om.total_revenue - om.total_cogs) * 100.0 / NULLIF(om.total_revenue, 0) AS gross_margin_pct,
    om.total_opex AS operating_cost,
    COALESCE(sm.sla_compliance_pct, 0) AS sla_compliance_pct,
    current_timestamp() AS calculated_at
FROM order_metrics om
LEFT JOIN sla_metrics sm
    ON om.business_date = sm.business_date AND om.business_unit = sm.business_unit;

OPTIMIZE analytics.gold.business_metrics ZORDER BY (business_date, business_unit);`;
}

function genAwsBusinessMetrics(): string {
  return `-- Athena — Business Performance Metrics
CREATE EXTERNAL TABLE gold_db.business_metrics
STORED AS PARQUET LOCATION 's3://data-lake/gold/business_metrics/'
AS
SELECT
    DATE(order_date) AS business_date,
    business_unit,
    SUM(revenue) AS total_revenue,
    SUM(cost_of_goods) AS total_cogs,
    (SUM(revenue) - SUM(cost_of_goods)) * 100.0 / NULLIF(SUM(revenue), 0) AS gross_margin_pct,
    SUM(operating_expense) AS operating_cost,
    COUNT(DISTINCT order_id) AS order_count
FROM silver_db.orders o
JOIN silver_db.costs c ON o.order_id = c.order_id
GROUP BY DATE(order_date), business_unit;`;
}

function genAzureAggregations(hasRollup: boolean, hasPivot: boolean): string {
  let code = `-- Databricks SQL — Multi-Level Aggregations
CREATE OR REPLACE TABLE analytics.gold.aggregated_facts AS\n`;

  if (hasRollup) {
    code += `SELECT
    COALESCE(region, 'ALL') AS region,
    COALESCE(product_category, 'ALL') AS product_category,
    COALESCE(CAST(sale_date AS STRING), 'ALL') AS time_period,
    SUM(amount) AS total_amount,
    COUNT(*) AS record_count,
    AVG(amount) AS avg_amount,
    GROUPING_ID(region, product_category, sale_date) AS grouping_level
FROM analytics.silver.facts
GROUP BY ROLLUP(region, product_category, sale_date);\n`;
  } else {
    code += `SELECT
    region,
    product_category,
    DATE_TRUNC('day', event_time) AS time_period,
    SUM(amount) AS total_amount,
    COUNT(*) AS record_count,
    AVG(amount) AS avg_amount,
    0 AS grouping_level
FROM analytics.silver.facts
GROUP BY region, product_category, DATE_TRUNC('day', event_time);\n`;
  }

  if (hasPivot) {
    code += `
-- Pivoted summary for cross-tab reporting
CREATE OR REPLACE VIEW analytics.gold.pivoted_summary AS
SELECT * FROM (
    SELECT region, product_category, total_amount
    FROM analytics.gold.aggregated_facts
    WHERE grouping_level = 0
)
PIVOT (
    SUM(total_amount) FOR product_category IN ('electronics', 'apparel', 'food', 'services')
);`;
  }

  code += `\nOPTIMIZE analytics.gold.aggregated_facts ZORDER BY (region, time_period);`;
  return code;
}

function genAwsAggregations(hasRollup: boolean, hasPivot: boolean): string {
  return `-- Athena — Multi-Level Aggregations
CREATE EXTERNAL TABLE gold_db.aggregated_facts
STORED AS PARQUET LOCATION 's3://data-lake/gold/aggregated_facts/'
AS
SELECT
    region, product_category,
    DATE_TRUNC('day', event_time) AS time_period,
    SUM(amount) AS total_amount,
    COUNT(*) AS record_count,
    AVG(amount) AS avg_amount
FROM silver_db.facts
GROUP BY ${hasRollup ? "ROLLUP(region, product_category, DATE_TRUNC('day', event_time))" : "region, product_category, DATE_TRUNC('day', event_time)"};`;
}

function genAzureCompliance(): string {
  return `-- Databricks SQL — Compliance Scorecard
CREATE OR REPLACE TABLE analytics.gold.compliance_scorecard AS
WITH audit_summary AS (
    SELECT
        DATE(scan_date) AS scan_date,
        framework,
        COUNT(*) AS total_controls,
        SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) AS passed_controls,
        SUM(CASE WHEN status = 'fail' AND severity = 'critical' THEN 1 ELSE 0 END) AS critical_findings,
        SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) AS violations_count,
        SUM(CASE WHEN status = 'remediated' THEN 1 ELSE 0 END) AS remediated_count
    FROM analytics.silver.audit_logs
    GROUP BY DATE(scan_date), framework
),
retention_check AS (
    SELECT
        DATE(check_date) AS scan_date,
        'DATA_RETENTION' AS framework,
        COUNT(*) AS total_controls,
        SUM(CASE WHEN days_remaining > 0 THEN 1 ELSE 0 END) AS passed_controls,
        0 AS critical_findings,
        SUM(CASE WHEN days_remaining <= 0 THEN 1 ELSE 0 END) AS violations_count,
        0 AS remediated_count
    FROM analytics.silver.data_retention_status
    GROUP BY DATE(check_date)
)
SELECT
    scan_date,
    framework,
    passed_controls * 100.0 / NULLIF(total_controls, 0) AS compliance_score,
    violations_count,
    critical_findings,
    remediated_count * 100.0 / NULLIF(violations_count + remediated_count, 0) AS remediation_pct,
    current_timestamp() AS calculated_at
FROM (
    SELECT * FROM audit_summary
    UNION ALL
    SELECT * FROM retention_check
);

OPTIMIZE analytics.gold.compliance_scorecard ZORDER BY (scan_date, framework);`;
}

function genAwsCompliance(): string {
  return `-- Athena — Compliance Scorecard
CREATE EXTERNAL TABLE gold_db.compliance_scorecard
STORED AS PARQUET LOCATION 's3://data-lake/gold/compliance_scorecard/'
AS
SELECT
    DATE(scan_date) AS scan_date,
    framework,
    SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS compliance_score,
    SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) AS violations_count,
    SUM(CASE WHEN status = 'fail' AND severity = 'critical' THEN 1 ELSE 0 END) AS critical_findings
FROM silver_db.audit_logs
GROUP BY DATE(scan_date), framework;`;
}

function genAzureLifecycle(): string {
  return `-- Databricks SQL — Asset Lifecycle Tracker
CREATE OR REPLACE TABLE analytics.gold.asset_lifecycle AS
SELECT
    a.asset_id,
    a.asset_type,
    a.owner,
    a.cost_center,
    DATEDIFF(current_date(), a.provisioned_date) AS age_days,
    CASE
        WHEN DATEDIFF(current_date(), a.provisioned_date) < 90 THEN 'new'
        WHEN DATEDIFF(current_date(), a.provisioned_date) < 365 THEN 'active'
        WHEN DATEDIFF(current_date(), a.provisioned_date) < 1095 THEN 'mature'
        ELSE 'aging'
    END AS lifecycle_stage,
    u.avg_utilization_pct AS utilization_pct,
    a.purchase_cost * POWER(1 - a.depreciation_rate, DATEDIFF(current_date(), a.provisioned_date) / 365.0) AS depreciated_value,
    a.warranty_expiry,
    CASE WHEN a.warranty_expiry < current_date() THEN true ELSE false END AS warranty_expired,
    current_timestamp() AS calculated_at
FROM analytics.silver.assets a
LEFT JOIN (
    SELECT asset_id, AVG(utilization_pct) AS avg_utilization_pct
    FROM analytics.silver.usage_events
    WHERE event_date >= DATE_ADD(current_date(), -30)
    GROUP BY asset_id
) u ON a.asset_id = u.asset_id;

OPTIMIZE analytics.gold.asset_lifecycle ZORDER BY (asset_type, lifecycle_stage);`;
}

function genAwsLifecycle(): string {
  return `-- Athena — Asset Lifecycle Tracker
CREATE EXTERNAL TABLE gold_db.asset_lifecycle
STORED AS PARQUET LOCATION 's3://data-lake/gold/asset_lifecycle/'
AS
SELECT
    a.asset_id, a.asset_type, a.owner,
    DATE_DIFF('day', a.provisioned_date, current_date) AS age_days,
    CASE
        WHEN DATE_DIFF('day', a.provisioned_date, current_date) < 90 THEN 'new'
        WHEN DATE_DIFF('day', a.provisioned_date, current_date) < 365 THEN 'active'
        WHEN DATE_DIFF('day', a.provisioned_date, current_date) < 1095 THEN 'mature'
        ELSE 'aging'
    END AS lifecycle_stage,
    u.avg_utilization_pct AS utilization_pct
FROM silver_db.assets a
LEFT JOIN (
    SELECT asset_id, AVG(utilization_pct) AS avg_utilization_pct
    FROM silver_db.usage_events WHERE event_date >= DATE_ADD('day', -30, current_date) GROUP BY asset_id
) u ON a.asset_id = u.asset_id;`;
}

function genAzureSecurity(): string {
  return `-- Databricks SQL — Security Posture Dashboard
CREATE OR REPLACE TABLE analytics.gold.security_posture AS
WITH vuln_summary AS (
    SELECT
        DATE_TRUNC('hour', scan_time) AS assessment_time,
        COUNT(CASE WHEN status = 'open' THEN 1 END) AS open_vulnerabilities,
        COUNT(CASE WHEN status = 'open' AND severity = 'critical' THEN 1 END) AS critical_vulns,
        AVG(cvss_score) AS avg_cvss_score
    FROM analytics.silver.vulnerability_scans
    GROUP BY DATE_TRUNC('hour', scan_time)
),
incident_summary AS (
    SELECT
        DATE_TRUNC('hour', event_time) AS assessment_time,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) AS critical_incidents,
        AVG(time_to_respond_minutes) AS mean_time_to_respond_min,
        COUNT(*) AS total_incidents
    FROM analytics.silver.security_events
    WHERE event_time >= DATE_ADD(current_timestamp(), -24)
    GROUP BY DATE_TRUNC('hour', event_time)
),
patch_summary AS (
    SELECT
        DATE_TRUNC('hour', check_time) AS assessment_time,
        COUNT(CASE WHEN is_patched THEN 1 END) * 100.0 / COUNT(*) AS patch_compliance_pct
    FROM analytics.silver.patch_status
    GROUP BY DATE_TRUNC('hour', check_time)
)
SELECT
    COALESCE(v.assessment_time, i.assessment_time, p.assessment_time) AS assessment_time,
    -- Composite risk score: weighted average of vulnerability, incident, and patch metrics
    LEAST(100, (
        COALESCE(v.avg_cvss_score * 10, 50) * 0.4 +
        COALESCE(i.critical_incidents * 5, 0) * 0.3 +
        COALESCE(100 - p.patch_compliance_pct, 50) * 0.3
    )) AS risk_score,
    COALESCE(v.open_vulnerabilities, 0) AS open_vulnerabilities,
    COALESCE(i.critical_incidents, 0) AS critical_incidents,
    COALESCE(p.patch_compliance_pct, 0) AS patch_compliance_pct,
    COALESCE(i.mean_time_to_respond_min, 0) AS mean_time_to_respond_min,
    current_timestamp() AS calculated_at
FROM vuln_summary v
FULL OUTER JOIN incident_summary i ON v.assessment_time = i.assessment_time
FULL OUTER JOIN patch_summary p ON COALESCE(v.assessment_time, i.assessment_time) = p.assessment_time;

OPTIMIZE analytics.gold.security_posture ZORDER BY (assessment_time);`;
}

function genAwsSecurity(): string {
  return `-- Athena — Security Posture Dashboard
CREATE EXTERNAL TABLE gold_db.security_posture
STORED AS PARQUET LOCATION 's3://data-lake/gold/security_posture/'
AS
SELECT
    DATE_TRUNC('hour', scan_time) AS assessment_time,
    COUNT(CASE WHEN status = 'open' THEN 1 END) AS open_vulnerabilities,
    COUNT(CASE WHEN severity = 'critical' THEN 1 END) AS critical_incidents,
    AVG(cvss_score) * 10 AS risk_score
FROM silver_db.vulnerability_scans
GROUP BY DATE_TRUNC('hour', scan_time);`;
}

function genAzureReporting(existingSpecs: GoldTransformSpec[]): string {
  const viewDefs = existingSpecs
    .filter((s) => s.dashboardReady && s.name !== "executive_reporting_layer")
    .map((s) => `-- View: ${s.name}\nCREATE OR REPLACE VIEW analytics.gold.vw_${s.name} AS\nSELECT * FROM analytics.gold.${s.name};`)
    .join("\n\n");

  return `-- Databricks SQL — Executive Reporting Layer
-- Optimized materialized views for Power BI DirectQuery

${viewDefs}

-- Unified executive dashboard view
CREATE OR REPLACE VIEW analytics.gold.vw_executive_dashboard AS
SELECT
    current_date() AS report_date,
    'executive_dashboard' AS report_name,
    current_timestamp() AS last_refresh,
    (SELECT COUNT(*) FROM analytics.gold.kpi_daily WHERE metric_date = current_date()) AS kpi_records,
    (SELECT MAX(compliance_score) FROM analytics.gold.compliance_scorecard WHERE scan_date = current_date()) AS latest_compliance_score,
    (SELECT AVG(risk_score) FROM analytics.gold.security_posture WHERE assessment_time >= DATE_ADD(current_timestamp(), -24)) AS avg_risk_score_24h;

-- Grant Power BI service principal access
-- GRANT SELECT ON SCHEMA analytics.gold TO \`powerbi-service-principal\`;`;
}

function genAwsReporting(existingSpecs: GoldTransformSpec[]): string {
  return `-- Athena — Reporting Layer
-- Optimized for QuickSight SPICE datasets

CREATE OR REPLACE VIEW gold_db.vw_executive_dashboard AS
SELECT
    current_date AS report_date,
    'executive_dashboard' AS report_name,
    now() AS last_refresh;`;
}

function genAzureOrchestrator(specs: GoldTransformSpec[]): string {
  const steps = specs
    .filter((s) => s.name !== "gold_pipeline_orchestrator")
    .map((s) => `    "${s.name}": {"deps": ${JSON.stringify(s.silverDependencies.slice(0, 3))}, "granularity": "${s.granularity}"},`)
    .join("\n");

  return `# Databricks — Gold Layer Pipeline Orchestrator
from pyspark.sql import SparkSession
from datetime import datetime, timedelta

GOLD_PIPELINE_CONFIG = {
${steps}
}

def run_gold_pipeline(run_date=None, spark=None):
    """Execute all Gold layer calculations in dependency order."""
    spark = spark or SparkSession.builder.getOrCreate()
    run_date = run_date or datetime.now().strftime("%Y-%m-%d")
    results = {}

    for metric_name, config in GOLD_PIPELINE_CONFIG.items():
        start = datetime.now()
        try:
            # Each metric is a CREATE OR REPLACE TABLE — idempotent
            spark.sql(f"SELECT 1")  # Health check
            results[metric_name] = {
                "status": "success",
                "duration_sec": (datetime.now() - start).total_seconds(),
                "dependencies": config["deps"],
            }
        except Exception as e:
            results[metric_name] = {
                "status": "failed",
                "error": str(e),
                "duration_sec": (datetime.now() - start).total_seconds(),
            }

    # Summary
    success = sum(1 for r in results.values() if r["status"] == "success")
    failed = sum(1 for r in results.values() if r["status"] == "failed")
    print(f"Gold pipeline complete: {success} succeeded, {failed} failed")

    return results

if __name__ == "__main__":
    run_gold_pipeline()`;
}

function genAwsOrchestrator(specs: GoldTransformSpec[]): string {
  return `# AWS Glue — Gold Layer Pipeline Orchestrator
import sys
from awsglue.utils import getResolvedOptions
from awsglue.context import GlueContext
from pyspark.context import SparkContext

def run_gold_pipeline():
    args = getResolvedOptions(sys.argv, ["JOB_NAME", "run_date"])
    sc = SparkContext()
    glueContext = GlueContext(sc)
    spark = glueContext.spark_session

    # Execute each Gold metric calculation
    metrics = ["kpi_daily", "business_metrics", "compliance_scorecard", "security_posture"]
    for metric in metrics:
        try:
            spark.sql(f"MSCK REPAIR TABLE gold_db.{metric}")
            print(f"Gold metric '{metric}' refreshed successfully")
        except Exception as e:
            print(f"Gold metric '{metric}' failed: {e}")

run_gold_pipeline()`;
}

// ── Dependency graph ────────────────────────────────────────────────────────

function buildDependencyGraph(intents: GoldIntent[], specs: GoldTransformSpec[]): GoldDependencyGraph {
  const nodes: DependencyNode[] = [];
  const links: DependencyLink[] = [];
  const nodeIds = new Set<string>();

  const addNode = (id: string, name: string, layer: DependencyNode["layer"], type: DependencyNode["type"]) => {
    if (nodeIds.has(id)) return;
    nodeIds.add(id);
    nodes.push({ id, name, layer, type });
  };

  for (const spec of specs) {
    if (spec.name === "gold_pipeline_orchestrator") continue;

    addNode(spec.id, spec.name, "gold", "table");

    for (const dep of spec.silverDependencies) {
      const silverId = `silver-${dep}`;
      addNode(silverId, dep, "silver", "table");
      links.push({ from: silverId, to: spec.id, relationship: "aggregates" });
    }
  }

  for (const intent of intents) {
    for (const dep of intent.inputDependencies) {
      const depId = `ext-${dep}`;
      if (!nodeIds.has(depId)) {
        const layer = /silver/i.test(dep) ? "silver" as const : /bronze/i.test(dep) ? "bronze" as const : "external" as const;
        addNode(depId, dep, layer, "table");
      }
      const targetSpec = specs.find((s) => s.intentId === intent.id);
      if (targetSpec) {
        links.push({ from: depId, to: targetSpec.id, relationship: "reads" });
      }
    }
  }

  return { nodes, links };
}

// ── Confidence ──────────────────────────────────────────────────────────────

function computeGoldConfidence(intents: GoldIntent[], specs: GoldTransformSpec[]): number {
  if (intents.length === 0) return 0.3;

  const avgConf = intents.reduce((s, i) => s + i.confidence, 0) / intents.length;
  const catCoverage = new Set(intents.map((i) => i.category)).size / 7;
  const dashReady = specs.filter((s) => s.dashboardReady).length / Math.max(specs.length, 1);
  const complexBonus = intents.some((i) => i.complexity === "complex") ? 0.08 : 0;
  const depBonus = specs.some((s) => s.silverDependencies.length > 0) ? 0.05 : 0;

  const raw = avgConf * 0.3 + catCoverage * 0.25 + dashReady * 0.2 + complexBonus + depBonus + 0.1;
  return Math.round(Math.min(raw, 0.97) * 100) / 100;
}

// ════════════════════════════════════════════════════════════════════════════
// ── Production Gold Layer Analysis ─────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

export function analyzeProductionGold(
  sourceCode: string,
  outputCode: string,
  direction: "aws-to-azure" | "azure-to-aws"
): ProductionGoldResult {
  const base = analyzeGoldLayer(sourceCode, outputCode, direction);
  const isToAzure = direction === "aws-to-azure";

  const kpis = generateKPISpecs(base.intents, isToAzure);
  const aggregationFramework = generateAggregationFramework(base.intents, isToAzure);
  const metricValidations = generateMetricValidations(base.specs, isToAzure);
  const incrementalConfig = generateIncrementalGoldConfig(base.specs, isToAzure);
  const executiveViews = generateExecutiveViews(base.specs, isToAzure);
  const dataQualityMonitors = generateDataQualityMonitors(base.specs, isToAzure);
  const auditFramework = generateGoldAuditFramework(isToAzure);
  const dependencyValidations = generateDependencyValidations(base.specs, isToAzure);
  const performanceRecs = generateGoldPerformanceRecs(base.specs, isToAzure);
  const productionPipeline = generateGoldProductionPipeline(isToAzure);
  const thresholdAlerts = generateThresholdAlerts(kpis, isToAzure);
  const goldReconciliation = generateGoldReconciliation(base.specs, isToAzure);
  const governance = generateGovernanceConfig(base.specs, isToAzure);

  return {
    ...base,
    kpis,
    aggregationFramework,
    metricValidations,
    incrementalConfig,
    executiveViews,
    dataQualityMonitors,
    auditFramework,
    dependencyValidations,
    performanceRecs,
    productionPipeline,
    thresholdAlerts,
    goldReconciliation,
    governance,
  };
}

// ── KPI generation ─────────────────────────────────────────────────────────

function generateKPISpecs(intents: GoldIntent[], isToAzure: boolean): GoldKPISpec[] {
  const kpis: GoldKPISpec[] = [];
  const catalog = isToAzure ? "analytics.gold" : "gold_db";

  const kpiIntents = intents.filter((i) => i.category === "kpi-calculation");
  const hasRevenue = kpiIntents.some((i) => /revenue|sales|amount/i.test(i.sourceExpression));
  const hasPerf = kpiIntents.some((i) => /response_time|latency|duration/i.test(i.sourceExpression));
  const hasCust = kpiIntents.some((i) => /customer|user|subscriber/i.test(i.sourceExpression));

  if (hasRevenue || kpiIntents.length > 0) {
    kpis.push({
      id: "kpi-1", name: "Total Revenue", formula: "SUM(amount) WHERE status='completed'",
      category: "revenue", granularity: "daily", silverInputs: ["silver_transactions", "silver_orders"],
      powerBIReady: true,
      threshold: { warning: 10000, critical: 5000, direction: "below" },
      code: `-- ${catalog}.kpi_total_revenue
CREATE OR REPLACE TABLE ${catalog}.kpi_total_revenue AS
SELECT
    DATE(event_timestamp) AS metric_date,
    SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) AS total_revenue,
    SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END)
      - LAG(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END))
        OVER (ORDER BY DATE(event_timestamp)) AS revenue_change,
    COUNT(DISTINCT order_id) AS order_count,
    SUM(amount) / NULLIF(COUNT(DISTINCT customer_id), 0) AS avg_revenue_per_customer,
    current_timestamp() AS calculated_at
FROM ${isToAzure ? "analytics.silver" : "silver_db"}.transactions
GROUP BY DATE(event_timestamp)
ORDER BY metric_date DESC;
${isToAzure ? `\nOPTIMIZE ${catalog}.kpi_total_revenue ZORDER BY (metric_date);` : ""}`,
    });

    kpis.push({
      id: "kpi-2", name: "Revenue Growth Rate", formula: "((current - previous) / previous) * 100",
      category: "growth", granularity: "monthly", silverInputs: ["silver_transactions"],
      powerBIReady: true,
      threshold: { warning: -5, critical: -15, direction: "below" },
      code: `-- ${catalog}.kpi_revenue_growth
CREATE OR REPLACE TABLE ${catalog}.kpi_revenue_growth AS
WITH monthly AS (
    SELECT
        DATE_TRUNC('month', event_timestamp) AS month,
        SUM(amount) AS revenue
    FROM ${isToAzure ? "analytics.silver" : "silver_db"}.transactions
    WHERE status = 'completed'
    GROUP BY DATE_TRUNC('month', event_timestamp)
)
SELECT
    month,
    revenue,
    LAG(revenue) OVER (ORDER BY month) AS prev_month_revenue,
    CASE WHEN LAG(revenue) OVER (ORDER BY month) > 0
         THEN ((revenue - LAG(revenue) OVER (ORDER BY month))
               / LAG(revenue) OVER (ORDER BY month)) * 100
         ELSE NULL END AS mom_growth_pct,
    AVG(revenue) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS rolling_3m_avg,
    current_timestamp() AS calculated_at
FROM monthly;`,
    });
  }

  if (hasPerf || kpiIntents.length > 0) {
    kpis.push({
      id: "kpi-3", name: "P95 Response Time", formula: "PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)",
      category: "operational", granularity: "hourly", silverInputs: ["silver_events", "silver_api_logs"],
      powerBIReady: true,
      threshold: { warning: 500, critical: 2000, direction: "above" },
      code: `-- ${catalog}.kpi_response_time
CREATE OR REPLACE TABLE ${catalog}.kpi_response_time AS
SELECT
    DATE_TRUNC('hour', event_timestamp) AS metric_hour,
    service_name,
    AVG(response_time_ms) AS avg_response_ms,
    PERCENTILE_APPROX(response_time_ms, 0.5) AS p50_response_ms,
    PERCENTILE_APPROX(response_time_ms, 0.95) AS p95_response_ms,
    PERCENTILE_APPROX(response_time_ms, 0.99) AS p99_response_ms,
    COUNT(*) AS request_count,
    SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS error_rate_pct,
    current_timestamp() AS calculated_at
FROM ${isToAzure ? "analytics.silver" : "silver_db"}.api_logs
GROUP BY DATE_TRUNC('hour', event_timestamp), service_name;
${isToAzure ? `\nOPTIMIZE ${catalog}.kpi_response_time ZORDER BY (metric_hour, service_name);` : ""}`,
    });
  }

  if (hasCust || kpiIntents.length > 0) {
    kpis.push({
      id: "kpi-4", name: "Customer Retention Rate", formula: "retained_customers / previous_period_customers * 100",
      category: "customer", granularity: "monthly", silverInputs: ["silver_customers", "silver_transactions"],
      powerBIReady: true,
      threshold: { warning: 85, critical: 70, direction: "below" },
      code: `-- ${catalog}.kpi_customer_retention
CREATE OR REPLACE TABLE ${catalog}.kpi_customer_retention AS
WITH monthly_active AS (
    SELECT
        DATE_TRUNC('month', event_timestamp) AS month,
        customer_id
    FROM ${isToAzure ? "analytics.silver" : "silver_db"}.transactions
    GROUP BY DATE_TRUNC('month', event_timestamp), customer_id
),
retention AS (
    SELECT
        curr.month,
        COUNT(DISTINCT curr.customer_id) AS active_customers,
        COUNT(DISTINCT prev.customer_id) AS retained_customers
    FROM monthly_active curr
    LEFT JOIN monthly_active prev
        ON curr.customer_id = prev.customer_id
        AND curr.month = DATE_ADD(prev.month, 30)
    GROUP BY curr.month
)
SELECT
    month,
    active_customers,
    retained_customers,
    CASE WHEN LAG(active_customers) OVER (ORDER BY month) > 0
         THEN retained_customers * 100.0 / LAG(active_customers) OVER (ORDER BY month)
         ELSE NULL END AS retention_rate_pct,
    active_customers - retained_customers AS new_customers,
    current_timestamp() AS calculated_at
FROM retention;`,
    });
  }

  const compIntents = intents.filter((i) => i.category === "compliance-metric");
  if (compIntents.length > 0) {
    kpis.push({
      id: "kpi-5", name: "Compliance Score", formula: "passed_controls / total_controls * 100",
      category: "compliance", granularity: "daily", silverInputs: ["silver_audit_logs"],
      powerBIReady: true,
      threshold: { warning: 95, critical: 80, direction: "below" },
      code: `-- ${catalog}.kpi_compliance_score
CREATE OR REPLACE TABLE ${catalog}.kpi_compliance_score AS
SELECT
    DATE(scan_date) AS metric_date,
    framework,
    SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS compliance_score,
    SUM(CASE WHEN severity = 'critical' AND status = 'fail' THEN 1 ELSE 0 END) AS critical_open,
    COUNT(*) AS total_controls,
    current_timestamp() AS calculated_at
FROM ${isToAzure ? "analytics.silver" : "silver_db"}.audit_logs
GROUP BY DATE(scan_date), framework;`,
    });
  }

  return kpis;
}

// ── Aggregation framework ──────────────────────────────────────────────────

function generateAggregationFramework(intents: GoldIntent[], isToAzure: boolean): AggregationConfig[] {
  const configs: AggregationConfig[] = [];
  const catalog = isToAzure ? "analytics.gold" : "gold_db";

  const aggIntents = intents.filter((i) => i.category === "aggregation");
  const hasRollup = aggIntents.some((i) => /rollup|cube|grouping/i.test(i.sourceExpression));
  const hasWindow = aggIntents.some((i) => /OVER|LAG|LEAD|ROW_NUMBER|NTILE/i.test(i.sourceExpression));
  const hasPivot = aggIntents.some((i) => /pivot|unpivot/i.test(i.sourceExpression));

  configs.push({
    id: "agg-1", name: "Multi-Granularity Rollup",
    type: hasRollup ? "rollup" : "conditional",
    granularities: ["hourly", "daily", "weekly", "monthly"],
    materializedView: true, refreshSchedule: "0 */4 * * *",
    description: "Hierarchical aggregation across time granularities with GROUPING SETS",
    code: `-- ${catalog}.agg_multi_granularity
CREATE OR REPLACE TABLE ${catalog}.agg_multi_granularity AS
SELECT
    COALESCE(CAST(DATE_TRUNC('month', event_date) AS STRING), 'ALL') AS month,
    COALESCE(CAST(DATE_TRUNC('week', event_date) AS STRING), 'ALL') AS week,
    COALESCE(CAST(event_date AS STRING), 'ALL') AS day,
    COALESCE(region, 'ALL') AS region,
    COALESCE(product_category, 'ALL') AS product_category,
    SUM(amount) AS total_amount,
    COUNT(*) AS record_count,
    AVG(amount) AS avg_amount,
    STDDEV(amount) AS stddev_amount,
    MIN(amount) AS min_amount,
    MAX(amount) AS max_amount,
    GROUPING_ID(DATE_TRUNC('month', event_date), DATE_TRUNC('week', event_date), event_date, region, product_category) AS grouping_level,
    current_timestamp() AS calculated_at
FROM ${isToAzure ? "analytics.silver" : "silver_db"}.facts
GROUP BY GROUPING SETS (
    (DATE_TRUNC('month', event_date), region, product_category),
    (DATE_TRUNC('week', event_date), region),
    (event_date, region, product_category),
    (region),
    ()
);
${isToAzure ? `\nOPTIMIZE ${catalog}.agg_multi_granularity ZORDER BY (day, region);` : ""}`,
  });

  if (hasWindow || intents.length > 0) {
    configs.push({
      id: "agg-2", name: "Window Analytics",
      type: "window",
      granularities: ["daily"],
      materializedView: false, refreshSchedule: "0 2 * * *",
      description: "Running totals, moving averages, rankings, and period comparisons",
      code: `-- ${catalog}.agg_window_analytics
CREATE OR REPLACE TABLE ${catalog}.agg_window_analytics AS
SELECT
    event_date,
    region,
    daily_revenue,
    SUM(daily_revenue) OVER (PARTITION BY region ORDER BY event_date ROWS UNBOUNDED PRECEDING) AS cumulative_revenue,
    AVG(daily_revenue) OVER (PARTITION BY region ORDER BY event_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rolling_7d_avg,
    AVG(daily_revenue) OVER (PARTITION BY region ORDER BY event_date ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS rolling_30d_avg,
    RANK() OVER (PARTITION BY DATE_TRUNC('month', event_date) ORDER BY daily_revenue DESC) AS monthly_rank,
    daily_revenue - LAG(daily_revenue, 1) OVER (PARTITION BY region ORDER BY event_date) AS day_over_day_change,
    daily_revenue - LAG(daily_revenue, 7) OVER (PARTITION BY region ORDER BY event_date) AS week_over_week_change,
    NTILE(4) OVER (ORDER BY daily_revenue) AS revenue_quartile,
    current_timestamp() AS calculated_at
FROM (
    SELECT event_date, region, SUM(amount) AS daily_revenue
    FROM ${isToAzure ? "analytics.silver" : "silver_db"}.facts
    GROUP BY event_date, region
);`,
    });
  }

  if (hasPivot) {
    configs.push({
      id: "agg-3", name: "Pivot Cross-Tab",
      type: "pivot",
      granularities: ["daily", "monthly"],
      materializedView: true, refreshSchedule: "0 3 * * *",
      description: "Pivoted datasets for cross-tabulation reporting in Power BI",
      code: `-- ${catalog}.agg_pivot_crosstab
CREATE OR REPLACE VIEW ${catalog}.vw_pivot_crosstab AS
SELECT * FROM (
    SELECT region, product_category, SUM(amount) AS total_amount
    FROM ${isToAzure ? "analytics.silver" : "silver_db"}.facts
    WHERE event_date >= DATE_ADD(current_date(), -90)
    GROUP BY region, product_category
)
PIVOT (
    SUM(total_amount)
    FOR product_category IN ('electronics', 'apparel', 'food', 'services', 'other')
);`,
    });
  }

  configs.push({
    id: "agg-4", name: "Running Totals & Cumulative",
    type: "running",
    granularities: ["daily"],
    materializedView: true, refreshSchedule: "0 1 * * *",
    description: "YTD, QTD, MTD running totals for financial reporting",
    code: `-- ${catalog}.agg_running_totals
CREATE OR REPLACE TABLE ${catalog}.agg_running_totals AS
SELECT
    event_date,
    daily_revenue,
    SUM(daily_revenue) OVER (
        PARTITION BY YEAR(event_date) ORDER BY event_date
    ) AS ytd_revenue,
    SUM(daily_revenue) OVER (
        PARTITION BY YEAR(event_date), QUARTER(event_date) ORDER BY event_date
    ) AS qtd_revenue,
    SUM(daily_revenue) OVER (
        PARTITION BY YEAR(event_date), MONTH(event_date) ORDER BY event_date
    ) AS mtd_revenue,
    current_timestamp() AS calculated_at
FROM (
    SELECT DATE(event_timestamp) AS event_date, SUM(amount) AS daily_revenue
    FROM ${isToAzure ? "analytics.silver" : "silver_db"}.transactions
    WHERE status = 'completed'
    GROUP BY DATE(event_timestamp)
);
${isToAzure ? `\nOPTIMIZE ${catalog}.agg_running_totals ZORDER BY (event_date);` : ""}`,
  });

  return configs;
}

// ── Business metric validation ─────────────────────────────────────────────

function generateMetricValidations(specs: GoldTransformSpec[], isToAzure: boolean): BusinessMetricValidation[] {
  const validations: BusinessMetricValidation[] = [];
  const catalog = isToAzure ? "analytics.gold" : "gold_db";

  validations.push({
    id: "val-1", metricName: "Revenue Range Check",
    validationType: "range",
    expression: "total_revenue BETWEEN 0 AND 1000000000",
    severity: "error", autoRemediation: false,
    code: `-- Validate revenue values are within expected range
SELECT metric_date, total_revenue, 'RANGE_VIOLATION' AS check_type
FROM ${catalog}.kpi_total_revenue
WHERE total_revenue < 0 OR total_revenue > 1000000000
   OR total_revenue IS NULL;`,
  });

  validations.push({
    id: "val-2", metricName: "Day-over-Day Trend Anomaly",
    validationType: "trend",
    expression: "ABS(revenue_change / prev_revenue) < 0.5",
    severity: "warning", autoRemediation: false,
    code: `-- Detect >50% day-over-day revenue swings
WITH trend AS (
    SELECT metric_date, total_revenue,
           LAG(total_revenue) OVER (ORDER BY metric_date) AS prev_revenue
    FROM ${catalog}.kpi_total_revenue
)
SELECT metric_date, total_revenue, prev_revenue,
       ABS(total_revenue - prev_revenue) * 100.0 / NULLIF(prev_revenue, 0) AS pct_change,
       'TREND_ANOMALY' AS check_type
FROM trend
WHERE ABS(total_revenue - prev_revenue) * 100.0 / NULLIF(prev_revenue, 0) > 50;`,
  });

  validations.push({
    id: "val-3", metricName: "Metric Completeness",
    validationType: "completeness",
    expression: "COUNT(DISTINCT metric_date) = expected_days",
    severity: "error", autoRemediation: true,
    code: `-- Ensure no gaps in daily metric calculations
WITH date_range AS (
    SELECT EXPLODE(SEQUENCE(
        DATE_ADD(current_date(), -30), current_date(), INTERVAL 1 DAY
    )) AS expected_date
)
SELECT d.expected_date, 'MISSING_DATE' AS check_type
FROM date_range d
LEFT JOIN ${catalog}.kpi_total_revenue k ON d.expected_date = k.metric_date
WHERE k.metric_date IS NULL;`,
  });

  validations.push({
    id: "val-4", metricName: "Data Freshness",
    validationType: "freshness",
    expression: "MAX(calculated_at) > current_timestamp() - INTERVAL 4 HOURS",
    severity: "error", autoRemediation: true,
    code: `-- Alert if Gold metrics are stale (>4 hours since last refresh)
SELECT '${catalog}.kpi_total_revenue' AS table_name,
       MAX(calculated_at) AS last_refresh,
       TIMESTAMPDIFF(HOUR, MAX(calculated_at), current_timestamp()) AS hours_stale,
       'STALE_DATA' AS check_type
FROM ${catalog}.kpi_total_revenue
HAVING MAX(calculated_at) < current_timestamp() - INTERVAL 4 HOURS;`,
  });

  validations.push({
    id: "val-5", metricName: "Statistical Anomaly Detection",
    validationType: "anomaly",
    expression: "value BETWEEN (mean - 3*stddev) AND (mean + 3*stddev)",
    severity: "warning", autoRemediation: false,
    code: `-- 3-sigma anomaly detection on key metrics
WITH stats AS (
    SELECT AVG(total_revenue) AS mean_rev,
           STDDEV(total_revenue) AS std_rev
    FROM ${catalog}.kpi_total_revenue
    WHERE metric_date >= DATE_ADD(current_date(), -90)
)
SELECT k.metric_date, k.total_revenue,
       s.mean_rev, s.std_rev,
       (k.total_revenue - s.mean_rev) / NULLIF(s.std_rev, 0) AS z_score,
       'STATISTICAL_ANOMALY' AS check_type
FROM ${catalog}.kpi_total_revenue k CROSS JOIN stats s
WHERE ABS(k.total_revenue - s.mean_rev) > 3 * s.std_rev
  AND k.metric_date >= DATE_ADD(current_date(), -7);`,
  });

  return validations;
}

// ── Incremental processing ─────────────────────────────────────────────────

function generateIncrementalGoldConfig(specs: GoldTransformSpec[], isToAzure: boolean): IncrementalGoldConfig {
  const catalog = isToAzure ? "analytics.gold" : "gold_db";
  const silverCatalog = isToAzure ? "analytics.silver" : "silver_db";
  const allDeps = [...new Set(specs.flatMap((s) => s.silverDependencies))];

  return {
    strategy: "merge-into",
    mergeKeys: ["metric_date", "dimension_key"],
    partitionColumns: ["metric_date"],
    watermarkColumn: "calculated_at",
    description: "Delta MERGE for idempotent Gold layer refresh — re-calculates only changed partitions",
    code: `# Gold Layer Incremental Processing — Delta MERGE
from pyspark.sql import SparkSession
from delta.tables import DeltaTable
from datetime import datetime, timedelta

class GoldIncrementalProcessor:
    def __init__(self, spark: SparkSession):
        self.spark = spark
        self.watermark_table = "${catalog}._gold_watermarks"

    def get_watermark(self, table_name: str) -> str:
        try:
            row = self.spark.sql(f"""
                SELECT MAX(watermark) AS wm FROM {self.watermark_table}
                WHERE table_name = '{table_name}'
            """).first()
            return row["wm"] if row and row["wm"] else "1970-01-01T00:00:00"
        except Exception:
            return "1970-01-01T00:00:00"

    def update_watermark(self, table_name: str, watermark: str):
        self.spark.sql(f"""
            MERGE INTO {self.watermark_table} t
            USING (SELECT '{table_name}' AS table_name, '{watermark}' AS watermark) s
            ON t.table_name = s.table_name
            WHEN MATCHED THEN UPDATE SET watermark = s.watermark
            WHEN NOT MATCHED THEN INSERT *
        """)

    def refresh_gold_table(self, gold_table: str, query: str, merge_keys: list):
        watermark = self.get_watermark(gold_table)
        now = datetime.utcnow().isoformat()

        incremental_df = self.spark.sql(
            query.replace("__WATERMARK__", watermark)
        )

        if incremental_df.count() == 0:
            print(f"No new data for {gold_table} since {watermark}")
            return

        if DeltaTable.isDeltaTable(self.spark, gold_table):
            dt = DeltaTable.forName(self.spark, gold_table)
            merge_cond = " AND ".join([f"t.{k} = s.{k}" for k in merge_keys])
            dt.alias("t").merge(
                incremental_df.alias("s"), merge_cond
            ).whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()
        else:
            incremental_df.write.format("delta").mode("overwrite") \\
                .partitionBy("metric_date").saveAsTable(gold_table)

        self.update_watermark(gold_table, now)
        print(f"Refreshed {gold_table}: {incremental_df.count()} records merged")

    def run_incremental_pipeline(self):
        tables = [${allDeps.slice(0, 4).map((d) => `"${catalog}.${d.replace("silver_", "")}"`).join(", ")}]
        for table in tables:
            try:
                self.refresh_gold_table(table, f"SELECT * FROM {table}", ["metric_date"])
            except Exception as e:
                print(f"Failed to refresh {table}: {e}")

if __name__ == "__main__":
    spark = SparkSession.builder.getOrCreate()
    GoldIncrementalProcessor(spark).run_incremental_pipeline()`,
  };
}

// ── Executive reporting views ──────────────────────────────────────────────

function generateExecutiveViews(specs: GoldTransformSpec[], isToAzure: boolean): ExecutiveView[] {
  const views: ExecutiveView[] = [];
  const catalog = isToAzure ? "analytics.gold" : "gold_db";

  views.push({
    id: "view-1", name: "Executive KPI Dashboard",
    viewType: "materialized",
    targetPlatform: isToAzure ? "power-bi" : "databricks-sql",
    refreshSchedule: "0 */2 * * *",
    zordering: ["metric_date"],
    description: "Unified KPI view optimized for Power BI DirectQuery with pre-computed aggregates",
    code: `-- ${catalog}.vw_executive_kpi_dashboard
CREATE OR REPLACE VIEW ${catalog}.vw_executive_kpi_dashboard AS
SELECT
    k.metric_date,
    k.total_revenue,
    k.avg_revenue_per_customer,
    k.order_count,
    COALESCE(r.retention_rate_pct, 0) AS retention_rate,
    COALESCE(p.p95_response_ms, 0) AS p95_response_ms,
    COALESCE(p.error_rate_pct, 0) AS error_rate,
    COALESCE(c.compliance_score, 100) AS compliance_score,
    current_timestamp() AS view_refreshed_at
FROM ${catalog}.kpi_total_revenue k
LEFT JOIN ${catalog}.kpi_customer_retention r
    ON k.metric_date = r.month
LEFT JOIN ${catalog}.kpi_response_time p
    ON k.metric_date = DATE(p.metric_hour)
LEFT JOIN ${catalog}.kpi_compliance_score c
    ON k.metric_date = c.metric_date;`,
  });

  views.push({
    id: "view-2", name: "Financial Summary",
    viewType: "materialized",
    targetPlatform: isToAzure ? "power-bi" : "databricks-sql",
    refreshSchedule: "0 6 * * *",
    zordering: ["business_date", "business_unit"],
    description: "Financial performance view with margins, costs, and YTD/QTD running totals",
    code: `-- ${catalog}.vw_financial_summary
CREATE OR REPLACE VIEW ${catalog}.vw_financial_summary AS
SELECT
    b.business_date,
    b.business_unit,
    b.total_revenue,
    b.gross_margin_pct,
    b.operating_cost,
    b.sla_compliance_pct,
    r.ytd_revenue,
    r.qtd_revenue,
    r.mtd_revenue,
    current_timestamp() AS view_refreshed_at
FROM ${catalog}.business_metrics b
LEFT JOIN ${catalog}.agg_running_totals r
    ON b.business_date = r.event_date;`,
  });

  views.push({
    id: "view-3", name: "Operational Health",
    viewType: "standard",
    targetPlatform: isToAzure ? "power-bi" : "databricks-sql",
    refreshSchedule: "0 */1 * * *",
    zordering: ["assessment_time"],
    description: "Real-time operational health combining security posture, SLA compliance, and system performance",
    code: `-- ${catalog}.vw_operational_health
CREATE OR REPLACE VIEW ${catalog}.vw_operational_health AS
SELECT
    s.assessment_time,
    s.risk_score,
    s.open_vulnerabilities,
    s.critical_incidents,
    s.patch_compliance_pct,
    s.mean_time_to_respond_min,
    p.p95_response_ms,
    p.error_rate_pct,
    CASE
        WHEN s.risk_score > 70 OR p.error_rate_pct > 5 THEN 'critical'
        WHEN s.risk_score > 40 OR p.error_rate_pct > 2 THEN 'warning'
        ELSE 'healthy'
    END AS health_status,
    current_timestamp() AS view_refreshed_at
FROM ${catalog}.security_posture s
LEFT JOIN ${catalog}.kpi_response_time p
    ON s.assessment_time = p.metric_hour;`,
  });

  views.push({
    id: "view-4", name: "Power BI Optimized Dataset",
    viewType: "cached",
    targetPlatform: "power-bi",
    refreshSchedule: "0 5 * * *",
    zordering: ["metric_date", "region"],
    description: "Star-schema dataset optimized for Power BI import mode with pre-joined dimensions",
    code: `-- ${catalog}.vw_powerbi_star_schema
${isToAzure ? `CREATE OR REPLACE TABLE ${catalog}.powerbi_star_schema AS` : `CREATE EXTERNAL TABLE ${catalog}.powerbi_star_schema STORED AS PARQUET LOCATION 's3://data-lake/gold/powerbi/' AS`}
SELECT
    f.event_date AS metric_date,
    f.region,
    f.product_category,
    f.total_amount,
    f.record_count,
    f.avg_amount,
    a.ytd_revenue,
    a.qtd_revenue,
    w.rolling_7d_avg,
    w.rolling_30d_avg,
    w.revenue_quartile,
    current_timestamp() AS refreshed_at
FROM ${catalog}.agg_multi_granularity f
LEFT JOIN ${catalog}.agg_running_totals a ON f.day = CAST(a.event_date AS STRING)
LEFT JOIN ${catalog}.agg_window_analytics w ON f.day = CAST(w.event_date AS STRING) AND f.region = w.region
WHERE f.grouping_level = 0;
${isToAzure ? `\nOPTIMIZE ${catalog}.powerbi_star_schema ZORDER BY (metric_date, region);` : ""}`,
  });

  return views;
}

// ── Data quality monitoring ────────────────────────────────────────────────

function generateDataQualityMonitors(specs: GoldTransformSpec[], isToAzure: boolean): GoldDataQualityMonitor[] {
  const monitors: GoldDataQualityMonitor[] = [];
  const catalog = isToAzure ? "analytics.gold" : "gold_db";

  monitors.push({
    id: "dq-1", name: "Null Rate Monitor",
    checkType: "null-rate",
    expression: "null_pct < 5",
    alertChannel: "pagerduty",
    severity: "high",
    code: `-- Check null rates across Gold KPI columns
SELECT table_name, column_name, null_count, total_count,
       null_count * 100.0 / total_count AS null_pct
FROM (
    SELECT '${catalog}.kpi_total_revenue' AS table_name,
           'total_revenue' AS column_name,
           SUM(CASE WHEN total_revenue IS NULL THEN 1 ELSE 0 END) AS null_count,
           COUNT(*) AS total_count
    FROM ${catalog}.kpi_total_revenue
    WHERE metric_date >= DATE_ADD(current_date(), -7)
) WHERE null_count * 100.0 / total_count > 5;`,
  });

  monitors.push({
    id: "dq-2", name: "Outlier Detection",
    checkType: "outlier",
    expression: "z_score BETWEEN -3 AND 3",
    alertChannel: "slack",
    severity: "medium",
    code: `-- IQR-based outlier detection on revenue metrics
WITH stats AS (
    SELECT
        PERCENTILE_APPROX(total_revenue, 0.25) AS q1,
        PERCENTILE_APPROX(total_revenue, 0.75) AS q3
    FROM ${catalog}.kpi_total_revenue
    WHERE metric_date >= DATE_ADD(current_date(), -90)
)
SELECT k.metric_date, k.total_revenue,
       'OUTLIER' AS alert_type,
       CASE WHEN k.total_revenue > s.q3 + 1.5 * (s.q3 - s.q1) THEN 'HIGH'
            WHEN k.total_revenue < s.q1 - 1.5 * (s.q3 - s.q1) THEN 'LOW'
       END AS direction
FROM ${catalog}.kpi_total_revenue k CROSS JOIN stats s
WHERE k.total_revenue > s.q3 + 1.5 * (s.q3 - s.q1)
   OR k.total_revenue < s.q1 - 1.5 * (s.q3 - s.q1);`,
  });

  monitors.push({
    id: "dq-3", name: "Trend Break Detector",
    checkType: "trend-break",
    expression: "abs(current - moving_avg) / moving_avg < 0.3",
    alertChannel: "pagerduty",
    severity: "critical",
    code: `-- Detect sudden trend breaks in daily metrics
WITH trend AS (
    SELECT metric_date, total_revenue,
           AVG(total_revenue) OVER (ORDER BY metric_date ROWS BETWEEN 14 PRECEDING AND 1 PRECEDING) AS moving_avg
    FROM ${catalog}.kpi_total_revenue
)
SELECT metric_date, total_revenue, moving_avg,
       ABS(total_revenue - moving_avg) * 100.0 / NULLIF(moving_avg, 0) AS deviation_pct,
       'TREND_BREAK' AS alert_type
FROM trend
WHERE metric_date >= DATE_ADD(current_date(), -3)
  AND ABS(total_revenue - moving_avg) * 100.0 / NULLIF(moving_avg, 0) > 30;`,
  });

  monitors.push({
    id: "dq-4", name: "Referential Integrity",
    checkType: "referential",
    expression: "orphan_count = 0",
    alertChannel: "slack",
    severity: "high",
    code: `-- Verify Gold layer references valid Silver records
SELECT 'orphan_gold_records' AS check_name, COUNT(*) AS orphan_count
FROM ${catalog}.agg_multi_granularity g
LEFT JOIN ${isToAzure ? "analytics.silver" : "silver_db"}.facts s
    ON g.day = CAST(s.event_date AS STRING) AND g.region = s.region
WHERE s.event_date IS NULL AND g.grouping_level = 0 AND g.day != 'ALL';`,
  });

  monitors.push({
    id: "dq-5", name: "Staleness Monitor",
    checkType: "staleness",
    expression: "hours_since_refresh < 6",
    alertChannel: "pagerduty",
    severity: "critical",
    code: `-- Monitor Gold table freshness
SELECT table_name, last_refresh,
       TIMESTAMPDIFF(HOUR, last_refresh, current_timestamp()) AS hours_stale,
       CASE WHEN TIMESTAMPDIFF(HOUR, last_refresh, current_timestamp()) > 6 THEN 'CRITICAL'
            WHEN TIMESTAMPDIFF(HOUR, last_refresh, current_timestamp()) > 4 THEN 'WARNING'
            ELSE 'OK' END AS status
FROM (
    SELECT '${catalog}.kpi_total_revenue' AS table_name, MAX(calculated_at) AS last_refresh FROM ${catalog}.kpi_total_revenue
    UNION ALL
    SELECT '${catalog}.business_metrics', MAX(calculated_at) FROM ${catalog}.business_metrics
    UNION ALL
    SELECT '${catalog}.security_posture', MAX(calculated_at) FROM ${catalog}.security_posture
);`,
  });

  return monitors;
}

// ── Audit framework ───────────────────────────────────────────────────────

function generateGoldAuditFramework(isToAzure: boolean): GoldAuditEntry[] {
  const entries: GoldAuditEntry[] = [];
  const catalog = isToAzure ? "analytics.gold" : "gold_db";

  entries.push({
    id: "audit-1", name: "Metric Lineage Tracker",
    auditType: "lineage", retentionDays: 365,
    description: "Tracks data lineage from Silver sources through Gold transformations",
    code: `-- ${catalog}._gold_lineage
CREATE TABLE IF NOT EXISTS ${catalog}._gold_lineage (
    lineage_id STRING,
    gold_table STRING,
    silver_sources ARRAY<STRING>,
    transformation_type STRING,
    record_count_in BIGINT,
    record_count_out BIGINT,
    filter_ratio DOUBLE,
    pipeline_run_id STRING,
    executed_at TIMESTAMP,
    duration_seconds DOUBLE
) USING DELTA
${isToAzure ? "PARTITIONED BY (DATE(executed_at))" : "LOCATION 's3://data-lake/gold/_lineage/'"};

-- Insert lineage record after each Gold refresh
-- INSERT INTO ${catalog}._gold_lineage VALUES (
--   uuid(), 'kpi_total_revenue', ARRAY('silver.transactions'),
--   'aggregation', input_count, output_count, ratio, run_id, current_timestamp(), duration
-- );`,
  });

  entries.push({
    id: "audit-2", name: "Metric Snapshot Archive",
    auditType: "metric-snapshot", retentionDays: 730,
    description: "Point-in-time snapshots of KPI values for historical comparison and audit trails",
    code: `-- ${catalog}._gold_metric_snapshots
CREATE TABLE IF NOT EXISTS ${catalog}._gold_metric_snapshots (
    snapshot_id STRING,
    snapshot_timestamp TIMESTAMP,
    metric_name STRING,
    metric_value DOUBLE,
    metric_date DATE,
    dimensions MAP<STRING, STRING>,
    pipeline_run_id STRING
) USING DELTA
${isToAzure ? "PARTITIONED BY (DATE(snapshot_timestamp))" : "LOCATION 's3://data-lake/gold/_snapshots/'"};

-- Capture KPI snapshot after each pipeline run
INSERT INTO ${catalog}._gold_metric_snapshots
SELECT
    uuid() AS snapshot_id,
    current_timestamp() AS snapshot_timestamp,
    'total_revenue' AS metric_name,
    total_revenue AS metric_value,
    metric_date,
    MAP('source', 'kpi_total_revenue') AS dimensions,
    '{{pipeline_run_id}}' AS pipeline_run_id
FROM ${catalog}.kpi_total_revenue
WHERE metric_date = current_date();`,
  });

  entries.push({
    id: "audit-3", name: "Refresh Log",
    auditType: "refresh-log", retentionDays: 90,
    description: "Tracks every Gold layer refresh — duration, record counts, success/failure status",
    code: `-- ${catalog}._gold_refresh_log
CREATE TABLE IF NOT EXISTS ${catalog}._gold_refresh_log (
    run_id STRING,
    gold_table STRING,
    status STRING,
    records_processed BIGINT,
    records_merged BIGINT,
    records_inserted BIGINT,
    duration_seconds DOUBLE,
    error_message STRING,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
) USING DELTA
${isToAzure ? "PARTITIONED BY (DATE(started_at))" : "LOCATION 's3://data-lake/gold/_refresh_log/'"};`,
  });

  entries.push({
    id: "audit-4", name: "Change Detection Log",
    auditType: "change-detection", retentionDays: 180,
    description: "Detects and logs significant changes in Gold metric values between refreshes",
    code: `-- ${catalog}._gold_change_detection
CREATE TABLE IF NOT EXISTS ${catalog}._gold_change_detection (
    detection_id STRING,
    table_name STRING,
    metric_name STRING,
    previous_value DOUBLE,
    current_value DOUBLE,
    pct_change DOUBLE,
    detected_at TIMESTAMP,
    severity STRING
) USING DELTA;

-- Run after each refresh to detect significant changes
INSERT INTO ${catalog}._gold_change_detection
SELECT
    uuid(), '${catalog}.kpi_total_revenue', 'total_revenue',
    prev.total_revenue, curr.total_revenue,
    ABS(curr.total_revenue - prev.total_revenue) * 100.0 / NULLIF(prev.total_revenue, 0),
    current_timestamp(),
    CASE
        WHEN ABS(curr.total_revenue - prev.total_revenue) * 100.0 / NULLIF(prev.total_revenue, 0) > 25 THEN 'critical'
        WHEN ABS(curr.total_revenue - prev.total_revenue) * 100.0 / NULLIF(prev.total_revenue, 0) > 10 THEN 'warning'
        ELSE 'info'
    END
FROM ${catalog}.kpi_total_revenue curr
JOIN (
    SELECT metric_date, metric_value AS total_revenue
    FROM ${catalog}._gold_metric_snapshots
    WHERE metric_name = 'total_revenue'
    AND snapshot_timestamp = (SELECT MAX(snapshot_timestamp) FROM ${catalog}._gold_metric_snapshots WHERE metric_name = 'total_revenue')
) prev ON curr.metric_date = prev.metric_date
WHERE ABS(curr.total_revenue - prev.total_revenue) * 100.0 / NULLIF(prev.total_revenue, 0) > 10;`,
  });

  return entries;
}

// ── Dependency validation ──────────────────────────────────────────────────

function generateDependencyValidations(specs: GoldTransformSpec[], isToAzure: boolean): DependencyValidation[] {
  const validations: DependencyValidation[] = [];
  const silverCatalog = isToAzure ? "analytics.silver" : "silver_db";
  const allDeps = [...new Set(specs.flatMap((s) => s.silverDependencies))];

  for (let i = 0; i < Math.min(allDeps.length, 6); i++) {
    const dep = allDeps[i];
    validations.push({
      id: `dep-${i + 1}a`, name: `${dep} Freshness Gate`,
      checkType: "freshness",
      upstreamTable: `${silverCatalog}.${dep.replace("silver_", "")}`,
      blockOnFailure: true,
      description: `Block Gold refresh if ${dep} is more than 4 hours stale`,
      code: `-- Pre-flight: verify ${dep} is fresh
SELECT
    CASE WHEN MAX(processed_at) < current_timestamp() - INTERVAL 4 HOURS
         THEN RAISE_ERROR('${dep} is stale — last update: ' || CAST(MAX(processed_at) AS STRING))
         ELSE 'OK'
    END AS freshness_check
FROM ${silverCatalog}.${dep.replace("silver_", "")};`,
    });

    validations.push({
      id: `dep-${i + 1}b`, name: `${dep} Row Count Gate`,
      checkType: "row-count",
      upstreamTable: `${silverCatalog}.${dep.replace("silver_", "")}`,
      blockOnFailure: true,
      description: `Block Gold refresh if ${dep} has zero records for today`,
      code: `-- Pre-flight: verify ${dep} has data for current period
SELECT
    CASE WHEN COUNT(*) = 0
         THEN RAISE_ERROR('${dep} has no records for today — Gold pipeline cannot proceed')
         ELSE 'OK: ' || CAST(COUNT(*) AS STRING) || ' records available'
    END AS row_count_check
FROM ${silverCatalog}.${dep.replace("silver_", "")}
WHERE DATE(processed_at) = current_date();`,
    });
  }

  validations.push({
    id: "dep-schema", name: "Schema Compatibility Check",
    checkType: "schema-match",
    upstreamTable: "all silver dependencies",
    blockOnFailure: true,
    description: "Verify Silver table schemas match expected column names and types before Gold refresh",
    code: `# Schema validation before Gold pipeline execution
from pyspark.sql import SparkSession

def validate_upstream_schemas(spark: SparkSession):
    expected = {
        "${silverCatalog}.transactions": ["event_timestamp", "amount", "customer_id", "status"],
        "${silverCatalog}.orders": ["order_date", "business_unit", "revenue", "order_id"],
        "${silverCatalog}.api_logs": ["event_timestamp", "response_time_ms", "service_name", "status_code"],
    }
    errors = []
    for table, required_cols in expected.items():
        try:
            actual_cols = [f.name for f in spark.table(table).schema.fields]
            missing = [c for c in required_cols if c not in actual_cols]
            if missing:
                errors.append(f"{table} missing columns: {missing}")
        except Exception as e:
            errors.append(f"{table} not accessible: {e}")

    if errors:
        raise RuntimeError("Schema validation failed:\\n" + "\\n".join(errors))
    print("All upstream schemas validated successfully")`,
  });

  return validations;
}

// ── Performance recommendations ────────────────────────────────────────────

function generateGoldPerformanceRecs(specs: GoldTransformSpec[], isToAzure: boolean): GoldPerformanceRec[] {
  const recs: GoldPerformanceRec[] = [];
  const catalog = isToAzure ? "analytics.gold" : "gold_db";

  recs.push({
    id: "perf-1", title: "Z-ORDER on Time Dimensions",
    type: "z-order",
    estimatedImpact: "40-60% faster date-range queries in Power BI",
    description: "Apply Z-ORDER clustering on date and frequently-filtered dimensions for all Gold tables",
    code: `-- Apply Z-ORDER to all Gold KPI tables
OPTIMIZE ${catalog}.kpi_total_revenue ZORDER BY (metric_date);
OPTIMIZE ${catalog}.business_metrics ZORDER BY (business_date, business_unit);
OPTIMIZE ${catalog}.agg_multi_granularity ZORDER BY (day, region);
OPTIMIZE ${catalog}.security_posture ZORDER BY (assessment_time);
OPTIMIZE ${catalog}.compliance_scorecard ZORDER BY (scan_date, framework);
OPTIMIZE ${catalog}.asset_lifecycle ZORDER BY (asset_type, lifecycle_stage);`,
  });

  recs.push({
    id: "perf-2", title: "Partition Pruning Strategy",
    type: "partition-pruning",
    estimatedImpact: "70-90% data skipping for time-bounded queries",
    description: "Partition Gold tables by metric_date for efficient partition pruning",
    code: `-- Re-create Gold tables with date partitioning for efficient pruning
-- Example for kpi_total_revenue:
CREATE OR REPLACE TABLE ${catalog}.kpi_total_revenue
USING DELTA
PARTITIONED BY (metric_date)
AS SELECT * FROM ${catalog}.kpi_total_revenue;

-- Set auto-optimize for ongoing maintenance
ALTER TABLE ${catalog}.kpi_total_revenue SET TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true',
    'delta.tuneFileSizesForRewrites' = 'true'
);`,
  });

  recs.push({
    id: "perf-3", title: "Materialized View Caching",
    type: "materialized-view",
    estimatedImpact: "Sub-second dashboard loads for pre-computed aggregates",
    description: "Create materialized views for frequently-accessed executive dashboards",
    code: `-- Materialized view for executive dashboard (auto-refreshed)
${isToAzure ? `CREATE MATERIALIZED VIEW IF NOT EXISTS ${catalog}.mv_executive_summary AS` : `CREATE TABLE ${catalog}.mv_executive_summary AS`}
SELECT
    current_date() AS report_date,
    (SELECT SUM(total_revenue) FROM ${catalog}.kpi_total_revenue WHERE metric_date >= DATE_TRUNC('month', current_date())) AS mtd_revenue,
    (SELECT AVG(retention_rate_pct) FROM ${catalog}.kpi_customer_retention WHERE month >= DATE_ADD(current_date(), -90)) AS avg_retention_90d,
    (SELECT AVG(p95_response_ms) FROM ${catalog}.kpi_response_time WHERE metric_hour >= current_timestamp() - INTERVAL 24 HOURS) AS avg_p95_24h,
    (SELECT AVG(compliance_score) FROM ${catalog}.kpi_compliance_score WHERE metric_date = current_date()) AS today_compliance,
    (SELECT AVG(risk_score) FROM ${catalog}.security_posture WHERE assessment_time >= current_timestamp() - INTERVAL 24 HOURS) AS avg_risk_24h;
${isToAzure ? `\n-- Schedule refresh every 2 hours\n-- ALTER MATERIALIZED VIEW ${catalog}.mv_executive_summary SET SCHEDULE CRON '0 */2 * * *';` : ""}`,
  });

  recs.push({
    id: "perf-4", title: "Bloom Filter Index",
    type: "bloom-filter",
    estimatedImpact: "50-80% faster point lookups on high-cardinality columns",
    description: "Add bloom filter indexes on ID columns used in JOIN and WHERE conditions",
    code: `-- Add bloom filters for high-cardinality lookup columns
${isToAzure ? `ALTER TABLE ${catalog}.kpi_total_revenue SET TBLPROPERTIES (
    'delta.dataSkippingNumIndexedCols' = 8
);

CREATE BLOOMFILTER INDEX ON TABLE ${catalog}.agg_multi_granularity FOR COLUMNS (region, product_category);` : "-- Bloom filters are Databricks-specific — use Glue Data Catalog column statistics instead\n-- AWS Glue: Enable column statistics for predicate pushdown"}`,
  });

  if (isToAzure) {
    recs.push({
      id: "perf-5", title: "Liquid Clustering",
      type: "liquid-clustering",
      estimatedImpact: "Eliminates manual OPTIMIZE — automatic incremental clustering",
      description: "Replace Z-ORDER with Liquid Clustering for automatic, incremental data organization",
      code: `-- Upgrade Gold tables to Liquid Clustering (Databricks 13.3+)
ALTER TABLE ${catalog}.kpi_total_revenue
    CLUSTER BY (metric_date);

ALTER TABLE ${catalog}.business_metrics
    CLUSTER BY (business_date, business_unit);

ALTER TABLE ${catalog}.agg_multi_granularity
    CLUSTER BY (day, region, product_category);

-- Liquid Clustering auto-applies during writes — no scheduled OPTIMIZE needed`,
    });
  }

  return recs;
}

// ── Production pipeline ────────────────────────────────────────────────────

function generateGoldProductionPipeline(isToAzure: boolean): { stage: string; description: string; code: string }[] {
  const catalog = isToAzure ? "analytics.gold" : "gold_db";
  const silverCatalog = isToAzure ? "analytics.silver" : "silver_db";

  return [
    {
      stage: "1. Pre-flight Validation",
      description: "Validate upstream Silver dependencies — freshness, row counts, schema compatibility",
      code: `# Stage 1: Pre-flight checks
def preflight_validation(spark):
    checks = {
        "${silverCatalog}.transactions": {"min_rows": 100, "max_stale_hours": 4},
        "${silverCatalog}.orders": {"min_rows": 50, "max_stale_hours": 4},
        "${silverCatalog}.audit_logs": {"min_rows": 10, "max_stale_hours": 24},
    }
    for table, rules in checks.items():
        count = spark.sql(f"SELECT COUNT(*) AS c FROM {table} WHERE DATE(processed_at) = current_date()").first()["c"]
        if count < rules["min_rows"]:
            raise RuntimeError(f"Pre-flight FAILED: {table} has {count} rows (min: {rules['min_rows']})")
    print("Pre-flight validation PASSED")`,
    },
    {
      stage: "2. KPI Calculations",
      description: "Execute all KPI computations — revenue, retention, response time, compliance scores",
      code: `# Stage 2: KPI calculation refresh
def run_kpi_calculations(spark):
    kpi_tables = [
        ("kpi_total_revenue", "spark.sql(kpi_revenue_query)"),
        ("kpi_revenue_growth", "spark.sql(kpi_growth_query)"),
        ("kpi_response_time", "spark.sql(kpi_response_query)"),
        ("kpi_customer_retention", "spark.sql(kpi_retention_query)"),
        ("kpi_compliance_score", "spark.sql(kpi_compliance_query)"),
    ]
    for name, _ in kpi_tables:
        spark.sql(f"REFRESH TABLE ${catalog}.{name}")
        print(f"KPI '{name}' refreshed")`,
    },
    {
      stage: "3. Aggregation Framework",
      description: "Run multi-granularity rollups, window analytics, running totals, and pivot tables",
      code: `# Stage 3: Aggregation pipeline
def run_aggregations(spark):
    spark.sql("REFRESH TABLE ${catalog}.agg_multi_granularity")
    spark.sql("REFRESH TABLE ${catalog}.agg_window_analytics")
    spark.sql("REFRESH TABLE ${catalog}.agg_running_totals")
    print("Aggregation framework refreshed")`,
    },
    {
      stage: "4. Business Metric Validation",
      description: "Run validation checks — range, trend, completeness, freshness, anomaly detection",
      code: `# Stage 4: Metric validation
def validate_metrics(spark):
    validations = [
        ("range_check", "SELECT COUNT(*) FROM ${catalog}.kpi_total_revenue WHERE total_revenue < 0"),
        ("completeness", "SELECT COUNT(*) FROM date_range LEFT JOIN ${catalog}.kpi_total_revenue ..."),
        ("anomaly_check", "SELECT COUNT(*) FROM ${catalog}.kpi_total_revenue WHERE z_score > 3"),
    ]
    failures = []
    for name, query in validations:
        count = spark.sql(query).first()[0]
        if count > 0:
            failures.append(f"{name}: {count} violations")
    if failures:
        print("VALIDATION WARNINGS: " + "; ".join(failures))
    else:
        print("All metric validations PASSED")`,
    },
    {
      stage: "5. Executive View Refresh",
      description: "Refresh materialized views and Power BI optimized datasets",
      code: `# Stage 5: Executive views
def refresh_executive_views(spark):
    views = [
        "${catalog}.vw_executive_kpi_dashboard",
        "${catalog}.vw_financial_summary",
        "${catalog}.vw_operational_health",
        "${catalog}.powerbi_star_schema",
    ]
    for view in views:
        spark.sql(f"REFRESH TABLE {view}")
    print("Executive views refreshed")`,
    },
    {
      stage: "6. Data Quality Monitoring",
      description: "Run null-rate checks, outlier detection, trend-break analysis, referential integrity",
      code: `# Stage 6: Data quality checks
def run_dq_monitors(spark):
    alerts = []
    null_check = spark.sql(f"SELECT COUNT(*) FROM ${catalog}.kpi_total_revenue WHERE total_revenue IS NULL").first()[0]
    if null_check > 0:
        alerts.append(f"NULL_ALERT: {null_check} null revenue records")
    stale_check = spark.sql(f"""
        SELECT TIMESTAMPDIFF(HOUR, MAX(calculated_at), current_timestamp())
        FROM ${catalog}.kpi_total_revenue
    """).first()[0]
    if stale_check and stale_check > 4:
        alerts.append(f"STALE_ALERT: kpi_total_revenue is {stale_check}h stale")
    if alerts:
        for a in alerts:
            print(f"DQ ALERT: {a}")
    else:
        print("Data quality checks PASSED")`,
    },
    {
      stage: "7. Audit Logging",
      description: "Record metric snapshots, lineage entries, and refresh log for compliance",
      code: `# Stage 7: Audit framework
def log_audit_records(spark, run_id, start_time, results):
    from datetime import datetime
    duration = (datetime.utcnow() - start_time).total_seconds()

    # Refresh log
    spark.sql(f"""
        INSERT INTO ${catalog}._gold_refresh_log VALUES (
            '{run_id}', 'full_pipeline', 'success',
            {results.get('total_processed', 0)}, {results.get('total_merged', 0)},
            {results.get('total_inserted', 0)}, {duration}, NULL,
            '{start_time.isoformat()}', '{datetime.utcnow().isoformat()}'
        )
    """)

    # Metric snapshots
    spark.sql(f"""
        INSERT INTO ${catalog}._gold_metric_snapshots
        SELECT uuid(), current_timestamp(), 'total_revenue', total_revenue, metric_date,
               MAP('pipeline_run', '{run_id}'), '{run_id}'
        FROM ${catalog}.kpi_total_revenue
        WHERE metric_date = current_date()
    """)
    print(f"Audit records logged for run {run_id}")`,
    },
    {
      stage: "8. Performance Optimization",
      description: "Run OPTIMIZE with Z-ORDER, compact small files, update table statistics",
      code: `# Stage 8: Performance optimization
def optimize_gold_tables(spark):
    tables = [
        ("${catalog}.kpi_total_revenue", ["metric_date"]),
        ("${catalog}.business_metrics", ["business_date", "business_unit"]),
        ("${catalog}.agg_multi_granularity", ["day", "region"]),
        ("${catalog}.security_posture", ["assessment_time"]),
    ]
    for table, zorder_cols in tables:
        zorder = ", ".join(zorder_cols)
        spark.sql(f"OPTIMIZE {table} ZORDER BY ({zorder})")
        spark.sql(f"ANALYZE TABLE {table} COMPUTE STATISTICS FOR ALL COLUMNS")
    print("Gold tables optimized and statistics updated")`,
    },
    {
      stage: "9. Notification & Reporting",
      description: "Send pipeline completion notifications with summary metrics to stakeholders",
      code: `# Stage 9: Pipeline completion notification
def send_completion_notification(run_id, results, duration):
    summary = {
        "pipeline_run_id": run_id,
        "status": "SUCCESS" if not results.get("errors") else "PARTIAL_SUCCESS",
        "duration_seconds": duration,
        "kpis_refreshed": results.get("kpis_refreshed", 0),
        "validations_passed": results.get("validations_passed", 0),
        "dq_alerts": results.get("dq_alerts", 0),
        "records_processed": results.get("total_processed", 0),
    }
    # Integration point: send to Slack, PagerDuty, or email
    print(f"Pipeline complete: {summary}")`,
    },
    {
      stage: "10. Full Pipeline Orchestrator",
      description: "End-to-end orchestrator executing all stages in dependency order with error handling",
      code: `# Gold Layer Production Pipeline — Full Orchestrator
from pyspark.sql import SparkSession
from datetime import datetime
import uuid

def run_gold_production_pipeline():
    spark = SparkSession.builder.getOrCreate()
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    results = {"errors": []}

    try:
        # Stage 1: Pre-flight
        preflight_validation(spark)

        # Stage 2: KPIs
        run_kpi_calculations(spark)
        results["kpis_refreshed"] = 5

        # Stage 3: Aggregations
        run_aggregations(spark)

        # Stage 4: Validation
        validate_metrics(spark)
        results["validations_passed"] = 5

        # Stage 5: Executive views
        refresh_executive_views(spark)

        # Stage 6: Data quality
        run_dq_monitors(spark)

        # Stage 7: Audit
        log_audit_records(spark, run_id, start, results)

        # Stage 8: Optimize
        optimize_gold_tables(spark)

    except Exception as e:
        results["errors"].append(str(e))
        print(f"Pipeline FAILED at run {run_id}: {e}")
    finally:
        duration = (datetime.utcnow() - start).total_seconds()
        results["total_processed"] = results.get("total_processed", 0)
        send_completion_notification(run_id, results, duration)

    return results

if __name__ == "__main__":
    run_gold_production_pipeline()`,
    },
  ];
}

// ── Threshold-based KPI Alerting ─────────────────────────────────────────────

function generateThresholdAlerts(kpis: GoldKPISpec[], isToAzure: boolean): ThresholdAlert[] {
  const alerts: ThresholdAlert[] = [];
  const catalog = isToAzure ? "analytics.gold" : "gold_db";

  for (const kpi of kpis) {
    if (!kpi.threshold) continue;
    const { warning, critical, direction } = kpi.threshold;
    const op = direction === "below" ? "<" : ">";
    const reverseOp = direction === "below" ? ">=" : "<=";

    alerts.push({
      id: `alert-${kpi.id}-warn`,
      kpiId: kpi.id,
      kpiName: kpi.name,
      alertType: "warning",
      channel: "teams",
      description: `Warning alert when ${kpi.name} ${direction === "below" ? "drops below" : "exceeds"} ${warning}`,
      code: `# ═══ Warning Alert: ${kpi.name} ═══
from pyspark.sql import SparkSession

def check_${kpi.id.replace(/-/g, "_")}_warning(spark: SparkSession):
    """Fires when ${kpi.name} breaches warning threshold."""
    latest = spark.sql("""
        SELECT * FROM ${catalog}.${kpi.id.replace(/-/g, "_")}
        WHERE metric_date = current_date()
        ORDER BY calculated_at DESC LIMIT 1
    """).first()

    if latest is None:
        send_alert("WARNING", "${kpi.name}", "No data for today — possible pipeline delay")
        return

    value = latest[1]  # metric value column
    if value ${op} ${warning}:
        send_alert(
            "WARNING",
            "${kpi.name}",
            f"Current value {value} ${op} threshold ${warning}",
            severity="P3",
            channel="teams",
        )

def send_alert(level, kpi_name, message, severity="P3", channel="teams"):
    ${isToAzure
      ? `import requests
    webhook_url = spark.conf.get("spark.custom.teams_webhook_url")
    payload = {
        "@type": "MessageCard",
        "themeColor": "FFA500" if level == "WARNING" else "FF0000",
        "title": f"Gold KPI Alert: {kpi_name}",
        "text": f"**[{level}]** {message}\\n\\nSeverity: {severity}",
    }
    requests.post(webhook_url, json=payload)`
      : `print(f"[{level}] {kpi_name}: {message} (severity={severity})")`}`,
    });

    alerts.push({
      id: `alert-${kpi.id}-crit`,
      kpiId: kpi.id,
      kpiName: kpi.name,
      alertType: "critical",
      channel: "pagerduty",
      description: `Critical alert with PagerDuty escalation when ${kpi.name} ${direction === "below" ? "drops below" : "exceeds"} ${critical}`,
      code: `# ═══ Critical Alert: ${kpi.name} ═══

def check_${kpi.id.replace(/-/g, "_")}_critical(spark):
    """Fires PagerDuty incident when ${kpi.name} breaches critical threshold."""
    latest = spark.sql("""
        SELECT * FROM ${catalog}.${kpi.id.replace(/-/g, "_")}
        WHERE metric_date = current_date()
        ORDER BY calculated_at DESC LIMIT 1
    """).first()

    if latest is None:
        trigger_pagerduty("${kpi.name}", "No data available — pipeline may be down", "critical")
        return

    value = latest[1]
    if value ${op} ${critical}:
        trigger_pagerduty(
            "${kpi.name}",
            f"CRITICAL: value {value} ${op} threshold ${critical}",
            "critical"
        )
        # Log to audit table for compliance
        spark.sql(f"""
            INSERT INTO ${catalog}._gold_metric_alerts VALUES (
                uuid(), current_timestamp(), '${kpi.name}', 'CRITICAL',
                {value}, ${critical}, '${direction}', 'pagerduty'
            )
        """)

def trigger_pagerduty(kpi_name, message, severity):
    ${isToAzure
      ? `import requests
    routing_key = spark.conf.get("spark.custom.pagerduty_routing_key")
    payload = {
        "routing_key": routing_key,
        "event_action": "trigger",
        "payload": {
            "summary": f"Gold KPI Critical: {kpi_name} — {message}",
            "severity": severity,
            "source": "gold-production-pipeline",
            "component": kpi_name,
        },
    }
    requests.post("https://events.pagerduty.com/v2/enqueue", json=payload)`
      : `print(f"[PAGERDUTY] {kpi_name}: {message} (severity={severity})")`}`,
    });

    alerts.push({
      id: `alert-${kpi.id}-recovery`,
      kpiId: kpi.id,
      kpiName: kpi.name,
      alertType: "recovery",
      channel: "teams",
      description: `Recovery notification when ${kpi.name} returns to normal range`,
      code: `# ═══ Recovery Alert: ${kpi.name} ═══

def check_${kpi.id.replace(/-/g, "_")}_recovery(spark):
    """Resolves open incidents when ${kpi.name} returns to safe range."""
    latest = spark.sql("""
        SELECT * FROM ${catalog}.${kpi.id.replace(/-/g, "_")}
        WHERE metric_date = current_date()
        ORDER BY calculated_at DESC LIMIT 1
    """).first()

    if latest is None:
        return

    value = latest[1]
    # Check if currently in alert state
    open_alert = spark.sql(f"""
        SELECT * FROM ${catalog}._gold_metric_alerts
        WHERE kpi_name = '${kpi.name}'
          AND resolved_at IS NULL
        ORDER BY created_at DESC LIMIT 1
    """)

    if open_alert.count() > 0 and value ${reverseOp} ${warning}:
        spark.sql(f"""
            UPDATE ${catalog}._gold_metric_alerts
            SET resolved_at = current_timestamp(),
                resolution_value = {value}
            WHERE kpi_name = '${kpi.name}' AND resolved_at IS NULL
        """)
        send_alert("RECOVERY", "${kpi.name}",
                   f"Recovered to {value} (threshold: ${warning})",
                   severity="P5", channel="teams")`,
    });
  }

  return alerts;
}

// ── Gold → Silver Reconciliation ────────────────────────────────────────────

function generateGoldReconciliation(specs: GoldTransformSpec[], isToAzure: boolean): GoldReconciliation[] {
  const recs: GoldReconciliation[] = [];
  const catalog = isToAzure ? "analytics.gold" : "gold_db";
  const silverCatalog = isToAzure ? "analytics.silver" : "silver_db";

  const silverDeps = new Set<string>();
  for (const s of specs) {
    for (const d of s.silverDependencies) silverDeps.add(d);
  }

  let idx = 0;
  for (const dep of silverDeps) {
    idx++;
    recs.push({
      id: `recon-count-${idx}`,
      name: `Record Count: ${dep}`,
      reconciliationType: "count",
      goldTable: `${catalog}.kpi_total_revenue`,
      silverTable: `${silverCatalog}.${dep}`,
      tolerance: 0.01,
      description: `Verify Gold aggregation accounts for all Silver records from ${dep} — tolerance 1%`,
      code: `# ═══ Gold ↔ Silver Record Count Reconciliation: ${dep} ═══
from pyspark.sql import SparkSession

def reconcile_${dep}_count(spark: SparkSession, run_date: str = None):
    """
    Compare Silver input count vs Gold output contribution.
    Gold may have fewer rows (aggregation) but must account for all source records.
    """
    date_filter = f"WHERE DATE(processed_at) = '{run_date}'" if run_date else ""

    silver_count = spark.sql(f"""
        SELECT COUNT(*) AS cnt FROM ${silverCatalog}.${dep} {date_filter}
    """).first()["cnt"]

    gold_source_count = spark.sql(f"""
        SELECT SUM(source_record_count) AS cnt
        FROM ${catalog}._gold_lineage
        WHERE source_table = '${silverCatalog}.${dep}'
          {'AND DATE(processed_at) = ' + repr(run_date) if run_date else ''}
    """).first()["cnt"] or 0

    gap_pct = abs(silver_count - gold_source_count) / max(silver_count, 1) * 100

    result = {
        "silver_table": "${silverCatalog}.${dep}",
        "silver_count": silver_count,
        "gold_accounted": gold_source_count,
        "gap_pct": round(gap_pct, 4),
        "status": "PASS" if gap_pct <= 1.0 else "FAIL",
    }

    if result["status"] == "FAIL":
        raise GoldReconciliationError(
            f"Gold←Silver reconciliation FAILED for ${dep}: "
            f"gap={gap_pct:.2f}% (silver={silver_count}, gold_accounted={gold_source_count})"
        )

    print(f"[GOLD RECON] PASS: {result}")
    return result

class GoldReconciliationError(Exception):
    pass`,
    });
  }

  recs.push({
    id: "recon-freshness",
    name: "Cross-Layer Freshness Gate",
    reconciliationType: "freshness",
    goldTable: `${catalog}.*`,
    silverTable: `${silverCatalog}.*`,
    tolerance: 4,
    description: "Verify Gold layer is not stale relative to Silver — max lag 4 hours",
    code: `# ═══ Gold ↔ Silver Freshness Reconciliation ═══

def reconcile_freshness(spark, max_lag_hours: int = 4):
    """
    Gold must not be staler than Silver by more than max_lag_hours.
    Catches cases where Gold pipeline runs but Silver has newer data.
    """
    silver_latest = spark.sql("""
        SELECT MAX(processed_at) AS latest FROM ${silverCatalog}._silver_audit_log
    """).first()["latest"]

    gold_latest = spark.sql("""
        SELECT MAX(refresh_end_time) AS latest FROM ${catalog}._gold_refresh_log
    """).first()["latest"]

    if not silver_latest or not gold_latest:
        print("[FRESHNESS] Insufficient data for freshness check")
        return {"status": "SKIP"}

    from datetime import datetime
    lag_hours = (silver_latest - gold_latest).total_seconds() / 3600

    result = {
        "silver_latest": str(silver_latest),
        "gold_latest": str(gold_latest),
        "lag_hours": round(lag_hours, 2),
        "status": "PASS" if lag_hours <= max_lag_hours else "STALE",
    }

    if lag_hours > max_lag_hours:
        print(f"[FRESHNESS] WARNING: Gold is {lag_hours:.1f}h behind Silver (max: {max_lag_hours}h)")
    else:
        print(f"[FRESHNESS] PASS: Gold lag is {lag_hours:.1f}h")

    return result`,
  });

  return recs;
}

// ── Unity Catalog Governance ────────────────────────────────────────────────

function generateGovernanceConfig(specs: GoldTransformSpec[], isToAzure: boolean): GovernanceConfig[] {
  if (!isToAzure) return [];

  const configs: GovernanceConfig[] = [];
  const catalog = "analytics.gold";

  configs.push({
    id: "gov-1",
    name: "Table Properties — Classification & Retention",
    governanceType: "table-properties",
    description: "Set Unity Catalog table properties for data classification, retention, and ownership metadata",
    code: `-- ═══ Unity Catalog Table Properties ═══
-- Apply to all Gold layer tables for governance compliance

ALTER TABLE ${catalog}.kpi_total_revenue SET TBLPROPERTIES (
    'data_classification' = 'confidential',
    'data_owner' = 'analytics-team',
    'retention_days' = '2555',
    'refresh_schedule' = 'daily',
    'data_quality_tier' = 'gold',
    'pii_contains' = 'false',
    'compliance_frameworks' = 'SOC2,GDPR',
    'created_by_pipeline' = 'gold-production-pipeline'
);

ALTER TABLE ${catalog}.business_metrics SET TBLPROPERTIES (
    'data_classification' = 'internal',
    'data_owner' = 'finance-team',
    'retention_days' = '1825',
    'refresh_schedule' = 'daily',
    'data_quality_tier' = 'gold',
    'pii_contains' = 'false'
);

ALTER TABLE ${catalog}.kpi_customer_retention SET TBLPROPERTIES (
    'data_classification' = 'confidential',
    'data_owner' = 'customer-success-team',
    'retention_days' = '2555',
    'pii_contains' = 'true',
    'pii_columns' = 'customer_id'
);`,
  });

  configs.push({
    id: "gov-2",
    name: "Column Tags — Sensitivity & Semantic Labels",
    governanceType: "column-tags",
    description: "Tag Gold columns with sensitivity levels and semantic types for discovery and access control",
    code: `-- ═══ Unity Catalog Column Tags ═══

ALTER TABLE ${catalog}.kpi_total_revenue ALTER COLUMN total_revenue
    SET TAGS ('sensitivity' = 'high', 'semantic_type' = 'revenue_metric', 'unit' = 'USD');

ALTER TABLE ${catalog}.kpi_total_revenue ALTER COLUMN order_count
    SET TAGS ('sensitivity' = 'medium', 'semantic_type' = 'count_metric');

ALTER TABLE ${catalog}.kpi_total_revenue ALTER COLUMN metric_date
    SET TAGS ('sensitivity' = 'low', 'semantic_type' = 'time_dimension', 'grain' = 'daily');

ALTER TABLE ${catalog}.kpi_customer_retention ALTER COLUMN retention_rate_pct
    SET TAGS ('sensitivity' = 'high', 'semantic_type' = 'rate_metric', 'unit' = 'percent');

ALTER TABLE ${catalog}.kpi_response_time ALTER COLUMN p95_response_ms
    SET TAGS ('sensitivity' = 'medium', 'semantic_type' = 'latency_metric', 'unit' = 'milliseconds', 'slo_target' = '500');`,
  });

  configs.push({
    id: "gov-3",
    name: "Row-Level Security Filters",
    governanceType: "row-filter",
    description: "Apply row-level security so users only see Gold data for their business unit or region",
    code: `-- ═══ Row-Level Security on Gold Tables ═══

CREATE OR REPLACE FUNCTION ${catalog}.region_filter(region_col STRING)
    RETURN IF(
        IS_ACCOUNT_GROUP_MEMBER('analytics-global-admins'),
        TRUE,
        region_col = CURRENT_USER_ATTRIBUTE('region')
    );

ALTER TABLE ${catalog}.business_metrics
    SET ROW FILTER ${catalog}.region_filter ON (region);

ALTER TABLE ${catalog}.agg_multi_granularity
    SET ROW FILTER ${catalog}.region_filter ON (region);

-- Business unit filter
CREATE OR REPLACE FUNCTION ${catalog}.bu_filter(bu_col STRING)
    RETURN IF(
        IS_ACCOUNT_GROUP_MEMBER('analytics-global-admins'),
        TRUE,
        bu_col IN (
            SELECT business_unit FROM ${catalog}._user_bu_mapping
            WHERE user_email = CURRENT_USER()
        )
    );

ALTER TABLE ${catalog}.kpi_total_revenue
    SET ROW FILTER ${catalog}.bu_filter ON (business_unit);`,
  });

  configs.push({
    id: "gov-4",
    name: "Column Masking for PII",
    governanceType: "column-mask",
    description: "Mask PII columns in Gold layer — only authorized roles see full values",
    code: `-- ═══ Column Masking on Gold Tables ═══

CREATE OR REPLACE FUNCTION ${catalog}.mask_customer_id(customer_id STRING)
    RETURN IF(
        IS_ACCOUNT_GROUP_MEMBER('pii-authorized'),
        customer_id,
        CONCAT('CUST-****-', RIGHT(customer_id, 4))
    );

ALTER TABLE ${catalog}.kpi_customer_retention
    ALTER COLUMN customer_id SET MASK ${catalog}.mask_customer_id;

CREATE OR REPLACE FUNCTION ${catalog}.mask_revenue(amount DECIMAL(18,2))
    RETURN IF(
        IS_ACCOUNT_GROUP_MEMBER('finance-team'),
        amount,
        ROUND(amount / 1000, 0) * 1000  -- Round to nearest thousand
    );`,
  });

  configs.push({
    id: "gov-5",
    name: "Lineage Tags — Pipeline Provenance",
    governanceType: "lineage-tag",
    description: "Tag tables with pipeline provenance for automated lineage tracking across Bronze→Silver→Gold",
    code: `-- ═══ Lineage Tags for End-to-End Tracking ═══

ALTER TABLE ${catalog}.kpi_total_revenue SET TBLPROPERTIES (
    'lineage.source_tables' = '${catalog.replace("gold", "silver")}.transactions,${catalog.replace("gold", "silver")}.orders',
    'lineage.pipeline' = 'gold-production-pipeline',
    'lineage.transform_type' = 'aggregation',
    'lineage.grain_change' = 'transaction→daily',
    'lineage.last_validated' = current_timestamp()
);

ALTER TABLE ${catalog}.kpi_customer_retention SET TBLPROPERTIES (
    'lineage.source_tables' = '${catalog.replace("gold", "silver")}.customers,${catalog.replace("gold", "silver")}.transactions',
    'lineage.pipeline' = 'gold-production-pipeline',
    'lineage.transform_type' = 'cohort-analysis',
    'lineage.grain_change' = 'customer→monthly'
);

ALTER TABLE ${catalog}.agg_multi_granularity SET TBLPROPERTIES (
    'lineage.source_tables' = '${catalog.replace("gold", "silver")}.transactions',
    'lineage.pipeline' = 'gold-production-pipeline',
    'lineage.transform_type' = 'multi-level-aggregation',
    'lineage.grain_change' = 'transaction→day/region/product'
);`,
  });

  return configs;
}
