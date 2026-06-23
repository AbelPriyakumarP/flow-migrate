import {
  type DetectedTransformation,
  type TransformationCategory,
  analyzeTransformationPatterns,
} from "./transformation-pattern-analyzer";

// ── Gold metric categories ──────────────────────────────────────────────────

export type GoldMetricType =
  | "revenue-metrics"
  | "cost-metrics"
  | "sla-metrics"
  | "compliance-metrics"
  | "security-metrics"
  | "operational-metrics"
  | "executive-reporting"
  | "dashboard-datasets";

export type AggregationType =
  | "SUM" | "AVG" | "COUNT" | "COUNT_DISTINCT"
  | "MIN" | "MAX" | "PERCENTILE"
  | "RATIO" | "RATE" | "TREND"
  | "ROLLUP" | "WINDOW" | "CUMULATIVE"
  | "SNAPSHOT" | "COMPOSITE";

export type DashboardType =
  | "executive-kpi" | "operational-monitor" | "financial-summary"
  | "compliance-scorecard" | "security-posture" | "sla-tracker"
  | "trend-analysis" | "real-time-feed" | "self-service";

export interface GoldSpecEntry {
  id: string;
  gold_metric: string;
  business_purpose: string;
  aggregation_type: AggregationType;
  dashboard_type: DashboardType;
  confidence: string;
  metric_category: GoldMetricType;
  source_transformation_id: string;
  source_category: TransformationCategory;
  grain: string;
  refresh_frequency: string;
  source_columns: string[];
  kpi_formula?: string;
}

export interface GoldSpecResult {
  specs: GoldSpecEntry[];
  metricBreakdown: Record<GoldMetricType, number>;
  dashboardBreakdown: Record<DashboardType, number>;
  summary: GoldSpecSummary;
  dashboardCatalog: DashboardCatalogEntry[];
}

export interface GoldSpecSummary {
  totalMetrics: number;
  categoriesUsed: number;
  dashboardTypesUsed: number;
  highConfidenceCount: number;
  avgConfidence: number;
  dominantCategory: GoldMetricType;
  warnings: string[];
  syntheticCount: number;
}

export interface DashboardCatalogEntry {
  dashboard_type: DashboardType;
  label: string;
  metrics: string[];
  refresh: string;
  audience: string;
}

export const METRIC_LABELS: Record<GoldMetricType, string> = {
  "revenue-metrics": "Revenue Metrics",
  "cost-metrics": "Cost Metrics",
  "sla-metrics": "SLA Metrics",
  "compliance-metrics": "Compliance Metrics",
  "security-metrics": "Security Metrics",
  "operational-metrics": "Operational Metrics",
  "executive-reporting": "Executive Reporting",
  "dashboard-datasets": "Dashboard Datasets",
};

export const METRIC_COLORS: Record<GoldMetricType, string> = {
  "revenue-metrics": "#10b981",
  "cost-metrics": "#ef4444",
  "sla-metrics": "#3b82f6",
  "compliance-metrics": "#f59e0b",
  "security-metrics": "#8b5cf6",
  "operational-metrics": "#06b6d4",
  "executive-reporting": "#ec4899",
  "dashboard-datasets": "#f97316",
};

export const METRIC_ICONS: Record<GoldMetricType, string> = {
  "revenue-metrics": "💰",
  "cost-metrics": "📉",
  "sla-metrics": "⏱",
  "compliance-metrics": "🛡",
  "security-metrics": "🔒",
  "operational-metrics": "⚙",
  "executive-reporting": "📊",
  "dashboard-datasets": "📋",
};

export const DASHBOARD_LABELS: Record<DashboardType, string> = {
  "executive-kpi": "Executive KPI",
  "operational-monitor": "Operational Monitor",
  "financial-summary": "Financial Summary",
  "compliance-scorecard": "Compliance Scorecard",
  "security-posture": "Security Posture",
  "sla-tracker": "SLA Tracker",
  "trend-analysis": "Trend Analysis",
  "real-time-feed": "Real-Time Feed",
  "self-service": "Self-Service Analytics",
};

