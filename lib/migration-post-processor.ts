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

// ─── Main entry point ─────────────────────────────────────────────────────────

export function applyMigrationPostProcessing(
  aiOutput: Record<string, unknown>,
  sourceAsl: Record<string, unknown>
): PostProcessResult {
  // Deep clone so we never mutate the original
  const output = deepClone(aiOutput);
  const sourceStr = JSON.stringify(sourceAsl);
  const allChanges: string[] = [];

  const run = (label: string, changes: string[]) => {
    if (changes.length > 0) allChanges.push(...changes);
    else allChanges.push(`${label}: no issues found`);
  };

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

  return { output, changesApplied: allChanges };
}
