/**
 * service-registry.ts
 *
 * Comprehensive AWS → Azure service mapping registry covering all 30 production suggestions.
 * Used by the post-processor, prompt builder, and migration log.
 */

export interface ServiceMapping {
  awsPattern: string | RegExp;
  azureEquivalent: string;
  azureResourceType: string;
  notes: string;
  requiresManualWork: boolean;
  group: string;
}

// ─── Group 1: Orchestration ───────────────────────────────────────────────────
export const ORCHESTRATION_MAPPINGS: ServiceMapping[] = [
  {
    awsPattern: /aws-durable-functions|DurableOrchestrator/i,
    azureEquivalent: "Azure Durable Functions",
    azureResourceType: "Microsoft.Web/sites (Durable Functions)",
    notes: "Generate Function App with Durable extension bundle + Storage for checkpointing + App Insights",
    requiresManualWork: false,
    group: "Orchestration",
  },
  {
    awsPattern: /SnapStart|ManagedInstance/i,
    azureEquivalent: "Azure Functions Premium Plan",
    azureResourceType: "Microsoft.Web/serverfarms (EP1/EP2/EP3)",
    notes: "Managed Instances → Premium plan for dedicated steady-state compute",
    requiresManualWork: false,
    group: "Orchestration",
  },
  {
    awsPattern: /ecs:runTask\.sync/i,
    azureEquivalent: "Azure Container Apps Job",
    azureResourceType: "Microsoft.App/jobs",
    notes: "HTTP trigger + polling Until loop for sync behaviour",
    requiresManualWork: false,
    group: "Orchestration",
  },
  {
    awsPattern: /batch:submitJob\.sync/i,
    azureEquivalent: "Azure Batch Job",
    azureResourceType: "Microsoft.Batch/batchAccounts/pools/jobs",
    notes: "HTTP POST to Batch REST API + polling Until loop",
    requiresManualWork: false,
    group: "Orchestration",
  },
  {
    awsPattern: /sagemaker:createTrainingJob\.sync/i,
    azureEquivalent: "Azure Machine Learning Training Run",
    azureResourceType: "Microsoft.MachineLearningServices/workspaces/jobs",
    notes: "HTTP POST to AML REST API + polling Until loop every 60s",
    requiresManualWork: true,
    group: "Orchestration",
  },
  {
    awsPattern: /states:startExecution\.sync/i,
    azureEquivalent: "Nested Azure Logic App Workflow",
    azureResourceType: "Microsoft.Logic/workflows",
    notes: "HTTP trigger on nested Logic App + poll for completion",
    requiresManualWork: false,
    group: "Orchestration",
  },
  {
    awsPattern: /bedrock:invokeModel/i,
    azureEquivalent: "Azure OpenAI Service",
    azureResourceType: "Microsoft.CognitiveServices/accounts (OpenAI)",
    notes: "Replace Lambda-wrapped Bedrock call with Azure Function using Azure OpenAI SDK",
    requiresManualWork: false,
    group: "Orchestration",
  },
  {
    awsPattern: /bedrock-agent-runtime:invokeAgent/i,
    azureEquivalent: "Azure AI Foundry Agent Service",
    azureResourceType: "Microsoft.MachineLearningServices/workspaces (Foundry)",
    notes: "Bedrock action groups → Foundry tool registry; knowledge base → AI Search index",
    requiresManualWork: true,
    group: "Orchestration",
  },
  {
    awsPattern: /AWS::SWF::Domain|SimplWorkflow/i,
    azureEquivalent: "Azure Durable Functions (Entity Functions)",
    azureResourceType: "Microsoft.Web/sites (Durable Functions)",
    notes: "SWF requires code-level reimplementation — generate scaffolding with placeholder activities",
    requiresManualWork: true,
    group: "Orchestration",
  },
];