// ── Transformation → Gold metric mapping ────────────────────────────────────

function classifyToGoldMetric(t: DetectedTransformation): GoldMetricType {
  const name = t.transformation_name.toLowerCase();
  const purpose = t.purpose.toLowerCase();
  const combined = `${name} ${purpose} ${t.source_columns.join(" ")} ${t.target_columns.join(" ")}`.toLowerCase();

  if (/revenue|sales|amount|price|order|arpu|ltv|mrr|arr|profit|income|payment|billing/i.test(combined)) return "revenue-metrics";
  if (/cost|expense|spend|budget|overhead|burn.*rate|cogs|depreciation/i.test(combined)) return "cost-metrics";
  if (/sla|latency|response.*time|uptime|availability|p95|p99|percentile|ttfb|throughput|error.*rate/i.test(combined)) return "sla-metrics";
  if (/compliance|gdpr|pci|hipaa|sox|regulatory|audit|retention|consent|privacy/i.test(combined)) return "compliance-metrics";
  if (/security|threat|vulnerability|breach|access.*log|auth|permission|firewall|encryption/i.test(combined)) return "security-metrics";

  // Category-based fallbacks
  switch (t.category) {
    case "kpi-calculations": return "executive-reporting";
    case "aggregations": return "operational-metrics";
    case "reporting-logic": return "dashboard-datasets";
    case "business-rules": return "operational-metrics";
    case "data-validation": return "compliance-metrics";
    case "lookup-joins": return "operational-metrics";
    case "data-enrichment": return "operational-metrics";
    default: return "dashboard-datasets";
  }
}

function resolveAggregationType(t: DetectedTransformation): AggregationType {
  const name = t.transformation_name.toLowerCase();
  const purpose = t.purpose.toLowerCase();
  const combined = `${name} ${purpose}`;

  if (/rollup|cube|grouping\s+sets/i.test(combined)) return "ROLLUP";
  if (/window|running|rolling|moving|cumulative|ytd|qtd/i.test(combined)) return "WINDOW";
  if (/percentile|p95|p99|distribution/i.test(combined)) return "PERCENTILE";
  if (/rate|ratio|conversion|churn|retention/i.test(combined)) return "RATE";
  if (/trend|growth|period.*over|lag|lead|mom|yoy|qoq/i.test(combined)) return "TREND";
  if (/cumulative|running.*total/i.test(combined)) return "CUMULATIVE";
  if (/snapshot|point.*in.*time|as.*of/i.test(combined)) return "SNAPSHOT";
  if (/composite|index|score|weighted/i.test(combined)) return "COMPOSITE";
  if (/sum|total|aggregate/i.test(combined)) return "SUM";
  if (/avg|mean|average/i.test(combined)) return "AVG";
  if (/count.*distinct|unique/i.test(combined)) return "COUNT_DISTINCT";
  if (/count/i.test(combined)) return "COUNT";
  if (/max|maximum|peak|highest/i.test(combined)) return "MAX";
  if (/min|minimum|lowest|floor/i.test(combined)) return "MIN";
  return "SUM";
}

function resolveDashboardType(metric: GoldMetricType, t: DetectedTransformation): DashboardType {
  const name = t.transformation_name.toLowerCase();

  switch (metric) {
    case "revenue-metrics": return /trend|growth|period/i.test(name) ? "trend-analysis" : "financial-summary";
    case "cost-metrics": return "financial-summary";
    case "sla-metrics": return /real.*time|stream|hourly/i.test(name) ? "real-time-feed" : "sla-tracker";
    case "compliance-metrics": return "compliance-scorecard";
    case "security-metrics": return "security-posture";
    case "operational-metrics": return /monitor|alert|threshold/i.test(name) ? "operational-monitor" : "self-service";
    case "executive-reporting": return "executive-kpi";
    case "dashboard-datasets": return /pivot|view|bi|report/i.test(name) ? "self-service" : "operational-monitor";
    default: return "self-service";
  }
}

