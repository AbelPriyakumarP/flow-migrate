/**
 * Section 27 – Additional patterns to reach 1000+ total pairs:
 *   More Lambda retry configs, DynamoDB chains, HTTP integrations,
 *   Pass/Compose variations, sequential task flows, Azure→AWS If patterns
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function additionalPatternPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── More Lambda retry configurations ─────────────────────────────────────
  const moreRetryConfigs: [string, number, number, number][] = [
    ["ImportBulkData",    4,  10, 2.0],
    ["ExportReport",      3,  15, 1.5],
    ["SyncUserData",      5,  3,  2.0],
    ["InvokeWebhook",     6,  2,  2.0],
    ["RunHealthCheck",    10, 1,  1.0],
    ["PollJobQueue",      8,  5,  1.5],
    ["RefreshAccessToken",3,  2,  2.0],
    ["BulkDeleteRecords", 2,  20, 1.0],
    ["ComputeAggregates", 4,  5,  2.0],
    ["PushToDownstream",  5,  3,  1.5],
    ["FetchExternalData", 3,  8,  2.0],
    ["ArchiveOldRecords", 2,  30, 1.0],
  ];

  for (const [fnName, attempts, interval, backoff] of moreRetryConfigs) {
    const isFixed = backoff === 1.0;
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: fnName,
        States: {
          [fnName]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${fnName}Fn`, "Payload.$": "$" },
            Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: interval, MaxAttempts: attempts, BackoffRate: backoff }],
            End: true
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [fnName]: {
            type: "Function",
            inputs: {
              function: { id: `/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/${fnName}Fn` },
              body: "@triggerBody()"
            },
            retryPolicy: isFixed
              ? { type: "fixed", count: attempts, interval: `PT${interval}S` }
              : { type: "exponential", count: attempts, interval: `PT${interval}S`, minimumInterval: `PT${interval}S`, maximumInterval: "PT1H" },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── More sequential 2-task chains (azure-to-aws) ─────────────────────────
  const moreChains2AzureToAws: [string, string][] = [
    ["LoadDocument",       "ParseDocument"],
    ["FetchSettings",      "ApplySettings"],
    ["GetQuote",           "AcceptQuote"],
    ["InitPipeline",       "RunPipeline"],
    ["CreateDraft",        "PublishDraft"],
    ["FetchTemplate",      "RenderTemplate"],
    ["CheckRateLimit",     "ProceedIfAllowed"],
    ["LockResource",       "ProcessResource"],
    ["DecryptPayload",     "HandlePayload"],
    ["ReadSecret",         "UseSecret"],
    ["ValidateSignature",  "ProcessSigned"],
    ["LoadUserContext",    "ExecuteInContext"],
  ];

  for (const [s1, s2] of moreChains2AzureToAws) {
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [s1]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${s1}Fn` }, body: "@triggerBody()" }, runAfter: {} },
          [s2]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${s2}Fn` }, body: `@body('${s1}')` }, runAfter: { [s1]: ["Succeeded"] } }
        }
      }),
      j({
        StartAt: s1,
        States: {
          [s1]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${s1}Fn`, "Payload.$": "$" }, Next: s2 },
          [s2]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${s2}Fn`, "Payload.$": "$" }, End: true }
        }
      })
    ));
  }

  // ── More Pass/Compose static-inject variations ────────────────────────────
  const morePassCases: [string, Record<string, unknown>, string][] = [
    ["SetRequestId",     { requestId: "auto", traceId: "auto", timestamp: "auto" },       "TraceRequest"],
    ["InjectTenantCtx",  { tenantId: "default", orgId: "org-001", plan: "pro" },          "RunForTenant"],
    ["SetPipelineVars",  { pipelineId: "auto", stage: "transform", iteration: 0 },        "BeginStage"],
    ["PrepareAudit",     { auditType: "access", actor: "workflow", severity: "info" },    "WriteAudit"],
    ["InjectDefaults2",  { pageSize: 50, sortBy: "createdAt", sortDir: "desc" },          "ExecuteQuery"],
    ["SetFeatureFlags",  { flagA: true, flagB: false, flagC: true, flagD: false },         "ApplyFlags"],
    ["TagMessage",       { priority: "normal", source: "step-fn", retryable: true },       "SendTagged"],
    ["SetBatchParams",   { batchSize: 200, maxParallel: 8, timeoutPerItem: 30 },          "RunBatch"],
    ["InjectEnvironment",{ env: "production", region: "us-east-1", dc: "east" },          "RunInEnv"],
    ["PrepareNotification",{ channel: "email", template: "default", priority: "high" },  "SendNotif"],
  ];

  for (const [name, result, nextFn] of morePassCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: { ...result, "originalInput.$": "$" },
            Next: nextFn
          },
          [nextFn]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${nextFn}Fn`, "Payload.$": "$" },
            End: true
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Compose",
            inputs: { ...result, originalInput: "@triggerBody()" },
            runAfter: {}
          },
          [nextFn]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${nextFn}Fn` }, body: `@outputs('${name}')` },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── More NumericGreaterThanEquals / NumericLessThanEquals ─────────────────
  const numericRangeCases: [string, string, "NumericGreaterThanEquals" | "NumericLessThanEquals", number, string, string][] = [
    ["CheckMinAge",        "$.age",         "NumericGreaterThanEquals", 18,  "AdultFlow",     "MinorFlow"],
    ["CheckMaxItems",      "$.itemCount",   "NumericLessThanEquals",    1000,"WithinLimit",   "ExceedsLimit"],
    ["CheckMinBalance",    "$.balance",     "NumericGreaterThanEquals", 0,   "HasFunds",      "NegativeBalance"],
    ["CheckMaxFileSize",   "$.sizeBytes",   "NumericLessThanEquals",    5242880,"AcceptFile", "RejectTooLarge"],
    ["CheckMinScore",      "$.score",       "NumericGreaterThanEquals", 60,  "Passed",        "Failed"],
    ["CheckMaxLatency",    "$.latencyMs",   "NumericLessThanEquals",    500, "AcceptableLatency","TooSlow"],
    ["CheckMinQuota",      "$.quotaRemaining","NumericGreaterThanEquals",1,  "QuotaOk",       "QuotaExhausted"],
    ["CheckMaxRetryCount", "$.retryCount",  "NumericLessThanEquals",    5,   "CanRetry",      "MaxRetriesExceeded"],
  ];

  for (const [name, variable, op, value, trueFn, falseFn] of numericRangeCases) {
    const azureOp = op === "NumericGreaterThanEquals" ? "greaterOrEquals" : "lessOrEquals";
    const azureVar = variable.replace("$.", "@triggerBody()?['") + "']";

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Choice",
            Choices: [{ Variable: variable, [op]: value, Next: trueFn }],
            Default: falseFn
          },
          [trueFn]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${trueFn}Fn`, "Payload.$": "$" }, End: true },
          [falseFn]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${falseFn}Fn`, "Payload.$": "$" }, End: true }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "If",
            expression: { and: [{ [azureOp]: [azureVar, value] }] },
            actions: { [trueFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${trueFn}Fn` }, body: "@triggerBody()" }, runAfter: {} } },
            else: { actions: { [falseFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${falseFn}Fn` }, body: "@triggerBody()" }, runAfter: {} } } },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── More DynamoDB getItem → lambda process chains ────────────────────────
  const dynamoGetThenProcessCases: [string, string, string, string][] = [
    ["GetConfig",         "Config",      "configId",  "ApplyConfig"],
    ["GetPermissions",    "Permissions", "userId",    "EnforcePermissions"],
    ["GetPricing",        "Pricing",     "productId", "ApplyPricing"],
    ["GetTemplate",       "Templates",   "templateId","RenderTemplate"],
    ["GetWorkflowState",  "Workflows",   "workflowId","ResumeWorkflow"],
    ["GetCachedResult",   "Cache",       "cacheKey",  "UseOrCompute"],
    ["GetUserPreferences","Preferences", "userId",    "PersonalizeResponse"],
    ["GetAuditPolicy",    "Policies",    "policyId",  "EnforcePolicy"],
    ["GetFeatureConfig",  "Features",    "featureId", "EvaluateFeature"],
    ["GetRateLimitRule",  "RateLimits",  "ruleId",    "ApplyRateLimit"],
  ];

  for (const [name, table, keyField, processTask] of dynamoGetThenProcessCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::dynamodb:getItem",
            Parameters: { TableName: table, Key: { [keyField]: { "S.$": `$.${keyField}` } } },
            ResultPath: "$.fetched",
            Next: processTask
          },
          [processTask]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${processTask}Fn`, "Payload.$": "$" },
            End: true
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
              method: "get",
              path: `/dbs/@{encodeURIComponent('${table}')}/colls/@{encodeURIComponent('${table.toLowerCase()}')}/docs/@{encodeURIComponent(triggerBody()?['${keyField}'])}`
            },
            runAfter: {}
          },
          [processTask]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${processTask}Fn` }, body: `@body('${name}')` },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── More HTTP GET / POST to external APIs ─────────────────────────────────
  const moreHttpCases: [string, string, string, string][] = [
    ["GetWeatherData",   "https://api.weather.com/v1/current",        "GET",  "ProcessWeather"],
    ["GetExchangeRate",  "https://api.exchange.com/rates/latest",      "GET",  "ConvertCurrency"],
    ["PostAnalytics",    "https://analytics.service.com/track",        "POST", "AckAnalytics"],
    ["GetHealthStatus",  "https://status.internal.com/health",         "GET",  "EvaluateStatus"],
    ["PostWebhookEvent", "https://hooks.partner.com/events",           "POST", "ConfirmDelivery"],
    ["GetRemoteConfig",  "https://config.service.com/settings",        "GET",  "ApplyRemoteConfig"],
    ["PostAuditLog",     "https://audit.service.com/log",              "POST", "ConfirmAuditLog"],
    ["GetGeoData",       "https://geo.service.com/lookup",             "GET",  "EnrichWithGeo"],
  ];

  for (const [name, url, method, nextFn] of moreHttpCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::http:invoke",
            Parameters: {
              ApiEndpoint: url,
              Method: method,
              Headers: { "Content-Type": "application/json" }
            },
            ResultPath: "$.httpResult",
            Next: nextFn
          },
          [nextFn]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${nextFn}Fn`, "Payload.$": "$" },
            End: true
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Http",
            inputs: {
              method: method.toLowerCase(),
              uri: url,
              headers: { "Content-Type": "application/json" }
            },
            runAfter: {}
          },
          [nextFn]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${nextFn}Fn` }, body: `@body('${name}')` },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── More Succeed / Fail terminal states ───────────────────────────────────
  const moreSucceedCases: [string, string][] = [
    ["RunCleanup",        "CleanupSucceeded"],
    ["FinalizeExport",    "ExportComplete"],
    ["CommitTransaction", "TransactionCommitted"],
    ["CompleteIngestion", "IngestionDone"],
    ["FinalizeBackup",    "BackupSucceeded"],
    ["CloseSession",      "SessionClosed"],
  ];

  for (const [taskFn, succeedName] of moreSucceedCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: taskFn,
        States: {
          [taskFn]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${taskFn}Fn`, "Payload.$": "$" }, Next: succeedName },
          [succeedName]: { Type: "Succeed" }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [taskFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${taskFn}Fn` }, body: "@triggerBody()" }, runAfter: {} },
          [succeedName]: { type: "Terminate", inputs: { runStatus: "Succeeded" }, runAfter: { [taskFn]: ["Succeeded"] } }
        }
      })
    ));
  }

  // ── More Fail states with specific error codes ────────────────────────────
  const moreFailCases: [string, string, string][] = [
    ["InvalidToken",       "AuthTokenError",      "Authentication token is invalid or expired"],
    ["ConcurrencyLimit",   "ConcurrencyError",    "Maximum concurrent executions reached"],
    ["StorageQuota",       "StorageQuotaError",   "Storage quota exceeded for account"],
    ["NetworkTimeout",     "NetworkError",        "Network connection timed out"],
    ["SchemaIncompatible", "SchemaError",         "Payload schema is incompatible with expected format"],
    ["CircuitOpen",        "CircuitBreakerError", "Circuit breaker is open, downstream unavailable"],
  ];

  for (const [name, error, cause] of moreFailCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: "Validate",
        States: {
          Validate: {
            Type: "Choice",
            Choices: [{ Variable: "$.valid", BooleanEquals: true, Next: "Process" }],
            Default: name
          },
          Process: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "ProcessFn", "Payload.$": "$" }, End: true },
          [name]: { Type: "Fail", Error: error, Cause: cause }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          Validate: {
            type: "If",
            expression: { and: [{ equals: ["@triggerBody()?['valid']", true] }] },
            actions: { Process: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/ProcessFn" }, body: "@triggerBody()" }, runAfter: {} } },
            else: { actions: { [name]: { type: "Terminate", inputs: { runStatus: "Failed", runError: { code: error, message: cause } }, runAfter: {} } } },
            runAfter: {}
          }
        }
      })
    ));
  }

  return pairs;
}
