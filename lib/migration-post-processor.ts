/**
 * migration-post-processor.ts
 *
 * Programmatic post-processing of AI-generated AWS → Azure Logic Apps migrations.
 * Each of the 15 enterprise categories runs as a deterministic code function AFTER
 * the AI generates output — guaranteeing fixes regardless of AI quality or omissions.
 *
 * Categories:
 *  CAT-1  Trigger migration (HTTP → Recurrence)
 *  CAT-2  Execution context body passing (@triggerBody fix)
 *  CAT-3  AWS SSM → Azure App Configuration
 *  CAT-4  S3 bucket references → Azure Storage placeholders
 *  CAT-5  Glue/Iceberg → GAP_NOTICE for Databricks/Delta Lake
 *  CAT-6  CloudWatch log refs → Azure Monitor
 *  CAT-7  AWS service names → Azure equivalents
 *  CAT-8  AWS URLs → Azure CDN/APIM/Static Web App placeholders
 *  CAT-9  Unreplaced $$.* context variables → Azure expressions
 *  CAT-10 Missing ManagedServiceIdentity on ADF HTTP calls
 *  CAT-11 ADF fire-and-forget → polling Until loop marker
 *  CAT-12 Missing Skipped in runAfter error handlers
 *  CAT-13 Foreach concurrency from MaxConcurrency
 *  CAT-14 CloudFront URLs → Azure CDN placeholder
 *  CAT-15 Production parameters block completeness
 */

export interface PostProcessResult {
  output: Record<string, unknown>;
  changesApplied: string[];
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/** Recursively walk every string leaf in an object and apply a replacer */
function walkStrings(
  obj: unknown,
  replacer: (value: string, path: string) => string,
  path = ""
): unknown {
  if (typeof obj === "string") return replacer(obj, path);
  if (Array.isArray(obj))
    return obj.map((item, i) => walkStrings(item, replacer, `${path}[${i}]`));
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = walkStrings(val, replacer, `${path}.${key}`);
    }
    return result;
  }
  return obj;
}

/** Flatten all actions (including nested inside If/Foreach/Scope) */
function flattenActions(
  actions: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  function collect(acts: Record<string, unknown>) {
    for (const [name, action] of Object.entries(acts)) {
      const a = action as Record<string, unknown>;
      result[name] = a;
      if (a.actions && typeof a.actions === "object")
        collect(a.actions as Record<string, unknown>);
      if (a.else && typeof a.else === "object") {
        const elseBlock = a.else as Record<string, unknown>;
        if (elseBlock.actions)
          collect(elseBlock.actions as Record<string, unknown>);
      }
    }
  }
  collect(actions);
  return result;
}

/** Build topological order of root-level actions by runAfter dependency */
function topoOrder(actions: Record<string, unknown>): string[] {
  const visited = new Set<string>();
  const order: string[] = [];

  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const a = actions[name] as Record<string, unknown> | undefined;
    if (a?.runAfter && typeof a.runAfter === "object") {
      for (const dep of Object.keys(a.runAfter as Record<string, unknown>))
        visit(dep);
    }
    order.push(name);
  }

  for (const name of Object.keys(actions)) visit(name);
  return order;
}

// ─── CAT-1: HTTP trigger → Recurrence migration ───────────────────────────────
function cat1TriggerMigration(
  output: Record<string, unknown>,
  sourceAsl: Record<string, unknown>
): string[] {
  const changes: string[] = [];
  const triggers = output.triggers as Record<string, unknown> | undefined;
  if (!triggers) return changes;

  const sourceComment = (sourceAsl.Comment as string) || "";
  const hasScheduleHint = /cron|rate|schedule|every|daily|hourly|weekly|monthly|recur|timer/i.test(sourceComment);

  for (const [name, trigger] of Object.entries(triggers)) {
    const t = trigger as Record<string, unknown>;
    if (t.type === "Request" && t.kind === "Http") {
      if (hasScheduleHint) {
        // Replace with Recurrence placeholder
        (output.triggers as Record<string, unknown>)[name] = {
          type: "Recurrence",
          recurrence: {
            frequency: "Day",
            interval: 1,
            _SCHEDULE_PENDING:
              "Replace with actual schedule. AWS cron format: cron(min hr day month weekday year) → Azure: frequency + interval + schedule.hours/minutes",
          },
        };
        changes.push(
          `CAT-1: HTTP trigger '${name}' → Recurrence (SCHEDULE_PENDING — schedule hint detected in source comment)`
        );
      } else {
        // Add a metadata comment but keep the HTTP trigger
        (t as Record<string, unknown>)._CAT1_NOTE =
          "SCHEDULE_CHECK: If this workflow was triggered by EventBridge Schedule, replace this trigger with a Recurrence trigger before deployment";
        changes.push(
          `CAT-1: HTTP trigger '${name}' — no schedule found in source; _CAT1_NOTE added for engineer review`
        );
      }
    }
  }
  return changes;
}

// ─── CAT-2: Fix @triggerBody() in non-first actions ──────────────────────────
function cat2BodyPassing(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const actions = output.actions as Record<string, unknown> | undefined;
  if (!actions) return changes;

  const order = topoOrder(actions);

  for (let i = 1; i < order.length; i++) {
    const name = order[i];
    const action = actions[name] as Record<string, unknown> | undefined;
    if (!action) continue;

    const inputs = action.inputs as Record<string, unknown> | undefined;
    if (!inputs) continue;

    // Fix body: "@triggerBody()" in non-first actions
    if (inputs.body === "@triggerBody()") {
      const prev = order[i - 1];
      inputs.body = `@body('${prev}')`;
      changes.push(
        `CAT-2: '${name}'.inputs.body — @triggerBody() replaced with @body('${prev}')`
      );
    }

    // Fix body inside function inputs
    const fnBody = (inputs.function as Record<string, unknown> | undefined);
    if (fnBody && (inputs as Record<string, unknown>).body === "@triggerBody()") {
      const prev = order[i - 1];
      (inputs as Record<string, unknown>).body = `@body('${prev}')`;
      changes.push(
        `CAT-2: '${name}' Function body — @triggerBody() replaced with @body('${prev}')`
      );
    }
  }
  return changes;
}