function resolveGrain(t: DetectedTransformation, metric: GoldMetricType): string {
  const name = t.transformation_name.toLowerCase();
  const purpose = t.purpose.toLowerCase();
  const combined = `${name} ${purpose}`;

  if (/hourly|per.*hour|hour/i.test(combined)) return "hourly";
  if (/daily|per.*day|day/i.test(combined)) return "daily";
  if (/weekly|per.*week|week/i.test(combined)) return "weekly";
  if (/monthly|per.*month|month/i.test(combined)) return "monthly";
  if (/quarterly|per.*quarter|quarter/i.test(combined)) return "quarterly";
  if (/yearly|annual|per.*year/i.test(combined)) return "yearly";
  if (/real.*time|stream|micro.*batch/i.test(combined)) return "real-time";

  // Default grain based on metric type
  switch (metric) {
    case "sla-metrics": return "hourly";
    case "revenue-metrics": return "daily";
    case "cost-metrics": return "monthly";
    case "compliance-metrics": return "daily";
    case "security-metrics": return "hourly";
    case "operational-metrics": return "daily";
    case "executive-reporting": return "daily";
    case "dashboard-datasets": return "daily";
    default: return "daily";
  }
}

function resolveRefreshFrequency(grain: string, metric: GoldMetricType): string {
  if (grain === "real-time") return "streaming / 5-min micro-batch";
  if (grain === "hourly") return "hourly";
  if (metric === "executive-reporting") return "daily 06:00 UTC";
  if (metric === "compliance-metrics") return "daily 04:00 UTC";
  if (metric === "cost-metrics") return "daily end-of-day";
  return "daily";
}

function resolveBusinessPurpose(t: DetectedTransformation, metric: GoldMetricType): string {
  const name = t.transformation_name;

  switch (metric) {
    case "revenue-metrics":
      if (/sum|total/i.test(name)) return "Track total revenue across business segments — feeds executive P&L dashboard and investor reporting";
      if (/growth|trend|period/i.test(name)) return "Measure revenue growth rate period-over-period — drives strategic planning and board updates";
      if (/ratio|rate|conversion/i.test(name)) return "Calculate revenue conversion and monetization rates — informs pricing and sales strategy";
      return "Compute revenue-related business metrics for financial reporting and executive decision-making";

    case "cost-metrics":
      if (/sum|total/i.test(name)) return "Aggregate total costs by category and time period — feeds budget variance analysis";
      if (/ratio|rate/i.test(name)) return "Calculate cost ratios (cost-per-acquisition, cost-per-transaction) — drives efficiency optimization";
      return "Track cost metrics across operational categories — supports margin analysis and budget planning";

    case "sla-metrics":
      if (/percentile|p95|p99/i.test(name)) return "Compute service latency percentiles (P50/P95/P99) — SLA compliance monitoring and alerting";
      if (/rate|error/i.test(name)) return "Track error rates and availability — feeds NOC dashboard and SLA breach notifications";
      if (/window|rolling/i.test(name)) return "Calculate rolling SLA compliance windows — triggers escalation when thresholds breached";
      return "Monitor service level agreement metrics — ensures contractual obligations are met";

    case "compliance-metrics":
      if (/audit|log/i.test(name)) return "Maintain audit trail for regulatory compliance — supports SOC2/GDPR/PCI audit evidence";
      if (/validation|quality/i.test(name)) return "Track data quality compliance scores — ensures data governance standards are enforced";
      return "Monitor regulatory compliance posture — feeds compliance scorecard for risk committee";

    case "security-metrics":
      return "Track security posture metrics — vulnerability counts, access anomalies, threat indicators for CISO dashboard";

    case "operational-metrics":
      if (/join|lookup|enrich/i.test(name)) return "Enrich operational data with dimension attributes — enables drill-down analysis in BI tools";
      if (/derived|computed|withcolumn/i.test(name)) return "Compute derived operational indicators — categorization flags, business segments, feature extraction";
      if (/group|aggregat/i.test(name)) return "Aggregate operational events by dimensions — provides summary views for operational dashboards";
      if (/business.*rule|status|categor/i.test(name)) return "Apply business classification rules — maps raw operational data to business-defined categories";
      return "Track operational health indicators — throughput, utilization, queue depth, processing volumes";

    case "executive-reporting":
      if (/kpi|financial/i.test(name)) return "Calculate executive-level KPIs — revenue, retention, growth rates for C-suite and board reporting";
      if (/rate|ratio|growth/i.test(name)) return "Compute strategic business ratios — informs quarterly business review and investor relations";
      return "Generate executive-ready metrics — pre-aggregated KPIs for leadership dashboards";

    case "dashboard-datasets":
      if (/view|materialized/i.test(name)) return "Publish pre-computed dataset as view for BI tool consumption — optimized for DirectQuery performance";
      if (/pivot/i.test(name)) return "Produce pivoted cross-tab dataset — enables dimensional analysis in Power BI / Tableau";
      if (/write|save|output/i.test(name)) return "Persist Gold-ready dataset to Delta table — serves as single source of truth for downstream analytics";
      if (/partition/i.test(name)) return "Write partition-optimized dataset — enables efficient partition pruning for large-scale BI queries";
      if (/optimize|zorder/i.test(name)) return "Apply storage optimization — Z-ORDER clustering for sub-second dashboard query response";
      return "Prepare curated dataset for self-service analytics — schema-validated, documented, and query-optimized";

    default:
      return "Business metric derived from source transformation — ready for Gold layer consumption";
  }
}

