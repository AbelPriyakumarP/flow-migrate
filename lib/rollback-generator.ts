/**
 * rollback-generator.ts
 *
 * Suggestion 30: Generate a structured rollback plan for every migration.
 * Each Azure resource gets a rollback action, CLI command, and estimated time.
 */

export interface RollbackEntry {
  resourceName: string;
  resourceType: string;
  deploymentOrder: number;
  stateful: boolean;
  rollbackAction: string;
  azureCliCommand: string;
  estimatedMinutes: number;
  notes: string;
}

export interface RollbackPlan {
  generatedAt: string;
  totalResources: number;
  estimatedTotalRollbackMinutes: number;
  criticalWarnings: string[];
  entries: RollbackEntry[];
}

// Resource type metadata
const RESOURCE_ROLLBACK_META: Record<string, {
  stateful: boolean;
  action: string;
  cliTemplate: string;
  minutes: number;
  notes: string;
}> = {
  // Stateless — safe to delete
  "Microsoft.Logic/workflows": {
    stateful: false,
    action: "Delete Logic App — re-point traffic to AWS Step Functions",
    cliTemplate: "az logic workflow delete --resource-group {rg} --name {name} --yes",
    minutes: 2,
    notes: "No data loss. Ensure AWS Step Functions is still active before deleting.",
  },
  "Microsoft.Web/sites": {
    stateful: false,
    action: "Delete Function App — restore Lambda invocations",
    cliTemplate: "az functionapp delete --resource-group {rg} --name {name}",
    minutes: 3,
    notes: "Stateless. Remove DNS/API GW bindings first.",
  },
  "Microsoft.ApiManagement/service": {
    stateful: false,
    action: "Delete APIM instance — restore API Gateway configuration",
    cliTemplate: "az apim delete --resource-group {rg} --name {name} --yes",
    minutes: 45,
    notes: "WARNING: APIM deletion takes 30-45 minutes. Soft-delete enabled by default.",
  },
  // Stateful — retain and re-point
  "Microsoft.DocumentDB/databaseAccounts": {
    stateful: true,
    action: "RETAIN CosmosDB — re-point application to DynamoDB. Do NOT delete.",
    cliTemplate: "# Do not delete. Update connection strings to point back to DynamoDB endpoint.",
    minutes: 10,
    notes: "Data may have been written. Coordinate with data team before any deletion.",
  },
  "Microsoft.Storage/storageAccounts": {
    stateful: true,
    action: "RETAIN Storage Account — re-point application to S3. Do NOT delete.",
    cliTemplate: "# Do not delete. Update app settings to use S3 bucket endpoints.",
    minutes: 5,
    notes: "Contains uploaded data. Retain until data reconciliation is complete.",
  },
  "Microsoft.Sql/servers": {
    stateful: true,
    action: "RETAIN Azure SQL — re-point application to RDS. Do NOT delete.",
    cliTemplate: "# Do not delete. Update connection strings to RDS endpoint.",
    minutes: 10,
    notes: "Contains migrated data. Coordinate with DBA team.",
  },
  // Network — requires team coordination
  "Microsoft.Network/virtualNetworks": {
    stateful: false,
    action: "Delete VNet — coordinate with network team first",
    cliTemplate: "az network vnet delete --resource-group {rg} --name {name}",
    minutes: 15,
    notes: "REQUIRES network team coordination. Ensure no resources depend on this VNet.",
  },
  "Microsoft.Network/expressRouteCircuits": {
    stateful: false,
    action: "Cancel ExpressRoute circuit — contact provider",
    cliTemplate: "az network express-route delete --resource-group {rg} --name {name}",
    minutes: 1440,
    notes: "REQUIRES_PROVIDER_COORDINATION. Physical circuit cancellation may take days.",
  },
  // Security — careful deletion
  "Microsoft.KeyVault/vaults": {
    stateful: true,
    action: "RETAIN Key Vault with soft-delete — do NOT purge",
    cliTemplate: "# Do not delete. Key Vault has soft-delete. Re-point secrets to AWS Secrets Manager.",
    minutes: 5,
    notes: "Soft-delete protects keys for 90 days. Purge only after confirming AWS secrets are active.",
  },
  "Microsoft.CognitiveServices/accounts": {
    stateful: false,
    action: "Delete Azure OpenAI resource — restore Bedrock invocations",
    cliTemplate: "az cognitiveservices account delete --resource-group {rg} --name {name}",
    minutes: 5,
    notes: "Stateless model endpoint. No data loss.",
  },
  // Observability
  "Microsoft.Insights/components": {
    stateful: true,
    action: "RETAIN Application Insights — logs are valuable for rollback diagnosis",
    cliTemplate: "# Retain for 90 days for rollback diagnostics.",
    minutes: 0,
    notes: "Keep for post-rollback analysis. Can be deleted after 90-day retention.",
  },
  "Microsoft.EventHub/namespaces": {
    stateful: true,
    action: "RETAIN Event Hubs namespace — drain messages before deleting",
    cliTemplate: "# Drain messages first, then: az eventhubs namespace delete --resource-group {rg} --name {name}",
    minutes: 30,
    notes: "Contains unprocessed messages. Drain or replay to Kinesis before deleting.",
  },
  // Default fallback
  "default": {
    stateful: false,
    action: "Delete resource and re-point to AWS equivalent",
    cliTemplate: "az resource delete --ids {resourceId}",
    minutes: 5,
    notes: "Verify no dependencies before deletion.",
  },
};

function getResourceMeta(resourceType: string) {
  return RESOURCE_ROLLBACK_META[resourceType] ?? RESOURCE_ROLLBACK_META["default"];
}