// ─── CAT-3: SSM → Azure App Configuration ────────────────────────────────────
const SSM_KEY_MAP: Record<string, string> = {
  SSM_TOKEN_PATH: "APP_CONFIG_KEY",
  SSM_SECRET_NAME: "KEYVAULT_SECRET_NAME",
  SSM_PARAMETER: "APP_CONFIG_PARAMETER",
  SSM_VALUE: "APP_CONFIG_VALUE",
};

const SSM_CLI_MAP: Record<string, string> = {
  "aws ssm get-parameter": "az appconfig kv show",
  "aws ssm put-parameter": "az appconfig kv set",
  "aws ssm describe-parameters": "az appconfig kv list",
};

function cat3SsmReferences(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  let ssmFound = 0;

  const replaced = walkStrings(output, (value) => {
    let v = value;
    // Replace SSM key names
    for (const [from, to] of Object.entries(SSM_KEY_MAP)) {
      if (v.includes(from)) {
        v = v.split(from).join(to);
        ssmFound++;
      }
    }
    // Replace SSM CLI commands
    for (const [from, to] of Object.entries(SSM_CLI_MAP)) {
      if (v.toLowerCase().includes(from)) {
        v = v.split(from).join(to);
        ssmFound++;
      }
    }
    // Replace /pipeline/ and /app/ SSM-style paths
    v = v.replace(/\/pipeline\/([a-z0-9-_/]+)/gi, (match, p1) => {
      ssmFound++;
      return `/appconfig/${p1}__MIGRATED_FROM_SSM`;
    });
    return v;
  }) as Record<string, unknown>;

  if (ssmFound > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-3: ${ssmFound} SSM reference(s) converted to Azure App Configuration equivalents`);
  }
  return changes;
}

// ─── CAT-4: S3 bucket references → Azure Storage placeholders ────────────────
const S3_BUCKET_PATTERNS = [
  /\b[a-z0-9][a-z0-9-]{1,61}[a-z0-9](?:-\d{12}|-[a-z]{2}-[a-z]+-\d)\b/g,  // name-accountid / name-region
  /\b(?:bronze|silver|gold|raw|processed|curated|landing|archive|backup)-[a-z0-9-]+\b/g,
  /\bs3:\/\/([a-z0-9][a-z0-9-]{1,61}[a-z0-9])/g,
];

function cat4S3Buckets(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const foundBuckets = new Set<string>();

  const replaced = walkStrings(output, (value) => {
    let v = value;

    // Replace s3:// scheme
    if (/s3:\/\//i.test(v)) {
      v = v.replace(/s3:\/\/([^/\s"']+)/gi, (_, bucket) => {
        foundBuckets.add(bucket);
        return `abfss://${bucket}__AZURE_CONTAINER_NAME_REPLACE@storageaccount.dfs.core.windows.net`;
      });
    }

    // Replace data lake tier bucket names (bronze/silver/gold patterns)
    v = v.replace(/\b(bronze|silver|gold|raw|processed|curated|landing|archive|backup)-[a-z0-9-]+\b/gi,
      (match) => {
        foundBuckets.add(match);
        return "AZURE_CONTAINER_NAME_REPLACE";
      }
    );

    return v;
  }) as Record<string, unknown>;

  if (foundBuckets.size > 0) {
    Object.assign(output, replaced);
    output["S3_TO_AZURE_STORAGE_MAPPING_REQUIRED"] = {
      _note: "Replace all AZURE_CONTAINER_NAME_REPLACE with actual Azure Storage container names",
      original_s3_buckets: Array.from(foundBuckets),
    };
    changes.push(`CAT-4: ${foundBuckets.size} S3 bucket reference(s) replaced with AZURE_CONTAINER_NAME_REPLACE`);
  }
  return changes;
}

// ─── CAT-5: Glue/Iceberg GAP_NOTICE ──────────────────────────────────────────
const GLUE_INDICATORS = ["startJobRun", "GlueJobRun", "glue:startJobRun", "AWSGlue", "glue-job"];
const ICEBERG_INDICATORS = ["iceberg", "spark.sql.extensions", "datalake-formats", "glue_catalog"];

function cat5GlueIceberg(
  output: Record<string, unknown>,
  sourceStr: string
): string[] {
  const changes: string[] = [];
  const hasGlue = GLUE_INDICATORS.some((k) => sourceStr.toLowerCase().includes(k.toLowerCase()));
  const hasIceberg = ICEBERG_INDICATORS.some((k) => sourceStr.toLowerCase().includes(k.toLowerCase()));

  if (!hasGlue && !hasIceberg) return changes;

  const actions = output.actions as Record<string, unknown> | undefined;
  if (!actions) return changes;

  const allActions = flattenActions(actions);
  let noticeCount = 0;

  for (const [name, action] of Object.entries(allActions)) {
    const a = action as Record<string, unknown>;
    // Look for ADF-style pipeline trigger actions
    const inputs = a.inputs as Record<string, unknown> | undefined;
    const uri = ((inputs?.uri as string) || (inputs?.path as string) || "").toString();
    const isAdfTrigger =
      uri.includes("DataFactory") ||
      uri.includes("pipelines") ||
      name.toLowerCase().includes("glue") ||
      name.toLowerCase().includes("adf") ||
      name.toLowerCase().includes("pipeline");

    if (isAdfTrigger && (hasGlue || hasIceberg)) {
      a["GAP_NOTICE"] =
        "MIGRATION_GAP: Original AWS Glue job" +
        (hasIceberg ? " used Apache Iceberg with Spark extensions" : "") +
        ". Azure Data Factory does not support Spark natively. " +
        "This job must be reimplemented as: (1) Azure Databricks notebook job, OR " +
        "(2) Azure Synapse Spark pool job. " +
        "Replace Iceberg table format with Delta Lake (Azure-native equivalent). " +
        "Replace all glue_catalog references with the appropriate Azure catalog. " +
        "This step CANNOT be completed automatically and requires manual architectural work.";
      noticeCount++;
    }
  }

  if (noticeCount > 0)
    changes.push(`CAT-5: GAP_NOTICE added to ${noticeCount} ADF action(s) — Glue/Iceberg requires manual reimplementation`);
  return changes;
}