// ─── Group 2: Data layer ──────────────────────────────────────────────────────
export const DATA_MAPPINGS: ServiceMapping[] = [
  {
    awsPattern: /DynamoDB.*stream|EventSourceMapping.*dynamodb/i,
    azureEquivalent: "Azure Cosmos DB Change Feed",
    azureResourceType: "Microsoft.DocumentDB/databaseAccounts",
    notes: "Enable change feed on Cosmos DB container; Azure Function with Cosmos DB trigger binding",
    requiresManualWork: false,
    group: "Data",
  },
  {
    awsPattern: /S3.*NotificationConfiguration|s3:ObjectCreated/i,
    azureEquivalent: "Azure Blob Storage + Event Grid",
    azureResourceType: "Microsoft.Storage/storageAccounts + Microsoft.EventGrid/systemTopics",
    notes: "Storage Account + Event Grid system topic + event subscription → Azure Function",
    requiresManualWork: false,
    group: "Data",
  },
  {
    awsPattern: /EventSourceMapping.*kinesis|KinesisStream/i,
    azureEquivalent: "Azure Event Hubs",
    azureResourceType: "Microsoft.EventHub/namespaces/eventhubs",
    notes: "Preserve BatchSize → MaxBatchSize; StartingPosition → InitialOffsetDateTime",
    requiresManualWork: false,
    group: "Data",
  },
  {
    awsPattern: /Microsoft\.Fabric|OneLake|FabricWorkspace/i,
    azureEquivalent: "Microsoft Fabric",
    azureResourceType: "Microsoft.Fabric/capacities",
    notes: "ADF → Fabric Data Factory; Synapse SQL → Fabric Warehouse; ADLS → OneLake abfss://",
    requiresManualWork: true,
    group: "Data",
  },
];

// ─── Group 3: Networking ──────────────────────────────────────────────────────
export const NETWORKING_MAPPINGS: ServiceMapping[] = [
  {
    awsPattern: /AWS::EC2::VPC|CidrBlock/i,
    azureEquivalent: "Azure Virtual Network",
    azureResourceType: "Microsoft.Network/virtualNetworks",
    notes: "VPC CIDR → VNet address space; Subnets → Azure subnets; SecurityGroups → NSGs; VPCEndpoint Interface → Private Endpoint; VPCEndpoint Gateway → Service Endpoint",
    requiresManualWork: true,
    group: "Networking",
  },
  {
    awsPattern: /AWS::ApiGateway::RestApi|AWS::ApiGatewayV2::Api/i,
    azureEquivalent: "Azure API Management",
    azureResourceType: "Microsoft.ApiManagement/service",
    notes: "Stage → APIM API version; Method → APIM operation; Lambda authoriser → validate-jwt policy; WAF → Azure WAF policy. NOTE: APIM takes 30+ min to provision.",
    requiresManualWork: true,
    group: "Networking",
  },
  {
    awsPattern: /AWS::CloudFront::Distribution/i,
    azureEquivalent: "Azure Front Door Standard/Premium",
    azureResourceType: "Microsoft.Cdn/profiles",
    notes: "Origins → origin groups; Cache behaviours → routing rules; Lambda@Edge → Rules Engine; WAF WebACL → WAF policy; Custom domains require DNS CNAME update",
    requiresManualWork: true,
    group: "Networking",
  },
  {
    awsPattern: /AWS::DirectConnect::Connection/i,
    azureEquivalent: "Azure ExpressRoute",
    azureResourceType: "Microsoft.Network/expressRouteCircuits",
    notes: "REQUIRES_PROVIDER_COORDINATION — physical circuit must be ordered from provider separately",
    requiresManualWork: true,
    group: "Networking",
  },
];