function resolveGoldMetricName(t: DetectedTransformation, metric: GoldMetricType): string {
  const name = t.transformation_name;

  switch (metric) {
    case "revenue-metrics":
      if (/sum|total.*revenue/i.test(name)) return "Total Revenue (Daily)";
      if (/growth|trend/i.test(name)) return "Revenue Growth Rate (MoM)";
      if (/avg|average|per.*customer/i.test(name)) return "Average Revenue Per User (ARPU)";
      if (/count.*distinct|unique/i.test(name)) return "Unique Paying Customers";
      if (/ratio|conversion/i.test(name)) return "Revenue Conversion Rate";
      return `Revenue: ${name}`;

    case "cost-metrics":
      if (/sum|total/i.test(name)) return "Total Operating Cost";
      if (/ratio|rate/i.test(name)) return "Cost-Per-Transaction";
      return `Cost: ${name}`;

    case "sla-metrics":
      if (/percentile|p95/i.test(name)) return "P95 API Response Time";
      if (/p99/i.test(name)) return "P99 API Response Time";
      if (/error.*rate/i.test(name)) return "Error Rate (5xx)";
      if (/availab|uptime/i.test(name)) return "Service Availability (%)";
      if (/window|rolling/i.test(name)) return "Rolling SLA Compliance Window";
      return `SLA: ${name}`;

    case "compliance-metrics":
      if (/audit/i.test(name)) return "Audit Event Count";
      if (/null|quality|validation/i.test(name)) return "Data Quality Compliance Score";
      if (/referential/i.test(name)) return "Referential Integrity Pass Rate";
      if (/gate|circuit/i.test(name)) return "Pipeline Health Gate Status";
      return `Compliance: ${name}`;

    case "security-metrics":
      return `Security: ${name}`;

    case "operational-metrics":
      if (/join|lookup/i.test(name)) return "Dimension-Enriched Fact Table";
      if (/derived|withcolumn/i.test(name)) return "Feature-Enriched Dataset";
      if (/group|aggregat/i.test(name)) return "Operational Summary Aggregates";
      if (/case|conditional|udf/i.test(name)) return "Business-Classified Events";
      if (/temporal|year|month/i.test(name)) return "Time-Partitioned Fact Table";
      if (/concat|key/i.test(name)) return "Surrogate Key Enriched Facts";
      if (/status|categor/i.test(name)) return "Status-Mapped Operational Data";
      if (/threshold|cap/i.test(name)) return "Threshold-Governed Metrics";
      return `Operational: ${name}`;

    case "executive-reporting":
      if (/financial|kpi/i.test(name)) return "Executive KPI Scorecard";
      if (/rate|ratio|growth/i.test(name)) return "Strategic Business Ratios";
      if (/period|lag|lead/i.test(name)) return "Period-Over-Period Comparison";
      if (/rollup|cube/i.test(name)) return "Multi-Dimensional Rollup";
      return `Executive: ${name}`;

    case "dashboard-datasets":
      if (/view|materialized/i.test(name)) return "BI-Ready Materialized View";
      if (/pivot/i.test(name)) return "Cross-Tab Pivot Dataset";
      if (/write|save|output/i.test(name)) return "Gold Delta Table Output";
      if (/partition/i.test(name)) return "Partition-Optimized Dataset";
      if (/optimize|zorder/i.test(name)) return "Z-Ordered Analytics Table";
      if (/dashboard|bi/i.test(name)) return "Dashboard-Optimized Feed";
      return `Dataset: ${name}`;

    default:
      return name;
  }
}