// ─── CAT-6: CloudWatch → Azure Monitor in notification messages ───────────────
const CW_REPLACEMENTS: [RegExp, string][] = [
  [/\/aws\/lambda\//g, "/azure/functionapp/"],
  [/CloudWatch Logs/gi, "Azure Monitor Log Analytics"],
  [/CloudWatch/gi, "Azure Monitor"],
  [/Go to CloudWatch[^.]*\./gi,
    "Go to Azure Monitor > Log Analytics workspace and filter by Function App name."],
  [/aws logs get-log-events/gi, "az monitor app-insights query"],
  [/aws logs filter-log-events/gi, "az monitor app-insights query"],
  [/log group/gi, "Log Analytics workspace"],
  [/log stream/gi, "Application Insights trace"],
];

function cat6CloudWatchRefs(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  let replaceCount = 0;

  const replaced = walkStrings(output, (value) => {
    let v = value;
    for (const [pattern, replacement] of CW_REPLACEMENTS) {
      if (pattern.test(v)) {
        v = v.replace(pattern, replacement);
        replaceCount++;
      }
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;
    }
    return v;
  }) as Record<string, unknown>;

  if (replaceCount > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-6: ${replaceCount} CloudWatch reference(s) → Azure Monitor equivalents`);
  }
  return changes;
}

// ─── CAT-7: AWS service names → Azure equivalents ────────────────────────────
const AWS_SERVICE_MAP: [RegExp, string, string][] = [
  [/QuickSight/gi,  "PowerBI",              "QuickSight"],
  [/Redshift/gi,    "Synapse",              "Redshift"],
  [/\bAthena\b/gi,  "SynapseServerlessSQL", "Athena"],
  [/DynamoDB/gi,    "CosmosDB",             "DynamoDB"],
  [/Kinesis/gi,     "EventHubs",            "Kinesis"],
  [/\bSQS\b/g,      "ServiceBus",           "SQS"],
  [/\bSNS\b/g,      "EventGrid",            "SNS"],
  [/\bECR\b/g,      "AzureContainerRegistry","ECR"],
  [/\bECS\b/g,      "AzureContainerInstances","ECS"],
];

// Business-logic names to preserve (never rename)
const PRESERVE_PATTERNS = [
  /servicenow/i, /remediation/i, /ingest/i, /cmdb/i,
  /incident/i, /orchestrat/i, /business/i,
];

function cat7AwsServiceNames(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  let renameCount = 0;

  const replaced = walkStrings(output, (value) => {
    // Skip if it's a business-logic name
    if (PRESERVE_PATTERNS.some((p) => p.test(value))) return value;

    let v = value;
    for (const [pattern, azureName, awsName] of AWS_SERVICE_MAP) {
      if (pattern.test(v)) {
        v = v.replace(pattern, azureName);
        // Add rename comment only to function IDs
        if (value.includes("/functions/")) {
          v += `__RENAMED_FROM_AWS_SERVICE:${awsName}`;
        }
        renameCount++;
      }
      pattern.lastIndex = 0;
    }
    return v;
  }) as Record<string, unknown>;

  if (renameCount > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-7: ${renameCount} AWS service name(s) replaced with Azure equivalents`);
  }
  return changes;
}

