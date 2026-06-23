import { analyzeSilverLayer, type SilverLayerResult } from "./silver-layer-analyzer";
import { analyzeGoldLayer, type GoldLayerResult } from "./gold-layer-analyzer";
import { analyzeSynchronization, type SyncAnalysisResult } from "./sync-analyzer";
import { analyzePlatformDependencies, type DependencyReport } from "./platform-dependency-analyzer";
import { analyzeParallelExecution, type ParallelAnalysisResult } from "./parallel-analyzer";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RiskSeverity = "critical" | "high" | "medium" | "low" | "info";
export type MigrationPhase = "assessment" | "bronze" | "silver" | "gold" | "orchestration" | "validation" | "cutover";
export type ArchCategory = "data-pipeline" | "event-driven" | "orchestration" | "analytics" | "security" | "observability";

export interface MigrationRisk {
  id: string;
  title: string;
  description: string;
  severity: RiskSeverity;
  phase: MigrationPhase;
  category: ArchCategory;
  mitigation: string;
  autoResolvable: boolean;
  affectedComponents: string[];
}

export interface ArchitectureRecommendation {
  id: string;
  title: string;
  description: string;
  category: ArchCategory;
  priority: number;
  effort: "trivial" | "small" | "medium" | "large" | "epic";
  impact: "low" | "medium" | "high" | "critical";
  targetPattern: string;
  codeSnippet: string;
}

export interface ValidationSpec {
  id: string;
  name: string;
  phase: MigrationPhase;
  type: "structural" | "semantic" | "data-integrity" | "performance" | "security";
  description: string;
  checkCode: string;
  autoEnforceable: boolean;
  severity: RiskSeverity;
}

export interface TransformationSpec {
  layer: "bronze" | "silver" | "gold";
  name: string;
  intent: string;
  inputSchema: string[];
  outputSchema: string[];
  code: string;
  language: string;
  reusable: boolean;
}

export interface ExecutionNode {
  id: string;
  name: string;
  type: "action" | "decision" | "parallel" | "wait" | "sync" | "transform";
  layer: MigrationPhase;
  dependencies: string[];
  parallelGroup: string | null;
}

export interface SemanticMigrationReport {
  silverLayer: SilverLayerResult | null;
  goldLayer: GoldLayerResult | null;
  syncAnalysis: SyncAnalysisResult | null;
  platformDeps: DependencyReport | null;
  parallelAnalysis: ParallelAnalysisResult | null;

  risks: MigrationRisk[];
  architectureRecommendations: ArchitectureRecommendation[];
  validationSpecs: ValidationSpec[];
  transformationSpecs: TransformationSpec[];
  executionGraph: ExecutionNode[];

  migrationSummary: MigrationSummary;
  overallConfidence: number;
}

export interface MigrationSummary {
  totalSteps: number;
  preservedBusinessLogic: number;
  preservedDependencies: number;
  preservedParallelism: number;
  preservedErrorHandling: number;
  preservedValidations: number;
  preservedMonitoring: number;
  modernizedTransforms: number;
  removedPlatformDeps: number;
  generatedCloudNative: number;
  autoResolvableRisks: number;
  manualReviewRequired: number;
  byPhase: Record<MigrationPhase, PhaseStatus>;
  warnings: string[];
}

export interface PhaseStatus {
  label: string;
  itemCount: number;
  confidence: number;
  risks: number;
  status: "complete" | "partial" | "pending" | "blocked";
}

// ─── Phase labels ────────────────────────────────────────────────────────────

export const PHASE_LABELS: Record<MigrationPhase, string> = {
  assessment: "Assessment",
  bronze: "Bronze Layer",
  silver: "Silver Layer",
  gold: "Gold Layer",
  orchestration: "Orchestration",
  validation: "Validation",
  cutover: "Cutover",
};

export const ARCH_LABELS: Record<ArchCategory, string> = {
  "data-pipeline": "Data Pipeline",
  "event-driven": "Event-Driven",
  orchestration: "Orchestration",
  analytics: "Analytics",
  security: "Security",
  observability: "Observability",
};

// ─── Workflow structure analysis ─────────────────────────────────────────────

function extractWorkflowSteps(sourceCode: string): string[] {
  const steps: string[] = [];
  const statePattern = /"(\w+)"\s*:\s*\{\s*"Type"\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = statePattern.exec(sourceCode))) steps.push(m[1]);

  const actionPattern = /"(\w+)"\s*:\s*\{\s*"type"\s*:\s*"(?:Http|Function|ApiConnection|Foreach|Until|If|Switch|Scope|Wait)/g;
  while ((m = actionPattern.exec(sourceCode))) {
    if (!steps.includes(m[1])) steps.push(m[1]);
  }
  return steps;
}

