export type DependencyCategory =
  | "service-name"
  | "storage-reference"
  | "catalog-reference"
  | "monitoring-reference"
  | "notification-reference"
  | "dashboard-reference";

export interface PlatformDependency {
  id: string;
  category: DependencyCategory;
  original: string;
  replacement: string;
  reasoning: string;
  confidence: number;
  location: string;
  platform: "aws" | "azure";
  autoReplaceable: boolean;
}

export interface DependencyReport {
  dependencies: PlatformDependency[];
  summary: DependencyReportSummary;
  migrationPlan: MigrationPlanEntry[];
  overallConfidence: number;
}

export interface DependencyReportSummary {
  totalDependencies: number;
  byCategory: Record<DependencyCategory, number>;
  autoReplaceableCount: number;
  manualReviewCount: number;
  highConfidenceCount: number;
  warnings: string[];
}

export interface MigrationPlanEntry {
  step: number;
  action: string;
  category: DependencyCategory;
  from: string;
  to: string;
  risk: "low" | "medium" | "high";
  notes: string;
}

const CATEGORY_LABELS: Record<DependencyCategory, string> = {
  "service-name": "Service Name",
  "storage-reference": "Storage Reference",
  "catalog-reference": "Catalog Reference",
  "monitoring-reference": "Monitoring Reference",
  "notification-reference": "Notification Reference",
  "dashboard-reference": "Dashboard Reference",
};

export { CATEGORY_LABELS };

// ── Replacement maps ────────────────────────────────────────────────────────

interface ReplacementDef {
  regex: RegExp;
  category: DependencyCategory;
  awsOriginal: string;
  azureReplacement: string;
  azureOriginal: string;
  awsReplacement: string;
  reasoning: string;
  confidence: number;
  autoReplaceable: boolean;
}

