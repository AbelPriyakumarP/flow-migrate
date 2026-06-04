/**
 * Section 25 – Additional parallel and map patterns:
 *   4-branch parallels, Map with Catch per-item, Map different concurrency values,
 *   nested Map, Foreach with error handling, parallel fan-out patterns
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function parallelMapExtendedPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── 4-branch Parallel variations ─────────────────────────────────────────
  const parallel4Cases: [string, string[], string][] = [
    ["QuadCheck",       ["FraudCheck","CreditCheck","IdentityCheck","AMLCheck"],       "QuadResult"],
    ["QuadFetch",       ["FetchUser","FetchOrders","FetchPayments","FetchPreferences"],"MergeAll"],
    ["QuadNotify",      ["EmailNotify","SMSNotify","PushNotify","WebhookNotify"],      "ConfirmAll"],
    ["QuadValidate",    ["SchemaCheck","BusinessCheck","SecurityCheck","ComplianceCheck"],"ValidateDone"],
    ["QuadBuild",       ["BuildHeader","BuildBody","BuildFooter","BuildAttachments"],  "AssembleEmail"],
    ["QuadProcess",     ["ProcessA","ProcessB","ProcessC","ProcessD"],                "CombineResults"],
    ["QuadSync",        ["SyncUsers","SyncOrders","SyncProducts","SyncInventory"],     "ConfirmSync"],
    ["QuadReport",      ["SalesReport","UserReport","InventoryReport","FinanceReport"],"CompileAllReports"],
  ];

  for (const [name, branches, merge] of parallel4Cases) {
    const awsBranches = branches.map(fn => ({
      StartAt: fn,
      States: {
        [fn]: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: `${fn}Fn`, "Payload.$": "$" }, End: true
        }
      }
    }));

    const azureActions: Record<string, unknown> = {};
    for (const fn of branches) {
      azureActions[fn] = {
        type: "Function",
        inputs: { function: { id: `/sub/rg/app/functions/${fn}Fn` }, body: "@triggerBody()" },
        runAfter: {}
      };
    }
    const mergeBody: Record<string, string> = {};
    for (const fn of branches) mergeBody[fn.toLowerCase()] = `@body('${fn}')`;
    azureActions[merge] = {
      type: "Function",
      inputs: { function: { id: `/sub/rg/app/functions/${merge}Fn` }, body: mergeBody },
      runAfter: Object.fromEntries(branches.map(fn => [fn, ["Succeeded"]]))
    };

    pairs.push(pair("aws-to-azure",
      j({ StartAt: name, States: {
        [name]: { Type: "Parallel", Branches: awsBranches, ResultPath: "$.parallelResults", Next: merge },
        [merge]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${merge}Fn`, "Payload.$": "$" }, End: true }
      }}),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: azureActions
      })
    ));
  }

  // ── Map with MaxConcurrency variations (other than 0, 1, 5) ──────────────
  const mapConcurrencyVariants: [string, string, string, number][] = [
    ["ProcessWithLimit2",  "$.tasks",    "ProcessTask",   2],
    ["ProcessWithLimit4",  "$.items",    "ProcessItem",   4],
    ["ProcessWithLimit8",  "$.records",  "ProcessRecord", 8],
    ["ProcessWithLimit15", "$.events",   "ProcessEvent",  15],
    ["ProcessWithLimit20", "$.messages", "ProcessMsg",    20],
    ["ProcessWithLimit50", "$.entries",  "ProcessEntry",  50],
    ["ProcessUnlimited",   "$.chunks",   "ProcessChunk",  0],
    ["ProcessStrict1",     "$.steps",    "ProcessStep",   1],
  ];

  for (const [name, itemsPath, innerFn, concurrency] of mapConcurrencyVariants) {
    const arrayField = itemsPath.replace("$.", "");
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Map",
            ItemsPath: itemsPath,
            MaxConcurrency: concurrency,
            ItemProcessor: {
              ProcessorConfig: { Mode: "INLINE" },
              StartAt: innerFn,
              States: {
                [innerFn]: {
                  Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: `${innerFn}Fn`, "Payload.$": "$" }, End: true
                }
              }
            },
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
            type: "Foreach",
            foreach: `@triggerBody()?['${arrayField}']`,
            ...(concurrency === 1 ? { operationOptions: "Sequential" } : {}),
            actions: {
              [innerFn]: {
                type: "Function",
                inputs: { function: { id: `/sub/rg/app/functions/${innerFn}Fn` }, body: `@items('${name}')` },
                runAfter: {}
              }
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── Map followed by a merge task (result aggregation) ────────────────────
  const mapWithMergeCases: [string, string, string, string][] = [
    ["MapAndAggregate",  "$.rawItems",    "TransformItem",    "AggregateResults"],
    ["MapAndValidate",   "$.inputRecords","ValidateRecord",   "CollectValidResults"],
    ["MapAndEnrich",     "$.customers",   "EnrichCustomer",   "StoreAllEnriched"],
    ["MapAndScore",      "$.candidates",  "ScoreCandidate",   "RankCandidates"],
    ["MapAndConvert",    "$.documents",   "ConvertDocument",  "BundleDocuments"],
    ["MapAndPublish",    "$.articles",    "PublishArticle",   "IndexAll"],
  ];

  for (const [name, itemsPath, innerFn, merge] of mapWithMergeCases) {
    const field = itemsPath.replace("$.", "");
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Map",
            ItemsPath: itemsPath,
            ItemProcessor: {
              ProcessorConfig: { Mode: "INLINE" },
              StartAt: innerFn,
              States: {
                [innerFn]: {
                  Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: `${innerFn}Fn`, "Payload.$": "$" }, End: true
                }
              }
            },
            ResultPath: "$.mappedResults",
            Next: merge
          },
          [merge]: {
            Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${merge}Fn`, "Payload.$": "$" }, End: true
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Foreach",
            foreach: `@triggerBody()?['${field}']`,
            actions: {
              [innerFn]: {
                type: "Function",
                inputs: { function: { id: `/sub/rg/app/functions/${innerFn}Fn` }, body: `@items('${name}')` },
                runAfter: {}
              }
            },
            runAfter: {}
          },
          [merge]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${merge}Fn` }, body: "@triggerBody()" },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Select (Map pure transform) with more field mappings ─────────────────
  const selectExtendedCases: [string, string, Record<string, string>][] = [
    ["NormalizeEvents",     "$.events",
      { eventId: "@item()?['id']", type: "@item()?['eventType']", ts: "@item()?['timestamp']", data: "@item()?['payload']" }],
    ["NormalizeTransactions","$.transactions",
      { txId: "@item()?['transactionId']", amount: "@item()?['value']", currency: "@item()?['currency']", status: "@item()?['state']" }],
    ["NormalizeSessions",   "$.sessions",
      { sessionId: "@item()?['id']", userId: "@item()?['userId']", startedAt: "@item()?['createdAt']", active: "@item()?['isActive']" }],
    ["NormalizeNotifications","$.notifications",
      { notifId: "@item()?['id']", recipient: "@item()?['to']", channel: "@item()?['type']", read: "@item()?['isRead']" }],
    ["NormalizeLogs",       "$.logs",
      { logId: "@item()?['id']", level: "@item()?['severity']", message: "@item()?['text']", service: "@item()?['source']" }],
    ["NormalizeMetrics",    "$.metrics",
      { metricName: "@item()?['name']", value: "@item()?['value']", unit: "@item()?['unit']", ts: "@item()?['collectedAt']" }],
  ];

  for (const [name, itemsPath, fields] of selectExtendedCases) {
    const awsSelector: Record<string, string> = {};
    for (const [k, azureExpr] of Object.entries(fields)) {
      const fieldName = azureExpr.replace("@item()?['", "").replace("']", "");
      awsSelector[`${k}.$`] = `$$.Map.Item.Value.${fieldName}`;
    }

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Map",
            ItemsPath: itemsPath,
            ItemSelector: awsSelector,
            ItemProcessor: {
              ProcessorConfig: { Mode: "INLINE" },
              StartAt: "PassItem",
              States: { PassItem: { Type: "Pass", End: true } }
            },
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
            type: "Select",
            inputs: {
              from: `@triggerBody()?['${itemsPath.replace("$.", "")}']`,
              select: fields
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── Parallel followed by Fail (any branch fails → terminate) ─────────────
  const parallelWithFailCases: [string, string, string][] = [
    ["CheckAllPrerequisites",  "CheckDB",       "PrerequisiteFailed"],
    ["ValidateAllSystems",     "ValidateAll",   "SystemCheckFailed"],
    ["VerifyAllDependencies",  "VerifyAll",     "DependencyFailed"],
  ];

  for (const [name, branch, errorName] of parallelWithFailCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Parallel",
            Branches: [
              { StartAt: branch, States: { [branch]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${branch}Fn`, "Payload.$": "$" }, End: true } } }
            ],
            Catch: [{ ErrorEquals: ["States.ALL"], Next: errorName, ResultPath: "$.prerequisiteError" }],
            Next: "AllPrereqPassed"
          },
          AllPrereqPassed: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "AllPrereqPassedFn", "Payload.$": "$" }, End: true },
          [errorName]: { Type: "Fail", Error: `${errorName}Error`, Cause: `${name} check failed` }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [branch]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${branch}Fn` }, body: "@triggerBody()" }, runAfter: {} },
          AllPrereqPassed: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/AllPrereqPassedFn" }, body: "@triggerBody()" }, runAfter: { [branch]: ["Succeeded"] } },
          [errorName]: { type: "Terminate", inputs: { runStatus: "Failed", runError: { code: `${errorName}Error`, message: `${name} check failed` } }, runAfter: { [branch]: ["Failed", "TimedOut", "Skipped"] } }
        }
      })
    ));
  }

  return pairs;
}