/** Extract Azure resource types and names from a Logic Apps JSON output */
function extractResourcesFromOutput(output: Record<string, unknown>): Array<{name: string; type: string}> {
  const resources: Array<{name: string; type: string}> = [];

  // Extract from parameters block
  const params = output.parameters as Record<string, unknown> | undefined;
  if (params) {
    for (const key of Object.keys(params)) {
      if (key.includes("adf") || key.includes("factory"))
        resources.push({ name: key, type: "Microsoft.DataFactory/factories" });
      if (key.includes("storage") || key.includes("Storage"))
        resources.push({ name: key, type: "Microsoft.Storage/storageAccounts" });
      if (key.includes("servicebus") || key.includes("ServiceBus"))
        resources.push({ name: key, type: "Microsoft.ServiceBus/namespaces" });
      if (key.includes("appConfig"))
        resources.push({ name: key, type: "Microsoft.AppConfiguration/configurationStores" });
    }
  }

  // Extract from actions by type patterns
  const actions = output.actions as Record<string, unknown> | undefined;
  if (actions) {
    function scanActions(acts: Record<string, unknown>) {
      for (const [name, action] of Object.entries(acts)) {
        const a = action as Record<string, unknown>;
        if (a.type === "Function") resources.push({ name, type: "Microsoft.Web/sites" });
        if (a.type === "ApiConnection") {
          const host = (a.inputs as Record<string, unknown>)?.host as Record<string, unknown>;
          const connName = JSON.stringify(host || "");
          if (/servicebus/i.test(connName)) resources.push({ name, type: "Microsoft.ServiceBus/namespaces" });
          if (/documentdb|cosmosdb/i.test(connName)) resources.push({ name, type: "Microsoft.DocumentDB/databaseAccounts" });
          if (/azureblob|storage/i.test(connName)) resources.push({ name, type: "Microsoft.Storage/storageAccounts" });
          if (/cognitiveservices/i.test(connName)) resources.push({ name, type: "Microsoft.CognitiveServices/accounts" });
        }
        if (a.type === "Http") {
          const uri = ((a.inputs as Record<string, unknown>)?.uri as string) || "";
          if (/DataFactory/i.test(uri)) resources.push({ name, type: "Microsoft.DataFactory/factories" });
          if (/management\.azure\.com/i.test(uri)) resources.push({ name, type: "Microsoft.Resources/deployments" });
          if (/openai\.azure\.com/i.test(uri)) resources.push({ name, type: "Microsoft.CognitiveServices/accounts" });
        }
        if (a.actions && typeof a.actions === "object") scanActions(a.actions as Record<string, unknown>);
        if (a.else && typeof a.else === "object") {
          const elseBlock = a.else as Record<string, unknown>;
          if (elseBlock.actions) scanActions(elseBlock.actions as Record<string, unknown>);
        }
      }
    }
    scanActions(actions);
  }

  // Always include the Logic App itself
  resources.unshift({ name: "LogicApp_MigratedWorkflow", type: "Microsoft.Logic/workflows" });

  // Deduplicate by type
  const seen = new Set<string>();
  return resources.filter(r => {
    const key = `${r.type}:${r.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const DEPLOYMENT_ORDER: Record<string, number> = {
  "Microsoft.Network/virtualNetworks":         1,
  "Microsoft.KeyVault/vaults":                 2,
  "Microsoft.Storage/storageAccounts":         3,
  "Microsoft.ServiceBus/namespaces":           4,
  "Microsoft.EventHub/namespaces":             5,
  "Microsoft.DocumentDB/databaseAccounts":     6,
  "Microsoft.Sql/servers":                     7,
  "Microsoft.CognitiveServices/accounts":      8,
  "Microsoft.Insights/components":             9,
  "Microsoft.ApiManagement/service":           10,
  "Microsoft.Web/serverfarms":                 11,
  "Microsoft.Web/sites":                       12,
  "Microsoft.DataFactory/factories":           13,
  "Microsoft.Logic/workflows":                 14,
};

function getDeploymentOrder(type: string): number {
  return DEPLOYMENT_ORDER[type] ?? 99;
}

export function generateRollbackPlan(output: Record<string, unknown>): RollbackPlan {
  const resources = extractResourcesFromOutput(output);
  const warnings: string[] = [];

  const entries: RollbackEntry[] = resources
    .sort((a, b) => getDeploymentOrder(b.type) - getDeploymentOrder(a.type)) // reverse deploy order
    .map((r, idx) => {
      const meta = getResourceMeta(r.type);
      if (meta.stateful) {
        warnings.push(`⚠ STATEFUL: ${r.name} (${r.type}) — RETAIN and re-point, do NOT delete`);
      }
      if (r.type === "Microsoft.Network/expressRouteCircuits") {
        warnings.push("🔴 CRITICAL: ExpressRoute rollback requires provider coordination — may take days");
      }
      return {
        resourceName: r.name,
        resourceType: r.type,
        deploymentOrder: getDeploymentOrder(r.type),
        stateful: meta.stateful,
        rollbackAction: meta.action,
        azureCliCommand: meta.cliTemplate
          .replace("{rg}", "${RESOURCE_GROUP}")
          .replace("{name}", r.name),
        estimatedMinutes: meta.minutes,
        notes: meta.notes,
      };
    });

  const totalMinutes = entries.reduce((sum, e) => sum + e.estimatedMinutes, 0);

  // Standard warnings
  warnings.unshift("Before rollback: ensure AWS Step Functions execution role and Lambda functions are still active");
  warnings.push("After rollback: run smoke tests against AWS endpoints before closing incident");
  warnings.push("Document all rollback steps taken with timestamps for post-incident review");

  return {
    generatedAt: new Date().toISOString(),
    totalResources: entries.length,
    estimatedTotalRollbackMinutes: totalMinutes,
    criticalWarnings: warnings,
    entries,
  };
}