const SERVICE_REPLACEMENTS: ReplacementDef[] = [
  { regex: /\barn:aws:lambda\b/gi, category: "service-name", awsOriginal: "AWS Lambda", azureReplacement: "Azure Functions", azureOriginal: "Azure Functions", awsReplacement: "AWS Lambda", reasoning: "Serverless compute — Lambda maps directly to Azure Functions with identical trigger/binding model", confidence: 0.95, autoReplaceable: true },
  { regex: /\barn:aws:states\b/gi, category: "service-name", awsOriginal: "AWS Step Functions", azureReplacement: "Azure Logic Apps", azureOriginal: "Azure Logic Apps", awsReplacement: "AWS Step Functions", reasoning: "Workflow orchestration — Step Functions state machines map to Logic Apps workflow definitions", confidence: 0.92, autoReplaceable: true },
  { regex: /\barn:aws:sqs\b/gi, category: "service-name", awsOriginal: "Amazon SQS", azureReplacement: "Azure Service Bus Queue", azureOriginal: "Azure Service Bus", awsReplacement: "Amazon SQS", reasoning: "Message queuing — SQS maps to Service Bus queues with comparable FIFO and dead-letter support", confidence: 0.93, autoReplaceable: true },
  { regex: /\barn:aws:sns\b/gi, category: "service-name", awsOriginal: "Amazon SNS", azureReplacement: "Azure Event Grid / Service Bus Topic", azureOriginal: "Azure Event Grid", awsReplacement: "Amazon SNS", reasoning: "Pub/sub messaging — SNS fan-out maps to Event Grid topics or Service Bus topics", confidence: 0.88, autoReplaceable: true },
  { regex: /\barn:aws:dynamodb\b/gi, category: "service-name", awsOriginal: "Amazon DynamoDB", azureReplacement: "Azure Cosmos DB (NoSQL API)", azureOriginal: "Azure Cosmos DB", awsReplacement: "Amazon DynamoDB", reasoning: "NoSQL database — DynamoDB maps to Cosmos DB NoSQL API with similar partition key model", confidence: 0.90, autoReplaceable: true },
  { regex: /\barn:aws:kinesis\b/gi, category: "service-name", awsOriginal: "Amazon Kinesis", azureReplacement: "Azure Event Hubs", azureOriginal: "Azure Event Hubs", awsReplacement: "Amazon Kinesis", reasoning: "Event streaming — Kinesis streams map to Event Hubs with comparable partition/consumer model", confidence: 0.91, autoReplaceable: true },
  { regex: /\barn:aws:ecs\b/gi, category: "service-name", awsOriginal: "Amazon ECS", azureReplacement: "Azure Container Apps", azureOriginal: "Azure Container Apps", awsReplacement: "Amazon ECS", reasoning: "Container orchestration — ECS tasks map to Container Apps jobs/services", confidence: 0.85, autoReplaceable: true },
  { regex: /\barn:aws:eks\b/gi, category: "service-name", awsOriginal: "Amazon EKS", azureReplacement: "Azure Kubernetes Service (AKS)", azureOriginal: "Azure Kubernetes Service", awsReplacement: "Amazon EKS", reasoning: "Managed Kubernetes — EKS clusters map directly to AKS clusters", confidence: 0.93, autoReplaceable: true },
  { regex: /\barn:aws:apigateway\b/gi, category: "service-name", awsOriginal: "Amazon API Gateway", azureReplacement: "Azure API Management", azureOriginal: "Azure API Management", awsReplacement: "Amazon API Gateway", reasoning: "API management — API Gateway routes/stages map to APIM policies/products", confidence: 0.88, autoReplaceable: true },
  { regex: /\barn:aws:secretsmanager\b/gi, category: "service-name", awsOriginal: "AWS Secrets Manager", azureReplacement: "Azure Key Vault (Secrets)", azureOriginal: "Azure Key Vault", awsReplacement: "AWS Secrets Manager", reasoning: "Secret management — Secrets Manager maps to Key Vault secrets with comparable rotation", confidence: 0.94, autoReplaceable: true },
  { regex: /\barn:aws:kms\b/gi, category: "service-name", awsOriginal: "AWS KMS", azureReplacement: "Azure Key Vault (Keys)", azureOriginal: "Azure Key Vault Keys", awsReplacement: "AWS KMS", reasoning: "Key management — KMS customer-managed keys map to Key Vault keys with HSM backing", confidence: 0.93, autoReplaceable: true },
  { regex: /\barn:aws:glue\b/gi, category: "service-name", awsOriginal: "AWS Glue", azureReplacement: "Azure Data Factory + Databricks", azureOriginal: "Azure Data Factory", awsReplacement: "AWS Glue", reasoning: "ETL service — Glue jobs map to ADF pipelines with Databricks notebook activities", confidence: 0.87, autoReplaceable: true },
  { regex: /\barn:aws:emr\b/gi, category: "service-name", awsOriginal: "Amazon EMR", azureReplacement: "Azure Databricks", azureOriginal: "Azure Databricks", awsReplacement: "Amazon EMR", reasoning: "Big data processing — EMR Spark clusters map to Databricks workspaces", confidence: 0.90, autoReplaceable: true },
  { regex: /\barn:aws:redshift\b/gi, category: "service-name", awsOriginal: "Amazon Redshift", azureReplacement: "Azure Synapse Analytics", azureOriginal: "Azure Synapse Analytics", awsReplacement: "Amazon Redshift", reasoning: "Data warehouse — Redshift clusters map to Synapse dedicated SQL pools", confidence: 0.89, autoReplaceable: true },
  { regex: /\barn:aws:rds\b/gi, category: "service-name", awsOriginal: "Amazon RDS", azureReplacement: "Azure SQL Database / Azure Database", azureOriginal: "Azure SQL Database", awsReplacement: "Amazon RDS", reasoning: "Managed relational database — RDS instances map to Azure SQL or Azure Database for MySQL/PostgreSQL", confidence: 0.88, autoReplaceable: true },
  { regex: /\barn:aws:elasticache\b/gi, category: "service-name", awsOriginal: "Amazon ElastiCache", azureReplacement: "Azure Cache for Redis", azureOriginal: "Azure Cache for Redis", awsReplacement: "Amazon ElastiCache", reasoning: "In-memory cache — ElastiCache Redis maps directly to Azure Cache for Redis", confidence: 0.94, autoReplaceable: true },
  { regex: /\barn:aws:cognito\b/gi, category: "service-name", awsOriginal: "Amazon Cognito", azureReplacement: "Microsoft Entra ID / Azure AD B2C", azureOriginal: "Microsoft Entra ID", awsReplacement: "Amazon Cognito", reasoning: "Identity/auth — Cognito user pools map to Entra ID B2C with comparable OAuth/OIDC flows", confidence: 0.85, autoReplaceable: true },
  { regex: /\barn:aws:ses\b/gi, category: "service-name", awsOriginal: "Amazon SES", azureReplacement: "Azure Communication Services (Email)", azureOriginal: "Azure Communication Services", awsReplacement: "Amazon SES", reasoning: "Email service — SES maps to Azure Communication Services Email", confidence: 0.87, autoReplaceable: true },
  { regex: /\barn:aws:bedrock\b/gi, category: "service-name", awsOriginal: "Amazon Bedrock", azureReplacement: "Azure OpenAI Service", azureOriginal: "Azure OpenAI Service", awsReplacement: "Amazon Bedrock", reasoning: "Managed AI/LLM — Bedrock model invocations map to Azure OpenAI deployments", confidence: 0.82, autoReplaceable: true },
  { regex: /\barn:aws:batch\b/gi, category: "service-name", awsOriginal: "AWS Batch", azureReplacement: "Azure Batch", azureOriginal: "Azure Batch", awsReplacement: "AWS Batch", reasoning: "Batch compute — AWS Batch jobs map directly to Azure Batch pools/tasks", confidence: 0.93, autoReplaceable: true },
];