// ─── Group 4: Security ────────────────────────────────────────────────────────
export const SECURITY_MAPPINGS: ServiceMapping[] = [
  {
    awsPattern: /AWS::KMS::Key|kms:key\/|arn:aws:kms/i,
    azureEquivalent: "Azure Key Vault Key",
    azureResourceType: "Microsoft.KeyVault/vaults/keys",
    notes: "RSA-2048 KMS → RSA 2048 Key Vault key; AES-256 → Key Vault secret. Grant managed identity Get/WrapKey/UnwrapKey permissions.",
    requiresManualWork: false,
    group: "Security",
  },
  {
    awsPattern: /AWS::Cognito::UserPool|AWS::Cognito::UserPoolClient/i,
    azureEquivalent: "Microsoft Entra ID B2C",
    azureResourceType: "Microsoft.AzureActiveDirectory/b2cDirectories",
    notes: "Password policies, MFA, OAuth scopes translate. NOTE: existing user passwords cannot be migrated — users must reset on first Azure login.",
    requiresManualWork: true,
    group: "Security",
  },
  {
    awsPattern: /AWS::WAFv2::WebACL|AWSManagedRules/i,
    azureEquivalent: "Azure WAF Policy",
    azureResourceType: "Microsoft.Network/FrontDoorWebApplicationFirewallPolicies",
    notes: "AWSManagedRulesCommonRuleSet → OWASP 3.2; AWSManagedRulesBotControlRuleSet → Bot Manager; Rate-based rules → rate limit rules",
    requiresManualWork: false,
    group: "Security",
  },
  {
    awsPattern: /AWS::GuardDuty::Detector/i,
    azureEquivalent: "Microsoft Defender for Cloud + Microsoft Sentinel",
    azureResourceType: "Microsoft.Security/pricings + Microsoft.OperationalInsights/workspaces",
    notes: "Enable Defender plans per resource type present (Servers/Containers/Storage/Databases/AppService). Add Sentinel with Activity + Defender connectors.",
    requiresManualWork: false,
    group: "Security",
  },
];

// ─── Group 5: Observability ───────────────────────────────────────────────────
export const OBSERVABILITY_MAPPINGS: ServiceMapping[] = [
  {
    awsPattern: /TracingConfig.*Active|TracingEnabled|aws:xray/i,
    azureEquivalent: "Application Insights Distributed Tracing",
    azureResourceType: "Microsoft.Insights/components",
    notes: "Add APPLICATIONINSIGHTS_CONNECTION_STRING to Function App settings; APIM → App Insights logger + API diagnostic at 100% sampling",
    requiresManualWork: false,
    group: "Observability",
  },
  {
    awsPattern: /AWS::CloudWatch::Alarm/i,
    azureEquivalent: "Azure Monitor Metric Alert Rule",
    azureResourceType: "Microsoft.Insights/metricAlerts",
    notes: "Namespace+MetricName → Azure metric; Threshold → direct; Period+EvaluationPeriods → window size; AlarmActions SNS → Azure Monitor action group with Service Bus",
    requiresManualWork: false,
    group: "Observability",
  },
  {
    awsPattern: /AWS::CloudTrail::Trail/i,
    azureEquivalent: "Azure Monitor Diagnostic Settings + Microsoft Sentinel",
    azureResourceType: "Microsoft.Insights/diagnosticSettings",
    notes: "S3 destination → Storage Account archive; CloudWatch Logs → Log Analytics workspace; CloudTrail Insights → Monitor log alert rule",
    requiresManualWork: false,
    group: "Observability",
  },
];

// ─── Group 6: AI / Agentic ────────────────────────────────────────────────────
export const BEDROCK_MODEL_MAP: Record<string, string> = {
  "amazon.titan-text":               "gpt-35-turbo",
  "amazon.nova-pro":                 "gpt-4o",
  "amazon.nova-premier":             "gpt-4o",
  "anthropic.claude-3-5-sonnet":     "claude-sonnet-4-5",
  "anthropic.claude-3":              "claude-3-opus",
  "meta.llama3":                     "Meta-Llama-3",
  "mistral":                         "Mistral-Large",
  "amazon.titan-embed":              "text-embedding-ada-002",
};

