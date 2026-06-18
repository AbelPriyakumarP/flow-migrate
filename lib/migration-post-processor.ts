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

    if (maxC === 1) {
      a.operationOptions = "Sequential";
      changes.push(`CAT-13: '${name}' Foreach → Sequential (MaxConcurrency was 1)`);
    } else if (maxC !== undefined && maxC > 1) {
      a.runtimeConfiguration = {
        concurrency: { repetitions: maxC },
      };
      changes.push(`CAT-13: '${name}' Foreach → concurrency ${maxC} (from source MaxConcurrency)`);
    } else if (maxC === undefined || maxC === 0) {
      // No source match or unlimited — default to parallel (20 repetitions)
      const rt = a.runtimeConfiguration as Record<string, unknown> | undefined;
      const existingConc = rt?.concurrency as Record<string, unknown> | undefined;
      if (!a.operationOptions && !existingConc?.repetitions) {
        a.runtimeConfiguration = {
          ...(rt || {}),
          concurrency: { repetitions: 20 },
        };
        changes.push(`CAT-13: '${name}' Foreach → parallel (repetitions=20, no source MaxConcurrency)`);
      }
    }
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

// ─── CAT-31: Convert ADF/Glue/AWS actions to Databricks Jobs API ─────────────
function cat31ConvertToDatabricks(output: Record<string, unknown>): string[] {
  const changes: string[] = [];

  const params = (output.parameters || {}) as Record<string, unknown>;
  if (!params["databricksWorkspaceUrl"]) {
    params["databricksWorkspaceUrl"] = {
      type: "String", defaultValue: "",
      metadata: { description: "Azure Databricks workspace URL prefix (e.g., adb-1234567890123456.12)" },
    };
  }
  if (!params["databricksClusterId"]) {
    params["databricksClusterId"] = {
      type: "String", defaultValue: "",
      metadata: { description: "Databricks cluster ID for transform jobs" },
    };
  }
  output.parameters = params;

  const workspaceUri = "https://@{parameters('databricksWorkspaceUrl')}.azuredatabricks.net";
  const dbxAuth = { type: "ManagedServiceIdentity", audience: "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d" };

  function convertAndPoll(actions: Record<string, unknown>) {
    const silverNames: string[] = [];
    const goldNames: string[] = [];

    // First pass: identify and convert Silver/Gold actions
    for (const [name, action] of Object.entries(actions)) {
      const a = action as Record<string, unknown>;

      // Recurse into compound actions
      if (a.actions) convertAndPoll(a.actions as Record<string, unknown>);
      if (a.else && (a.else as Record<string, unknown>).actions)
        convertAndPoll((a.else as Record<string, unknown>).actions as Record<string, unknown>);

      const lower = name.toLowerCase();
      if (/silver/i.test(lower)) silverNames.push(name);
      if (/gold/i.test(lower)) goldNames.push(name);

      if (a.type !== "Http" && a.type !== "Function") continue;
      const inputs = a.inputs as Record<string, unknown> | undefined;
      if (!inputs) continue;

      const uri = ((inputs.uri as string) || "").toString();
      const bodyStr = JSON.stringify(inputs.body || "");

      const isAdf = /DataFactory|datafactory|pipelines.*createRun/i.test(uri);
      const isAws = /amazonaws\.com/i.test(uri) || /lambda.*invoke|glue.*startJobRun/i.test(uri);
      const isGlue = /glue/i.test(uri) || /glue/i.test(name) || /startJobRun/i.test(bodyStr);
      const isSilverGold = /silver|gold|transform|etl/i.test(name);
      const alreadyDatabricks = /azuredatabricks\.net/i.test(uri) && /jobs\/runs\/submit/i.test(uri);

      if ((isAdf || isAws || isGlue) && isSilverGold && !alreadyDatabricks) {
        const tier = /silver/i.test(name) ? "silver" : /gold/i.test(name) ? "gold" : "transform";
        const notebookPath = `/Workspace/transforms/${tier}/${name.toLowerCase().replace(/[\s]+/g, "_")}`;

        delete a["GAP_NOTICE"];
        delete a["_CAT11_POLLING_REQUIRED"];
        a.type = "Http";
        a.inputs = {
          method: "POST",
          uri: `${workspaceUri}/api/2.1/jobs/runs/submit`,
          headers: { "Content-Type": "application/json" },
          authentication: { ...dbxAuth },
          body: {
            run_name: `${name}_nightly`,
            tasks: [{
              task_key: name.toLowerCase().replace(/[\s]+/g, "_"),
              notebook_task: {
                notebook_path: notebookPath,
                base_parameters: { TABLE_FORMAT: "delta", CATALOG: "unity_catalog" },
              },
              existing_cluster_id: "@{parameters('databricksClusterId')}",
            }],
          },
        };
        changes.push(`CAT-31: '${name}' converted to Databricks Jobs API (${tier} tier)`);
      }
    }

    // Second pass: add polling chains for all Databricks-submitted actions
    const allTransforms = [...new Set([...silverNames, ...goldNames])];

    for (const name of allTransforms) {
      const a = actions[name] as Record<string, unknown>;
      if (!a || a.type !== "Http") continue;

      const inputs = a.inputs as Record<string, unknown> | undefined;
      const uri = ((inputs?.uri as string) || "").toString();
      if (!/azuredatabricks\.net.*jobs\/runs\/submit/i.test(uri)) continue;

      const pollName = `${name}_Poll`;
      const pollStatusName = `${name}_Poll_Status`;
      const resultCheckName = `${name}_Result_Check`;

      // Skip if polling already exists
      if (actions[pollName]) continue;

      // Insert Until polling loop
      actions[pollName] = {
        type: "Until",
        expression: `@or(equals(body('${pollStatusName}')?['state']?['life_cycle_state'], 'TERMINATED'), equals(body('${pollStatusName}')?['state']?['life_cycle_state'], 'INTERNAL_ERROR'), equals(body('${pollStatusName}')?['state']?['life_cycle_state'], 'SKIPPED'))`,
        limit: { count: 120, timeout: "PT2H" },
        actions: {
          [pollStatusName]: {
            type: "Http",
            inputs: {
              method: "GET",
              uri: `${workspaceUri}/api/2.1/jobs/runs/get?run_id=@{body('${name}')?['run_id']}`,
              authentication: { ...dbxAuth },
            },
            runAfter: {},
          },
          [`${name}_Poll_Delay`]: {
            type: "Wait",
            inputs: { interval: { count: 60, unit: "Second" } },
            runAfter: { [pollStatusName]: ["Succeeded"] },
          },
        },
        runAfter: { [name]: ["Succeeded"] },
      };

      // Insert result check
      actions[resultCheckName] = {
        type: "If",
        expression: {
          and: [{ equals: [`@body('${pollStatusName}')?['state']?['result_state']`, "SUCCESS"] }],
        },
        actions: {},
        else: {
          actions: {
            [`${name}_Failed_Terminate`]: {
              type: "Terminate",
              inputs: {
                runStatus: "Failed",
                runError: {
                  code: "DatabricksJobFailed",
                  message: `Databricks job '${name}' failed — check run @{body('${name}')?['run_id']}`,
                },
              },
              runAfter: {},
            },
          },
        },
        runAfter: { [pollName]: ["Succeeded"] },
      };

      // Rewire: anything that depended on this action now depends on result check
      for (const [otherName, otherAction] of Object.entries(actions)) {
        if (otherName === pollName || otherName === resultCheckName) continue;
        const oa = otherAction as Record<string, unknown>;
        const ra = oa.runAfter as Record<string, string[]> | undefined;
        if (!ra || !ra[name]) continue;
        if (ra[name].includes("Succeeded") && !ra[name].includes("Failed")) {
          delete ra[name];
          ra[resultCheckName] = ["Succeeded"];
        }
      }

      changes.push(`CAT-31: Added polling chain: '${name}' → '${pollName}' (60s interval, 2h timeout) → '${resultCheckName}'`);
    }

    // Ensure Gold depends on Silver result check (chain ordering)
    for (const silverName of silverNames) {
      const silverResultCheck = `${silverName}_Result_Check`;
      if (!actions[silverResultCheck]) continue;

      for (const goldName of goldNames) {
        const goldAction = actions[goldName] as Record<string, unknown>;
        if (!goldAction) continue;
        const ra = (goldAction.runAfter || {}) as Record<string, string[]>;

        // If Gold depends on Silver directly, rewire to Silver_Result_Check
        if (ra[silverName]) {
          delete ra[silverName];
          ra[silverResultCheck] = ["Succeeded"];
          goldAction.runAfter = ra;
          changes.push(`CAT-31: Wired '${goldName}' → depends on '${silverResultCheck}' (synchronous chain)`);
        }
        // If Gold has no dependency on Silver at all, add it
        if (!ra[silverResultCheck] && !ra[`${silverName}_Poll`]) {
          ra[silverResultCheck] = ["Succeeded"];
          goldAction.runAfter = ra;
          changes.push(`CAT-31: Linked '${goldName}' to wait for '${silverResultCheck}'`);
        }
      }
    }
  }

  const actions = output.actions as Record<string, unknown> | undefined;
  if (actions) convertAndPoll(actions);
  return changes;
}