function detectBusinessLogicPatterns(src: string): string[] {
  const patterns: string[] = [];
  const checks: [RegExp, string][] = [
    [/\bCASE\s+WHEN\b/gi, "Conditional business rules (CASE/WHEN)"],
    [/\bSUM\s*\(|AVG\s*\(|COUNT\s*\(|MAX\s*\(|MIN\s*\(/gi, "Aggregation logic"],
    [/\bGROUP\s+BY\b/gi, "Grouping operations"],
    [/\bJOIN\b/gi, "Data join/enrichment"],
    [/\bWHERE\b.*(?:AND|OR)\b/gi, "Multi-condition filters"],
    [/\bROLLUP\b|\bCUBE\b|\bPIVOT\b/gi, "Multi-level aggregation"],
    [/\bLAG\s*\(|LEAD\s*\(|ROW_NUMBER\s*\(|RANK\s*\(/gi, "Window functions"],
    [/\bCOALESCE\s*\(|IFNULL\s*\(|NVL\s*\(/gi, "Null handling"],
    [/\bCAST\s*\(|CONVERT\s*\(/gi, "Type conversion"],
    [/\bDATEDIFF\s*\(|DATE_FORMAT\s*\(|TO_DATE\s*\(/gi, "Date/time processing"],
    [/\bREGEXP_REPLACE\s*\(|TRIM\s*\(|UPPER\s*\(|LOWER\s*\(/gi, "Text standardization"],
    [/\bDISTINCT\b|\bROW_NUMBER\s*\(\s*\)\s+OVER\b/gi, "Deduplication"],
    [/\bENCRYPT\s*\(|HASH\s*\(|SHA2\s*\(|MD5\s*\(/gi, "PII masking / encryption"],
    [/\bretry/gi, "Retry / fault tolerance"],
    [/\bcatch\b|\berror\b.*\bhandl/gi, "Error handling"],
    [/\bSLA\b|\bcompliance\b|\baudit\b/gi, "Compliance / audit logic"],
    [/\bnotif|alert|email|sms|webhook/gi, "Notification / alerting"],
    [/\bdashboard|report|visual/gi, "Reporting / dashboard"],
    [/\bmetric|kpi|score|index/gi, "KPI / metric calculation"],
    [/\bvalidat|assert|check|verify/gi, "Validation checkpoint"],
  ];
  for (const [re, label] of checks) {
    if (re.test(src)) patterns.push(label);
  }
  return patterns;
}

function detectErrorHandling(src: string): { count: number; patterns: string[] } {
  const patterns: string[] = [];
  let count = 0;
  const checks: [RegExp, string][] = [
    [/"Catch"\s*:/g, "Try/Catch states (ASL)"],
    [/"Retry"\s*:\s*\[/g, "Retry policies (ASL)"],
    [/"retryPolicy"\s*:/g, "Retry policies (Logic Apps)"],
    [/"runAfter".*"Failed"/g, "runAfter error handling"],
    [/"ErrorEquals"/g, "Error-specific catch"],
    [/"Scope"[^]*"actions"/g, "Scope-based error boundaries"],
    [/"operationOptions"\s*:\s*"DisableAsyncPattern"/g, "Sync error propagation"],
  ];
  for (const [re, label] of checks) {
    const matches = src.match(re);
    if (matches) {
      count += matches.length;
      patterns.push(`${label} (${matches.length}×)`);
    }
  }
  return { count, patterns };
}

function detectMonitoringPatterns(src: string): string[] {
  const patterns: string[] = [];
  const checks: [RegExp, string][] = [
    [/CloudWatch|cloudwatch|PutMetricData/gi, "CloudWatch metrics"],
    [/Application\s*Insights|appInsights/gi, "Application Insights"],
    [/Azure\s*Monitor|azureMonitor/gi, "Azure Monitor"],
    [/X-Ray|xray|tracingConfiguration/gi, "Distributed tracing"],
    [/Log\s*Analytics|logAnalytics/gi, "Log Analytics"],
    [/SNS|ServiceBus.*Topic|notification/gi, "Alert notifications"],
    [/PutLogEvents|diagnosticSettings/gi, "Diagnostic logging"],
    [/alarm|metric\s*alert/gi, "Metric alerting"],
  ];
  for (const [re, label] of checks) {
    if (re.test(src)) patterns.push(label);
  }
  return patterns;
}

// ─── Risk analysis ───────────────────────────────────────────────────────────

function analyzeRisks(
  src: string,
  out: string,
  silver: SilverLayerResult | null,
  gold: GoldLayerResult | null,
  sync: SyncAnalysisResult | null,
  deps: DependencyReport | null,
  parallel: ParallelAnalysisResult | null
): MigrationRisk[] {
  const risks: MigrationRisk[] = [];
  let rid = 0;
  const mkId = () => `RISK-${++rid}`;

  // Data layer risks
  if (silver) {
    const piiIntents = silver.intents.filter((i) => i.category === "pii-masking");
    if (piiIntents.length > 0) {
      risks.push({
        id: mkId(), title: "PII Data Exposure During Migration",
        description: `${piiIntents.length} PII masking transform(s) detected — data must not be exposed during migration cutover`,
        severity: "critical", phase: "silver", category: "security",
        mitigation: "Apply PII masking transforms BEFORE any data lands in target storage; validate with data classification scan",
        autoResolvable: false, affectedComponents: piiIntents.map((i) => i.fields.join(", ")),
      });
    }
    const lowConf = silver.intents.filter((i) => i.confidence < 0.7);
    if (lowConf.length > 0) {
      risks.push({
        id: mkId(), title: "Low-Confidence Silver Transforms",
        description: `${lowConf.length} silver layer transform(s) have confidence below 70% — business logic may not be fully preserved`,
        severity: "high", phase: "silver", category: "data-pipeline",
        mitigation: "Manual review required for each low-confidence transform; validate with sample data comparison",
        autoResolvable: false, affectedComponents: lowConf.map((i) => i.id),
      });
    }
    const failedValidations = silver.validationRules.filter((v) => !v.autoFix);
    if (failedValidations.length > 0) {
      risks.push({
        id: mkId(), title: "Non-Enforceable Validation Rules",
        description: `${failedValidations.length} validation rule(s) cannot be auto-enforced — manual test cases needed`,
        severity: "medium", phase: "validation", category: "data-pipeline",
        mitigation: "Create manual test scripts for each non-enforceable rule; include in UAT test plan",
        autoResolvable: false, affectedComponents: failedValidations.map((v) => v.id),
      });
    }
  }

  if (gold) {
    const complexSpecs = gold.specs.filter((s) => s.code.length > 500);
    if (complexSpecs.length > 0) {
      risks.push({
        id: mkId(), title: "Complex Gold Layer Calculations",
        description: `${complexSpecs.length} gold layer spec(s) contain complex calculations that need numerical validation`,
        severity: "high", phase: "gold", category: "analytics",
        mitigation: "Run source and target calculations on identical datasets; compare results within tolerance threshold",
        autoResolvable: false, affectedComponents: complexSpecs.map((s) => s.name),
      });
    }
    if (gold.dependencyGraph.links.length > 0) {
      const orphaned = gold.dependencyGraph.nodes.filter(
        (n) => n.layer === "gold" && !gold.dependencyGraph.links.some((e: { from: string; to: string }) => e.to === n.id)
      );
      if (orphaned.length > 0) {
        risks.push({
          id: mkId(), title: "Orphaned Gold Layer Nodes",
          description: `${orphaned.length} gold node(s) have no inbound Silver dependencies — may be disconnected from data pipeline`,
          severity: "medium", phase: "gold", category: "analytics",
          mitigation: "Verify each orphaned node receives data from an alternative source or mark as independent",
          autoResolvable: false, affectedComponents: orphaned.map((n) => n.id),
        });
      }
    }
  }

  // Sync risks
  if (sync) {
    const unbounded = sync.constructs.filter((c) => c.estimatedDuration === "unbounded");
    if (unbounded.length > 0) {
      risks.push({
        id: mkId(), title: "Unbounded Execution Duration",
        description: `${unbounded.length} synchronous operation(s) have no timeout — could block workflow indefinitely`,
        severity: "critical", phase: "orchestration", category: "orchestration",
        mitigation: "Add timeout guards (actionTimeout or Until limit) to all long-running operations",
        autoResolvable: true, affectedComponents: unbounded.map((c) => c.name),
      });
    }
    const missingPolling = sync.strategies.filter((s) => s.riskLevel === "high");
    if (missingPolling.length > 0) {
      risks.push({
        id: mkId(), title: "High-Risk Sync Strategies",
        description: `${missingPolling.length} synchronization strateg(ies) flagged as high-risk`,
        severity: "high", phase: "orchestration", category: "orchestration",
        mitigation: "Implement polling loops with exponential backoff for each high-risk strategy",
        autoResolvable: true, affectedComponents: missingPolling.map((s) => s.constructId),
      });
    }
  }

  // Platform dep risks
  if (deps) {
    if (deps.summary.manualReviewCount > 0) {
      risks.push({
        id: mkId(), title: "Manual Platform Dependency Replacements",
        description: `${deps.summary.manualReviewCount} platform dependency(ies) cannot be auto-replaced`,
        severity: "high", phase: "cutover", category: "data-pipeline",
        mitigation: "Review each manual replacement; create integration test for target service",
        autoResolvable: false, affectedComponents: deps.dependencies.filter((d) => !d.autoReplaceable).map((d) => d.original),
      });
    }
    const residualWarnings = deps.summary.warnings.filter((w) => /residual/i.test(w));
    if (residualWarnings.length > 0) {
      risks.push({
        id: mkId(), title: "Residual Platform References",
        description: "Source-platform references remain in output after replacement pass",
        severity: "high", phase: "cutover", category: "data-pipeline",
        mitigation: "Run CAT-53 post-processor and manually review remaining references",
        autoResolvable: true, affectedComponents: residualWarnings,
      });
    }
  }

  // Parallel risks
  if (parallel) {
    if (parallel.warnings.length > 0) {
      risks.push({
        id: mkId(), title: "Parallelism Preservation Warnings",
        description: `${parallel.warnings.length} warning(s) about parallel execution fidelity`,
        severity: "medium", phase: "orchestration", category: "orchestration",
        mitigation: "Verify concurrency settings match source; test with parallel workload",
        autoResolvable: true, affectedComponents: parallel.warnings,
      });
    }
  }

  // Cross-cutting: error handling gap
  const srcErrors = detectErrorHandling(src);
  const outErrors = detectErrorHandling(out);
  if (srcErrors.count > outErrors.count) {
    risks.push({
      id: mkId(), title: "Error Handling Gap",
      description: `Source has ${srcErrors.count} error handling constructs vs ${outErrors.count} in target — ${srcErrors.count - outErrors.count} may be lost`,
      severity: "high", phase: "orchestration", category: "orchestration",
      mitigation: "Add retry policies and error scopes to match source error handling coverage",
      autoResolvable: true, affectedComponents: srcErrors.patterns,
    });
  }

  // Monitoring gap
  const srcMon = detectMonitoringPatterns(src);
  const outMon = detectMonitoringPatterns(out);
  const lostMon = srcMon.filter((p) => !outMon.some((o) => o.toLowerCase().includes(p.split(" ")[0].toLowerCase())));
  if (lostMon.length > 0) {
    risks.push({
      id: mkId(), title: "Monitoring Coverage Gap",
      description: `${lostMon.length} source monitoring pattern(s) not detected in target output`,
      severity: "medium", phase: "validation", category: "observability",
      mitigation: "Add Azure Monitor / Application Insights equivalents for each missing pattern",
      autoResolvable: true, affectedComponents: lostMon,
    });
  }

  return risks;
}

// ─── Architecture recommendations ────────────────────────────────────────────

function generateArchRecommendations(
  src: string,
  direction: "aws-to-azure" | "azure-to-aws",
  silver: SilverLayerResult | null,
  gold: GoldLayerResult | null,
  sync: SyncAnalysisResult | null,
  deps: DependencyReport | null
): ArchitectureRecommendation[] {
  const recs: ArchitectureRecommendation[] = [];
  let aid = 0;
  const mkId = () => `ARCH-${++aid}`;
  const isToAzure = direction === "aws-to-azure";

  recs.push({
    id: mkId(), title: "Managed Identity Authentication",
    description: "Replace all IAM roles and access keys with Azure Managed Service Identity for zero-secret deployments",
    category: "security", priority: 1, effort: "medium", impact: "critical",
    targetPattern: "ManagedServiceIdentity across all connectors",
    codeSnippet: `"authentication": {\n  "type": "ManagedServiceIdentity",\n  "audience": "https://management.azure.com/"\n}`,
  });

  recs.push({
    id: mkId(), title: "ARM Parameter Externalization",
    description: "Extract all environment-specific values into ARM template parameters for multi-environment deployment",
    category: "orchestration", priority: 2, effort: "small", impact: "high",
    targetPattern: "parameters() references for all configurable values",
    codeSnippet: `"parameters": {\n  "subscriptionId": { "type": "string" },\n  "resourceGroup": { "type": "string" },\n  "storageAccountName": { "type": "string" }\n}`,
  });

  if (silver && silver.intents.length > 0) {
    recs.push({
      id: mkId(), title: "Delta Lake for Silver Layer",
      description: "Use Delta Lake format for all Silver layer outputs — enables ACID transactions, schema evolution, and time travel",
      category: "data-pipeline", priority: 3, effort: "medium", impact: "high",
      targetPattern: "Delta format with merge-on-read write mode",
      codeSnippet: `df.write\n  .format("delta")\n  .mode("merge")\n  .option("mergeSchema", "true")\n  .save("abfss://{container}@{account}.dfs.core.windows.net/silver/{table}")`,
    });

    const hasPii = silver.intents.some((i) => i.category === "pii-masking");
    if (hasPii) {
      recs.push({
        id: mkId(), title: "Unity Catalog Column-Level Security",
        description: "Apply column-level masking via Unity Catalog policies for PII fields instead of application-layer masking",
        category: "security", priority: 2, effort: "medium", impact: "critical",
        targetPattern: "CREATE MASKING POLICY + ALTER TABLE SET MASKING POLICY",
        codeSnippet: `CREATE MASKING POLICY pii_mask AS (val STRING)\n  RETURNS STRING\n  RETURN CASE WHEN is_member('pii_readers') THEN val\n    ELSE '***MASKED***' END;\n\nALTER TABLE silver.customers\n  ALTER COLUMN email SET MASKING POLICY pii_mask;`,
      });
    }
  }

  if (gold && gold.specs.length > 0) {
    recs.push({
      id: mkId(), title: "Materialized Views for Gold Aggregations",
      description: "Use Databricks SQL materialized views for Gold layer aggregations — auto-refreshed, optimized query plans",
      category: "analytics", priority: 3, effort: "medium", impact: "high",
      targetPattern: "CREATE MATERIALIZED VIEW with scheduled refresh",
      codeSnippet: `CREATE MATERIALIZED VIEW gold.daily_revenue_summary AS\nSELECT date, region,\n  SUM(revenue) as total_revenue,\n  COUNT(DISTINCT customer_id) as unique_customers\nFROM silver.transactions\nGROUP BY date, region;`,
    });

    recs.push({
      id: mkId(), title: "Z-ORDER Optimization for Gold Tables",
      description: "Apply Z-ORDER indexing on frequently filtered columns in Gold tables for query acceleration",
      category: "analytics", priority: 4, effort: "trivial", impact: "medium",
      targetPattern: "OPTIMIZE table ZORDER BY (columns)",
      codeSnippet: `OPTIMIZE gold.daily_revenue_summary\n  ZORDER BY (date, region);`,
    });
  }

  if (sync && sync.constructs.length > 0) {
    recs.push({
      id: mkId(), title: "Until-Loop Polling with Backoff",
      description: "Replace .sync integrations with Until loops using exponential backoff to prevent API throttling",
      category: "orchestration", priority: 2, effort: "medium", impact: "high",
      targetPattern: "Until loop with delay × 2^iteration pattern",
      codeSnippet: isToAzure
        ? `"Poll_Job_Status": {\n  "type": "Until",\n  "expression": "@equals(body('Check_Status')?['status'], 'Completed')",\n  "limit": { "count": 60, "timeout": "PT1H" },\n  "actions": {\n    "Check_Status": { "type": "Http", ... },\n    "Wait_Backoff": { "type": "Wait", "inputs": { "interval": { "count": 30, "unit": "Second" } } }\n  }\n}`
        : `"PollJobStatus": {\n  "Type": "Wait",\n  "Seconds": 30,\n  "Next": "CheckJobStatus"\n}`,
    });
  }

  if (deps && deps.summary.totalDependencies > 0) {
    recs.push({
      id: mkId(), title: "Service Bus for Event-Driven Decoupling",
      description: "Replace point-to-point SQS/SNS with Azure Service Bus Topics for fan-out event distribution",
      category: "event-driven", priority: 3, effort: "medium", impact: "high",
      targetPattern: "Service Bus Topic + multiple Subscriptions with filters",
      codeSnippet: `"Send_Event": {\n  "type": "ApiConnection",\n  "inputs": {\n    "host": { "connection": { "name": "@parameters('$connections')['servicebus']['connectionId']" } },\n    "method": "post",\n    "path": "/@{encodeURIComponent('workflow-events')}/messages"\n  }\n}`,
    });
  }

  recs.push({
    id: mkId(), title: "Application Insights End-to-End Tracing",
    description: "Instrument all workflow actions with Application Insights correlation IDs for distributed tracing",
    category: "observability", priority: 3, effort: "small", impact: "high",
    targetPattern: "trackedProperties with correlationId on every action",
    codeSnippet: `"trackedProperties": {\n  "correlationId": "@{triggerOutputs()?['headers']?['x-ms-correlation-id']}",\n  "workflowRunId": "@{workflow().run.name}",\n  "actionName": "@{actions('Current_Action')?['name']}"\n}`,
  });

  recs.push({
    id: mkId(), title: "Logic Apps Standard (Single-Tenant) Deployment",
    description: "Deploy as Logic Apps Standard for VNET integration, dedicated compute, and stateful/stateless workflow choice",
    category: "orchestration", priority: 4, effort: "large", impact: "medium",
    targetPattern: "Standard SKU with VNET injection",
    codeSnippet: `{\n  "type": "Microsoft.Web/sites",\n  "kind": "workflowapp",\n  "properties": {\n    "virtualNetworkSubnetId": "[parameters('subnetId')]",\n    "siteConfig": { "appSettings": [{ "name": "WORKFLOWS_TENANT_ID", "value": "[subscription().tenantId]" }] }\n  }\n}`,
  });

  return recs;
}

// ─── Validation specs ────────────────────────────────────────────────────────

function generateValidationSpecs(
  src: string,
  out: string,
  silver: SilverLayerResult | null,
  gold: GoldLayerResult | null,
  sync: SyncAnalysisResult | null
): ValidationSpec[] {
  const specs: ValidationSpec[] = [];
  let vid = 0;
  const mkId = () => `VAL-${++vid}`;

  specs.push({
    id: mkId(), name: "Workflow Structure Integrity",
    phase: "assessment", type: "structural",
    description: "Verify target workflow has equivalent action count and trigger type",
    checkCode: `const srcSteps = (sourceJson.match(/"Type"\\s*:/g) || []).length;\nconst tgtSteps = (targetJson.match(/"type"\\s*:/g) || []).length;\nassert(tgtSteps >= srcSteps * 0.9, \`Step count dropped >10%: \${srcSteps} → \${tgtSteps}\`);`,
    autoEnforceable: true, severity: "high",
  });

  specs.push({
    id: mkId(), name: "No Platform Residuals",
    phase: "cutover", type: "structural",
    description: "Verify no source-platform references remain in target output",
    checkCode: `const residuals = targetJson.match(/arn:aws:|AWS::|lambda:|sqs:|sns:|dynamodb:/gi);\nassert(!residuals || residuals.length === 0, \`Residual platform refs: \${residuals?.join(', ')}\`);`,
    autoEnforceable: true, severity: "critical",
  });

  specs.push({
    id: mkId(), name: "Authentication Method",
    phase: "validation", type: "security",
    description: "Verify all connectors use ManagedServiceIdentity — no hardcoded keys",
    checkCode: `const authBlocks = targetJson.match(/"authentication"\\s*:\\s*\\{[^}]+\\}/g) || [];\nfor (const block of authBlocks) {\n  assert(block.includes('ManagedServiceIdentity'), \`Non-MSI auth found: \${block.slice(0,60)}\`);\n}`,
    autoEnforceable: true, severity: "critical",
  });

  specs.push({
    id: mkId(), name: "Parameter Externalization",
    phase: "validation", type: "structural",
    description: "Verify no hardcoded subscription IDs, resource groups, or connection strings",
    checkCode: `const hardcoded = targetJson.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);\nassert(!hardcoded, 'Hardcoded GUIDs found — externalize to parameters');`,
    autoEnforceable: true, severity: "high",
  });

  const srcErrors = detectErrorHandling(src);
  const outErrors = detectErrorHandling(out);
  specs.push({
    id: mkId(), name: "Error Handling Parity",
    phase: "orchestration", type: "semantic",
    description: `Source has ${srcErrors.count} error handlers — target must have at least equivalent coverage`,
    checkCode: `const srcCount = ${srcErrors.count};\nconst tgtCount = (targetJson.match(/"retryPolicy"|"Retry"|"Catch"|"runAfter".*"Failed"/g) || []).length;\nassert(tgtCount >= srcCount, \`Error handling gap: \${srcCount} source vs \${tgtCount} target\`);`,
    autoEnforceable: true, severity: "high",
  });

  if (silver) {
    for (const rule of silver.validationRules) {
      specs.push({
        id: mkId(), name: `Silver: ${rule.name}`,
        phase: "silver", type: "data-integrity",
        description: rule.description,
        checkCode: rule.fixCode ?? rule.expression,
        autoEnforceable: rule.autoFix, severity: rule.severity === "error" ? "high" : "medium",
      });
    }
  }

  if (gold) {
    specs.push({
      id: mkId(), name: "Gold Layer Dependency Chain",
      phase: "gold", type: "semantic",
      description: "Verify all Gold layer nodes have valid Silver layer input dependencies",
      checkCode: `const goldNodes = dependencyGraph.nodes.filter(n => n.layer === 'gold');\nconst silverIds = new Set(dependencyGraph.nodes.filter(n => n.layer === 'silver').map(n => n.id));\nfor (const g of goldNodes) {\n  const inputs = dependencyGraph.links.filter(e => e.to === g.id).map(e => e.from);\n  assert(inputs.some(i => silverIds.has(i)), \`Gold node \${g.id} has no Silver input\`);\n}`,
      autoEnforceable: true, severity: "high",
    });
  }

  if (sync) {
    for (const cv of sync.completionValidations) {
      specs.push({
        id: mkId(), name: `Sync: ${cv.name}`,
        phase: "orchestration", type: "semantic",
        description: cv.description,
        checkCode: cv.enforcementCode ?? cv.expression,
        autoEnforceable: cv.autoEnforce, severity: cv.severity === "critical" ? "critical" : "high",
      });
    }
  }

  specs.push({
    id: mkId(), name: "Retry Policy Coverage",
    phase: "validation", type: "performance",
    description: "All HTTP and Function actions must have retry policies",
    checkCode: `const actions = Object.entries(targetDef.definition?.actions || {});\nfor (const [name, action] of actions) {\n  if (['Http','Function'].includes(action.type)) {\n    assert(action.inputs?.retryPolicy || action.runtimeConfiguration?.retryPolicy,\n      \`Action '\${name}' missing retry policy\`);\n  }\n}`,
    autoEnforceable: true, severity: "medium",
  });

  return specs;
}

// ─── Transformation specs ────────────────────────────────────────────────────

function generateTransformationSpecs(
  silver: SilverLayerResult | null,
  gold: GoldLayerResult | null
): TransformationSpec[] {
  const specs: TransformationSpec[] = [];

  if (silver) {
    for (const t of silver.transforms) {
      specs.push({
        layer: "silver",
        name: t.name,
        intent: t.description,
        inputSchema: silver.metadata.map((m) => m.fieldName),
        outputSchema: silver.metadata.map((m) => `${m.fieldName} (${m.targetType})`),
        code: t.code,
        language: t.language,
        reusable: t.reusable,
      });
    }
  }

  if (gold) {
    for (const s of gold.specs) {
      specs.push({
        layer: "gold",
        name: s.name,
        intent: s.description,
        inputSchema: s.silverDependencies,
        outputSchema: s.outputSchema.map((o) => `${o.name} (${o.type})`),
        code: s.code,
        language: s.language,
        reusable: true,
      });
    }
  }

  return specs;
}

// ─── Execution graph ─────────────────────────────────────────────────────────

function buildExecutionGraph(
  src: string,
  sync: SyncAnalysisResult | null,
  parallel: ParallelAnalysisResult | null
): ExecutionNode[] {
  const nodes: ExecutionNode[] = [];
  const steps = extractWorkflowSteps(src);
  const seen = new Set<string>();

  if (sync) {
    for (const c of sync.constructs) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      nodes.push({
        id: c.id, name: c.name,
        type: c.patternType === "wait-state" ? "wait" : "sync",
        layer: "orchestration",
        dependencies: c.upstreamDeps,
        parallelGroup: null,
      });
    }
  }

  if (parallel) {
    for (const c of parallel.constructs) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      nodes.push({
        id: c.id, name: c.name,
        type: "parallel",
        layer: "orchestration",
        dependencies: c.dependencies,
        parallelGroup: c.containedIn || null,
      });
    }
  }

  for (const step of steps) {
    if (seen.has(step)) continue;
    seen.add(step);
    nodes.push({
      id: `step-${step}`, name: step,
      type: "action",
      layer: "orchestration",
      dependencies: [],
      parallelGroup: null,
    });
  }

  return nodes;
}

// ─── Main entry point ────────────────────────────────────────────────────────

export function analyzeSemanticMigration(
  sourceCode: string,
  outputCode: string,
  direction: "aws-to-azure" | "azure-to-aws"
): SemanticMigrationReport {
  // Run all sub-analyzers
  let silver: SilverLayerResult | null = null;
  let gold: GoldLayerResult | null = null;
  let sync: SyncAnalysisResult | null = null;
  let deps: DependencyReport | null = null;
  let parallel: ParallelAnalysisResult | null = null;

  try { silver = analyzeSilverLayer(sourceCode, outputCode, direction); } catch { /* skip */ }
  try { gold = analyzeGoldLayer(sourceCode, outputCode, direction); } catch { /* skip */ }
  try { sync = analyzeSynchronization(sourceCode, outputCode, direction); } catch { /* skip */ }
  try { deps = analyzePlatformDependencies(sourceCode, outputCode, direction); } catch { /* skip */ }
  try { parallel = analyzeParallelExecution(sourceCode, outputCode, direction); } catch { /* skip */ }

  const risks = analyzeRisks(sourceCode, outputCode, silver, gold, sync, deps, parallel);
  const archRecs = generateArchRecommendations(sourceCode, direction, silver, gold, sync, deps);
  const validationSpecs = generateValidationSpecs(sourceCode, outputCode, silver, gold, sync);
  const transformationSpecs = generateTransformationSpecs(silver, gold);
  const executionGraph = buildExecutionGraph(sourceCode, sync, parallel);

  const businessLogicPatterns = detectBusinessLogicPatterns(sourceCode);
  const srcErrors = detectErrorHandling(sourceCode);
  const outErrors = detectErrorHandling(outputCode);
  const srcMonitoring = detectMonitoringPatterns(sourceCode);
  const outMonitoring = detectMonitoringPatterns(outputCode);

  const srcSteps = extractWorkflowSteps(sourceCode);
  const outSteps = extractWorkflowSteps(outputCode);

  const phases: Record<MigrationPhase, PhaseStatus> = {
    assessment: {
      label: "Assessment", itemCount: businessLogicPatterns.length,
      confidence: 1.0, risks: risks.filter((r) => r.phase === "assessment").length, status: "complete",
    },
    bronze: {
      label: "Bronze Layer", itemCount: srcSteps.length,
      confidence: deps ? deps.overallConfidence : 0.8,
      risks: risks.filter((r) => r.phase === "bronze").length,
      status: deps && deps.overallConfidence > 0.7 ? "complete" : "partial",
    },
    silver: {
      label: "Silver Layer", itemCount: silver?.intents.length ?? 0,
      confidence: silver?.overallConfidence ?? 0,
      risks: risks.filter((r) => r.phase === "silver").length,
      status: silver && silver.overallConfidence > 0.7 ? "complete" : silver ? "partial" : "pending",
    },
    gold: {
      label: "Gold Layer", itemCount: gold?.specs.length ?? 0,
      confidence: gold?.overallConfidence ?? 0,
      risks: risks.filter((r) => r.phase === "gold").length,
      status: gold && gold.overallConfidence > 0.7 ? "complete" : gold ? "partial" : "pending",
    },
    orchestration: {
      label: "Orchestration", itemCount: (sync?.constructs.length ?? 0) + (parallel?.constructs.length ?? 0),
      confidence: ((sync?.overallConfidence ?? 0) + (parallel?.overallConfidence ?? 0)) / 2 || 0,
      risks: risks.filter((r) => r.phase === "orchestration").length,
      status: sync && parallel ? (sync.overallConfidence > 0.7 ? "complete" : "partial") : "pending",
    },
    validation: {
      label: "Validation", itemCount: validationSpecs.length,
      confidence: validationSpecs.length > 0 ? 0.9 : 0,
      risks: risks.filter((r) => r.phase === "validation").length,
      status: validationSpecs.length > 0 ? "complete" : "pending",
    },
    cutover: {
      label: "Cutover", itemCount: deps?.migrationPlan.length ?? 0,
      confidence: deps?.overallConfidence ?? 0,
      risks: risks.filter((r) => r.phase === "cutover").length,
      status: deps && deps.summary.manualReviewCount === 0 ? "complete" : "partial",
    },
  };

  const confidences = [
    silver?.overallConfidence ?? 0,
    gold?.overallConfidence ?? 0,
    sync?.overallConfidence ?? 0,
    deps?.overallConfidence ?? 0,
    parallel?.overallConfidence ?? 0,
  ].filter((c) => c > 0);

  const overallConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;

  const summary: MigrationSummary = {
    totalSteps: srcSteps.length,
    preservedBusinessLogic: businessLogicPatterns.length,
    preservedDependencies: executionGraph.filter((n) => n.dependencies.length > 0).length,
    preservedParallelism: parallel?.constructs.length ?? 0,
    preservedErrorHandling: Math.min(srcErrors.count, outErrors.count),
    preservedValidations: validationSpecs.filter((v) => v.autoEnforceable).length,
    preservedMonitoring: outMonitoring.length,
    modernizedTransforms: transformationSpecs.length,
    removedPlatformDeps: deps?.summary.autoReplaceableCount ?? 0,
    generatedCloudNative: archRecs.length,
    autoResolvableRisks: risks.filter((r) => r.autoResolvable).length,
    manualReviewRequired: risks.filter((r) => !r.autoResolvable).length,
    byPhase: phases,
    warnings: [
      ...risks.filter((r) => r.severity === "critical").map((r) => `CRITICAL: ${r.title}`),
      ...(silver?.summary.warnings ?? []),
      ...(gold?.summary.warnings ?? []),
      ...(deps?.summary.warnings ?? []),
      ...(parallel?.warnings ?? []),
    ],
  };

  return {
    silverLayer: silver,
    goldLayer: gold,
    syncAnalysis: sync,
    platformDeps: deps,
    parallelAnalysis: parallel,
    risks,
    architectureRecommendations: archRecs,
    validationSpecs,
    transformationSpecs,
    executionGraph,
    migrationSummary: summary,
    overallConfidence,
  };
}