function resolveKPIFormula(t: DetectedTransformation, metric: GoldMetricType, agg: AggregationType): string | undefined {
  switch (metric) {
    case "revenue-metrics":
      if (agg === "SUM") return "SUM(amount) WHERE status = 'completed'";
      if (agg === "TREND") return "((current_period - prior_period) / prior_period) * 100";
      if (agg === "RATE") return "completed_orders / total_orders * 100";
      if (agg === "AVG") return "SUM(revenue) / COUNT(DISTINCT customer_id)";
      return undefined;
    case "cost-metrics":
      if (agg === "SUM") return "SUM(cost_amount) GROUP BY cost_category, period";
      if (agg === "RATE") return "total_cost / total_transactions";
      return undefined;
    case "sla-metrics":
      if (agg === "PERCENTILE") return "PERCENTILE_APPROX(response_time_ms, 0.95)";
      if (agg === "RATE") return "COUNT(status >= 500) / COUNT(*) * 100";
      if (agg === "AVG") return "AVG(response_time_ms) PER service PER hour";
      return undefined;
    case "compliance-metrics":
      if (agg === "COUNT") return "COUNT(*) WHERE dq_pass = false GROUP BY check_type";
      if (agg === "RATE") return "passed_checks / total_checks * 100";
      return undefined;
    default:
      return undefined;
  }
}

function mapConfidence(sourceConfidence: number, metric: GoldMetricType): string {
  const directMetrics: GoldMetricType[] = ["revenue-metrics", "sla-metrics", "executive-reporting"];
  const boost = directMetrics.includes(metric) ? 3 : -5;
  const adjusted = Math.min(100, Math.max(40, sourceConfidence + boost));
  if (adjusted >= 90) return "high";
  if (adjusted >= 75) return "medium-high";
  if (adjusted >= 60) return "medium";
  return "low";
}

// ── Synthetic Gold specs for enterprise completeness ────────────────────────