// ─── CAT-32: Generate function names from action context ─────────────────────
function cat32GenerateFunctionNames(output: Record<string, unknown>): string[] {
  const changes: string[] = [];

  function processActions(actions: Record<string, unknown>) {
    for (const [name, action] of Object.entries(actions)) {
      const a = action as Record<string, unknown>;

      if (a.actions) processActions(a.actions as Record<string, unknown>);
      if (a.else && (a.else as Record<string, unknown>).actions)
        processActions((a.else as Record<string, unknown>).actions as Record<string, unknown>);

      if (a.type !== "Function") continue;
      const inputs = a.inputs as Record<string, unknown> | undefined;
      if (!inputs) continue;

      const funcName = inputs.functionName as string | undefined;
      if (funcName && /placeholder|your[-_]?function|function[-_]?name|TODO|REPLACE|sample[-_]?func|my[-_]?func|example[-_]?func|FUNCTION_NAME|lambda[-_]?handler/i.test(funcName)) {
        const derived = name.replace(/_/g, "-").replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
        inputs.functionName = derived;
        changes.push(`CAT-32: '${name}' placeholder function name '${funcName}' → '${derived}'`);
      }
    }
  }

  const actionBlock = output.actions as Record<string, unknown> | undefined;
  if (actionBlock) processActions(actionBlock);

  let fixCount = 0;
  const replaced = walkStrings(output, (value) => {
    let v = value;
    if (/\{SUB\}/.test(v)) { v = v.replace(/\{SUB\}/g, "@{parameters('subscriptionId')}"); fixCount++; }
    if (/\{RG\}/.test(v)) { v = v.replace(/\{RG\}/g, "@{parameters('resourceGroup')}"); fixCount++; }
    if (/\{APP\}/.test(v)) { v = v.replace(/\{APP\}/g, "@{parameters('appName')}"); fixCount++; }
    if (/\{ADF\}/.test(v)) { v = v.replace(/\{ADF\}/g, "@{parameters('adfFactoryName')}"); fixCount++; }
    if (/<subscription-id>/i.test(v)) { v = v.replace(/<subscription-id>/gi, "@{parameters('subscriptionId')}"); fixCount++; }
    if (/<resource-group>/i.test(v)) { v = v.replace(/<resource-group>/gi, "@{parameters('resourceGroup')}"); fixCount++; }
    if (/<app-name>/i.test(v)) { v = v.replace(/<app-name>/gi, "@{parameters('appName')}"); fixCount++; }
    if (/<function-app-name>/i.test(v)) { v = v.replace(/<function-app-name>/gi, "@{parameters('appName')}"); fixCount++; }
    if (/<your-subscription-id>/i.test(v)) { v = v.replace(/<your-subscription-id>/gi, "@{parameters('subscriptionId')}"); fixCount++; }
    if (/<your-resource-group>/i.test(v)) { v = v.replace(/<your-resource-group>/gi, "@{parameters('resourceGroup')}"); fixCount++; }
    if (/<your-app-name>/i.test(v)) { v = v.replace(/<your-app-name>/gi, "@{parameters('appName')}"); fixCount++; }
    if (/<your-function-name>/i.test(v)) { v = v.replace(/<your-function-name>/gi, "@{parameters('appName')}"); fixCount++; }
    if (v.includes("/providers/") && /TODO[_\s]?\w*/i.test(v)) { v = v.replace(/TODO[_\s]?\w*/gi, "@{parameters('appName')}"); fixCount++; }
    if (v.includes("/providers/") && /REPLACE_ME/i.test(v)) { v = v.replace(/REPLACE_ME/gi, "@{parameters('appName')}"); fixCount++; }
    if (v.includes("/providers/") && /PLACEHOLDER/i.test(v)) { v = v.replace(/PLACEHOLDER/gi, "@{parameters('appName')}"); fixCount++; }
    return v;
  }) as Record<string, unknown>;

  if (fixCount > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-32: ${fixCount} inline placeholder(s) replaced with @parameters() expressions`);
  }
  return changes;
}

// ─── CAT-33: QuickSight → Power BI Function-based refresh ───────────────────
function cat33QuickSightToPowerBI(output: Record<string, unknown>): string[] {
  const changes: string[] = [];

  const params = (output.parameters || {}) as Record<string, unknown>;
  if (!params["powerbiWorkspaceId"]) {
    params["powerbiWorkspaceId"] = {
      type: "String", defaultValue: "",
      metadata: { description: "Power BI workspace (group) ID for dataset refresh" },
    };
  }
  if (!params["powerbiDatasetId"]) {
    params["powerbiDatasetId"] = {
      type: "String", defaultValue: "",
      metadata: { description: "Power BI dataset ID to refresh" },
    };
  }
  output.parameters = params;

  function processActions(actions: Record<string, unknown>) {
    for (const [name, action] of Object.entries(actions)) {
      const a = action as Record<string, unknown>;

      if (a.actions) processActions(a.actions as Record<string, unknown>);
      if (a.else && (a.else as Record<string, unknown>).actions)
        processActions((a.else as Record<string, unknown>).actions as Record<string, unknown>);

      const inputs = a.inputs as Record<string, unknown> | undefined;
      const uri = ((inputs?.uri as string) || "").toString();

      const isQuickSight = /quicksight|quick_sight/i.test(name) || /quicksight/i.test(uri);
      const isPowerBIWithAws = /powerbi|power_bi|dashboard/i.test(name) && /amazonaws\.com/i.test(uri);

      if (isQuickSight || isPowerBIWithAws) {
        const savedRunAfter = a.runAfter;
        a.type = "Function";
        a.inputs = {
          function: {
            id: "/subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.Web/sites/@{parameters('appName')}/functions/RefreshPowerBIDataset",
          },
          body: {
            workspaceId: "@parameters('powerbiWorkspaceId')",
            datasetId: "@parameters('powerbiDatasetId')",
            runId: "@variables('runId')",
          },
          retryPolicy: {
            type: "exponential",
            count: 2,
            interval: "PT60S",
            minimumInterval: "PT30S",
            maximumInterval: "PT10M",
          },
        };
        if (savedRunAfter) a.runAfter = savedRunAfter;
        changes.push(`CAT-33: '${name}' converted to Power BI Function call (RefreshPowerBIDataset)`);
      }
    }
  }

  const actionBlock = output.actions as Record<string, unknown> | undefined;
  if (actionBlock) processActions(actionBlock);

  // Remove all QuickSight text references
  let textCount = 0;
  const replaced = walkStrings(output, (value) => {
    let v = value;
    if (/Amazon QuickSight/gi.test(v)) { v = v.replace(/Amazon QuickSight/gi, "Microsoft Power BI"); textCount++; }
    if (/\bQuickSight\b/gi.test(v)) { v = v.replace(/\bQuickSight\b/gi, "Power BI"); textCount++; }
    if (/quicksight/i.test(v) && v.length > 10) {
      v = v.replace(/quicksight[\s_-]*dashboard/gi, "Power BI report");
      v = v.replace(/quicksight[\s_-]*dataset/gi, "Power BI dataset");
      v = v.replace(/quicksight[\s_-]*analysis/gi, "Power BI report");
      v = v.replace(/quicksight[\s_-]*embed/gi, "Power BI embed");
      v = v.replace(/quicksight/gi, "Power BI");
      textCount++;
    }
    // Remove any QuickSight-specific parameters (dashboardId, analysisId)
    if (/quicksight_dashboard_id/gi.test(v)) { v = v.replace(/quicksight_dashboard_id/gi, "powerbi_report_id"); textCount++; }
    if (/quicksight_analysis_id/gi.test(v)) { v = v.replace(/quicksight_analysis_id/gi, "powerbi_report_id"); textCount++; }
    if (/dashboard_arn/gi.test(v)) { v = v.replace(/dashboard_arn/gi, "report_id"); textCount++; }
    return v;
  }) as Record<string, unknown>;

  if (textCount > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-33: ${textCount} QuickSight text/parameter reference(s) → Power BI`);
  }

  // Remove QuickSight-specific parameters from parameters block
  const pBlock = output.parameters as Record<string, unknown>;
  const qsParams = Object.keys(pBlock).filter(k => /quicksight/i.test(k));
  for (const qsKey of qsParams) {
    delete pBlock[qsKey];
    changes.push(`CAT-33: Removed QuickSight parameter '${qsKey}'`);
  }

  return changes;
}