const STORAGE_REPLACEMENTS: ReplacementDef[] = [
  { regex: /s3:\/\/[\w.-]+\/[\w./-]*/gi, category: "storage-reference", awsOriginal: "S3 bucket path (s3://)", azureReplacement: "ADLS Gen2 path (abfss://)", azureOriginal: "ADLS Gen2 path", awsReplacement: "S3 bucket path", reasoning: "Object storage — S3 bucket paths map to ADLS Gen2 container paths via abfss:// protocol", confidence: 0.94, autoReplaceable: true },
  { regex: /\barn:aws:s3:::[a-z0-9.-]+\b/gi, category: "storage-reference", awsOriginal: "S3 bucket ARN", azureReplacement: "Azure Storage Account resource ID", azureOriginal: "Azure Storage resource", awsReplacement: "S3 bucket ARN", reasoning: "Storage resource identifier — S3 ARN maps to Azure Storage resource ID", confidence: 0.92, autoReplaceable: true },
  { regex: /s3\.amazonaws\.com/gi, category: "storage-reference", awsOriginal: "S3 endpoint (s3.amazonaws.com)", azureReplacement: "blob.core.windows.net / dfs.core.windows.net", azureOriginal: "blob.core.windows.net", awsReplacement: "s3.amazonaws.com", reasoning: "Storage endpoint — S3 REST endpoint maps to Azure Blob/ADLS endpoint", confidence: 0.95, autoReplaceable: true },
  { regex: /dynamodb\.[\w-]+\.amazonaws\.com/gi, category: "storage-reference", awsOriginal: "DynamoDB endpoint", azureReplacement: "Cosmos DB endpoint (.documents.azure.com)", azureOriginal: "Cosmos DB endpoint", awsReplacement: "DynamoDB endpoint", reasoning: "NoSQL endpoint — DynamoDB regional endpoint maps to Cosmos DB account endpoint", confidence: 0.90, autoReplaceable: true },
  { regex: /\bAWS_ACCESS_KEY_ID\b|\bAWS_SECRET_ACCESS_KEY\b/gi, category: "storage-reference", awsOriginal: "AWS IAM credentials", azureReplacement: "Managed Identity (no credentials needed)", azureOriginal: "Managed Identity", awsReplacement: "IAM credentials", reasoning: "Authentication — AWS static credentials replaced by Azure Managed Identity for zero-credential access", confidence: 0.96, autoReplaceable: true },
  { regex: /\befs\.[\w-]+\.amazonaws\.com\b/gi, category: "storage-reference", awsOriginal: "Amazon EFS endpoint", azureReplacement: "Azure Files (SMB/NFS share)", azureOriginal: "Azure Files", awsReplacement: "Amazon EFS", reasoning: "File storage — EFS NFS mounts map to Azure Files NFS or SMB shares", confidence: 0.88, autoReplaceable: true },
];