function generateSyntheticSpecs(existing: GoldSpecEntry[], nextId: { value: number }): GoldSpecEntry[] {
  const synthetic: GoldSpecEntry[] = [];
  const hasCategory = (cat: GoldMetricType) => existing.some((s) => s.metric_category === cat);

  if (!hasCategory("revenue-metrics")) {
    synthetic.push({
      id: `gs-${nextId.value++}`,
      gold_metric: "Total Revenue (Daily)",
      business_purpose: "Track daily total revenue — foundation metric for all financial reporting and executive dashboards",
      aggregation_type: "SUM",
      dashboard_type: "financial-summary",
      confidence: "medium",
      metric_category: "revenue-metrics",
      source_transformation_id: "synthetic",
      source_category: "kpi-calculations",
      grain: "daily",
      refresh_frequency: "daily",
      source_columns: ["amount", "status"],
      kpi_formula: "SUM(amount) WHERE status = 'completed'",
    });
  }

  if (!hasCategory("sla-metrics")) {
    synthetic.push({
      id: `gs-${nextId.value++}`,
      gold_metric: "P95 Response Time",
      business_purpose: "Monitor API latency at 95th percentile — primary SLA compliance indicator for customer-facing services",
      aggregation_type: "PERCENTILE",
      dashboard_type: "sla-tracker",
      confidence: "medium",
      metric_category: "sla-metrics",
      source_transformation_id: "synthetic",
      source_category: "kpi-calculations",
      grain: "hourly",
      refresh_frequency: "hourly",
      source_columns: ["response_time_ms", "service_name"],
      kpi_formula: "PERCENTILE_APPROX(response_time_ms, 0.95)",
    });
  }

  if (!hasCategory("compliance-metrics")) {
    synthetic.push({
      id: `gs-${nextId.value++}`,
      gold_metric: "Data Quality Compliance Score",
      business_purpose: "Aggregate data quality pass rates across all Silver validations — feeds compliance scorecard for governance team",
      aggregation_type: "RATE",
      dashboard_type: "compliance-scorecard",
      confidence: "medium",
      metric_category: "compliance-metrics",
      source_transformation_id: "synthetic",
      source_category: "data-validation",
      grain: "daily",
      refresh_frequency: "daily 04:00 UTC",
      source_columns: ["check_type", "pass_count", "fail_count"],
      kpi_formula: "SUM(pass_count) / (SUM(pass_count) + SUM(fail_count)) * 100",
    });
  }

  if (!hasCategory("executive-reporting")) {
    synthetic.push({
      id: `gs-${nextId.value++}`,
      gold_metric: "Executive KPI Scorecard",
      business_purpose: "Pre-aggregated top-line KPIs for C-suite dashboard — revenue, growth rate, customer count, SLA compliance in single view",
      aggregation_type: "COMPOSITE",
      dashboard_type: "executive-kpi",
      confidence: "medium",
      metric_category: "executive-reporting",
      source_transformation_id: "synthetic",
      source_category: "kpi-calculations",
      grain: "daily",
      refresh_frequency: "daily 06:00 UTC",
      source_columns: [],
    });
  }

  // Always add an audit metric
  if (!existing.some((s) => s.gold_metric.toLowerCase().includes("audit"))) {
    synthetic.push({
      id: `gs-${nextId.value++}`,
      gold_metric: "Pipeline Audit Summary",
      business_purpose: "Aggregate pipeline execution metrics — records processed, errors, latency, SLA adherence per run for operational governance",
      aggregation_type: "SNAPSHOT",
      dashboard_type: "operational-monitor",
      confidence: "high",
      metric_category: "operational-metrics",
      source_transformation_id: "synthetic",
      source_category: "reporting-logic",
      grain: "per-run",
      refresh_frequency: "per pipeline execution",
      source_columns: ["run_id", "records_in", "records_out", "errors", "duration_sec"],
    });
  }

  return synthetic;
}

// ── Dashboard catalog generation ────────────────────────────────────────────

function buildDashboardCatalog(specs: GoldSpecEntry[]): DashboardCatalogEntry[] {
  const catalog: DashboardCatalogEntry[] = [];
  const byDashboard = new Map<DashboardType, GoldSpecEntry[]>();

  for (const s of specs) {
    const list = byDashboard.get(s.dashboard_type) || [];
    list.push(s);
    byDashboard.set(s.dashboard_type, list);
  }

  const audiences: Record<DashboardType, string> = {
    "executive-kpi": "C-Suite, Board, Investors",
    "operational-monitor": "SRE, Platform Engineering, NOC",
    "financial-summary": "CFO, Finance, FP&A",
    "compliance-scorecard": "Compliance, Legal, Risk Committee",
    "security-posture": "CISO, Security Operations",
    "sla-tracker": "Engineering Leads, Customer Success",
    "trend-analysis": "Strategy, Product, Data Science",
    "real-time-feed": "NOC, On-Call Engineering",
    "self-service": "Business Analysts, Data Consumers",
  };

  const refreshes: Record<DashboardType, string> = {
    "executive-kpi": "Daily 06:00 UTC",
    "operational-monitor": "Hourly",
    "financial-summary": "Daily end-of-day",
    "compliance-scorecard": "Daily 04:00 UTC",
    "security-posture": "Hourly",
    "sla-tracker": "Hourly",
    "trend-analysis": "Daily",
    "real-time-feed": "5-min micro-batch",
    "self-service": "Daily",
  };

  for (const [dt, entries] of byDashboard) {
    catalog.push({
      dashboard_type: dt,
      label: DASHBOARD_LABELS[dt],
      metrics: entries.map((e) => e.gold_metric),
      refresh: refreshes[dt] || "Daily",
      audience: audiences[dt] || "Business Users",
    });
  }

  return catalog.sort((a, b) => b.metrics.length - a.metrics.length);
}