// ─── CAT-8: AWS URLs → Azure placeholders ────────────────────────────────────
const URL_REPLACEMENTS: [RegExp, string][] = [
  [/https?:\/\/[a-z0-9]+\.cloudfront\.net[^\s"']*/gi, "AZURE_CDN_ENDPOINT_REPLACE"],
  [/https?:\/\/[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com[^\s"']*/gi, "AZURE_APIM_ENDPOINT_REPLACE"],
  [/https?:\/\/[a-z0-9-]+\.s3-website-[a-z0-9-]+\.amazonaws\.com[^\s"']*/gi, "AZURE_STATIC_WEBAPP_URL_REPLACE"],
  [/https?:\/\/[a-z0-9-]+\.s3\.amazonaws\.com[^\s"']*/gi, "AZURE_BLOB_STORAGE_URL_REPLACE"],
  [/arn:aws:[a-z0-9]+:[a-z0-9-]*:[0-9]*:[^\s"',}]*/gi, "AZURE_RESOURCE_ARN_REPLACE"],
];

function cat8AwsUrls(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const urlMappings: Record<string, string> = {};

  const replaced = walkStrings(output, (value) => {
    let v = value;
    for (const [pattern, placeholder] of URL_REPLACEMENTS) {
      const matches = v.match(pattern);
      if (matches) {
        for (const m of matches) {
          urlMappings[placeholder] = m;
        }
        v = v.replace(pattern, placeholder);
      }
      pattern.lastIndex = 0;
    }
    return v;
  }) as Record<string, unknown>;

  if (Object.keys(urlMappings).length > 0) {
    Object.assign(output, replaced);
    output["URL_MIGRATION_REQUIRED"] = {
      _note: "Replace all placeholders with actual Azure endpoints before deployment",
      mappings: urlMappings,
    };
    changes.push(`CAT-8: ${Object.keys(urlMappings).length} AWS URL(s) replaced with Azure placeholders`);
  }
  return changes;
}

// ─── CAT-9: Unreplaced $$.* context variables → Azure expressions ─────────────
const CONTEXT_VAR_MAP: [RegExp, string][] = [
  [/\$\$\.Execution\.Id/g,        "@workflow()?['run']?['id']"],
  [/\$\$\.Execution\.Name/g,      "@workflow()?['run']?['name']"],
  [/\$\$\.Execution\.StartTime/g, "@workflow()?['run']?['startTime']"],
  [/\$\$\.Execution\.RoleArn/g,   "@workflow()?['run']?['id']"],
  [/\$\$\.State\.Name/g,          "@action()?['name']"],
  [/\$\$\.Map\.Item\.Index/g,     "@iterationIndexes('ForeachAction')"],
  [/\$\$\.Map\.Item\.Value/g,     "@items('ForeachAction')"],
  [/\$\$\.[a-zA-Z.]+/g,           "UNRESOLVED_CONTEXT_VAR_REPLACE"],
];

function cat9ContextVars(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  let fixCount = 0;

  const replaced = walkStrings(output, (value) => {
    let v = value;
    for (const [pattern, replacement] of CONTEXT_VAR_MAP) {
      if (pattern.test(v)) {
        v = v.replace(pattern, replacement);
        fixCount++;
      }
      pattern.lastIndex = 0;
    }
    return v;
  }) as Record<string, unknown>;

  if (fixCount > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-9: ${fixCount} unreplaced $$.* context variable(s) converted to Azure expressions`);
  }
  return changes;
}

// ─── CAT-10: Missing ManagedServiceIdentity on ADF HTTP calls ─────────────────
const ADF_URL_PATTERN = /management\.azure\.com.*DataFactory.*createRun/i;

function cat10AdfAuthentication(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const actions = output.actions as Record<string, unknown> | undefined;
  if (!actions) return changes;

  const allActions = flattenActions(actions);
  let fixCount = 0;

  for (const [name, action] of Object.entries(allActions)) {
    const a = action as Record<string, unknown>;
    if (a.type !== "Http") continue;

    const inputs = a.inputs as Record<string, unknown> | undefined;
    if (!inputs) continue;

    const uri = (inputs.uri as string) || "";
    if (!ADF_URL_PATTERN.test(uri)) continue;

    if (!inputs.authentication) {
      inputs.authentication = {
        type: "ManagedServiceIdentity",
        audience: "https://management.azure.com/",
      };
      fixCount++;
      changes.push(`CAT-10: Added ManagedServiceIdentity authentication to ADF trigger action '${name}'`);
    }
  }
  return changes;
}

// ─── CAT-11: ADF fire-and-forget → polling marker ────────────────────────────
function cat11AdfPolling(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const actions = output.actions as Record<string, unknown> | undefined;
  if (!actions) return changes;

  const allActions = flattenActions(actions);
  let markerCount = 0;

  for (const [name, action] of Object.entries(allActions)) {
    const a = action as Record<string, unknown>;
    if (a.type !== "Http") continue;

    const inputs = a.inputs as Record<string, unknown> | undefined;
    const uri = (inputs?.uri as string) || "";
    const method = ((inputs?.method as string) || "").toUpperCase();

    if (method === "POST" && /DataFactory.*pipelines.*createRun/i.test(uri)) {
      a["_CAT11_POLLING_REQUIRED"] =
        "ACTION_REQUIRED: This HTTP action triggers ADF but does NOT wait for completion. " +
        "In the original AWS Step Functions, startJobRun.sync was synchronous. " +
        "Add an Until loop after this action that polls GET " +
        uri.replace("createRun", "pipelineRuns/{runId}") +
        " every 60s and exits when status is Succeeded or Failed. " +
        "Route Failed status to the failure notification action.";
      markerCount++;
      changes.push(`CAT-11: Polling marker added to ADF trigger '${name}' — Until loop required for sync behaviour`);
    }
  }
  return changes;
}

// ─── CAT-12: Missing Skipped in runAfter error handlers ──────────────────────
function cat12SkippedRunAfter(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const actions = output.actions as Record<string, unknown> | undefined;
  if (!actions) return changes;

  const allActions = flattenActions(actions);
  const actionNames = new Set(Object.keys(allActions));
  let fixCount = 0;

  // Build a map of which actions are "alert/fallback" (run on failure of another)
  const alertActions = new Set<string>();
  for (const [name, action] of Object.entries(allActions)) {
    const a = action as Record<string, unknown>;
    const runAfter = a.runAfter as Record<string, string[]> | undefined;
    if (!runAfter) continue;
    for (const [dep, statuses] of Object.entries(runAfter)) {
      if (statuses.includes("Failed") || statuses.includes("TimedOut")) {
        alertActions.add(name);
      }
    }
  }

  // For each action whose runAfter depends on an alert action with only ["Succeeded"]
  // — add ["Skipped"] too
  for (const [name, action] of Object.entries(allActions)) {
    const a = action as Record<string, unknown>;
    const runAfter = a.runAfter as Record<string, string[]> | undefined;
    if (!runAfter) continue;

    for (const [dep, statuses] of Object.entries(runAfter)) {
      if (
        alertActions.has(dep) &&
        actionNames.has(dep) &&
        statuses.includes("Succeeded") &&
        !statuses.includes("Skipped")
      ) {
        runAfter[dep] = [...statuses, "Skipped"];
        fixCount++;
        changes.push(
          `CAT-12: '${name}'.runAfter['${dep}'] — added 'Skipped' (alert action may be skipped on happy path)`
        );
      }
    }
  }
  return changes;
}

// ─── CAT-13: Foreach concurrency from source MaxConcurrency ──────────────────
function cat13ForeachConcurrency(
  output: Record<string, unknown>,
  sourceStr: string
): string[] {
  const changes: string[] = [];
  const actions = output.actions as Record<string, unknown> | undefined;
  if (!actions) return changes;

  // Extract MaxConcurrency values from source
  const concurrencyMatches = [...sourceStr.matchAll(/"MaxConcurrency"\s*:\s*(\d+)/g)];
  const maxConcurrencies = concurrencyMatches.map((m) => parseInt(m[1]));

  const allActions = flattenActions(actions);
  const foreachActions = Object.entries(allActions).filter(
    ([, a]) => (a as Record<string, unknown>).type === "Foreach"
  );

  foreachActions.forEach(([name, action], idx) => {
    const a = action as Record<string, unknown>;
    const maxC = maxConcurrencies[idx]; // match by position

    if (maxC === undefined) return;

    if (maxC === 1) {
      a.operationOptions = "Sequential";
      changes.push(`CAT-13: '${name}' Foreach → Sequential (MaxConcurrency was 1)`);
    } else if (maxC > 1) {
      a.runtimeConfiguration = {
        concurrency: { repetitions: maxC },
      };
      changes.push(`CAT-13: '${name}' Foreach → concurrency ${maxC} (from source MaxConcurrency)`);
    }
    // maxC === 0 means unlimited — leave as-is
  });

  return changes;
}

// ─── CAT-14: CloudFront URLs → Azure CDN placeholders ─────────────────────────
function cat14CloudFrontUrls(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  let count = 0;

  const replaced = walkStrings(output, (value) => {
    if (/cloudfront\.net/i.test(value)) {
      count++;
      return value.replace(
        /https?:\/\/[a-z0-9]+\.cloudfront\.net[^\s"']*/gi,
        "https://AZURE_STATIC_WEBAPP_HOSTNAME_REPLACE/index.html"
      );
    }
    return value;
  }) as Record<string, unknown>;

  if (count > 0) {
    Object.assign(output, replaced);
    changes.push(
      `CAT-14: ${count} CloudFront URL(s) → AZURE_STATIC_WEBAPP_HOSTNAME_REPLACE (update with actual Azure CDN hostname)`
    );
  }
  return changes;
}

// ─── CAT-15: Production parameters block completion ───────────────────────────
const REQUIRED_PARAMS: Record<string, { type: string; description: string }> = {
  storageAccountName: {
    type: "String",
    description: "Azure Storage Account name — replacing AWS S3 buckets",
  },
  appConfigEndpoint: {
    type: "String",
    description: "Azure App Configuration endpoint URL — replacing AWS SSM Parameter Store",
  },
  adfFactoryName: {
    type: "String",
    description: "Azure Data Factory instance name",
  },
  serviceBusNamespace: {
    type: "String",
    description: "Azure Service Bus namespace — replacing AWS SNS/SQS",
  },
};

function cat15ParametersBlock(output: Record<string, unknown>): string[] {
  const changes: string[] = [];

  if (!output.parameters) {
    output.parameters = {};
  }

  const params = output.parameters as Record<string, unknown>;
  const added: string[] = [];

  for (const [key, meta] of Object.entries(REQUIRED_PARAMS)) {
    if (!params[key]) {
      params[key] = {
        type: meta.type,
        defaultValue: "",
        metadata: { description: meta.description },
      };
      added.push(key);
    }
  }

  // Replace hardcoded SUB/RG/ADF/APP placeholders with parameter references
  let hardcodedCount = 0;
  const replaced = walkStrings(output, (value) => {
    let v = value;
    if (v === "SUB" || v === "<subscription-id>") { v = "@parameters('subscriptionId')"; hardcodedCount++; }
    if (v === "RG"  || v === "<resource-group>")  { v = "@parameters('resourceGroup')";  hardcodedCount++; }
    if (v === "ADF" || v === "<factory-name>")    { v = "@parameters('adfFactoryName')"; hardcodedCount++; }
    if (v === "APP" || v === "<app-name>")        { v = "@parameters('appName')";        hardcodedCount++; }
    return v;
  }) as Record<string, unknown>;

  Object.assign(output, replaced);

  if (added.length > 0)
    changes.push(`CAT-15: Added ${added.length} missing production parameter(s): ${added.join(", ")}`);
  if (hardcodedCount > 0)
    changes.push(`CAT-15: Replaced ${hardcodedCount} hardcoded placeholder(s) with @parameters() references`);

  return changes;
}

// ─── CAT-16: Bedrock model ID → Azure OpenAI model mapping ───────────────────
import { BEDROCK_MODEL_MAP } from "./service-registry";

function cat16BedrockModelMapping(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  let count = 0;

  const replaced = walkStrings(output, (value) => {
    for (const [awsModel, azureModel] of Object.entries(BEDROCK_MODEL_MAP)) {
      if (value.toLowerCase().includes(awsModel.toLowerCase())) {
        count++;
        return value.replace(new RegExp(awsModel.replace(".", "\\."), "gi"), azureModel);
      }
    }
    return value;
  }) as Record<string, unknown>;

  if (count > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-16: ${count} Bedrock model ID(s) translated to Azure OpenAI / Foundry equivalents`);
  }
  return changes;
}

// ─── CAT-17: DynamoDB stream → Cosmos DB change feed marker ──────────────────
function cat17DynamoStreamTrigger(
  output: Record<string, unknown>,
  sourceStr: string
): string[] {
  const changes: string[] = [];
  const hasDynamoStream = /EventSourceMapping.*dynamodb|dynamodb.*stream|DynamoDBStreamTrigger/i.test(sourceStr);
  if (!hasDynamoStream) return changes;

  const triggers = output.triggers as Record<string, unknown> | undefined;
  if (triggers) {
    for (const [name, t] of Object.entries(triggers)) {
      const trigger = t as Record<string, unknown>;
      if (trigger.type === "Request" || trigger.type === "Recurrence") {
        (trigger as Record<string, unknown>)["_CAT17_DYNAMO_STREAM"] =
          "MIGRATION_NOTE: Source had DynamoDB Stream EventSourceMapping. " +
          "Replace this trigger with a Cosmos DB Change Feed trigger binding. " +
          "Enable change feed on the Cosmos DB container that replaced DynamoDB. " +
          "Pattern: CosmosDBChangeFeedTrigger → azure_pattern: BlobStorageEventGridTrigger";
        changes.push(`CAT-17: DynamoDB stream trigger detected — Cosmos DB change feed marker added to trigger '${name}'`);
      }
    }
  }
  return changes;
}

// ─── CAT-18: Kinesis → Event Hubs mapping ────────────────────────────────────
const KINESIS_REPLACEMENTS: [RegExp, string][] = [
  [/kinesis\.amazonaws\.com/gi, "eventhubs.windows.net"],
  [/aws:kinesis/gi, "azure:eventhubs"],
  [/"KinesisStream"/gi, '"EventHub"'],
  [/StartingPosition.*TRIM_HORIZON/gi, "InitialOffsetDateTime: earliest"],
  [/StartingPosition.*LATEST/gi, "InitialOffsetDateTime: latest"],
];

function cat18KinesisToEventHubs(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  let count = 0;

  const replaced = walkStrings(output, (value) => {
    let v = value;
    for (const [pattern, replacement] of KINESIS_REPLACEMENTS) {
      if (pattern.test(v)) { v = v.replace(pattern, replacement); count++; }
      pattern.lastIndex = 0;
    }
    return v;
  }) as Record<string, unknown>;

  if (count > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-18: ${count} Kinesis reference(s) translated to Azure Event Hubs`);
  }
  return changes;
}

// ─── CAT-19: S3 event notification → Blob Storage + Event Grid marker ─────────
function cat19S3EventTrigger(
  output: Record<string, unknown>,
  sourceStr: string
): string[] {
  const changes: string[] = [];
  const hasS3Event = /s3:ObjectCreated|NotificationConfiguration.*Lambda|S3EventNotification/i.test(sourceStr);
  if (!hasS3Event) return changes;

  const triggers = output.triggers as Record<string, unknown> | undefined;
  if (triggers) {
    for (const [name, t] of Object.entries(triggers)) {
      const trigger = t as Record<string, unknown>;
      if (trigger.type === "Request") {
        (trigger as Record<string, unknown>)["_CAT19_S3_EVENT"] =
          "MIGRATION_NOTE: Source had S3 event notification trigger. " +
          "Replace with: (1) Azure Storage Account with Event Grid system topic, " +
          "(2) Event Grid event subscription filtering on Microsoft.Storage.BlobCreated, " +
          "(3) Azure Function with Event Grid trigger binding. " +
          "Pattern: S3EventNotificationTrigger → BlobStorageEventGridTrigger";
        changes.push(`CAT-19: S3 event notification detected — Event Grid/Blob Storage trigger marker added to '${name}'`);
      }
    }
  }
  return changes;
}

// ─── CAT-20: KMS ARN references → Key Vault ──────────────────────────────────
function cat20KmsToKeyVault(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  let count = 0;

  const replaced = walkStrings(output, (value) => {
    if (/arn:aws:kms/i.test(value)) {
      count++;
      return value.replace(/arn:aws:kms:[a-z0-9-]+:[0-9]+:key\/[a-z0-9-]+/gi,
        "https://KEYVAULT_NAME_REPLACE.vault.azure.net/keys/KEY_NAME_REPLACE/KEY_VERSION_REPLACE");
    }
    if (/kms:key\//i.test(value)) {
      count++;
      return "AZURE_KEYVAULT_KEY_URI_REPLACE";
    }
    return value;
  }) as Record<string, unknown>;

  if (count > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-20: ${count} KMS key ARN(s) replaced with Azure Key Vault key URI placeholders`);
  }
  return changes;
}

// ─── CAT-21: Cognito references → Entra B2C ──────────────────────────────────
const COGNITO_REPLACEMENTS: [RegExp, string][] = [
  [/cognito-idp\.[a-z0-9-]+\.amazonaws\.com/gi, "login.microsoftonline.com/{tenantId}/v2.0"],
  [/cognito\.amazonaws\.com/gi, "login.microsoftonline.com"],
  [/UserPoolId/gi, "EntraB2CTenantId"],
  [/ClientId.*cognito/gi, "ApplicationClientId"],
  [/cognito:username/gi, "preferred_username"],
  [/cognito:groups/gi, "groups"],
];

function cat21CognitoToEntraB2C(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  let count = 0;

  const replaced = walkStrings(output, (value) => {
    let v = value;
    for (const [pattern, replacement] of COGNITO_REPLACEMENTS) {
      if (pattern.test(v)) { v = v.replace(pattern, replacement); count++; }
      pattern.lastIndex = 0;
    }
    return v;
  }) as Record<string, unknown>;

  if (count > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-21: ${count} Cognito reference(s) translated to Entra B2C. NOTE: user passwords cannot be migrated.`);
  }
  return changes;
}

// ─── CAT-22: X-Ray → Application Insights ────────────────────────────────────
function cat22XRayToAppInsights(
  output: Record<string, unknown>,
  sourceStr: string
): string[] {
  const changes: string[] = [];
  const hasXRay = /TracingConfig.*Active|TracingEnabled.*true|aws:xray|X-Ray/i.test(sourceStr);
  if (!hasXRay) return changes;

  const params = output.parameters as Record<string, unknown>;
  if (params && !params["appInsightsConnectionString"]) {
    params["appInsightsConnectionString"] = {
      type: "String",
      defaultValue: "",
      metadata: {
        description: "Application Insights connection string — replacing AWS X-Ray tracing",
      },
    };
    changes.push("CAT-22: X-Ray tracing detected — appInsightsConnectionString parameter added (set APPLICATIONINSIGHTS_CONNECTION_STRING in Function App)");
  }
  return changes;
}

// ─── CAT-23: CloudWatch Alarm → Azure Monitor alert marker ───────────────────
function cat23CloudWatchAlarms(
  output: Record<string, unknown>,
  sourceStr: string
): string[] {
  const changes: string[] = [];
  const alarmMatches = [...sourceStr.matchAll(/"AWS::CloudWatch::Alarm"/g)];
  if (alarmMatches.length === 0) return changes;

  output["_CAT23_CLOUDWATCH_ALARMS"] = {
    _note: `MIGRATION_REQUIRED: Found ${alarmMatches.length} CloudWatch Alarm(s) in source. ` +
      "Generate Azure Monitor metric alert rules for each. " +
      "Map: Namespace+MetricName → Azure metric; Threshold → direct; " +
      "Period+EvaluationPeriods → window size; AlarmActions SNS → Azure Monitor action group.",
    alarm_count: alarmMatches.length,
    azure_resource: "Microsoft.Insights/metricAlerts",
  };
  changes.push(`CAT-23: ${alarmMatches.length} CloudWatch Alarm(s) detected — Azure Monitor alert rule generation required`);
  return changes;
}

// ─── CAT-24: GuardDuty → Defender for Cloud ──────────────────────────────────
function cat24GuardDutyToDefender(
  output: Record<string, unknown>,
  sourceStr: string
): string[] {
  const changes: string[] = [];
  const hasGuardDuty = /GuardDuty|AWS::GuardDuty/i.test(sourceStr);
  if (!hasGuardDuty) return changes;

  const hasEC2   = /AWS::EC2|Lambda/i.test(sourceStr);
  const hasEKS   = /AWS::EKS|ECS/i.test(sourceStr);
  const hasS3    = /AWS::S3/i.test(sourceStr);
  const hasRDS   = /AWS::RDS|DynamoDB/i.test(sourceStr);

  output["_CAT24_DEFENDER_FOR_CLOUD"] = {
    _note: "MIGRATION_REQUIRED: Source had GuardDuty. Enable Microsoft Defender for Cloud plans:",
    enable_defender_for_servers:   hasEC2,
    enable_defender_for_containers: hasEKS,
    enable_defender_for_storage:   hasS3,
    enable_defender_for_databases: hasRDS,
    enable_sentinel: true,
    sentinel_connectors: ["Azure Activity", "Microsoft Defender for Cloud"],
    azure_resources: [
      "Microsoft.Security/pricings",
      "Microsoft.OperationalInsights/workspaces (Sentinel)",
    ],
  };
  changes.push("CAT-24: GuardDuty detected — Defender for Cloud + Sentinel configuration block added");
  return changes;
}

// ─── CAT-25: VPC → VNet marker ────────────────────────────────────────────────
function cat25VpcToVnet(
  output: Record<string, unknown>,
  sourceStr: string
): string[] {
  const changes: string[] = [];
  const hasVpc = /AWS::EC2::VPC|CidrBlock|AWS::EC2::Subnet|AWS::EC2::SecurityGroup/i.test(sourceStr);
  if (!hasVpc) return changes;

  output["_CAT25_VPC_MIGRATION_REQUIRED"] = {
    _note: "MIGRATION_REQUIRED: Source contained VPC resources.",
    actions_required: [
      "Generate Azure Virtual Network with VPC CIDR as address space",
      "Generate Azure Subnets from AWS::EC2::Subnet resources",
      "Generate Azure NSGs from AWS::EC2::SecurityGroup (translate protocol/port rules)",
      "Generate Private Endpoints from VPCEndpoint Interface type",
      "Generate Service Endpoints from VPCEndpoint Gateway type",
      "Mark all CIDR blocks as VERIFY_CIDR_NO_OVERLAP before deployment",
    ],
    azure_resources: [
      "Microsoft.Network/virtualNetworks",
      "Microsoft.Network/networkSecurityGroups",
      "Microsoft.Network/privateEndpoints",
    ],
  };
  changes.push("CAT-25: VPC/Subnet/SecurityGroup detected — VNet migration block added");
  return changes;
}

// ─── CAT-26: API Gateway → APIM marker ───────────────────────────────────────
function cat26ApiGatewayToApim(
  output: Record<string, unknown>,
  sourceStr: string
): string[] {
  const changes: string[] = [];
  const hasApiGw = /AWS::ApiGateway::RestApi|AWS::ApiGatewayV2::Api|execute-api/i.test(sourceStr);
  if (!hasApiGw) return changes;

  output["_CAT26_APIM_REQUIRED"] = {
    _note: "MIGRATION_REQUIRED: Source had API Gateway. Generate Azure API Management.",
    mapping: {
      "API Gateway stage":         "APIM API version",
      "API Gateway method":        "APIM operation (same HTTP verb + path)",
      "Lambda integration":        "APIM backend → Azure Function HTTP forward",
      "Usage plans / API keys":    "APIM subscription keys + throttling policies",
      "Lambda authoriser":         "APIM validate-jwt policy (Azure AD token endpoint)",
      "WAF WebACL":                "APIM + Azure WAF policy",
    },
    critical_note: "APIM requires minimum 30 minutes to provision — create before Logic App/Functions that depend on it",
    azure_resource: "Microsoft.ApiManagement/service",
  };
  changes.push("CAT-26: API Gateway detected — APIM migration block added (NOTE: 30+ min to provision)");
  return changes;
}

// ─── CAT-27: CodePipeline → Azure DevOps marker ──────────────────────────────
function cat27CodePipelineToDevOps(
  output: Record<string, unknown>,
  sourceStr: string
): string[] {
  const changes: string[] = [];
  const hasCodePipeline = /AWS::CodePipeline|CodeBuild|CodeDeploy/i.test(sourceStr);
  if (!hasCodePipeline) return changes;

  output["_CAT27_AZURE_DEVOPS_REQUIRED"] = {
    _note: "MIGRATION_REQUIRED: Source had CodePipeline. Generate Azure DevOps YAML pipeline.",
    stage_mapping: {
      "CodePipeline stage":  "Azure DevOps pipeline stage",
      "CodeBuild action":    "Azure DevOps build task",
      "CodeDeploy action":   "Azure DevOps deployment task",
      "S3 artifact store":   "Azure DevOps artifact feed",
    },
    prerequisite: "Azure DevOps organisation and project must exist before importing pipeline YAML",
    import_command: "az pipelines create --name 'MigratedPipeline' --yml-path azure-pipelines.yml --repository-type github",
  };
  changes.push("CAT-27: CodePipeline detected — Azure DevOps YAML pipeline block added");
  return changes;
}

// ─── CAT-28: DependsOn ordering ───────────────────────────────────────────────
function cat28DependsOnOrdering(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const actions = output.actions as Record<string, unknown> | undefined;
  if (!actions) return changes;

  // Build reference graph and verify all runAfter deps exist
  const allActions = flattenActions(actions);
  const actionNames = new Set(Object.keys(allActions));
  const missingDeps: string[] = [];

  for (const [name, action] of Object.entries(allActions)) {
    const a = action as Record<string, unknown>;
    const runAfter = a.runAfter as Record<string, string[]> | undefined;
    if (!runAfter) continue;
    for (const dep of Object.keys(runAfter)) {
      if (!actionNames.has(dep)) {
        missingDeps.push(`'${name}' depends on missing action '${dep}'`);
      }
    }
  }

  if (missingDeps.length > 0) {
    output["_CAT28_DEPENDENCY_ERRORS"] = {
      _note: "DEPENDENCY_ERRORS: The following runAfter dependencies reference missing actions",
      errors: missingDeps,
      resolution: "Add missing actions or correct runAfter references before deployment",
    };
    changes.push(`CAT-28: ${missingDeps.length} broken dependency reference(s) detected and flagged`);
  } else {
    changes.push("CAT-28: Dependency graph validated — all runAfter references resolve correctly");
  }
  return changes;
}

// ─── CAT-29: Multi-region / cost / ARM validation markers ─────────────────────
function cat29ProductionReadinessMarkers(
  output: Record<string, unknown>,
  sourceStr: string
): string[] {
  const changes: string[] = [];
  const markers: string[] = [];

  // Multi-region
  if (/StackSet|MultiRegion|us-east-1.*us-west|Route53.*Latency/i.test(sourceStr)) {
    markers.push("MULTI_REGION: Source deployed across multiple AWS regions. Generate Traffic Manager profile + Azure paired region resources.");
  }

  // Cost estimation placeholder
  output["_CAT29_COST_ESTIMATION"] = {
    _note: "Run cost estimation using Azure Retail Prices API before deployment",
    api_endpoint: "https://prices.azure.com/api/retail/prices",
    aws_comparison: "Compare with AWS Cost Explorer for source cost baseline",
    resources_to_estimate: ["Microsoft.Logic/workflows", "Microsoft.Web/sites", "Microsoft.DocumentDB/databaseAccounts"],
  };
  markers.push("COST_ESTIMATE_REQUIRED: Query Azure Retail Prices API for monthly cost projection");

  // ARM validation
  output["_CAT29_ARM_VALIDATION"] = {
    _note: "Validate ARM template before deployment",
    recommended_tool: "arm-ttk (ARM Template Toolkit)",
    command: "Invoke-ARMTTKTests -TemplatePath ./azuredeploy.json",
    what_if_command: "az deployment group what-if --resource-group {rg} --template-file azuredeploy.json",
  };
  markers.push("ARM_VALIDATION_REQUIRED: Run arm-ttk or az deployment what-if before deploying");

  if (markers.length > 0) {
    changes.push(`CAT-29: ${markers.length} production-readiness marker(s) added: ${markers.join("; ")}`);
  }
  return changes;
}

// ─── CAT-30: Rollback plan ────────────────────────────────────────────────────
import { generateRollbackPlan } from "./rollback-generator";

function cat30RollbackPlan(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const plan = generateRollbackPlan(output);

  output["_CAT30_ROLLBACK_PLAN"] = {
    _note: "Structured rollback plan — execute in reverse deployment order if rollback required",
    generated_at: plan.generatedAt,
    total_resources: plan.totalResources,
    estimated_total_rollback_minutes: plan.estimatedTotalRollbackMinutes,
    critical_warnings: plan.criticalWarnings,
    rollback_steps: plan.entries.map((e) => ({
      step: e.deploymentOrder,
      resource: e.resourceName,
      type: e.resourceType,
      stateful: e.stateful,
      action: e.rollbackAction,
      cli_command: e.azureCliCommand,
      estimated_minutes: e.estimatedMinutes,
      notes: e.notes,
    })),
  };

  changes.push(
    `CAT-30: Rollback plan generated — ${plan.totalResources} resource(s), ` +
    `estimated ${plan.estimatedTotalRollbackMinutes} min total, ` +
    `${plan.criticalWarnings.filter(w => w.includes("STATEFUL") || w.includes("CRITICAL")).length} stateful/critical resource(s) flagged`
  );
  return changes;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function applyMigrationPostProcessing(
  aiOutput: Record<string, unknown>,
  sourceAsl: Record<string, unknown>
): PostProcessResult {
  const output = deepClone(aiOutput);
  const sourceStr = JSON.stringify(sourceAsl);
  const allChanges: string[] = [];

  const run = (label: string, changes: string[]) => {
    if (changes.length > 0) allChanges.push(...changes);
    else allChanges.push(`${label}: no issues found`);
  };

  // ── Original 15 categories ─────────────────────────────────────────────────
  run("CAT-1",  cat1TriggerMigration(output, sourceAsl));
  run("CAT-2",  cat2BodyPassing(output));
  run("CAT-3",  cat3SsmReferences(output));
  run("CAT-4",  cat4S3Buckets(output));
  run("CAT-5",  cat5GlueIceberg(output, sourceStr));
  run("CAT-6",  cat6CloudWatchRefs(output));
  run("CAT-7",  cat7AwsServiceNames(output));
  run("CAT-8",  cat8AwsUrls(output));
  run("CAT-9",  cat9ContextVars(output));
  run("CAT-10", cat10AdfAuthentication(output));
  run("CAT-11", cat11AdfPolling(output));
  run("CAT-12", cat12SkippedRunAfter(output));
  run("CAT-13", cat13ForeachConcurrency(output, sourceStr));
  run("CAT-14", cat14CloudFrontUrls(output));
  run("CAT-15", cat15ParametersBlock(output));

  // ── New 15 categories (suggestions 16–30) ──────────────────────────────────
  run("CAT-16", cat16BedrockModelMapping(output));
  run("CAT-17", cat17DynamoStreamTrigger(output, sourceStr));
  run("CAT-18", cat18KinesisToEventHubs(output));
  run("CAT-19", cat19S3EventTrigger(output, sourceStr));
  run("CAT-20", cat20KmsToKeyVault(output));
  run("CAT-21", cat21CognitoToEntraB2C(output));
  run("CAT-22", cat22XRayToAppInsights(output, sourceStr));
  run("CAT-23", cat23CloudWatchAlarms(output, sourceStr));
  run("CAT-24", cat24GuardDutyToDefender(output, sourceStr));
  run("CAT-25", cat25VpcToVnet(output, sourceStr));
  run("CAT-26", cat26ApiGatewayToApim(output, sourceStr));
  run("CAT-27", cat27CodePipelineToDevOps(output, sourceStr));
  run("CAT-28", cat28DependsOnOrdering(output));
  run("CAT-29", cat29ProductionReadinessMarkers(output, sourceStr));
  run("CAT-30", cat30RollbackPlan(output));

  return { output, changesApplied: allChanges };
}