export const AI_MAPPINGS: ServiceMapping[] = [
  {
    awsPattern: /bedrock:invokeModel|bedrock:invoke/i,
    azureEquivalent: "Azure OpenAI Service / Microsoft Foundry",
    azureResourceType: "Microsoft.CognitiveServices/accounts",
    notes: "Model ID translation: titan-text→gpt-35-turbo, nova-pro→gpt-4o, claude-3-5-sonnet→claude-sonnet-4-5. Store API key in Key Vault.",
    requiresManualWork: false,
    group: "AI",
  },
  {
    awsPattern: /bedrock-agent-runtime:invokeAgent/i,
    azureEquivalent: "Azure AI Foundry Agent Service",
    azureResourceType: "Microsoft.MachineLearningServices/workspaces",
    notes: "Action groups → Foundry tool registry; knowledge base → AI Search index. System prompt must be manually ported.",
    requiresManualWork: true,
    group: "AI",
  },
  {
    awsPattern: /sagemaker:createTrainingJob/i,
    azureEquivalent: "Azure Machine Learning Training Job",
    azureResourceType: "Microsoft.MachineLearningServices/workspaces/jobs",
    notes: "AML workspace + compute cluster + training job submission. Training script must be manually ported from SageMaker container format.",
    requiresManualWork: true,
    group: "AI",
  },
];

// ─── Group 7: DevOps ──────────────────────────────────────────────────────────
export const DEVOPS_MAPPINGS: ServiceMapping[] = [
  {
    awsPattern: /AWS::CodePipeline::Pipeline/i,
    azureEquivalent: "Azure DevOps Pipeline",
    azureResourceType: "Azure DevOps YAML pipeline definition",
    notes: "Stage → Azure DevOps stage; CodeBuild → build task; CodeDeploy → deployment task; S3 artifacts → Azure Artifacts feed",
    requiresManualWork: true,
    group: "DevOps",
  },
  {
    awsPattern: /CloudFormation|cfn-template/i,
    azureEquivalent: "Azure Bicep / ARM Template",
    azureResourceType: "Microsoft.Resources/deployments",
    notes: "Generate modular Bicep: main.bicep + modules (networking/compute/data/security/observability)",
    requiresManualWork: false,
    group: "DevOps",
  },
];

// ─── Combined registry ────────────────────────────────────────────────────────
export const ALL_SERVICE_MAPPINGS: ServiceMapping[] = [
  ...ORCHESTRATION_MAPPINGS,
  ...DATA_MAPPINGS,
  ...NETWORKING_MAPPINGS,
  ...SECURITY_MAPPINGS,
  ...OBSERVABILITY_MAPPINGS,
  ...AI_MAPPINGS,
  ...DEVOPS_MAPPINGS,
];

/** Detect which mappings apply to a given source string */
export function detectApplicableMappings(sourceStr: string): ServiceMapping[] {
  return ALL_SERVICE_MAPPINGS.filter((m) => {
    const pattern = typeof m.awsPattern === "string"
      ? new RegExp(m.awsPattern, "i")
      : m.awsPattern;
    return pattern.test(sourceStr);
  });
}