// ── Main entry point ────────────────────────────────────────────────────────

export function analyzeGoldSpec(
  sourceCode: string,
  outputCode: string,
  direction: "aws-to-azure" | "azure-to-aws"
): GoldSpecResult {
  const patternResult = analyzeTransformationPatterns(sourceCode, outputCode, direction);
  const specs: GoldSpecEntry[] = [];
  const nextId = { value: 1 };

  for (const t of patternResult.transformations) {
    const metric = classifyToGoldMetric(t);
    const agg = resolveAggregationType(t);
    const dashboard = resolveDashboardType(metric, t);
    const grain = resolveGrain(t, metric);
    const refresh = resolveRefreshFrequency(grain, metric);
    const purpose = resolveBusinessPurpose(t, metric);
    const goldMetricName = resolveGoldMetricName(t, metric);
    const confidence = mapConfidence(t.confidence, metric);
    const formula = resolveKPIFormula(t, metric, agg);

    specs.push({
      id: `gs-${nextId.value++}`,
      gold_metric: goldMetricName,
      business_purpose: purpose,
      aggregation_type: agg,
      dashboard_type: dashboard,
      confidence,
      metric_category: metric,
      source_transformation_id: t.id,
      source_category: t.category,
      grain,
      refresh_frequency: refresh,
      source_columns: [...t.source_columns, ...t.target_columns].slice(0, 10),
      kpi_formula: formula,
    });
  }

  const synthetic = generateSyntheticSpecs(specs, nextId);
  specs.push(...synthetic);

  const metricBreakdown = {} as Record<GoldMetricType, number>;
  for (const mt of Object.keys(METRIC_LABELS) as GoldMetricType[]) {
    metricBreakdown[mt] = specs.filter((s) => s.metric_category === mt).length;
  }

  const dashboardBreakdown = {} as Record<DashboardType, number>;
  for (const dt of Object.keys(DASHBOARD_LABELS) as DashboardType[]) {
    dashboardBreakdown[dt] = specs.filter((s) => s.dashboard_type === dt).length;
  }

  const categoriesUsed = Object.values(metricBreakdown).filter((c) => c > 0).length;
  const dashboardTypesUsed = Object.values(dashboardBreakdown).filter((c) => c > 0).length;
  const highConf = specs.filter((s) => s.confidence === "high").length;
  const confMap: Record<string, number> = { high: 95, "medium-high": 82, medium: 68, low: 50 };
  const avgConf = specs.length > 0 ? Math.round(specs.reduce((s, sp) => s + (confMap[sp.confidence] || 70), 0) / specs.length) : 0;
  const dominantCategory = (Object.entries(metricBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || "operational-metrics") as GoldMetricType;

  const warnings: string[] = [];
  if (categoriesUsed < 4) warnings.push(`Only ${categoriesUsed}/8 Gold metric categories populated — consider adding missing business dimensions`);
  if (!metricBreakdown["revenue-metrics"]) warnings.push("No revenue metrics detected — financial reporting will require manual metric definitions");
  if (!metricBreakdown["sla-metrics"]) warnings.push("No SLA metrics detected — service level monitoring requires explicit latency/availability KPIs");
  if (synthetic.length > 3) warnings.push(`${synthetic.length} metrics were auto-generated to ensure enterprise completeness — verify against actual business requirements`);

  return {
    specs,
    metricBreakdown,
    dashboardBreakdown,
    summary: {
      totalMetrics: specs.length,
      categoriesUsed,
      dashboardTypesUsed,
      highConfidenceCount: highConf,
      avgConfidence: avgConf,
      dominantCategory,
      warnings,
      syntheticCount: synthetic.length,
    },
    dashboardCatalog: buildDashboardCatalog(specs),
  };
}