const CATALOG_REPLACEMENTS: ReplacementDef[] = [
  { regex: /\bglue_catalog\b|\bGlueCatalog\b|\baws_glue_catalog/gi, category: "catalog-reference", awsOriginal: "AWS Glue Data Catalog", azureReplacement: "Unity Catalog (Databricks)", azureOriginal: "Unity Catalog", awsReplacement: "AWS Glue Data Catalog", reasoning: "Data catalog — Glue Catalog databases/tables map to Unity Catalog with 3-level namespace", confidence: 0.91, autoReplaceable: true },
  { regex: /\bGlue\.?\s*Database|\bglue_database/gi, category: "catalog-reference", awsOriginal: "Glue Database", azureReplacement: "Unity Catalog Schema", azureOriginal: "Unity Catalog Schema", awsReplacement: "Glue Database", reasoning: "Database namespace — Glue databases map to Unity Catalog schemas (catalog.schema.table)", confidence: 0.90, autoReplaceable: true },
  { regex: /\bAthena\b/gi, category: "catalog-reference", awsOriginal: "Amazon Athena", azureReplacement: "Databricks SQL / Synapse Serverless SQL", azureOriginal: "Databricks SQL", awsReplacement: "Amazon Athena", reasoning: "Serverless SQL query — Athena maps to Databricks SQL or Synapse Serverless SQL Pool", confidence: 0.88, autoReplaceable: true },
  { regex: /\bLake\s*Formation\b/gi, category: "catalog-reference", awsOriginal: "AWS Lake Formation", azureReplacement: "Microsoft Purview", azureOriginal: "Microsoft Purview", awsReplacement: "AWS Lake Formation", reasoning: "Data governance — Lake Formation permissions map to Purview access policies", confidence: 0.83, autoReplaceable: true },
  { regex: /\baws_glue_crawler\b|\bCrawler\b/gi, category: "catalog-reference", awsOriginal: "Glue Crawler", azureReplacement: "Purview Scanner / ADF Metadata", azureOriginal: "Purview Scanner", awsReplacement: "Glue Crawler", reasoning: "Schema discovery — Glue Crawlers map to Purview scanners for automatic schema detection", confidence: 0.82, autoReplaceable: true },
  { regex: /iceberg|format\s*=\s*["']?iceberg/gi, category: "catalog-reference", awsOriginal: "Apache Iceberg table format", azureReplacement: "Delta Lake table format", azureOriginal: "Delta Lake", awsReplacement: "Apache Iceberg", reasoning: "Table format — Iceberg tables map to Delta Lake for ACID, time travel, and schema evolution on ADLS", confidence: 0.90, autoReplaceable: true },
];

const MONITORING_REPLACEMENTS: ReplacementDef[] = [
  { regex: /\bCloudWatch\b/gi, category: "monitoring-reference", awsOriginal: "Amazon CloudWatch", azureReplacement: "Azure Monitor / Log Analytics", azureOriginal: "Azure Monitor", awsReplacement: "Amazon CloudWatch", reasoning: "Monitoring platform — CloudWatch metrics/logs/alarms map to Azure Monitor metrics, Log Analytics, and alerts", confidence: 0.93, autoReplaceable: true },
  { regex: /\bCloudWatch\s*Logs\b/gi, category: "monitoring-reference", awsOriginal: "CloudWatch Logs", azureReplacement: "Azure Log Analytics Workspace", azureOriginal: "Log Analytics Workspace", awsReplacement: "CloudWatch Logs", reasoning: "Log aggregation — CloudWatch log groups map to Log Analytics workspace tables", confidence: 0.94, autoReplaceable: true },
  { regex: /\bX-Ray\b|\bXRay\b/gi, category: "monitoring-reference", awsOriginal: "AWS X-Ray", azureReplacement: "Azure Application Insights", azureOriginal: "Application Insights", awsReplacement: "AWS X-Ray", reasoning: "Distributed tracing — X-Ray traces/segments map to Application Insights dependency tracking", confidence: 0.91, autoReplaceable: true },
  { regex: /\bCloudTrail\b/gi, category: "monitoring-reference", awsOriginal: "AWS CloudTrail", azureReplacement: "Azure Activity Log / Diagnostic Settings", azureOriginal: "Azure Activity Log", awsReplacement: "AWS CloudTrail", reasoning: "Audit trail — CloudTrail API audit events map to Azure Activity Log and Diagnostic Settings", confidence: 0.90, autoReplaceable: true },
  { regex: /\bGuardDuty\b/gi, category: "monitoring-reference", awsOriginal: "Amazon GuardDuty", azureReplacement: "Microsoft Defender for Cloud", azureOriginal: "Microsoft Defender", awsReplacement: "Amazon GuardDuty", reasoning: "Threat detection — GuardDuty findings map to Defender for Cloud security alerts", confidence: 0.87, autoReplaceable: true },
  { regex: /\bConfig\s*Rule|\bAWS\s*Config\b/gi, category: "monitoring-reference", awsOriginal: "AWS Config", azureReplacement: "Azure Policy", azureOriginal: "Azure Policy", awsReplacement: "AWS Config", reasoning: "Compliance monitoring — AWS Config rules map to Azure Policy definitions and assignments", confidence: 0.89, autoReplaceable: true },
  { regex: /\bEventBridge\b/gi, category: "monitoring-reference", awsOriginal: "Amazon EventBridge", azureReplacement: "Azure Event Grid", azureOriginal: "Azure Event Grid", awsReplacement: "Amazon EventBridge", reasoning: "Event bus — EventBridge rules/targets map to Event Grid subscriptions/handlers", confidence: 0.91, autoReplaceable: true },
];

const NOTIFICATION_REPLACEMENTS: ReplacementDef[] = [
  { regex: /\bSNS\s*(?:Topic|Subscription|Publish)\b/gi, category: "notification-reference", awsOriginal: "SNS Topic/Subscription", azureReplacement: "Service Bus Topic/Subscription", azureOriginal: "Service Bus Topic", awsReplacement: "SNS Topic", reasoning: "Pub/sub notification — SNS topics map to Service Bus topics with filter subscriptions", confidence: 0.91, autoReplaceable: true },
  { regex: /\bSES\s*(?:Send|Email|Template)\b/gi, category: "notification-reference", awsOriginal: "SES Email Notification", azureReplacement: "Azure Communication Services Email", azureOriginal: "Azure Communication Services", awsReplacement: "SES Email", reasoning: "Email notification — SES send calls map to Communication Services Email API", confidence: 0.87, autoReplaceable: true },
  { regex: /\bPinpoint\b/gi, category: "notification-reference", awsOriginal: "Amazon Pinpoint", azureReplacement: "Azure Notification Hubs", azureOriginal: "Azure Notification Hubs", awsReplacement: "Amazon Pinpoint", reasoning: "Push notifications — Pinpoint campaigns map to Notification Hubs push channels", confidence: 0.82, autoReplaceable: true },
  { regex: /\bSQS\s*(?:Queue|Send|Receive|Message)\b/gi, category: "notification-reference", awsOriginal: "SQS Queue Message", azureReplacement: "Service Bus Queue Message", azureOriginal: "Service Bus Queue", awsReplacement: "SQS Queue", reasoning: "Queue-based notification — SQS messages map to Service Bus queue messages with sessions", confidence: 0.93, autoReplaceable: true },
  { regex: /\bchime|connect\s+contact/gi, category: "notification-reference", awsOriginal: "Amazon Chime/Connect", azureReplacement: "Azure Communication Services", azureOriginal: "Azure Communication Services", awsReplacement: "Amazon Chime/Connect", reasoning: "Communication services — Chime/Connect map to Azure Communication Services", confidence: 0.78, autoReplaceable: false },
];

const DASHBOARD_REPLACEMENTS: ReplacementDef[] = [
  { regex: /\bQuickSight\b/gi, category: "dashboard-reference", awsOriginal: "Amazon QuickSight", azureReplacement: "Microsoft Power BI", azureOriginal: "Power BI", awsReplacement: "Amazon QuickSight", reasoning: "BI/Dashboards — QuickSight datasets/dashboards map to Power BI datasets/reports", confidence: 0.92, autoReplaceable: true },
  { regex: /\bquicksight\.[\w-]+\.amazonaws\.com/gi, category: "dashboard-reference", awsOriginal: "QuickSight endpoint", azureReplacement: "Power BI API endpoint (api.powerbi.com)", azureOriginal: "Power BI API", awsReplacement: "QuickSight endpoint", reasoning: "Dashboard API — QuickSight API endpoint maps to Power BI REST API", confidence: 0.90, autoReplaceable: true },
  { regex: /\bGrafana\b/gi, category: "dashboard-reference", awsOriginal: "Amazon Managed Grafana", azureReplacement: "Azure Managed Grafana", azureOriginal: "Azure Managed Grafana", awsReplacement: "Amazon Managed Grafana", reasoning: "Grafana dashboards — direct 1:1 mapping between managed Grafana services", confidence: 0.96, autoReplaceable: true },
  { regex: /\bOpenSearch\s*Dashboard/gi, category: "dashboard-reference", awsOriginal: "OpenSearch Dashboards", azureReplacement: "Azure Monitor Workbooks / Kibana on Elastic Cloud", azureOriginal: "Azure Monitor Workbooks", awsReplacement: "OpenSearch Dashboards", reasoning: "Search analytics dashboards — OpenSearch dashboards map to Monitor Workbooks or managed Elastic", confidence: 0.80, autoReplaceable: false },
  { regex: /\bSPICE\b/gi, category: "dashboard-reference", awsOriginal: "QuickSight SPICE dataset", azureReplacement: "Power BI Import Mode dataset", azureOriginal: "Power BI Import Mode", awsReplacement: "QuickSight SPICE", reasoning: "In-memory dataset — SPICE caching maps to Power BI Import Mode with scheduled refresh", confidence: 0.88, autoReplaceable: true },
];

const ALL_REPLACEMENTS: ReplacementDef[] = [
  ...SERVICE_REPLACEMENTS,
  ...STORAGE_REPLACEMENTS,
  ...CATALOG_REPLACEMENTS,
  ...MONITORING_REPLACEMENTS,
  ...NOTIFICATION_REPLACEMENTS,
  ...DASHBOARD_REPLACEMENTS,
];

// ── Main analysis ───────────────────────────────────────────────────────────

export function analyzePlatformDependencies(
  sourceCode: string,
  outputCode: string,
  direction: "aws-to-azure" | "azure-to-aws"
): DependencyReport {
  const isToAzure = direction === "aws-to-azure";
  const dependencies = extractDependencies(sourceCode, outputCode, isToAzure);
  const migrationPlan = buildMigrationPlan(dependencies);
  const overallConfidence = computeOverallConfidence(dependencies);

  const byCategory: Record<DependencyCategory, number> = {
    "service-name": 0, "storage-reference": 0, "catalog-reference": 0,
    "monitoring-reference": 0, "notification-reference": 0, "dashboard-reference": 0,
  };
  for (const d of dependencies) byCategory[d.category]++;

  const warnings: string[] = [];
  if (dependencies.filter((d) => !d.autoReplaceable).length > 0)
    warnings.push(`${dependencies.filter((d) => !d.autoReplaceable).length} dependencies require manual review — auto-replacement not possible`);
  if (dependencies.filter((d) => d.confidence < 0.8).length > 0)
    warnings.push(`${dependencies.filter((d) => d.confidence < 0.8).length} replacements have < 80% confidence — verify correctness`);
  if (byCategory["monitoring-reference"] === 0 && dependencies.length > 5)
    warnings.push("No monitoring references detected — verify observability stack is migrated");
  if (byCategory["notification-reference"] === 0 && dependencies.length > 5)
    warnings.push("No notification references found — verify alerting/messaging channels are migrated");

  const leftInOutput = scanForResidualDeps(outputCode, isToAzure);
  if (leftInOutput.length > 0)
    warnings.push(`${leftInOutput.length} source-platform references still present in output — not fully migrated: ${leftInOutput.slice(0, 3).join(", ")}`);

  return {
    dependencies,
    migrationPlan,
    overallConfidence,
    summary: {
      totalDependencies: dependencies.length,
      byCategory,
      autoReplaceableCount: dependencies.filter((d) => d.autoReplaceable).length,
      manualReviewCount: dependencies.filter((d) => !d.autoReplaceable).length,
      highConfidenceCount: dependencies.filter((d) => d.confidence >= 0.9).length,
      warnings,
    },
  };
}

function extractDependencies(
  source: string,
  output: string,
  isToAzure: boolean
): PlatformDependency[] {
  const deps: PlatformDependency[] = [];
  const seen = new Set<string>();

  for (const rep of ALL_REPLACEMENTS) {
    let match: RegExpExecArray | null;
    const re = new RegExp(rep.regex.source, rep.regex.flags);

    // Scan source
    while ((match = re.exec(source)) !== null) {
      const key = `src:${rep.category}:${match[0].slice(0, 50)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      deps.push({
        id: `dep-${deps.length + 1}`,
        category: rep.category,
        original: isToAzure ? rep.awsOriginal : rep.azureOriginal,
        replacement: isToAzure ? rep.azureReplacement : rep.awsReplacement,
        reasoning: rep.reasoning,
        confidence: rep.confidence,
        location: `source (${match[0].slice(0, 60)})`,
        platform: isToAzure ? "aws" : "azure",
        autoReplaceable: rep.autoReplaceable,
      });
    }

    // Scan output for residual source-platform refs
    const reOut = new RegExp(rep.regex.source, rep.regex.flags);
    while ((match = reOut.exec(output)) !== null) {
      const key = `out:${rep.category}:${match[0].slice(0, 50)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      deps.push({
        id: `dep-${deps.length + 1}`,
        category: rep.category,
        original: isToAzure ? rep.awsOriginal : rep.azureOriginal,
        replacement: isToAzure ? rep.azureReplacement : rep.awsReplacement,
        reasoning: `RESIDUAL in output: ${rep.reasoning}`,
        confidence: rep.confidence * 0.9,
        location: `output (${match[0].slice(0, 60)}) — NOT YET REPLACED`,
        platform: isToAzure ? "aws" : "azure",
        autoReplaceable: rep.autoReplaceable,
      });
    }
  }

  return deps.sort((a, b) => b.confidence - a.confidence);
}

function scanForResidualDeps(output: string, isToAzure: boolean): string[] {
  const residuals: string[] = [];
  if (isToAzure) {
    if (/arn:aws:/i.test(output)) residuals.push("ARN references");
    if (/\.amazonaws\.com/i.test(output)) residuals.push("AWS endpoint URLs");
    if (/AWS_ACCESS_KEY|AWS_SECRET/i.test(output)) residuals.push("AWS credentials");
    if (/s3:\/\//i.test(output)) residuals.push("S3 paths");
    if (/\bglue_catalog\b/i.test(output)) residuals.push("Glue Catalog refs");
  } else {
    if (/\.azure\.com|\.windows\.net/i.test(output)) residuals.push("Azure endpoint URLs");
    if (/\/subscriptions\//i.test(output)) residuals.push("Azure resource IDs");
    if (/abfss?:\/\//i.test(output)) residuals.push("ADLS paths");
    if (/unity_catalog/i.test(output)) residuals.push("Unity Catalog refs");
  }
  return residuals;
}

function buildMigrationPlan(deps: PlatformDependency[]): MigrationPlanEntry[] {
  const plan: MigrationPlanEntry[] = [];
  const catOrder: DependencyCategory[] = [
    "storage-reference", "catalog-reference", "service-name",
    "monitoring-reference", "notification-reference", "dashboard-reference",
  ];

  let step = 1;
  for (const cat of catOrder) {
    const catDeps = deps.filter((d) => d.category === cat);
    const dedupMap = new Map<string, PlatformDependency>();
    for (const d of catDeps) {
      const key = `${d.original}→${d.replacement}`;
      if (!dedupMap.has(key)) dedupMap.set(key, d);
    }

    for (const [, d] of dedupMap) {
      plan.push({
        step: step++,
        action: `Replace ${d.original} with ${d.replacement}`,
        category: d.category,
        from: d.original,
        to: d.replacement,
        risk: d.confidence >= 0.9 ? "low" : d.confidence >= 0.8 ? "medium" : "high",
        notes: d.reasoning,
      });
    }
  }

  return plan;
}

function computeOverallConfidence(deps: PlatformDependency[]): number {
  if (deps.length === 0) return 0.5;
  const avg = deps.reduce((s, d) => s + d.confidence, 0) / deps.length;
  const autoRatio = deps.filter((d) => d.autoReplaceable).length / deps.length;
  const catCoverage = new Set(deps.map((d) => d.category)).size / 6;
  const residualPenalty = deps.some((d) => d.location.includes("NOT YET REPLACED")) ? -0.1 : 0;

  const raw = avg * 0.4 + autoRatio * 0.25 + catCoverage * 0.15 + 0.15 + residualPenalty;
  return Math.round(Math.min(Math.max(raw, 0.1), 0.97) * 100) / 100;
}