/** 30-point production assessment shown in migration log */
export const PRODUCTION_ASSESSMENT_30: string[] = [
  // Group 1 — Orchestration
  "1.  [Orchestration] Add Lambda Durable Functions detection → Azure Durable Functions with storage checkpointing and App Insights.",
  "2.  [Orchestration] Add Lambda Managed Instances detection → Azure Functions Premium plan for dedicated compute.",
  "3.  [Orchestration] Add all Step Functions native integrations: ecs:runTask.sync, batch:submitJob.sync, sagemaker:createTrainingJob.sync, states:startExecution.sync, bedrock:invokeModel, bedrock:invokeAgent.",
  "4.  [Orchestration] Add MWAA Airflow DAG parser: PythonOperator→Function, BashOperator→ContainerApps, SqlOperator→Azure SQL, EmailOperator→Azure Communication Services.",
  "5.  [Orchestration] Add SWF legacy workflow detection → Azure Durable Functions entity scaffolding with placeholder activities.",
  // Group 2 — Data
  "6.  [Data] Add DynamoDB stream trigger → Cosmos DB change feed + Azure Function Cosmos DB trigger binding.",
  "7.  [Data] Add S3 event notification trigger → Azure Blob Storage + Event Grid system topic + event subscription.",
  "8.  [Data] Add Kinesis stream trigger → Azure Event Hubs namespace + Function Event Hubs trigger binding.",
  "9.  [Data] Add Microsoft Fabric target option: ADF→Fabric Data Factory, Synapse→Fabric Warehouse, ADLS→OneLake abfss://.",
  // Group 3 — Networking
  "10. [Networking] Add VPC→VNet translation: CIDRs, subnets, NSGs, Private Endpoints, Service Endpoints. Mark VERIFY_CIDR_NO_OVERLAP.",
  "11. [Networking] Add API Gateway→Azure APIM: stages→versions, methods→operations, Lambda auth→validate-jwt, WAF→WAF policy. NOTE: 30+ min to provision.",
  "12. [Networking] Add CloudFront→Azure Front Door: origins→origin groups, cache behaviours→routing rules, Lambda@Edge→Rules Engine, WAF→WAF policy.",
  "13. [Networking] Add DirectConnect→ExpressRoute: generate circuit resource + REQUIRES_PROVIDER_COORDINATION note.",
  // Group 4 — Security
  "14. [Security] Add KMS→Key Vault key: RSA-2048→RSA Key Vault key, AES-256→Key Vault secret. Grant managed identity encryption permissions.",
  "15. [Security] Add Cognito→Entra B2C: password policies, MFA, OAuth scopes. NOTE: passwords cannot be migrated — users must reset.",
  "16. [Security] Add WAFv2 WebACL→Azure WAF policy: AWSManagedRulesCommonRuleSet→OWASP 3.2, BotControl→Bot Manager, rate-based→rate limit rules.",
  "17. [Security] Add GuardDuty→Defender for Cloud + Sentinel: enable Defender plans per resource type + Activity/Defender connectors.",
  // Group 5 — Observability
  "18. [Observability] Add X-Ray TracingConfig→Application Insights: APPLICATIONINSIGHTS_CONNECTION_STRING, APIM logger + diagnostic at 100% sampling.",
  "19. [Observability] Add CloudWatch Alarms→Azure Monitor metric alert rules: translate namespace/metric/threshold/period. SNS actions→action groups.",
  "20. [Observability] Add CloudTrail→Azure Monitor diagnostic settings + Sentinel: S3→Storage archive, CloudWatch Logs→Log Analytics workspace.",
  // Group 6 — AI/Agentic
  "21. [AI] Add Bedrock invokeModel→Azure OpenAI: titan-text→gpt-35-turbo, nova-pro→gpt-4o, claude-3-5-sonnet→claude-sonnet-4-5. Store key in Key Vault.",
  "22. [AI] Add Bedrock Agents→Azure AI Foundry Agent: action groups→tool registry, knowledge base→AI Search index. System prompt requires manual port.",
  "23. [AI] Add SageMaker createTrainingJob→Azure ML: workspace + compute cluster + training job + polling loop. Script requires manual port.",
  // Group 7 — DevOps
  "24. [DevOps] Add CodePipeline→Azure DevOps YAML pipeline: stages, CodeBuild tasks, CodeDeploy deployments, S3 artifacts→Azure Artifacts.",
  "25. [DevOps] Add CloudFormation→Bicep output: modular structure (networking/compute/data/security/observability modules), existing keyword for imports.",
  // Group 8 — System-level
  "26. [System] Add multi-region awareness: paired regions, Traffic Manager replacing Route 53, Site Recovery for compute failover.",
  "27. [System] Add cost estimation: query Azure Retail Prices API + AWS Pricing API for side-by-side monthly cost comparison before deployment.",
  "28. [System] Add ARM template validation: run ARM TTK or what-if API before output. Flag VALIDATION_ERROR on failing resources.",
  "29. [System] Add deployment dependency ordering: explicit dependsOn for all resource references in ARM/Bicep to prevent parallel deployment failures.",
  "30. [System] Add rollback plan generation: per-resource rollback action, Azure CLI command, and estimated rollback time as structured document.",
];