// ─── CAT-34: Comprehensive AWS → Azure operational terminology ───────────────
function cat34AwsTerminology(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  let count = 0;

  const TERM_MAP: [RegExp, string][] = [
    // Core service names
    [/\bAWS Step Functions?\b/gi,      "Azure Logic Apps"],
    [/\bStep Functions?\b/gi,          "Logic Apps"],
    [/\bAWS Lambda\b/gi,              "Azure Functions"],
    [/\bLambda functions?\b/gi,        "Azure Functions"],
    [/\bLambda function\b/gi,          "Azure Function"],
    [/\bLambda\b(?!\s*[\(=])/g,        "Azure Function"],
    [/\bCloudWatch Alarm\b/gi,         "Azure Monitor Alert"],
    [/\bCloudWatch Logs?\b/gi,         "Azure Monitor Logs"],
    [/\bCloudWatch\b/gi,               "Azure Monitor"],
    [/\bSSM Parameter Store\b/gi,      "Azure App Configuration"],
    [/\bAWS SSM\b/gi,                 "Azure App Configuration"],
    [/\bParameter Store\b/gi,          "App Configuration"],
    [/\bAmazon S3\b/gi,               "Azure Data Lake Storage Gen2"],
    [/\bS3 bucket\b/gi,               "Storage container"],
    [/\bS3 key\b/gi,                   "blob path"],
    [/\bS3 object\b/gi,               "blob"],
    [/\bS3\b(?!\s*:\/\/)/g,           "ADLS Gen2"],
    [/\bAWS Glue\b/gi,               "Azure Databricks"],
    [/\bGlue\b(?!_catalog)/gi,        "Databricks"],
    // Identity & Security
    [/\bIAM role\b/gi,                "Managed Identity"],
    [/\bIAM policy\b/gi,              "Azure RBAC role assignment"],
    [/\bAWS IAM\b/gi,                 "Azure Managed Identities"],
    [/\bSecrets Manager\b/gi,          "Key Vault"],
    [/\bSecretsManager\b/gi,           "Key Vault"],
    [/\bAWS Secrets Manager\b/gi,      "Azure Key Vault"],
    // Operational terminology
    [/\bstate machine\b/gi,            "Logic App workflow"],
    [/\bstate_machine\b/gi,            "workflow"],
    [/\bexecution_arn\b/g,             "run_id"],
    [/\bexecution ARN\b/gi,            "workflow run ID"],
    [/\bExecutionArn\b/g,              "RunId"],
    [/\btask_token\b/g,                "callback_url"],
    [/\bTaskToken\b/g,                 "CallbackUrl"],
    // Infrastructure
    [/\bCloudFormation\b/gi,           "ARM Template"],
    [/\bEventBridge\b/gi,              "Event Grid"],
    [/\bCodeDeploy\b/gi,              "Azure DevOps"],
    [/\bCodePipeline\b/gi,            "Azure Pipelines"],
    [/\bCodeBuild\b/gi,               "Azure DevOps Build"],
    // Regions
    [/\bus-east-1\b/g,                "eastus"],
    [/\bus-east-2\b/g,                "eastus2"],
    [/\bus-west-1\b/g,                "westus"],
    [/\bus-west-2\b/g,                "westus2"],
    [/\beu-west-1\b/g,                "northeurope"],
    [/\beu-west-2\b/g,                "uksouth"],
    [/\beu-central-1\b/g,             "germanywestcentral"],
    [/\bap-southeast-1\b/g,           "southeastasia"],
    [/\bap-northeast-1\b/g,           "japaneast"],
    // CLI commands
    [/aws stepfunctions start-execution/gi,    "az logic workflow run trigger"],
    [/aws stepfunctions describe-execution/gi,  "az logic workflow run show"],
    [/aws stepfunctions list-executions/gi,     "az logic workflow run list"],
    [/aws lambda invoke/gi,                    "az functionapp function invoke"],
    [/aws lambda list-functions/gi,            "az functionapp function list"],
    [/aws s3 cp/gi,                            "az storage blob copy start"],
    [/aws s3 ls/gi,                            "az storage blob list"],
    [/aws s3 sync/gi,                          "azcopy sync"],
    [/aws cloudformation/gi,                   "az deployment group"],
    // Environment variables & credentials
    [/\baws_access_key/gi,            "azure_client_id"],
    [/\baws_secret_key/gi,            "azure_client_secret"],
    [/\bAWS_ACCESS_KEY[_A-Z]*/g,      "AZURE_CLIENT_ID"],
    [/\bAWS_SECRET[_A-Z]*/g,          "AZURE_CLIENT_SECRET"],
    [/\bAWS_REGION\b/g,               "AZURE_LOCATION"],
    [/\bAWS_DEFAULT_REGION\b/g,       "AZURE_LOCATION"],
    [/\baws_account_id\b/gi,          "azure_subscription_id"],
    [/\baws_region\b/gi,              "azure_location"],
    // General
    [/\bAWS console\b/gi,             "Azure portal"],
    [/\bAWS Console\b/g,              "Azure Portal"],
    [/\bAWS SDK\b/gi,                 "Azure SDK"],
    [/\bAWS API\b/gi,                 "Azure API"],
    [/\bAWS service\b/gi,             "Azure service"],
    [/\bAmazon Web Services\b/gi,      "Microsoft Azure"],
    [/\bAWS account\b/gi,             "Azure subscription"],
    // ARN patterns → Azure resource IDs
    [/arn:aws:states:[a-z0-9-]*:[0-9]*:stateMachine:[^\s"',}]*/gi,
      "/subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.Logic/workflows/@{parameters('appName')}"],
    [/arn:aws:lambda:[a-z0-9-]*:[0-9]*:function:[^\s"',}]*/gi,
      "/subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.Web/sites/@{parameters('appName')}"],
    [/arn:aws:s3:::[^\s"',}]*/gi,
      "https://@{parameters('storageAccountName')}.blob.core.windows.net"],
    [/arn:aws:sqs:[a-z0-9-]*:[0-9]*:[^\s"',}]*/gi,
      "/subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.ServiceBus/namespaces/@{parameters('serviceBusNamespace')}"],
    [/arn:aws:sns:[a-z0-9-]*:[0-9]*:[^\s"',}]*/gi,
      "/subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.EventGrid/topics/@{parameters('appName')}"],
  ];

  const replaced = walkStrings(output, (value) => {
    if (PRESERVE_PATTERNS.some((p) => p.test(value))) return value;
    if (value.length < 8) return value;

    let v = value;
    for (const [pattern, replacement] of TERM_MAP) {
      if (pattern.test(v)) {
        v = v.replace(pattern, replacement);
        count++;
      }
      pattern.lastIndex = 0;
    }
    return v;
  }) as Record<string, unknown>;

  if (count > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-34: ${count} AWS operational term(s)/artifact(s) replaced with Azure equivalents`);
  }
  return changes;
}

// ─── CAT-35: Full dynamic parameters block ──────────────────────────────────
function cat35DynamicParameters(output: Record<string, unknown>): string[] {
  const changes: string[] = [];

  if (!output.parameters) output.parameters = {};
  const params = output.parameters as Record<string, unknown>;

  const REQUIRED: Record<string, string> = {
    subscriptionId: "Azure subscription ID",
    resourceGroup: "Resource group name",
    appName: "Function App name",
    storageAccountName: "Storage account name (replacing AWS S3)",
    adfFactoryName: "Data Factory instance name",
    databricksWorkspaceUrl: "Databricks workspace URL prefix",
    databricksClusterId: "Databricks cluster ID for transform jobs",
    serviceBusNamespace: "Service Bus namespace (replacing AWS SNS/SQS)",
    powerbiWorkspaceId: "Power BI workspace (group) ID",
    powerbiDatasetId: "Power BI dataset ID to refresh",
    logAnalyticsWorkspaceId: "Log Analytics workspace ID (replacing CloudWatch)",
    containerNames: "Storage container names object (raw, staged, silver, gold)",
  };

  const added: string[] = [];
  for (const [key, desc] of Object.entries(REQUIRED)) {
    if (!params[key]) {
      if (key === "containerNames") {
        params[key] = {
          type: "Object",
          defaultValue: { raw: "raw", staged: "staged", silver: "silver", gold: "gold" },
          metadata: { description: desc },
        };
      } else {
        params[key] = {
          type: "String", defaultValue: "",
          metadata: { description: desc },
        };
      }
      added.push(key);
    }
  }

  if (added.length > 0)
    changes.push(`CAT-35: Added ${added.length} required parameter(s): ${added.join(", ")}`);

  // Sweep for hardcoded /subscriptions/SUB or /subscriptions/<literal-guid>
  let hardcodedCount = 0;
  const replaced = walkStrings(output, (value) => {
    let v = value;
    // Match /subscriptions/<literal-uuid> and replace with parameter
    const subUuidPattern = /\/subscriptions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    if (subUuidPattern.test(v)) {
      v = v.replace(subUuidPattern, "/subscriptions/@{parameters('subscriptionId')}");
      hardcodedCount++;
    }
    subUuidPattern.lastIndex = 0;

    // Match /resourceGroups/<literal-name> (not already parameterized)
    const rgLiteralPattern = /\/resourceGroups\/(?!@\{)([a-zA-Z0-9_-]{2,50})(?=\/)/g;
    if (rgLiteralPattern.test(v) && !v.includes("@{parameters('resourceGroup')}")) {
      v = v.replace(rgLiteralPattern, "/resourceGroups/@{parameters('resourceGroup')}");
      hardcodedCount++;
    }
    rgLiteralPattern.lastIndex = 0;

    return v;
  }) as Record<string, unknown>;

  if (hardcodedCount > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-35: ${hardcodedCount} hardcoded subscription/resource-group value(s) replaced with @parameters()`);
  }
  return changes;
}

// ─── CAT-36: Inject Managed Identity token acquisition action ────────────────
function cat36ManagedIdentityToken(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const actions = output.actions as Record<string, unknown> | undefined;
  if (!actions) return changes;

  // Check if token action already exists
  if (actions["Get_Managed_Identity_Token"]) return changes;

  // Find first action (no runAfter or empty runAfter) to wire it before
  const firstActions: string[] = [];
  for (const [name, action] of Object.entries(actions)) {
    const a = action as Record<string, unknown>;
    const ra = a.runAfter as Record<string, unknown> | undefined;
    if (!ra || Object.keys(ra).length === 0) {
      firstActions.push(name);
    }
  }

  // Insert the Managed Identity token acquisition action
  actions["Get_Managed_Identity_Token"] = {
    type: "Http",
    inputs: {
      method: "POST",
      uri: "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/",
      headers: { Metadata: "true" },
    },
    runAfter: {},
  };

  // Insert variable to store the token
  actions["Set_Access_Token"] = {
    type: "InitializeVariable",
    inputs: {
      variables: [{
        name: "accessToken",
        type: "string",
        value: "@{body('Get_Managed_Identity_Token')?['access_token']}",
      }],
    },
    runAfter: { Get_Managed_Identity_Token: ["Succeeded"] },
  };

  // Rewire first actions to depend on Set_Access_Token
  for (const name of firstActions) {
    const a = actions[name] as Record<string, unknown>;
    if (name === "Get_Managed_Identity_Token" || name === "Set_Access_Token") continue;
    a.runAfter = { Set_Access_Token: ["Succeeded"] };
  }

  changes.push("CAT-36: Injected Get_Managed_Identity_Token + Set_Access_Token at workflow start");

  // Add ManagedServiceIdentity auth to all HTTP actions calling Azure management APIs
  let authCount = 0;
  function addAuthToActions(acts: Record<string, unknown>) {
    for (const [name, action] of Object.entries(acts)) {
      const a = action as Record<string, unknown>;

      if (a.actions) addAuthToActions(a.actions as Record<string, unknown>);
      if (a.else && (a.else as Record<string, unknown>).actions)
        addAuthToActions((a.else as Record<string, unknown>).actions as Record<string, unknown>);

      if (name === "Get_Managed_Identity_Token") continue;
      if (a.type !== "Http") continue;

      const inputs = a.inputs as Record<string, unknown> | undefined;
      if (!inputs) continue;

      const uri = ((inputs.uri as string) || "").toString();
      const needsAuth =
        /management\.azure\.com/i.test(uri) ||
        /azuredatabricks\.net/i.test(uri) ||
        /api\.powerbi\.com/i.test(uri) ||
        /\.blob\.core\.windows\.net/i.test(uri) ||
        /\.servicebus\.windows\.net/i.test(uri) ||
        /\.azure-api\.net/i.test(uri) ||
        /vault\.azure\.net/i.test(uri);

      if (needsAuth && !inputs.authentication) {
        let audience = "https://management.azure.com/";
        if (/azuredatabricks\.net/i.test(uri)) audience = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d";
        else if (/api\.powerbi\.com/i.test(uri)) audience = "https://analysis.windows.net/powerbi/api";
        else if (/\.blob\.core\.windows\.net/i.test(uri)) audience = "https://storage.azure.com/";
        else if (/\.servicebus\.windows\.net/i.test(uri)) audience = "https://servicebus.azure.net/";
        else if (/vault\.azure\.net/i.test(uri)) audience = "https://vault.azure.net";

        inputs.authentication = { type: "ManagedServiceIdentity", audience };
        authCount++;
      }
    }
  }

  addAuthToActions(actions);

  if (authCount > 0)
    changes.push(`CAT-36: Added ManagedServiceIdentity authentication to ${authCount} HTTP action(s)`);

  // Remove any AWS IAM / hardcoded credential references
  let iamCount = 0;
  const replaced = walkStrings(output, (value) => {
    let v = value;
    if (/arn:aws:iam::[0-9]*:role\/[^\s"',}]*/gi.test(v)) {
      v = v.replace(/arn:aws:iam::[0-9]*:role\/[^\s"',}]*/gi, "ManagedServiceIdentity");
      iamCount++;
    }
    if (/\bAWS_ACCESS_KEY_ID\b/g.test(v)) { v = v.replace(/\bAWS_ACCESS_KEY_ID\b/g, "AZURE_CLIENT_ID"); iamCount++; }
    if (/\bAWS_SECRET_ACCESS_KEY\b/g.test(v)) { v = v.replace(/\bAWS_SECRET_ACCESS_KEY\b/g, "AZURE_CLIENT_SECRET"); iamCount++; }
    if (/\bAWS_SESSION_TOKEN\b/g.test(v)) { v = v.replace(/\bAWS_SESSION_TOKEN\b/g, "AZURE_FEDERATED_TOKEN"); iamCount++; }
    return v;
  }) as Record<string, unknown>;

  if (iamCount > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-36: ${iamCount} AWS IAM/credential reference(s) replaced with Azure Managed Identity equivalents`);
  }

  return changes;
}

// ─── CAT-37: S3 payload references → Azure Storage with parameters ───────────
function cat37S3ToAzureStorage(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  let count = 0;

  const replaced = walkStrings(output, (value) => {
    let v = value;

    // s3://bucket-name/path → https://storageaccount.blob.core.windows.net/container/path
    const s3UriPattern = /s3:\/\/([a-zA-Z0-9._-]+)\/([\S]*)/g;
    if (s3UriPattern.test(v)) {
      v = v.replace(s3UriPattern, "https://@{parameters('storageAccountName')}.blob.core.windows.net/$1/$2");
      count++;
    }
    s3UriPattern.lastIndex = 0;

    // s3_bucket / s3_key in payloads
    if (/\bs3_bucket\b/i.test(v)) { v = v.replace(/\bs3_bucket\b/gi, "storage_container"); count++; }
    if (/\bs3_key\b/i.test(v)) { v = v.replace(/\bs3_key\b/gi, "blob_path"); count++; }
    if (/\bbucket_name\b/i.test(v) && /s3|aws|bucket/i.test(v)) {
      v = v.replace(/\bbucket_name\b/gi, "container_name");
      count++;
    }

    // .s3.amazonaws.com URLs
    if (/\.s3\.amazonaws\.com/i.test(v)) {
      v = v.replace(/https?:\/\/([a-z0-9.-]+)\.s3\.amazonaws\.com/gi,
        "https://@{parameters('storageAccountName')}.blob.core.windows.net/$1");
      count++;
    }

    // s3.amazonaws.com/bucket URLs
    if (/s3\.amazonaws\.com\//i.test(v)) {
      v = v.replace(/https?:\/\/s3\.amazonaws\.com\/([a-z0-9.-]+)/gi,
        "https://@{parameters('storageAccountName')}.blob.core.windows.net/$1");
      count++;
    }

    return v;
  }) as Record<string, unknown>;

  if (count > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-37: ${count} S3 URI/payload reference(s) converted to Azure Storage with @parameters()`);
  }
  return changes;
}

// ─── CAT-38: Databricks Spark config AWS → Azure references ─────────────────
function cat38DatabricksSparkConfig(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  let count = 0;

  const SPARK_CONFIG_MAP: [RegExp, string][] = [
    // Full qualified class names — Catalog
    [/org\.apache\.delta\.aws\.Databricks\.GlueCatalog/g,
      "org.apache.delta.azure.Databricks.AdlsCatalog"],
    [/org\.apache\.iceberg\.aws\.glue\.GlueCatalog/g,
      "org.apache.delta.azure.Databricks.AdlsCatalog"],
    // Full qualified class names — FileIO
    [/org\.apache\.delta\.aws\.s3\.S3FileIO/g,
      "org.apache.delta.azure.adls.AdlsFileIO"],
    [/org\.apache\.iceberg\.aws\.s3\.S3FileIO/g,
      "org.apache.delta.azure.adls.AdlsFileIO"],
    // Short class name fragments (catch standalone references)
    [/\bGlueCatalog\b/g,              "AdlsCatalog"],
    [/\bglue_catalog\b/gi,            "unity_catalog"],
    [/\bGlue Catalog\b/gi,            "Unity Catalog"],
    [/\bGlue Data Catalog\b/gi,       "Unity Catalog"],
    [/\bS3FileIO\b/g,                 "AdlsFileIO"],
    [/\bs3FileIO\b/g,                 "adlsFileIO"],
    [/\bS3FileSystem\b/g,             "AdlsFileSystem"],
    // Glue catalog in Spark SQL config
    [/spark\.sql\.catalog\.glue_catalog/g,  "spark.sql.catalog.unity_catalog"],
    [/catalog-impl\s*=\s*org\.apache\.iceberg\.aws/g,
      "catalog-impl=org.apache.delta.azure"],
    [/glue\.GlueCatalog/gi,            "azure.Databricks.AdlsCatalog"],
    // Warehouse locations: s3:// → abfss://
    [/unity_catalog\.warehouse\s*=\s*s3:\/\/[^\s"',}]*/g,
      "unity_catalog.warehouse=abfss://@{parameters('silverContainerName')}@@{parameters('storageAccountName')}.dfs.core.windows.net/warehouse"],
    [/warehouse\s*=\s*s3:\/\/[^\s"',}]*/g,
      "warehouse=abfss://@{parameters('silverContainerName')}@@{parameters('storageAccountName')}.dfs.core.windows.net/warehouse"],
    [/warehouse\s*=\s*s3a:\/\/[^\s"',}]*/g,
      "warehouse=abfss://@{parameters('silverContainerName')}@@{parameters('storageAccountName')}.dfs.core.windows.net/warehouse"],
    // S3 file system in Spark/Hadoop config
    [/s3\.S3FileIO/g,                  "adls.AdlsFileIO"],
    [/fs\.s3a\./g,                     "fs.azure."],
    [/fs\.s3\./g,                      "fs.azure."],
    [/spark\.hadoop\.fs\.s3a/g,        "spark.hadoop.fs.azure"],
    [/spark\.hadoop\.fs\.s3/g,         "spark.hadoop.fs.azure"],
    // AWS credential config keys (Spark)
    [/spark\.hadoop\.fs\.s3a\.access\.key/g,   "spark.hadoop.fs.azure.account.key"],
    [/spark\.hadoop\.fs\.s3a\.secret\.key/g,   "spark.hadoop.fs.azure.account.key"],
    [/spark\.hadoop\.fs\.s3a\.endpoint/g,      "spark.hadoop.fs.azure.storage.endpoint"],
    // Iceberg extensions → Delta extensions
    [/org\.apache\.iceberg\.spark\.extensions\.IcebergSparkSessionExtensions/g,
      "io.delta.sql.DeltaSparkSessionExtension"],
    [/org\.apache\.iceberg\.spark\.SparkCatalog/g,
      "org.apache.delta.spark.SparkCatalog"],
    // Table format references
    [/\bformat\s*=\s*["']?iceberg["']?/gi, "format=delta"],
    [/\bApache Iceberg\b/gi,           "Delta Lake"],
    [/\biceberg format\b/gi,           "Delta Lake format"],
    [/\bwrite\.format\.default\s*=\s*iceberg/gi, "write.format.default=delta"],
    // AWS Glue connection references
    [/\bglue_connection\b/gi,          "unity_catalog_connection"],
    [/\bglue_database\b/gi,           "unity_catalog_schema"],
    [/\bglue_table\b/gi,              "unity_catalog_table"],
  ];

  const replaced = walkStrings(output, (value) => {
    let v = value;
    for (const [pattern, replacement] of SPARK_CONFIG_MAP) {
      if (pattern.test(v)) {
        v = v.replace(pattern, replacement);
        count++;
      }
      pattern.lastIndex = 0;
    }
    return v;
  }) as Record<string, unknown>;

  if (count > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-38: ${count} GlueCatalog/S3FileIO/Iceberg artifact(s) removed → AdlsCatalog/AdlsFileIO/Delta Lake`);
  }

  // Also scan action body objects for glue/S3 config keys
  let keyCount = 0;
  function cleanActionConfigs(actions: Record<string, unknown>) {
    for (const [name, action] of Object.entries(actions)) {
      const a = action as Record<string, unknown>;
      if (a.actions) cleanActionConfigs(a.actions as Record<string, unknown>);
      if (a.else && (a.else as Record<string, unknown>).actions)
        cleanActionConfigs((a.else as Record<string, unknown>).actions as Record<string, unknown>);

      const inputs = a.inputs as Record<string, unknown> | undefined;
      if (!inputs?.body || typeof inputs.body !== "object") continue;

      const body = inputs.body as Record<string, unknown>;
      // Check for tasks[].notebook_task.base_parameters with AWS references
      const tasks = body.tasks as Record<string, unknown>[] | undefined;
      if (Array.isArray(tasks)) {
        for (const task of tasks) {
          const nt = task.notebook_task as Record<string, unknown> | undefined;
          const bp = nt?.base_parameters as Record<string, unknown> | undefined;
          if (bp) {
            if (bp["CATALOG"] === "glue_catalog") { bp["CATALOG"] = "unity_catalog"; keyCount++; }
            if (bp["TABLE_FORMAT"] === "iceberg") { bp["TABLE_FORMAT"] = "delta"; keyCount++; }
            if (bp["FILE_IO"] && /S3FileIO/i.test(bp["FILE_IO"] as string)) {
              bp["FILE_IO"] = "org.apache.delta.azure.adls.AdlsFileIO"; keyCount++;
            }
          }
        }
      }

      // Check for spark_conf with AWS references
      const sparkConf = body.spark_conf as Record<string, unknown> | undefined;
      if (sparkConf) {
        for (const [key, val] of Object.entries(sparkConf)) {
          if (/glue|GlueCatalog/i.test(key) || /glue|GlueCatalog/i.test(val as string)) {
            delete sparkConf[key];
            const newKey = key.replace(/glue_catalog/gi, "unity_catalog").replace(/glue/gi, "unity");
            sparkConf[newKey] = (val as string).replace(/GlueCatalog/g, "AdlsCatalog").replace(/glue_catalog/gi, "unity_catalog");
            keyCount++;
          }
          if (/S3FileIO|s3a|s3\./i.test(key) || /S3FileIO|s3a/i.test(val as string)) {
            delete sparkConf[key];
            const newKey = key.replace(/s3a/g, "azure").replace(/s3/g, "azure");
            sparkConf[newKey] = (val as string).replace(/S3FileIO/g, "AdlsFileIO").replace(/s3a/g, "azure");
            keyCount++;
          }
        }
      }
    }
  }

  const actionBlock = output.actions as Record<string, unknown> | undefined;
  if (actionBlock) cleanActionConfigs(actionBlock);

  if (keyCount > 0)
    changes.push(`CAT-38: ${keyCount} Glue/S3 config key(s) in action bodies cleaned → Unity Catalog/ADLS`);

  // Ensure silverContainerName parameter exists
  const params = (output.parameters || {}) as Record<string, unknown>;
  if (!params["silverContainerName"]) {
    params["silverContainerName"] = {
      type: "String", defaultValue: "silver",
      metadata: { description: "ADLS Gen2 container name for silver tier data" },
    };
    output.parameters = params;
    changes.push("CAT-38: Added silverContainerName parameter for ADLS warehouse path");
  }

  return changes;
}

// ─── CAT-39: AWS CLI → Azure CLI + AWS Console → Azure Portal URLs ──────────
function cat39CliAndConsoleUrls(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  let count = 0;

  const CLI_MAP: [RegExp, string][] = [
    // S3 commands
    [/aws\s+s3\s+ls\b/gi,                                  "az storage blob list"],
    [/aws\s+s3\s+cp\b/gi,                                  "az storage blob copy"],
    [/aws\s+s3\s+sync\b/gi,                                "az storage blob sync"],
    [/aws\s+s3\s+rm\b/gi,                                  "az storage blob delete"],
    [/aws\s+s3\s+mb\b/gi,                                  "az storage container create"],
    [/aws\s+s3\s+rb\b/gi,                                  "az storage container delete"],
    [/aws\s+s3api\s+put-object/gi,                          "az storage blob upload"],
    [/aws\s+s3api\s+get-object/gi,                          "az storage blob download"],
    [/aws\s+s3api\s+list-objects/gi,                        "az storage blob list"],
    // CloudWatch / Logs
    [/aws\s+logs\s+describe-log-groups/gi,                  "az monitor log-analytics workspace show"],
    [/aws\s+logs\s+get-log-events/gi,                       "az monitor log-analytics query"],
    [/aws\s+logs\s+filter-log-events/gi,                    "az monitor log-analytics query"],
    [/aws\s+logs\s+create-log-group/gi,                     "az monitor log-analytics workspace create"],
    [/aws\s+cloudwatch\s+put-metric-data/gi,                "az monitor metrics create"],
    [/aws\s+cloudwatch\s+get-metric-data/gi,                "az monitor metrics list"],
    // Step Functions
    [/aws\s+stepfunctions\s+start-execution/gi,             "az logic workflow run trigger"],
    [/aws\s+stepfunctions\s+describe-execution/gi,          "az logic workflow run show"],
    [/aws\s+stepfunctions\s+list-executions/gi,             "az logic workflow run list"],
    [/aws\s+stepfunctions\s+stop-execution/gi,              "az logic workflow run cancel"],
    // Lambda
    [/aws\s+lambda\s+invoke/gi,                             "az functionapp function invoke"],
    [/aws\s+lambda\s+list-functions/gi,                     "az functionapp function list"],
    [/aws\s+lambda\s+update-function-code/gi,               "az functionapp deployment source config-zip"],
    // AppConfig / SSM
    [/aws\s+appconfig\s+get-configuration/gi,               "az appconfig kv show"],
    [/aws\s+appconfig\s+start-deployment/gi,                "az appconfig kv set"],
    [/aws\s+ssm\s+get-parameter/gi,                         "az appconfig kv show"],
    [/aws\s+ssm\s+put-parameter/gi,                         "az appconfig kv set"],
    // Glue
    [/aws\s+glue\s+start-job-run/gi,                        "az databricks jobs run-now"],
    [/aws\s+glue\s+get-job-run/gi,                          "az databricks jobs get-run"],
    // Secrets Manager
    [/aws\s+secretsmanager\s+get-secret-value/gi,           "az keyvault secret show"],
    [/aws\s+secretsmanager\s+create-secret/gi,              "az keyvault secret set"],
  ];

  const CONSOLE_URL_MAP: [RegExp, string][] = [
    // Generic AWS console
    [/https?:\/\/console\.aws\.amazon\.com\/states[^\s"']*/gi,
      "https://portal.azure.com/#blade/Microsoft_Azure_Logic"],
    [/https?:\/\/console\.aws\.amazon\.com\/lambda[^\s"']*/gi,
      "https://portal.azure.com/#blade/Microsoft_Azure_Functions"],
    [/https?:\/\/console\.aws\.amazon\.com\/s3[^\s"']*/gi,
      "https://portal.azure.com/#blade/Microsoft_Azure_Storage"],
    [/https?:\/\/console\.aws\.amazon\.com\/cloudwatch[^\s"']*/gi,
      "https://monitor.azure.com"],
    [/https?:\/\/console\.aws\.amazon\.com\/glue[^\s"']*/gi,
      "https://portal.azure.com/#blade/Microsoft_Azure_Databricks"],
    [/https?:\/\/console\.aws\.amazon\.com\/quicksight[^\s"']*/gi,
      "https://app.powerbi.com"],
    [/https?:\/\/console\.aws\.amazon\.com\/secretsmanager[^\s"']*/gi,
      "https://portal.azure.com/#blade/Microsoft_Azure_KeyVault"],
    [/https?:\/\/console\.aws\.amazon\.com[^\s"']*/gi,
      "https://portal.azure.com"],
    // Text references
    [/\bAWS Management Console\b/gi,  "Azure Portal (portal.azure.com)"],
    [/\bS3 Console\b/gi,              "Storage Browser (portal.azure.com/#blade/Microsoft_Azure_Storage)"],
    [/\bLambda Console\b/gi,           "Function App (portal.azure.com/#blade/Microsoft_Azure_Functions)"],
    [/\bCloudWatch Console\b/gi,       "Azure Monitor (monitor.azure.com)"],
  ];

  const replaced = walkStrings(output, (value) => {
    let v = value;

    for (const [pattern, replacement] of CLI_MAP) {
      if (pattern.test(v)) {
        v = v.replace(pattern, replacement);
        count++;
      }
      pattern.lastIndex = 0;
    }

    for (const [pattern, replacement] of CONSOLE_URL_MAP) {
      if (pattern.test(v)) {
        v = v.replace(pattern, replacement);
        count++;
      }
      pattern.lastIndex = 0;
    }

    return v;
  }) as Record<string, unknown>;

  if (count > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-39: ${count} AWS CLI command(s)/console URL(s) → Azure CLI/Portal equivalents`);
  }
  return changes;
}

// ─── CAT-40: Retry policies on all external HTTP/Function calls ─────────────
function cat40RetryPolicies(output: Record<string, unknown>): string[] {
  const changes: string[] = [];

  const STANDARD_RETRY = {
    type: "exponential",
    count: 3,
    interval: "PT30S",
    minimumInterval: "PT10S",
    maximumInterval: "PT5M",
  };

  function isExternalCall(a: Record<string, unknown>): boolean {
    if (a.type === "Function") return true;
    if (a.type !== "Http") return false;
    const inputs = a.inputs as Record<string, unknown> | undefined;
    const uri = ((inputs?.uri as string) || "").toString();
    return (
      /management\.azure\.com/i.test(uri) ||
      /azuredatabricks\.net/i.test(uri) ||
      /api\.powerbi\.com/i.test(uri) ||
      /\.blob\.core\.windows\.net/i.test(uri) ||
      /\.servicebus\.windows\.net/i.test(uri) ||
      /DataFactory/i.test(uri) ||
      /\.azurewebsites\.net/i.test(uri) ||
      /\.azure-api\.net/i.test(uri) ||
      /vault\.azure\.net/i.test(uri) ||
      uri.includes("@{parameters(")
    );
  }

  let retryCount = 0;
  function processActions(actions: Record<string, unknown>) {
    for (const [name, action] of Object.entries(actions)) {
      const a = action as Record<string, unknown>;

      if (a.actions) processActions(a.actions as Record<string, unknown>);
      if (a.else && (a.else as Record<string, unknown>).actions)
        processActions((a.else as Record<string, unknown>).actions as Record<string, unknown>);

      // Skip internal actions (token acquisition, polling delays)
      if (name === "Get_Managed_Identity_Token") continue;
      if (/Poll_Delay$/i.test(name)) continue;

      if (!isExternalCall(a)) continue;

      const inputs = a.inputs as Record<string, unknown> | undefined;
      if (!inputs) continue;

      // Only add if no retry policy exists yet
      if (!inputs.retryPolicy) {
        inputs.retryPolicy = { ...STANDARD_RETRY };
        retryCount++;
      }
    }
  }

  const actionBlock = output.actions as Record<string, unknown> | undefined;
  if (actionBlock) processActions(actionBlock);

  if (retryCount > 0)
    changes.push(`CAT-40: Added exponential retry policy (3 retries, 30s–5m) to ${retryCount} external HTTP/Function action(s)`);

  return changes;
}

// ─── CAT-41: Service Bus dead-letter handling on retry exhaustion ────────────
function cat41DeadLetterHandling(output: Record<string, unknown>): string[] {
  const changes: string[] = [];

  const params = (output.parameters || {}) as Record<string, unknown>;
  if (!params["serviceBusNamespace"]) {
    params["serviceBusNamespace"] = {
      type: "String", defaultValue: "",
      metadata: { description: "Service Bus namespace for dead-letter queue" },
    };
    output.parameters = params;
  }
  if (!params["deadLetterQueueName"]) {
    params["deadLetterQueueName"] = {
      type: "String", defaultValue: "migration-dead-letter",
      metadata: { description: "Dead-letter queue name for failed messages after retry exhaustion" },
    };
    output.parameters = params;
  }

  const actionBlock = output.actions as Record<string, unknown> | undefined;
  if (!actionBlock) return changes;

  // Find actions that are external HTTP calls (candidates for dead-letter on failure)
  const candidateActions: string[] = [];
  function findCandidates(actions: Record<string, unknown>, prefix: string) {
    for (const [name, action] of Object.entries(actions)) {
      const a = action as Record<string, unknown>;
      if (a.type === "Http" || a.type === "Function") {
        const inputs = a.inputs as Record<string, unknown> | undefined;
        if (inputs?.retryPolicy) {
          candidateActions.push(prefix ? `${prefix}.${name}` : name);
        }
      }
      if (a.actions) findCandidates(a.actions as Record<string, unknown>, prefix ? `${prefix}.${name}` : name);
    }
  }
  findCandidates(actionBlock, "");

  // Ensure failedSources variable initialization exists
  if (!actionBlock["Initialize_Failed_Sources"]) {
    actionBlock["Initialize_Failed_Sources"] = {
      type: "InitializeVariable",
      inputs: {
        variables: [{
          name: "failedSources",
          type: "array",
          value: [],
        }],
      },
      runAfter: actionBlock["Set_Access_Token"]
        ? { Set_Access_Token: ["Succeeded"] }
        : {},
    };

    // Rewire first actions that depend on Set_Access_Token to depend on Initialize_Failed_Sources
    if (actionBlock["Set_Access_Token"]) {
      for (const [name, action] of Object.entries(actionBlock)) {
        if (name === "Initialize_Failed_Sources" || name === "Set_Access_Token" || name === "Get_Managed_Identity_Token") continue;
        const a = action as Record<string, unknown>;
        const ra = a.runAfter as Record<string, string[]> | undefined;
        if (ra?.["Set_Access_Token"]) {
          delete ra["Set_Access_Token"];
          ra["Initialize_Failed_Sources"] = ["Succeeded"];
        }
      }
    }

    changes.push("CAT-41: Added Initialize_Failed_Sources variable at workflow start");
  }

  // Add dead-letter error handler for root-level HTTP/Function actions
  let dlqCount = 0;
  const rootActions = Object.keys(actionBlock);
  for (const name of rootActions) {
    const a = actionBlock[name] as Record<string, unknown>;
    if (a.type !== "Http" && a.type !== "Function") continue;
    if (name === "Get_Managed_Identity_Token") continue;

    const inputs = a.inputs as Record<string, unknown> | undefined;
    if (!inputs?.retryPolicy) continue;

    const dlqHandlerName = `${name}_Dead_Letter`;
    if (actionBlock[dlqHandlerName]) continue;

    actionBlock[dlqHandlerName] = {
      type: "Http",
      inputs: {
        method: "POST",
        uri: "https://@{parameters('serviceBusNamespace')}.servicebus.windows.net/@{parameters('deadLetterQueueName')}/messages",
        headers: { "Content-Type": "application/json" },
        authentication: { type: "ManagedServiceIdentity", audience: "https://servicebus.azure.net/" },
        body: {
          source: name,
          failedAt: "@{utcNow()}",
          workflowRunId: "@{workflow()?['run']?['name']}",
          error: `@{result('${name}')?[0]?['error']?['message']}`,
        },
        retryPolicy: { type: "fixed", count: 2, interval: "PT10S" },
      },
      runAfter: { [name]: ["Failed", "TimedOut"] },
    };

    // Also append to failedSources
    const appendName = `${name}_Append_Failed`;
    if (!actionBlock[appendName]) {
      actionBlock[appendName] = {
        type: "AppendToArrayVariable",
        inputs: {
          name: "failedSources",
          value: `@{json(concat('{"action":"${name}","error":"', replace(string(result('${name}')?[0]?['error']?['message']), '"', '\\"'), '"}'))}`,
        },
        runAfter: { [dlqHandlerName]: ["Succeeded", "Failed"] },
      };
    }

    dlqCount++;
  }

  if (dlqCount > 0)
    changes.push(`CAT-41: Added dead-letter queue handlers + failedSources tracking for ${dlqCount} action(s)`);

  return changes;
}

// ─── CAT-42: Azure Monitor integration (logging, metrics, alerts) ───────────
function cat42AzureMonitorIntegration(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const actionBlock = output.actions as Record<string, unknown> | undefined;
  if (!actionBlock) return changes;

  // Ensure required parameters
  const params = (output.parameters || {}) as Record<string, unknown>;
  if (!params["logAnalyticsWorkspaceId"]) {
    params["logAnalyticsWorkspaceId"] = {
      type: "String", defaultValue: "",
      metadata: { description: "Log Analytics workspace ID for pipeline event tracking" },
    };
  }
  if (!params["alertServiceBusNamespace"]) {
    params["alertServiceBusNamespace"] = {
      type: "String", defaultValue: "",
      metadata: { description: "Service Bus namespace for alert topics" },
    };
  }
  output.parameters = params;

  // ── RULE 2: Track execution metrics — add runId + startTime variables ──────
  if (!actionBlock["Initialize_RunId"]) {
    actionBlock["Initialize_RunId"] = {
      type: "InitializeVariable",
      inputs: {
        variables: [{
          name: "runId",
          type: "string",
          value: "@{workflow()?['run']?['name']}",
        }],
      },
      runAfter: actionBlock["Initialize_Failed_Sources"]
        ? { Initialize_Failed_Sources: ["Succeeded"] }
        : actionBlock["Set_Access_Token"]
          ? { Set_Access_Token: ["Succeeded"] }
          : {},
    };
    changes.push("CAT-42: Added Initialize_RunId variable");
  }

  if (!actionBlock["Initialize_StartTime"]) {
    actionBlock["Initialize_StartTime"] = {
      type: "InitializeVariable",
      inputs: {
        variables: [{
          name: "startTime",
          type: "string",
          value: "@{utcNow()}",
        }],
      },
      runAfter: { Initialize_RunId: ["Succeeded"] },
    };
    changes.push("CAT-42: Added Initialize_StartTime variable");
  }

  // Rewire actions that depended on Initialize_Failed_Sources or Set_Access_Token
  // to depend on Initialize_StartTime instead
  const predecessors = ["Initialize_Failed_Sources", "Set_Access_Token"];
  for (const [name, action] of Object.entries(actionBlock)) {
    if (name === "Initialize_RunId" || name === "Initialize_StartTime" ||
        name === "Initialize_Failed_Sources" || name === "Set_Access_Token" ||
        name === "Get_Managed_Identity_Token") continue;
    const a = action as Record<string, unknown>;
    const ra = a.runAfter as Record<string, string[]> | undefined;
    if (!ra) continue;
    for (const pred of predecessors) {
      if (ra[pred] && !ra["Initialize_StartTime"]) {
        delete ra[pred];
        ra["Initialize_StartTime"] = ["Succeeded"];
      }
    }
  }

  // ── RULE 1: Add LogPipelineEvent at workflow start ─────────────────────────
  if (!actionBlock["Log_Pipeline_Start"]) {
    actionBlock["Log_Pipeline_Start"] = {
      type: "Function",
      inputs: {
        function: {
          id: "/subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.Web/sites/@{parameters('appName')}/functions/LogPipelineEvent",
        },
        body: {
          runId: "@variables('runId')",
          step: "PipelineStart",
          status: "Running",
          timestamp: "@{utcNow()}",
          parameters: "@parameters()",
          workflowName: "@{workflow()?['name']}",
        },
      },
      runAfter: { Initialize_StartTime: ["Succeeded"] },
    };
    changes.push("CAT-42: Added Log_Pipeline_Start (LogPipelineEvent function)");

    // Rewire actions that depended on Initialize_StartTime to depend on Log_Pipeline_Start
    for (const [name, action] of Object.entries(actionBlock)) {
      if (name === "Log_Pipeline_Start" || name === "Initialize_RunId" ||
          name === "Initialize_StartTime" || name === "Initialize_Failed_Sources" ||
          name === "Set_Access_Token" || name === "Get_Managed_Identity_Token") continue;
      const a = action as Record<string, unknown>;
      const ra = a.runAfter as Record<string, string[]> | undefined;
      if (ra?.["Initialize_StartTime"]) {
        delete ra["Initialize_StartTime"];
        ra["Log_Pipeline_Start"] = ["Succeeded"];
      }
    }
  }

  // ── Find the last action(s) in the workflow to wire completion logging ─────
  const allActionNames = new Set(Object.keys(actionBlock));
  const dependedOn = new Set<string>();
  for (const [, action] of Object.entries(actionBlock)) {
    const a = action as Record<string, unknown>;
    const ra = a.runAfter as Record<string, string[]> | undefined;
    if (ra) {
      for (const dep of Object.keys(ra)) dependedOn.add(dep);
    }
  }
  const terminalActions = [...allActionNames].filter(n =>
    !dependedOn.has(n) &&
    n !== "Log_Pipeline_Success" && n !== "Log_Pipeline_Failed" &&
    n !== "Alert_Success" && n !== "Alert_Critical_Failure" &&
    !/^Log_Pipeline_/.test(n) && !/^Alert_/.test(n) &&
    !/Dead_Letter$/.test(n) && !/Append_Failed$/.test(n)
  );

  // ── RULE 2 + RULE 1: Log success with metrics at workflow end ─────────────
  if (!actionBlock["Log_Pipeline_Success"] && terminalActions.length > 0) {
    const successRunAfter: Record<string, string[]> = {};
    for (const t of terminalActions) successRunAfter[t] = ["Succeeded"];

    actionBlock["Log_Pipeline_Success"] = {
      type: "Function",
      inputs: {
        function: {
          id: "/subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.Web/sites/@{parameters('appName')}/functions/LogPipelineEvent",
        },
        body: {
          runId: "@variables('runId')",
          step: "PipelineComplete",
          status: "Succeeded",
          timestamp: "@{utcNow()}",
          startTime: "@variables('startTime')",
          endTime: "@{utcNow()}",
          durationSeconds: "@{div(sub(ticks(utcNow()), ticks(variables('startTime'))), 10000000)}",
          workflowName: "@{workflow()?['name']}",
        },
      },
      runAfter: successRunAfter,
    };
    changes.push("CAT-42: Added Log_Pipeline_Success with execution metrics (duration, timestamps)");
  }

  // ── Log failure with error details ─────────────────────────────────────────
  if (!actionBlock["Log_Pipeline_Failed"] && terminalActions.length > 0) {
    const failedRunAfter: Record<string, string[]> = {};
    for (const t of terminalActions) failedRunAfter[t] = ["Failed", "TimedOut"];

    actionBlock["Log_Pipeline_Failed"] = {
      type: "Function",
      inputs: {
        function: {
          id: "/subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.Web/sites/@{parameters('appName')}/functions/LogPipelineEvent",
        },
        body: {
          runId: "@variables('runId')",
          step: "PipelineComplete",
          status: "Failed",
          timestamp: "@{utcNow()}",
          startTime: "@variables('startTime')",
          endTime: "@{utcNow()}",
          durationSeconds: "@{div(sub(ticks(utcNow()), ticks(variables('startTime'))), 10000000)}",
          workflowName: "@{workflow()?['name']}",
          failedSources: "@variables('failedSources')",
          errorDetails: "@{workflow()?['run']?['error']}",
        },
      },
      runAfter: failedRunAfter,
    };
    changes.push("CAT-42: Added Log_Pipeline_Failed with error details and failed sources");
  }

  // ── RULE 3: Service Bus alert topics ──────────────────────────────────────
  if (!actionBlock["Alert_Success"] && actionBlock["Log_Pipeline_Success"]) {
    actionBlock["Alert_Success"] = {
      type: "Http",
      inputs: {
        method: "POST",
        uri: "https://@{parameters('alertServiceBusNamespace')}.servicebus.windows.net/alert-success/messages",
        headers: { "Content-Type": "application/json", "BrokerProperties": "{}" },
        authentication: { type: "ManagedServiceIdentity", audience: "https://servicebus.azure.net/" },
        body: {
          runId: "@variables('runId')",
          logicAppName: "@{workflow()?['name']}",
          status: "Succeeded",
          durationSeconds: "@{div(sub(ticks(utcNow()), ticks(variables('startTime'))), 10000000)}",
          timestamp: "@{utcNow()}",
          message: "Pipeline completed successfully",
        },
      },
      runAfter: { Log_Pipeline_Success: ["Succeeded"] },
    };
    changes.push("CAT-42: Added Alert_Success → Service Bus topic 'alert-success'");
  }

  if (!actionBlock["Alert_Critical_Failure"] && actionBlock["Log_Pipeline_Failed"]) {
    actionBlock["Alert_Critical_Failure"] = {
      type: "Http",
      inputs: {
        method: "POST",
        uri: "https://@{parameters('alertServiceBusNamespace')}.servicebus.windows.net/alert-developer/messages",
        headers: { "Content-Type": "application/json", "BrokerProperties": "{}" },
        authentication: { type: "ManagedServiceIdentity", audience: "https://servicebus.azure.net/" },
        body: {
          runId: "@variables('runId')",
          logicAppName: "@{workflow()?['name']}",
          status: "Failed",
          durationSeconds: "@{div(sub(ticks(utcNow()), ticks(variables('startTime'))), 10000000)}",
          timestamp: "@{utcNow()}",
          failedSources: "@variables('failedSources')",
          errorDetails: "@{workflow()?['run']?['error']}",
          severity: "Critical",
          message: "Pipeline failed — immediate attention required",
        },
      },
      runAfter: { Log_Pipeline_Failed: ["Succeeded", "Failed"] },
    };
    changes.push("CAT-42: Added Alert_Critical_Failure → Service Bus topic 'alert-developer'");
  }

  // ── Add per-action logging for key pipeline steps ──────────────────────────
  let stepLogCount = 0;
  const keyStepPatterns = /ingest|transform|silver|gold|validation|quality|remediation|profiling|dashboard|notify|cti|scanner/i;
  const rootActionNames = Object.keys(actionBlock);
  for (const name of rootActionNames) {
    if (!keyStepPatterns.test(name)) continue;
    if (/^Log_|^Alert_|^Initialize_|^Set_|^Get_Managed/i.test(name)) continue;

    const logName = `Log_Step_${name}`;
    if (actionBlock[logName]) continue;

    const a = actionBlock[name] as Record<string, unknown>;
    if (!a.type) continue;

    // Add a warning-level alert for non-critical step failures
    const warnName = `Alert_Warning_${name}`;
    if (!actionBlock[warnName] && !/_Dead_Letter$/.test(name) && !/_Append_Failed$/.test(name)) {
      actionBlock[warnName] = {
        type: "Http",
        inputs: {
          method: "POST",
          uri: "https://@{parameters('alertServiceBusNamespace')}.servicebus.windows.net/alert-warnings/messages",
          headers: { "Content-Type": "application/json", "BrokerProperties": "{}" },
          authentication: { type: "ManagedServiceIdentity", audience: "https://servicebus.azure.net/" },
          body: {
            runId: "@variables('runId')",
            logicAppName: "@{workflow()?['name']}",
            step: name,
            status: "Warning",
            timestamp: "@{utcNow()}",
            message: `Step '${name}' failed — non-critical, workflow continuing`,
          },
        },
        runAfter: { [name]: ["Failed"] },
      };
      stepLogCount++;
    }
  }

  if (stepLogCount > 0)
    changes.push(`CAT-42: Added ${stepLogCount} per-step warning alert(s) → Service Bus topic 'alert-warnings'`);

  return changes;
}

// ─── CAT-43: ADLS Gen2 consistent storage paths with container parameters ───
function cat43AdlsStoragePaths(output: Record<string, unknown>): string[] {
  const changes: string[] = [];

  // Ensure all container name parameters exist
  const params = (output.parameters || {}) as Record<string, unknown>;
  const CONTAINER_PARAMS: Record<string, { default: string; desc: string }> = {
    rawContainerName: { default: "raw", desc: "ADLS Gen2 container for raw/bronze data" },
    stagedContainerName: { default: "staged", desc: "ADLS Gen2 container for staged/bronze data" },
    silverContainerName: { default: "silver", desc: "ADLS Gen2 container for silver tier data" },
    goldContainerName: { default: "gold", desc: "ADLS Gen2 container for gold tier data" },
    storageAccountName: { default: "", desc: "Azure Storage account name for ADLS Gen2" },
  };

  const addedParams: string[] = [];
  for (const [key, meta] of Object.entries(CONTAINER_PARAMS)) {
    if (!params[key]) {
      params[key] = {
        type: "String", defaultValue: meta.default,
        metadata: { description: meta.desc },
      };
      addedParams.push(key);
    }
  }
  output.parameters = params;

  if (addedParams.length > 0)
    changes.push(`CAT-43: Added container parameters: ${addedParams.join(", ")}`);

  // Replace hardcoded S3 bucket names and AWS-style container references
  let count = 0;
  const BUCKET_MAP: [RegExp, string][] = [
    // bronze-raw-{account} patterns
    [/bronze[-_]raw[-_][a-zA-Z0-9_-]*/gi,    "@{parameters('rawContainerName')}"],
    [/raw[-_]data[-_][a-zA-Z0-9_-]*/gi,       "@{parameters('rawContainerName')}"],
    [/\braw[-_]bucket\b/gi,                    "@{parameters('rawContainerName')}"],
    [/\braw[-_]container\b/gi,                 "@{parameters('rawContainerName')}"],
    // bronze-staged-{account} patterns
    [/bronze[-_]staged[-_][a-zA-Z0-9_-]*/gi,  "@{parameters('stagedContainerName')}"],
    [/staged[-_]data[-_][a-zA-Z0-9_-]*/gi,    "@{parameters('stagedContainerName')}"],
    [/\bstaged[-_]bucket\b/gi,                 "@{parameters('stagedContainerName')}"],
    [/\bstaged[-_]container\b/gi,              "@{parameters('stagedContainerName')}"],
    // silver-master-{account} patterns
    [/silver[-_]master[-_][a-zA-Z0-9_-]*/gi,  "@{parameters('silverContainerName')}"],
    [/silver[-_]data[-_][a-zA-Z0-9_-]*/gi,    "@{parameters('silverContainerName')}"],
    [/\bsilver[-_]bucket\b/gi,                 "@{parameters('silverContainerName')}"],
    [/\bsilver[-_]container\b/gi,              "@{parameters('silverContainerName')}"],
    // gold-* patterns
    [/gold[-_]master[-_][a-zA-Z0-9_-]*/gi,    "@{parameters('goldContainerName')}"],
    [/gold[-_]data[-_][a-zA-Z0-9_-]*/gi,      "@{parameters('goldContainerName')}"],
    [/gold[-_]analytics[-_][a-zA-Z0-9_-]*/gi, "@{parameters('goldContainerName')}"],
    [/\bgold[-_]bucket\b/gi,                   "@{parameters('goldContainerName')}"],
    [/\bgold[-_]container\b/gi,                "@{parameters('goldContainerName')}"],
  ];

  // Also convert any remaining s3:// to abfss:// with parameters
  const S3_PATH_PATTERN = /s3:\/\/([a-zA-Z0-9._-]+)\/([\S]*)/g;
  const S3A_PATH_PATTERN = /s3a:\/\/([a-zA-Z0-9._-]+)\/([\S]*)/g;

  const replaced = walkStrings(output, (value) => {
    let v = value;

    // Convert s3:// and s3a:// to abfss:// with storage account parameter
    if (S3_PATH_PATTERN.test(v)) {
      v = v.replace(S3_PATH_PATTERN, (_, bucket, path) => {
        const container = deriveContainerParam(bucket);
        return `abfss://${container}@@{parameters('storageAccountName')}.dfs.core.windows.net/${path}`;
      });
      count++;
    }
    S3_PATH_PATTERN.lastIndex = 0;

    if (S3A_PATH_PATTERN.test(v)) {
      v = v.replace(S3A_PATH_PATTERN, (_, bucket, path) => {
        const container = deriveContainerParam(bucket);
        return `abfss://${container}@@{parameters('storageAccountName')}.dfs.core.windows.net/${path}`;
      });
      count++;
    }
    S3A_PATH_PATTERN.lastIndex = 0;

    // Replace hardcoded bucket/container names
    for (const [pattern, replacement] of BUCKET_MAP) {
      if (pattern.test(v)) {
        v = v.replace(pattern, replacement);
        count++;
      }
      pattern.lastIndex = 0;
    }

    // Replace BRONZE_RAW_CONTAINER etc. env-style constants
    if (/BRONZE_RAW_CONTAINER/g.test(v)) { v = v.replace(/BRONZE_RAW_CONTAINER/g, "@parameters('rawContainerName')"); count++; }
    if (/BRONZE_STAGED_CONTAINER/g.test(v)) { v = v.replace(/BRONZE_STAGED_CONTAINER/g, "@parameters('stagedContainerName')"); count++; }
    if (/SILVER_MASTER_CONTAINER/g.test(v)) { v = v.replace(/SILVER_MASTER_CONTAINER/g, "@parameters('silverContainerName')"); count++; }
    if (/GOLD_CONTAINER/g.test(v)) { v = v.replace(/GOLD_CONTAINER/g, "@parameters('goldContainerName')"); count++; }

    return v;
  }) as Record<string, unknown>;

  if (count > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-43: ${count} hardcoded bucket/container name(s) → parameterized ADLS Gen2 paths (abfss://)`);
  }

  return changes;
}

function deriveContainerParam(bucketName: string): string {
  const lower = bucketName.toLowerCase();
  if (/raw/i.test(lower)) return "@{parameters('rawContainerName')}";
  if (/staged/i.test(lower)) return "@{parameters('stagedContainerName')}";
  if (/silver/i.test(lower)) return "@{parameters('silverContainerName')}";
  if (/gold/i.test(lower)) return "@{parameters('goldContainerName')}";
  return "@{parameters('rawContainerName')}";
}

// ─── CAT-44: Run correlation — inject runId into all downstream actions ──────
function cat44RunCorrelation(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const actionBlock = output.actions as Record<string, unknown> | undefined;
  if (!actionBlock) return changes;

  // RULE 1: Ensure runId is initialized with timestamp format
  const initRunId = actionBlock["Initialize_RunId"] as Record<string, unknown> | undefined;
  if (initRunId) {
    const inputs = initRunId.inputs as Record<string, unknown>;
    const vars = inputs.variables as Record<string, unknown>[];
    if (vars?.[0] && vars[0].value !== "@{utcNow('yyyyMMddHHmmss')}") {
      vars[0].value = "@{utcNow('yyyyMMddHHmmss')}";
      changes.push("CAT-44: Updated runId format to yyyyMMddHHmmss timestamp");
    }
  }

  // RULE 2 + 3: Inject runId into all action bodies and relevant properties
  let injectedCount = 0;
  function processActions(actions: Record<string, unknown>) {
    for (const [name, action] of Object.entries(actions)) {
      const a = action as Record<string, unknown>;

      if (a.actions) processActions(a.actions as Record<string, unknown>);
      if (a.else && (a.else as Record<string, unknown>).actions)
        processActions((a.else as Record<string, unknown>).actions as Record<string, unknown>);

      // Skip infrastructure actions
      if (/^Initialize_|^Set_|^Get_Managed|^Log_Pipeline|^Alert_/i.test(name)) continue;

      const inputs = a.inputs as Record<string, unknown> | undefined;
      if (!inputs) continue;

      // Function calls: add runId to body
      if (a.type === "Function") {
        const body = (inputs.body || {}) as Record<string, unknown>;
        if (!body.runId) {
          body.runId = "@variables('runId')";
          inputs.body = body;
          injectedCount++;
        }
      }

      // HTTP calls: add runId to body or headers
      if (a.type === "Http") {
        const uri = ((inputs.uri as string) || "").toString();

        // Databricks: include runId in job run_name
        if (/azuredatabricks\.net/i.test(uri)) {
          const body = inputs.body as Record<string, unknown>;
          if (body && typeof body === "object") {
            if (body.run_name && typeof body.run_name === "string" && !body.run_name.includes("runId")) {
              body.run_name = `${body.run_name}_@{variables('runId')}`;
              injectedCount++;
            }
          }
        }

        // Service Bus: add runId to custom properties via BrokerProperties header
        if (/servicebus\.windows\.net/i.test(uri)) {
          const headers = (inputs.headers || {}) as Record<string, unknown>;
          if (typeof headers.BrokerProperties === "string" && headers.BrokerProperties === "{}") {
            headers.BrokerProperties = JSON.stringify({ CorrelationId: "@{variables('runId')}" });
          } else if (!headers.BrokerProperties) {
            headers.BrokerProperties = JSON.stringify({ CorrelationId: "@{variables('runId')}" });
          }
          inputs.headers = headers;

          // Add runId to body
          const body = (inputs.body || {}) as Record<string, unknown>;
          if (typeof body === "object" && !body.runId) {
            body.runId = "@variables('runId')";
            inputs.body = body;
          }
          injectedCount++;
        }

        // Data Factory: add runId as pipeline parameter
        if (/DataFactory|datafactory/i.test(uri)) {
          const body = (inputs.body || {}) as Record<string, unknown>;
          if (typeof body === "object") {
            const bodyParams = (body.parameters || {}) as Record<string, unknown>;
            if (!bodyParams.runId) {
              bodyParams.runId = "@{variables('runId')}";
              body.parameters = bodyParams;
              inputs.body = body;
              injectedCount++;
            }
          }
        }

        // Generic HTTP with body: add runId if body is an object
        if (typeof inputs.body === "object" && inputs.body !== null) {
          const body = inputs.body as Record<string, unknown>;
          if (!body.runId && !/169\.254\.169\.254/.test(uri)) {
            body.runId = "@variables('runId')";
            injectedCount++;
          }
        }
      }
    }
  }

  processActions(actionBlock);

  if (injectedCount > 0)
    changes.push(`CAT-44: Injected runId correlation into ${injectedCount} action(s) (Function bodies, Databricks job names, Service Bus properties, ADF parameters)`);

  return changes;
}

// ─── CAT-45: Scope-based conditional execution for error handling ────────────
function cat45ConditionalExecution(output: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const actionBlock = output.actions as Record<string, unknown> | undefined;
  if (!actionBlock) return changes;

  // Find action pairs: MainAction + MainAction_Error_Handler (or _Dead_Letter)
  // that are NOT already inside a Scope. Wrap them in Scope for "continue anyway" pattern.
  const actionNames = Object.keys(actionBlock);
  const wrappedPairs: string[] = [];

  for (const name of actionNames) {
    const a = actionBlock[name] as Record<string, unknown>;
    if (a.type === "Scope") continue;
    if (/^Initialize_|^Set_|^Get_Managed|^Log_Pipeline|^Alert_|_Dead_Letter$|_Append_Failed$/i.test(name)) continue;

    // Look for matching error handler
    const errorHandlerName = `${name}_Error_Handler`;
    const deadLetterName = `${name}_Dead_Letter`;
    const handler = actionBlock[errorHandlerName] || actionBlock[deadLetterName];
    if (!handler) continue;

    const handlerName = actionBlock[errorHandlerName] ? errorHandlerName : deadLetterName;
    const h = handler as Record<string, unknown>;

    // Check that handler runs after this action on failure
    const hRunAfter = h.runAfter as Record<string, string[]> | undefined;
    if (!hRunAfter?.[name]) continue;
    const statuses = hRunAfter[name];
    if (!statuses.includes("Failed") && !statuses.includes("TimedOut")) continue;

    // Already wrapped — skip
    if (wrappedPairs.includes(name)) continue;

    const scopeName = `${name}_Scope`;
    if (actionBlock[scopeName]) continue;

    // Save original runAfter from the main action
    const mainRunAfter = a.runAfter as Record<string, string[]> | undefined;

    // Build scope with main action + failure handler inside
    const scopeActions: Record<string, unknown> = {
      [name]: {
        ...a,
        runAfter: {},
      },
      [handlerName]: {
        ...h,
        runAfter: { [name]: statuses },
      },
    };

    // Create scope
    actionBlock[scopeName] = {
      type: "Scope",
      actions: scopeActions,
      runAfter: mainRunAfter || {},
    };

    // Remove originals from root
    delete actionBlock[name];
    delete actionBlock[handlerName];

    // Rewire downstream: anything that depended on either main or handler
    // should now depend on the scope
    for (const [otherName, otherAction] of Object.entries(actionBlock)) {
      if (otherName === scopeName) continue;
      const oa = otherAction as Record<string, unknown>;
      const ra = oa.runAfter as Record<string, string[]> | undefined;
      if (!ra) continue;

      let rewired = false;
      if (ra[name]) {
        const oldStatuses = ra[name];
        delete ra[name];
        ra[scopeName] = oldStatuses;
        rewired = true;
      }
      if (ra[handlerName]) {
        delete ra[handlerName];
        if (!ra[scopeName]) ra[scopeName] = ["Succeeded"];
        rewired = true;
      }
      if (rewired) {
        // Scope reports Succeeded even if inner handler fired after failure
        // So downstream should depend on Scope: ["Succeeded"]
        ra[scopeName] = ["Succeeded"];
      }
    }

    wrappedPairs.push(name);
    changes.push(`CAT-45: Wrapped '${name}' + '${handlerName}' into Scope '${scopeName}' for conditional execution`);
  }

  return changes;
}

// ─── CAT-46: Pre-deployment validation checks ───────────────────────────────
function cat46PreDeploymentValidation(output: Record<string, unknown>): string[] {
  const changes: string[] = [];

  // Count total actions
  const actionBlock = output.actions as Record<string, unknown> | undefined;
  const allActions = actionBlock ? flattenActions(actionBlock) : {};
  const actionCount = Object.keys(allActions).length;

  // Count HTTP actions, Function actions
  let httpCount = 0;
  let functionCount = 0;
  let scopeCount = 0;
  for (const [, action] of Object.entries(allActions)) {
    const a = action as Record<string, unknown>;
    if (a.type === "Http") httpCount++;
    if (a.type === "Function") functionCount++;
    if (a.type === "Scope") scopeCount++;
  }

  const warnings: string[] = [];
  if (actionCount > 200) warnings.push(`ACTION_LIMIT: ${actionCount} actions exceed Logic Apps limit of 200 per run`);
  if (actionCount > 150) warnings.push(`ACTION_WARNING: ${actionCount} actions approaching 200 limit — consider splitting workflow`);

  // Check for missing required parameters
  const params = (output.parameters || {}) as Record<string, unknown>;
  const requiredParams = ["subscriptionId", "resourceGroup", "appName", "storageAccountName"];
  const missingParams = requiredParams.filter(p => !params[p]);

  // Check for hardcoded secrets
  let secretCount = 0;
  walkStrings(output, (value) => {
    if (/password\s*[:=]\s*["\'][^@{][^"\']{8,}/i.test(value)) secretCount++;
    if (/api[_-]?key\s*[:=]\s*["\'][^@{][^"\']{10,}/i.test(value)) secretCount++;
    if (/Bearer\s+[A-Za-z0-9_-]{20,}/.test(value)) secretCount++;
    return value;
  });

  // Check for missing Managed Identity
  let missingAuthCount = 0;
  for (const [name, action] of Object.entries(allActions)) {
    const a = action as Record<string, unknown>;
    if (a.type !== "Http") continue;
    if (name === "Get_Managed_Identity_Token") continue;
    const inputs = a.inputs as Record<string, unknown> | undefined;
    const uri = ((inputs?.uri as string) || "").toString();
    if (/management\.azure\.com|azuredatabricks|powerbi|servicebus|vault\.azure|blob\.core/i.test(uri)) {
      if (!inputs?.authentication) missingAuthCount++;
    }
  }

  // Generate validation block
  output["_CAT46_PRE_DEPLOYMENT_VALIDATION"] = {
    _note: "Run these checks BEFORE deploying to Azure",
    summary: {
      totalActions: actionCount,
      httpActions: httpCount,
      functionActions: functionCount,
      scopeActions: scopeCount,
      parametersCount: Object.keys(params).length,
    },
    armValidation: {
      command: "az deployment group validate --resource-group @{parameters('resourceGroup')} --template-file workflow.json --parameters parameters.json",
      whatIf: "az deployment group what-if --resource-group @{parameters('resourceGroup')} --template-file workflow.json --parameters parameters.json",
    },
    resourceQuotaChecks: {
      actionsPerRun: { limit: 200, current: actionCount, status: actionCount > 200 ? "EXCEEDED" : actionCount > 150 ? "WARNING" : "OK" },
      concurrentExecutions: { limit: 50, default: 50, note: "Increase via Logic App settings if needed" },
      functionAppMemory: { consumptionPlan: "1.5GB", premiumPlan: "14GB", note: "Use Premium plan if processing large datasets" },
      storageAccountLimits: { maxBlobs: "unlimited", maxContainers: 500, maxBlobSize: "190.7 TiB" },
    },
    costEstimation: {
      logicAppActions: `${actionCount} actions/run × $0.000125/action = $${(actionCount * 0.000125).toFixed(4)}/run`,
      functionAppExecutions: `${functionCount} function calls/run × $0.20/million = estimate varies`,
      storageTransactions: "Varies by volume — monitor with Azure Cost Management",
      monthlyEstimate: "Set up Azure Budget alert at $50 threshold for initial monitoring",
      command: "az consumption budget create --amount 50 --category cost --resource-group @{parameters('resourceGroup')} --name FlowMigrate-Budget --time-grain monthly",
    },
    securityValidation: {
      managedIdentity: missingAuthCount === 0 ? "PASS — all Azure API calls use ManagedServiceIdentity" : `FAIL — ${missingAuthCount} HTTP action(s) missing authentication`,
      rbacPermissions: [
        "Storage Blob Data Contributor on storage account",
        "Data Factory Contributor on ADF",
        "Service Bus Data Sender on alert topics",
        "Logic App Contributor on workflow resource group",
        "Key Vault Secrets User on Key Vault",
      ],
      hardcodedSecrets: secretCount === 0 ? "PASS — no hardcoded secrets detected" : `FAIL — ${secretCount} potential hardcoded secret(s) found`,
      missingParameters: missingParams.length === 0 ? "PASS" : `FAIL — missing: ${missingParams.join(", ")}`,
    },
    warnings,
  };

  changes.push(`CAT-46: Pre-deployment validation generated — ${actionCount} actions, ${warnings.length} warning(s), ${missingAuthCount} auth gap(s), ${secretCount} secret risk(s)`);
  return changes;
}

// ─── CAT-47: Comprehensive rollback plan with canary deployment ─────────────
function cat47RollbackPlan(output: Record<string, unknown>): string[] {
  const changes: string[] = [];

  const actionBlock = output.actions as Record<string, unknown> | undefined;
  const allActions = actionBlock ? flattenActions(actionBlock) : {};

  // Identify resource types used
  const resourceTypes = new Set<string>();
  let hasFunctions = false;
  let hasDataFactory = false;
  let hasDatabricks = false;
  let hasServiceBus = false;
  let hasStorage = false;
  let hasKeyVault = false;

  for (const [, action] of Object.entries(allActions)) {
    const a = action as Record<string, unknown>;
    if (a.type === "Function") { hasFunctions = true; resourceTypes.add("FunctionApp"); }
    const inputs = a.inputs as Record<string, unknown> | undefined;
    const uri = ((inputs?.uri as string) || "").toString();
    if (/DataFactory/i.test(uri)) { hasDataFactory = true; resourceTypes.add("DataFactory"); }
    if (/azuredatabricks/i.test(uri)) { hasDatabricks = true; resourceTypes.add("Databricks"); }
    if (/servicebus/i.test(uri)) { hasServiceBus = true; resourceTypes.add("ServiceBus"); }
    if (/blob\.core|dfs\.core/i.test(uri)) { hasStorage = true; resourceTypes.add("StorageAccount"); }
    if (/vault\.azure/i.test(uri)) { hasKeyVault = true; resourceTypes.add("KeyVault"); }
  }
  resourceTypes.add("LogicApp");

  output["_CAT47_ROLLBACK_PLAN"] = {
    _note: "Execute this plan if deployment fails or causes issues",

    step1_canary_deployment: {
      _note: "ALWAYS deploy to staging first",
      commands: [
        "az group create --name @{parameters('resourceGroup')}-staging --location eastus",
        "az deployment group create --resource-group @{parameters('resourceGroup')}-staging --template-file workflow.json --parameters @parameters.staging.json",
        "# Run smoke tests for 30 minutes",
        "az logic workflow run trigger --resource-group @{parameters('resourceGroup')}-staging --name @{parameters('appName')}-staging",
        "# Monitor for errors in Log Analytics",
        "az monitor log-analytics query --workspace @{parameters('logAnalyticsWorkspaceId')} --analytics-query 'AzureDiagnostics | where ResourceType == \"WORKFLOWS\" | where status_s == \"Failed\" | where TimeGenerated > ago(30m)'",
        "# If clean → deploy to production",
      ],
      smokeTestDuration: "30 minutes",
      successCriteria: "Zero failures in 30-minute canary window",
    },

    step2_reverse_order_rollback: {
      _note: "Delete in reverse dependency order — stateless first, RETAIN stateful",
      order: [
        {
          step: 1,
          resource: "Logic App (stateless)",
          command: "az logic workflow delete --resource-group @{parameters('resourceGroup')} --name @{parameters('appName')} --yes",
          safe: true,
        },
        ...(hasFunctions ? [{
          step: 2,
          resource: "Function Apps (stateless)",
          command: "az functionapp delete --resource-group @{parameters('resourceGroup')} --name @{parameters('appName')}-functions",
          safe: true,
        }] : []),
        ...(hasDataFactory ? [{
          step: 3,
          resource: "Data Factory (stateless)",
          command: "az datafactory delete --resource-group @{parameters('resourceGroup')} --name @{parameters('adfFactoryName')} --yes",
          safe: true,
        }] : []),
        ...(hasDatabricks ? [{
          step: 4,
          resource: "Databricks workspace (stateless — notebooks retained)",
          command: "# Cancel any running Databricks jobs first\naz databricks workspace delete --resource-group @{parameters('resourceGroup')} --name @{parameters('appName')}-dbx --yes",
          safe: true,
        }] : []),
        ...(hasServiceBus ? [{
          step: 5,
          resource: "Service Bus (semi-stateful — messages may be in flight)",
          command: "# Drain queues before deleting\naz servicebus namespace delete --resource-group @{parameters('resourceGroup')} --name @{parameters('serviceBusNamespace')}",
          safe: false,
          warning: "Drain all queues and topics before deletion to avoid message loss",
        }] : []),
        {
          step: 6,
          resource: "Storage Account (STATEFUL — DO NOT DELETE)",
          command: "# DO NOT delete storage account — it contains data\n# az storage account delete --name @{parameters('storageAccountName')} --yes  ← DO NOT RUN",
          safe: false,
          warning: "NEVER delete storage account during rollback — data loss is irreversible",
        },
        ...(hasKeyVault ? [{
          step: 7,
          resource: "Key Vault (STATEFUL — DO NOT DELETE)",
          command: "# DO NOT delete Key Vault — soft-delete recovery takes 90 days\n# Disable access policies instead",
          safe: false,
          warning: "Key Vault has soft-delete enabled — accidental deletion blocks recreation for 90 days",
        }] : []),
      ],
      dnsApiRollback: "Update DNS/APIM routing to point back to AWS endpoints",
    },

    step3_data_reconciliation: {
      queries: [
        "# Compare Azure vs AWS data counts",
        "az storage blob list --account-name @{parameters('storageAccountName')} --container-name @{parameters('silverContainerName')} --query 'length(@)' -o tsv",
        "# Compare with AWS: aws s3 ls s3://silver-bucket --recursive --summarize | tail -1",
        "# Run validation queries on both sides to ensure no data loss",
      ],
      checks: [
        "Row count comparison between Azure Storage and AWS S3",
        "Schema validation — ensure all columns match",
        "Checksum verification on critical datasets",
        "Timestamp comparison — ensure no gaps in data",
      ],
    },

    step4_post_rollback_validation: {
      steps: [
        "Verify AWS Step Functions execution endpoint is active",
        "Verify AWS Lambda functions are deployed and responsive",
        "Run full AWS pipeline smoke test",
        "Confirm data flow from AWS sources is operational",
        "Document rollback timestamp and reason",
        "Create incident report for failed migration",
      ],
      commands: [
        "aws stepfunctions start-execution --state-machine-arn <original-arn> --input '{\"test\": true}'",
        "aws lambda invoke --function-name <validation-function> /dev/stdout",
        "# Verify data pipeline end-to-end",
      ],
    },

    estimatedRollbackTime: {
      logicApp: "2 minutes",
      functionApps: "3 minutes",
      dataFactory: "2 minutes",
      dnsSwitch: "5–15 minutes (TTL dependent)",
      dataReconciliation: "30–60 minutes",
      total: "45–90 minutes including validation",
    },

    totalResources: resourceTypes.size,
    resourceTypes: [...resourceTypes],
  };

  changes.push(`CAT-47: Comprehensive rollback plan — ${resourceTypes.size} resource type(s), canary deployment, reverse-order deletion, data reconciliation`);
  return changes;
}

// ─── CAT-48: Security hardening — Key Vault, networking, encryption, audit ──
function cat48SecurityHardening(output: Record<string, unknown>): string[] {
  const changes: string[] = [];

  const params = (output.parameters || {}) as Record<string, unknown>;
  if (!params["keyVaultName"]) {
    params["keyVaultName"] = {
      type: "String", defaultValue: "",
      metadata: { description: "Azure Key Vault name for secret storage" },
    };
  }
  if (!params["vnetName"]) {
    params["vnetName"] = {
      type: "String", defaultValue: "",
      metadata: { description: "VNet name for network integration" },
    };
  }
  if (!params["subnetName"]) {
    params["subnetName"] = {
      type: "String", defaultValue: "",
      metadata: { description: "Subnet name for function app VNet integration" },
    };
  }
  output.parameters = params;

  // Scan for hardcoded secrets and replace with Key Vault references
  let secretsFound = 0;
  const replaced = walkStrings(output, (value, path) => {
    let v = value;

    // Replace hardcoded connection strings with Key Vault references
    if (/DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]+/i.test(v)) {
      v = "@Microsoft.KeyVault(SecretUri=https://@{parameters('keyVaultName')}.vault.azure.net/secrets/StorageConnectionString/)";
      secretsFound++;
    }

    // Replace hardcoded API keys
    if (path.includes("apiKey") && /^[A-Za-z0-9_-]{20,}$/.test(v) && !v.startsWith("@")) {
      v = "@Microsoft.KeyVault(SecretUri=https://@{parameters('keyVaultName')}.vault.azure.net/secrets/ApiKey/)";
      secretsFound++;
    }

    // Replace hardcoded passwords
    if (path.includes("password") && v.length > 8 && !v.startsWith("@")) {
      v = "@Microsoft.KeyVault(SecretUri=https://@{parameters('keyVaultName')}.vault.azure.net/secrets/ServicePassword/)";
      secretsFound++;
    }

    return v;
  }) as Record<string, unknown>;

  if (secretsFound > 0) {
    Object.assign(output, replaced);
    changes.push(`CAT-48: ${secretsFound} hardcoded secret(s) replaced with @Microsoft.KeyVault() references`);
  }

  // Generate security configuration block
  output["_CAT48_SECURITY_CONFIGURATION"] = {
    _note: "Apply these security configurations BEFORE going to production",

    managedIdentitySetup: {
      _note: "Assign system-assigned managed identity to Logic App and grant these RBAC roles",
      commands: [
        "# Enable system-assigned managed identity",
        "az logic workflow identity assign --resource-group @{parameters('resourceGroup')} --name @{parameters('appName')}",
        "",
        "# Get the identity principal ID",
        "PRINCIPAL_ID=$(az logic workflow show --resource-group @{parameters('resourceGroup')} --name @{parameters('appName')} --query 'identity.principalId' -o tsv)",
        "",
        "# Grant Storage Blob Data Contributor",
        "az role assignment create --assignee $PRINCIPAL_ID --role 'Storage Blob Data Contributor' --scope /subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.Storage/storageAccounts/@{parameters('storageAccountName')}",
        "",
        "# Grant Data Factory Contributor",
        "az role assignment create --assignee $PRINCIPAL_ID --role 'Data Factory Contributor' --scope /subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.DataFactory/factories/@{parameters('adfFactoryName')}",
        "",
        "# Grant Service Bus Data Sender + Receiver",
        "az role assignment create --assignee $PRINCIPAL_ID --role 'Azure Service Bus Data Sender' --scope /subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.ServiceBus/namespaces/@{parameters('serviceBusNamespace')}",
        "az role assignment create --assignee $PRINCIPAL_ID --role 'Azure Service Bus Data Receiver' --scope /subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.ServiceBus/namespaces/@{parameters('serviceBusNamespace')}",
        "",
        "# Grant Key Vault Secrets User",
        "az role assignment create --assignee $PRINCIPAL_ID --role 'Key Vault Secrets User' --scope /subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.KeyVault/vaults/@{parameters('keyVaultName')}",
      ],
    },

    keyVaultIntegration: {
      _note: "Store ALL secrets in Key Vault — NEVER hardcode passwords/keys",
      referencePattern: "@Microsoft.KeyVault(SecretUri=https://{vault-name}.vault.azure.net/secrets/{secret-name}/)",
      requiredSecrets: [
        "StorageConnectionString",
        "ServiceBusConnectionString",
        "DatabricksToken (if not using MSI)",
        "Any third-party API keys",
      ],
      commands: [
        "az keyvault create --name @{parameters('keyVaultName')} --resource-group @{parameters('resourceGroup')} --location eastus --enable-rbac-authorization true",
        "az keyvault secret set --vault-name @{parameters('keyVaultName')} --name StorageConnectionString --value '<connection-string>'",
      ],
    },

    networkSecurity: {
      _note: "Restrict network access for all services",
      vnetIntegration: [
        "# Enable VNet integration for Function App",
        "az functionapp vnet-integration add --resource-group @{parameters('resourceGroup')} --name @{parameters('appName')}-functions --vnet @{parameters('vnetName')} --subnet @{parameters('subnetName')}",
      ],
      storageFirewall: [
        "# Restrict storage to selected networks",
        "az storage account update --name @{parameters('storageAccountName')} --resource-group @{parameters('resourceGroup')} --default-action Deny",
        "az storage account network-rule add --account-name @{parameters('storageAccountName')} --resource-group @{parameters('resourceGroup')} --subnet @{parameters('subnetName')} --vnet-name @{parameters('vnetName')}",
      ],
      privateEndpoints: [
        "# Create private endpoints for sensitive services",
        "az network private-endpoint create --name pe-storage --resource-group @{parameters('resourceGroup')} --vnet-name @{parameters('vnetName')} --subnet @{parameters('subnetName')} --private-connection-resource-id /subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.Storage/storageAccounts/@{parameters('storageAccountName')} --group-id blob --connection-name storage-connection",
      ],
    },

    dataEncryption: {
      atRest: "All Azure services encrypt data at rest by default (AES-256)",
      customerManagedKeys: {
        _note: "For compliance, use CMK instead of platform-managed keys",
        command: "az storage account update --name @{parameters('storageAccountName')} --resource-group @{parameters('resourceGroup')} --encryption-key-source Microsoft.Keyvault --encryption-key-vault https://@{parameters('keyVaultName')}.vault.azure.net --encryption-key-name StorageEncryptionKey",
      },
      httpsOnly: [
        "az storage account update --name @{parameters('storageAccountName')} --https-only true",
        "az functionapp update --name @{parameters('appName')}-functions --resource-group @{parameters('resourceGroup')} --set httpsOnly=true",
      ],
    },

    auditLogging: {
      _note: "Enable diagnostic logs for all services — minimum 90-day retention",
      commands: [
        "# Logic App diagnostic logs",
        "az monitor diagnostic-settings create --name diag-logicapp --resource /subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.Logic/workflows/@{parameters('appName')} --workspace @{parameters('logAnalyticsWorkspaceId')} --logs '[{\"category\":\"WorkflowRuntime\",\"enabled\":true,\"retentionPolicy\":{\"enabled\":true,\"days\":90}}]'",
        "",
        "# Function App diagnostic logs",
        "az monitor diagnostic-settings create --name diag-functions --resource /subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.Web/sites/@{parameters('appName')}-functions --workspace @{parameters('logAnalyticsWorkspaceId')} --logs '[{\"category\":\"FunctionAppLogs\",\"enabled\":true,\"retentionPolicy\":{\"enabled\":true,\"days\":90}}]'",
        "",
        "# Storage account diagnostic logs",
        "az monitor diagnostic-settings create --name diag-storage --resource /subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroup')}/providers/Microsoft.Storage/storageAccounts/@{parameters('storageAccountName')}/blobServices/default --workspace @{parameters('logAnalyticsWorkspaceId')} --logs '[{\"category\":\"StorageRead\",\"enabled\":true},{\"category\":\"StorageWrite\",\"enabled\":true},{\"category\":\"StorageDelete\",\"enabled\":true}]' --metrics '[{\"category\":\"Transaction\",\"enabled\":true,\"retentionPolicy\":{\"enabled\":true,\"days\":90}}]'",
      ],
      retentionDays: 90,
    },
  };

  changes.push("CAT-48: Security configuration generated — Managed Identity RBAC, Key Vault integration, VNet/firewall rules, CMK encryption, 90-day audit logging");
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

  // ── Enterprise migration rules (CAT-31–37) ─────────────────────────────────
  run("CAT-31", cat31ConvertToDatabricks(output));
  run("CAT-32", cat32GenerateFunctionNames(output));
  run("CAT-33", cat33QuickSightToPowerBI(output));
  run("CAT-34", cat34AwsTerminology(output));
  run("CAT-35", cat35DynamicParameters(output));
  run("CAT-36", cat36ManagedIdentityToken(output));
  run("CAT-37", cat37S3ToAzureStorage(output));
  run("CAT-38", cat38DatabricksSparkConfig(output));
  run("CAT-39", cat39CliAndConsoleUrls(output));
  run("CAT-40", cat40RetryPolicies(output));
  run("CAT-41", cat41DeadLetterHandling(output));
  run("CAT-42", cat42AzureMonitorIntegration(output));
  run("CAT-43", cat43AdlsStoragePaths(output));
  run("CAT-44", cat44RunCorrelation(output));
  run("CAT-45", cat45ConditionalExecution(output));
  run("CAT-46", cat46PreDeploymentValidation(output));
  run("CAT-47", cat47RollbackPlan(output));
  run("CAT-48", cat48SecurityHardening(output));

  return { output, changesApplied: allChanges };
}
